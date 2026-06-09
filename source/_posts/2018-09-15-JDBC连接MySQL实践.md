---
title: JDBC连接MySQL实践
date: 2018-09-15 10:27:44
tags: [Java, JDBC, MySQL, 数据库连接, CRUD]
categories: 数据库
keywords: Java JDBC连接MySQL, JDBC CRUD操作, PreparedStatement用法, JDBC连接池, 数据库连接最佳实践
cover: /images/posts/2018/jdbc-mysql-cover.svg
---

# 背景

2018 年 9 月，我刚把 Java 基础和 MySQL 的常用语法系统学完。前面写 Java 时，大多是在控制台里打印结果；学 MySQL 时，也主要是在命令行或者图形化工具里执行 SQL。到了这个阶段，一个很自然的问题出现了：能不能用 Java 代码直接操作 MySQL 数据库？

答案就是 JDBC。

JDBC，全称是 Java Database Connectivity，它是 Java 提供的一套数据库访问规范。简单理解，JDBC 就像 Java 程序和数据库之间的一座桥：Java 代码通过 JDBC API 发送 SQL，数据库执行后再把结果返回给 Java 程序。

![Java 程序通过 JDBC 连接 MySQL 的流程图](/images/posts/2018/jdbc-mysql-1.svg)

我当时的目标很明确：

- 用 Java 连接 MySQL；
- 用 Java 执行增删改查；
- 理解 `Connection`、`PreparedStatement`、`ResultSet` 这些核心对象；
- 避免连接泄漏、SQL 注入、中文乱码这些常见坑。

# 问题

第一次真正写 JDBC 代码时，问题比想象中多。很多错误不是 SQL 写错，而是连接、驱动、资源释放这些基础细节没有处理好。

## 1. ClassNotFoundException 找不到驱动

最常见的报错是：

```text
java.lang.ClassNotFoundException: com.mysql.jdbc.Driver
```

这个异常的意思很直接：Java 程序找不到 MySQL 的 JDBC 驱动类。

当时我以为 JDK 自带了所有数据库驱动，后来才知道 JDBC 只是规范，真正连接 MySQL 还需要 MySQL 官方提供的 Connector/J 驱动包。如果没有把 `mysql-connector-java` 加入 classpath，`Class.forName("com.mysql.jdbc.Driver")` 就会失败。

## 2. 连接字符串写错

第二类问题是 JDBC URL 写错，比如数据库名漏写、端口写错、参数拼错。

JDBC 连接 MySQL 的基本格式是：

```text
jdbc:mysql://host:port/database
```

例如：

```text
jdbc:mysql://localhost:3306/test
```

如果还要处理中文编码，通常需要加上参数：

```text
jdbc:mysql://localhost:3306/test?useUnicode=true&characterEncoding=UTF-8
```

## 3. SQL 注入风险

一开始我会用字符串拼接 SQL：

```java
String sql = "select * from user where username = '" + username + "' and password = '" + password + "'";
```

这种写法看起来简单，但非常危险。如果用户输入中带有特殊 SQL 片段，就可能绕过登录校验，甚至破坏数据。

## 4. ResultSet 取值顺序混乱

`ResultSet` 不是一次性把所有数据都变成 Java 对象，而是一个游标。刚拿到 `ResultSet` 时，游标在第一行之前，必须先调用 `next()`，再读取当前行的数据。

如果忘记 `next()`，或者列名、列下标混着用，很容易出现取值混乱。

## 5. 资源忘记关闭导致连接泄漏

JDBC 里最容易忽略的一点是资源释放。`Connection`、`Statement`、`ResultSet` 都持有数据库或网络资源，用完不关闭，就可能导致连接越来越多，最后数据库拒绝新的连接。

## 6. 中文数据存入乱码

如果数据库、表、连接 URL 的编码不一致，中文数据就可能变成问号或者乱码。尤其是早期 MySQL 项目里，连接参数里没有指定 `characterEncoding=UTF-8` 时很容易遇到。

# 分析

把这些问题拆开看，其实它们都对应 JDBC 的几个基础机制。


## 1. 驱动必须加入 classpath

