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
