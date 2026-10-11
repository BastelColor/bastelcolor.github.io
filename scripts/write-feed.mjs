/**
 * ブログの更新情報（RSS、/feed.xml）を、書き出したサイト（dist/client）に足す。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 * 記事の一覧の読み方は scripts/built-posts.mjs（下書きの記事は入らない）。
 *
 * それぞれの記事には、本文まるごと（content:encoded）と、サムネイルの画像（enclosure）も入れるので、
 * RSS リーダーの中で、画像つきで最後まで読める。本文は、書き出した記事のページの post-body から取る
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
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

const items = await Promise.all(
  posts.slice(0, MAX_ITEMS).map(async (post) => {
    const url = `${siteUrl}/blog/${post.slug}`;
    const page = await readFile(path.join(dist, 'blog', `${post.slug}.html`), 'utf8');
    const body = readPostBody(page);
    // サムネイルは、本文の先頭にも出す（enclosure を画像として出さない RSS リーダーもあるため）
    const thumbnail = post.thumbnail ? absolute(post.thumbnail) : null;
    const thumbnailSize = post.thumbnail
      ? await stat(path.join(dist, post.thumbnail)).then((file) => file.size, () => 0)
      : 0;
    const content = [
      thumbnail ? `<p><img src="${thumbnail}" alt="${escape(post.thumbnailAlt ?? '')}"></p>` : '',
      body ? absolutizeLinks(body) : '',
    ].join('');
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
      content ? `      <content:encoded>${cdata(content)}</content:encoded>` : '',
      thumbnail && thumbnailSize > 0
        ? `      <enclosure url="${thumbnail}" length="${thumbnailSize}" type="${imageType(thumbnail)}"/>`
        : '',
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n');
  }),
);

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
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

/** 書き出した記事のページから、本文（<div class="post-body"> の中身）を取り出す。見つからなければ null */
function readPostBody(page) {
  const open = '<div class="post-body">';
  const start = page.indexOf(open);
  if (start < 0) return null;
  // 中の <div> も数えて、対になる </div> までを取る
  const tag = /<div[\s>]|<\/div>/g;
  tag.lastIndex = start + open.length;
  let depth = 1;
  for (let match = tag.exec(page); match; match = tag.exec(page)) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return page.slice(start + open.length, match.index);
  }
  return null;
}

/** /posts/... のようなサイトの中の URL を、https://... から始まる URL にする */
function absolute(url) {
  return url.startsWith('/') ? `${siteUrl}${url}` : url;
}

/** 本文の中のリンク・画像の URL を、RSS リーダーからも開けるよう、https://... から始まる形にする */
function absolutizeLinks(html) {
  return html.replace(/\b(href|src)="(\/[^"]*)"/g, (_, name, url) => `${name}="${absolute(url)}"`);
}

/** CDATA の中に入れる（本文に ]]> があっても切れないよう、分けて入れる） */
function cdata(text) {
  return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

/** 画像のファイル名から、種類（MIME タイプ）を決める */
function imageType(url) {
  const extension = url.split('.').pop()?.toLowerCase();
  return (
    { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }[
      extension ?? ''
    ] ?? 'image/webp'
  );
}

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
