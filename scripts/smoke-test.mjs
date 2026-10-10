/**
 * 書き出したサイト（dist/client）を本物のブラウザで開いて、おもな画面がエラーなく動くかを確かめる。
 * 画面を開けるかを確かめたあと、押したり切りかえたりする操作（scripts/smoke-scenarios.mjs）も確かめる。
 *   npm run build のあとに: npm run smoke
 * GitHub に送ったとき（.github/workflows/deploy.yml）にも、公開の前に実行される。
 * 1つでも失敗したら終了コード 1 で止まるので、壊れた状態では公開されない。
 *
 * Chrome の場所は CHROME_PATH で指定できる（無ければ、Windows・Linux のふつうの場所を探す。scripts/static-server.mjs）。
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { dist } from './built-posts.mjs';
import { scenarios } from './smoke-scenarios.mjs';
import {
  CHROME_ARGS,
  findChrome,
  startStaticServer,
} from './static-server.mjs';

// --- GitHub Pages と同じように返す小さなサーバー（scripts/static-server.mjs） ---
const server = await startStaticServer();
const { base } = server;

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
    // （写真のボタンは、モデルを表示できるまで押せない）
    ready: () =>
      !!document.querySelector('.vrm-error') ||
      document.querySelector('.avatar-room-photo')?.disabled === false,
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

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: CHROME_ARGS,
});

/**
 * 確かめるためのタブを開く。言葉は日本語にそろえ（ブラウザの言語によって英語になるため）、
 * はじまりの演出は出さない。エラーは errors に集める
 */
async function openPage({ allow404 = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // SMOKE_SLOW=4 などとすると、ブラウザをその倍だけ遅くして確かめる
  // （GitHub の確認の機械は 3D の描画がとても遅いので、手元でも同じような遅さで試せるように）
  if (process.env.SMOKE_SLOW) {
    await page.emulateCPUThrottling(Number(process.env.SMOKE_SLOW));
  }
  await page.evaluateOnNewDocument(() => {
    try {
      window.localStorage.setItem('yzmo-lang', 'ja');
      window.sessionStorage.setItem('yzmo-intro', '1');
    } catch {
      // 保存できない画面（about:blank など）では何もしない
    }
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // 存在しないページを開いたときの 404 は、確かめたいことそのものなので数えない
    if (allow404 && /404/.test(message.text())) return;
    errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    // 外のサービス（アクセス解析・BOOTH の画像など）は、ここでは確かめない
    if (!request.url().startsWith(base)) return;
    // 読み込みの途中で別の画面へ移ったときに、取りやめたもの（無いファイルは 404 のエラーとして別に数える）
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    errors.push(`読み込めませんでした: ${request.url()}`);
  });
  return { page, errors };
}

const failures = [];

/**
 * GitHub Actions で動いているときは、失敗した項目を「注釈」（annotation）としても出す。
 * 注釈は、GitHub にログインしていなくても、実行の結果の画面や API で読める
 */
function annotate(title, errors) {
  if (!process.env.GITHUB_ACTIONS) return;
  // 注釈の文字の中では、改行と % は決まった書き方にする
  const encode = (text) =>
    String(text)
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A');
  const name = encode(`smoke: ${title}`).replace(/[:,]/g, ' ');
  console.log(`::error title=${name}::${encode(errors.join('\n'))}`);
}

for (const check of checks) {
  const { page, errors } = await openPage({ allow404: check.expect404 });
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
    annotate(check.path, errors);
    console.log(`✗ ${check.path}（${seconds}秒）`);
    for (const error of errors) console.log(`    ${error}`);
  } else {
    console.log(`✓ ${check.path}（${seconds}秒）`);
  }
  await page.close();
}

// --- 操作の確認 ---
for (const scenario of scenarios) {
  const { page, errors } = await openPage({ allow404: true });
  const started = Date.now();
  try {
    await scenario.run(page, base, {
      avatarId: firstAvatars[0] ?? 'quiple',
      avatarIds: firstAvatars,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    errors.push(error.message.split('\n')[0]);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (errors.length) {
    failures.push({ path: scenario.name, errors });
    annotate(scenario.name, errors);
    console.log(`✗ ${scenario.name}（${seconds}秒）`);
    for (const error of errors) console.log(`    ${error}`);
  } else {
    console.log(`✓ ${scenario.name}（${seconds}秒）`);
  }
  await page.close();
}

await browser.close();
server.close();
const total = checks.length + scenarios.length;
if (failures.length) {
  console.log(`[smoke] ${total} 項目のうち ${failures.length} 項目で問題がありました`);
  process.exit(1);
}
console.log(
  `[smoke] ${checks.length} 画面と ${scenarios.length} 個の操作、すべて問題ありませんでした`,
);

/** dist/client/<folder>/ の .html の名前（拡張子なし）を返す */
async function readdirSafe(folder) {
  const names = await readdir(path.join(dist, folder)).catch(() => []);
  return names
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.replace(/\.html$/, ''));
}
