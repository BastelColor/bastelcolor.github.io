/**
 * 見えにくい人・キーボードやスクリーンリーダーを使う人にとって、困るところがないかを確かめる。
 *   npm run build のあとに: npm run a11y
 * 公開の前（.github/workflows/deploy.yml）にも npm run a11y -- --ci で実行する（スマホの大きさだけ。問題があれば公開しない）。
 *
 * 書き出したサイト（dist/client）のおもな画面を本物のブラウザで開き、点検の道具（axe-core）で調べる。
 * ボタンの名前もれ・文字と背景のコントラスト・画像の説明もれ・見出しの順番などを見る。
 * 明るいテーマと暗いテーマ、パソコンとスマホの大きさで調べる。
 * 問題があると、画面ごとに「どこの・何が」を出して、終了コード 1 で止まる。
 *
 * 3D の画面（canvas）の中身は、点検の道具では調べられない。
 *
 * このサイトは、背景をグラデーションや ::before で描いているところが多く、点検の道具が文字のうしろの色を
 * 決められない（「わからない」になる）ことがある。そのときは、文字をいったん透明にして、うしろを撮り、
 * 実際に見えている背景の色とくらべてコントラストを測る（measureContrast）。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { dist } from './built-posts.mjs';
import { CHROME_ARGS, findChrome, startStaticServer } from './static-server.mjs';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * 調べないもの。
 * - 空や雲などの、飾りの動き（光る星など）は、位置が毎回違い、コントラストを測れない
 */
const IGNORE_SELECTORS = ['.floating-bits', '.shooting-stars', '.cursor-sparkles'];

const firstOf = async (dir, skip = '') =>
  (await readdir(path.join(dist, dir)).catch(() => []))
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.replace(/\.html$/, ''))
    .filter((name) => name !== skip)[0];
const firstWork = await firstOf('work');
const firstAvatar = await firstOf('avatar');
const firstPost = await firstOf('blog', 'no-posts');

const pages = [
  { path: '/', ready: () => document.querySelectorAll('.home-menu .puni').length === 4 },
  { path: '/#profile', ready: () => !!document.querySelector('.room.is-expanded .profile') },
  { path: '/#works', ready: () => document.querySelectorAll('.works-item').length > 0 },
  { path: '/#log', ready: () => !!document.querySelector('.room.is-expanded') },
  firstWork && { path: `/work/${firstWork}`, ready: () => !!document.querySelector('.work-dialog[open] h3') },
  firstAvatar && {
    path: `/avatar/${firstAvatar}`,
    ready: () => document.querySelector('.avatar-room-photo')?.disabled === false,
    timeout: 120_000,
  },
  firstPost && { path: `/blog/${firstPost}`, ready: () => !!document.querySelector('.post h1') },
  { path: '/this-page-does-not-exist', ready: () => !!document.querySelector('.not-found-title') },
].filter(Boolean);

// 公開の前（--ci）は、時間がかからないよう、スマホの大きさだけで調べる
const ci = process.argv.includes('--ci');
const VIEWPORTS = [
  { id: 'pc', width: 1280, height: 800 },
  { id: 'phone', width: 390, height: 844, mobile: true },
].filter((viewport) => !ci || viewport.id === 'phone');
const THEMES = ['light', 'dark'];

const server = await startStaticServer();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
/** 問題の種類ごとに、どの画面のどこで出たか（同じものは1回だけ数える） */
const problems = new Map();
const addProblem = (key, base, where) => {
  const entry = problems.get(key) ?? { ...base, where: [] };
  entry.where.push(where);
  problems.set(key, entry);
};

