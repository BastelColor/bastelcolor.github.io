/**
 * 書き出したサイト（dist/client）で使っている文字だけを入れたフォントを作り、dist/client/fonts/ に置く。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 元のフォントは fonts/ にある（fonts/fonts.json に、元のファイルと書き出す名前の組）。
 * 日本語のフォントは丸ごとだと1つ 1.5MB ほどあるが、サイトの文字だけなら数十KBになる。
 * 文字は、書き出したページ（.html / .txt）とプログラム（.js）から集めるので、
 * 記事や作品の文章を足しても、次に公開するときに自動で入る。
 *
 * 1つのフォントを「かな・英数字」（-basic）と「漢字など」（-extra）の2つに分ける。
 * ブラウザは画面に出ている文字に必要なほうだけを読むので、
 * 漢字の少ないトップページを開いたときは、軽い -basic だけで済むことが多い。
 * 分け方（BASIC_RANGES）は app/styles/fonts.css の unicode-range と同じにすること。
 *
 * 漢字など（-extra）は、1 ページに出るのはサイト全体の 2 割ほどなのに、1 つのファイルだと 1 字でも出れば
 * 全部（1 つの太さで 80KB ほど）を読むことになる。なので、本文のフォント（SLICED_FAMILIES）は、
 * 多くのファイルに出てくる字から順に EXTRA_SLICE 字ずつの小さなファイル（-extra-0, -extra-1, ...）に分ける。
 * ブラウザは、画面に出る字が入ったファイルだけを読む（記事のページで、フォントが 477KB → 半分ほどになった）。
 * 分けたものを使う設定（@font-face）は、字が公開のたびに変わるので CSS には書かず、ここで
 * 書き出したすべてのページの <head> に直接書き足す。app/styles/fonts.css の -extra の設定（開発中に使う）は、
 * 書き出した CSS から消す。
 *
 * さらに、トップページに出ている文字だけを入れた、とても小さいフォント（-home）も作る。
 * トップを開いたときは、ほぼこれだけを読めば済む（-basic・-extra は、ほかの画面の文字が出たときに読む）。
 * -home を使う設定と先読みも、トップのページ（index.html）の <head> にだけ書き足す
 * （あとに書いたものが優先されるので、トップの文字は -home で描く。ほかのページに書くと、
 * 同じ字を -home と -basic の両方から読むことになり、ムダが多かった）。
 *
 * 開発中（npm run dev）は、scripts/vite-fonts.ts が元のフォントを丸ごと渡すので、この処理は要らない。
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'client');
const fontsDir = path.join(root, 'fonts');
const outDir = path.join(dist, 'fonts');

/** -basic に入れる文字（英数字・記号・句読点・ひらがな・カタカナ・全角の記号）。それ以外は -extra */
const BASIC_RANGES = [
  [0x0000, 0x00ff],
  [0x2000, 0x206f],
  [0x3000, 0x30ff],
  [0xff00, 0xffef],
];

/** 文字を集めるファイルの種類 */
const TEXT_FILES = /\.(html|txt|js)$/;
/** 漢字など（-extra）を小さなファイルに分けるフォント（本文。見出しのフォントは漢字が少ないので分けない） */
const SLICED_FAMILIES = new Set(['Zen Maru Gothic']);
/** 漢字などを分ける、1 ファイルあたりの字数 */
const EXTRA_SLICE = 25;

const fonts = JSON.parse(await readFile(path.join(fontsDir, 'fonts.json'), 'utf8'));

// 英数字と記号は、いつでも使えるように全部入れておく
const chars = new Set();
for (let code = 0x20; code <= 0x7e; code++) chars.add(String.fromCharCode(code));

// 字ごとの、出てくるファイルの数（多いものほど、多くのページで使う字）
const fileCounts = new Map();
for (const file of await listFiles(dist)) {
  if (!TEXT_FILES.test(file) || file.startsWith(outDir)) continue;
  const text = await readFile(file, 'utf8');
  const inFile = new Set();
  for (const char of text) {
    if (char.codePointAt(0) >= 0x80) inFile.add(char);
  }
  for (const char of inFile) {
    chars.add(char);
    fileCounts.set(char, (fileCounts.get(char) ?? 0) + 1);
  }
}
const isBasic = (char) => {
  const code = char.codePointAt(0);
  return BASIC_RANGES.some(([start, end]) => start <= code && code <= end);
};
const parts = {
  basic: [...chars].filter(isBasic),
  extra: [...chars].filter((char) => !isBasic(char)),
};

// トップページ（index.html）に出ている文字。<script> などの中は除く。英数字は、英語に切りかえたときのためにすべて入れる
const homeHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
const homeText = homeHtml
  .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
const homeChars = new Set();
for (let code = 0x20; code <= 0x7e; code++) homeChars.add(String.fromCharCode(code));
for (const char of homeText) {
  if (char.codePointAt(0) >= 0x80 && chars.has(char)) homeChars.add(char);
}
parts.home = [...homeChars];

