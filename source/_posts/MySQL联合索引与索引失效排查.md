---
title: MySQL联合索引与索引失效排查
date: 2023-04-23 10:35:00
updated: 2023-04-24 22:15:00
tags:
  - MySQL
  - 联合索引
  - SQL优化
categories: 数据库
---

> 写在前面：索引建了不等于一定会用，执行计划里出现索引也不等于查询足够快。与其背“最左匹配”“范围后失效”这些短句，不如准备一张测试表，把每个判断放进执行计划里验证。

这篇使用同一个订单表回答十个常见问题。实验基于 MySQL 8.0，具体计划会随版本、数据分布和统计信息变化，结论不能脱离现场照搬。

## 实验台

```sql
CREATE TABLE order_info (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    order_no VARCHAR(32) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_tenant_status_created (tenant_id, status, created_at)
) ENGINE=InnoDB;
```

联合索引可以近似理解为先按 `tenant_id` 排序，在相同租户内按 `status` 排序，再在相同状态内按 `created_at` 排序：

```text
tenant_id -> status -> created_at -> primary key
```

测试数据约 500 万行：

```text
tenant_id：1 万个，分布不完全均匀
status：PAID 58%，CREATED 22%，其他 20%
created_at：覆盖 24 个月
buyer_phone：高区分度字符串
```

数据分布很重要。只有 5 行的空表上，优化器选择全表扫描并不能证明索引失效。

每个问题至少执行：

```sql
EXPLAIN FORMAT=TREE
SELECT ...;

EXPLAIN ANALYZE
SELECT ...;
```

`EXPLAIN ANALYZE` 会真正执行 SQL，只在可控环境或经过评估的查询上使用。对更新和删除语句更不能直接在生产试验。

## 问题一：最左匹配是不是必须写全三列

不是。只使用连续的左侧列也可以：

```sql
-- 可以按 tenant_id 定位
SELECT id
FROM order_info
WHERE tenant_id = 1001;

-- 可以继续按 tenant_id、status 定位
SELECT id
FROM order_info
WHERE tenant_id = 1001
  AND status = 'PAID';
```

跳过中间的 `status`：

```sql
SELECT id
FROM order_info
WHERE tenant_id = 1001
  AND created_at >= '2023-04-01';
```

执行计划仍可能使用 `idx_tenant_status_created` 按 `tenant_id` 缩小范围，但 `created_at` 无法与前导列组成连续边界，需要扫描该租户的多个状态后再过滤。

所以“索引使用了”和“索引的每一列都用于定位”是两件事。看 `key_len`、树形计划和实际扫描行数，不能只看 `key`。

## 问题二：跳过第一列一定全表扫描吗

查询：

```sql
SELECT id
FROM order_info
WHERE status = 'PAID'
  AND created_at >= '2023-04-01';
```

普通 B-Tree 无法直接从 `status` 找到一个连续区间，因为相同状态散布在每个租户段中。当前数据里 `tenant_id` 有一万个不同值，优化器选择全表扫描。

MySQL 8.0 在特定条件下可能使用 Skip Scan，把少量前导列值分别探测。但它依赖版本、前导列基数和成本估算。前导列一万个值时，跳跃一万次通常没有优势。

结论不是“永远不可能使用”，而是不能把 Skip Scan 当成核心查询的稳定设计。如果按状态和时间查询是高频场景，应建立与它匹配的索引或改变查询入口。

## 问题三：范围条件后的列是否完全失效

索引顺序改成：

```sql
CREATE INDEX idx_tenant_created_status
ON order_info (tenant_id, created_at, status);
```

查询：

```sql
SELECT id
FROM order_info
WHERE tenant_id = 1001
  AND created_at >= '2023-04-01'
  AND status = 'PAID';
```

`tenant_id` 和 `created_at` 可以形成索引范围。到达 `created_at >=` 后，`status` 通常不能继续缩小连续范围，但它仍可能：

- 在索引条件下推中提前过滤。
- 作为覆盖列避免回表。
- 减少传递到 Server 层的记录。

因此“范围之后全部失效”太绝对。更准确的说法是：后续列通常不能继续参与构造本次索引查找的连续边界，但仍可能降低其他成本。

