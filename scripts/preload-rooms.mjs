/**
 * 作品・アバターのページ（dist/client/work/*.html・avatar/*.html）に、その部屋のプログラムの先読み
 * （<link rel="modulepreload">）を書き足す。npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 部屋のプログラムは、トップを軽くするため、部屋を開くときに読む（components/site-app.tsx の roomModules）。
 * 共有されたリンクから作品・アバターのページを開いたときは、はじめから部屋が開いているので、
 * ページのプログラムが動き始めてから読みに行くと、その分だけ作品やアバターが出るのが遅れる。
 * 先読みを書いておくと、ページのプログラムといっしょに読み始められる。
 *
 * 部屋のプログラムのファイル名には中身のハッシュが入っていて、公開のたびに変わるので、
 * 書き出したファイルから探して書く（部屋のプログラムが読む、ほかのファイルもたどる）
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'client');
const chunksDir = path.join(dist, '_next', 'static', 'chunks');
const chunkUrl = (name) => `/_next/static/chunks/${name}`;

/** ページのフォルダと、その部屋のプログラムの名前の始まり */
const ROOMS = [
  { dir: 'work', chunk: 'works-room-' },
  { dir: 'avatar', chunk: 'avatar-room-' },
];

const chunkNames = await readdir(chunksDir);

/** そのファイルと、そこから読まれる（import）ファイルを、すべて */
async function withImports(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  const code = await readFile(path.join(chunksDir, name), 'utf8');
  // 最初に読む import だけ（あとから読む import(...) は、要るときに読む）
  for (const [, imported] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
    await withImports(imported, seen);
  }
  return seen;
}

let pages = 0;
for (const { dir, chunk } of ROOMS) {
  const name = chunkNames.find((item) => item.startsWith(chunk) && item.endsWith('.js'));
  if (!name) throw new Error(`[preload-rooms] ${chunk}*.js が見つかりません`);
  const files = await withImports(name);
  const pageDir = path.join(dist, dir);
  for (const file of await readdir(pageDir)) {
    if (!file.endsWith('.html')) continue;
    const htmlPath = path.join(pageDir, file);
    const html = await readFile(htmlPath, 'utf8');
    if (html.includes('data-room-preload')) continue;
    // ページがもう読んでいるファイルは書かない
    const links = [...files]
      .filter((item) => !html.includes(chunkUrl(item)))
      .map((item) => `<link rel="modulepreload" href="${chunkUrl(item)}" crossorigin="" data-room-preload>`)
      .join('');
    await writeFile(htmlPath, html.replace('</head>', `${links}</head>`));
    pages += 1;
  }
}
console.log(`[preload-rooms] 作品・アバターの ${pages} ページに、部屋のプログラムの先読みを書きました`);
