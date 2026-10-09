/**
 * models/ の VRM を、Web で表示する用に軽くして public/models/ に書き出す。
 * npm run dev / npm run build の前に自動で実行される（package.json の predev / prebuild）。
 *
 * やること
 * - モデルの中のテクスチャ（PNG）を WebP に変える（見た目はほぼ同じで、数分の1の大きさになる）
 *   白黒のマスクなど、少しの劣化も目立つ画像は劣化しない形式（ロスレス）で変える
 * - VRM のサムネイル画像（表示には使わない）は小さくする
 * - 頂点の向き（NORMAL）・UV・ボーンの重みを、小さい数の形（8〜16bit）で持ち直す
 *   （KHR_mesh_quantization。見た目はほぼ変わらず、届く量が減る。位置はそのまま）
 * - ポリゴン・ボーン・揺れもの・表情などは変えない
 *
 * - models/<名前>.expressions.json があれば、その表情（happy など）を足す
 *   （VRChat 用のモデルを書き出したときなど、表情が入っていない VRM のため）
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

const QUANTIZATION = 'KHR_mesh_quantization';
const FLOAT = 5126;
const BYTE = 5120;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const ENCODERS = {
  // 向きは長さ1なので、-1〜1 を 8bit（-127〜127）に。1頂点 4バイト（3つ＋そろえ用の1つ）
  normal(values, accessor) {
    if (accessor.type !== 'VEC3') return null;
    const data = Buffer.alloc(accessor.count * 4);
    for (let i = 0; i < accessor.count; i++) {
      const [x, y, z] = values.subarray(i * 3, i * 3 + 3);
      const length = Math.hypot(x, y, z) || 1;
      data.writeInt8(Math.round((x / length) * 127), i * 4);
      data.writeInt8(Math.round((y / length) * 127), i * 4 + 1);
      data.writeInt8(Math.round((z / length) * 127), i * 4 + 2);
    }
    return { data, stride: 4, componentType: BYTE };
  },
  // 0〜1 に収まる UV だけ、16bit（0〜65535）に
  uv(values, accessor) {
    if (accessor.type !== 'VEC2') return null;
    if (values.some((value) => value < 0 || value > 1)) return null;
    const data = Buffer.alloc(accessor.count * 4);
    values.forEach((value, i) =>
      data.writeUInt16LE(Math.round(value * 65535), i * 2),
    );
    return { data, stride: 4, componentType: UNSIGNED_SHORT };
  },
  // 重みは 16bit に。合計がちょうど 1 になるよう、いちばん大きい重みでずれを吸収する
  weights(values, accessor) {
    if (accessor.type !== 'VEC4') return null;
    const data = Buffer.alloc(accessor.count * 8);
    for (let i = 0; i < accessor.count; i++) {
      const weights = Array.from(values.subarray(i * 4, i * 4 + 4));
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      const quantized = weights.map((w) => Math.round((w / sum) * 65535));
      const largest = quantized.indexOf(Math.max(...quantized));
      quantized[largest] += 65535 - quantized.reduce((a, b) => a + b, 0);
      quantized.forEach((q, j) => data.writeUInt16LE(q, i * 8 + j * 2));
    }
    return { data, stride: 8, componentType: UNSIGNED_SHORT };
  },
};

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
  const expressionsPath = input.replace(/\.vrm$/i, '.expressions.json');
  const expressions = await readFile(expressionsPath, 'utf8').then(
    (text) => JSON.parse(text),
    () => null,
  );

  const inputTime = Math.max(
    (await stat(input)).mtimeMs,
    expressions ? (await stat(expressionsPath)).mtimeMs : 0,
  );
  const outputTime = await stat(output).then(
    (s) => s.mtimeMs,
    () => 0,
  );
  if (outputTime > inputTime && outputTime > scriptTime) continue;

  const source = await readFile(input);
  const optimized = await optimize(source, expressions);
  await writeFile(output, optimized);
  console.log(
    `[models] ${name}: ${toMB(source.length)} → ${toMB(optimized.length)}`,
  );
}

async function optimize(glb, expressions) {
  const { json, bin } = readGlb(glb);
  if (expressions) addExpressions(json, expressions);

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

  quantizeAttributes(json, viewData);

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

/**
 * 表情を足す。expressions は次の形（シェイプキーの名前と、かける量 0〜1）:
 *   { "happy": { "shapes": { "笑い": 1, "口角上げ": 0.5 }, "overrideBlink": "block" } }
 * overrideBlink を "block" にすると、その表情のあいだはまばたきしない（目を閉じた笑顔など）
 */
