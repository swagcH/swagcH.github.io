---
title: Spring Cloud学习笔记
date: 2022-02-20 21:07:33
tags: [Spring Cloud, 微服务, 注册中心, 配置管理]
category: 架构成长
---

# 背景

为什么会研究这个问题

在理解了微服务的基本拆分思路之后，我开始系统学习 Spring Cloud。相比单个 Spring Boot 应用，Spring Cloud 更像是一组微服务治理工具箱，覆盖注册发现、配置管理、网关路由、服务调用、熔断限流等能力。研究它的原因也很明确：当服务数量超过两三个之后，手写服务地址、手动维护配置、靠人肉检查调用链会变得非常不可靠。

# 问题

遇到了什么情况

刚开始学习时，最大的问题是概念很多但边界不清。注册中心、配置中心、网关、Feign、负载均衡这些组件看起来都能跑 Demo，但真正放到项目里，会发现不知道每个组件负责什么。比如服务调用失败到底是注册中心没发现服务，还是网关路由错了，还是 Feign 超时时间太短。组件之间的关系如果没有先画清楚，排查问题时会非常被动。

# 分析

排查过程

```text
Spring Cloud 常见组件关系：

client
  ↓
Gateway
  ↓
service-a  --Feign--> service-b
  ↓              ↓
Nacos Registry / Config
```

```yaml
spring:
  application:
    name: order-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
      config:
        server-addr: 127.0.0.1:8848
```

排查时我会先确认服务是否注册，再确认配置是否加载，最后确认调用链是否正常。顺序不能乱，否则容易被表面异常误导。

# 解决方案

具体操作

```text
学习顺序：
1. Spring Boot 单服务启动
2. 接入 Nacos 注册中心
3. 通过 OpenFeign 完成服务调用
4. 增加 Gateway 统一入口
5. 再考虑配置中心、熔断限流、链路追踪
```

```java
@FeignClient(name = "stock-service")
public interface StockClient {
    @GetMapping("/stock/{skuId}")
    Integer getStock(@PathVariable Long skuId);
}
```

我把每个组件都拆成最小可运行样例，再逐步组合。这样做虽然慢一点，但能清楚知道问题出现在哪一层。

# 总结

经验沉淀

Spring Cloud 的学习重点不是背组件名，而是理解服务治理的分层。注册中心解决服务在哪里，配置中心解决配置怎么统一，网关解决入口怎么收口，Feign 解决服务之间怎么调用。只有把这些问题放回真实架构场景里，组件才有意义。