/** 色の明るさ（WCAG の相対輝度） */
const luminance = ([r, g, b]) => {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * 点検の道具が決められなかった文字のコントラストを、実際に見えている色で測る。
 * 文字のある場所を、文字が見えるままと、文字を消した（透明にした）ものの 2 枚撮り、
 * 変わった点（文字の点）の色と、そのうしろの色をくらべる。ふちどり・影・半分すけた色も、見えているとおりに測れる。
 * 文字のはしの点はぼけて薄いので、はっきりした点（コントラストの高いほうから 1 割の点）で判断する。
 * - ふちどり（-webkit-text-stroke）のある文字は、線の見え方なので、大きい文字と同じ 3 を目安にする
 * - 測る前に文字を画面の中へ動かす。ほかのものの下に隠れている文字は測らない（null）
 */
async function measureContrast(tab, selector) {
  const info = await tab.evaluate((query) => {
    const element = document.querySelector(query);
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    // ほかのもの（ダイアログなど）の下に隠れていないか
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!top || !(element.contains(top) || top.contains(element))) return null;
    const style = getComputedStyle(element);
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      stroked: parseFloat(style.webkitTextStrokeWidth) >= parseFloat(style.fontSize) * 0.08,
      fill: style.color.match(/[\d.]+/g).map(Number),
      stroke: style.webkitTextStrokeColor.match(/[\d.]+/g).map(Number),
      size: parseFloat(style.fontSize),
      weight: Number(style.fontWeight) || 400,
    };
  }, selector);
  if (!info) return null;
  const pixelsOf = async () => {
    const shot = await tab.screenshot({ clip: info.rect });
    return sharp(shot).removeAlpha().raw().toBuffer();
  };
  const withText = await pixelsOf();
  await tab.evaluate((query) => {
    const element = document.querySelector(query);
    element.style.setProperty('color', 'transparent', 'important');
    element.style.setProperty('-webkit-text-stroke-color', 'transparent', 'important');
    element.style.setProperty('text-shadow', 'none', 'important');
  }, selector);
  let withoutText;
  try {
    withoutText = await pixelsOf();
  } finally {
    await tab.evaluate((query) => {
      const element = document.querySelector(query);
      element.style.removeProperty('color');
      element.style.removeProperty('-webkit-text-stroke-color');
      element.style.removeProperty('text-shadow');
    }, selector);
  }
  if (withText.length !== withoutText.length) return null;
  const ratios = [];
  const behind = [];
  let sample = null;
  for (let i = 0; i < withText.length; i += 3) {
    const a = [withText[i], withText[i + 1], withText[i + 2]];
    const b = [withoutText[i], withoutText[i + 1], withoutText[i + 2]];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 30) continue;
    const ratio = contrast(a, b);
    ratios.push(ratio);
    behind.push(b);
    if (!sample || ratio > sample.ratio) sample = { ratio, text: a, background: b };
  }
  // 文字の点がほとんど無い（文字が見えていない）ときは測らない
  if (ratios.length < 8) return null;
  ratios.sort((x, y) => y - x);
  const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
  // 文字の色（CSS の色。中の色と、ふちどりの色）と、文字のうしろの色（撮った点の中央値）でも測る。
  // 小さい字は、はしがにじんで撮った色が薄くなるので、点検の決まり（WCAG）どおり、文字の色そのものでもくらべる
  behind.sort((x, y) => luminance(x) - luminance(y));
  const background = behind[Math.floor(behind.length / 2)];
  const blend = ([r, g, b, alpha = 1]) => [r, g, b].map((value, i) => value * alpha + background[i] * (1 - alpha));
  const cssRatio = Math.max(
    contrast(blend(info.fill), background),
    info.stroked ? contrast(blend(info.stroke), background) : 0,
  );
  return {
    // 見えている点でも、文字の色でも足りないときだけ、足りないとする
    ratio: Math.max(ratios[Math.floor(ratios.length * 0.1)], cssRatio),
    needed: large || info.stroked ? 3 : 4.5,
    text: sample.text,
    background: sample.background,
  };
}
try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const page of pages) {
        const tab = await browser.newPage();
        await tab.setViewport({
          width: viewport.width,
          height: viewport.height,
          isMobile: !!viewport.mobile,
          hasTouch: !!viewport.mobile,
        });
        await tab.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await tab.evaluateOnNewDocument((themeName) => {
          localStorage.setItem('yzmo-lang', 'ja');
          localStorage.setItem('yzmo-theme', themeName);
          sessionStorage.setItem('yzmo-intro', '1');
        }, theme);
        await tab.goto(server.base + page.path, { waitUntil: 'load' });
        await tab.waitForFunction(page.ready, { timeout: page.timeout ?? 30_000, polling: 200 });
        // 部屋が広がりきり、文字の色の切りかえが終わるまで待つ
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await tab.evaluate(axeSource);
        const results = await tab.evaluate(
          async (ignore) =>
            await window.axe.run(
              { exclude: ignore.map((selector) => [selector]) },
              { resultTypes: ['violations', 'incomplete'] },
            ),
          IGNORE_SELECTORS,
        );
        const where = `${page.path}（${viewport.id}・${theme}）`;
        for (const violation of results.violations) {
          for (const node of violation.nodes) {
            addProblem(
              `${violation.id} ${node.target.join(' ')}`,
              {
                id: violation.id,
                impact: violation.impact,
                help: violation.help,
                target: node.target.join(' '),
                summary: node.failureSummary?.split('\n').slice(1).join(' ').trim(),
              },
              where,
            );
          }
        }
        // 点検の道具が決められなかった文字のコントラストは、実際の背景を撮って測る
        const unsure = results.incomplete.find((item) => item.id === 'color-contrast')?.nodes ?? [];
        for (const node of unsure) {
          const selector = node.target.join(' ');
          const measured = await measureContrast(tab, selector);
          if (!measured || measured.ratio >= measured.needed) continue;
          addProblem(
            `color-contrast ${selector}`,
            {
              id: 'color-contrast',
              impact: 'serious',
              help: '文字と背景のコントラストが足りない（見えている色を撮って測った）',
              target: selector,
              summary: `${measured.ratio.toFixed(2)}（必要 ${measured.needed}）文字の色の例 rgb(${measured.text.join(',')}) うしろ rgb(${measured.background.join(',')})`,
            },
            where,
          );
        }
        await tab.close();
        process.stdout.write('・');
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log('');
if (problems.size === 0) {
  console.log('[a11y] 問題はありませんでした');
} else {
  for (const problem of problems.values()) {
    console.log(`✗ [${problem.impact}] ${problem.id}: ${problem.help}`);
    console.log(`    場所: ${problem.target}`);
    if (problem.summary) console.log(`    内容: ${problem.summary}`);
    console.log(`    画面: ${problem.where.slice(0, 4).join('、')}${problem.where.length > 4 ? ` ほか ${problem.where.length - 4}` : ''}`);
  }
  if (process.env.GITHUB_ACTIONS) {
    for (const problem of problems.values()) {
      console.log(`::error title=見えにくい人向けの点検 ${problem.id}::${problem.target}（${problem.where[0]}）${problem.summary ?? ''}`);
    }
  }
  console.log(`[a11y] ${problems.size} 個の問題がありました`);
  process.exitCode = 1;
}
