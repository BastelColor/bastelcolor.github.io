import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

/**
 * .md を「中身の文字列を default export するモジュール」として読み込む。
 * ブログ記事（content/posts/*.md）を lib/posts.ts の import.meta.glob で取り込むために使う。
 *
 * Vite 標準の ?raw でも読めるが、開発中に .md を保存すると ?raw の付かない形で
 * 読み直されて構文エラーになるため、拡張子で必ずこの形にする。
 */
export function markdownAsString(): Plugin {
  return {
    name: 'markdown-as-string',
    enforce: 'pre',
    async load(id) {
      const path = id.split('?')[0];
      if (!path.endsWith('.md')) return null;
      const source = await readFile(path, 'utf8');
      return `export default ${JSON.stringify(source)};`;
    },
  };
}
