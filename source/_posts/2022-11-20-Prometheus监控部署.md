---
title: Prometheus监控部署
date: 2022-11-20 20:29:47
tags: [Prometheus, 监控, Grafana, 可观测性]
category: 架构成长
---

# 背景

为什么会研究这个问题

日志能回答“发生了什么”，但不能很好回答“系统现在是否健康”。为了补齐监控能力，我开始研究 Prometheus。相比传统监控，Prometheus 更适合以指标为中心观察服务状态，比如 QPS、响应耗时、错误率、线程池队列、JVM 内存等。

# 问题

遇到了什么情况

刚开始部署时，最容易忽略的是指标设计。Prometheus 能抓到很多默认指标，但如果没有业务指标，排查时仍然不够。比如接口错误率升高，只知道 HTTP 500 变多，却不知道是哪个业务动作失败。另一个问题是标签设计不当，label 维度过多会导致时间序列爆炸。

# 分析

排查过程

```text
监控链路：
Spring Boot Actuator
  -> Prometheus scrape
  -> PromQL query
  -> Grafana dashboard
  -> Alertmanager
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: prometheus,health,metrics
  metrics:
    tags:
      application: order-service
```

监控指标需要分层：基础资源、JVM、接口、数据库连接池、业务指标。只看 CPU 和内存，无法支撑复杂业务排查。

# 解决方案

具体操作

```yaml
scrape_configs:
  - job_name: "order-service"
    metrics_path: "/actuator/prometheus"
    static_configs:
      - targets: ["order-service:8080"]
```

```promql
rate(http_server_requests_seconds_count[1m])

histogram_quantile(
  0.95,
  rate(http_server_requests_seconds_bucket[5m])
)

sum(rate(http_server_requests_seconds_count{status=~"5.."}[1m]))
```

```text
告警建议：
- 5xx 错误率持续升高
- P95 响应时间超过阈值
- JVM Old 区使用率过高
- 线程池队列持续堆积
- 数据库连接池耗尽
```


# 总结

经验沉淀

Prometheus 的价值不只是画图，而是建立系统健康度指标。好的监控应该能提前暴露趋势，而不是等用户反馈后才看。日志、指标、告警和复盘结合起来，才算完整的可观测性建设。
