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
    var pageClasses = ['editorial-home-page', 'editorial-post-page', 'editorial-about-page', 'editorial-category-page', 'editorial-archive-page', 'editorial-series-page'];
    pageClasses.forEach(function(className) { body.classList.remove(className); });

    if (pageConfig.isHome || query('.main-inner.index')) body.classList.add('editorial-home-page');
    if (pageConfig.isPost || query('.main-inner.post article.post-content')) body.classList.add('editorial-post-page');
    if (query('.about-page') || normalizePath(location.pathname) === '/about/') body.classList.add('editorial-about-page');
    if (query('.category-all-page') || normalizePath(location.pathname) === '/categories/') body.classList.add('editorial-category-page');
    if (query('.main-inner.archive')) body.classList.add('editorial-archive-page');
    if (query('.series-page') || normalizePath(location.pathname) === '/series/') body.classList.add('editorial-series-page');
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

    var links = createElement('nav', 'editorial-footer-links');
    links.setAttribute('aria-label', '页脚导航');
    links.appendChild(createLink('', '/series/', '专题'));
    links.appendChild(createLink('', 'https://github.com/swagcH', 'GitHub'));
    links.lastChild.target = '_blank';
    links.lastChild.rel = 'noopener';
    links.appendChild(createLink('', '/atom.xml', 'RSS'));
    footerInner.insertBefore(links, query('.copyright', footerInner));
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
    copy.appendChild(createElement('p', 'home-kicker', 'JAVA BACKEND · RELIABILITY · AI CODING'));
    copy.appendChild(createElement('h1', '', '杰尼龟的笔记'));
    copy.appendChild(createElement('span', 'page-hero-line'));
    copy.appendChild(createElement('p', 'home-description', 'Java 后端工程师的实践笔记，聚焦可维护代码、系统稳定性与 AI 编程工作流。'));

    var actions = createElement('div', 'home-actions');
    var seriesLink = createLink('home-primary-link', '/series/', '查看代表专题');
    seriesLink.appendChild(createIcon('fa fa-arrow-right'));
    actions.appendChild(seriesLink);
    actions.appendChild(createLink('', '/about/', '了解我与职业方向'));
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
    if (!intro || intro.dataset.brandReady) return;
    intro.dataset.brandReady = 'true';

    var brand = data.brand || {};
    var profile = brand.profile || {};
    var kicker = query('.home-kicker', intro);
    var heading = query('h1', intro);
    var description = query('.home-description', intro);
    if (profile.eyebrow) kicker.textContent = profile.eyebrow;
    if (profile.title) heading.textContent = profile.title;
    if (profile.description) description.textContent = profile.description;

    var actions = query('.home-actions', intro);
    if (actions && profile.primary_action && profile.secondary_action) {
      actions.textContent = '';
      var primary = createLink('home-primary-link', profile.primary_action.url, profile.primary_action.label);
      primary.appendChild(createIcon('fa fa-arrow-right'));
      actions.appendChild(primary);
      actions.appendChild(createLink('', profile.secondary_action.url, profile.secondary_action.label));
    }

    var stats = createElement('div', 'home-stats');
    [
      [profile.start_year || '2018', '记录至今'],
      [data.posts.length, '篇实践文章'],
      [(brand.series || []).length || profile.core_tracks || 3, '条代表专题']
    ].forEach(function(item) {
      var stat = createElement('span');
      stat.appendChild(createElement('strong', '', String(item[0])));
      stat.appendChild(document.createTextNode(item[1]));
      stats.appendChild(stat);
    });
    query('.home-intro-copy', intro).appendChild(stats);

    var listHeading = query('.home-list-heading');
    if (listHeading && brand.series && brand.series.length) {
      listHeading.parentNode.insertBefore(createHomeSeriesSection(brand.series), listHeading);
    }
    if (listHeading && brand.featured && brand.featured.length) {
      listHeading.parentNode.insertBefore(createFeaturedSection(brand.featured), listHeading);
    }

    separateHomeAnnouncement(profile.announcement, listHeading, data.posts);

    var visibleBlocks = queryAll('.main-inner.index .post-block');
    visibleBlocks.forEach(function(block, index) {
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

  function createHomeSeriesSection(series) {
    var section = createElement('section', 'home-brand-section home-series-section');
    var heading = createElement('header', 'home-section-heading');
    var titleGroup = createElement('div');
    titleGroup.appendChild(createElement('p', 'home-section-kicker', 'START HERE'));
    titleGroup.appendChild(createElement('h2', '', '代表专题'));
    heading.appendChild(titleGroup);
    heading.appendChild(createLink('', '/series/', '浏览全部专题'));
    section.appendChild(heading);

    var grid = createElement('div', 'home-series-grid');
    series.slice(0, 3).forEach(function(item, index) {
      var card = createLink('home-series-card tone-' + item.tone, '/series/#' + item.slug, '');
      card.appendChild(createElement('span', 'series-card-index', '0' + (index + 1)));
      card.appendChild(createElement('p', 'series-card-eyebrow', item.eyebrow));
      card.appendChild(createElement('h3', '', item.title));
      card.appendChild(createElement('p', 'series-card-description', item.description));
      card.appendChild(createElement('span', 'series-card-meta', item.posts.length + ' 篇 · ' + item.readingMinutes + ' 分钟'));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function createFeaturedSection(posts) {
    var section = createElement('section', 'home-brand-section home-featured-section');
    var heading = createElement('header', 'home-section-heading');
    var titleGroup = createElement('div');
    titleGroup.appendChild(createElement('p', 'home-section-kicker', 'SELECTED WORK'));
    titleGroup.appendChild(createElement('h2', '', '精选文章'));
    heading.appendChild(titleGroup);
    heading.appendChild(createLink('', '/archives/', '查看全部文章'));
    section.appendChild(heading);

    var list = createElement('div', 'home-featured-list');
    posts.slice(0, 4).forEach(function(post, index) {
      var item = createElement('article', 'home-featured-item');
      item.appendChild(createElement('span', 'featured-index', String(index + 1).padStart(2, '0')));
      var content = createElement('div');
      content.appendChild(createElement('p', 'featured-meta', (post.categories[0] || '技术文章') + ' · ' + post.readingMinutes + ' 分钟'));
      content.appendChild(createLink('', post.url, post.title));
      content.appendChild(createElement('p', 'featured-excerpt', post.excerpt));
      item.appendChild(content);
      var arrow = createLink('featured-arrow', post.url, '');
      arrow.title = '阅读《' + post.title + '》';
      arrow.setAttribute('aria-label', arrow.title);
      arrow.appendChild(createIcon('fa fa-arrow-right'));
      item.appendChild(arrow);
      list.appendChild(item);
    });
    section.appendChild(list);
    return section;
  }

  function separateHomeAnnouncement(announcement, listHeading, posts) {
    if (!announcement || !listHeading) return;
    var targetPost = findPostByUrl(posts, announcement.url);
    var targetBlock = queryAll('.main-inner.index .post-block').find(function(block) {
      var link = query('.post-title-link', block);
      return link && normalizePath(link.getAttribute('href')) === normalizePath(announcement.url);
    });
    if (!targetPost || !targetBlock) return;

    var notice = createLink('home-announcement', targetPost.url, '');
    notice.appendChild(createElement('span', '', announcement.label || '站点更新'));
    notice.appendChild(createElement('strong', '', announcement.title || targetPost.title));
    notice.appendChild(createElement('small', '', targetPost.excerpt));
    notice.appendChild(createIcon('fa fa-arrow-right'));
    listHeading.parentNode.insertBefore(notice, listHeading);
    targetBlock.remove();
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
      block.insertBefore(createPageHero('能力方向', '从职业能力与工程问题出发浏览文章', 'category-hero'), block.firstChild);
    }

    var list = query('.category-list', categoryPage);
    if (!list || list.classList.contains('category-grid')) return;
    list.classList.add('category-grid', 'is-legacy-directory');

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

    var categoryAll = query('.category-all', categoryPage);
    if (categoryAll && !query('.legacy-category-heading', categoryAll)) {
      var historyHeading = createElement('header', 'section-heading legacy-category-heading');
      historyHeading.appendChild(createElement('h2', '', '历史分类索引'));
      historyHeading.appendChild(createElement('span'));
      categoryAll.insertBefore(historyHeading, list);
    }

    if (items.length && !query('.category-expand', categoryPage)) {
      var expandButton = createElement('button', 'category-expand', '查看 ' + items.length + ' 个历史分类');
      expandButton.type = 'button';
      expandButton.setAttribute('aria-expanded', 'false');
      expandButton.addEventListener('click', function() {
        var expanded = list.classList.toggle('is-expanded');
        expandButton.textContent = expanded ? '收起历史分类' : '查看 ' + items.length + ' 个历史分类';
        expandButton.setAttribute('aria-expanded', String(expanded));
      });
      categoryAll.appendChild(expandButton);
    }
  }

  function applyCategoryData(data) {
    var categoryPage = query('.category-all-page');
    if (!categoryPage || categoryPage.dataset.brandReady) return;
    categoryPage.dataset.brandReady = 'true';

    var tracks = data.brand && data.brand.tracks ? data.brand.tracks : [];
    if (tracks.length) {
      categoryPage.parentNode.insertBefore(createCareerTrackSection(tracks), categoryPage);
    }

    var section = createElement('section', 'category-featured');
    var heading = createElement('header', 'section-heading');
    heading.appendChild(createElement('h2', '', '代表内容'));
    heading.appendChild(createElement('span'));
    section.appendChild(heading);

    var selected = data.brand && data.brand.featured ? data.brand.featured.slice(0, 3) : data.posts.slice(0, 3);

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

  function createCareerTrackSection(tracks) {
    var section = createElement('section', 'career-track-section');
    var heading = createElement('header', 'section-heading');
    heading.appendChild(createElement('h2', '', '七个能力方向'));
    heading.appendChild(createElement('span'));
    section.appendChild(heading);

    var grid = createElement('div', 'career-track-grid');
    tracks.forEach(function(track) {
      var card = createElement('article', 'career-track-card');
      var cardHeader = createElement('header');
      var icon = createElement('span', 'career-track-icon');
      icon.appendChild(createIcon(track.icon || 'fa fa-code'));
      cardHeader.appendChild(icon);
      cardHeader.appendChild(createElement('span', 'career-track-count', track.count + ' 篇相关内容'));
      card.appendChild(cardHeader);
      card.appendChild(createLink('career-track-title', '/archives/?track=' + encodeURIComponent(track.slug), track.title));
      card.appendChild(createElement('p', 'career-track-description', track.description));
      card.appendChild(createElement('p', 'career-track-keywords', track.keywords));

      var posts = createElement('div', 'career-track-posts');
      track.posts.slice(0, 2).forEach(function(post) {
        posts.appendChild(createLink('', post.url, post.title));
      });
      card.appendChild(posts);
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function renderSeriesPage(data) {
    var page = query('.series-page');
    var series = data.brand && data.brand.series ? data.brand.series : [];
    if (!page || page.dataset.brandReady || !series.length) return;
    page.dataset.brandReady = 'true';
    page.textContent = '';
    page.appendChild(createPageHero('代表专题', '沿着完整路径阅读，而不是在标签之间来回跳转', 'series-hero'));

    var overview = createElement('section', 'series-overview');
    overview.appendChild(createElement('p', 'series-overview-kicker', 'CURATED LEARNING PATHS'));
    overview.appendChild(createElement('h2', '', '三条路径，呈现完整的工程能力'));
    overview.appendChild(createElement('p', '', '每条专题都从基础认知走向真实案例与复盘，适合招聘方快速了解技术判断，也适合开发者按顺序系统阅读。'));
    page.appendChild(overview);

    series.forEach(function(item, seriesIndex) {
      var section = createElement('section', 'series-detail tone-' + item.tone);
      section.id = item.slug;
      var header = createElement('header', 'series-detail-header');
      header.appendChild(createElement('span', 'series-detail-index', '0' + (seriesIndex + 1)));
      var copy = createElement('div', 'series-detail-copy');
      copy.appendChild(createElement('p', 'series-detail-eyebrow', item.eyebrow));
      copy.appendChild(createElement('h2', '', item.title));
      copy.appendChild(createElement('p', 'series-detail-description', item.description));
      copy.appendChild(createElement('p', 'series-detail-outcome', '完成这条路径：' + item.outcome));
      header.appendChild(copy);
      var metrics = createElement('div', 'series-detail-metrics');
      metrics.appendChild(createElement('strong', '', item.posts.length + ' 篇'));
      metrics.appendChild(createElement('span', '', item.readingMinutes + ' 分钟'));
      header.appendChild(metrics);
      section.appendChild(header);

      var list = createElement('div', 'series-reading-list');
      item.posts.forEach(function(post, postIndex) {
        var row = createElement('article', 'series-reading-item');
        row.appendChild(createElement('span', 'series-reading-index', String(postIndex + 1).padStart(2, '0')));
        var content = createElement('div');
        content.appendChild(createLink('', post.url, post.title));
        content.appendChild(createElement('p', '', post.excerpt));
        content.appendChild(createElement('small', '', post.date + ' · ' + post.readingMinutes + ' 分钟阅读'));
        row.appendChild(content);
        var arrow = createLink('series-reading-arrow', post.url, '');
        arrow.title = '阅读《' + post.title + '》';
        arrow.setAttribute('aria-label', arrow.title);
        arrow.appendChild(createIcon('fa fa-arrow-right'));
        row.appendChild(arrow);
        list.appendChild(row);
      });
      section.appendChild(list);
      page.appendChild(section);
    });
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
    var tracks = data.brand && data.brand.tracks ? data.brand.tracks : [];
    var filters = [{ slug: 'all', title: '全部', posts: data.posts }].concat(tracks);
    filters.forEach(function(item, index) {
      var button = createElement('button', index === 0 ? 'is-active' : '', item.title);
      button.type = 'button';
      button.dataset.track = item.slug;
      button.setAttribute('aria-pressed', String(index === 0));
      filterBar.appendChild(button);
    });
    page.appendChild(filterBar);

    var list = createElement('div', 'archive-timeline');
    page.appendChild(list);
    container.appendChild(page);

    function updateArchive(trackSlug, updateUrl) {
      var selected = filters.find(function(item) { return item.slug === trackSlug; }) || filters[0];
      renderArchiveGroups(list, selected.posts);
      queryAll('button', filterBar).forEach(function(button) {
        var active = button.dataset.track === selected.slug;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (updateUrl && window.history && window.history.replaceState) {
        var nextUrl = selected.slug === 'all' ? '/archives/' : '/archives/?track=' + encodeURIComponent(selected.slug);
        window.history.replaceState({}, '', nextUrl);
      }
    }

    filterBar.addEventListener('click', function(event) {
      var button = event.target.closest('button');
      if (button) updateArchive(button.dataset.track, true);
    });
    var requestedTrack = new URLSearchParams(location.search).get('track') || 'all';
    updateArchive(requestedTrack, false);
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

    installArticleToc(article, body);
    installShareActions(article, title.textContent.trim());
  }

  function installArticleToc(article, body) {
    var headings = queryAll('h2, h3', body).filter(function(heading) {
      return heading.textContent.trim().length > 0;
    });
    if (headings.length < 2 || query('.post-reading-layout', article)) return;

    headings.forEach(function(heading, index) {
      if (!heading.id) heading.id = 'section-' + (index + 1);
      heading.style.scrollMarginTop = '24px';
    });

    var layout = createElement('div', 'post-reading-layout');
    body.parentNode.insertBefore(layout, body);

    var inlineToc = createElement('details', 'post-inline-toc');
    inlineToc.appendChild(createElement('summary', '', '本文目录 · ' + headings.length + ' 节'));
    inlineToc.appendChild(createTocList(headings, 'post-inline-toc-list'));
    layout.appendChild(inlineToc);
    layout.appendChild(body);

    var aside = createElement('aside', 'post-toc-rail');
    aside.setAttribute('aria-label', '文章目录');
    var asideInner = createElement('div', 'post-toc-inner');
    asideInner.appendChild(createElement('p', 'post-toc-label', 'ON THIS PAGE'));
    asideInner.appendChild(createTocList(headings, 'post-toc-list'));
    aside.appendChild(asideInner);
    layout.appendChild(aside);

    if ('IntersectionObserver' in window) {
      var links = queryAll('a', aside);
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function(link) {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      }, { rootMargin: '-18% 0px -70% 0px' });
      headings.forEach(function(heading) { observer.observe(heading); });
    }
  }

  function createTocList(headings, className) {
    var list = createElement('ol', className);
    headings.forEach(function(heading, index) {
      var item = createElement('li', heading.tagName === 'H3' ? 'depth-3' : 'depth-2');
      var link = createLink('', '#' + heading.id, '');
      link.appendChild(createElement('span', '', String(index + 1).padStart(2, '0')));
      link.appendChild(document.createTextNode(heading.textContent.trim()));
      item.appendChild(link);
      list.appendChild(item);
    });
    return list;
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
      }).catch(function() {
        copyButton.title = '复制失败，请手动复制地址栏链接';
      });
    });
    actions.appendChild(copyButton);

    var issueTitle = '文章纠错：' + title;
    var issueBody = '文章地址：' + location.href + '\n\n问题描述：\n';
    var issueLink = createLink(
      'post-share-icon',
      'https://github.com/swagcH/swagcH.github.io/issues/new?title=' + encodeURIComponent(issueTitle) + '&body=' + encodeURIComponent(issueBody),
      ''
    );
    issueLink.target = '_blank';
    issueLink.rel = 'noopener';
    issueLink.title = '反馈文章问题';
    issueLink.setAttribute('aria-label', '反馈文章问题');
    issueLink.appendChild(createIcon('fa fa-bug'));
    actions.appendChild(issueLink);
    footer.insertBefore(actions, query('.post-nav', footer));
  }

  function applyPostData(data) {
    var article = query('.main-inner.post article.post-content');
    var block = article && article.parentNode;
    if (!article || !block) return;

    var current = findPostByUrl(data.posts, location.pathname);
    if (!current) return;
    installPostProof(article, current);
    installSeriesNavigation(block, current, data.brand && data.brand.series ? data.brand.series : []);
    if (query('.related-reading', block)) return;

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

  function installPostProof(article, post) {
    if (query('.post-proof-strip', article)) return;
    var hasSeries = post.series && post.series.length;
    if (!post.verified && !post.environment.length && !hasSeries) return;

    var strip = createElement('section', 'post-proof-strip');
    strip.setAttribute('aria-label', '文章校验信息');
    if (hasSeries) {
      var membership = post.series[0];
      var seriesLink = createLink('post-proof-series', '/series/#' + membership.slug, '');
      seriesLink.appendChild(createIcon('fa fa-layer-group'));
      seriesLink.appendChild(document.createTextNode(membership.title + ' · ' + membership.index + '/' + membership.total));
      strip.appendChild(seriesLink);
    }
    if (post.verified) {
      var verified = createElement('span', 'post-proof-verified');
      verified.appendChild(createIcon('fa fa-check-circle'));
      verified.appendChild(document.createTextNode('校验于 ' + post.verified));
      strip.appendChild(verified);
    }
    post.environment.forEach(function(item) {
      strip.appendChild(createElement('span', 'post-proof-environment', item));
    });

    var layout = query('.post-reading-layout', article) || query('.post-body', article);
    article.insertBefore(strip, layout);
  }

  function installSeriesNavigation(block, post, seriesList) {
    if (query('.post-series-navigation', block) || !post.series || !post.series.length) return;
    var membership = post.series[0];
    var series = seriesList.find(function(item) { return item.slug === membership.slug; });
    if (!series) return;

    var currentIndex = series.posts.findIndex(function(item) {
      return normalizePath(item.url) === normalizePath(post.url);
    });
    if (currentIndex < 0) return;

    var section = createElement('section', 'post-series-navigation');
    var header = createElement('header');
    var label = createElement('div');
    label.appendChild(createElement('p', '', '继续阅读专题'));
    label.appendChild(createLink('', '/series/#' + series.slug, series.title));
    header.appendChild(label);
    header.appendChild(createElement('span', '', (currentIndex + 1) + ' / ' + series.posts.length));
    section.appendChild(header);

    var links = createElement('div', 'post-series-links');
    appendSeriesDirection(links, series.posts[currentIndex - 1], '上一篇');
    appendSeriesDirection(links, series.posts[currentIndex + 1], '下一篇');
    section.appendChild(links);
    block.appendChild(section);
  }

  function appendSeriesDirection(container, post, label) {
    if (!post) {
      var empty = createElement('span', 'post-series-link is-empty');
      empty.appendChild(createElement('small', '', label));
      empty.appendChild(createElement('strong', '', '已经到达专题边界'));
      container.appendChild(empty);
      return;
    }
    var link = createLink('post-series-link', post.url, '');
    link.appendChild(createElement('small', '', label));
    link.appendChild(createElement('strong', '', post.title));
    container.appendChild(link);
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
    if (document.body.classList.contains('editorial-series-page')) renderSeriesPage(data);
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
