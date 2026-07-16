---
title: 服务器内存不足与OOM排查
date: 2023-09-10 16:40:00
updated: 2023-09-11 21:25:00
tags:
  - Linux
  - OOM
  - JVM
  - 内存排查
categories: 故障排查
---

> 写在前面：服务器内存“看起来快满了”和真正发生 OOM 不是一回事。Linux 会使用空闲内存做页缓存，`free` 很低不一定危险；反过来，容器被 OOM Kill 时，宿主机可能还有大量空闲内存。

这篇按一份内存取证报告展开。案例中容器限制为 4GiB，JVM `-Xmx3g`，退出码 137。监控显示堆只用了约 2.1GiB，因此最初“堆泄漏”的判断并不成立。

## 事故摘要

```text
现象：order-service Pod 重启，退出码 137
容器限制：4GiB
JVM：JDK 8，-Xms3g -Xmx3g
退出前 Heap used：约 2.1GiB
退出前 RSS：约 3.95GiB
宿主机 available：约 18GiB
Java 日志：没有 java.lang.OutOfMemoryError
```

这组事实更像容器边界触发的 OOM Kill，而不是 JVM 主动抛出堆 OOM。

## 第一步：先确认是谁判定 OOM

不同错误对应不同边界：

| 现象 | 决策者 | 典型方向 |
| --- | --- | --- |
| `Java heap space` | JVM | 堆对象过多或堆不足 |
| `GC overhead limit exceeded` | JVM | GC 高耗但回收很少 |
| `Metaspace` | JVM | 类元数据或类加载器 |
| `Direct buffer memory` | JVM/NIO | 直接内存 |
| `unable to create new native thread` | JVM/OS | 线程、地址空间、系统限制 |
| 退出码 137 / OOMKilled | cgroup 或内核 | 进程总内存超过边界 |
| 宿主机多个进程被杀 | Linux OOM Killer | 整机内存压力 |

容器平台先看事件：

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl get pod <pod-name> -n <namespace> -o yaml
```

节点侧根据权限检查内核记录：

```bash
journalctl -k --since '2023-09-10 16:00:00'
dmesg -T | rg -i 'out of memory|killed process|oom'
```

内核日志可能包含进程和主机信息，只由有权限的人员读取。部分集群不会向应用账号开放节点日志，此时以 Pod 事件和监控平台为准。

cgroup v2 可以查看：

```bash
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.events
```

路径会随运行时和 cgroup 版本变化。当前案例 `oom_kill` 计数增加，确认是容器超限。

## 第二步：整机、容器、进程、JVM 四层不要混看

### 整机

```bash
free -h
vmstat 1 5
ps -eo pid,user,%mem,rss,vsz,etime,cmd --sort=-rss | head -20
```

`free -h` 优先看 `available`，不要只看 `free`。`vmstat` 关注 `si/so`，持续交换通常意味着真实压力。

### 容器

看工作集、RSS、Cache、limit 和 OOM 事件。宿主机有空闲，不能阻止单个容器越过自己的 4GiB 限制。

### 进程

```bash
cat /proc/<pid>/status
cat /proc/<pid>/smaps_rollup
```

重点包括：

```text
VmRSS：当前驻留物理内存
VmSize：虚拟地址空间，不等于实际占用
RssAnon：匿名页，常包含 JVM 堆和本地内存
RssFile：文件映射
Threads：线程数量
```

### JVM

```bash
jstat -gcutil <pid> 1000 10
jcmd <pid> GC.heap_info
jcmd <pid> VM.flags
```

JVM 堆只是进程内存的一部分。容器限制针对进程总量，而不是只看 `-Xmx`。

## 第三步：画一张 JVM 内存预算

Java 进程常见组成：

```text
Java Heap
Metaspace 与 Compressed Class Space
Code Cache
Direct Buffer
线程栈
GC 与 JVM 内部结构
JNI / 本地库
内存映射文件
页缓存与容器统计差异
```

本次退出前的估算：

| 组成 | 观察或预算 |
| --- | ---: |
| Heap used | 2.1GiB |
| Heap committed | 3.0GiB |
| Metaspace + Class | 230MiB |
| Code Cache | 110MiB |
| Direct Buffer | 430MiB |
| 线程约 620 个 | 栈上限约 620MiB |
| JVM/GC/本地库 | 约 180MiB |

这些数字不能简单相加当精确 RSS：堆 committed 不一定全部驻留，线程栈也会按需提交。但它足以说明 `-Xmx3g` 放进 4GiB 容器几乎没有安全余量。

配置预算至少要满足：

```text
容器 limit
  > Xmx
  + 可预期的 Metaspace 和 Code Cache
  + Direct Memory 上界
  + 最大线程数 × 栈预算
  + JVM 与本地库
  + 安全余量
