---
title: Spring IOC理解
date: 2019-06-08 21:05:49
tags: [Spring, IOC, DI, Bean]
categories: Spring
keywords: Spring IOC理解, 依赖注入, Bean生命周期, Spring容器, Java后端框架
cover: /images/posts/2019/spring-ioc-cover.svg
---

![Spring IOC理解封面图](/images/posts/2019/spring-ioc-cover.svg)
*配图说明：Spring IOC理解的技术主题封面，采用本地 SVG 静态资源，避免外部图片加载失败。*

# 背景

学习 Spring 的第一道坎就是 IOC，刚开始觉得抽象，后来才明白它是在帮我们管理对象。

2019 年对我来说和 2018 年明显不一样。2018 年更多是在补 Java 基础，到了 2019 年，我开始把零散知识往项目里放。很多以前看起来懂了的概念，只要一放进真实项目流程里，马上就会暴露问题。

这篇文章记录的是我在 2019-06 前后学习和实践 **Spring IOC理解** 时的理解。内容不会写得像官方文档，更像是一份踩坑记录：当时为什么学、遇到了哪些问题、怎么排查，最后沉淀出哪些可以复用的经验。

![Spring IOC理解流程图](/images/posts/2019/spring-ioc-1.svg)
*配图说明：Spring IOC理解相关流程与项目实践位置示意图。*

# 问题

刚开始实践时，我主要卡在下面几个点：

1. 为什么对象不自己 new 了
2. XML 配置 Bean 很容易写错
3. 依赖注入和控制反转概念抽象

这些问题单独看都不算复杂，但放在项目里就很容易连锁反应。比如配置错了，表面上看到的是页面打不开，实际原因可能是路径、依赖、运行环境或者请求流程中的某个环节出了问题。

# 分析

IOC 的重点是对象创建权从业务代码转移到了 Spring 容器，DI 是容器把依赖关系装配进去的过程。

我后来发现，学项目实践类技术时，不能只背 API。更重要的是把它放到一条完整链路里看：

```text
需求 -> 编码 -> 配置 -> 构建 -> 运行 -> 调试 -> 部署 -> 复盘
```

只要能说清楚它在这条链路里的位置，就不会完全靠记忆去使用。

![Spring IOC理解排查思路图](/images/posts/2019/spring-ioc-2.svg)
*配图说明：围绕 Spring IOC理解 的常见问题排查路径。*

# 解决方案

我的处理方式是先把最小可运行例子跑通，再逐步放到项目中验证。下面是当时整理下来的关键操作和代码片段。

```xml
<bean id="userRepository" class="com.demo.repository.UserRepository" />
<bean id="userService" class="com.demo.service.UserService">
  <property name="userRepository" ref="userRepository" />
</bean>
```

```java
public class UserService {
    private UserRepository userRepository;

    public void setUserRepository(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
}
```

实践过程中我还给自己定了一个小规则：每次遇到问题，不只记录最终命令，还要记录“为什么这么做”。否则下次换一个环境，很容易又从头查一遍。

# 总结

这次学习给我的最大感受是：**项目实践里的知识点，真正难的不是单个语法，而是上下文。**

对 Spring IOC理解 的理解，我最后沉淀成几条经验：

- 先理解它解决什么问题，再记具体用法；
- 先跑通最小 Demo，再接入完整项目；
- 配置类问题要从路径、依赖、版本、环境四个方向排查；
- 代码示例要自己敲一遍，复制能跑不代表真的理解；
- 每次踩坑最好留下记录，后面会节省大量时间。

2019 年的学习明显比 2018 年更贴近真实开发。很多概念，比如 Servlet、Spring、MyBatis、接口设计、权限管理，都是在一次次“跑不起来”和“终于跑通了”的过程中慢慢理解的。