// 漢字などを、多くのファイルに出てくる字から順に並べて、EXTRA_SLICE 字ずつに分ける
const extraOrder = [...parts.extra].sort(
  (a, b) => (fileCounts.get(b) ?? 0) - (fileCounts.get(a) ?? 0) || a.codePointAt(0) - b.codePointAt(0),
);
const extraSlices = [];
for (let i = 0; i < extraOrder.length; i += EXTRA_SLICE) {
  extraSlices.push(extraOrder.slice(i, i + EXTRA_SLICE));
}

await mkdir(outDir, { recursive: true });
for (const { source, name, family } of fonts) {
  const font = await readFile(path.join(fontsDir, source));
  const sliced = SLICED_FAMILIES.has(family);
  const outputs = Object.entries(parts)
    .filter(([part]) => !(sliced && part === 'extra'))
    .map(([part, list]) => ({ output: `${name}-${part}.woff2`, list }));
  if (sliced) {
    extraSlices.forEach((list, i) => outputs.push({ output: `${name}-extra-${i}.woff2`, list }));
  }
  for (const { output, list } of outputs) {
    const subset = await subsetFont(font, list.join(''), {
      targetFormat: 'woff2',
    });
    await writeFile(path.join(outDir, output), subset);
    console.log(
      `[fonts] ${output}: ${(subset.length / 1024).toFixed(0)}KB（${list.length} 文字）`,
    );
  }
}

// ---- 分けた漢字のフォントを使う設定（すべてのページ）と、-home を使う設定（トップだけ）を、<head> に書き足す ----
const extraFaces = fonts
  .filter(({ family }) => SLICED_FAMILIES.has(family))
  .flatMap(({ name, family, weight }) =>
    extraSlices.map(
      (list, i) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
        `src:url(/fonts/${name}-extra-${i}.woff2) format('woff2');unicode-range:${toUnicodeRange(list)}}`,
    ),
  )
  .join('');
const extraStyle = `<style data-extra-fonts>${extraFaces}</style>`;
const homeRange = toUnicodeRange(parts.home);
const homeFaces = fonts
  .map(
    ({ name, family, weight }) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url(/fonts/${name}-home.woff2) format('woff2');unicode-range:${homeRange}}`,
  )
  .join('');
const homeStyle = `<style data-home-fonts>${homeFaces}</style>`;
// -home のフォントは、<head> のはじめで先読みしておく。書かないと、ブラウザは CSS を読み終えて
// 文字に当ててから、やっとフォントを読み始めるので、トップの文字が出るのが 1 秒ほど遅れていた
const homePreloads = fonts
  .map(
    ({ name }) =>
      `<link rel="preload" as="font" type="font/woff2" href="/fonts/${name}-home.woff2" crossorigin>`,
  )
  .join('');
const homePage = path.join(dist, 'index.html');
let pages = 0;
for (const file of await listFiles(dist)) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');
  if (html.includes('data-extra-fonts') || !html.includes('</head>')) continue;
  const isHome = file === homePage;
  await writeFile(
    file,
    html
      .replace('<head>', isHome ? `<head>${homePreloads}` : '<head>')
      .replace('</head>', `${extraStyle}${isHome ? homeStyle : ''}</head>`),
  );
  pages += 1;
}
console.log(
  `[fonts] 漢字などを ${extraSlices.length} ファイルに分けたフォントを ${pages} ページに、トップの文字（${parts.home.length} 文字）だけのフォントをトップに設定しました`,
);

// 書き出した CSS から、分けたフォントの -extra（1 ファイルのもの。開発中に使う）の設定を消す
const slicedNames = fonts.filter(({ family }) => SLICED_FAMILIES.has(family)).map(({ name }) => name);
for (const file of await listFiles(path.join(dist, '_next', 'static', 'css'))) {
  if (!file.endsWith('.css')) continue;
  const css = await readFile(file, 'utf8');
  let removed = 0;
  const next = css.replace(/@font-face\s*\{[^}]*\}/g, (face) => {
    if (!slicedNames.some((name) => face.includes(`/fonts/${name}-extra.woff2`))) return face;
    removed += 1;
    return '';
  });
  if (removed > 0) {
    await writeFile(file, next);
    console.log(`[fonts] ${path.basename(file)} から、1 ファイルの -extra の設定を ${removed} 個消しました`);
  }
}

/** 文字の一覧を、unicode-range の書き方（U+20-7E,U+3042,...）にする。続いている文字はまとめる */
function toUnicodeRange(list) {
  const codes = [...new Set(list.map((char) => char.codePointAt(0)))].sort(
    (a, b) => a - b,
  );
  const ranges = [];
  for (const code of codes) {
    const last = ranges.at(-1);
    if (last && code === last[1] + 1) last[1] = code;
    else ranges.push([code, code]);
  }
  return ranges
    .map(([start, end]) =>
      start === end
        ? `U+${start.toString(16).toUpperCase()}`
        : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
    )
    .join(',');
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return files.flat();
}
