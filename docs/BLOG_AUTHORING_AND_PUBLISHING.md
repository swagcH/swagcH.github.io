# 博客写作、样式修改与发布指南

本文用于在一台新电脑上维护“杰尼龟的笔记”，包括环境初始化、文章编写、样式与页面功能修改、本地预览、Git 提交和线上发布。

## 1. 仓库与分支说明

仓库地址：<https://github.com/swagcH/swagcH.github.io>

当前博客采用两个分支：

| 分支 | 用途 | 是否直接编辑 |
| --- | --- | --- |
| `source` | Hexo 源码、Markdown 文章、主题样式和页面脚本 | 是 |
| `main` | Hexo 生成后的静态网页，由 GitHub Pages 对外提供 | 否 |

维护博客时必须从 `source` 分支开始。不要直接修改 `main`，也不要直接修改 `public/` 中的生成文件。

## 2. 新电脑首次初始化

### 2.1 安装基础环境

建议安装：

- Git
- Node.js 20 LTS
- GitHub CLI，可选但推荐
- 任意 Markdown 编辑器或 IntelliJ IDEA

检查环境：

```bash
git --version
node --version
npm --version
```

### 2.2 登录 GitHub

使用 GitHub CLI：

```bash
gh auth login
gh auth setup-git
```

也可以使用 SSH Key 或 Git Credential Manager。GitHub 不支持使用账号密码直接推送代码。

### 2.3 克隆源码分支

```bash
git clone --branch source --single-branch \
  https://github.com/swagcH/swagcH.github.io.git myblog-source

cd myblog-source
npm ci
```

`npm ci` 会严格按照 `package-lock.json` 安装依赖，适合在不同电脑之间保持一致的构建环境。

## 3. 每次开始修改前

先确认当前目录和分支：

```bash
git branch --show-current
git status
```

当前分支必须是 `source`。然后同步最新源码：

```bash
git switch source
git pull --ff-only origin source
```

如果 `git pull --ff-only` 失败，不要强制推送。先检查本地是否存在尚未提交的修改，并解决分支差异。

## 4. 新增文章

### 4.1 创建文章文件

文章统一放在：

```text
source/_posts/
```

建议文件名包含日期，便于检索：

```text
source/_posts/2026-07-18-文章标题.md
```

也可以使用 Hexo 命令创建：

```bash
npx hexo new post "文章标题"
```

### 4.2 文章模板

```markdown
---
title: 文章标题
date: 2026-07-18 10:00:00
updated: 2026-07-18 10:00:00
verified: '2026-07-18'
environment: [JDK 8, Spring Boot 2.x, MySQL 8]
tags: [Java, Spring Boot, 性能优化]
categories: Java进阶
keywords: Java性能优化, Spring Boot性能问题
cover: /images/posts/2026/article-cover.png
---

![文章封面](/images/posts/2026/article-cover.png)

这里填写文章摘要。摘要应直接说明问题背景、目标和最终结论。

<!-- more -->

## 问题背景

正文内容。

## 定位过程

正文内容。

## 解决方案

正文内容。

## 验证结果

正文内容。

## 总结

正文内容。
```

字段说明：

- `title`：文章标题；加入专题时必须与 `brand.yml` 中的标题完全一致。
- `date`：首次发布时间。
- `updated`：最近一次实质性修改时间。
- `verified`：最近一次验证文章结论的日期。
- `environment`：实际验证过的技术版本，不确定时不要编造。
- `tags`：具体技术关键词。
- `categories`：文章的主要分类，建议只保留一个主分类。
- `keywords`：用于搜索引擎识别文章主题。
- `cover`：社交分享和文章列表使用的封面图。
- `<!-- more -->`：该标记之前的内容会作为首页摘要。

### 4.3 添加封面图

封面图建议使用 `1280 x 720` PNG，放在：

```text
source/images/posts/年份/
```

例如：

```text
source/images/posts/2026/article-cover.png
```

文章中的路径必须以 `/images/` 开头，不要使用本机绝对路径。

### 4.4 加入专题或首页精选

编辑：

```text
source/_data/brand.yml
```

- `tracks`：定义七个职业能力方向及其分类规则。
- `series`：定义有顺序的专题阅读路径。
- `featured`：定义首页精选文章。

加入 `series.posts` 或 `featured` 时使用文章的完整标题，且必须与文章头部的 `title` 完全一致。

## 5. 修改博客样式和功能

主要文件分工：

| 文件 | 作用 |
| --- | --- |
| `source/_data/styles.styl` | 颜色、字体、间距、布局和响应式样式 |
| `source/js/custom-modern.js` | 首页、分类、归档、专题、文章目录等交互 |
| `source/_data/brand.yml` | 个人品牌定位、能力方向、专题和精选文章 |
| `scripts/design-data.js` | 将 Hexo 内容组织成页面所需的数据结构 |
| `_config.next.yml` | NexT 主题导航、文章元信息和 Open Graph 配置 |
| `_config.yml` | 站点标题、链接规则、构建和部署配置 |
| `source/about/index.md` | 关于我、技术能力和职业方向 |
| `source/series/index.md` | 专题页的基础页面 |

