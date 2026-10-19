/**
 * 让文章的分类/标签渲染顺序确定化。
 *
 * 背景: Hexo 的 post.tags / post.categories 是 Warehouse 查询对象,其迭代
 * 顺序取决于文章被处理的先后,而后者会随文件 mtime 变化。结果是同一份源码
 * 在不同机器、不同次构建上生成标签顺序不同的 HTML,表现为"源码没改"的部署
 * 仍改写了 atom.xml 与文章页。
 *
 * 做法: 生成前把每篇的分类与标签按名称排序。只影响顺序,不改内容与时间字段。
 */
hexo.extend.filter.register('before_generate', function () {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN');

  hexo.locals.get('posts').each(post => {
    for (const key of ['tags', 'categories']) {
      const list = post[key];
      if (list && typeof list.toArray === 'function') {
        const sorted = list.toArray().sort(byName);
        list.data = sorted;          // Warehouse Query 内部存放结果的字段
        list.length = sorted.length;
      }
    }
  });
});
