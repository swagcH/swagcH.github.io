---
title: Linux服务器CPU飙高问题定位
date: 2023-06-18 14:10:00
updated: 2023-06-19 20:45:00
tags:
  - Linux
  - CPU
  - Java
  - 故障排查
categories: 故障排查
---

> 写在前面：看到 CPU 100% 以后，最直接的反应往往是重启服务。重启确实可能恢复业务，但也会把最有价值的线程现场一起清掉。只要业务还扛得住，最好先用几分钟把证据留下来。

服务器 CPU 飙高的排查路径并不复杂：系统、进程、线程、调用栈，一层一层往下缩小范围。真正容易踩坑的是把 `load average` 当成 CPU 使用率，或者找到高 CPU 进程以后就直接下结论。

## 1. 先确认是不是 CPU 问题

第一步先看负载、CPU 分类和运行队列：

```bash
uptime
top -c
vmstat 1 5
mpstat -P ALL 1 5
```

重点关注这些指标：

```text
us：用户态 CPU，Java 业务代码通常体现在这里
sy：内核态 CPU，频繁系统调用、网络或驱动问题可能升高
wa：等待磁盘 IO 的时间，不等于 CPU 真正在计算
st：虚拟机被宿主机抢走的 CPU 时间
r ：正在运行或等待 CPU 的任务数量
b ：不可中断睡眠的任务数量，常见于 IO 等待
```

`load average` 表示一段时间内可运行和不可中断任务的平均数量，不是 CPU 百分比。8 核机器负载为 8 和 2 核机器负载为 8，严重程度完全不同。

例如下面这种情况，CPU 真正忙在用户态：

```text
%Cpu(s): 92.1 us, 5.3 sy, 0.0 ni, 1.8 id, 0.3 wa, 0.0 hi, 0.5 si, 0.0 st
```

如果 `wa` 很高而 `us` 不高，方向应该切到磁盘 IO，不要继续只盯着 Java 线程。

## 2. 找到最消耗 CPU 的进程

```bash
ps -eo pid,ppid,user,%cpu,%mem,stat,lstart,cmd --sort=-%cpu | head -20
```

需要持续观察时可以使用 `pidstat`：

```bash
pidstat -u -p ALL 1 5
```

假设最终定位到 Java 进程 PID 为 `21847`：

```bash
PID=21847
ps -p $PID -o pid,ppid,user,%cpu,%mem,etime,cmd
```

这时先记录进程启动时间、CPU、内存和完整启动命令，确认是不是刚发布的新版本，或者 JVM 参数是否发生变化。

## 3. 从进程继续定位到线程

Java 进程内部有很多线程，需要找到具体是哪一个线程在消耗 CPU：

```bash
top -H -p $PID
```

也可以直接输出线程列表：

```bash
ps -Lp $PID -o pid,tid,psr,pcpu,stat,comm --sort=-pcpu | head -20
```

假设高 CPU 线程的十进制 TID 是 `21936`。`jstack` 中的线程编号 `nid` 使用十六进制，因此先转换：

```bash
TID=21936
printf '0x%x\n' $TID
```

输出：

```text
0x55b0
```

## 4. 使用 jstack 对应 Java 调用栈

连续抓三次线程快照，比只看一次更可靠：

```bash
jstack $PID > /tmp/java-$PID-1.jstack
sleep 5
jstack $PID > /tmp/java-$PID-2.jstack
sleep 5
jstack $PID > /tmp/java-$PID-3.jstack
```

再根据十六进制线程号查找：

```bash
grep -n 'nid=0x55b0' -A 40 /tmp/java-$PID-1.jstack
```

执行 `jstack` 的用户最好与 Java 进程启动用户一致，并确认使用兼容的 JDK 工具。容器环境还要注意 PID 命名空间，宿主机看到的 PID 和容器内部可能不同。

一个典型的高 CPU 调用栈可能是这样：