如果 `status` 是等值且选择性有价值，原索引 `(tenant_id, status, created_at)` 往往更适合当前查询。最终仍要比较真实分布。

## 问题四：字段上使用函数一定没救吗

普通写法：

```sql
SELECT id
FROM order_info
WHERE DATE(created_at) = '2023-04-23';
```

对每行计算 `DATE(created_at)`，普通 `created_at` 索引无法直接定位原值区间。优先改写为：

```sql
SELECT id
FROM order_info
WHERE created_at >= '2023-04-23 00:00:00'
  AND created_at <  '2023-04-24 00:00:00';
```

半开区间避免 `23:59:59` 漏掉更高精度时间。

如果业务只能按表达式查询，MySQL 8.0.13 以上可以评估函数索引：

```sql
CREATE INDEX idx_created_date
ON order_info ((DATE(created_at)));
```

函数索引增加存储与写入成本，也要求查询表达式与索引表达式匹配。能用原字段范围表达时，通常先选择范围查询。

## 问题五：隐式类型转换为什么有时影响索引

`buyer_phone` 是 `VARCHAR`：

```sql
CREATE INDEX idx_buyer_phone
ON order_info (buyer_phone);
```

错误参数类型：

```sql
SELECT id
FROM order_info
WHERE buyer_phone = 13800138000;
```

数字与字符串比较可能让 MySQL 对列做数值转换，普通字符串索引难以按原顺序定位。正确方式：

```sql
SELECT id
FROM order_info
WHERE buyer_phone = '13800138000';
```

反过来，数字列与可转换的字符串常量比较时，优化器可能转换常量后继续使用索引。不能简化成“类型不同一定失效”，但应用层仍应使用与字段一致的 JDBC 参数类型，避免计划、精度和异常值差异。

排查时同时看表定义和实际绑定参数。日志里的 `user_id = '1001'` 不一定等于驱动实际以字符串发送，需要在 SQL 采样或代码中确认。

## 问题六：LIKE 是否都会失去索引

前缀匹配通常能转成范围：

```sql
SELECT id
FROM order_info
WHERE order_no LIKE 'O20230423%';
```

前置通配符无法利用普通 B-Tree 的有序前缀：

```sql
SELECT id
FROM order_info
WHERE order_no LIKE '%0423';
```

如果后缀查询是核心需求，可以考虑冗余反转字段并按前缀查询、全文索引或搜索系统，但要同步写入和校验。不要为一个低频后台搜索立刻增加复杂链路。

字符集、排序规则和参数长度也会影响范围与选择性，仍以计划和扫描量为准。

## 问题七：不等于、NOT IN、IS NOT NULL 一定全表扫描吗

这类条件经常匹配大部分数据：

```sql
SELECT id
FROM order_info
WHERE status <> 'CANCELLED';
```

如果 95% 行都符合，走二级索引再回表可能比顺序扫描更贵，优化器选择全表扫描是合理成本决策，不是索引坏了。

当查询只返回索引中的 `id` 和 `status` 时，覆盖索引成本可能又低于全表扫描。结果取决于：

```text
匹配比例
返回字段
表行宽
缓存命中
随机 IO 成本
统计信息
```

优化目标是总成本，不是强迫每条 SQL 都显示 `type=ref`。

## 问题八：OR 一定让索引失效吗

```sql
SELECT id
FROM order_info
WHERE order_no = 'O202304230001'
   OR buyer_phone = '13800138000';
```

两列都有合适索引时，MySQL 可能使用 `index_merge`；数据量和成本不合适时，也可能全表扫描。

可以对照改写：

```sql
SELECT id
FROM order_info
WHERE order_no = 'O202304230001'
UNION DISTINCT
SELECT id
FROM order_info
WHERE buyer_phone = '13800138000';
```

`UNION DISTINCT` 有去重成本；如果业务保证两边不重叠，才可以使用 `UNION ALL`。改写后还要验证排序、分页和重复语义，不能只比较执行计划。

如果 OR 的一侧完全没有可用条件，常常会拖累整体。此时要评估拆查询、补索引，还是限制搜索能力。

## 问题九：IN 很短就一定等同于等值吗

```sql
SELECT id, created_at
FROM order_info
WHERE tenant_id = 1001
  AND status IN ('PAID', 'REFUNDED')
ORDER BY created_at DESC
LIMIT 20;
```

