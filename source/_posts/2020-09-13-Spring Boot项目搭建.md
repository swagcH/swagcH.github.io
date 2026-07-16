---
title: Spring Boot项目搭建
date: 2020-09-13 20:17:04
tags: [Spring Boot, 项目搭建, 自动配置, 后端开发]
categories: Spring Boot
keywords: Spring Boot项目搭建, Spring Boot入门, 自动配置, 后端项目脚手架, Java开发
cover: /images/posts/2020/spring-boot-setup-cover.svg
---

![Spring Boot项目搭建封面图](/images/posts/2020/spring-boot-setup-cover.svg)

用 Spring Initializr 生成一个工程只需要几分钟，但“能启动”和“能交付”之间还隔着配置、异常、日志、测试、监控和构建规则。早期项目最容易留下的债，往往不是业务代码，而是大家在没有约定的骨架上各写一套。

这次不追求搭一个万能脚手架，只从一个订单查询接口出发，把空工程补到可以进入团队开发的最小状态。示例统一基于 Spring Boot 2.x 和 JDK 8。

## 先定义最小交付边界

开始引入依赖前，先写清楚本期需要什么：

```text
需要：
- HTTP JSON 接口
- 参数校验与统一错误响应
- MySQL 访问和事务
- 分环境配置
- 健康检查、日志和自动测试
- Maven 可重复构建

暂时不需要：
- 分布式事务
- 配置中心
- 消息队列
- 通用代码生成平台
- 抽象所有未来业务
```

边界能防止“刚创建项目就先封装一切”。没有第二个真实用例之前，很多所谓公共能力只是猜测。

## 建立可控的 Maven 依赖

`pom.xml` 中只放当前需要的 Starter，并明确 Java 版本：

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.3.4.RELEASE</version>
    <relativePath/>
</parent>

<properties>
    <java.version>1.8</java.version>
</properties>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-jdbc</artifactId>
    </dependency>
    <dependency>
        <groupId>mysql</groupId>
        <artifactId>mysql-connector-java</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

依赖版本优先交给 Spring Boot 的依赖管理，不在每个依赖上单独指定版本。额外覆盖版本时，要在提交说明里写清兼容或安全原因。

构建基线先验证：

```bash
mvn -v
mvn clean verify
mvn dependency:tree
```

团队使用 IDEA 自带 Maven 时，也要确保 IDEA 的 JDK、Maven Runner JDK 和项目 `java.version` 一致，避免 IDE 能运行、命令行却失败。

## 包结构围绕业务组织

我不再把所有 Controller、Service、Mapper 分别堆进三个巨型目录，而是先按业务模块分组：

```text
com.example.order
├── OrderApplication.java
├── common
│   ├── api
│   ├── error
│   └── web
└── order
    ├── api
    ├── application
    ├── domain
    └── infrastructure
```

模块内部仍有层次，但订单相关代码能够放在一起。以后新增支付模块，不需要在四个全局目录之间来回跳转。

启动类放在根包，保证默认组件扫描覆盖业务模块：

```java
@SpringBootApplication
public class OrderApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

不建议一开始添加大量 `@ComponentScan`。扫描范围异常往往说明包边界或启动类位置不合理。

## 配置只提供安全默认值

公共配置放行为一致的部分，环境差异通过 Profile 或外部配置注入：

```yaml
# application.yml
spring:
  application:
    name: order-service
  profiles:
    active: ${APP_PROFILE:local}

server:
  port: ${SERVER_PORT:8080}

management:
  endpoints:
    web:
      exposure:
        include: health,info
```

`application-local.yml` 可以指向本机数据库，但不要提交真实密码：

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:mysql://127.0.0.1:3306/order_demo}
    username: ${DB_USERNAME:order_app}
    password: ${DB_PASSWORD:}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 3000
```

生产环境必须在部署平台提供必填值。密码为空时应在启动阶段失败，而不是连库时才暴露问题。

## 请求对象承担输入约束

不要让 Controller 接收一个无边界的 Map。订单查询可以使用明确的请求对象：

```java
public class OrderQueryRequest {

    @NotNull(message = "用户编号不能为空")
    @Min(value = 1, message = "用户编号必须大于 0")
    private Long userId;

    @Min(value = 1, message = "页码必须大于 0")
    private int page = 1;

    @Min(value = 1, message = "每页数量必须大于 0")
    @Max(value = 100, message = "每页最多查询 100 条")
    private int pageSize = 20;

    // getter 和 setter 省略
}
```

DTO 只描述接口契约，不直接复用数据库实体。否则表字段变化可能意外改变接口，调用方也可能提交本不允许修改的字段。

## Controller 只做协议转换

```java
@RestController
@RequestMapping("/api/orders")
public class OrderQueryController {

    private final OrderQueryService orderQueryService;

    public OrderQueryController(OrderQueryService orderQueryService) {
        this.orderQueryService = orderQueryService;
    }

    @GetMapping
    public PageResult<OrderSummary> query(@Valid OrderQueryRequest request) {
        return orderQueryService.query(
                request.getUserId(),
                request.getPage(),
                request.getPageSize()
        );
    }
}
```