```text
"retry-worker-3" #86 prio=5 os_prio=0 tid=0x... nid=0x55b0 runnable
   java.lang.Thread.State: RUNNABLE
        at com.example.order.RetryService.retry(RetryService.java:127)
        at com.example.order.RetryService.run(RetryService.java:91)
```

如果连续三次都停在同一段业务代码，基本可以确定热点位置。示例中的问题是失败重试没有退避时间，在下游不可用时进入了快速循环：

```java
// 错误示例：失败后立即进入下一次循环，会持续占用 CPU
while (!success) {
    success = callDownstream();
}
```

修复时要增加最大次数、退避时间和可观测日志：

```java
int maxAttempts = 3;
for (int attempt = 1; attempt <= maxAttempts; attempt++) {
    if (callDownstream()) {
        return;
    }
    // 退避时间需要结合业务超时预算设置
    TimeUnit.MILLISECONDS.sleep(attempt * 200L);
}
throw new IllegalStateException("下游调用连续失败");
```

## 5. 判断是不是 GC 导致 CPU 升高

如果高 CPU 线程主要是 GC 线程，继续看垃圾回收情况：

```bash
jstat -gcutil $PID 1000 10
```

重点观察：

1. `YGC`、`FGC` 是否快速增长。
2. `FGCT` 是否持续增加。
3. 老年代使用率是否长期接近 100%。
4. 每次 GC 后内存是否能明显下降。

频繁 Full GC 只是现象，后面还要分析对象分配、堆大小、缓存和内存泄漏。不要看到 GC 高就先改大堆内存，堆变大以后单次 Full GC 可能更慢。

## 6. 非 Java 进程怎么排查

如果热点不是 Java，可以继续使用下面的工具：

```bash
# 查看进程的 CPU、上下文切换和调度情况
pidstat -u -w -p $PID 1 5

# 有权限且服务器安装了 perf 时，查看热点函数
perf top -p $PID
```

`perf` 可能需要 root 权限和内核符号支持，生产环境使用前要确认安全规范。对于 Nginx、压缩程序、日志采集器等进程，热点函数通常能帮助判断是加密、压缩、正则还是网络处理造成的消耗。

## 7. 几种容易误判的情况

### 7.1 单核打满

在多核服务器上，一个死循环可能只打满一个核心。整机 CPU 看起来只有十几个百分点，但对应接口已经异常，因此要用 `mpstat -P ALL` 查看每个核心。

### 7.2 iowait 很高

`top` 里负载很高，并不代表 CPU 计算繁忙。如果大量线程处于 `D` 状态且 `wa` 很高，应该检查磁盘、网络存储和文件系统。

### 7.3 steal 很高

虚拟机的 `st` 持续升高，说明宿主机资源竞争严重。应用代码可能没有变化，这时需要结合云平台监控确认宿主机和实例规格。

### 7.4 BLOCKED 线程很多

大量线程等待锁会造成接口慢，但等待中的线程通常不消耗大量 CPU。真正的 CPU 热点可能是持锁线程，或者另一个不断自旋的线程。

## 8. 应急处理顺序

1. 确认影响范围，必要时先限流、摘流量或扩容。
2. 保存 `top`、`pidstat`、线程列表和至少三份 `jstack`。
3. 判断是否与刚发布版本、流量突增或下游异常有关。
4. 有明确回退版本时优先回滚，不要在线上临时改复杂代码。
5. 只有业务已经无法承受时才直接重启或终止进程。
6. 恢复后补齐监控、告警和压测用例。

## 9. 最后的排查清单

```text
系统层：uptime、top、vmstat、mpstat
进程层：ps、pidstat
线程层：top -H、ps -L
Java 栈：jstack，连续抓取三次
GC 情况：jstat -gcutil
非 Java 热点：perf top
```

CPU 问题定位的关键不是记住多少命令，而是始终保留“系统到进程、进程到线程、线程到代码”的证据链。这样即使重启恢复了服务，后面也还有东西可以复盘。
