import { Marked } from 'marked';
import type { Post, PostWithBody } from '@/lib/post-meta';

/**
 * content/posts/*.md を読み込んで記事にする（サーバー側だけで使う）。
 * ブラウザ側では lib/post-meta.ts の型と関数だけを使う。
 */

// ビルド時に .md の中身を文字列として取り込む（scripts/vite-markdown.ts）
const files = import.meta.glob<string>('/content/posts/*.md', {
  import: 'default',
  eager: true,
});

const markdown = new Marked({ gfm: true, breaks: true });

/** 公開する記事を、新しい順に返す（draft: true の記事は除く） */
export function getPosts(): Post[] {
  return allPosts().map(({ html: _html, ...post }) => post);
}

export function getPost(slug: string): PostWithBody | undefined {
  return allPosts().find((post) => post.slug === slug);
}

function allPosts(): PostWithBody[] {
  return Object.entries(files)
    .map(([path, source]) => parsePost(path, source))
    .filter((post): post is PostWithBody => post !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function parsePost(path: string, source: string): PostWithBody | null {
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  const { meta, body } = splitFrontMatter(source);
  if (meta.draft === 'true') return null;
  if (!meta.title || !meta.date) {
    console.warn(`[blog] ${slug}.md: title と date は必須です`);
    return null;
  }

  return {
    slug,
    title: meta.title,
    date: meta.date,
    category: meta.category,
    summary: meta.summary,
    thumbnail: meta.thumbnail,
    thumbnailAlt: meta.thumbnailAlt,
    html: toHtml(body),
  };
}

/**
 * 先頭の --- で囲んだ部分（フロントマター）を「キー: 値」として読む。
 * 1行1項目だけの簡単な形式に限る。
 */
function splitFrontMatter(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  const meta: Record<string, string> = {};
  if (!match) return { meta, body: source };

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (key) meta[key] = value;
  }
  return { meta, body: source.slice(match[0].length) };
}

function toHtml(body: string) {
  return (
    (markdown.parse(body, { async: false }) as string)
      // 外部リンクは新しいタブで開く
      .replaceAll(
        /<a href="(https?:\/\/[^"]+)"/g,
        '<a href="$1" target="_blank" rel="noreferrer"',
      )
      // 画像は見える位置に来てから読み込む
      .replaceAll('<img ', '<img loading="lazy" ')
  );
}
