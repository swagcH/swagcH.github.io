---
title: Spring Cloud学习笔记
date: 2022-02-20 21:07:33
tags: [Spring Cloud, 微服务, 注册中心, 配置管理]
category: 架构成长
---

> 这篇是一份分层学习笔记。Spring Cloud 不是一个单独框架，而是一组约定和组件。记组件名字很快，真正费时间的是弄清每一层解决什么问题，以及故障时应该先检查哪一层。

## 1. 先建立一张治理地图

我把常见能力分成七层：

```text
流量入口：Gateway
服务位置：Nacos Discovery / Eureka / Consul
远程调用：OpenFeign + LoadBalancer
配置管理：Nacos Config / Config Server
稳定性：CircuitBreaker / Sentinel
可观测性：Micrometer / Prometheus / Trace
交付运行：Docker / CI/CD / Kubernetes
```

一次请求大概会经过：

```text
Browser
  -> Gateway
  -> order-service
       -> OpenFeign
       -> stock-service

order-service 和 stock-service
  -> 注册到服务注册中心
  -> 从配置中心读取各自配置
  -> 输出日志、指标和链路信息
```

这张图最重要的作用不是画架构，而是排查故障。请求没有到订单服务，先看网关；订单服务找不到库存服务，先看注册发现；服务能找到但调用超时，再看网络、线程池和 Feign 超时。

## 2. 版本兼容比配置更先检查

Spring Cloud 初学时最容易忽略版本。网上复制一段配置，依赖可能来自完全不同的年代：

```text
Spring Boot 2.x：仍可使用 JDK 8，匹配 Spring Cloud 2020/2021 等版本线
Spring Boot 3.x：要求 Java 17，包名迁移到 jakarta.*
Spring Cloud Netflix 旧版本：常见 Ribbon、Hystrix、Zuul
较新版本：更多使用 Spring Cloud LoadBalancer、CircuitBreaker、Gateway
```

本项目默认 JDK 8，因此示例以 Spring Boot 2.x 和 Spring Cloud 2021.x 的思路为主。具体小版本必须通过官方兼容矩阵确认，尤其是同时使用 Spring Cloud Alibaba 时，不能只让 Maven“没有报错”就认为版本兼容。

使用 BOM 统一依赖版本：

```xml
<properties>
    <java.version>1.8</java.version>
    <spring-cloud.version>2021.0.8</spring-cloud.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            <version>${spring-cloud.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

Spring Cloud Alibaba 也应该使用对应 BOM，并根据兼容表选择版本。不要在各个子项目单独写组件版本，否则服务之间很快会出现难以解释的差异。

## 3. 注册中心解决“服务在哪里”

单体应用可以把下游地址写在配置里：

```yaml
stock-service:
  url: http://10.0.0.15:8082
```

实例扩容、迁移或重启以后，固定地址会变得难以维护。注册发现把实例列表交给注册中心：

```yaml
spring:
  application:
    name: order-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
        namespace: dev
```

服务名是治理体系里的稳定标识。`order-service` 注册后，调用方通过服务名获取实例列表，再由客户端负载均衡选择一个实例。

排查注册问题时依次确认：

1. 应用是否真正启动成功。
2. `spring.application.name` 是否符合约定。
3. Nacos 地址、namespace、group 和认证是否一致。
4. 控制台是否能看到实例，实例 IP 和端口是否可达。
5. 服务是否被标记为不健康。

控制台“有实例”只代表注册成功，不代表调用方一定能连通。注册进去一个容器内部 IP，也会出现发现成功、调用超时。

## 4. 配置中心解决“配置怎么管理”

注册中心和配置中心可能由同一个 Nacos 提供，但它们是两条不同链路。注册正常不代表配置一定加载成功。

配置中心适合管理：

```text
环境相关地址
连接池和超时参数
功能开关
限流阈值
不需要重新构建即可调整的业务参数
```

不适合把所有配置都动态刷新。数据库连接、线程池大小等参数修改后是否能安全生效，取决于组件实现。核心参数变更仍然需要评审、灰度和回滚记录。

Spring Boot 2.4 以后配置加载机制发生过变化，部分版本使用 `spring.config.import`，旧项目常通过 `bootstrap.yml` 加载。实际项目要先确认 Spring Boot、Spring Cloud 和 Alibaba 版本，再决定配置写法，不能把两套机制混在一起。

排查配置时记录三件事：

- 最终加载的是哪个 Data ID、group 和 namespace。
- 本地配置、环境变量和远程配置谁的优先级更高。
- 配置变更以后 Bean 是否真的支持刷新。

## 5. OpenFeign 解决“服务怎么调用”

OpenFeign 把 HTTP 契约声明成 Java 接口：

```java
@FeignClient(name = "stock-service", path = "/stock")
public interface StockClient {

