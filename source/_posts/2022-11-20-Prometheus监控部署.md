---
title: Prometheus监控部署
date: 2022-11-20 20:29:47
tags: [Prometheus, 监控, Grafana, 可观测性]
category: 架构成长
---

> 日志适合解释一次具体失败，指标适合回答系统是否正在变坏。Prometheus 建起来不难，难的是决定采集什么、标签怎么设计，以及什么情况值得在半夜叫醒值班人员。

这篇按“指标、查询、面板、告警、运行”五个层次整理，不把部署成功等同于监控完成。

## 1. 先确定要回答的问题

对于一个订单服务，我希望监控能快速回答：

```text
现在有没有流量
成功率是否下降
用户等待时间是否变长
哪个 URI 或下游导致异常
线程池、连接池和 JVM 是否接近容量上限
订单创建量与支付量是否出现业务偏差
```

这些问题可以分成两套方法：

### RED：面向请求

```text
Rate：请求速率
Errors：错误比例
Duration：耗时分布
```

### USE：面向资源

```text
Utilization：资源使用率
Saturation：资源排队或饱和程度
Errors：资源错误
```

接口使用 RED，CPU、磁盘、连接池和线程池使用 USE。两者结合，才能区分“请求变慢是业务代码问题”还是“资源已经饱和”。

## 2. Prometheus 链路

```text
Spring Boot + Micrometer
  -> /actuator/prometheus
  -> Prometheus 定时拉取
  -> PromQL 查询与规则计算
  -> Grafana 展示
  -> Alertmanager 分组、抑制和通知
```

Prometheus 使用 Pull 模型。目标服务暴露当前累计指标，Prometheus 定期抓取并保存时间序列。应用不需要知道 Prometheus 地址，也不会因为监控端短暂不可用而阻塞业务请求。

批处理等短生命周期任务不适合机械套用 Pull，可以评估 Pushgateway，但 Pushgateway 中指标生命周期需要额外管理，不能把它当成所有业务指标的通用上报入口。

## 3. Spring Boot 接入

JDK 8、Spring Boot 2.x 项目增加依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>

<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

配置：

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
  endpoint:
    health:
      show-details: never
  metrics:
    tags:
      application: order-service
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

不要为了方便暴露 `*`。Actuator 可能包含环境、配置和线程信息，应该通过独立管理端口、认证或网络策略限制访问。Prometheus 抓取端点不应直接暴露到公网。

验证：

```bash
curl -s http://127.0.0.1:8080/actuator/health
curl -s http://127.0.0.1:8080/actuator/prometheus | head -30
```

如果 Prometheus 端点不存在，先检查依赖和 exposure 配置；如果返回 401/403，再检查安全规则，不要直接关闭所有鉴权。

## 4. Prometheus 抓取配置

最小静态配置：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: order-service
    metrics_path: /actuator/prometheus
    static_configs:
      - targets:
          - order-service-1:8080
          - order-service-2:8080
        labels:
          env: prod
