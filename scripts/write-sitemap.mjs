/**
 * 書き出したサイト（dist/client）に、検索エンジン向けの2つのファイルを足す。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * - sitemap.xml: このサイトにあるページの一覧。公開した記事と、作品のページ（/work/<id>）は自動で入る
 * - robots.txt : すべてのページを見てよいことと、sitemap.xml の場所
 *
 * ページの一覧は、実際に書き出されたファイルから作る（下書きの記事は書き出されないので入らない）。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'client');
const postsDir = path.join(root, 'content', 'posts');

/** 記事が1本も無いときに作られる、空のページ（app/(site)/blog/[slug]/page.tsx） */
const NO_POSTS_SLUG = 'no-posts';

// サイトのURLは、トップのページに書き出された og:url から読む（content/site.ts の url）
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
const siteUrl = /<meta property="og:url" content="([^"]+)"/
  .exec(home)?.[1]
  ?.replace(/\/$/, '');
if (!siteUrl) throw new Error('[sitemap] トップのページに og:url がありません');

const slugs = (await readdir(path.join(dist, 'blog')).catch(() => []))
  .filter((name) => name.endsWith('.html'))
  .map((name) => name.replace(/\.html$/, ''))
  .filter((slug) => slug !== NO_POSTS_SLUG);

const posts = await Promise.all(
  slugs.map(async (slug) => {
    const source = await readFile(path.join(postsDir, `${slug}.md`), 'utf8');
    const date = /^date:\s*['"]?([\d-]+)/m.exec(source)?.[1];
    return { url: `${siteUrl}/blog/${slug}`, lastmod: date };
  }),
);
posts.sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));

// 作品の詳細のページ（app/(site)/work/[id]/page.tsx）
const workPages = (await readdir(path.join(dist, 'work')).catch(() => []))
  .filter((name) => name.endsWith('.html'))
  .map((name) => ({ url: `${siteUrl}/work/${name.replace(/\.html$/, '')}` }));

const pages = [
  { url: `${siteUrl}/`, lastmod: posts[0]?.lastmod },
  ...posts,
  ...workPages,
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) =>
      `  <url><loc>${page.url}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

await writeFile(path.join(dist, 'sitemap.xml'), sitemap);
await writeFile(path.join(dist, 'robots.txt'), robots);
console.log(`[sitemap] ${pages.length} ページを sitemap.xml に書きました`);
