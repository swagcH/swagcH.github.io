(function() {
  'use strict';

  var TAG_RULES = [
    { keyword: /java|jvm|juc|线程|并发|锁/i, tag: 'Java' },
    { keyword: /spring|微服务|接口|架构/i, tag: 'Backend' },
    { keyword: /mysql|redis|rabbitmq|数据库|缓存/i, tag: 'Data' },
    { keyword: /linux|nginx|docker|部署|运维/i, tag: 'DevOps' }
  ];

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
      return;
    }
    callback();
  }

  function createElement(tagName, className, html) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (html) element.innerHTML = html;
    return element;
  }

  function readPageConfig() {
    var configNode = document.querySelector('.next-config[data-name="page"]');
    if (!configNode) return {};

    try {
      return JSON.parse(configNode.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function markPageType() {
    var pageConfig = readPageConfig();
    if (pageConfig.isHome || document.querySelector('.main-inner.index')) {
      document.body.classList.add('modern-home-page');
    }
    if (pageConfig.isPost || document.querySelector('.main-inner.post article.post-content')) {
      document.body.classList.add('modern-post-page');
    }
  }

  function installHeaderScrollState() {
    function updateHeader() {
      document.body.classList.toggle('modern-scrolled', window.pageYOffset > 24);
    }

    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  function installHomeHero() {
    var container = document.querySelector('.main-inner.index');
    if (!container || container.querySelector('.modern-home-hero')) return;

    var postCount = document.querySelector('.site-state-posts .site-state-item-count');
    var categoryCount = document.querySelector('.site-state-categories .site-state-item-count');
    var tagCount = document.querySelector('.site-state-tags .site-state-item-count');
    var hero = createElement('section', 'modern-home-hero',
      '<div class="modern-hero-kicker">JAVA / BACKEND / ARCHITECTURE / DEVOPS</div>' +
      '<h2>杰尼龟的笔记</h2>' +
      '<p>记录后端工程实践、架构演进与线上问题排查，把踩过的坑沉淀成可复用的答案。</p>' +
      '<div class="modern-hero-actions">' +
        '<a class="modern-action modern-action-primary" href="/archives/"><i class="fa fa-book-open"></i>浏览文章</a>' +
        '<a class="modern-action" href="/tags/"><i class="fa fa-code-branch"></i>技术标签</a>' +
        '<a class="modern-action" href="https://github.com/swagcH" rel="noopener" target="_blank"><i class="fab fa-github"></i>GitHub</a>' +
      '</div>'
    );
    var stats = createElement('section', 'modern-tech-panel',
      '<div class="modern-tech-card"><strong>' + (postCount ? postCount.textContent.trim() : '62') + '</strong><span>技术文章</span></div>' +
      '<div class="modern-tech-card"><strong>' + (categoryCount ? categoryCount.textContent.trim() : '19') + '</strong><span>主题分类</span></div>' +
      '<div class="modern-tech-card"><strong>' + (tagCount ? tagCount.textContent.trim() : '191') + '</strong><span>知识标签</span></div>'
    );

    container.insertBefore(stats, container.firstChild);
    container.insertBefore(hero, stats);
  }

  function inferTags(article) {
    var text = article.textContent || '';
    return TAG_RULES.filter(function(rule) {
      return rule.keyword.test(text);
    }).map(function(rule) {
      return rule.tag;
    }).slice(0, 3);
  }

  function getArticleTags(article) {
    var links = article.querySelectorAll('.post-footer .post-tags a');
    return Array.prototype.map.call(links, function(link) {
      return link.textContent.replace(/^#\s*/, '').trim();
    }).filter(Boolean).slice(0, 3);
  }

  function decoratePosts() {
    document.querySelectorAll('.post-block article.post-content').forEach(function(article) {
      var header = article.querySelector('.post-header');
      if (!header || header.querySelector('.modern-post-tags')) return;

      var tags = getArticleTags(article);
      if (!tags.length) tags = inferTags(article);
      if (!tags.length) tags = ['Engineering'];

      var wrapper = createElement('div', 'modern-post-tags');
      tags.forEach(function(tag) {
        var badge = createElement('span');
        badge.textContent = '#' + tag;
        wrapper.appendChild(badge);
      });
      header.appendChild(wrapper);
    });
  }

  function calculateReadingMinutes(articleBody) {
    var text = (articleBody.textContent || '').trim();
    var chineseCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
    var latinWords = text.replace(/[\u3400-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil((chineseCharacters + latinWords) / 450));
  }

  function installArticleDetails() {
    var article = document.querySelector('.main-inner.post article.post-content');
    if (!article) return;

    var header = article.querySelector('.post-header');
    var body = article.querySelector('.post-body');
    var title = article.querySelector('.post-title');
    if (!header || !body || !title) return;

    if (!header.querySelector('.modern-post-breadcrumb')) {
      var breadcrumb = createElement('nav', 'modern-post-breadcrumb');
      breadcrumb.setAttribute('aria-label', '面包屑导航');
      var home = createElement('a');
      home.href = '/';
      home.textContent = '首页';
      breadcrumb.appendChild(home);
      breadcrumb.appendChild(createElement('span', '', '/'));

      var categoryLink = header.querySelector('.post-meta a');
      var section = createElement('span');
      section.textContent = categoryLink ? categoryLink.textContent.trim() : '文章';
      breadcrumb.appendChild(section);
      breadcrumb.appendChild(createElement('span', '', '/'));

      var current = createElement('span', 'modern-post-breadcrumb-current');
      current.textContent = title.textContent.trim();
      breadcrumb.appendChild(current);
      header.insertBefore(breadcrumb, header.firstChild);
    }

    var meta = header.querySelector('.post-meta');
    if (meta && !meta.querySelector('.modern-reading-time')) {
      var readingTime = createElement('span', 'post-meta-item modern-reading-time');
      readingTime.innerHTML = '<span class="post-meta-item-icon"><i class="far fa-clock"></i></span>' +
        '<span class="post-meta-item-text">约 ' + calculateReadingMinutes(body) + ' 分钟</span>';
      meta.appendChild(readingTime);
    }

    var toc = document.querySelector('.post-toc');
    if (toc && !toc.querySelector('.modern-toc-heading')) {
      toc.insertBefore(createElement('div', 'modern-toc-heading', '// 文章目录'), toc.firstChild);
    }
  }

  ready(function() {
    markPageType();
    installHeaderScrollState();
    installHomeHero();
    decoratePosts();
    installArticleDetails();
  });
})();
