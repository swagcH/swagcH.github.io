---
title: Docker基础部署，Docker Compose实践
date: 2022-08-14 17:42:26
tags: [Docker, Docker Compose, 容器化, 部署]
category: 架构成长
---

> 这篇做一个可以实际运行的部署练习：把 JDK 8 的 Spring Boot 应用构建成镜像，再使用 Docker Compose 启动应用、MySQL 和 Redis。重点不只是 `up -d`，还包括网络、健康检查、数据卷、日志和排障。

## 0. 最终目录

```text
demo-app
├── Dockerfile
├── .dockerignore
├── compose.yaml
├── .env.example
├── pom.xml
└── src
```

Docker Compose V2 推荐使用 `docker compose` 命令。旧环境可能仍然使用独立的 `docker-compose`。新版 Compose 文件可以省略顶层 `version`，旧项目中的 `version: "3.8"` 仍然常见，但不要把它和 Docker Engine 版本混为一谈。

## 1. 先理解四个对象

```text
Image：只读构建产物
Container：镜像运行后的进程和隔离环境
Network：容器之间的通信空间和 DNS
Volume：独立于容器生命周期的数据存储
```

容器不是轻量虚拟机。一个容器通常运行一个主要前台进程，进程退出，容器也会停止。容器内写入层可以保存临时文件，但删除容器后数据会消失，因此 MySQL 数据必须放在 Volume。

## 2. 为 Spring Boot 编写 Dockerfile

使用多阶段构建，第一阶段通过 Maven 打包，第二阶段只保留 JRE 和 Jar：

