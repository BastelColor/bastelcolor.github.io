/**
 * 見た目の比較。書き出したサイト（dist/client）のおもな画面を撮って、前に撮ったもの（基準）とくらべ、
 * 変わったところを赤くぬった一覧（.visual/report.html）を作る。
 *
 *   npm run build のあとに: npm run visual            くらべる（基準が無い画面は、今回のものを基準にする）
 *                          npm run visual -- --accept  今回撮ったものを、新しい基準にする
 *
 * - 撮った画像と一覧は .visual/ に置く（GitHub には送らない）
 * - 毎回同じに撮れるよう、日時を 6月15日 12時（昼の空・季節のかざり無し）に固定し、乱数も固定し、
 *   動きを減らした状態で撮る。ほかのサイト（アクセス数など）へのやりとりは止める
 * - 3D のモデルは、待機の小さな揺れやまばたきで少しずつ違うので、モデルのある画面は少しの違いを許す
 *   （目線や表情そのものは、npm run smoke の「目線が自然で…」で数字で確かめる）
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { dist, root } from './built-posts.mjs';
import {
  CHROME_ARGS,
  findChrome,
  startStaticServer,
} from './static-server.mjs';

const accept = process.argv.includes('--accept');
const outDir = path.join(root, '.visual');
const baselineDir = path.join(outDir, 'baseline');
const latestDir = path.join(outDir, 'latest');
const diffDir = path.join(outDir, 'diff');

/** 1つの点の色が、これより違ったら「変わった」とみなす（RGB の差の合計、0〜765） */
const PIXEL_THRESHOLD = 48;
/** 変わった点が、画面のこの割合（%）より多ければ「変わった画面」として知らせる */
const CHANGED_PERCENT = 0.1;
/** 3D のモデルがある画面で許す割合（%） */
const CHANGED_PERCENT_3D = 2;

/** 撮る画面の大きさ */
const VIEWPORTS = [
  { id: 'pc', width: 1280, height: 800 },
  { id: 'phone', width: 390, height: 844, mobile: true },
];
const THEMES = ['light', 'dark'];

const names = async (folder) =>
  (await readdir(path.join(dist, folder)).catch(() => []))
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.replace(/\.html$/, ''));
const firstWork = (await names('work'))[0];
const firstAvatar = (await names('avatar'))[0];
const firstPost = (await names('blog')).find((slug) => slug !== 'no-posts');

/** 撮る画面。ready は「表示できた」と判断する条件、has3d はモデルが映る画面 */
const screens = [
  { id: 'home', path: '/', ready: () => document.querySelectorAll('.home-menu .puni').length === 4 },
  { id: 'profile', path: '/#profile', ready: () => !!document.querySelector('.room.is-expanded .profile') },
  { id: 'works', path: '/#works', ready: () => document.querySelectorAll('.works-item').length > 0 },
  { id: 'log', path: '/#log', ready: () => !!document.querySelector('.room.is-expanded') },
  ...(firstWork
    ? [{ id: 'work', path: `/work/${firstWork}`, ready: () => !!document.querySelector('.work-dialog[open] h3') }]
    : []),
  ...(firstAvatar
    ? [
        {
          id: 'avatar',
          path: `/avatar/${firstAvatar}`,
          ready: () => document.querySelector('.avatar-room-photo')?.disabled === false,
          has3d: true,
        },
      ]
    : []),
  ...(firstPost
    ? [{ id: 'post', path: `/blog/${firstPost}`, ready: () => !!document.querySelector('.post h1') }]
    : []),
  { id: '404', path: '/this-page-does-not-exist', ready: () => !!document.querySelector('.not-found-title') },
];

await rm(latestDir, { recursive: true, force: true });
await rm(diffDir, { recursive: true, force: true });
await mkdir(latestDir, { recursive: true });
await mkdir(diffDir, { recursive: true });
await mkdir(baselineDir, { recursive: true });

const server = await startStaticServer();
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: [...CHROME_ARGS, '--hide-scrollbars', '--font-render-hinting=none'],
});

const shots = [];
for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const screen of screens) {
      const name = `${screen.id}-${viewport.id}-${theme}`;
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: !!viewport.mobile,
        hasTouch: !!viewport.mobile,
      });
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]);
      // ほかのサイトへのやりとり（アクセス数・YouTube など）は止める。
      // 前に取っておいたもの（service worker）は使わず、いつも書き出したファイルを読む
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', (request) =>
        request.url().startsWith(server.base) || request.url().startsWith('data:')
          ? request.continue()
          : request.abort(),
      );
      await page.evaluateOnNewDocument((themeName) => {
        // 日時と乱数を固定する
        const fixed = new Date(2026, 5, 15, 12, 0, 0).getTime();
        const RealDate = Date;
        class FixedDate extends RealDate {
          constructor(...args) {
            super(...(args.length ? args : [fixed]));
          }
          static now() {
            return fixed;
          }
        }
        window.Date = FixedDate;
        let seed = 12345;
        Math.random = () => {
          seed = (seed * 16807) % 2147483647;
          return (seed - 1) / 2147483646;
        };
        try {
          window.localStorage.setItem('yzmo-lang', 'ja');
          window.localStorage.setItem('yzmo-theme', themeName);
          window.sessionStorage.setItem('yzmo-intro', '1');
        } catch {
          // 保存できない画面では何もしない
        }
      }, theme);
      let error = null;
      try {
        await page.goto(server.base + screen.path, { waitUntil: 'networkidle0', timeout: 60_000 });
        await page.waitForFunction(screen.ready, { timeout: screen.has3d ? 120_000 : 20_000, polling: 200 });
        await page.evaluate(() => document.fonts.ready);
        // 部屋が広がりきり、画像やモデルが落ち着くまで待つ
        await new Promise((resolve) => setTimeout(resolve, screen.has3d ? 4000 : 1500));
        await page.mouse.move(0, 0);
        await page.screenshot({ path: path.join(latestDir, `${name}.png`) });
      } catch (caught) {
        error = caught.message.split('\n')[0];
      }
      await page.close();
      shots.push({ name, has3d: !!screen.has3d, error });
      process.stdout.write(error ? `✗ ${name}: ${error}\n` : `・ ${name}\n`);
    }
  }
}
await browser.close();
server.close();

