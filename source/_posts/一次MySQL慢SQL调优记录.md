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

> 写在前面：SQL 调优最怕一上来就加索引。索引可能暂时把耗时压下去，也可能只是把成本从查询转移到写入和存储。下面按一次完整实验记录来写：先保存基线，再提出候选方案，用执行计划和对照数据筛选，最后明确上线与回滚条件。

问题接口查询某个用户最近的已支付订单。数据增长后，P99 从 300ms 左右升到 5 秒，数据库 CPU 没有打满，但慢查询中的扫描行数非常夸张。

## 13:50，固定问题样本

原始 SQL：

```sql
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

慢查询摘要：

```text
# Query_time: 4.782  Lock_time: 0.000
# Rows_sent: 20  Rows_examined: 2864317
```

只返回 20 行，却扫描 286 万行。为了避免优化错对象，还需要确认：

```text
SQL digest：0x7A82...
过去 1 小时调用：18,420 次
参数分布：高频用户与普通用户都慢
调用入口：订单列表、支付结果页
数据库实例：只读副本
表数据量：约 1,860 万行
```

应用日志中的 SQL 可能经过 ORM 动态拼装，真正执行的字段、条件和排序应以数据库采样为准。样本中的用户和订单数据均做脱敏。

## 14:05，建立可比较的基线

测试环境使用一份接近生产分布的快照，数据库版本与参数保持一致。每个候选方案执行：

```text
冷缓存：重启隔离测试实例后执行 3 次
暖缓存：预热后执行 20 次
并发：1、20、50 三档
写入：保持相同订单写入压测
记录：P50、P95、P99、Rows_examined、CPU、IO
```

这里不通过生产执行 `RESET QUERY CACHE` 或重启数据库制造冷缓存。冷缓存实验只在隔离实例进行。

基线结果：

| 场景 | P50 | P99 | Rows_examined | 数据库 CPU |
| --- | ---: | ---: | ---: | ---: |
| 单线程暖缓存 | 4.12s | 4.91s | 2,864,317 | 18% |
| 20 并发 | 5.86s | 8.42s | 2,864,317 | 63% |
| 50 并发 | 9.74s | 超时 | 2,864,317 | 91% |

单次查询时 CPU 看起来不高，并发放大后问题才接近生产影响。只测一次很容易低估扫描成本。

## 14:18，读执行计划而不是只看 key

```sql
EXPLAIN
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

关键结果：

```text
type: index
possible_keys: idx_user_id,idx_status
key: idx_created_at
rows: 2840000
filtered: 0.1
Extra: Using where
```

优化器选择 `idx_created_at`，是因为它能按创建时间倒序扫描并尽早满足 `LIMIT`。但用户 10001 的已支付订单很稀疏，为找到 20 条匹配记录，它沿时间索引跳过了大量其他用户订单。

`key` 不为空只说明使用了某个索引，不说明这个访问路径足够便宜。`rows` 和实际 `Rows_examined` 才暴露扫描规模。

在 MySQL 8.0.18 以上的隔离环境，还可以使用：

```sql
EXPLAIN ANALYZE
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = 10001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;
```

`EXPLAIN ANALYZE` 会真实执行查询，可能产生负载和读取开销，不能把它当成生产环境的无成本命令。它显示大部分时间消耗在按 `created_at` 扫描后过滤。

## 14:32，先看选择性和数据分布

```sql
SELECT
    COUNT(*) AS total,
    COUNT(DISTINCT user_id) AS users,
    SUM(status = 'PAID') AS paid_rows
FROM order_info;
```

结果概要：

```text
总行数：18,600,000
用户数：1,240,000
PAID 占比：约 61%
普通用户订单中位数：9
高频用户最大订单数：84,000
```

`status` 单列区分度很低，`user_id` 更适合作为联合索引前导列。查询还有按时间排序，因此候选索引应同时考虑过滤和顺序。

## 14:45，候选 A：user_id + status

```sql
CREATE INDEX idx_user_status
ON order_info (user_id, status);
```

执行计划改为按用户和状态定位，但仍有：

```text
rows: 84216
Extra: Using index condition; Using filesort
```

普通用户查询约 28ms，高频用户约 310ms。相比原方案已经明显改善，但热门用户需要读取并排序 8 万多行，P99 仍不稳定。

这个实验验证了前两列的过滤价值，也说明排序字段不能忽略。

## 15:10，候选 B：加入 created_at

```sql
CREATE INDEX idx_user_status_created
ON order_info (user_id, status, created_at DESC);
```

MySQL 8.0 支持降序索引；在不支持的版本中，InnoDB 也可以反向扫描普通 B-Tree，需要以实际执行计划验证。

新计划：

```text
type: ref
key: idx_user_status_created
rows: 84216
Extra: Backward index scan
```

`rows` 仍是统计估算，但实际执行在按顺序取到 20 行后停止：

