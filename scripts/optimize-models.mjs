/**
 * models/ の VRM を、Web で表示する用に軽くして public/models/ に書き出す。
 * npm run dev / npm run build の前に自動で実行される（package.json の predev / prebuild）。
 *
 * やること
 * - モデルの中のテクスチャ（PNG）を WebP に変える（見た目はほぼ同じで、数分の1の大きさになる）
 *   白黒のマスクなど、少しの劣化も目立つ画像は劣化しない形式（ロスレス）で変える
 * - VRM のサムネイル画像（表示には使わない）は小さくする
 * - ポリゴン・ボーン・揺れもの・表情などは変えない
 *
 * 元の VRM（models/）は書き換えない。書き出し先が元より新しければ、作り直さない。
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'models');
const outputDir = path.join(root, 'public', 'models');
const scriptPath = fileURLToPath(import.meta.url);

/** 色のテクスチャの WebP の画質（0〜100） */
const QUALITY = 90;
/** VRM のサムネイル画像の大きさ */
const THUMBNAIL_SIZE = 256;

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const WEBP = 'EXT_texture_webp';

await mkdir(outputDir, { recursive: true });
const scriptTime = (await stat(scriptPath)).mtimeMs;

for (const name of await readdir(sourceDir)) {
  if (!name.toLowerCase().endsWith('.vrm')) continue;
  const input = path.join(sourceDir, name);
  const output = path.join(outputDir, name);

  const inputTime = (await stat(input)).mtimeMs;
  const outputTime = await stat(output).then(
    (s) => s.mtimeMs,
    () => 0,
  );
  if (outputTime > inputTime && outputTime > scriptTime) continue;

  const source = await readFile(input);
  const optimized = await optimize(source);
  await writeFile(output, optimized);
  console.log(
    `[models] ${name}: ${toMB(source.length)} → ${toMB(optimized.length)}`,
  );
}

async function optimize(glb) {
  const { json, bin } = readGlb(glb);

  const thumbnail = json.extensions?.VRMC_vrm?.meta?.thumbnailImage;
  const images = json.images ?? [];
  const viewData = json.bufferViews.map((view) =>
    bin.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    ),
  );

  // 画像を WebP にして、その画像が入っている場所の中身を差し替える
  for (const [index, image] of images.entries()) {
    if (image.bufferView === undefined) continue;
    const original = viewData[image.bufferView];
    let encoder = sharp(original);
    const { channels } = await encoder.metadata();
    if (index === thumbnail) {
      encoder = encoder
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside' })
        .webp({ quality: 80 });
    } else if (isMask(image, channels)) {
      encoder = encoder.webp({ lossless: true });
    } else {
      encoder = encoder.webp({ quality: QUALITY, alphaQuality: 100 });
    }
    viewData[image.bufferView] = await encoder.toBuffer();
    image.mimeType = 'image/webp';
  }

  // テクスチャは EXT_texture_webp で WebP の画像を指す
  for (const texture of json.textures ?? []) {
    if (texture.source === undefined) continue;
    texture.extensions = {
      ...texture.extensions,
      [WEBP]: { source: texture.source },
    };
    delete texture.source;
  }
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), WEBP])];
  json.extensionsRequired = [
    ...new Set([...(json.extensionsRequired ?? []), WEBP]),
  ];

  // 中身を詰め直す（それぞれの場所の先頭は 4 バイト区切りにそろえる）
  const parts = [];
  let offset = 0;
  for (const [index, view] of json.bufferViews.entries()) {
    const padding = (4 - (offset % 4)) % 4;
    if (padding) parts.push(Buffer.alloc(padding));
    offset += padding;
    view.byteOffset = offset;
    view.byteLength = viewData[index].length;
    parts.push(viewData[index]);
    offset += view.byteLength;
  }
  const newBin = Buffer.concat(parts);
  json.buffers[0].byteLength = newBin.length;

  return writeGlb(json, newBin);
}

/** 白黒のマスク画像（名前に mask が付くもの、または色が1つだけの画像） */
function isMask(image, channels) {
  return /mask/i.test(image.name ?? '') || channels === 1;
}

function readGlb(glb) {
  if (glb.readUInt32LE(0) !== GLB_MAGIC) throw new Error('GLB ではありません');
  let offset = 12;
  let json;
  let bin;
  while (offset < glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const data = glb.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    if (type === CHUNK_BIN) bin = data;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error('GLB の中身が読めません');
  if (json.buffers.length !== 1)
    throw new Error('buffer が1つの GLB だけ扱えます');
  return { json, bin };
}

function writeGlb(json, bin) {
  const jsonBytes = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binBytes = pad(bin, 0);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  return Buffer.concat([
    header,
    chunkHeader(jsonBytes.length, CHUNK_JSON),
    jsonBytes,
    chunkHeader(binBytes.length, CHUNK_BIN),
    binBytes,
  ]);
}

function chunkHeader(length, type) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(length, 0);
  header.writeUInt32LE(type, 4);
  return header;
}

function pad(buffer, fill) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding
    ? Buffer.concat([buffer, Buffer.alloc(padding, fill)])
    : buffer;
}

function toMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
