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
    readingMinutes: calculateReadingMinutes(post)
  }));

  const categoryCounts = {};
  posts.forEach(post => post.categories.forEach(name => {
    categoryCounts[name] = (categoryCounts[name] || 0) + 1;
  }));

  const categories = Object.keys(categoryCounts).map(name => ({
    name,
    count: categoryCounts[name]
  })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));

  return {
    path: 'design-data.json',
    data: JSON.stringify({ posts, categories })
  };
});
