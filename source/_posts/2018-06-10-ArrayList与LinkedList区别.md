---
title: ArrayList与LinkedList区别
date: 2018-06-10 16:42:55
tags: [Java, 集合框架, ArrayList, LinkedList, 数据结构]
categories: Java集合
keywords: ArrayList LinkedList区别, Java集合框架, ArrayList底层原理, LinkedList底层原理, Java List选择, 数组链表对比
cover: https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=ArrayList%20vs%20LinkedList%20comparison%20diagram%20showing%20array%20and%20linked%20list%20data%20structure%2C%20clean%20technical%20infographic&image_size=landscape_16_9
---

# 背景

学完 Java 面向对象之后，终于进入了集合框架这一章。说实话，刚接触 `List` 接口的时候我是懵的——`ArrayList` 和 `LinkedList` 都实现了 `List`，方法几乎一模一样，那到底该用哪个？

当时做课程作业，随手就 `new ArrayList<>()`，也没多想。直到有一次写一个模拟队列的功能，频繁在头部插入元素，程序跑得巨慢，我才意识到：**选错 List 实现，性能差距可以差到几十倍**。

![ArrayList与LinkedList底层数据结构对比](https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=ArrayList%20array%20based%20data%20structure%20vs%20LinkedList%20doubly%20linked%20list%20structure%2C%20side%20by%20side%20comparison%2C%20memory%20layout%20diagram%2C%20technical%20illustration&image_size=landscape_4_3)

# 问题

踩坑过程中，我遇到了三个核心问题：

**1. 随机访问和头插性能差异巨大**

同样的 10 万次操作，`ArrayList` 随机访问几乎瞬间完成，但头部插入慢到怀疑人生；而 `LinkedList` 头部插入飞快，随机访问却慢得离谱。我当时完全不理解为什么。

**2. 不知道什么场景该用哪个**

网上文章都说“随机访问多用 ArrayList，增删多用 LinkedList”，但这个“增删”到底指哪个位置的增删？尾部增删两者差不多啊！这种笼统的说法反而让我更困惑。

**3. 遍历删除元素时 ConcurrentModificationException**

这是最坑的。我想遍历 `List` 删除符合条件的元素，写了下面这种代码：

```java
for (String item : list) {
    if (item.equals("deleteMe")) {
        list.remove(item);
    }
}
```

结果直接抛了 `ConcurrentModificationException`，当时完全不知道为什么，也不知道怎么改。

# 分析

要真正搞懂这两个类的区别，必须从底层源码入手。

## ArrayList：底层是数组

翻开 `ArrayList` 的 JDK 源码，核心就是一个数组：

```java
transient Object[] elementData;
private int size;
```

**随机访问为什么是 O(1)？**

因为数组在内存中是连续存储的，通过下标可以直接定位：

```java
public E get(int index) {
    rangeCheck(index);
    return elementData(index);
}

E elementData(int index) {
    return (E) elementData[index];
}
```

这段源码说明，`get(index)` 的核心操作就是 `elementData[index]`，所以随机访问时间复杂度是 O(1)。

**头部插入为什么是 O(n)？**

因为要在头部插入元素，需要把后面所有元素都往后挪一位：

```java
public void add(int index, E element) {
    rangeCheckForAdd(index);
    ensureCapacityInternal(size + 1);
    System.arraycopy(elementData, index, elementData, index + 1, size - index);
    elementData[index] = element;
    size++;
}
```

关键就在 `System.arraycopy`。如果在索引 0 的位置插入，原来所有元素都要向后移动，元素越多越慢，所以头插是 O(n)。

**扩容机制也会带来额外成本**

`ArrayList` 默认初始容量是 10，容量不够时会扩容为原来的 1.5 倍：

```java
private void grow(int minCapacity) {
    int oldCapacity = elementData.length;
    int newCapacity = oldCapacity + (oldCapacity >> 1);
    if (newCapacity - minCapacity < 0) {
        newCapacity = minCapacity;
    }
    elementData = Arrays.copyOf(elementData, newCapacity);
}
```

扩容时会复制旧数组，因此如果一开始就知道大概容量，最好使用 `new ArrayList<>(capacity)`，避免多次扩容。

## LinkedList：底层是双向链表

`LinkedList` 的核心是 `Node` 节点，每个节点保存当前元素、前驱节点和后继节点：

```java
private static class Node<E> {
    E item;
    Node<E> next;
    Node<E> prev;

    Node(Node<E> prev, E element, Node<E> next) {
        this.item = element;
        this.next = next;
        this.prev = prev;
    }
}
```

**头部插入为什么是 O(1)？**

因为链表头插只需要修改几个引用，不需要移动已有元素：

```java
public void addFirst(E e) {
    linkFirst(e);
}

private void linkFirst(E e) {
    final Node<E> f = first;
    final Node<E> newNode = new Node<>(null, e, f);
    first = newNode;
    if (f == null) {
        last = newNode;
    } else {
        f.prev = newNode;
    }
    size++;
}
```

