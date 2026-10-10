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
 * さらに、トップページに出ている文字だけを入れた、とても小さいフォント（-home）も作る。
 * トップを開いたときは、ほぼこれだけを読めば済む（-basic・-extra は、ほかの画面の文字が出たときに読む）。
 * -home を使う設定（@font-face）は、文字が公開のたびに変わるので CSS には書かず、ここで
 * 書き出したすべてのページの <head> に直接書き足す（あとに書いたものが優先されるので、トップの文字は -home で描く）。
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

const fonts = JSON.parse(await readFile(path.join(fontsDir, 'fonts.json'), 'utf8'));

// 英数字と記号は、いつでも使えるように全部入れておく
const chars = new Set();
for (let code = 0x20; code <= 0x7e; code++) chars.add(String.fromCharCode(code));

for (const file of await listFiles(dist)) {
  if (!TEXT_FILES.test(file) || file.startsWith(outDir)) continue;
  const text = await readFile(file, 'utf8');
  for (const char of text) {
    if (char.codePointAt(0) >= 0x80) chars.add(char);
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

await mkdir(outDir, { recursive: true });
for (const { source, name } of fonts) {
  const font = await readFile(path.join(fontsDir, source));
  for (const [part, list] of Object.entries(parts)) {
    const output = `${name}-${part}.woff2`;
    const subset = await subsetFont(font, list.join(''), {
      targetFormat: 'woff2',
    });
    await writeFile(path.join(outDir, output), subset);
    console.log(
      `[fonts] ${output}: ${(subset.length / 1024).toFixed(0)}KB（${list.length} 文字）`,
    );
  }
}

// ---- -home を使う設定を、すべてのページの <head> に書き足す ----
const homeRange = toUnicodeRange(parts.home);
const homeFaces = fonts
  .map(
    ({ name, family, weight }) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url(/fonts/${name}-home.woff2) format('woff2');unicode-range:${homeRange}}`,
  )
  .join('');
const homeStyle = `<style data-home-fonts>${homeFaces}</style>`;
let pages = 0;
for (const file of await listFiles(dist)) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');
  if (html.includes('data-home-fonts') || !html.includes('</head>')) continue;
  await writeFile(file, html.replace('</head>', `${homeStyle}</head>`));
  pages += 1;
}
console.log(
  `[fonts] トップの文字（${parts.home.length} 文字）だけのフォントを、${pages} ページに設定しました`,
);

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
