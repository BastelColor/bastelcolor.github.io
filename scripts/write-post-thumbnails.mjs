/**
 * 記事のサムネイル（content/posts/*.md の thumbnail）が縦長・正方形の写真なら、横長（16:10）のものを作る。
 * npm run dev・npm run build の前に自動で実行される（package.json の predev・prebuild）。
 *
 * ブログの一覧・記事のいちばん上・共有したときのカードは横長なので、縦長の写真をそのまま使うと、
 * 上下が大きく切れてしまう。なので、写真をまるごと真ん中に置き、左右には同じ写真をぼかして
 * 引きのばしたものを敷いた横長の画像（<元の名前>.wide.webp。1600×1000）を作る。
 * どの画像を使うかは scripts/vite-post-thumbnails.ts が記事に伝える（記事の thumbnail は元の写真のままでよい）。
 *
 * 作った画像は GitHub には送らない（.gitignore。公開のたびに作り直す）。
 * npm run dev のあいだに写真を足したときは、npm run dev を一度止めて、もう一度始めると作られる
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = path.join(root, 'content', 'posts');
const publicDir = path.join(root, 'public');

/** この横縦の比より細長い（縦長に近い）写真を、横長にする */
const MIN_RATIO = 1.4;
/** 作る画像の大きさ（16:10）と、真ん中の写真のまわりのすきま */
const WIDTH = 1600;
const HEIGHT = 1000;
const MARGIN = 44;
const RADIUS = 32;

/** 横長の画像の場所（/posts/ar/photo.webp → /posts/ar/photo.wide.webp） */
const widePath = (thumbnail) => thumbnail.replace(/\.[^./]+$/, '.wide.webp');

const mtime = (file) => stat(file).then((info) => info.mtimeMs, () => -1);

let made = 0;
for (const name of await readdir(postsDir)) {
  if (!name.endsWith('.md')) continue;
  const source = await readFile(path.join(postsDir, name), 'utf8');
  const thumbnail = /^---[\s\S]*?^thumbnail:\s*(\S+)\s*$/m.exec(source)?.[1];
  if (!thumbnail?.startsWith('/')) continue;
  const input = path.join(publicDir, thumbnail);
  const output = path.join(publicDir, widePath(thumbnail));
  const inputTime = await mtime(input);
  if (inputTime < 0) {
    console.warn(`[thumbnails] ${name}: ${thumbnail} が public/ にありません`);
    continue;
  }
  const { width, height } = await sharp(input).metadata();
  if (width / height >= MIN_RATIO) continue;
  if ((await mtime(output)) >= inputTime) continue;

  // 左右に敷く、ぼかして少し明るくした写真
  const background = await sharp(input)
    .resize(WIDTH, HEIGHT, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 1.08, saturation: 0.9 })
    .toBuffer();
  // 真ん中の写真（角を丸める）
  const photoHeight = HEIGHT - MARGIN * 2;
  const photoWidth = Math.min(WIDTH - MARGIN * 2, Math.round((width * photoHeight) / height));
  const photo = await sharp(input)
    .resize(photoWidth, photoHeight, { fit: 'cover' })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${photoWidth}" height="${photoHeight}"><rect width="${photoWidth}" height="${photoHeight}" rx="${RADIUS}"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  const left = Math.round((WIDTH - photoWidth) / 2);
  const shadow = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${WIDTH}" height="${HEIGHT}"><rect x="${left}" y="${MARGIN + 10}" width="${photoWidth}" height="${photoHeight}" rx="${RADIUS}" fill="rgba(31,45,70,0.4)"/></svg>`,
        ),
      },
    ])
    .blur(18)
    .png()
    .toBuffer();
  await sharp(background)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: photo, left, top: MARGIN },
    ])
    .webp({ quality: 82 })
    .toFile(output);
  made += 1;
  console.log(`[thumbnails] ${name}: ${widePath(thumbnail)} を作りました`);
}
if (made === 0) console.log('[thumbnails] 作り直す横長のサムネイルはありませんでした');
