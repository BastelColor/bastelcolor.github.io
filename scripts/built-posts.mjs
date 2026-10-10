/**
 * 書き出したサイト（dist/client）にある記事の一覧を読む。
 * scripts/write-feed.mjs（RSS）と scripts/write-post-cards.mjs（共有カードの画像）で使う
 * （root・dist は、ほかの書き出しのあとの処理でも使う）。
 *
 * 記事の一覧は、実際に書き出された記事のページから作る（下書きの記事は書き出されないので入らない）。
 * タイトル・日付・カテゴリ・紹介文などは、それぞれの記事の .md の先頭（--- で囲んだ部分）から読む。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const dist = path.join(root, 'dist', 'client');
const postsDir = path.join(root, 'content', 'posts');

/** 記事が1本も無いときに作られる、空のページ（app/(site)/blog/[slug]/page.tsx） */
const NO_POSTS_SLUG = 'no-posts';

/** 書き出された記事を、新しい順に返す（{ slug, title, date, category, summary, thumbnail, ... }） */
export async function readBuiltPosts() {
  const slugs = (await readdir(path.join(dist, 'blog')).catch(() => []))
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.replace(/\.html$/, ''))
    .filter((slug) => slug !== NO_POSTS_SLUG);

  const posts = await Promise.all(
    slugs.map(async (slug) => {
      const source = await readFile(path.join(postsDir, `${slug}.md`), 'utf8');
      return { slug, ...readFrontMatter(source) };
    }),
  );
  return posts.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/** 先頭の --- で囲んだ部分を「キー: 値」として読む（lib/posts.ts と同じ書き方） */
function readFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  const result = {};
  if (!match) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    result[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}
