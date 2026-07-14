(function() {
  'use strict';

  var DATA_URL = '/design-data.json';
  var DEFAULT_COVER = '/images/blog-hero-code.png';
  var dataRequest;

  var CATEGORY_DETAILS = [
    { test: /Java|Spring/, description: 'Java 语言、Spring 生态与服务端开发基础', keywords: 'Java · Spring · JVM · Web' },
    { test: /数据库|MySQL|Redis/, description: '数据建模、查询优化与缓存实践', keywords: 'MySQL · Redis · SQL · Cache' },
    { test: /架构|接口/, description: '系统边界、服务治理与架构演进思考', keywords: 'Architecture · API · Microservice' },
    { test: /故障|问题|运维|部署/, description: '从日志、监控到生产问题的定位与复盘', keywords: 'Linux · Docker · Observability' },
    { test: /工程|项目|开发工具/, description: '围绕质量、协作和交付效率的工程方法', keywords: 'Git · Maven · CI/CD · Review' },
    { test: /经验|随笔|成长/, description: '技术之外的学习方法、复盘和成长记录', keywords: 'Learning · Writing · Review' }
  ];

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
      return;
    }
    callback();
  }

  function query(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function queryAll(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function createIcon(className) {
    return createElement('i', className);
  }

  function createLink(className, href, text) {
    var link = createElement('a', className, text);
    link.href = href;
    return link;
  }

  function normalizePath(path) {
    var normalized = path || '/';
    try {
      normalized = decodeURIComponent(normalized);
    } catch (error) {
      normalized = path || '/';
    }
    normalized = normalized.replace(/index\.html$/, '').replace(/\/+$/, '/');
    return normalized.charAt(0) === '/' ? normalized : '/' + normalized;
  }

  function readPageConfig() {
    var configNode = query('.next-config[data-name="page"]');
    if (!configNode) return {};
    try {
      return JSON.parse(configNode.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function loadDesignData() {
    if (!dataRequest) {
      dataRequest = window.fetch(DATA_URL, { credentials: 'same-origin' }).then(function(response) {
        if (!response.ok) throw new Error('design data request failed');
        return response.json();
      });
    }
    return dataRequest;
  }

  function markPageType() {
    var pageConfig = readPageConfig();
    var body = document.body;
    var pageClasses = ['editorial-home-page', 'editorial-post-page', 'editorial-about-page', 'editorial-category-page', 'editorial-archive-page'];
    pageClasses.forEach(function(className) { body.classList.remove(className); });

    if (pageConfig.isHome || query('.main-inner.index')) body.classList.add('editorial-home-page');
    if (pageConfig.isPost || query('.main-inner.post article.post-content')) body.classList.add('editorial-post-page');
    if (query('.about-page') || normalizePath(location.pathname) === '/about/') body.classList.add('editorial-about-page');
    if (query('.category-all-page') || normalizePath(location.pathname) === '/categories/') body.classList.add('editorial-category-page');
    if (query('.main-inner.archive')) body.classList.add('editorial-archive-page');
  }

  function createPageHero(title, subtitle, className) {
    var hero = createElement('section', 'page-hero ' + (className || ''));
    hero.appendChild(createElement('h1', '', title));
    hero.appendChild(createElement('span', 'page-hero-line'));
    hero.appendChild(createElement('p', '', subtitle));
    return hero;
  }

  function installHeader() {
    var toggle = query('.site-nav-toggle .toggle');
    var nav = query('.site-nav');
    if (!toggle || !nav || toggle.dataset.editorialReady) return;

    toggle.dataset.editorialReady = 'true';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function() {
      var open = document.body.classList.toggle('editorial-nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', function(event) {
      if (event.target.closest('a')) {
        document.body.classList.remove('editorial-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        document.body.classList.remove('editorial-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function installFooter() {
    var footerInner = query('.footer-inner');
    if (!footerInner || query('.editorial-footer-brand', footerInner)) return;
    var brand = createLink('editorial-footer-brand', '/', '杰尼龟的笔记');
    footerInner.insertBefore(brand, footerInner.firstChild);
  }

  function installSearchLayout() {
    var popup = query('.search-popup');
    var header = query('.search-header', popup);
    var input = query('.search-input', popup);
    var close = query('.popup-btn-close', popup);
    if (!popup || !header || !input || query('.search-page-heading', popup)) return;

    var heading = createElement('div', 'search-page-heading');
    heading.appendChild(createElement('h2', '', '搜索结果'));
    heading.appendChild(createElement('p', '', '检索博客中的文章与技术关键词'));
    popup.insertBefore(heading, header);
    input.placeholder = '输入文章标题或关键词';

    var submit = createElement('button', 'search-submit', '搜索');
    submit.type = 'button';
    submit.addEventListener('click', function() {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    header.insertBefore(submit, close);
  }

  function installHomeBase() {
    var container = query('.main-inner.index');
    if (!container || query('.editorial-home-intro', container)) return;

    var intro = createElement('section', 'editorial-home-intro');
    var avatar = createElement('img', 'home-avatar');
    avatar.src = '/images/avatar.png';
    avatar.alt = '无敌杰尼龟的头像';
    intro.appendChild(avatar);

    var copy = createElement('div', 'home-intro-copy');
    copy.appendChild(createElement('p', 'home-kicker', 'JAVA · BACKEND · ENGINEERING'));
    copy.appendChild(createElement('h1', '', '杰尼龟的笔记'));
    copy.appendChild(createElement('span', 'page-hero-line'));
    copy.appendChild(createElement('p', 'home-description', '记录后端开发、架构演进与线上问题排查，把真实经验整理成可以再次使用的答案。'));

    var actions = createElement('div', 'home-actions');
    var archiveLink = createLink('home-primary-link', '/archives/', '浏览全部文章');
    archiveLink.appendChild(createIcon('fa fa-arrow-right'));
    actions.appendChild(archiveLink);
    actions.appendChild(createLink('', '/about/', '关于作者'));
    copy.appendChild(actions);
    intro.appendChild(copy);

    var firstPost = query('.post-block', container);
    container.insertBefore(intro, firstPost || container.firstChild);
    if (firstPost) {
      var heading = createElement('header', 'home-list-heading');
      heading.appendChild(createElement('h2', '', '最新文章'));
      heading.appendChild(createLink('', '/archives/', '查看归档'));
      container.insertBefore(heading, firstPost);
    }
  }

  function applyHomeData(data) {
    var intro = query('.editorial-home-intro');
    if (!intro || query('.home-stats', intro)) return;

    var tags = {};
    data.posts.forEach(function(post) {
      post.tags.forEach(function(tag) { tags[tag] = true; });
    });
    var stats = createElement('div', 'home-stats');
    [
      [data.posts.length, '篇文章'],
      [data.categories.length, '个分类'],
      [Object.keys(tags).length, '个标签']
    ].forEach(function(item) {
      var stat = createElement('span');
      stat.appendChild(createElement('strong', '', String(item[0])));
      stat.appendChild(document.createTextNode(item[1]));
      stats.appendChild(stat);
    });
    query('.home-intro-copy', intro).appendChild(stats);

    queryAll('.main-inner.index .post-block').forEach(function(block, index) {
      var titleLink = query('.post-title-link', block);
      if (!titleLink) return;
      var post = findPostByUrl(data.posts, titleLink.getAttribute('href'));
      block.style.setProperty('--post-index', '"' + String(index + 1).padStart(2, '0') + '"');
      if (!post) return;

      var body = query('.post-body', block);
      if (body) {
        body.textContent = '';
        body.appendChild(createElement('p', '', post.excerpt || '查看这篇技术笔记的完整内容。'));
        var readMore = createElement('div', 'post-button');
        readMore.appendChild(createLink('btn', post.url, '阅读全文  →'));
        body.appendChild(readMore);
      }

      if (!post.cover || query('.home-post-cover', block)) return;
      var coverLink = createLink('home-post-cover', post.url, '');
      var image = createElement('img');
      image.src = post.cover;
      image.alt = post.title + '封面';
      image.loading = 'lazy';
      coverLink.appendChild(image);
      query('article', block).appendChild(coverLink);
      block.classList.add('has-cover');
    });
  }

  function categoryDetail(name) {
    for (var index = 0; index < CATEGORY_DETAILS.length; index += 1) {
      if (CATEGORY_DETAILS[index].test.test(name)) return CATEGORY_DETAILS[index];
    }
    return {
      description: '持续整理 ' + name + ' 相关的学习笔记与实践记录',
      keywords: name + ' · Notes · Practice'
    };
  }

  function installCategoryBase() {
    var block = query('.editorial-category-page .post-block');
    var categoryPage = query('.category-all-page', block);
    if (!block || !categoryPage) return;

    if (!query('.page-hero', block)) {
      block.insertBefore(createPageHero('分类', '按技术领域浏览文章', 'category-hero'), block.firstChild);
    }

    var list = query('.category-list', categoryPage);
    if (!list || list.classList.contains('category-grid')) return;
    list.classList.add('category-grid');

    var items = queryAll('.category-list-item', list);
    items.sort(function(left, right) {
      return Number(query('.category-list-count', right).textContent) - Number(query('.category-list-count', left).textContent);
    }).forEach(function(item) {
      var link = query('.category-list-link', item);
      var count = query('.category-list-count', item);
      var detail = categoryDetail(link.textContent.trim());
      item.classList.add('category-card');
      count.textContent = count.textContent.trim() + ' 篇文章';
      item.appendChild(createElement('p', 'category-description', detail.description));
      item.appendChild(createElement('p', 'category-keywords', detail.keywords));
      list.appendChild(item);
    });

    if (items.length > 6 && !query('.category-expand', categoryPage)) {
      var expandButton = createElement('button', 'category-expand', '展开全部分类');
      expandButton.type = 'button';
      expandButton.setAttribute('aria-expanded', 'false');
      expandButton.addEventListener('click', function() {
        var expanded = list.classList.toggle('is-expanded');
        expandButton.textContent = expanded ? '收起分类' : '展开全部分类';
        expandButton.setAttribute('aria-expanded', String(expanded));
      });
      query('.category-all', categoryPage).appendChild(expandButton);
    }
  }

  function applyCategoryData(data) {
    var categoryPage = query('.category-all-page');
    if (!categoryPage || query('.category-featured')) return;

    var section = createElement('section', 'category-featured');
    var heading = createElement('header', 'section-heading');
    heading.appendChild(createElement('h2', '', '分类精选文章'));
    heading.appendChild(createElement('span'));
    section.appendChild(heading);

    var selected = [];
    data.categories.slice(0, 8).some(function(category) {
      var post = data.posts.find(function(item) {
        return item.categories.indexOf(category.name) > -1 && selected.indexOf(item) === -1;
      });
      if (post) selected.push(post);
      return selected.length === 3;
    });

    var list = createElement('div', 'category-featured-list');
    selected.forEach(function(post) {
      var item = createElement('article');
      item.appendChild(createElement('span', 'featured-category', post.categories[0] || '文章'));
      var content = createElement('div');
      content.appendChild(createLink('', post.url, post.title));
      content.appendChild(createElement('p', '', post.date + ' · ' + post.readingMinutes + ' 分钟阅读'));
      item.appendChild(content);
      list.appendChild(item);
    });
    section.appendChild(list);
    categoryPage.parentNode.appendChild(section);
  }

  function installArchiveFallback() {
    var container = query('.main-inner.archive');
    if (!container || query('.page-hero', container)) return;
    container.insertBefore(createPageHero('归档', '按时间线浏览所有文章', 'archive-hero'), container.firstChild);
  }

  function renderArchivePage(data) {
    var container = query('.main-inner.archive');
    if (!container || container.dataset.editorialReady) return;
    container.dataset.editorialReady = 'true';
    container.textContent = '';

    var page = createElement('div', 'archive-page');
    page.appendChild(createPageHero('归档', '按时间线浏览所有文章', 'archive-hero'));
    var filterBar = createElement('div', 'archive-filters');
    var categories = ['全部'].concat(data.categories.slice(0, 7).map(function(category) { return category.name; }));
    categories.forEach(function(name, index) {
      var button = createElement('button', index === 0 ? 'is-active' : '', name);
      button.type = 'button';
      button.dataset.category = name;
      button.setAttribute('aria-pressed', String(index === 0));
      filterBar.appendChild(button);
    });
    page.appendChild(filterBar);

    var list = createElement('div', 'archive-timeline');
    page.appendChild(list);
    container.appendChild(page);

    function updateArchive(category) {
      var posts = category === '全部' ? data.posts : data.posts.filter(function(post) {
        return post.categories.indexOf(category) > -1;
      });
      renderArchiveGroups(list, posts);
      queryAll('button', filterBar).forEach(function(button) {
        var active = button.dataset.category === category;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    filterBar.addEventListener('click', function(event) {
      var button = event.target.closest('button');
      if (button) updateArchive(button.dataset.category);
    });
    updateArchive('全部');
  }

  function renderArchiveGroups(container, posts) {
    container.textContent = '';
    if (!posts.length) {
      container.appendChild(createElement('p', 'archive-empty', '该分类暂无文章'));
      return;
    }

    var grouped = {};
    posts.forEach(function(post) {
      if (!grouped[post.year]) grouped[post.year] = [];
      grouped[post.year].push(post);
    });

    Object.keys(grouped).sort(function(left, right) { return Number(right) - Number(left); }).forEach(function(year) {
      var group = createElement('section', 'archive-year-group');
      group.appendChild(createElement('h2', '', year));
      var rows = createElement('div', 'archive-rows');
      grouped[year].forEach(function(post) {
        var row = createElement('article', 'archive-row');
        var time = createElement('time', '', post.monthDay);
        time.dateTime = post.date;
        row.appendChild(time);
        row.appendChild(createLink('archive-post-link', post.url, post.title));
        row.appendChild(createElement('span', 'archive-category', post.categories[0] || '未分类'));
        rows.appendChild(row);
      });
      group.appendChild(rows);
      container.appendChild(group);
    });
  }

  function calculateReadingMinutes(body) {
    var text = (body.textContent || '').replace(/\s+/g, ' ').trim();
    return Math.max(1, Math.ceil(text.length / 450));
  }

  function installPostBase() {
    var article = query('.main-inner.post article.post-content');
    if (!article || article.dataset.editorialReady) return;
    article.dataset.editorialReady = 'true';

    var header = query('.post-header', article);
    var body = query('.post-body', article);
    var title = query('.post-title', header);
    if (!header || !body || !title) return;

    var categoryLink = query('.post-meta [itemprop="about"] a', header);
    var date = query('.post-meta time', header);
    var minutes = calculateReadingMinutes(body);
    var authorBar = createElement('div', 'post-author-bar');
    var author = createElement('div', 'post-author-identity');
    var avatar = createElement('img');
    avatar.src = '/images/avatar.png';
    avatar.alt = '无敌杰尼龟的头像';
    author.appendChild(avatar);
    var authorText = createElement('span');
    authorText.appendChild(createElement('strong', '', '无敌杰尼龟'));
    authorText.appendChild(createElement('small', '', 'Java 后端开发者'));
    author.appendChild(authorText);
    authorBar.appendChild(author);

    var quickMeta = createElement('div', 'post-quick-meta');
    quickMeta.appendChild(createElement('span', '', date ? date.textContent.trim().replace(/-/g, '.') : ''));
    quickMeta.appendChild(createElement('span', '', minutes + ' 分钟阅读'));
    if (categoryLink) quickMeta.appendChild(createLink('', categoryLink.href, categoryLink.textContent.trim()));
    authorBar.appendChild(quickMeta);
    article.insertBefore(authorBar, header);

    var badge = createElement('span', 'post-category-badge', categoryLink ? categoryLink.textContent.trim() : '技术笔记');
    header.insertBefore(badge, title);
    var summaryParagraph = queryAll('p', body).find(function(paragraph) {
      return paragraph.textContent.trim().length >= 32;
    });
    if (summaryParagraph) {
      var summary = summaryParagraph.textContent.replace(/\s+/g, ' ').trim();
      header.appendChild(createElement('p', 'post-deck', summary.slice(0, 128) + (summary.length > 128 ? '…' : '')));
    }

    installShareActions(article, title.textContent.trim());
  }

  function installShareActions(article, title) {
    var footer = query('.post-footer', article);
    if (!footer || query('.post-share-actions', footer)) return;

    var actions = createElement('div', 'post-share-actions');
    actions.appendChild(createElement('span', '', '分享'));
    var xLink = createLink('post-share-icon', 'https://x.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(location.href), '');
    xLink.target = '_blank';
    xLink.rel = 'noopener';
    xLink.title = '分享到 X';
    xLink.setAttribute('aria-label', '分享到 X');
    xLink.appendChild(createIcon('fab fa-x-twitter'));
    actions.appendChild(xLink);

    var copyButton = createElement('button', 'post-share-icon');
    copyButton.type = 'button';
    copyButton.title = '复制文章链接';
    copyButton.setAttribute('aria-label', '复制文章链接');
    copyButton.appendChild(createIcon('fa fa-link'));
    copyButton.addEventListener('click', function() {
      navigator.clipboard.writeText(location.href).then(function() {
        copyButton.classList.add('is-copied');
        copyButton.title = '链接已复制';
        setTimeout(function() {
          copyButton.classList.remove('is-copied');
          copyButton.title = '复制文章链接';
        }, 1600);
      });
    });
    actions.appendChild(copyButton);
    footer.insertBefore(actions, query('.post-nav', footer));
  }

  function applyPostData(data) {
    var article = query('.main-inner.post article.post-content');
    var block = article && article.parentNode;
    if (!article || !block || query('.related-reading', block)) return;

    var current = findPostByUrl(data.posts, location.pathname);
    if (!current) return;
    var related = data.posts.filter(function(post) {
      return normalizePath(post.url) !== normalizePath(current.url);
    }).map(function(post) {
      var categoryScore = post.categories.filter(function(name) { return current.categories.indexOf(name) > -1; }).length * 5;
      var tagScore = post.tags.filter(function(name) { return current.tags.indexOf(name) > -1; }).length * 2;
      return { post: post, score: categoryScore + tagScore };
    }).sort(function(left, right) {
      return right.score - left.score || right.post.date.localeCompare(left.post.date);
    }).slice(0, 3).map(function(item) { return item.post; });

    var section = createElement('section', 'related-reading');
    var heading = createElement('header', 'related-heading');
    heading.appendChild(createElement('h2', '', '推荐阅读'));
    heading.appendChild(createLink('', '/archives/', '查看全部'));
    section.appendChild(heading);
    var grid = createElement('div', 'related-grid');
    related.forEach(function(post) { grid.appendChild(createRelatedCard(post)); });
    section.appendChild(grid);
    block.appendChild(section);
  }

  function createRelatedCard(post) {
    var card = createElement('article', 'related-card');
    var imageLink = createLink('related-cover', post.url, '');
    var image = createElement('img');
    image.src = post.cover || DEFAULT_COVER;
    image.alt = post.title + '封面';
    image.loading = 'lazy';
    imageLink.appendChild(image);
    card.appendChild(imageLink);
    var content = createElement('div', 'related-content');
    content.appendChild(createLink('', post.url, post.title));
    content.appendChild(createElement('p', '', (post.categories[0] || '技术笔记') + ' · ' + post.readingMinutes + ' 分钟阅读'));
    card.appendChild(content);
    return card;
  }

  function findPostByUrl(posts, url) {
    var path = normalizePath(url);
    return posts.find(function(post) { return normalizePath(post.url) === path; });
  }

  function applyPageData(data) {
    if (document.body.classList.contains('editorial-home-page')) applyHomeData(data);
    if (document.body.classList.contains('editorial-category-page')) applyCategoryData(data);
    if (document.body.classList.contains('editorial-archive-page')) renderArchivePage(data);
    if (document.body.classList.contains('editorial-post-page')) applyPostData(data);
  }

  function initialize() {
    markPageType();
    installHeader();
    installFooter();
    installSearchLayout();
    if (document.body.classList.contains('editorial-home-page')) installHomeBase();
    if (document.body.classList.contains('editorial-category-page')) installCategoryBase();
    if (document.body.classList.contains('editorial-archive-page')) installArchiveFallback();
    if (document.body.classList.contains('editorial-post-page')) installPostBase();
    loadDesignData().then(applyPageData).catch(function(error) {
      console.warn('[editorial-theme] 页面增强数据加载失败，已保留 Hexo 原生内容。', error);
    });
  }

  ready(initialize);
  document.addEventListener('pjax:success', initialize);
})();
