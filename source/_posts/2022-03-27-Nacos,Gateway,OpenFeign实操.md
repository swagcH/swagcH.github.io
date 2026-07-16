---
title: Nacos,Gateway,OpenFeign实操
date: 2022-03-27 20:46:18
tags: [Nacos, Gateway, OpenFeign, Spring Cloud]
category: 架构成长
---

> 这一篇直接做一个最小链路：外部请求先进入 Gateway，再由订单服务通过 OpenFeign 查询库存服务。目标不是堆出完整项目，而是让注册、路由和远程调用每一步都有明确的验证结果。

本文示例默认 JDK 8、Spring Boot 2.x、Spring Cloud 2021.x。Spring Cloud Alibaba 的版本必须根据官方兼容表选择，不能把不同博客里的版本随意拼在一起。

## 1. 实验结构

准备三个应用和一个 Nacos：

```text
Nacos             127.0.0.1:8848
gateway-service   127.0.0.1:8080
order-service     127.0.0.1:8081
stock-service     127.0.0.1:8082
```

请求链路：

```text
curl /api/order/preview?skuId=1001
  -> gateway-service
  -> lb://order-service/order/preview
  -> OpenFeign: stock-service/stock/1001
```

建议先启动 Nacos，再启动库存、订单，最后启动网关。每启动一个服务就验证一次，不要等全部启动后再看一堆混在一起的日志。

## 2. 依赖准备

三个应用都通过 BOM 管理版本。订单和库存是 Servlet 应用，使用 `spring-boot-starter-web`；网关基于 WebFlux，不应该再引入 `spring-boot-starter-web`，否则可能出现 Web 应用类型冲突。

订单服务核心依赖：

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-loadbalancer</artifactId>
    </dependency>
</dependencies>
```

网关服务核心依赖：

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-gateway</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-loadbalancer</artifactId>
    </dependency>
</dependencies>
```

部分版本会通过其他 starter 间接引入 LoadBalancer，但显式写出更容易理解 `lb://` 依赖什么。实际项目以 Maven 依赖树和当前版本文档为准：

```bash
mvn dependency:tree
```

## 3. 先完成 stock-service

配置服务名和端口：

```yaml
server:
  port: 8082

spring:
  application:
    name: stock-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
```

如果使用 namespace，配置值通常应填写 Nacos 的 namespace ID，而不是控制台展示名称。示例省略 namespace，表示使用默认 public 环境。

提供一个最小查询接口：

```java
@RestController
@RequestMapping("/stock")
public class StockController {

    @GetMapping("/{skuId}")
    public StockView getStock(@PathVariable("skuId") Long skuId) {
        // 示例固定返回，先验证治理链路，不引入数据库变量
        return new StockView(skuId, 20);
    }
}
```

```java
public class StockView {
    private Long skuId;
    private Integer available;

    public StockView(Long skuId, Integer available) {
        this.skuId = skuId;
        this.available = available;
    }

    public Long getSkuId() {
        return skuId;
    }

    public Integer getAvailable() {
        return available;
    }
}
```

启动后做两次验证：

```bash
curl http://127.0.0.1:8082/stock/1001
```

```json
{"skuId":1001,"available":20}
```

然后登录 Nacos 控制台，确认 `stock-service` 有一个健康实例，并检查实例 IP 和端口是否真能从订单服务所在网络访问。

## 4. order-service 接入 OpenFeign

配置：

```yaml
server:
  port: 8081

spring:
  application:
    name: order-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848

feign:
  client:
    config:
      stock-service:
        connectTimeout: 1000
        readTimeout: 2000
        loggerLevel: basic
```

启动类开启 Feign 扫描：

```java
@SpringBootApplication
@EnableFeignClients
public class OrderApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

声明库存客户端：

```java
@FeignClient(name = "stock-service", path = "/stock")
public interface StockFeignClient {

    @GetMapping("/{skuId}")
    StockView getStock(@PathVariable("skuId") Long skuId);
}
```

较旧的 Spring MVC/Feign 组合对参数名推断不一致，`@PathVariable("skuId")` 和 `@RequestParam("skuId")` 最好显式写名称，不依赖编译参数。

订单接口只做组合展示：

```java
@RestController
@RequestMapping("/order")
public class OrderController {

    private final StockFeignClient stockFeignClient;

