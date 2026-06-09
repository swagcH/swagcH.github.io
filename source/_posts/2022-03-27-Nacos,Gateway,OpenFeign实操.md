---
title: Nacos,Gateway,OpenFeign实操
date: 2022-03-27 20:46:18
tags: [Nacos, Gateway, OpenFeign, Spring Cloud]
category: 架构成长
---

# 背景

为什么会研究这个问题

在 Spring Cloud 的基础概念跑通之后，我把重点放到 Nacos、Gateway 和 OpenFeign 三个组件上。原因很简单：它们覆盖了微服务最基础的一条链路——服务注册、统一入口和服务间调用。只要这三块稳定，至少能搭出一个可运行的微服务骨架。

# 问题

遇到了什么情况

实操中遇到的问题主要集中在配置和路径上。服务已经启动，但 Nacos 控制台看不到实例；Gateway 能访问，但路由匹配不到目标服务；OpenFeign 调用时出现 404 或超时。很多问题不是代码逻辑错，而是服务名、路径前缀、配置层级和依赖版本不一致导致的。

# 分析

排查过程

```text
请求链路：
Browser/Postman
  ↓ /api/order/create
Gateway
  ↓ lb://order-service/order/create
order-service
  ↓ Feign: stock-service
stock-service
```

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

如果 `StripPrefix` 配错，请求到后端服务的路径就会变化。排查时要同时看 Gateway 日志和后端 Controller 的映射。

# 解决方案

具体操作

```java
@RestController
@RequestMapping("/order")
public class OrderController {
    @PostMapping("/create")
    public String create() {
        return "ok";
    }
}
```

```java
@FeignClient("stock-service")
public interface StockFeignClient {
    @GetMapping("/stock/check")
    Boolean checkStock(@RequestParam Long skuId);
}
```

```text
检查清单：
1. spring.application.name 是否和 Feign 名称一致
2. Nacos 控制台是否有实例
3. Gateway 路由 Path 是否匹配
4. StripPrefix 是否符合后端路径
5. Feign 超时时间是否合理
```

通过清单逐项排查，比直接看异常堆栈更稳定。

# 总结

经验沉淀

Nacos、Gateway、OpenFeign 组合起来并不复杂，复杂的是路径、服务名和配置之间的细节一致性。我的经验是：每新增一个服务，先验证注册，再验证网关，再验证 Feign，不要一次性把所有配置都写完再排查。