修改 `source/js/custom-modern.js` 后，应同步更新 `source/_data/body-end.njk` 中的版本参数，例如：

```html
<script src="/js/custom-modern.js?v=20260718a"></script>
```

这样可以避免线上浏览器继续使用旧脚本缓存。

修改样式或页面功能时至少检查：

- 桌面端宽度约 `1440px`。
- 手机端宽度约 `390px`。
- 页面没有横向滚动条。
- 导航菜单、分类展开、归档筛选和文章目录可以操作。
- 图片正常加载，文字没有重叠。
- 首页、专题、分类、归档、关于和文章详情页均能打开。

## 6. 本地构建和预览

每次提交前执行：

```bash
npm run clean
npm run build
npm run server
```

浏览器访问：

```text
http://localhost:4000/
```

`npm run server` 会持续运行。完成检查后，在终端按 `Ctrl + C` 停止。

构建失败时先解决错误，不要直接发布。

## 7. 提交源码

### 7.1 提交文章

建议明确指定文件，避免把 Hexo 缓存一起提交：

```bash
git add source/_posts/2026-07-18-文章标题.md
git add source/images/posts/2026/article-cover.png
git add source/_data/brand.yml

git diff --cached --check
git status
git commit -m "docs: add article title"
git push origin source
```

没有修改 `brand.yml` 或封面时，不需要添加对应文件。

### 7.2 提交样式和功能

```bash
git add _config.yml _config.next.yml
git add scripts/design-data.js
git add source/_data
git add source/js
git add source/about source/series

git diff --cached --check
git status
git commit -m "feat: update blog presentation"
git push origin source
```

提交前确认 `db.json` 没有进入暂存区。它是 Hexo 本地缓存，不应作为文章或样式修改提交。

检查方式：

```bash
git diff --cached --name-only
```

如果列表中出现 `db.json`，仅取消暂存，不删除本地文件：

```bash
git restore --staged db.json
```

## 8. 发布到线上

当前仓库没有配置从 `source` 自动构建的 GitHub Actions。因此，推送 `source` 后还必须在本地生成并发布 `main`。

```bash
npm run clean
npm run build
npm run deploy
```

`npm run deploy` 会根据 `_config.yml` 中的配置，将 `public/` 发布到远端 `main` 分支。

发布后检查：

1. 打开 <https://github.com/swagcH/swagcH.github.io/actions>。
2. 等待 `pages build and deployment` 显示成功。
3. 打开 <https://swagch.github.io/>。
4. 检查首页、文章链接、封面图和手机端布局。

GitHub Pages 通常需要几十秒完成缓存刷新。不要因为短时间内未变化而重复发布多次。

## 9. 日常完整流程

```bash
cd myblog-source
git switch source
git pull --ff-only origin source

# 编写文章或修改样式

npm run clean
npm run build
npm run server

# 本地验收完成后停止 server，再明确添加修改文件
git add path/to/changed-file
git diff --cached --check
git status
git commit -m "docs: describe this change"
git push origin source

npm run clean
npm run build
npm run deploy
```

## 10. 常见错误

### 只推送了 `source`，线上没有变化

原因：当前没有自动部署工作流。

处理：执行 `npm run clean`、`npm run build` 和 `npm run deploy`。

### 直接修改了 `main` 或 `public/`

这些内容会在下次构建时被覆盖。应回到 `source` 分支，修改真正的 Markdown、Stylus、JavaScript 或 YAML 源文件。

### 新文章没有进入专题

检查 `source/_data/brand.yml` 中的标题是否与文章的 `title` 完全一致，包括空格、英文大小写和标点符号。

### 新样式在线上没有生效

依次检查：

1. 是否重新执行了 `npm run clean` 和 `npm run build`。
2. 是否执行了 `npm run deploy`。
3. 修改 JavaScript 后是否更新了 `body-end.njk` 中的版本参数。
4. GitHub Pages 部署任务是否成功。
5. 浏览器是否仍在使用缓存。

### 推送时提示远端存在新提交

不要使用强制推送。先执行：

```bash
git pull --ff-only origin source
```

如果无法快进，先保存本地修改并检查提交历史，再处理冲突。

## 11. 回滚原则

发现线上问题时，不要直接删除 Git 历史。对源码提交执行反向提交：

```bash
git switch source
git pull --ff-only origin source
git revert <需要撤销的提交号>
git push origin source

npm run clean
npm run build
npm run deploy
```

回滚后仍需重新构建和发布 `main`，线上页面才会恢复。
