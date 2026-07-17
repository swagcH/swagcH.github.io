'use strict';

const { stripHTML } = require('hexo-util');

function collectionToNames(collection) {
  if (!collection) return [];
  const items = typeof collection.toArray === 'function' ? collection.toArray() : collection;
  return Array.prototype.map.call(items, item => item.name).filter(Boolean);
}

function normalizeExcerpt(post) {
  const source = post.excerpt || post.content || '';
  return stripHTML(source).replace(/\s+/g, ' ').trim().slice(0, 150);
}

function resolveCover(post) {
  if (post.cover) return post.cover;
  const image = String(post.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return image ? image[1] : '';
}

function calculateReadingMinutes(post) {
  const text = stripHTML(post.content || '').replace(/\s+/g, ' ').trim();
  return Math.max(1, Math.ceil(text.length / 450));
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function formatOptionalDate(value) {
  if (!value) return '';
  if (typeof value.format === 'function') return value.format('YYYY-MM-DD');
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function matchesAny(values, patterns) {
  return patterns.some(pattern => values.some(value =>
    String(value).toLowerCase().includes(String(pattern).toLowerCase())
  ));
}

function resolvePosts(titles, postByTitle, context) {
  return normalizeArray(titles).map(title => {
    const post = postByTitle.get(title);
    if (!post) hexo.log.warn(`[brand-data] ${context} 引用了不存在的文章：${title}`);
    return post;
  }).filter(Boolean);
}

hexo.extend.generator.register('design-data', locals => {
  const root = hexo.config.root || '/';
  const posts = locals.posts.sort('-date').filter(post => post.published !== false).map(post => ({
    title: post.title,
    url: root + post.path,
    date: post.date.format('YYYY-MM-DD'),
    year: post.date.format('YYYY'),
    monthDay: post.date.format('MM-DD'),
    categories: collectionToNames(post.categories),
    tags: collectionToNames(post.tags),
    excerpt: normalizeExcerpt(post),
    cover: resolveCover(post),
    readingMinutes: calculateReadingMinutes(post),
    verified: formatOptionalDate(post.verified),
    environment: normalizeArray(post.environment),
    series: []
  }));

  const categoryCounts = {};
  posts.forEach(post => post.categories.forEach(name => {
    categoryCounts[name] = (categoryCounts[name] || 0) + 1;
  }));

  const categories = Object.keys(categoryCounts).map(name => ({
    name,
    count: categoryCounts[name]
  })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));

  const brandConfig = (locals.data && locals.data.brand) || {};
  const postByTitle = new Map(posts.map(post => [post.title, post]));

  // 品牌配置只保存稳定的文章标题，构建阶段负责解析 URL 并建立专题成员关系。
  const series = normalizeArray(brandConfig.series).map(item => {
    const seriesPosts = resolvePosts(item.posts, postByTitle, `专题 ${item.title}`);
    seriesPosts.forEach((post, index) => {
      post.series.push({
        slug: item.slug,
        title: item.title,
        index: index + 1,
        total: seriesPosts.length
      });
    });
    return {
      slug: item.slug,
      tone: item.tone || 'default',
      eyebrow: item.eyebrow || '',
      title: item.title,
      description: item.description,
      outcome: item.outcome,
      readingMinutes: seriesPosts.reduce((total, post) => total + post.readingMinutes, 0),
      posts: seriesPosts
    };
  });

  const tracks = normalizeArray(brandConfig.tracks).map(track => {
    const categoryPatterns = normalizeArray(track.categories);
    const tagPatterns = normalizeArray(track.tags);
    const trackPosts = posts.filter(post =>
      matchesAny(post.categories, categoryPatterns) || matchesAny(post.tags, tagPatterns)
    );
    return {
      slug: track.slug,
      title: track.title,
      description: track.description,
      keywords: track.keywords,
      icon: track.icon,
      count: trackPosts.length,
      posts: trackPosts
    };
  });

  const featured = resolvePosts(brandConfig.featured, postByTitle, '首页精选');

  return {
    path: 'design-data.json',
    data: JSON.stringify({
      posts,
      categories,
      brand: {
        profile: brandConfig.profile || {},
        tracks,
        series,
        featured
      }
    })
  };
});
