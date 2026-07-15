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

> 写在前面：索引建了不等于一定会用，执行计划里出现了索引也不等于查询就足够快。很多所谓的“索引失效”，其实是索引顺序和查询方式根本对不上。

这篇把工作中比较容易遇到的联合索引问题放在一起，重点不是背口诀，而是知道看到 `key=NULL` 或扫描行数异常时应该怎么往下查。

## 1. 先看一个联合索引

订单表有下面这个索引：

```sql
CREATE INDEX idx_tenant_status_created
ON order_info (tenant_id, status, created_at);
```

可以把联合索引简单理解成按照下面的顺序排列：

```text
tenant_id -> status -> created_at
```

因此下面几类条件比较容易利用这个索引：

```sql
-- 使用 tenant_id
SELECT * FROM order_info
WHERE tenant_id = 1001;

-- 使用 tenant_id、status
SELECT * FROM order_info
WHERE tenant_id = 1001
  AND status = 'PAID';

-- 等值过滤以后，再按 created_at 做范围查询
SELECT * FROM order_info
WHERE tenant_id = 1001
  AND status = 'PAID'
  AND created_at >= '2023-04-01';
```

而只使用中间字段时，通常无法走出理想的索引范围：

```sql
SELECT * FROM order_info
WHERE status = 'PAID';
```

这就是常说的最左前缀原则。它描述的是索引有序性的利用方式，不是要求 SQL 条件必须按照索引字段顺序书写。下面两种写法对优化器来说基本没有区别：

```sql
WHERE tenant_id = 1001 AND status = 'PAID'
WHERE status = 'PAID' AND tenant_id = 1001
```

## 2. 常见的索引失效场景

### 2.1 在索引字段上做函数计算

```sql
-- 不推荐：每一行都要计算 DATE(created_at)
SELECT * FROM order_info
WHERE DATE(created_at) = '2023-04-23';
```

可以改成明确的时间范围：

```sql
SELECT * FROM order_info
WHERE created_at >= '2023-04-23 00:00:00'
  AND created_at <  '2023-04-24 00:00:00';
```

MySQL 8.0 支持函数索引，但也不代表所有函数条件都应该依赖函数索引解决。时间范围写法更直观，也更容易复用普通索引。

### 2.2 字段类型不一致导致隐式转换

假设 `user_phone` 是 `VARCHAR`：

```sql
-- 数字常量可能触发隐式类型转换
SELECT * FROM user_info
WHERE user_phone = 13800138000;

-- 参数类型与字段保持一致
SELECT * FROM user_info
WHERE user_phone = '13800138000';
```

Java 代码里也要检查 MyBatis 参数类型。数据库字段是字符串，代码却传了 `Long`，SQL 文本看起来差别不大，执行计划可能完全不同。

### 2.3 前置通配符

```sql
-- 普通 B+Tree 索引无法定位字符串起点
SELECT * FROM article
WHERE title LIKE '%MySQL%';

-- 固定前缀可以利用索引范围
SELECT * FROM article
WHERE title LIKE 'MySQL%';
```

真正的任意关键词检索更适合全文索引或专门的搜索引擎，不建议为了模糊搜索不断堆普通索引。

### 2.4 范围条件后面的字段

如果索引改成下面的顺序：

```sql
CREATE INDEX idx_tenant_created_status
ON order_info (tenant_id, created_at, status);
```

查询条件为：

```sql
SELECT * FROM order_info
WHERE tenant_id = 1001
  AND created_at >= '2023-04-01'
  AND status = 'PAID';
```

`created_at` 进入范围扫描以后，后面的 `status` 通常不能继续缩小索引扫描区间。部分版本可能通过索引条件下推减少回表，但扫描范围仍然可能很大。因此对这个查询而言，`(tenant_id, status, created_at)` 往往更合适。

### 2.5 OR 两边没有完整索引

```sql
SELECT * FROM order_info
WHERE order_no = 'A20230423001'
   OR third_party_no = 'WX20230423001';
```

