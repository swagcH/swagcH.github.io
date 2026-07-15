---
title: 服务器磁盘空间与IO异常定位
date: 2023-11-26 13:50:00
updated: 2023-11-27 22:05:00
tags:
  - Linux
  - 磁盘IO
  - 服务器运维
  - 故障排查
categories: 故障排查
---

> 写在前面：磁盘问题不只有“空间满了”。空间还有很多但文件创建失败，可能是 inode 用完；接口突然变慢但 CPU 不高，可能是 IO 等待；文件已经删除但空间不释放，可能是进程仍然占着文件句柄。

这篇把磁盘空间、inode 和 IO 延迟放在一条排查链路里。遇到告警时先判断是哪一类问题，再决定能不能清理文件，不要上来就对 `/var/log` 执行删除命令。

## 1. 先判断空间还是 inode

```bash
df -hT
df -ih
lsblk -f
```

三个命令分别回答：

1. 哪个文件系统的容量用完了。
2. 哪个文件系统的 inode 用完了。
3. 分区、文件系统类型和挂载点是什么。

典型空间告警：

```text
Filesystem     Type  Size  Used Avail Use% Mounted on
/dev/vda1      xfs    80G   77G  3.0G  97% /
```

典型 inode 告警：

```text
Filesystem     Inodes IUsed IFree IUse% Mounted on
/dev/vda1        40M   40M     0  100% /
```

inode 用完通常是产生了海量小文件，例如临时文件、会话文件、消息落盘或日志分片。此时 `du` 看到的总容量可能不大，但系统已经无法创建新文件。

## 2. 从挂载点向下找大目录

确认是根分区以后，使用 `-x` 限制在当前文件系统，避免把其他挂载盘也统计进去：

```bash
du -xhd1 / 2>/dev/null | sort -h
du -xhd1 /var 2>/dev/null | sort -h
du -xhd1 /var/log 2>/dev/null | sort -h
```

查找大文件时可以使用：

```bash
find /var -xdev -type f -size +1G -printf '%s %p\n' 2>/dev/null \
  | sort -nr \
  | head -20
```

`-printf` 是 GNU `find` 的能力，部分精简系统不支持。命令只用于定位，找到文件以后还要确认文件归属、写入进程和保留策略，不能根据大小直接删除。

如果 inode 用完，可以按目录统计文件数量：

```bash
find /var -xdev -type f -printf '%h\n' 2>/dev/null \
  | sort \
  | uniq -c \
  | sort -nr \
  | head -20
```

## 3. df 和 du 对不上怎么办

常见现象是 `df` 显示磁盘使用了 70 GB，`du` 加起来却只有 40 GB。一个高频原因是文件已经被删除，但进程仍然打开着文件描述符。

```bash
lsof +L1
```

输出中 `NLINK` 为 0 的文件已经从目录结构删除，但只要进程没有关闭句柄，空间就不会真正释放：

```text
COMMAND   PID USER   FD   TYPE DEVICE  SIZE/OFF NLINK NAME
java    18342 app   12w   REG  253,1 21474836480     0 /var/log/app.log (deleted)
```

最稳妥的处理方式是让应用正常重新打开日志文件，或者在可控窗口重启对应进程。直接清空 `/proc/<PID>/fd/<FD>` 指向的内容风险很高，可能破坏正在写入的数据，只能在确认文件用途并获得操作许可后作为应急方案。

这也是为什么删除正在写入的大日志以后，磁盘空间有时完全没有下降。日志轮转应该通知进程重新打开文件，而不是只执行 `rm`。

## 4. 空间没满，但接口还是很慢

先看系统是不是在等待 IO：

```bash
vmstat 1 5
iostat -xz 1 5
```

`iostat` 重点关注：

```text
r/s、w/s：每秒读写请求数
rkB/s、wkB/s：每秒读写数据量
await：IO 请求平均等待时间
aqu-sz：平均队列长度
%util：设备忙碌时间比例
```

