/**
 * ブログの更新情報（RSS、/feed.xml）を、書き出したサイト（dist/client）に足す。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 * 記事の一覧の読み方は scripts/built-posts.mjs（下書きの記事は入らない）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dist, readBuiltPosts } from './built-posts.mjs';
/** フィードに入れる記事の数（新しい順） */
const MAX_ITEMS = 20;

// サイトの名前・URL・説明は、トップのページに書き出されたものから読む（content/site.ts）
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
const meta = (property) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(
    home,
  )?.[1];
const siteUrl = meta('og:url')?.replace(/\/$/, '');
const siteTitle = meta('og:site_name');
const siteDescription = meta('description') ?? '';
if (!siteUrl || !siteTitle) {
  throw new Error('[feed] トップのページに og:url / og:site_name がありません');
}

const posts = await readBuiltPosts();

const items = posts.slice(0, MAX_ITEMS).map((post) => {
  const url = `${siteUrl}/blog/${post.slug}`;
  return [
    '    <item>',
    `      <title>${escape(post.title ?? post.slug)}</title>`,
    `      <link>${url}</link>`,
    `      <guid isPermaLink="true">${url}</guid>`,
    post.date ? `      <pubDate>${toRfc822(post.date)}</pubDate>` : '',
    post.category ? `      <category>${escape(post.category)}</category>` : '',
    post.summary
      ? `      <description>${escape(post.summary)}</description>`
      : '',
    '    </item>',
  ]
    .filter(Boolean)
    .join('\n');
});

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(siteTitle)}</title>
    <link>${siteUrl}/</link>
    <description>${escape(siteDescription)}</description>
    <language>ja</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`;

await writeFile(path.join(dist, 'feed.xml'), feed);
console.log(`[feed] ${items.length} 本の記事を feed.xml に書きました`);

/** 2026-10-09 → 日本時間のその日 0時を、RSS の日付の書き方にする */
function toRfc822(date) {
  return new Date(`${date}T00:00:00+09:00`).toUTCString();
}

function escape(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
