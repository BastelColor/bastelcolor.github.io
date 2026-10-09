/**
 * public/characters/ のキャラクター画像（雲のうしろから顔を出す子）を半分の大きさにして、
 * public/characters/small/ に書き出す。
 * npm run dev / npm run build の前に自動で実行される（package.json の predev / prebuild）。
 *
 * スマホなど、画像が小さく表示される画面ではこちらを読む（components/puni-button.tsx の srcSet）。
 * 元の画像を差し替えれば、次に起動・公開するときに自動で作り直される。
 * 顔アイコン（-icon）は小さいので対象にしない。
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'public', 'characters');
const outDir = path.join(sourceDir, 'small');

await mkdir(outDir, { recursive: true });
let count = 0;
for (const name of await readdir(sourceDir)) {
  if (!name.endsWith('.webp') || name.includes('-icon')) continue;
  const source = path.join(sourceDir, name);
  const output = path.join(outDir, name);
  const [sourceStat, outputStat] = await Promise.all([
    stat(source),
    stat(output).catch(() => null),
  ]);
  if (outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) continue;
  const { width } = await sharp(source).metadata();
  await sharp(source)
    .resize({ width: Math.round(width / 2) })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(output);
  count++;
}
if (count) console.log(`[characters] ${count} 枚を半分の大きさにしました`);