    @GetMapping("/{skuId}")
    Integer getStock(@PathVariable("skuId") Long skuId);
}
```

它减少了重复的 HTTP 客户端代码，但远程调用的本质没有改变：仍然可能连接失败、超时、返回非预期状态码，也可能被重复调用。

接口设计要明确：

1. URL、HTTP 方法和参数序列化方式。
2. 连接超时和读取超时。
3. 错误码如何映射，不能把所有失败都转成 `null`。
4. 是否允许重试，写操作是否幂等。
5. 调用日志是否包含 traceId、目标服务和耗时。

一段常见超时配置：

```yaml
feign:
  client:
    config:
      default:
        connectTimeout: 1000
        readTimeout: 3000
        loggerLevel: basic
```

不同 Spring Cloud OpenFeign 版本的配置前缀可能变化，升级时需要查看实际版本文档和启动日志。超时不是越大越稳定，应该从整条接口的时间预算倒推。

## 6. Gateway 解决“入口怎么收口”

Gateway 常见职责包括：

```text
路由
认证信息透传
跨域处理
限流
灰度标记
统一访问日志
```

它不适合承载大量业务编排。把订单逻辑写进网关过滤器，会让入口层难以扩容和测试。

基础路由示例：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-route
          uri: lb://order-service
          predicates:
            - Path=/api/order/**
          filters:
            - StripPrefix=1
```

这里外部请求 `/api/order/create` 去掉一段前缀后，转发为 `/order/create`。遇到 404 时，必须同时写出“外部路径、过滤后路径、Controller 路径”，只看其中一段很容易绕晕。

## 7. 稳定性组件不是错误吞掉器

熔断、限流和降级解决的是故障扩散问题，不是让异常消失。

```text
超时：限制一次调用最长占用资源的时间
限流：限制进入系统的请求速率
熔断：下游持续失败时快速拒绝，给它恢复时间
降级：核心依赖不可用时返回可接受的替代结果
隔离：限制某类调用可以占用的线程或并发量
```

库存扣减失败不能随便降级成“扣减成功”，商品推荐失败则可以返回空列表。降级策略必须由业务语义决定。

## 8. 我的学习顺序

相比一次启动十个组件，下面的顺序更容易建立确定性：

1. 两个普通 Spring Boot 服务分别启动，先用固定 URL 调通。
2. 接入注册中心，验证服务名调用和实例切换。
3. 使用 OpenFeign，补齐超时、错误码和调用日志。
4. 增加 Gateway，逐条验证路由和过滤器。
5. 接入配置中心，验证配置来源和刷新边界。
6. 人工制造超时和实例下线，观察客户端行为。
7. 最后接入指标、日志和链路追踪。

每一步都保留一个最小测试：健康检查、查询接口、写接口和超时接口。组件增加以后，先重复旧测试，再验证新能力。

## 9. 一套固定排查顺序

遇到“微服务调用失败”时，我会按下面的顺序缩小范围：

```text
应用是否启动
  -> 配置是否加载
  -> 实例是否注册且地址可达
  -> 网关路由后的路径是否正确
  -> Feign 是否拿到实例
  -> TCP 连接和超时是否正常
  -> 下游线程池、连接池和业务日志是否异常
```

不要先怀疑最复杂的组件。很多 404 只是路径前缀错了，很多超时只是注册了不可达 IP，很多配置问题只是 namespace 不一致。

## 10. 这份笔记最后留下什么

Spring Cloud 的价值不是提供一套固定架构，而是把微服务常见问题抽象成可替换的能力。理解“注册发现、配置、调用、入口、稳定性、可观测性”这些层次以后，即使以后替换 Nacos、Feign 或 Gateway，排查思路仍然有效。

学习组件时，我更关心三个问题：它解决什么故障，它自己会引入什么故障，以及没有它时有没有更简单的办法。能回答这三个问题，才算真正把组件放进了架构里。
