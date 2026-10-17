/**
 * アバターを「すぐ AR で見る」リンクの QR コードを、public/qr/ に作る。
 * npm run dev・npm run build の前に自動で実行される（package.json の predev・prebuild）。
 *
 *   ar-<アバターの id>.svg / .png   その子を AR で見る（https://bastelcolor.github.io/avatar/<id>?ar）
 *   ar-everyone.svg / .png          みんなで並んで AR で見る（/avatar/<最初の子>?ar=everyone）
 *
 * SVG は印刷（チラシ・展示）向けで、どれだけ大きくしてもくっきりする。PNG は 1000px くらい（SNS などに貼る向け）。
 * 公開したサイトでは https://bastelcolor.github.io/qr/ar-quiple.png のように開ける。
 * リンクを開いたときの動き（大きな「AR で見る」ボタン）は components/rooms/avatar-room.tsx。
 *
 * アバターの id は content/avatars.ts から読む（子を足せば、次から自動で作られる）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'qr');

const siteSource = await readFile(path.join(root, 'content', 'site.ts'), 'utf8');
const siteUrl = /url:\s*'([^']+)'/.exec(siteSource)?.[1];
if (!siteUrl) throw new Error('[qr] content/site.ts の url が読めません');

// アバターの一覧の、それぞれの子の id（いちばん外側の、4 つ字下げの id: '...'）
const avatarSource = await readFile(path.join(root, 'content', 'avatars.ts'), 'utf8');
const ids = [...avatarSource.matchAll(/^ {4}id: '([^']+)'/gm)].map(([, id]) => id);
if (ids.length === 0) throw new Error('[qr] content/avatars.ts から、アバターの id が読めません');

/** 文字色（サイトの文字の色）。読み取りやすいよう、背景は白 */
const DARK = '#2f4558';

const targets = [
  ...ids.map((id) => ({ name: `ar-${id}`, url: `${siteUrl}/avatar/${id}?ar` })),
  { name: 'ar-everyone', url: `${siteUrl}/avatar/${ids[0]}?ar=everyone` },
];

await mkdir(outDir, { recursive: true });
for (const { name, url } of targets) {
  const options = {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: DARK, light: '#ffffff' },
  };
  const svg = await QRCode.toString(url, { ...options, type: 'svg' });
  await writeFile(path.join(outDir, `${name}.svg`), svg);
  // マス目の大きさがそろうよう、1 マスを同じ画素数で描く（1000px くらいになる）
  const size = QRCode.create(url, options).modules.size + options.margin * 2;
  const png = await QRCode.toBuffer(url, {
    ...options,
    type: 'png',
    scale: Math.floor(1024 / size),
  });
  await writeFile(path.join(outDir, `${name}.png`), png);
}
console.log(`[qr] AR のリンクの QR コードを ${targets.length} 個作りました（public/qr/）`);