Controller 不编写 SQL，不决定事务，也不捕获所有异常后返回 `200`。它负责 HTTP 参数、认证上下文和响应状态，业务规则放进应用服务或领域对象。

构造器注入能让依赖显式，也便于测试；相比字段注入，不需要通过反射才能创建对象。

## 业务服务守住事务边界

```java
@Service
public class OrderQueryService {

    private final OrderRepository orderRepository;

    public OrderQueryService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public PageResult<OrderSummary> query(Long userId, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        List<OrderSummary> items =
                orderRepository.findByUserId(userId, offset, pageSize);
        long total = orderRepository.countByUserId(userId);
        return PageResult.of(items, total, page, pageSize);
    }
}
```

事务放在公共 Service 方法上，并保持范围尽可能小。不要在数据库事务中执行耗时 HTTP 调用；数据库锁会一直占用，失败语义也更难处理。

示例中的分页偏移需要防止超大页码。数据量增加后，可以改成基于 `id` 或创建时间的游标分页，而不是无限增大的 `OFFSET`。

## Repository 封装数据访问

早期工程使用 `NamedParameterJdbcTemplate` 已经足够：

```java
@Repository
public class JdbcOrderRepository implements OrderRepository {

    private static final String FIND_SQL =
            "SELECT id, order_no, status, amount, created_at " +
            "FROM order_info WHERE user_id = :userId " +
            "ORDER BY created_at DESC LIMIT :offset, :pageSize";

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public JdbcOrderRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<OrderSummary> findByUserId(Long userId, int offset, int pageSize) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("offset", offset)
                .addValue("pageSize", pageSize);
        return jdbcTemplate.query(FIND_SQL, parameters, new OrderSummaryRowMapper());
    }
}
```

参数必须绑定，不能拼接用户输入。SQL 字段显式列出，不使用 `SELECT *`。当查询逐渐复杂，再决定是否引入 MyBatis 等框架，不必为了一个接口提前增加整套抽象。

## 错误响应要稳定

接口错误至少包含业务码、可读消息、traceId 和时间。不要把 Java 异常类名直接暴露给调用方：

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("请求参数不合法");
        return ApiError.of("INVALID_ARGUMENT", message, MDC.get("traceId"));
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiError handleUnknown(Exception exception) {
        String traceId = MDC.get("traceId");
        // 未知异常只在统一边界记录一次完整堆栈
        log.error("unhandled_request_error traceId={}", traceId, exception);
        return ApiError.of("INTERNAL_ERROR", "系统暂时不可用", traceId);
    }
}
```

业务异常还应单独映射合适的 HTTP 状态和业务码。前端可以根据稳定的业务码决定提示或重试，不依赖容易变化的中文消息。

## 健康检查不等于进程存在

引入 Actuator 后，先开放最少端点：

```bash
curl -s http://127.0.0.1:8080/actuator/health
```

生产环境不要默认暴露全部管理端点，尤其是环境变量、Bean 和线程信息。管理端点应走内部网络并有访问控制。

健康检查也要区分：

- 存活：进程是否需要重启。
- 就绪：是否能够接收新流量。
- 依赖状态：数据库或外部服务是否异常。

如果下游短暂波动就让存活检查失败，容器可能反复重启，反而放大故障。

## 至少准备三层测试

项目骨架建立时就放入测试样例，后来的人才会沿用：

```text
纯单元测试      业务规则和边界，不启动 Spring
Web 层测试      参数校验、状态码、JSON 契约
集成测试        Repository、事务和真实数据库行为
```

一个最小 Web 测试：

```java
@RunWith(SpringRunner.class)
@WebMvcTest(OrderQueryController.class)
public class OrderQueryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private OrderQueryService orderQueryService;

    @Test
    public void shouldRejectInvalidUserId() throws Exception {
        mockMvc.perform(get("/api/orders").param("userId", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ARGUMENT"));
    }
}
```

集成测试不要长期依赖开发共享数据库，否则数据和执行顺序会互相污染。可以使用独立测试库，并通过迁移脚本初始化结构。

## 构建产物必须可以重复

交付前使用同一条命令完成编译、测试和打包：

```bash
mvn clean verify
java -jar target/order-service.jar --spring.profiles.active=local
```

不要把 IDEA 输出目录、日志、上传文件或本地配置打进 Jar。版本号、Git 提交和构建时间可以写入构建信息，方便线上追溯。

容器或服务器启动参数也应进入部署脚本，而不是留在某位同事的终端历史中。

## 第一个接口完成后的骨架验收

```text
[ ] JDK 8 与 Maven 构建版本一致
[ ] 依赖最小且来源清楚
[ ] 包结构按业务边界组织
[ ] 配置不包含真实密钥
[ ] 请求参数有明确校验
[ ] Controller、事务和数据访问职责分开
[ ] 错误码、traceId 和日志可用于排查
[ ] 健康检查仅暴露必要信息
[ ] 单元、Web 和集成测试各有样例
[ ] Jar 能在 IDE 外独立启动
[ ] 部署、验证和回退步骤已记录
```

Spring Boot 的价值不只是少写配置，而是让团队用约定快速建立一致基线。一个合格骨架不需要塞满技术名词，它应该让新增业务代码有位置、失败能够被看见、环境差异可控制，并且任何人都能用同一条命令得到相同产物。
