import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const MODULE_ID = 'virtual:post-thumbnails';
const RESOLVED_ID = `\0${MODULE_ID}`;

/**
 * 記事のサムネイルのうち、横長のもの（scripts/write-post-thumbnails.mjs が作った <名前>.wide.webp）があるものを、
 * `import wideThumbnails from 'virtual:post-thumbnails'` で読めるようにする（元の画像の URL → 横長の画像の URL）。
 *
 * 縦長の写真を記事の thumbnail に書いたときに、一覧・記事のいちばん上・共有したときのカードで、
 * 横長に作り直したものを使うため（lib/posts.ts）
 */
export function postThumbnails(): Plugin {
  const postsDir = path.resolve('public/posts');
  return {
    name: 'post-thumbnails',
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const wide: Record<string, string> = {};
      const folders = await readdir(postsDir).catch(() => []);
      for (const folder of folders) {
        const names = await readdir(path.join(postsDir, folder)).catch(() => []);
        for (const name of names) {
          if (!name.endsWith('.wide.webp')) continue;
          const base = name.slice(0, -'.wide.webp'.length);
          // 元の画像（拡張子は何でもよい）
          for (const original of names) {
            if (original === name || !original.startsWith(`${base}.`) || original.endsWith('.wide.webp')) continue;
            const exists = await access(path.join(postsDir, folder, original)).then(
              () => true,
              () => false,
            );
            if (exists) wide[`/posts/${folder}/${original}`] = `/posts/${folder}/${name}`;
          }
        }
      }
      return `export default ${JSON.stringify(wide)};`;
    },
  };
}