if (accept) {
  for (const shot of shots) {
    if (shot.error) continue;
    await copyFile(path.join(latestDir, `${shot.name}.png`), path.join(baselineDir, `${shot.name}.png`));
  }
  console.log(`[visual] 今回の ${shots.filter((shot) => !shot.error).length} 枚を、新しい基準にしました`);
  process.exit(0);
}

// ---- くらべる ----
const results = [];
for (const shot of shots) {
  if (shot.error) {
    results.push({ ...shot, status: 'error' });
    continue;
  }
  const latest = path.join(latestDir, `${shot.name}.png`);
  const baseline = path.join(baselineDir, `${shot.name}.png`);
  if (!existsSync(baseline)) {
    await copyFile(latest, baseline);
    results.push({ ...shot, status: 'new' });
    continue;
  }
  const [a, b] = await Promise.all([
    sharp(baseline).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(latest).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    results.push({ ...shot, status: 'changed', percent: 100 });
    continue;
  }
  // 変わった点を赤く、変わっていない点はうすくした画像を作る
  const diff = Buffer.alloc(b.data.length);
  let changed = 0;
  for (let i = 0; i < b.data.length; i += 4) {
    const delta =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (delta > PIXEL_THRESHOLD) {
      changed += 1;
      diff[i] = 255;
      diff[i + 1] = 40;
      diff[i + 2] = 90;
    } else {
      const gray = (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3;
      diff[i] = diff[i + 1] = diff[i + 2] = 255 - (255 - gray) * 0.25;
    }
    diff[i + 3] = 255;
  }
  const percent = (changed / (b.data.length / 4)) * 100;
  const limit = shot.has3d ? CHANGED_PERCENT_3D : CHANGED_PERCENT;
  if (percent > limit) {
    await sharp(diff, { raw: { width: b.info.width, height: b.info.height, channels: 4 } })
      .png()
      .toFile(path.join(diffDir, `${shot.name}.png`));
  }
  results.push({ ...shot, status: percent > limit ? 'changed' : 'same', percent });
}

// ---- 一覧（.visual/report.html） ----
const order = { error: 0, changed: 1, new: 2, same: 3 };
results.sort((x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name));
const label = { error: '撮れませんでした', changed: '変わった', new: '新しい基準', same: '同じ' };
const rows = results
  .map((result) => {
    const head = `<h2>${result.name} <span class="${result.status}">${label[result.status]}${
      result.percent !== undefined ? `（${result.percent.toFixed(2)}%）` : ''
    }</span></h2>`;
    if (result.status === 'error') return `<section>${head}<p>${result.error}</p></section>`;
    if (result.status !== 'changed') {
      return `<section class="small">${head}<img src="latest/${result.name}.png" alt=""></section>`;
    }
    return `<section>${head}<div class="trio">
      <figure><img src="baseline/${result.name}.png" alt=""><figcaption>基準（前）</figcaption></figure>
      <figure><img src="latest/${result.name}.png" alt=""><figcaption>今回</figcaption></figure>
      <figure><img src="diff/${result.name}.png" alt=""><figcaption>変わったところ（赤）</figcaption></figure>
    </div></section>`;
  })
  .join('\n');
await writeFile(
  path.join(outDir, 'report.html'),
  `<!doctype html><html lang="ja"><meta charset="utf-8"><title>見た目の比較</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#f4f6fa;color:#223}
section{background:#fff;border-radius:12px;padding:12px 16px;margin:0 0 16px}
section.small{display:inline-block;width:220px;vertical-align:top;margin-right:12px}
section.small img{width:100%}
h2{font-size:15px;margin:0 0 8px}
h2 span{font-size:12px;padding:2px 8px;border-radius:99px;background:#e6ebf2;margin-left:6px}
.changed{background:#ffd6e0!important}.error{background:#ffb3b3!important}.new{background:#fff3c4!important}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
figure{margin:0}img{max-width:100%;border:1px solid #dde}figcaption{font-size:12px;color:#667}
</style>
<h1>見た目の比較</h1>
<p>変わった画面 ${results.filter((result) => result.status === 'changed').length} ／ 撮れなかった画面 ${
    results.filter((result) => result.status === 'error').length
  } ／ ぜんぶで ${results.length}。思ったとおりの変化なら <code>npm run visual -- --accept</code> で基準にします。</p>
${rows}
</html>`,
);

const changedCount = results.filter((result) => result.status === 'changed').length;
const errorCount = results.filter((result) => result.status === 'error').length;
const newCount = results.filter((result) => result.status === 'new').length;
console.log(
  `[visual] ${results.length} 枚のうち、変わった ${changedCount}・撮れなかった ${errorCount}・新しい基準 ${newCount}`,
);
console.log(`[visual] 一覧: ${path.join(outDir, 'report.html')}`);
if (changedCount || errorCount) process.exitCode = 1;