```text
Rows_sent: 20
Rows_examined: 20
```

关键不是计划里某个字段看起来漂亮，而是实际扫描量已经与返回量接近。

## 15:35，候选 C：做成宽覆盖索引

为了验证回表成本，又测试：

```sql
CREATE INDEX idx_user_status_created_cover
ON order_info (
    user_id,
    status,
    created_at DESC,
    order_no,
    amount
);
```

因为 InnoDB 二级索引叶子节点已经包含主键，查询所需字段基本都在索引中。单查询 P99 从 14ms 下降到约 10ms，但索引体积增加明显，订单写入 P99 上升约 13%。

一次只返回 20 行，方案 B 的回表次数很少。为了 4ms 收益承担更宽索引和更高写放大不划算，因此候选 C 被淘汰。

## 三个方案的对照结果

| 方案 | 暖缓存 P99 | 50 并发 P99 | 实际扫描行 | 写入 P99 变化 |
| --- | ---: | ---: | ---: | ---: |
| 原始索引 | 4.91s | 超时 | 2,864,317 | 基线 |
| A：user,status | 310ms | 1.12s | 84,216 | +5% |
| B：user,status,time | 14ms | 68ms | 20 | +7% |
| C：宽覆盖索引 | 10ms | 55ms | 20 | +13% |

最终选择 B。它不是查询绝对最快的方案，但在读取收益、写入成本和索引体积之间更平衡。

## 16:10，上线前先写回滚门槛

大表加索引不是普通代码发布。执行前记录：

```text
预计索引大小
构建临时空间
DDL 预计时间
元数据锁等待
主从复制延迟
写入延迟变化
中止方式
旧索引保留时间
```

本次先在只读副本创建并验证，再通过数据库变更平台执行。是否支持在线 DDL 与 `LOCK=NONE` 取决于 MySQL 版本、存储引擎和具体操作，不能只看语法：

```sql
ALTER TABLE order_info
ADD INDEX idx_user_status_created (user_id, status, created_at DESC),
ALGORITHM=INPLACE,
LOCK=NONE;
```

执行由数据库负责人操作，并持续观察。预先约定暂停或回滚条件：

```text
元数据锁阻塞核心写入
复制延迟持续超过 30 秒
磁盘剩余空间低于安全线
订单写入 P99 比基线上升超过 15%
新索引上线后仍未被目标 SQL 使用
```

删除索引同样是生产 DDL，不在发现异常后凭情绪立即执行。先确认异常与索引相关，再按变更流程回退。

## 17:20，灰度验证真实流量

索引完成后先让一个只读实例承接少量订单查询，核对：

```text
目标 SQL 的 key 是否为新索引
Rows_examined / Rows_sent 是否接近 1
普通用户与高频用户 P99
Buffer Pool、磁盘读取与 CPU
订单写入和复制延迟
错误率与结果一致性
```

灰度一小时后：

```text
接口 P99：4.9s -> 72ms
Rows_examined P95：280 万 -> 20
只读实例 CPU 峰值：76% -> 31%
订单写入 P99：增加约 6%
复制延迟：无明显变化
```

结果符合实验，才逐步扩大流量。

## 索引解决不了深分页

首页查询改善后，运营后台仍有：

```sql
LIMIT 200000, 20;
```

即使使用联合索引，数据库仍要跳过大量记录。用户侧列表改为游标分页：

```sql
SELECT id, order_no, user_id, status, amount, created_at
FROM order_info
WHERE user_id = :userId
  AND status = 'PAID'
  AND (
      created_at < :lastCreatedAt
      OR (created_at = :lastCreatedAt AND id < :lastId)
  )
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

正式索引相应增加 `id` 作为稳定排序键。只按时间游标时，相同时间的订单可能重复或遗漏。

运营导出不再通过深分页同步拉取，而是走异步批任务，避免一个请求长期占用数据库连接。

## 一周后的复核

索引上线不是实验结束。我们在一周后再次检查：

- 慢查询 digest 的调用量和 P99。
- 新索引实际使用次数。
- 单表索引体积和 Buffer Pool 命中。
- 写入、更新和删除成本。
- 旧单列索引是否与新索引重复。
- 数据分布变化后计划是否稳定。

确认新联合索引覆盖了 `idx_user_id` 的用途后，才单独发起旧索引下线评审。删除前还要检索其他 SQL，不能只围绕本次接口判断。

这次调优最后留下的不是一句“加联合索引”，而是一条可以复查的决策链：

```text
真实慢日志建立基线
执行计划解释扫描路径
数据分布决定候选顺序
多个索引方案对照读写成本
提前定义上线和回滚门槛
灰度验证真实流量
持续复核索引价值
```

性能优化不是把某一次耗时压到最低，而是在真实负载下，让读取、写入、容量和可回退性达到更稳定的平衡。