```

不能使用“容器 4G，所以 Xmx 也配 4G”的方式。

## 第四步：用 NMT 观察堆外组成

JDK 8 可在启动时启用 Native Memory Tracking：

```text
-XX:NativeMemoryTracking=summary
```

运行时查看：

```bash
jcmd <pid> VM.native_memory summary scale=MB
```

NMT 必须在 JVM 启动时开启，不能在事故发生后临时补开。它能分类 JVM 自身原生内存，但不保证覆盖所有第三方本地库和内核页缓存，也有一定性能开销，需要在压测后启用。

输出重点：

```text
Java Heap
Class
Thread
Code
GC
Compiler
Internal
Arena Chunk
```

NIO 直接缓冲还可以通过应用指标、BufferPoolMXBean 或 `jcmd VM.native_memory` 辅助判断。只看 NMT 一项仍不足以解释进程全部 RSS。

## 第五步：为什么线程数突然到 620

故障前下游库存接口延迟从 100ms 上升到 4s。应用中有一个无边界伸缩的异步池：

```java
private final ExecutorService executor =
        Executors.newCachedThreadPool();
```

`newCachedThreadPool` 在任务堆积时可以持续创建线程。下游变慢后，旧任务没有完成，新任务继续创建线程：

```text
正常线程数：约 180
故障前 1 分钟：320
故障前 20 秒：510
退出前：620
```

同时 HTTP 客户端使用直接缓冲，等待请求增加后 Direct Memory 也上涨。堆使用率并没有明显异常，但进程 RSS 触碰容器限制。

这次根因可以分成：

```text
触发条件：下游响应显著变慢
放大机制：无界线程池持续创建线程
容量缺口：Xmx 占容器限制 75%，堆外余量不足
观测缺口：只告警 Heap，没有线程、RSS 和 cgroup 指标
```

## 第六步：如果真的是 Java Heap Space

堆 OOM 的取证路径不同。建议提前配置：

```text
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/lib/order/dumps
-XX:+ExitOnOutOfMemoryError
```

`ExitOnOutOfMemoryError` 是否使用要结合 JDK 版本和服务恢复策略评估。Dump 目录必须有足够独立空间、正确权限和保留策略；否则 OOM 时可能因为磁盘不足再次失败。

临时主动导出：

```bash
jcmd <pid> GC.heap_dump /secure/path/order-heap.hprof
```

Heap Dump 可能触发停顿、产生接近堆大小的文件并包含敏感业务数据。生产执行前必须评估磁盘、停顿和数据安全，由负责人授权。已经严重抖动的进程不一定承受得住主动 Dump。

分析时先看：

```text
对象数量和浅堆大小
Retained Heap
Dominator Tree
从大对象到 GC Root 的引用链
类加载器数量
集合和缓存是否无界
```

“某个 DTO 数量最多”不等于 DTO 泄漏。要找谁长期持有它，以及这些对象是否超过业务合理数量。

## 常见 OOM 分支

### Java heap space

可能是无界缓存、一次加载大结果集、消息积压对象化或真实容量不足。对照 GC 后 Old 区是否下降、对象增长曲线和引用链。

### GC overhead limit exceeded

JVM 花大量时间 GC，却只回收很少内存。通常已经接近堆耗尽，不能只关闭这个保护开关。继续查长期存活对象和分配速率。

### Metaspace

检查动态代理、脚本引擎、热部署和重复创建类加载器。若类数量持续上涨，单纯增加 `MaxMetaspaceSize` 只会延迟暴露。

### Direct buffer memory

关注 Netty/NIO、文件传输、HTTP 客户端和未及时释放的直接缓冲。可以设置 `MaxDirectMemorySize` 形成边界，但值过小也会影响正常 IO。

### Unable to create new native thread

同时看线程数、`ulimit -u`、地址空间、容器 PID limit 和剩余内存。线程池无界、阻塞调用和线程泄漏是常见原因。

### Linux 或 cgroup OOM Kill

可能没有 Java 异常和 Heap Dump，因为 JVM 没有机会处理。证据主要来自容器事件、内核日志、RSS、cgroup 和退出前指标。

## 本次修复

### 1. 重新划分内存预算

```text
容器 limit：4GiB -> 5GiB
Xms/Xmx：3GiB -> 2.5GiB
MaxDirectMemorySize：512MiB
Xss：在测试后从 1MiB 调整为 512KiB
安全余量：至少保留约 25%
```

调整 `Xss` 可能让深调用更早 `StackOverflowError`，必须通过测试验证，不能为了省内存盲目减小。容器扩容和下调 Xmx 同时执行，是为了先恢复余量，再根据堆真实峰值逐步优化。

### 2. 无界线程池改为有界

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        32,
        64,
        60,
        TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(200),
        namedThreadFactory("inventory-call"),
        new ThreadPoolExecutor.AbortPolicy()
);
```