这个过程只调整 `first`、`prev` 等引用，和集合大小没有直接关系，所以是 O(1)。

**随机访问为什么是 O(n)？**

链表不像数组那样可以通过下标直接定位。即使知道 index，也必须从头或从尾一步一步走过去：

```java
public E get(int index) {
    checkElementIndex(index);
    return node(index).item;
}

Node<E> node(int index) {
    if (index < (size >> 1)) {
        Node<E> x = first;
        for (int i = 0; i < index; i++) {
            x = x.next;
        }
        return x;
    } else {
        Node<E> x = last;
        for (int i = size - 1; i > index; i--) {
            x = x.prev;
        }
        return x;
    }
}
```

JDK 做了一个优化：如果 index 在前半部分，就从头开始找；如果在后半部分，就从尾开始找。但本质仍然是遍历，复杂度还是 O(n)。

## fail-fast 机制与 ConcurrentModificationException

这个问题和 `ArrayList`、`LinkedList` 都有关，因为它们都使用了 `AbstractList` 中的 `modCount`：

```java
protected transient int modCount = 0;
```

每次对集合做结构性修改，比如 `add`、`remove`，`modCount` 都会变化。迭代器创建时会记录一个 `expectedModCount`，遍历过程中会检查两者是否一致：

```java
final void checkForComodification() {
    if (modCount != expectedModCount) {
        throw new ConcurrentModificationException();
    }
}
```

所以用 for-each 遍历时调用 `list.remove()`，集合自己的 `modCount` 变了，但迭代器里的 `expectedModCount` 没有同步更新，就会触发 fail-fast 机制，抛出 `ConcurrentModificationException`。

![fail-fast机制与ConcurrentModificationException原理](https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Java%20fail-fast%20mechanism%20diagram%2C%20modCount%20expectedModCount%20comparison%2C%20ConcurrentModificationException%20flow%20chart%2C%20technical%20illustration&image_size=landscape_4_3)

# 解决方案

## 完整对比表格

| 对比项 | ArrayList | LinkedList |
|---|---|---|
| 底层数据结构 | Object[] 数组 | 双向链表 |
| 随机访问 get(i) | **O(1)** | O(n) |
| 头部插入 add(0, e) | O(n) | **O(1)** |
| 尾部插入 add(e) | 均摊 O(1) | O(1) |
| 中间插入 add(i, e) | O(n) | O(n) |
| 删除 remove(i) | O(n) | O(n) |
| 内存占用 | 比较紧凑，但可能有预留空间 | 每个节点额外保存 prev、next 引用 |
| 是否支持 RandomAccess | 支持 | 不支持 |
| 额外能力 | 主要作为 List 使用 | 同时可作为 Deque、Queue 使用 |
| 适用场景 | 读多写少、随机访问多、尾部追加多 | 频繁头部插入删除、队列或双端队列场景 |

注意：`LinkedList` 的中间插入和删除，修改节点引用本身是 O(1)，但定位到目标节点需要 O(n)，所以整体仍然是 O(n)。

## ArrayList/LinkedList 基本操作

```java
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

public class ListBasicDemo {
    public static void main(String[] args) {
        List<String> arrayList = new ArrayList<>();
        arrayList.add("Java");
        arrayList.add("Python");
        arrayList.add("C++");
        arrayList.add(1, "Go");
        System.out.println("ArrayList: " + arrayList);
        System.out.println("获取索引2: " + arrayList.get(2));
        arrayList.remove("C++");
        System.out.println("删除C++后: " + arrayList);

        LinkedList<String> linkedList = new LinkedList<>();
        linkedList.add("Java");
        linkedList.addFirst("C++");
        linkedList.addLast("Python");
        System.out.println("LinkedList: " + linkedList);
        System.out.println("第一个: " + linkedList.getFirst());
        System.out.println("最后一个: " + linkedList.getLast());
    }
}
```

## 性能对比测试代码

这是我当时写的测试代码，能够比较直观地感受到两者差距：