JDBC API 在 JDK 中提供，但 MySQL 的具体驱动实现不在 JDK 里。要连接 MySQL，必须引入 Connector/J。

如果是普通 Java 工程，需要把 jar 包加入 classpath；如果是 Maven 工程，可以加入依赖：

```xml
<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
    <version>5.1.47</version>
</dependency>
```

2018 年我使用较多的是 MySQL Connector/J 5.x，对应驱动类通常写：

```text
com.mysql.jdbc.Driver
```

## 2. JDBC URL 要写完整

JDBC URL 不是普通网址，它会被驱动解析。MySQL 的基础格式是：

```text
jdbc:mysql://主机名:端口号/数据库名?参数1=值1&参数2=值2
```

常用示例：

```text
jdbc:mysql://localhost:3306/jdbc_demo?useUnicode=true&characterEncoding=UTF-8&useSSL=false
```

其中：

- `localhost` 表示本机数据库；
- `3306` 是 MySQL 默认端口；
- `jdbc_demo` 是数据库名；
- `useUnicode=true` 和 `characterEncoding=UTF-8` 用于处理中文；
- `useSSL=false` 可以避免部分版本驱动的 SSL 警告。

## 3. PreparedStatement 比 Statement 更安全

`Statement` 通常需要拼接 SQL 字符串，这会带来 SQL 注入风险。`PreparedStatement` 使用占位符 `?`，再通过 `setXxx` 方法传参，参数会被驱动正确处理。

例如：

```java
String sql = "select * from user where username = ? and password = ?";
PreparedStatement ps = conn.prepareStatement(sql);
ps.setString(1, username);
ps.setString(2, password);
```

这样 SQL 结构和参数值是分离的，可读性和安全性都更好。

## 4. ResultSet 是游标模式

`ResultSet` 可以理解为结果集游标。读取数据时通常这样写：

```java
while (rs.next()) {
    int id = rs.getInt("id");
    String username = rs.getString("username");
}
```

我更推荐使用列名取值，而不是列下标。列名更直观，SQL 字段顺序调整时也不容易出错。

## 5. 资源必须关闭

JDBC 资源关闭顺序一般和创建顺序相反：

```text
ResultSet -> Statement/PreparedStatement -> Connection
```

JDK 1.7 以后可以使用 try-with-resources 自动关闭资源。不过为了理解原理，先掌握 `finally` 中手动关闭也很重要。

## 6. 编码要统一

中文乱码通常不是单点问题，要同时检查：

- 数据库编码；
- 表编码；
- 字段编码；
- JDBC URL 编码参数；
- Java 字符串本身。

JDBC URL 中至少应明确指定：

```text
useUnicode=true&characterEncoding=UTF-8
```

# 解决方案

下面记录一套完整的 JDBC 连接 MySQL 实践代码。示例基于 JDK 1.8、MySQL Connector/J 5.x，表结构使用一个简单的 `user` 表。

## 准备表结构

```sql
create database if not exists jdbc_demo default character set utf8;

use jdbc_demo;

create table if not exists user (
    id int primary key auto_increment,
    username varchar(50) not null,
    password varchar(50) not null,
    age int,
    create_time datetime
);
```

## 1. JDBC 连接 MySQL 的 6 步代码

JDBC 最基础的流程可以概括为 6 步：

