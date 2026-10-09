/**
 * 書き出したサイト（dist/client）を本物のブラウザで開いて、おもな画面がエラーなく動くかを確かめる。
 *   npm run build のあとに: npm run smoke
 * GitHub に送ったとき（.github/workflows/deploy.yml）にも、公開の前に実行される。
 * 1つでも失敗したら終了コード 1 で止まるので、壊れた状態では公開されない。
 *
 * Chrome の場所は CHROME_PATH で指定できる（無ければ、Windows・Linux のふつうの場所を探す）。
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { dist } from './built-posts.mjs';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.vrm': 'application/octet-stream',
};

// --- GitHub Pages と同じように、/work/abc → work/abc.html を返す小さなサーバー ---
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
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
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
const base = `http://localhost:${server.address().port}`;

// --- 確かめる画面 ---
const firstWork = (await readdirSafe('work'))[0];
const firstAvatars = await readdirSafe('avatar');
const firstPost = (await readdirSafe('blog')).find(
  (slug) => slug !== 'no-posts',
);

/** 画面ごとの「表示できた」と判断する条件（ページの中で評価する式） */
const checks = [
  {
    path: '/',
    ready: () => document.querySelectorAll('.home-menu .puni').length === 4,
  },
  {
    path: '/#profile',
    ready: () => !!document.querySelector('.room.is-expanded .profile'),
  },
  {
    path: '/#works',
    ready: () => document.querySelectorAll('.works-item').length > 0,
  },
  { path: '/#log', ready: () => !!document.querySelector('.room.is-expanded') },
  ...(firstWork
    ? [
        {
          path: `/work/${firstWork}`,
          ready: () => !!document.querySelector('.work-dialog[open] h3'),
        },
      ]
    : []),
  // アバターは 3D のモデルを読み込み、表情のボタンが押せるようになるまで待つ
  ...firstAvatars.map((id) => ({
    path: `/avatar/${id}`,
    // モデルを表示できなかったときも、待たずに次へ（下でエラーとして数える）
    ready: () =>
      !!document.querySelector('.vrm-error') ||
      [...document.querySelectorAll('.avatar-room-play button')].some(
        (b) => !b.disabled,
      ),
    timeout: 90_000,
  })),
  ...(firstPost
    ? [
        {
          path: `/blog/${firstPost}`,
          ready: () => !!document.querySelector('.post h1'),
        },
      ]
    : []),
  {
    path: '/this-page-does-not-exist',
    ready: () => !!document.querySelector('.not-found-title'),
    expect404: true,
  },
];

const executablePath = CHROME_CANDIDATES.find((candidate) =>
  existsSync(candidate),
);
if (!executablePath)
  throw new Error(
    '[smoke] Chrome が見つかりません（CHROME_PATH で指定してください）',
  );
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  // 3D の表示は、GPU の無い環境でも動くソフトウェア描画で確かめる
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});

const failures = [];
for (const check of checks) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // 存在しないページを開いたときの 404 は、確かめたいことそのものなので数えない
    if (check.expect404 && /404/.test(message.text())) return;
    errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    // 外のサービス（アクセス解析・BOOTH の画像など）は、ここでは確かめない
    if (!request.url().startsWith(base)) return;
    errors.push(`読み込めませんでした: ${request.url()}`);
  });
  const started = Date.now();
  try {
    await page.goto(base + check.path, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(check.ready, {
      timeout: check.timeout ?? 20_000,
      polling: 200,
    });
    // 表示のあとに起きるエラーも拾う
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await page.$('.vrm-error'))
      errors.push('3D モデルを表示できませんでした');
  } catch (error) {
    errors.push(
      `表示を確かめられませんでした: ${error.message.split('\n')[0]}`,
    );
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (errors.length) {
    failures.push({ path: check.path, errors });
    console.log(`✗ ${check.path}（${seconds}秒）`);
    for (const error of errors) console.log(`    ${error}`);
  } else {
    console.log(`✓ ${check.path}（${seconds}秒）`);
  }
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.log(`[smoke] ${failures.length} 画面で問題がありました`);
  process.exit(1);
}
console.log(`[smoke] ${checks.length} 画面すべて問題ありませんでした`);

/** dist/client/<folder>/ の .html の名前（拡張子なし）を返す */
async function readdirSafe(folder) {
  const names = await readdir(path.join(dist, folder)).catch(() => []);
  return names
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.replace(/\.html$/, ''));
}
