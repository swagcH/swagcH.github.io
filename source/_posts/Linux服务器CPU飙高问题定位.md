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

> 写在前面：看到 CPU 100% 后，最直接的反应往往是重启服务。重启可能恢复业务，也会清掉最有价值的线程现场。只要系统还允许取证，先用几分钟回答“哪一种 CPU、哪个进程、哪个线程、哪段调用栈”，再决定限流、回滚还是重启。

这篇按分支决策树组织。目标不是把所有 Linux 命令跑一遍，而是每一步都根据上一步证据选择下一条路。

## 总决策树

```text
CPU 告警
  |
  +-- 告警仍然存在吗？实例和时间对得上吗？
  |
  +-- us 高 -> 用户态计算
  |            -> 进程 -> 线程 -> JVM 栈 / 火焰图
  |
  +-- sy 高 -> 内核态消耗
  |            -> 系统调用、网络、中断、上下文切换
  |
  +-- wa 高 -> CPU 在等 IO
  |            -> 磁盘、网络存储、不可中断任务
  |
  +-- st 高 -> 虚拟机 CPU 被宿主机抢占
  |            -> 宿主机或云平台
  |
  +-- load 高但 CPU 不高
  |            -> 运行队列或 D 状态任务
  |
  +-- 容器慢但宿主机不高
               -> CPU quota 与 throttling
```

“负载高”不等于“CPU 正在计算”。先分类，后面的命令才有意义。

## 前三分钟：保存一份系统快照

先记录时间、主机、负载和 CPU 分类：

```bash
date -Is
hostname
uptime
top -b -n 1
vmstat 1 5
mpstat -P ALL 1 5
```

生产输出可能包含命令行参数和内部信息，应由授权人员保存到受控位置。不要把完整 `top -c` 结果直接贴到公开渠道。

`vmstat` 与 `mpstat` 重点字段：

| 字段 | 含义 | 常见方向 |
| --- | --- | --- |
| `us` | 用户态 CPU | Java 业务、序列化、压缩、计算 |
| `sy` | 内核态 CPU | 系统调用、网络、中断、调度 |
| `wa` | IO 等待 | 磁盘或网络存储延迟 |
| `st` | 虚拟化偷取 | 宿主机资源竞争 |
| `r` | 运行或等待 CPU 的任务 | 持续高于核数表示排队 |
| `b` | 不可中断睡眠任务 | 常见于 IO 等待 |

还要看每个逻辑 CPU。32 核机器总体只有 4%，可能是一个单线程把一核打满；总体平均值会把热点稀释。

## 分支 A：us 高，找到真正消耗 CPU 的进程

```bash
pidstat -u 1 5
ps -eo pid,ppid,%cpu,%mem,etime,cmd --sort=-%cpu | head -20
```

确认 PID 后先记录：

```bash
readlink -f /proc/<pid>/exe
tr '\0' ' ' < /proc/<pid>/cmdline
cat /proc/<pid>/status
```

命令行可能包含密码或 Token，查看和保存时要脱敏。

容器环境有两层限制。宿主机 PID 与容器 PID 可能不同，先通过容器平台确认 Pod、容器和节点：

```bash
kubectl top pod -n <namespace>
kubectl describe pod <pod-name> -n <namespace>
```

这些命令依赖集群权限。不要为了排查临时扩大账号权限，也不要仅凭 Pod 名猜宿主机进程。

## 从 Java 进程缩小到线程

查看进程内线程：

```bash
top -H -p <pid>
pidstat -t -p <pid> 1 5
```

记录连续多个采样中都高 CPU 的线程 ID，例如十进制 TID `23741`。JVM dump 中的 `nid` 常使用十六进制：

```bash
printf '%x\n' 23741
```

得到 `5cbd` 后抓三次线程现场：

```bash
jstack -l <pid> > /tmp/cpu-1.log
jstack -l <pid> > /tmp/cpu-2.log
jstack -l <pid> > /tmp/cpu-3.log
rg -n -i 'nid=0x5cbd' /tmp/cpu-*.log
```

三次采样间隔数秒。如果同一高 CPU 线程始终停在相同业务栈，更像死循环或热点计算；如果调用栈持续变化，可能只是正常繁忙。

一个典型热点：

```text
"http-nio-8080-exec-42" RUNNABLE
  at java.util.regex.Pattern$Curly.match(Pattern.java:...)
  at java.util.regex.Matcher.search(Matcher.java:...)
  at com.example.rule.RuleMatcher.match(RuleMatcher.java:87)
  at com.example.order.OrderRuleService.calculate(OrderRuleService.java:132)
```

这只能说明采样时线程在正则匹配。还要对照请求量、traceId、最近变更和输入大小，确认是否由灾难性回溯或异常大文本触发。

## 如果高 CPU 线程是 GC

线程名和栈指向 GC 时，继续收集：

```bash
jstat -gcutil <pid> 1000 10
jcmd <pid> GC.heap_info
jcmd <pid> VM.flags
```

观察：

```text
Young GC 是否过于频繁
Full GC 次数是否持续增加
Old 区在 GC 后是否明显下降
分配速率是否突然变化
GC 日志中的停顿和原因
```

常见分支：

- Old 区回收后不下降：怀疑对象长期持有或泄漏。
- Young GC 极频繁：分配速率过高、堆或新生代不匹配。
- Full GC 与元空间相关：动态类加载或类加载器泄漏。
- 显式 GC：检查代码或组件是否调用 `System.gc()`。

不要在故障现场先调大堆。更大的堆可能延后 OOM，也可能增加 Full GC 停顿。先保存 GC 日志、对象分布和容量边界。

## 如果栈一直变化，使用采样剖析

