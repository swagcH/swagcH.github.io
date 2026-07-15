---
title: 一次MySQL慢SQL调优记录
date: 2023-02-19 15:20:00
updated: 2023-02-20 21:10:00
tags:
  - MySQL
  - SQL优化
  - 慢查询
categories: 数据库
---

> 写在前面：SQL 调优最怕一上来就加索引。索引可能暂时把耗时压下去，也可能只是把问题从查询端转移到了写入端。比较稳妥的方式还是先保留现场，再根据慢查询日志和执行计划判断到底慢在哪里。

这次整理一个比较常见的订单列表查询。数据量上来以后，接口从两三百毫秒涨到了四五秒，数据库 CPU 没有打满，但是扫描行数非常夸张。

## 1. 现场现象

接口查询的是某个用户已支付的订单，按创建时间倒序取最近 20 条：

```sql
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

慢查询日志里最值得关注的不是 `Query_time`，而是 `Rows_examined` 和最终返回行数的差距：

```text
# Query_time: 4.782  Lock_time: 0.000
# Rows_sent: 20  Rows_examined: 2864317
```

只返回 20 行，却扫描了 280 多万行，方向基本已经明确：先检查执行计划和现有索引。

## 2. 先确认慢 SQL 从哪里来

生产环境不要为了排查随手修改全局参数，先查看当前配置：

```sql
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'slow_query_log_file';
```

如果已经启用了 `performance_schema`，也可以从聚合结果里找总耗时最高的 SQL：

```sql
SELECT DIGEST_TEXT,
       COUNT_STAR,
       ROUND(SUM_TIMER_WAIT / 1000000000000, 2) AS total_seconds,
       ROUND(AVG_TIMER_WAIT / 1000000000, 2) AS avg_ms
FROM performance_schema.events_statements_summary_by_digest
WHERE DIGEST_TEXT IS NOT NULL
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 10;
```

这里要同时看三个维度：单次很慢、调用次数很多、累计耗时很高。只盯着最慢的一条 SQL，可能会漏掉高频的小慢查询。

## 3. 看懂执行计划

先执行普通 `EXPLAIN`，这个命令不会真正跑完整查询，在线上相对安全：

```sql
EXPLAIN
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

优化前的核心结果如下：

```text
type: ALL
possible_keys: idx_user_id, idx_status
key: NULL
rows: 2864317
filtered: 1.00
Extra: Using where; Using filesort
```

几个字段可以这样理解：

1. `type=ALL`：全表扫描，这次问题的重点。
2. `key=NULL`：优化器最终没有选择索引。
3. `rows`：预计需要检查的行数，不是精确值，但可以判断量级。
4. `filtered`：经过条件过滤后预计保留的比例。
5. `Using filesort`：排序无法直接利用索引完成，并不一定真的写磁盘，但会产生额外排序成本。

表里原来只有 `user_id` 和 `status` 两个单列索引。MySQL 通常不会把多个单列索引自动组合成最理想的访问路径，即使发生了索引合并，也解决不了后面的时间排序问题。

## 4. 根据查询模式设计索引

这个查询有两个等值条件，后面跟一个排序字段，因此新增联合索引：

```sql
ALTER TABLE order_info
ADD INDEX idx_user_status_created (user_id, status, created_at);
```

再次查看执行计划：

```text
type: ref
key: idx_user_status_created
rows: 37
filtered: 100.00
Extra: Using index condition
```

查询耗时从秒级降到了几十毫秒，扫描行数也从百万级下降到几十行。索引顺序不是固定公式，而是由真实查询决定：这里 `user_id` 和 `status` 都是等值条件，`created_at` 用于排序，因此这个顺序比较合适。

**不要为了覆盖查询把所有返回字段都塞进联合索引。** `order_no`、`amount` 等字段加入索引后虽然可能减少回表，但会明显增加索引体积和写入成本。是否做覆盖索引，需要结合查询频率、字段长度和写入压力再决定。

## 5. MySQL 8.0 可以进一步验证

MySQL 8.0.18 以后可以使用 `EXPLAIN ANALYZE` 查看实际执行时间和真实行数：

```sql
EXPLAIN ANALYZE
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

这个命令会真正执行 SQL。对于更新、删除语句或者可能返回大量数据的查询，不能当作普通 `EXPLAIN` 随便在线上执行。MySQL 5.7 没有这个能力，只能结合慢查询日志、执行计划和监控数据验证。

## 6. 还有几个容易忽略的问题

### 6.1 深分页

下面这种分页到了后面仍然会扫描并丢弃大量数据：

```sql
SELECT id, order_no, created_at
FROM order_info
WHERE user_id = 10001
ORDER BY created_at DESC
LIMIT 200000, 20;
```

业务允许时，优先使用上一页最后一条记录作为游标，避免不断增大的 `OFFSET`。如果时间可能重复，需要同时携带 `created_at` 和唯一主键，保证翻页稳定。

### 6.2 统计信息过旧

表数据变化很大时，优化器估算可能失真。可以先比较执行计划和真实数据分布，再在低峰期评估是否执行：

```sql
ANALYZE TABLE order_info;
```

这不是固定的“优化命令”，执行前要确认 MySQL 版本、表大小和锁影响。

### 6.3 只看一次压测结果

首次查询可能涉及磁盘读取，后续查询可能命中 Buffer Pool。调优前后要使用相同数据范围，多执行几轮，并观察数据库 CPU、磁盘 IO、扫描行数和接口分位耗时，不能只拿一次最快结果做结论。

## 7. 复盘清单

1. 从慢查询日志或聚合指标确认真实高耗时 SQL。
2. 对比扫描行数与返回行数，先判断是否存在无效扫描。
3. 使用 `EXPLAIN` 检查 `type`、`key`、`rows` 和 `Extra`。
4. 按实际查询条件设计联合索引，不机械套用字段选择性公式。
5. 同时评估索引对新增、更新和磁盘空间的影响。
6. 调优后用同一组数据和完整监控验证，保留回退方案。

SQL 调优本质上不是让某一条 SQL 看起来更快，而是在查询性能、写入成本和维护复杂度之间找到一个能长期运行的平衡点。
