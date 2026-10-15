/**
 * 書き出したサイト（dist/client）を本物のブラウザで開いて、表示の速さに関わる数を確かめる。
 *   npm run build のあとに: npm run perf
 * GitHub に送ったとき（.github/workflows/deploy.yml）にも、npm run smoke のあとに実行される。
 *
 * 確かめること（どれかが超えると、終了コード 1 で止まり、公開されない）
 * - ページのずれ（CLS。読み込みのあいだに、見えているものがどれだけ動いたか）: CLS_LIMIT まで
 * - 読み込むファイルの大きさ（プログラム・CSS・フォント・画像）: BUDGETS まで
 *   （このサーバーは圧縮しないので、GitHub Pages で実際に届く量より大きい。増えていないかを見るためのもの）
 *
 * 表示までの時間・画面が固まった時間（TBT）も出すが、GitHub の機械は速さがばらつくので、止めはしない。
 * ファイルの大きさを増やす変更（新しい部品・大きな画像）をしたときは、出てきた数を見て BUDGETS を見直す。
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { dist } from './built-posts.mjs';
import { CHROME_ARGS, findChrome, startStaticServer } from './static-server.mjs';

/** ページのずれの上限（Google の「良い」の目安） */
const CLS_LIMIT = 0.1;

/**
 * ファイルの大きさの上限（KB。圧縮しない大きさ）。ページの種類ごと。
 * 3D モデル（.vrm）や動き（.vrma）は、その子によって大きさが違うので数えない
 */
const BUDGETS = {
  // トップ（トップ用の小さいフォントだけ）
  home: { js: 650, css: 110, font: 130, image: 350 },
  // 部屋・記事・404（2026-10 に測った値に、2〜3 割の余裕）
  room: { js: 700, css: 110, font: 420, image: 750 },
  // 作品の詳細（詳細の写真がある）
  work: { js: 700, css: 110, font: 420, image: 1450 },
  // アバターの部屋（3D の表示のプログラム three.js がある）
  avatar: { js: 2000, css: 110, font: 420, image: 450 },
};

const server = await startStaticServer();
const { base } = server;

const firstOf = async (dir, skip = '') =>
  (await readdir(path.join(dist, dir)).catch(() => []))
    .map((name) => name.replace(/\.html$/, ''))
    .filter((name) => name && name !== skip && !name.includes('.'))[0];
const firstWork = await firstOf('work');
const firstAvatar = await firstOf('avatar');
const firstPost = await firstOf('blog', 'no-posts');

const pages = [
  { path: '/', kind: 'home' },
  { path: '/#profile', kind: 'room' },
  { path: '/#works', kind: 'room' },
  { path: '/#log', kind: 'room' },
  firstWork && { path: `/work/${firstWork}`, kind: 'work' },
  firstAvatar && { path: `/avatar/${firstAvatar}`, kind: 'avatar' },
  firstPost && { path: `/blog/${firstPost}`, kind: 'room' },
  { path: '/this-page-does-not-exist', kind: 'room' },
].filter(Boolean);

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: CHROME_ARGS,
});
const failures = [];
try {
  for (const { path: url, kind } of pages) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('yzmo-lang', 'ja');
      sessionStorage.setItem('yzmo-intro', '1');
      const perf = { lcp: 0, cls: 0, tbt: 0 };
      window.__perf = perf;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) perf.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.tbt += Math.max(0, entry.duration - 50);
      }).observe({ type: 'longtask', buffered: true });
    });
    const sizes = { js: 0, css: 0, font: 0, image: 0 };
    const pending = [];
    page.on('response', (response) => {
      const type = response.request().resourceType();
      const key =
        type === 'script' ? 'js' : type === 'stylesheet' ? 'css' : type === 'font' ? 'font' : type === 'image' ? 'image' : null;
      if (!key || response.status() >= 300) return;
      pending.push(
        response.buffer().then(
          (body) => {
            sizes[key] += body.length;
          },
          () => {},
        ),
      );
    });
    await page.goto(`${base}${url}`, { waitUntil: 'load', timeout: 120_000 });
    // 部屋が開き、遅れて読むもの（部屋の中身・フォント・画像）が届くまで待つ
    await new Promise((resolve) => setTimeout(resolve, kind === 'avatar' ? 12_000 : 5_000));
    await Promise.all(pending);
    const perf = await page.evaluate(() => window.__perf);
    await context.close();

    const kb = Object.fromEntries(Object.entries(sizes).map(([key, value]) => [key, Math.round(value / 1024)]));
    const problems = [];
    if (perf.cls > CLS_LIMIT) problems.push(`ページのずれ ${perf.cls.toFixed(3)}（上限 ${CLS_LIMIT}）`);
    for (const [key, limit] of Object.entries(BUDGETS[kind])) {
      if (kb[key] > limit) problems.push(`${key} ${kb[key]}KB（上限 ${limit}KB）`);
    }
    console.log(
      `${problems.length ? '✗' : '✓'} ${url}  ずれ ${perf.cls.toFixed(3)}  ` +
        `js ${kb.js}KB css ${kb.css}KB フォント ${kb.font}KB 画像 ${kb.image}KB  ` +
        `（参考: 表示 ${Math.round(perf.lcp)}ms 固まった時間 ${Math.round(perf.tbt)}ms）`,
    );
    for (const problem of problems) console.log(`    ${problem}`);
    if (problems.length) failures.push({ url, problems });
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  if (process.env.GITHUB_ACTIONS) {
    for (const { url, problems } of failures) {
      console.log(`::error title=表示の速さ ${url}::${problems.join('%0A')}`);
    }
  }
  console.log(`[perf] ${pages.length} 画面のうち ${failures.length} 画面で、上限を超えました`);
  process.exit(1);
}
console.log(`[perf] ${pages.length} 画面、すべて上限の中でした`);
