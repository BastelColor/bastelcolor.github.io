/**
 * 書き出したサイト（dist/client）を、GitHub Pages と同じように返す小さなサーバー
 * （/work/abc → work/abc.html。無いページは 404.html）。
 * 公開前の確認（scripts/smoke-test.mjs）と、見た目の比較（scripts/visual-test.mjs）で使う。
 *
 * また、ブラウザ（Chrome）の場所も探す（CHROME_PATH で指定でき、無ければ Windows・Linux のふつうの場所）。
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { dist } from './built-posts.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.vrm': 'application/octet-stream',
};

/** サーバーを立てて、{ base（http://localhost:ポート）, close() } を返す */
export async function startStaticServer() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const candidates = pathname.endsWith('/')
      ? [`${pathname}index.html`]
      : [pathname, `${pathname}.html`, `${pathname}/index.html`];
    for (const candidate of candidates) {
      const file = path.join(dist, candidate);
      if (!file.startsWith(dist) || !existsSync(file)) continue;
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          'content-type':
            TYPES[path.extname(file)] ?? 'application/octet-stream',
        });
        res.end(body);
        return;
      } catch {
        // フォルダーだったときなど。次の候補へ
      }
    }
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(await readFile(path.join(dist, '404.html')));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    base: `http://localhost:${server.address().port}`,
    close: () => server.close(),
  };
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean);

/** Chrome の場所。見つからなければ止める */
export function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome が見つかりません（CHROME_PATH で指定してください）');
  }
  return found;
}

/** 3D の表示は、GPU の無い環境でも動くソフトウェア描画で確かめる */
export const CHROME_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
];