1. 加载数据库驱动；
2. 获取数据库连接；
3. 编写 SQL；
4. 创建执行 SQL 的对象；
5. 执行 SQL 并处理结果；
6. 关闭资源。

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public class JdbcSixStepDemo {

    public static void main(String[] args) {
        String url = "jdbc:mysql://localhost:3306/jdbc_demo?useUnicode=true&characterEncoding=UTF-8&useSSL=false";
        String username = "root";
        String password = "root";

        Connection conn = null;
        PreparedStatement ps = null;
        ResultSet rs = null;

        try {
            Class.forName("com.mysql.jdbc.Driver");
            conn = DriverManager.getConnection(url, username, password);

            String sql = "select id, username, age from user where age > ?";
            ps = conn.prepareStatement(sql);
            ps.setInt(1, 18);

            rs = ps.executeQuery();
            while (rs.next()) {
                int id = rs.getInt("id");
                String name = rs.getString("username");
                int age = rs.getInt("age");
                System.out.println(id + " - " + name + " - " + age);
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            closeQuietly(rs, ps, conn);
        }
    }

    private static void closeQuietly(ResultSet rs, PreparedStatement ps, Connection conn) {
        try {
            if (rs != null) {
                rs.close();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        try {
            if (ps != null) {
                ps.close();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        try {
            if (conn != null) {
                conn.close();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

这段代码看起来比较长，但它把 JDBC 的基本动作都展示出来了。实际开发中，关闭资源、获取连接这些重复代码应该封装到工具类里。

## 2. PreparedStatement 的 CRUD 完整示例

下面用 `PreparedStatement` 完成增删改查。为了让代码更清晰，我先定义一个简单的实体类。

```java
import java.util.Date;

public class User {

    private Integer id;
    private String username;
    private String password;
    private Integer age;
    private Date createTime;

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Integer getAge() {
        return age;
    }

    public void setAge(Integer age) {
        this.age = age;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }
}
```

### 新增数据

```java
public int insertUser(User user) {
    String sql = "insert into user(username, password, age, create_time) values(?, ?, ?, ?)";

    Connection conn = null;
    PreparedStatement ps = null;

    try {
        conn = JdbcUtils.getConnection();
        ps = conn.prepareStatement(sql);
        ps.setString(1, user.getUsername());
        ps.setString(2, user.getPassword());
        ps.setInt(3, user.getAge());
        ps.setTimestamp(4, new java.sql.Timestamp(user.getCreateTime().getTime()));
        return ps.executeUpdate();
    } catch (Exception e) {
        e.printStackTrace();
        return 0;
    } finally {
        JdbcUtils.close(null, ps, conn);
    }
}
```

### 查询数据

```java
public User findUserById(Integer id) {
    String sql = "select id, username, password, age, create_time from user where id = ?";

    Connection conn = null;
    PreparedStatement ps = null;
    ResultSet rs = null;

    try {
        conn = JdbcUtils.getConnection();
        ps = conn.prepareStatement(sql);
        ps.setInt(1, id);
        rs = ps.executeQuery();

        if (!rs.next()) {
            return null;
        }

        User user = new User();
        user.setId(rs.getInt("id"));
        user.setUsername(rs.getString("username"));
        user.setPassword(rs.getString("password"));
        user.setAge(rs.getInt("age"));
        user.setCreateTime(rs.getTimestamp("create_time"));
        return user;
    } catch (Exception e) {
        e.printStackTrace();
        return null;
    } finally {
        JdbcUtils.close(rs, ps, conn);
    }
}
```

### 修改数据

```java
public int updateUserAge(Integer id, Integer age) {
    String sql = "update user set age = ? where id = ?";

    Connection conn = null;
    PreparedStatement ps = null;

    try {
        conn = JdbcUtils.getConnection();
        ps = conn.prepareStatement(sql);
        ps.setInt(1, age);
        ps.setInt(2, id);
        return ps.executeUpdate();
    } catch (Exception e) {
        e.printStackTrace();
        return 0;
    } finally {
        JdbcUtils.close(null, ps, conn);
    }
}
```

### 删除数据

```java
public int deleteUserById(Integer id) {
    String sql = "delete from user where id = ?";

    Connection conn = null;
    PreparedStatement ps = null;

    try {
        conn = JdbcUtils.getConnection();
        ps = conn.prepareStatement(sql);
        ps.setInt(1, id);
        return ps.executeUpdate();
    } catch (Exception e) {
        e.printStackTrace();
        return 0;
    } finally {
        JdbcUtils.close(null, ps, conn);
    }
}
```

这里有一个小经验：查询使用 `executeQuery()`，增删改使用 `executeUpdate()`。后者返回受影响的行数，可以用来判断操作是否成功。

## 3. 事务管理代码

事务适合处理一组必须同时成功或同时失败的操作，比如转账：A 扣钱成功，B 加钱也必须成功。

JDBC 默认是自动提交事务的，也就是每执行一条 SQL 就提交一次。要手动控制事务，需要关闭自动提交：

```java
public void transfer(Integer fromId, Integer toId, Integer amount) {
    String decreaseSql = "update account set balance = balance - ? where id = ?";
    String increaseSql = "update account set balance = balance + ? where id = ?";

    Connection conn = null;
    PreparedStatement decreasePs = null;
    PreparedStatement increasePs = null;

    try {
        conn = JdbcUtils.getConnection();
        conn.setAutoCommit(false);

        decreasePs = conn.prepareStatement(decreaseSql);
        decreasePs.setInt(1, amount);
        decreasePs.setInt(2, fromId);
        decreasePs.executeUpdate();

        increasePs = conn.prepareStatement(increaseSql);
        increasePs.setInt(1, amount);
        increasePs.setInt(2, toId);
        increasePs.executeUpdate();

        conn.commit();
    } catch (Exception e) {
        rollback(conn);
        e.printStackTrace();
    } finally {
        JdbcUtils.close(null, increasePs, null);
        JdbcUtils.close(null, decreasePs, conn);
    }
}

private void rollback(Connection conn) {
    if (conn == null) {
        return;
    }

    try {
        conn.rollback();
    } catch (Exception e) {
        e.printStackTrace();
    }
}
```

这段代码的关键点是：

- `conn.setAutoCommit(false)`：关闭自动提交；
- `conn.commit()`：所有 SQL 成功后提交；
- `conn.rollback()`：出现异常时回滚；
- 同一个事务中的多条 SQL 必须使用同一个 `Connection`。

## 4. JDBC 工具类封装

如果每个方法都写加载驱动、创建连接、关闭资源，代码会非常重复。所以我把这些逻辑封装成一个工具类。

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class JdbcUtils {

    private static final String DRIVER_CLASS = "com.mysql.jdbc.Driver";
    private static final String URL = "jdbc:mysql://localhost:3306/jdbc_demo?useUnicode=true&characterEncoding=UTF-8&useSSL=false";
    private static final String USERNAME = "root";
    private static final String PASSWORD = "root";

    static {
        try {
            Class.forName(DRIVER_CLASS);
        } catch (ClassNotFoundException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private JdbcUtils() {
    }

    public static Connection getConnection() throws Exception {
        return DriverManager.getConnection(URL, USERNAME, PASSWORD);
    }

    public static void close(ResultSet rs, Statement stmt, Connection conn) {
        closeResultSet(rs);
        closeStatement(stmt);
        closeConnection(conn);
    }

    private static void closeResultSet(ResultSet rs) {
        if (rs == null) {
            return;
        }

        try {
            rs.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void closeStatement(Statement stmt) {
        if (stmt == null) {
            return;
        }

        try {
            stmt.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void closeConnection(Connection conn) {
        if (conn == null) {
            return;
        }

        try {
            conn.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

这个工具类做了三件事：

- 静态代码块加载驱动；
- `getConnection()` 统一获取连接；
- `close()` 统一关闭资源。

学习阶段这样写足够清晰，但生产环境不建议每次都通过 `DriverManager` 新建物理连接，因为创建连接成本比较高。

## 5. try-with-resources 写法

JDK 1.7 之后可以用 try-with-resources 自动关闭资源。JDK 1.8 中也可以使用这种写法。

```java
public User findUserByUsername(String username) {
    String sql = "select id, username, password, age, create_time from user where username = ?";

    try (Connection conn = JdbcUtils.getConnection();
         PreparedStatement ps = conn.prepareStatement(sql)) {

        ps.setString(1, username);

        try (ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                return null;
            }

            User user = new User();
            user.setId(rs.getInt("id"));
            user.setUsername(rs.getString("username"));
            user.setPassword(rs.getString("password"));
            user.setAge(rs.getInt("age"));
            user.setCreateTime(rs.getTimestamp("create_time"));
            return user;
        }
    } catch (Exception e) {
        e.printStackTrace();
        return null;
    }
}
```

这种写法的好处是资源关闭更可靠，也减少了大量 `finally` 模板代码。

## 6. Druid 连接池简介

实际项目中，不应该每次操作数据库都创建一个新的物理连接。连接池会提前维护一批连接，程序需要时从池中取，用完后归还给连接池。


Druid 是阿里开源的数据库连接池，在国内 Java 项目里很常见。Maven 依赖示例：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>druid</artifactId>
    <version>1.1.10</version>
</dependency>
```

`druid.properties` 配置示例：

```properties
driverClassName=com.mysql.jdbc.Driver
url=jdbc:mysql://localhost:3306/jdbc_demo?useUnicode=true&characterEncoding=UTF-8&useSSL=false
username=root
password=root
initialSize=5
maxActive=20
minIdle=5
maxWait=3000
validationQuery=select 1
testWhileIdle=true
testOnBorrow=false
testOnReturn=false
```

使用 Druid 获取连接：

```java
import com.alibaba.druid.pool.DruidDataSourceFactory;

import javax.sql.DataSource;
import java.io.InputStream;
import java.sql.Connection;
import java.util.Properties;

public class DruidUtils {

    private static DataSource dataSource;

    static {
        try {
            Properties properties = new Properties();
            InputStream inputStream = DruidUtils.class.getClassLoader().getResourceAsStream("druid.properties");
            properties.load(inputStream);
            dataSource = DruidDataSourceFactory.createDataSource(properties);
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private DruidUtils() {
    }

    public static Connection getConnection() throws Exception {
        return dataSource.getConnection();
    }

    public static DataSource getDataSource() {
        return dataSource;
    }
}
```

使用连接池后，调用 `conn.close()` 并不是真的关闭物理连接，而是把连接归还给连接池。这一点很重要，所以即使用了连接池，也仍然必须关闭连接。

## 7. 批处理操作

当需要一次插入很多条数据时，如果一条一条执行 SQL，效率会比较低。JDBC 提供了批处理能力，可以把多条操作合并提交。

```java
public void batchInsertUsers(List<User> users) {
    String sql = "insert into user(username, password, age, create_time) values(?, ?, ?, ?)";

    Connection conn = null;
    PreparedStatement ps = null;

    try {
        conn = JdbcUtils.getConnection();
        ps = conn.prepareStatement(sql);

        for (int i = 0; i < users.size(); i++) {
            User user = users.get(i);
            ps.setString(1, user.getUsername());
            ps.setString(2, user.getPassword());
            ps.setInt(3, user.getAge());
            ps.setTimestamp(4, new java.sql.Timestamp(user.getCreateTime().getTime()));
            ps.addBatch();

            if ((i + 1) % 500 == 0) {
                ps.executeBatch();
                ps.clearBatch();
            }
        }

        ps.executeBatch();
        ps.clearBatch();
    } catch (Exception e) {
        e.printStackTrace();
    } finally {
        JdbcUtils.close(null, ps, conn);
    }
}
```

批处理适合大量新增或更新数据。这里每 500 条执行一次，是为了避免一次性积累太多 SQL 占用内存。

# 总结

这次 JDBC 连接 MySQL 的实践，让我把 Java 基础、SQL 语法和数据库连接机制串了起来。以前只是在数据库工具里执行 SQL，现在可以通过 Java 代码完成完整的 CRUD 操作，感觉 Java 程序终于可以真正和数据打交道了。

我给自己总结了几条规则：

1. 永远优先使用 `PreparedStatement`，不要用字符串拼接 SQL；
2. `ResultSet` 是游标模式，读取前先 `next()`；
3. `Connection`、`Statement`、`ResultSet` 用完必须关闭；
4. 资源关闭要放在 `finally` 中，或者使用 try-with-resources；
5. 中文数据要注意数据库编码和 JDBC URL 中的 `characterEncoding=UTF-8`；
6. 涉及多条 SQL 的一致性操作时，要明确事务边界；
7. 生产环境不要直接频繁创建连接，应该使用连接池，比如 Druid。

JDBC 的代码确实比较模板化，但它非常适合用来理解数据库访问的底层过程。后面再学习 DBUtils、JdbcTemplate、MyBatis 这些框架时，就会更容易明白它们到底帮我们封装了什么。