    public OrderController(StockFeignClient stockFeignClient) {
        this.stockFeignClient = stockFeignClient;
    }

    @GetMapping("/preview")
    public StockView preview(@RequestParam("skuId") Long skuId) {
        return stockFeignClient.getStock(skuId);
    }
}
```

暂时绕过网关验证：

```bash
curl 'http://127.0.0.1:8081/order/preview?skuId=1001'
```

如果这一步不通，问题在订单、服务发现或库存，不要提前修改网关。

## 5. gateway-service 配置路由

```yaml
server:
  port: 8080

spring:
  application:
    name: gateway-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
    gateway:
      routes:
        - id: order-route
          uri: lb://order-service
          predicates:
            - Path=/api/order/**
          filters:
            - StripPrefix=1
```

路径变化如下：

```text
外部路径：/api/order/preview
StripPrefix=1
转发路径：/order/preview
Controller：@RequestMapping("/order") + @GetMapping("/preview")
```

最终验证：

```bash
curl 'http://127.0.0.1:8080/api/order/preview?skuId=1001'
```

能得到库存 JSON，说明网关路由、订单注册、Feign 调用三段都已打通。

## 6. 扩容库存服务验证负载均衡

再启动一个库存实例：

```bash
java -jar stock-service.jar --server.port=8083
```

为了观察实例，可以临时在返回值增加端口信息，或者从日志记录当前端口。连续请求订单接口，确认两个实例都收到流量：

```bash
for i in 1 2 3 4 5 6; do
  curl -s 'http://127.0.0.1:8080/api/order/preview?skuId=1001'
  printf '\n'
done
```

不要把“请求一定严格轮流”当作测试标准。负载均衡策略、实例缓存和连接行为都会影响结果，重点是两个健康实例都能被发现和调用。

## 7. 五类高频问题

### 7.1 Nacos 看不到服务

按下面顺序检查：

```text
应用是否启动成功
server-addr 是否可达
namespace 和 group 是否一致
服务名是否为空或被配置覆盖
Nacos 是否开启认证
客户端和服务端版本是否兼容
```

不要只看最后一行启动日志，向上搜索 Nacos 客户端连接异常。

### 7.2 网关返回 503

`lb://order-service` 找不到健康实例时，通常返回 503。先看 Nacos 实例，再确认网关与订单服务是否使用同一个 namespace。注册了容器内部 IP 时，还要从网关容器内实际测试连通性。

```bash
curl http://order-service-ip:8081/actuator/health
```

### 7.3 网关返回 404

记录四个值：请求原路径、Path 谓词、过滤后路径、Controller 映射。临时打开 Gateway 路由日志可以辅助判断，但调试日志量较大，用完应恢复。

### 7.4 Feign 报 404 或参数缺失

对比 Feign 声明和服务端 Controller：HTTP 方法、路径、参数位置、参数名、Content-Type 必须一致。接口改动后只更新服务端，没有同步客户端契约，也会造成运行时错误。

### 7.5 Feign 超时

先直接请求库存接口，再通过订单服务请求。如果直连也慢，问题在库存服务；直连正常而 Feign 慢，再检查服务发现地址、连接池、DNS、负载均衡和超时配置。

写操作不要默认重试。调用方超时不代表服务端没有成功，重试可能重复扣库存，必须先设计业务幂等键。

## 8. 最小可观测性

即使是实验项目，也建议为三段链路记录相同的 traceId：

```text
gateway request path, routeId, target, cost
order feign target service, path, status, cost
stock request skuId, result, cost
```

可以开放最小 Actuator 端点用于检查，但不能直接暴露到公网：

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info
```

生产环境还要配合认证、网络隔离和访问控制。

## 9. 完成实验后的检查表

```text
[ ] 三个服务使用兼容的 BOM
[ ] Nacos 中服务名、namespace、group 一致
[ ] 注册 IP 和端口从调用方网络可达
[ ] Feign 契约与 Controller 完全一致
[ ] Gateway 路由前后路径可以写清楚
[ ] 连接和读取超时已经配置
[ ] 写接口重试前具备幂等能力
[ ] 日志能串起 Gateway、Order、Stock 三段
```

这组三个组件真正难的不是启动，而是保持服务名、环境、路径和超时语义一致。最有效的实践方式仍然是分段验证：先直连服务，再走 Feign，最后加 Gateway。链路每次只增加一个变量，故障范围自然就小了。