机械盘上 `%util` 长期接近 100% 往往表示设备饱和，但在 SSD、NVMe 和云盘环境里，不能只靠 `%util` 判断性能上限。还要结合 `await`、队列长度、吞吐、IOPS 和云平台磁盘配额。

继续定位到进程：

```bash
pidstat -d -p ALL 1 5
```

服务器安装了 `iotop` 且具备权限时，可以查看实时 IO：

```bash
iotop -oPa
```

`-o` 只显示正在产生 IO 的进程，`-P` 按进程聚合，`-a` 显示累计值。短时间突发任务可能一闪而过，因此最好和监控上的告警时间点对齐。

## 5. 常见的磁盘占用来源

### 5.1 应用日志

检查日志目录和 systemd journal：

```bash
du -sh /var/log/* 2>/dev/null | sort -h
journalctl --disk-usage
```

应用日志需要同时限制单文件大小、保留天数和总文件数。只配置按天切割，如果某天流量异常，单个文件仍然可能把磁盘写满。

### 5.2 Docker 日志与镜像

```bash
docker system df
find /var/lib/docker/containers -name '*-json.log' -size +500M -print
```

不要直接删除 Docker 存储目录里的未知文件。镜像和构建缓存可以先通过 `docker system df` 确认，再使用明确的清理命令；正在运行容器的 JSON 日志应该通过日志驱动设置轮转。

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  }
}
```

修改 Docker daemon 配置会影响后续创建的容器，生产操作前要验证配置并安排维护窗口。

### 5.3 MySQL Binlog 和临时文件

```sql
SHOW BINARY LOGS;
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';
SHOW VARIABLES LIKE 'expire_logs_days';
```

MySQL 8.0 优先使用 `binlog_expire_logs_seconds`，MySQL 5.7 常见 `expire_logs_days`。清理 Binlog 要结合主从复制、备份和时间点恢复要求，不能直接从文件系统删除。应使用 MySQL 提供的过期策略或 `PURGE BINARY LOGS`，并确认从库已经消费。

### 5.4 临时文件和 Core Dump

```bash
du -xhd1 /tmp /var/tmp 2>/dev/null | sort -h
find / -xdev -type f -name 'core.*' -size +100M -print 2>/dev/null
```

临时目录也不能按文件年龄盲删，需要确认是否仍被运行中的任务使用。Core Dump 可能是定位崩溃的唯一证据，转移或分析后再按保留策略清理。

## 6. 使用 logrotate 控制日志

一个基础配置示例：

```text
/var/log/myapp/*.log {
    daily
    rotate 14
    maxsize 200M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` 不需要应用重新打开文件，但复制和截断之间可能丢少量日志，大文件复制时也会产生额外 IO。更推荐应用支持滚动日志，或者在 `postrotate` 中发送信号让进程重新打开文件。具体方式要根据应用日志框架选择。

配置后先做调试检查：

```bash
logrotate -d /etc/logrotate.d/myapp
```

`-d` 只输出调试信息，不真正轮转。确认结果以后再交给系统定时任务执行。

## 7. 应急清理的顺序

1. 确认是容量、inode 还是 IO 性能问题。
2. 找出增长最快的目录和对应写入进程。
3. 优先清理明确可再生、已过期且没有被占用的文件。
4. 需要删除业务文件时，先确认备份和恢复要求。
5. 清理后再次检查 `df -h`、`df -i` 和应用状态。
6. 如果空间仍未释放，使用 `lsof +L1` 检查已删除文件句柄。
7. 恢复后补上轮转、容量告警和增长趋势监控。

## 8. 排查清单

```text
容量：df -hT、du -xhd1、find 大文件
inode：df -ih、按目录统计文件数量
删除未释放：lsof +L1
IO 延迟：vmstat、iostat -xz
进程 IO：pidstat -d、iotop
常见来源：应用日志、Docker、Binlog、临时文件、Core Dump
```

磁盘告警处理完以后，最好不要只把阈值从 80% 改到 90%。真正有效的复盘是找到增长来源，为它设置保留上限，并保证告警能在磁盘还有足够处理空间时提前触发。
