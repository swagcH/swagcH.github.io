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

> 写在前面：服务器内存“看起来快满了”和真正发生 OOM 不是一回事。Linux 会尽量利用空闲内存做缓存，`free` 很低并不一定有问题；反过来，容器被 OOM Kill 时，宿主机可能还有很多空闲内存。

内存问题最重要的是先分清边界：整机内存不足、容器达到限制、JVM 堆溢出、堆外内存增长，处理方式完全不同。

## 1. 先看整机内存状态

```bash
free -h
vmstat 1 5
ps -eo pid,user,%mem,rss,vsz,etime,cmd --sort=-rss | head -20
```

`free -h` 可能得到类似结果：

```text
              total        used        free      shared  buff/cache   available
Mem:            16G         11G        420M        210M         4.6G        4.2G
Swap:            2G        128M        1.9G
```

这里优先看 `available`，它估算了不发生交换时还可以提供给新进程的内存。`free` 很少但 `available` 仍然充足，通常只是 Linux 使用了页缓存，不需要立即清理。

`vmstat` 里重点关注：

```text
si/so：是否持续发生 swap 换入和换出
r    ：等待 CPU 的任务
b    ：不可中断等待任务
free ：空闲内存趋势
```

持续的 `si/so` 往往会明显拖慢接口，即使进程还没有被杀掉，也需要尽快处理。

## 2. 确认有没有触发 Linux OOM Killer

Linux 在内存无法满足申请时，可能选择一个进程杀掉。先检查内核日志：

```bash
dmesg -T | grep -Ei 'out of memory|oom-killer|killed process'
journalctl -k --since '2 hours ago' | grep -Ei 'out of memory|oom|killed process'
```

典型日志：

```text
Out of memory: Killed process 18472 (java) total-vm:12582912kB,
anon-rss:7340032kB, file-rss:1024kB, shmem-rss:0kB
```

看到这条日志以后，至少可以确认进程不是正常退出，也不是 Java 主动抛出一个普通异常，而是被操作系统直接终止。接下来要对比进程 RSS、容器限制和当时的系统内存趋势。

## 3. JVM 堆内存怎么检查

假设 Java 进程 PID 为 `18472`：

```bash
PID=18472
jcmd $PID VM.flags
jcmd $PID GC.heap_info
jstat -gcutil $PID 1000 10
```

JDK 8 下主要看：

1. JVM 最大堆 `-Xmx` 是否超过机器或容器可用内存。
2. 老年代使用率是否持续增长。
3. Full GC 后占用是否明显下降。
4. Full GC 次数和耗时是否不断增加。

查看类实例数量可以使用：

```bash
jcmd $PID GC.class_histogram > /tmp/class-histogram.txt
```

在线上大堆进程执行直方图或 `jmap -histo:live` 可能触发停顿，不能看到命令就直接运行。业务高峰期应先评估影响，必要时在摘流量后的实例或复现环境执行。

## 4. 保留 Heap Dump

最理想的方式是在 JVM 启动时提前配置 OOM 自动导出：

```text
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/data/heapdump
-XX:+ExitOnOutOfMemoryError
```

`-XX:+ExitOnOutOfMemoryError` 需要较新的 JDK 8 update 版本，使用前应通过 `java -version` 和启动测试确认。`HeapDumpPath` 所在磁盘必须预留足够空间。堆最大为 8 GB 时，Dump 文件可能同样非常大；如果磁盘本来就快满了，导出失败还会带来额外 IO 压力。

进程仍然存活且确认可以承受停顿时，也可以手动导出：

```bash
jcmd $PID GC.heap_dump /data/heapdump/java-$PID.hprof
```

JDK 8 环境也常见下面的命令：

```bash
jmap -dump:format=b,file=/data/heapdump/java-$PID.hprof $PID
```

Dump 文件可能包含业务数据和用户信息，上传或转移前要遵守数据安全规范。分析时可以使用 MAT、VisualVM 等工具重点查看大对象、引用链和支配树。