```dockerfile
FROM maven:3.8.8-eclipse-temurin-8 AS build

WORKDIR /workspace
COPY pom.xml ./
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:8-jre

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app app

WORKDIR /app
COPY --from=build /workspace/target/*.jar /app/app.jar

USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

这里有几个目的：

1. 构建环境和运行环境分开，运行镜像不包含 Maven 缓存和源代码。
2. 先复制 `pom.xml` 下载依赖，依赖不变时可以复用构建缓存。
3. 应用使用非 root 用户运行。
4. Jar 名称在镜像中固定为 `app.jar`，启动命令不依赖版本号。

基础镜像标签应该固定到经过验证的版本或 digest。示例标签用于说明结构，正式项目需要经过漏洞扫描和升级流程。

如果项目打包目录里可能有多个 Jar，`target/*.jar` 会匹配多个文件并导致构建失败。可以在 Maven 中固定 `finalName`，或者在构建脚本中明确选择可执行 Jar。

## 3. 减少无关构建上下文

`.dockerignore`：

```text
.git
.idea
target
logs
*.iml
README.md
compose.yaml
.env
```

Docker 构建会把上下文发送给 daemon。忽略 `target`、日志和本地环境文件可以提升速度，也能避免把密钥误打进镜像层。

构建并检查：

```bash
docker build -t demo-app:1.0.0 .
docker image inspect demo-app:1.0.0
docker history demo-app:1.0.0
```

不要只使用永久不变的 `latest`。至少同时保留不可变版本标签，方便回滚和追踪实际部署内容。

## 4. 编写 Compose

`.env.example` 只保留变量名和示例值，真实 `.env` 不提交：

```text
MYSQL_ROOT_PASSWORD=change-me
MYSQL_APP_PASSWORD=change-me
```

`compose.yaml`：

```yaml
services:
  mysql:
    image: mysql:8.0.36
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: demo
      MYSQL_USER: demo
      MYSQL_PASSWORD: ${MYSQL_APP_PASSWORD}
      TZ: Asia/Shanghai
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -p$${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    restart: unless-stopped

  redis:
    image: redis:6.2.14
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  app:
    image: demo-app:1.0.0
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/demo?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
      SPRING_DATASOURCE_USERNAME: demo
      SPRING_DATASOURCE_PASSWORD: ${MYSQL_APP_PASSWORD}
      SPRING_REDIS_HOST: redis
      SPRING_REDIS_PORT: 6379
      JAVA_TOOL_OPTIONS: -Xms256m -Xmx512m -XX:+ExitOnOutOfMemoryError
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "8080:8080"
    logging:
      driver: json-file
      options:
        max-size: 100m
        max-file: "5"
    restart: unless-stopped

volumes:
  mysql-data:
  redis-data:
```

示例没有把 MySQL 和 Redis 端口映射到宿主机，因为只有应用容器需要访问它们。减少端口暴露可以降低误访问风险。本地确实需要客户端连接时，再显式增加 `127.0.0.1:3306:3306`，避免监听所有网卡。

`depends_on` 的健康条件需要较新的 Compose 实现。旧版本可能只保证启动顺序，不等待服务真正可用，因此应用自身仍应有有限重试和明确的启动失败日志。

`-XX:+ExitOnOutOfMemoryError` 需要较新的 JDK 8 update，使用前要通过实际基础镜像验证。JVM 堆也不能等于容器全部内存，还要给 Metaspace、线程栈和堆外内存留空间。

## 5. 为什么容器里不能用 localhost

Compose 默认会创建一个项目网络，服务名自动成为 DNS 名称：

```text
app -> mysql:3306
app -> redis:6379
```

应用容器里的 `localhost` 只指向应用容器自己，不是宿主机，也不是 MySQL 容器。因此：

```yaml
SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/demo
SPRING_REDIS_HOST: redis
```

从应用容器检查 DNS 和端口：

```bash
docker compose exec app getent hosts mysql
docker run --rm --network demo-app_default busybox:1.36.1 nc -zv mysql 3306
```

基础镜像不一定包含 `curl`、`ping` 或 `nc`。调试时不要为了一个命令永久把大量工具装进运行镜像，可以临时启动同网络的诊断容器。示例网络名会随 Compose 项目名变化，应先通过 `docker network ls` 确认。

## 6. 启动与验证

```bash
docker compose config
docker compose up -d
docker compose ps
docker compose logs --tail=200 app
```

`docker compose config` 会解析变量并校验最终配置。输出可能包含展开后的密码，不要把完整结果贴到公开工单或日志平台。

验证健康接口：

```bash
curl http://127.0.0.1:8080/actuator/health
```

再查看容器资源：

```bash
docker stats --no-stream
docker compose top
```

启动成功的标准不是三个容器都显示 `Up`，而是应用健康检查正常，数据库连接可用，Redis 读写成功，并且日志没有持续重连。

## 7. 验证数据卷

先写入一条测试数据，再重建容器：

```bash
docker compose down
docker compose up -d
```

不带 `-v` 时，命名 Volume 会保留。确认数据仍存在以后，再检查卷位置：

```bash
docker volume ls
docker volume inspect demo-app_mysql-data
```

下面的命令会同时删除容器和声明的 Volume，数据不可恢复：

```bash
docker compose down -v
```

只能在确认数据可删除的开发环境使用。生产数据还需要独立备份，Volume 本身不是备份。

## 8. 五个常见故障

### 8.1 容器反复重启

```bash
docker compose ps
APP_CONTAINER=$(docker compose ps -q app)
docker inspect --format '{{.State.ExitCode}} {{.State.Error}}' "$APP_CONTAINER"
docker compose logs --tail=300 app
```

先看退出码和最后一段日志。`restart: unless-stopped` 会不断拉起失败进程，容易让真正的首次异常滚出日志窗口。

### 8.2 MySQL 一直不健康

检查密码变量是否正确展开、数据目录权限、旧数据卷与新版本是否兼容。MySQL 初始化只在空数据目录执行，修改环境变量不会自动修改已有数据库用户密码。

### 8.3 应用能解析服务名但连不上

检查服务是否在同一个网络、目标进程是否监听 `0.0.0.0`，以及端口使用的是容器端口还是宿主机映射端口。

```bash
docker network ls
docker network inspect demo-app_default
```

### 8.4 磁盘被日志写满

Docker `json-file` 默认可能持续增长。Compose 中已经限制单文件和数量，仍要监控 Docker 根目录和应用自身文件日志，避免两套日志重复写盘。

### 8.5 镜像在另一台机器无法运行

确认 CPU 架构、镜像是否成功推送、私有仓库认证和配置文件来源。Apple Silicon 本地构建的镜像部署到 x86 服务器时，尤其要检查目标平台。

```bash
docker image inspect demo-app:1.0.0 --format '{{.Architecture}}/{{.Os}}'
```

## 9. 配置和密钥

Compose 环境变量适合本地练习，但生产环境不能把密码直接写进仓库。至少做到：

- `.env` 加入 `.gitignore`。
- 使用独立的应用数据库账号，不使用 root。
- 密钥通过受控平台、挂载文件或 Secrets 管理。
- 日志禁止打印数据库 URL 中的密码和 Token。
- 配置变更有审计和回滚版本。

Docker 镜像应当只包含通用应用，不把某个环境的 `application-prod.yml` 和密钥烘焙进去。

## 10. Compose 的适用边界

Compose 很适合本地开发、自动化测试和单机多容器部署。它能把依赖关系固化成代码，也方便复现环境。

生产环境还需要考虑：

```text
多机调度和节点故障
滚动升级与自动回滚
集中式 Secrets
服务发现和负载均衡
资源限制与配额
日志、指标和告警
数据备份与恢复
```

这些问题不是再写几行 Compose 就能全部解决的。是否进入 Kubernetes 等平台，要根据服务规模和运维能力决定。

## 收尾命令

```bash
# 查看最终状态
docker compose ps

# 查看最近日志
docker compose logs --tail=100 app mysql redis

# 停止但保留数据卷
docker compose down
```

这次实践真正解决的不是“会用 Docker 命令”，而是把构建、网络、配置、依赖和数据生命周期写成了一个可以重复执行的环境。能够在另一台干净机器上用同一份配置启动并验证，才是容器化带来的环境一致性。
