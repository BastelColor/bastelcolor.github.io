/**
 * 書き出したサイト（dist/client）の、作品と記事の画像を軽くする。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 対象: dist/client/works/ と dist/client/posts/ の .png .jpg .jpeg .webp
 * - 横幅が MAX_WIDTH より大きい画像は、MAX_WIDTH まで縮める
 * - 大きすぎるファイル（LARGE_BYTES より大きいもの）は、同じ形式のまま圧縮し直す
 *   （PNG は見た目の変わらない圧縮、JPEG・WebP は少しだけ画質を落とす）
 * - それ以外のすでに軽い画像は、画質が落ちないようにさわらない
 * - 結果のほうが小さくなったときだけ置きかえる
 *
 * ファイルの名前と形式は変えないので、content/ に書いたパスはそのまま使える。
 * public/ の元の画像は書きかえない（公開するものだけを軽くする）。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { dist } from './built-posts.mjs';

/** 画像の横幅の上限（作品の詳細・記事の本文で、いちばん大きく出る幅の2倍ほど） */
const MAX_WIDTH = 1600;
const FOLDERS = ['works', 'posts'];
const IMAGE = /\.(png|jpe?g|webp)$/i;
/** これより大きいファイルは、縮めなくても圧縮し直す（WebP は元から軽いので大きめ） */
const LARGE_BYTES = {
  '.png': 300_000,
  '.jpg': 300_000,
  '.jpeg': 300_000,
  '.webp': 500_000,
};

let count = 0;
let saved = 0;
for (const folder of FOLDERS) {
  for (const file of await listFiles(path.join(dist, folder))) {
    if (!IMAGE.test(file)) continue;
    const original = await readFile(file);
    const optimized = await optimize(
      original,
      path.extname(file).toLowerCase(),
    );
    if (optimized && optimized.length < original.length) {
      await writeFile(file, optimized);
      count++;
      saved += original.length - optimized.length;
    }
  }
}
console.log(
  count
    ? `[images] ${count} 枚を軽くしました（${(saved / 1024).toFixed(0)}KB 減）`
    : '[images] 軽くできる画像はありませんでした',
);

async function optimize(buffer, extension) {
  let image = sharp(buffer);
  const { width } = await image.metadata();
  const tooWide = width !== undefined && width > MAX_WIDTH;
  if (!tooWide && buffer.length <= LARGE_BYTES[extension]) return null;
  if (tooWide) image = image.resize({ width: MAX_WIDTH });
  if (extension === '.png') {
    return image
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  }
  if (extension === '.webp') {
    return image.webp({ quality: 85, alphaQuality: 100 }).toBuffer();
  }
  return image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return files.flat();
}
