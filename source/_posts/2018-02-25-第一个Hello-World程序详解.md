---
title: 第一个Hello World程序详解
date: 2018-02-25 15:22:08
tags: [Java, HelloWorld, 入门, 编译运行]
categories: Java基础
keywords: Java HelloWorld, Java第一个程序, Java编译运行流程, class文件, main方法, Java入门教程
cover: /images/posts/2018/hello-world-cover.svg
---

# 背景

今天把 JDK 和开发工具都装好以后，终于开始写第一个 Java 程序了。虽然只是最简单的 `Hello World`，但是实际动手以后发现，这里面并不是只有一行输出语句那么简单。

我之前学 C 语言的时候，也是从 `Hello World` 开始的。当时大概知道写完 `.c` 文件以后，用编译器编译，再运行生成的可执行文件就可以了。所以刚开始学 Java 的时候，我也下意识以为流程差不多：写代码、编译、运行。

但是 Java 这里多了一个 `.class` 文件，还要用 `javac` 和 `java` 两个命令分别处理，一开始确实有点懵。于是我想把 Java 程序从编写到运行的完整过程搞清楚，至少以后再遇到编译错误、运行错误时，知道问题大概出在哪里。


# 问题

第一次写 Java 的 `Hello World`，我主要遇到了下面几个问题。

## 文件名和类名不一致导致编译报错