```

检查配置并热加载前先验证：

```bash
promtool check config /etc/prometheus/prometheus.yml
promtool check rules /etc/prometheus/rules/*.yml
```

实例经常变化时，不应该长期手工维护静态地址。可以接入 Kubernetes、Consul、云平台或文件服务发现。服务发现标签很多，进入存储前要通过 relabel 只保留稳定且有查询价值的标签。

## 5. 指标名称和标签

一条时间序列由指标名和完整标签集合唯一确定：

```text
http_server_requests_seconds_count{
  application="order-service",
  method="POST",
  status="200",
  uri="/orders"
}
```

标签最危险的问题是高基数。下面这些值不能直接做 label：

```text
userId
orderId
traceId
完整 URL
异常 message
时间戳
```

每个不同值都会创建新时间序列。订单量上百万，就可能产生百万级序列，显著增加应用、Prometheus 和查询压力。

适合做标签的是有限枚举：

```text
service、env、method、status、规范化 uri、result、reason_type
```

具体 orderId 和 traceId 留在日志中，指标负责发现趋势，日志负责定位单次事件。

## 6. 自定义业务指标

订单创建结果可以使用 Counter：

```java
@Component
public class OrderMetrics {

    private final MeterRegistry registry;

    public OrderMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void recordCreate(String result, String reasonType) {
        Counter.builder("order_create_total")
            .tag("result", result)
            .tag("reason", reasonType)
            .register(registry)
            .increment();
    }
}
```

`reasonType` 必须是有限枚举，例如 `stock_shortage`、`payment_timeout`、`validation`，不能直接放异常文本。

频繁在业务方法里动态创建 Meter 会增加阅读成本。生产代码可以封装固定 Counter，或者通过统一埋点组件管理指标定义。指标名称、标签和语义变化都要经过评审，因为 Grafana 和告警规则依赖它们。

## 7. 四条基础 PromQL

### 7.1 总 QPS

```promql
sum(
  rate(http_server_requests_seconds_count{
    application="order-service"
  }[5m])
)
```

Counter 必须使用 `rate` 或 `increase` 计算变化，不要直接对累计值做告警。

### 7.2 5xx 错误比例

```promql
sum(rate(http_server_requests_seconds_count{
  application="order-service",
  status=~"5.."
}[5m]))
/
clamp_min(
  sum(rate(http_server_requests_seconds_count{
    application="order-service"
  }[5m])),
  0.001
)
```

使用比例比固定错误数更合理。低流量服务还要设置最小请求量条件，否则偶发一个错误就会显示 100%。

### 7.3 按 URI 计算 P95

```promql
histogram_quantile(
  0.95,
  sum by (le, uri) (
    rate(http_server_requests_seconds_bucket{
      application="order-service"
    }[5m])
  )
)
```

只有启用了 Histogram Bucket，才能正确计算分位数。`uri` 应该是框架归一化后的路由模板，例如 `/orders/{id}`，不能是带真实订单号的 URL。

### 7.4 订单创建失败速率

```promql
sum by (reason) (
  rate(order_create_total{result="failed"}[5m])
)
```

这条业务指标可以直接看出失败原因趋势，比只统计 HTTP 500 更接近用户感知。

## 8. Grafana 面板怎么排

一个服务首页我会按排查顺序摆放：

```text
第一行：QPS、成功率、P95/P99
第二行：各 URI 错误和耗时
第三行：下游 HTTP、数据库、Redis、MQ
第四行：JVM Heap、GC、线程、CPU
第五行：连接池、线程池队列和拒绝数
第六行：核心业务量和业务失败原因
```

面板变量只提供有边界的选项，例如 `env`、`application` 和 `instance`。默认时间范围、单位和阈值颜色要统一，避免每个面板用不同口径。

图表标题应该表达问题，例如“订单接口 P95”比“HTTP Duration”更容易使用。Dashboard 需要存入版本库或通过平台 API 备份，不能只存在 Grafana 数据库里。

## 9. 告警规则要包含持续时间

```yaml
groups:
  - name: order-service
    rules:
      - alert: OrderServiceHighErrorRate
        expr: |
          sum(rate(http_server_requests_seconds_count{
            application="order-service",status=~"5.."
          }[5m]))
          /
          clamp_min(sum(rate(http_server_requests_seconds_count{
            application="order-service"
          }[5m])), 0.001) > 0.05
        for: 10m
        labels:
          severity: warning
          service: order-service
        annotations:
          summary: "订单服务 5xx 比例持续超过 5%"
          runbook: "https://runbook.example.com/order/high-error-rate"
```

`for: 10m` 能过滤短暂毛刺。阈值只是示例，真实值要结合 SLO、历史基线和业务时段调整。

一条可执行的告警至少包含：

- 哪个服务、环境和症状。
- 当前值与阈值。
- 相关 Dashboard 和日志入口。
- Runbook 与升级联系人。
- 恢复通知和抑制规则。

## 10. 告警为什么会失效

### 告警太多

同一个根因触发 CPU、延迟、错误率和实例存活几十条通知，值班人员很快会忽略。Alertmanager 应按服务和故障域分组，并用抑制规则让根因告警覆盖症状告警。

### 没有用户影响

JVM Old 区 80% 不一定是故障，GC 后能回落就可能正常。相比单个资源阈值，持续的错误率和延迟更接近用户影响。资源告警适合作为容量预警，不一定都需要最高级别通知。

### 标签变化导致规则静默

框架升级后 `uri`、`status` 或指标名改变，查询可能返回空结果。规则也要测试，并对关键指标使用 `absent()` 检测缺失。

### 没有最小流量条件

凌晨只有一次请求且失败，错误率是 100%，但影响和高峰期完全不同。告警表达式需要结合请求量或使用燃烧率思路。

## 11. 监控系统本身也要监控

```text
Prometheus target 是否持续 up
抓取耗时是否接近 scrape_interval
规则计算是否失败
本地磁盘和 TSDB 压缩是否正常
时间序列数量和新增速度
Alertmanager 通知是否成功
Grafana 数据源查询是否异常
```

Prometheus 本地存储适合一定规模和保留周期。需要长期保存、跨集群查询或更高可用时，可以评估远程存储方案，但先解决标签治理，否则只是把高基数问题搬到更大的集群。

## 12. 上线检查

```text
[ ] Actuator 端点不暴露公网
[ ] target 标签能区分服务、环境和实例
[ ] HTTP Histogram 已按需开启
[ ] 没有 userId、orderId、traceId 等高基数标签
[ ] Dashboard 覆盖 RED、资源和业务指标
[ ] 告警有 for、分级、Runbook 和恢复通知
[ ] 规则通过 promtool 检查
[ ] Prometheus 和 Alertmanager 自身有监控
```

## 最后的理解

Prometheus 最有价值的地方不是收集了多少指标，而是把“系统健康”变成了可以讨论和验证的数字。QPS、错误率、延迟和饱和度形成趋势以后，很多问题会在用户反馈前出现信号。

日志、指标和链路各有职责：指标发现异常，链路缩小范围，日志解释细节。把三者通过服务名、时间和 traceId 关联起来，才是一套真正可用于故障处理的可观测体系。