在 `(tenant_id, status, created_at)` 上，两个 status 对应两个索引区间。每个区间内部按时间有序，但合并后的全局时间顺序可能需要额外排序。

当 `IN` 值很多时，范围数量、优化器内存和排序成本继续增加。不要仅凭“IN 也是等值”判断能否同时满足 `ORDER BY`。

如果“全部有效状态按时间取最近”是核心入口，可能需要：

- 冗余一个 `is_active` 分类字段并建立匹配索引。
- 分状态各取一部分后在应用合并。
- 调整业务查询模型。

每个方案都增加写入或实现成本，应通过数据验证。

## 问题十：索引完全匹配，优化器为什么仍不用

常见原因不止“统计信息过期”：

```text
条件匹配比例太高
返回列很多，回表成本高
表很小，全表扫描更便宜
数据倾斜，平均统计无法描述某个热点值
组合条件存在相关性，估算偏差
索引和表缓存状态不同
优化器参数或版本行为变化
```

先核对：

```sql
SHOW INDEX FROM order_info;
ANALYZE TABLE order_info;
```

`ANALYZE TABLE` 会更新统计信息，并可能带来资源和锁影响，应按数据库变更规范执行。不要把它当成每次慢查询的固定按钮。

MySQL 8.0 可以用直方图描述非索引列或倾斜分布，但直方图也需要维护，且不是联合相关性的万能解法。

## FORCE INDEX 能不能作为最终修复

`FORCE INDEX` 适合在隔离环境比较候选计划，生产长期使用要谨慎：

```sql
SELECT id
FROM order_info FORCE INDEX (idx_tenant_status_created)
WHERE tenant_id = 1001
  AND status = 'PAID';
```

它把今天的判断固定进 SQL。数据增长、状态比例和索引变化后，被强制的计划可能变差，优化器也失去调整空间。

如果必须临时使用，应记录：

```text
为什么优化器当前误判
哪些参数和数据已验证
观察指标
移除条件
复核日期
```

更长期的方向通常是修正统计、查询模型或索引设计。

## 联合索引怎么从业务查询推导

我现在按四步设计。

### 1. 收集查询族

不是只看一条慢 SQL，而是整理同一张表的高频读写：

```text
租户 + 状态 + 时间列表
订单号精确查询
买家手机号搜索
按用户游标分页
状态更新
批量归档
```

### 2. 区分等值、范围、排序和返回

通常先考虑高频等值条件，再考虑范围和排序；但数据选择性、是否总是出现、是否支持多种查询同样重要。不存在一个脱离业务的固定顺序口诀。

### 3. 用最少索引覆盖主要路径

相似索引会重复占用空间并拖慢写入：

```text
idx_tenant
idx_tenant_status
idx_tenant_status_created
```

长索引可能覆盖短索引的部分查询，但不一定能完全替代：索引宽度、排序、覆盖和其他 SQL 都要检查。确认替代关系后再分阶段删除。

### 4. 对读写一起压测

索引验收至少看：

```text
目标查询 P95 / P99
Rows_examined / Rows_sent
并发下 CPU 与 IO
INSERT / UPDATE 延迟
索引体积与 Buffer Pool
主从复制延迟
```

查询快了 20ms、写入慢了 30%，可能不是一次成功优化。

## 一张不靠口诀的排查单

```text
[ ] SQL、参数类型和表结构来自真实现场
[ ] 数据量与分布足以代表生产
[ ] 分清“使用索引”和“各列参与定位”
[ ] 查看估算行数，也查看实际扫描行数
[ ] 函数和类型转换是否作用在列上
[ ] 范围、IN、OR 与 ORDER BY 的组合是否改变计划
[ ] 优化器选择全表扫描是否本来就更便宜
[ ] 统计信息、倾斜和版本差异是否影响估算
[ ] 候选索引是否重复或过宽
[ ] 读取收益与写入、存储成本一起验证
```

所谓“索引失效”经常把很多不同现象揉成一句话：有时根本没用索引，有时只用了联合索引前几列，有时使用了索引但扫描仍然很大，还有时全表扫描就是更好的计划。

把问题还原成“优化器选择了哪条访问路径、估算依据是什么、实际付出了多少成本”，比背下更多绝对规则更可靠。