我一开始把文件保存成了 `hello.java`，里面写的是：

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
```

然后执行：

```bash
javac hello.java
```

结果编译器报错，大概意思是公共类 `HelloWorld` 应该放在 `HelloWorld.java` 文件中。这个错误很典型，因为 Java 对 `public class` 的类名和文件名要求非常严格。

## 缺少main方法不知道程序入口在哪

我还尝试过只写一个普通方法：

```java
public class HelloWorld {
    public void sayHello() {
        System.out.println("Hello World");
    }
}
```

这段代码能编译通过，但是运行时会提示找不到 `main` 方法。也就是说，Java 程序不是只要有类就能直接运行，JVM 需要知道从哪里开始执行。

## 不理解为什么javac编译后生成.class文件

执行 `javac HelloWorld.java` 后，目录里生成了 `HelloWorld.class`。我一开始以为编译后应该生成类似 Windows 下的 `.exe` 文件，但是 Java 生成的是字节码文件，这和 C 语言直接编译成机器码不同。

## 中文输出乱码问题

我在程序里输出中文时，也遇到过乱码：

```java
System.out.println("你好，Java");
```

有时编译没问题，但是运行后控制台显示的中文不正常。后来才知道，这和源文件编码、命令行窗口编码、`javac` 读取源码时使用的编码都有关系。

# 分析

## public类的类名必须和文件名完全一致

Java 要求一个 `.java` 文件中，如果存在 `public` 修饰的类，那么这个 `public` 类的类名必须和文件名完全一致，包括大小写。

例如：

```java
public class HelloWorld {
}
```

文件名就必须是：

```text
HelloWorld.java
```

不能写成 `helloworld.java`、`hello.java` 或 `Hello.java`。虽然 Windows 文件名大小写不敏感，但 Java 编译器对类名是区分大小写的，初学的时候最好严格保持一致。

## JVM执行时寻找main方法作为程序入口

Java 程序运行时，JVM 会寻找固定格式的 `main` 方法作为入口：

```java
public static void main(String[] args)
```

这里的几个关键点是：

- `public`：表示 JVM 可以从类外部访问这个方法
- `static`：表示不需要创建对象，就可以直接调用这个方法
- `void`：表示这个方法没有返回值
- `main`：固定的方法名，是程序入口
- `String[] args`：命令行参数，运行程序时可以从外部传入字符串数组

如果少写了 `static`，或者把 `main` 写成 `Main`，都可能导致 JVM 找不到程序入口。

## Java先编译成字节码再由JVM执行

Java 的执行流程大致是：

```text
HelloWorld.java  --javac编译-->  HelloWorld.class  --JVM执行-->  程序输出结果
```

这里的 `.class` 文件不是普通文本文件，而是 Java 字节码文件。JVM 可以读取字节码，然后在不同操作系统上解释执行或即时编译执行。

这也是 Java 经常说的“一次编译，到处运行”的基础：只要目标机器安装了合适的 JVM，同一份 `.class` 字节码理论上就可以在不同平台运行。


## Windows默认GBK编码可能导致中文乱码

我现在主要在 Windows 环境下学习 Java。Windows 命令行默认编码经常是 GBK，而很多编辑器保存源码时默认是 UTF-8。

如果源文件实际是 UTF-8，但 `javac` 按系统默认编码去读取，或者控制台用另一种编码显示，就可能出现中文乱码。最稳妥的方式是明确告诉 `javac` 源文件编码：

```bash
javac -encoding UTF-8 HelloWorld.java
```

这样至少编译阶段不会因为编码识别错误导致中文出问题。

# 解决方案

## 完整的HelloWorld.java代码及逐行解释

下面是我整理后的第一个 Java 程序，文件名必须保存为 `HelloWorld.java`。

```java
public class HelloWorld { // 定义一个公共类，类名必须和文件名 HelloWorld.java 完全一致
    public static void main(String[] args) { // Java程序入口，JVM运行程序时会从这个方法开始执行
        System.out.println("Hello World"); // 向控制台输出一行文本，输出结束后自动换行
        System.out.println("你好，Java"); // 输出中文内容，用来测试当前编码是否正常
    }
}
```

逐行理解：

1. `public class HelloWorld`：声明一个公共类，类名是 `HelloWorld`。
2. `{` 和 `}`：表示代码块的开始和结束，类和方法都需要用大括号包起来。
3. `public static void main(String[] args)`：固定格式的主方法，是 Java 程序入口。
4. `System.out.println("Hello World")`：在控制台打印 `Hello World`。
5. 每条语句末尾的分号不能省略，这是 Java 的语法要求。

## javac编译和java运行的完整命令

假设当前目录下有 `HelloWorld.java` 文件，先打开命令行进入这个目录。

```bash
cd D:\java-study
```

编译 Java 源文件：

```bash
javac HelloWorld.java
```

如果编译成功，命令行通常不会输出任何内容，但是目录里会多出一个文件：

```text
HelloWorld.class
```

然后运行程序：

```bash
java HelloWorld
```

注意这里运行时写的是类名 `HelloWorld`，不要写成 `HelloWorld.class`，也不要写成 `HelloWorld.java`。

正常输出如下：

```text
Hello World
你好，Java
```

如果担心中文编码问题，可以这样编译：

```bash
javac -encoding UTF-8 HelloWorld.java
java HelloWorld
```

对应输出：

```text
Hello World
你好，Java
```


## 带命令行参数的版本

`main` 方法里的 `String[] args` 可以接收命令行参数。为了理解它，我又写了一个版本：

```java
public class HelloWorld { // 定义HelloWorld类，文件名仍然必须是HelloWorld.java
    public static void main(String[] args) { // args用于接收运行程序时传入的命令行参数
        if (args.length == 0) { // 判断是否没有传入任何参数，避免直接访问数组导致异常
            System.out.println("Hello World"); // 没有参数时输出默认内容
            return; // 提前结束main方法，让后面的参数输出逻辑不再执行
        }

        System.out.println("收到的第一个参数是：" + args[0]); // 输出命令行传入的第一个参数
    }
}
```

编译：

```bash
javac -encoding UTF-8 HelloWorld.java
```

不带参数运行：

```bash
java HelloWorld
```

输出：

```text
Hello World
```

带参数运行：

```bash
java HelloWorld Java入门
```

输出：

```text
收到的第一个参数是：Java入门
```

如果传入多个参数，`args[0]` 是第一个，`args[1]` 是第二个。这个地方让我想到 C 语言里的 `argc` 和 `argv`，只是 Java 把参数封装成了字符串数组。

## 使用Eclipse创建Java项目的步骤

手动编译运行理解清楚以后，也可以用 Eclipse 创建项目。Eclipse 会自动帮我们调用编译器，很多目录结构和 classpath 细节也会帮忙处理。

大致步骤如下：

1. 打开 Eclipse。
2. 选择 `File` -> `New` -> `Java Project`。
3. 在 `Project name` 中输入项目名，例如 `HelloWorldDemo`。
4. 选择已经安装好的 JDK，初学阶段默认配置即可。
5. 点击 `Finish` 创建项目。
6. 在 `src` 目录上右键，选择 `New` -> `Class`。
7. 在 `Name` 中输入 `HelloWorld`。
8. 勾选 `public static void main(String[] args)`，让 Eclipse 自动生成主方法。
9. 在 `main` 方法中写入输出语句。
10. 右键代码区域，选择 `Run As` -> `Java Application` 运行程序。

Eclipse 里生成的代码大概是：

```java
public class HelloWorld { // Eclipse创建的公共类，类名和文件名保持一致
    public static void main(String[] args) { // 勾选主方法选项后，Eclipse会自动生成程序入口
        System.out.println("Hello World"); // 在控制台输出Hello World
    }
}
```


## classpath的概念

`classpath` 可以简单理解为 JVM 查找 `.class` 文件的路径。

我们执行：

```bash
java HelloWorld
```

JVM 会根据 classpath 去找 `HelloWorld.class`。如果当前目录不在 classpath 中，就可能出现找不到类的错误。

在简单练习时，可以在 `.class` 文件所在目录执行命令，或者显式指定 classpath：

```bash
java -classpath . HelloWorld
```

这里的 `.` 表示当前目录。也可以写成简写形式：

```bash
java -cp . HelloWorld
```

如果 class 文件放在 `bin` 目录下，可以这样运行：

```bash
java -cp bin HelloWorld
```

初学阶段我觉得没必要一开始就背很多 classpath 的复杂规则，但至少要知道：运行 Java 程序时，JVM 必须能在 classpath 指定的位置找到对应的 `.class` 文件。


# 总结

今天这个 `Hello World` 程序虽然很小，但实际把 Java 的几个基础概念都串起来了。

首先，Java 的编译运行机制和 C 语言有本质区别。C 语言通常直接编译成本机平台的机器码，而 Java 是先通过 `javac` 编译成 `.class` 字节码，再交给 JVM 运行。

其次，写 Java 程序时要注意文件名、类名、编码的一致性。尤其是 `public class HelloWorld` 必须放在 `HelloWorld.java` 中，中文源码最好统一使用 UTF-8，并在命令行编译时加上：

```bash
javac -encoding UTF-8 HelloWorld.java
```

再次，`main` 方法是 Java 程序入口，签名最好先按固定格式记住：

```java
public static void main(String[] args)
```

最后，我对“一次编译，到处运行”有了更具体的理解。它不是说 Java 源文件可以直接在任何地方运行，而是说 Java 源文件编译成字节码后，可以交给不同平台上的 JVM 执行。

IDE 确实能帮我们屏蔽很多细节，比如自动编译、自动设置 classpath、自动生成 main 方法。但是我觉得初学者还是应该先用命令行手动编译运行几次。这样以后 Eclipse 或其他工具报错时，不至于完全不知道底层发生了什么。