线程 dump 是离散快照，热点分散时不够。服务器已安装并经过评估时，可以使用 `async-profiler` 或 `perf` 做短时间采样：

```bash
perf top -p <pid>
perf record -F 99 -p <pid> -g -- sleep 30
```

`perf` 需要内核支持和相应权限，采样也有性能开销。生产使用前应走诊断授权，限制频率和时间，并在异常时立即停止。

火焰图回答一段时间内 CPU 样本集中在哪里，比单次 `jstack` 更适合：

- JSON 序列化。
- 压缩和加密。
- 正则表达式。
- 大集合排序。
- 频繁对象分配。
- 第三方库内部计算。

“栈顶出现某方法”不等于它就是根因，要看累计样本宽度和调用路径。

## 分支 B：sy 高，检查调度和系统调用

`sy` 高时先看上下文切换：

```bash
pidstat -w -p <pid> 1 5
vmstat 1 5
```

如果每秒上下文切换异常高，可能是：

- 线程数过多。
- 大量短任务频繁唤醒。
- 锁竞争。
- 网络包和中断激增。
- 高频文件或系统调用。

查看线程数量：

```bash
ls /proc/<pid>/task | wc -l
cat /proc/<pid>/limits
```

线程多不一定是问题，但几千线程加上高切换、低业务吞吐就是强信号。

系统调用明细可以用 `strace` 短时采样，但附加到生产进程可能影响性能并输出敏感参数。只有在其他证据不足、经过授权时才使用，且限制时间和输出范围。

网络侧还可以检查软中断是否集中在单核、连接数是否异常、是否发生重传。此时通常需要系统或网络负责人共同判断，不应只在 Java 代码中找答案。

## 分支 C：wa 高，不要继续调 JVM CPU

`wa` 高表示 CPU 时间花在等待 IO。继续看：

```bash
iostat -xz 1 5
pidstat -d 1 5
ps -eo state,pid,ppid,wchan:32,cmd | awk '$1 ~ /^D/'
```

关注设备延迟、队列、利用率和哪个进程在读写。常见来源：

```text
日志突增
数据库刷盘或慢查询
容器镜像和文件层
网络块存储延迟
大文件压缩或备份
内存不足后的频繁 swap
```

`load average` 会计入不可中断睡眠任务，因此 IO 卡住时负载可能很高，CPU 却并不忙。应转入磁盘和 IO 分支，而不是增加业务线程。

## 分支 D：st 高，问题可能不在虚拟机内

`st` 表示虚拟 CPU 想运行，但宿主机没有分配时间。应用进程看起来繁忙、响应变慢，虚拟机内部却找不到对应计算。

需要：

```text
确认 steal 是否持续且跨实例
对比同宿主机其他虚拟机
查看云平台 CPU credit 或宿主机事件
联系基础设施团队迁移或扩容
```

在虚拟机内重启 Java 通常不会解决宿主机争抢，反而会增加恢复成本。

## 分支 E：容器被 CPU 限流

容器设置 1 核额度时，即使宿主机有 32 核空闲，容器也可能被 CFS 限流。检查容器指标和 cgroup：

```bash
cat /sys/fs/cgroup/cpu.stat
cat /sys/fs/cgroup/cpu.max
```

cgroup v1 路径和字段不同，需要按运行环境确认。关键指标是限制周期、被限流次数和限流时间。

```text
usage 高 + throttled 高：额度不足或突发计算过强
usage 不高 + 应用慢：继续查 IO、锁、下游
宿主机不高 + 容器长期打满：不能用宿主机平均值否定问题
```

提高 CPU limit 前仍要确认代码是否有异常热点。扩容能缓解容量不足，不能合理化死循环。

## 如何选择应急动作

| 证据 | 优先动作 | 不建议 |
| --- | --- | --- |
| 新版本单一热点方法 | 限流、回滚、保存剖析 | 直接长期扩容 |
| 流量符合预期但容量不足 | 扩实例并排队优化 | 只增单机线程 |
| Full GC 持续 | 降低流量、保留堆证据 | 盲目调大 Xmx |
| sy 与切换异常高 | 控制线程、查锁与系统调用 | 只看业务栈 |
| wa 高 | 转查磁盘与存储 | 调 JVM CPU 参数 |
| st 高 | 联系宿主机/云平台 | 反复重启应用 |
| 容器 throttling | 优化热点或调整 quota | 看宿主机空闲就结束 |

当核心业务已不可用，可以在保存最小证据后执行摘流、回滚或重启。最小证据通常包括时间、系统快照、PID/TID、三份线程 dump、GC 摘要、版本和最近变更。

恢复动作必须由当班负责人授权，并先确认单实例退出不会让剩余节点过载。

## 修复后的验证

不能只看 CPU 从 100% 降下来：

```text
[ ] QPS 和输入规模与故障时可比
[ ] us/sy/wa/st 已回到各自基线
[ ] P95/P99 和错误率恢复
[ ] 热点线程或方法样本明显下降
[ ] GC、线程数和上下文切换正常
[ ] 容器 throttling 没有继续增长
[ ] 下游、数据库和 IO 没被转移压力
[ ] 限流、回滚或临时扩容有退出计划
```

CPU 排查的核心路径可以压缩成：

```text
确认告警 -> 区分 us/sy/wa/st -> 找进程
-> 找线程 -> 对应调用栈 -> 用时间样本验证
-> 选择与证据匹配的恢复动作 -> 复测整条链路
```

只要第一步分类正确，CPU 100% 就不再是一个笼统现象。它会逐渐变成一段热点代码、一组 GC、一项 IO 等待、一次容器限流，或者一个需要基础设施团队处理的宿主机问题。
