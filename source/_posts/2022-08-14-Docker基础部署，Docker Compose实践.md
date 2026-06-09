---
title: Docker基础部署，Docker Compose实践
date: 2022-08-14 17:42:26
tags: [Docker, Docker Compose, 容器化, 部署]
category: 架构成长
---

# 背景

为什么会研究这个问题

在多服务项目越来越多之后，本地环境和测试环境的差异变得明显。以前部署一个 Java 应用只需要 JDK、配置文件和启动脚本，现在还要依赖 MySQL、Redis、RabbitMQ、Nginx 等组件。为了减少环境搭建成本，我开始研究 Docker 和 Docker Compose。

# 问题

遇到了什么情况

最开始遇到的问题是容器能启动，但服务之间连不上。比如应用容器访问 localhost:3306，结果连接的是容器内部而不是宿主机；数据卷没有挂载，容器删除后数据也没了；端口映射冲突，导致服务无法启动。这些问题说明，Docker 部署不能只记命令，要理解镜像、容器、网络、数据卷之间的关系。

# 分析

排查过程

```text
Docker 关键概念：
image     静态模板
container 运行实例
volume    数据持久化
network   容器通信
```

```bash
docker ps
docker logs app
docker exec -it app sh
docker network ls
docker volume ls
```

Docker Compose 的价值在于把多个容器的启动方式写成声明式配置，避免每次手写一堆 docker run 命令。

# 解决方案

具体操作

```yaml
version: "3.8"
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql

  redis:
    image: redis:6.2
    ports:
      - "6379:6379"

  app:
    image: demo-app:1.0
    depends_on:
      - mysql
      - redis
    ports:
      - "8080:8080"

volumes:
  mysql-data:
```

```bash
docker compose up -d
docker compose logs -f app
docker compose down
```


# 总结

经验沉淀

Docker 带来的最大收益是环境一致性。Docker Compose 则进一步把多组件依赖固化下来。我的经验是：开发环境可以用 Compose 提效，但生产环境还需要考虑镜像版本、日志收集、健康检查、资源限制和安全配置。