如果只有 `order_no` 有索引，优化器可能选择全表扫描。可以根据业务语义评估给两个字段分别建索引，或者拆成两个查询后合并结果。不要为了让执行计划好看直接改成 `UNION`，需要确认去重规则和实际耗时。

## 3. 为什么索引符合规则，优化器还是不用

索引不是越多越好，优化器会估算“走索引再回表”和“直接扫描表”的成本。下面几种情况，即使语法上可以使用索引，也可能选择全表扫描：

1. 表非常小，全表扫描成本更低。
2. 条件返回了表中大部分数据，回表次数过多。
3. 字段区分度很低，例如只有两个值的状态字段。
4. 统计信息过旧，优化器对数据分布估算错误。
5. 查询返回字段过多，无法形成覆盖索引。

先用执行计划确认，不要凭感觉判断：

```sql
EXPLAIN FORMAT=JSON
SELECT id, order_no, amount, created_at
FROM order_info
WHERE tenant_id = 1001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 50;
```

普通 `EXPLAIN` 适合快速看结论，JSON 格式会给出更详细的成本和过滤信息。MySQL 8.0 还可以在确认查询安全后使用 `EXPLAIN ANALYZE` 查看实际行数。

## 4. 联合索引怎么设计

我一般按照下面的顺序判断：

1. 先收集高频且重要的真实 SQL，不根据单个字段想象索引。
2. 稳定的等值条件通常放在前面，例如租户、用户、业务状态。
3. 范围和排序字段通常放在等值字段之后。
4. 比较查询返回字段，判断是否值得做覆盖索引。
5. 合并可以互相复用的索引，避免重复索引增加写放大。

例如这个列表查询：

```sql
SELECT id, order_no, amount, created_at
FROM order_info
WHERE tenant_id = 1001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 50;
```

可以先评估：

```sql
CREATE INDEX idx_tenant_status_created
ON order_info (tenant_id, status, created_at);
```

网上经常说“区分度高的字段放最前面”，这个说法不够完整。联合索引首先要匹配查询路径和排序需求，区分度只是成本判断的一部分。把高区分度字段放到前面，却破坏了多个高频查询可以复用的前缀，整体效果可能更差。

## 5. 检查重复和长期不用的索引

先查看表上的索引：

```sql
SHOW INDEX FROM order_info;
```

如果已经存在 `(tenant_id, status, created_at)`，通常不再需要单独的 `(tenant_id)` 索引，因为前者可以覆盖它的访问前缀。但是否删除仍然要结合索引大小、查询统计和执行计划验证。

MySQL 的 `sys` 库可以提供未使用索引线索：

```sql
SELECT object_schema, object_name, index_name
FROM sys.schema_unused_indexes
WHERE object_schema = 'order_db';
```

这里的数据通常来自实例启动后的统计，重启会影响观察窗口。**不能看到“未使用”就立即删除索引。** 应该覆盖完整业务周期，并提前准备恢复索引的 DDL。

## 6. 不建议直接使用 FORCE INDEX

```sql
SELECT * FROM order_info FORCE INDEX (idx_tenant_status_created)
WHERE tenant_id = 1001
  AND status = 'PAID';
```

`FORCE INDEX` 可以用于验证猜想，但不应该成为默认修复方式。数据分布会变化，今天合适的索引路径以后未必合适。强制索引会限制优化器选择，最好先解决统计信息、SQL 写法或索引设计问题。

## 7. 排查清单

1. 确认字段类型与传入参数类型是否一致。
2. 检查索引字段上是否存在函数、计算或隐式转换。
3. 检查联合索引是否满足真实查询的最左前缀。
4. 注意范围条件、排序和后续字段之间的关系。
5. 比较扫描行数、返回行数和回表成本。
6. 检查重复索引和长期不用的索引，但删除前必须持续观察。
7. 修改后重新查看执行计划，并通过真实流量指标验证。

索引问题最后还是要回到一句话：**用数据证明优化有效。** 能走索引只是过程，稳定降低响应时间和数据库负载才是结果。