## 5. 堆没有满，内存为什么还在涨

Java 进程的 RSS 不只包含 JVM 堆，还包括：

```text
JVM Heap
Metaspace
Direct Buffer
线程栈
JIT Code Cache
JNI 和本地库
内存映射文件
```

先看进程级数据：

```bash
cat /proc/$PID/status | grep -E 'VmPeak|VmSize|VmRSS|VmSwap|Threads'
pmap -x $PID | tail -1
```

如果启动时增加了下面的参数：

```text
-XX:NativeMemoryTracking=summary
```

可以使用：

```bash
jcmd $PID VM.native_memory summary
```

Native Memory Tracking 必须在 JVM 启动时开启，也会有一定性能开销。没有提前开启时，不能临时靠这条命令还原历史现场。

常见堆外问题包括：

1. Netty Direct Buffer 未及时释放。
2. 线程数不断增长，每个线程都需要栈空间。
3. 动态生成大量类导致 Metaspace 增长。
4. JNI 或本地库发生内存泄漏。
5. 大量内存映射文件没有解除映射。

## 6. 容器环境要单独检查限制

容器只看宿主机 `free -h` 很容易误判。先查看容器实际使用量：

```bash
docker stats --no-stream
docker inspect --format '{{.HostConfig.Memory}}' <container_name>
```

cgroup v2 可以查看：

```bash
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.events
```

如果 `memory.events` 里的 `oom_kill` 增加，就说明容器触发过内存限制。cgroup v1 的文件路径不同，需要在对应的 `memory` 控制组目录下查看 `memory.usage_in_bytes` 和 `memory.limit_in_bytes`。

容器限制是 2 GB 时，不能简单设置 `-Xmx2g`。除了堆以外，线程栈、Metaspace 和堆外内存都要留空间。JDK 8 不同更新版本对容器感知能力也不同，必须核对实际 JVM 参数，而不是默认它会自动识别限制。

## 7. 几种典型根因

### 7.1 无界缓存

```java
// 错误示例：缓存没有数量限制和过期策略
private static final Map<String, Object> CACHE = new ConcurrentHashMap<>();
```

修复时应该使用有最大容量、过期时间和命中率监控的缓存实现，同时确认缓存键是否真的会复用。

### 7.2 线程池队列无限增长

`LinkedBlockingQueue` 默认容量接近无限。下游变慢时，任务可能不断堆积，占用大量对象。线程池必须设置有界队列、拒绝策略和队列长度告警。

### 7.3 一次性加载大结果集

导出、报表和批处理如果一次查询几十万行并全部放入 List，很容易制造瞬时大对象。可以改为游标、分页或流式处理，并限制单次任务的数据范围。

### 7.4 线程泄漏

定时任务反复创建线程池却不关闭，或者每个请求都创建线程，RSS 会随着线程栈增长。除了堆分析，还要长期监控进程线程数。

## 8. 应急处理不要踩这些坑

1. 不要看到 `free` 很低就执行 `drop_caches`，它可能导致后续大量磁盘读取。
2. 不要在磁盘快满时直接导出大 Heap Dump。
3. 不要在业务高峰对大堆执行高停顿风险的 `jmap -histo:live`。
4. 不要只增加 `-Xmx`，否则可能把 JVM OOM 变成整机或容器 OOM Kill。
5. 不要重启以后就结束排查，至少保留内核日志、GC 日志和监控时间点。

## 9. 排查清单

```text
整机：free、vmstat、ps、内核 OOM 日志
容器：docker stats、cgroup memory.current/memory.max/memory.events
JVM 堆：VM.flags、GC.heap_info、jstat、Heap Dump
堆外：/proc/PID/status、线程数、NMT、Direct Buffer
业务：缓存容量、线程池队列、批处理数据量、对象生命周期
```

内存排查不能只看一个瞬时数值，最有价值的是趋势：什么时间开始增长、发布前后是否变化、GC 后能不能回落、增长速度是否与流量一致。把这些时间线对齐，根因通常会清晰很多。