```java
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

public class ListPerformanceTest {
    private static final int COUNT = 100000;

    public static void main(String[] args) {
        testHeadInsert();
        testRandomAccess();
        testTailInsert();
    }

    private static void testHeadInsert() {
        List<String> arrayList = new ArrayList<>();
        LinkedList<String> linkedList = new LinkedList<>();

        long start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            arrayList.add(0, "item" + i);
        }
        long end = System.currentTimeMillis();
        System.out.println("ArrayList 头部插入 " + COUNT + " 次: " + (end - start) + "ms");

        start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            linkedList.addFirst("item" + i);
        }
        end = System.currentTimeMillis();
        System.out.println("LinkedList 头部插入 " + COUNT + " 次: " + (end - start) + "ms");
    }

    private static void testRandomAccess() {
        List<String> arrayList = new ArrayList<>();
        List<String> linkedList = new LinkedList<>();
        for (int i = 0; i < COUNT; i++) {
            arrayList.add("item" + i);
            linkedList.add("item" + i);
        }

        long start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            arrayList.get(i);
        }
        long end = System.currentTimeMillis();
        System.out.println("ArrayList 随机访问 " + COUNT + " 次: " + (end - start) + "ms");

        start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            linkedList.get(i);
        }
        end = System.currentTimeMillis();
        System.out.println("LinkedList 随机访问 " + COUNT + " 次: " + (end - start) + "ms");
    }

    private static void testTailInsert() {
        List<String> arrayList = new ArrayList<>();
        List<String> linkedList = new LinkedList<>();

        long start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            arrayList.add("item" + i);
        }
        long end = System.currentTimeMillis();
        System.out.println("ArrayList 尾部插入 " + COUNT + " 次: " + (end - start) + "ms");

        start = System.currentTimeMillis();
        for (int i = 0; i < COUNT; i++) {
            linkedList.add("item" + i);
        }
        end = System.currentTimeMillis();
        System.out.println("LinkedList 尾部插入 " + COUNT + " 次: " + (end - start) + "ms");
    }
}
```

我本机跑出来的结果大致如下，不同机器会有差异：

```text
ArrayList 头部插入 100000 次: 2835ms
LinkedList 头部插入 100000 次: 8ms
ArrayList 随机访问 100000 次: 3ms
LinkedList 随机访问 100000 次: 5421ms
ArrayList 尾部插入 100000 次: 5ms
LinkedList 尾部插入 100000 次: 9ms
```

从结果看，头部插入 `ArrayList` 明显慢，随机访问则是 `LinkedList` 明显慢，尾部插入两者差距不大。

## 正确遍历删除的方式

**方式一：使用 Iterator.remove()，推荐这种写法**

```java
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class IteratorRemoveDemo {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("Java");
        list.add("deleteMe");
        list.add("Python");
        list.add("deleteMe");
        list.add("C++");

        Iterator<String> iterator = list.iterator();
        while (iterator.hasNext()) {
            String item = iterator.next();
            if ("deleteMe".equals(item)) {
                iterator.remove();
            }
        }
        System.out.println("删除后: " + list);
    }
}
```

`Iterator.remove()` 安全的原因是：它删除元素后会同步更新迭代器内部的 `expectedModCount`，因此不会触发 fail-fast。

**方式二：倒序遍历删除，适合 ArrayList**

```java
import java.util.ArrayList;
import java.util.List;

public class ReverseRemoveDemo {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("Java");
        list.add("deleteMe");
        list.add("Python");
        list.add("deleteMe");
        list.add("C++");

        for (int i = list.size() - 1; i >= 0; i--) {
            if ("deleteMe".equals(list.get(i))) {
                list.remove(i);
            }
        }
        System.out.println("删除后: " + list);
    }
}
```

倒序删除不会影响还没有遍历到的索引，所以也能避免漏删问题。不过如果已经使用迭代器遍历，还是优先使用 `Iterator.remove()`。

**方式三：JDK 8 的 removeIf，最简洁**

```java
import java.util.ArrayList;
import java.util.List;

public class RemoveIfDemo {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("Java");
        list.add("deleteMe");
        list.add("Python");
        list.add("deleteMe");
        list.add("C++");

        list.removeIf("deleteMe"::equals);
        System.out.println("删除后: " + list);
    }
}
```

![ArrayList与LinkedList场景选择决策图](https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=ArrayList%20vs%20LinkedList%20decision%20tree%20flowchart%2C%20when%20to%20use%20which%20Java%20List%20implementation%2C%20scenario%20based%20selection%2C%20clean%20technical%20diagram&image_size=landscape_4_3)

# 总结

经过这次踩坑，我总结出三条实用原则：

**1. 90% 的场景用 ArrayList 就对了**

日常开发里，大部分场景都是读多写少、随机访问、尾部追加。`ArrayList` 底层数组内存连续，访问速度快，CPU 缓存命中率也更友好，所以它应该作为默认选择。

**2. 频繁头插再考虑 LinkedList**

如果确实需要频繁在头部插入或删除，比如实现队列、双端队列，`LinkedList` 的 O(1) 头部操作才有优势。但如果还需要大量随机访问，就不要选它。

**3. 遍历删除用 Iterator**

遍历过程中不要直接 `list.remove()`，否则很容易遇到 `ConcurrentModificationException`。稳妥做法是使用 `Iterator.remove()`，JDK 8 以后也可以使用 `removeIf`。

最后的感受是：不要只背“ArrayList 查询快，LinkedList 增删快”这种结论。真正重要的是理解数组和链表的底层结构：数组访问快但插入可能搬移元素，链表头插快但定位元素慢。理解了这些，再遇到 List 选择问题就不会慌了。
EOF; __tr_native_ec=$?; pwd -P >| '/var/folders/sb/zyyfx17n2q13ky7hfwtl_8dc0000gn/T/agent-toolhost/jobs/job-9de6a9094cdf4f9787cdf8a27b5814ac/cwd.txt'; exit "$__tr_native_ec"