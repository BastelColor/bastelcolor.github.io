/**
 * ブログ記事。content/posts/*.md を読み込んで作る。
 * 書き方は docs/content-guide.md の「ブログ」を参照。
 */
export type Post = {
  /** ファイル名（.md を除く）。記事の URL /blog/<slug> になる */
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  category?: string;
  /** 一覧と、SNS で共有したときに出る概要 */
  summary?: string;
  /** 一覧と記事の上に出す画像、SNS で共有したときの画像 */
  thumbnail?: string;
};

export type PostWithBody = Post & {
  /** 本文を HTML にしたもの */
  html: string;
};

/** 記事の日付を「2026.10.08」の形にする */
export function formatPostDate(date: string): string {
  return date.replaceAll('-', '.');
}