function addExpressions(json, expressions) {
  const preset = json.extensions?.VRMC_vrm?.expressions?.preset;
  if (!preset) throw new Error('VRM 1.0 の表情の設定がありません');
  for (const [name, { shapes, overrideBlink = 'none' }] of Object.entries(
    expressions,
  )) {
    const morphTargetBinds = [];
    for (const [shape, weight] of Object.entries(shapes)) {
      const before = morphTargetBinds.length;
      for (const [node, { mesh }] of json.nodes.entries()) {
        if (mesh === undefined) continue;
        const index = json.meshes[mesh].extras?.targetNames?.indexOf(shape);
        if (index >= 0) morphTargetBinds.push({ node, index, weight });
      }
      if (morphTargetBinds.length === before) {
        throw new Error(`シェイプキー「${shape}」が見つかりません（${name}）`);
      }
    }
    preset[name] = {
      isBinary: false,
      morphTargetBinds,
      overrideBlink,
      overrideLookAt: 'none',
      overrideMouth: 'none',
    };
  }
}

/**
 * NORMAL を 8bit、TEXCOORD_0（0〜1 に収まるもの）と WEIGHTS_0 を 16bit にする。
 * 変えた accessor には新しい bufferView を作り、使われなくなった元の bufferView は中身を空にする
 */
function quantizeAttributes(json, viewData) {
  const converted = new Map();
  const convert = (index, kind) => {
    if (converted.has(index)) return converted.get(index);
    const accessor = json.accessors[index];
    let result = index;
    if (
      accessor.componentType === FLOAT &&
      accessor.bufferView !== undefined &&
      !accessor.sparse
    ) {
      const values = readFloats(json, viewData, accessor);
      const bytes = encode(kind, values, accessor);
      if (bytes) {
        json.bufferViews.push({
          buffer: 0,
          byteLength: bytes.data.length,
          byteStride: bytes.stride,
          target: ARRAY_BUFFER,
        });
        viewData.push(bytes.data);
        accessor.bufferView = json.bufferViews.length - 1;
        accessor.byteOffset = 0;
        accessor.componentType = bytes.componentType;
        accessor.normalized = true;
        delete accessor.min;
        delete accessor.max;
        result = accessor;
      }
    }
    converted.set(index, result);
    return result;
  };
  const before = new Set(
    json.accessors.map((accessor) => accessor.bufferView),
  );
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const { NORMAL, TEXCOORD_0, WEIGHTS_0 } = primitive.attributes;
      if (NORMAL !== undefined) convert(NORMAL, 'normal');
      if (TEXCOORD_0 !== undefined) convert(TEXCOORD_0, 'uv');
      if (WEIGHTS_0 !== undefined) convert(WEIGHTS_0, 'weights');
    }
  }
  // 使われなくなった bufferView は 4 バイトの空にする（番号は変えない）
  const used = new Set(json.accessors.map((accessor) => accessor.bufferView));
  for (const accessor of json.accessors) {
    if (accessor.sparse) {
      used.add(accessor.sparse.indices.bufferView);
      used.add(accessor.sparse.values.bufferView);
    }
  }
  for (const image of json.images ?? []) used.add(image.bufferView);
  for (const view of before) {
    if (view === undefined || used.has(view)) continue;
    viewData[view] = Buffer.alloc(4);
    delete json.bufferViews[view].byteStride;
    delete json.bufferViews[view].target;
  }
  json.extensionsUsed = [
    ...new Set([...(json.extensionsUsed ?? []), QUANTIZATION]),
  ];
  json.extensionsRequired = [
    ...new Set([...(json.extensionsRequired ?? []), QUANTIZATION]),
  ];
}

function readFloats(json, viewData, accessor) {
  const view = json.bufferViews[accessor.bufferView];
  const data = viewData[accessor.bufferView];
  const size = TYPE_SIZE[accessor.type];
  const stride = view.byteStride ?? size * 4;
  const offset = accessor.byteOffset ?? 0;
  const values = new Float32Array(accessor.count * size);
  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < size; j++) {
      values[i * size + j] = data.readFloatLE(offset + i * stride + j * 4);
    }
  }
  return values;
}

/** 種類ごとの持ち直し方。形が合わないときは null を返して、そのままにする */
function encode(kind, values, accessor) {
  return ENCODERS[kind](values, accessor);
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