线程数还要受下游并发和连接池约束。拒绝后进入可追踪补偿，不静默丢弃。

### 3. 下游调用快速失败

设置连接池获取、建连和读取超时，取消叠加重试；当下游变慢时对入口限流，避免请求在内存中无限累积。

### 4. 补齐四层指标

```text
主机 available / swap / OOM
容器 working set / RSS / limit / oom_kill
进程 RSS / thread count / open files
JVM heap / metaspace / direct buffer / GC
```

任何一层达到 80% 都不直接等于故障，但趋势和剩余时间应触发提前调查。

## 复现与容量验证

修复后在隔离环境注入 4 秒下游延迟：

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 最大线程数 | 620+ | 248 |
| 进程 RSS | 3.95GiB 后被杀 | 峰值 3.42GiB |
| Heap used | 2.1GiB | 2.0GiB |
| Direct Buffer | 430MiB | 280MiB |
| 拒绝/补偿 | 无边界堆积 | 有明确计数 |
| OOM Kill | 发生 | 未发生 |

还需要确认业务结果：超载请求是否得到明确响应，补偿任务能否追赶，下游恢复后内存和线程是否回落。

## 取证清单

```text
[ ] 判断 JVM OOM、容器 OOM 还是整机 OOM
[ ] 保存退出时间、版本、事件和内核记录
[ ] 对齐主机、容器、进程、JVM 四层指标
[ ] 比较 Heap used 与进程 RSS
[ ] 检查线程数、Direct Buffer、Metaspace 和本地库
[ ] Heap Dump 前评估停顿、磁盘和数据安全
[ ] 用引用链证明泄漏，不只看对象数量
[ ] 建立 Xmx 之外的完整内存预算
[ ] 在下游变慢和任务积压场景重新压测
[ ] 验证恢复后 RSS、线程和业务积压都会回落
```

内存问题最关键的第一问不是“哪个对象最大”，而是“哪一层的边界被突破”。只有先分清整机、容器、进程和 JVM，Heap Dump、NMT、线程数和 cgroup 指标才会落到正确的位置。
