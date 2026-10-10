/**
 * 書き出したサイト（dist/client）に、service worker（sw.js）を足す。
 * npm run build のあとに自動で実行される（package.json の postbuild。フォントを作り終えたあとに）。
 *
 * 中身は scripts/service-worker.js。そこへ次の2つを埋める
 * - PRECACHE: トップのページと、それを表示するのに要るもの（プログラム・CSS・トップ用のフォント・アイコン）
 * - VERSION : PRECACHE の中身から作った印。公開し直して中身が変わると、前に取っておいたものを捨てて取り直す
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'client');

const home = await readFile(path.join(dist, 'index.html'), 'utf8');

// トップのページが読むもの（同じサイトの中のものだけ）
const urls = new Set(['/', '/manifest.webmanifest', '/icon.png']);
for (const [, url] of home.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
  if (/^\/(?:_next\/static\/|fonts\/)/.test(url)) urls.add(url);
}
// トップ用の小さいフォント（ページの <style> の中に書かれている）
for (const [, url] of home.matchAll(/url\((\/fonts\/[^)]+-home\.woff2)\)/g)) {
  urls.add(url);
}
const precache = [...urls].sort();

// 中身の印は、ページとファイルの名前から作る（プログラムの名前には中身のハッシュが入っている）
const version = createHash('sha256')
  .update(home)
  .update(precache.join('\n'))
  .digest('hex')
  .slice(0, 12);

const source = await readFile(path.join(root, 'scripts', 'service-worker.js'), 'utf8');
const replace = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`[sw] ${from} が service-worker.js にありません`);
  return text.replace(from, to);
};
let output = replace(source, "const VERSION = 'dev';", `const VERSION = '${version}';`);
output = replace(output, 'const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache)};`);
await writeFile(path.join(dist, 'sw.js'), output);
console.log(`[sw] sw.js を書き出しました（${version}、最初に取っておくもの ${precache.length} 個）`);
