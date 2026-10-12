/**
 * 書き出したサイト（dist/client）に、service worker（sw.js）を足す。
 * npm run build のあとに自動で実行される（package.json の postbuild。フォントを作り終えたあとに）。
 *
 * 中身は scripts/service-worker.js。そこへ次の2つを埋める
 * - PRECACHE: トップのページと、それを表示するのに要るもの（プログラム・CSS・トップ用のフォント・アイコン）
 * - VERSION : PRECACHE の中身から作った印。公開し直して中身が変わると、前に取っておいたものを捨てて取り直す
 *
 * あわせて、プログラムの版の印（BUILD）を作り、/version.json と、すべてのページの
 * <meta name="yzmo-build"> に書く。開いたままのページは、ときどき /version.json を読んで、
 * 自分の版とちがえば「新しい版があります」と出す（components/update-notice.tsx）。
 * 印は、プログラムと CSS（/_next/static/ の chunks・css）のファイルの名前から作る。名前には中身のハッシュが
 * 入っているので、記事や作品の文章だけを足した公開では変わらない（読み込み直さなくても、新しい文章は出る）
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
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

// ---- プログラムの版の印 ----
const staticDir = path.join(dist, '_next', 'static');
const programFiles = (
  await Promise.all(
    ['chunks', 'css'].map(async (dir) =>
      (await readdir(path.join(staticDir, dir), { recursive: true })).map((name) =>
        `${dir}/${String(name).replaceAll('\\', '/')}`,
      ),
    ),
  )
)
  .flat()
  .sort();
const build = createHash('sha256').update(programFiles.join('\n')).digest('hex').slice(0, 12);
await writeFile(path.join(dist, 'version.json'), `${JSON.stringify({ build })}\n`);
const buildMeta = `<meta name="yzmo-build" content="${build}">`;
let pages = 0;
for (const name of await readdir(dist, { recursive: true })) {
  const file = path.join(dist, String(name));
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');
  if (html.includes('name="yzmo-build"') || !html.includes('<head>')) continue;
  await writeFile(file, html.replace('<head>', `<head>${buildMeta}`));
  pages += 1;
}
console.log(`[sw] プログラムの版の印 ${build} を、version.json と ${pages} ページに書きました`);
