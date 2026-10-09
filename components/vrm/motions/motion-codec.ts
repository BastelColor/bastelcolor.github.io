/**
 * モーションデータを JS に埋め込むための独自形式。
 *
 * VRMA ファイルをそのまま配信すると「取り出せる状態での二次配布」になるため、
 * three-vrm-animation が読み込んだ後のキーフレームだけを詰め直し、
 * 量子化・圧縮・難読化してから base64 文字列として埋め込む。
 *
 * scripts/encode-motion.mjs（Node）とブラウザの両方から使うので、
 * このファイルは three.js やパスエイリアスに依存させない
 * （圧縮は、どちらにもある CompressionStream を使う）。
 *
 * バイナリの並び（圧縮する前）:
 *   times          Float32 × frameCount
 *   hipsTranslation Float32 × frameCount × 3
 *   rotations      Int16   × bones.length × 4 × frameCount
 *                  （quaternion × 4096（角度にして0.03度ほどの細かさで、見た目は変わらない）。ボーン・成分ごとに、1つ前のフレームとの差を 16bit で入れる。
 *                    動かないボーンは差が 0 になり、よく縮む）
 *
 * 難読化（scramble）は圧縮のあとにかける。先にかけると、データが乱数のようになって縮まない。
 */

export type EncodedMotion = {
  version: 2;
  duration: number;
  restHipsPosition: [number, number, number];
  /** VRM の humanoid ボーン名。rotations はこの順に並ぶ */
  bones: string[];
  frameCount: number;
  data: string;
};

export type DecodedMotion = {
  duration: number;
  restHipsPosition: [number, number, number];
  bones: string[];
  times: Float32Array;
  hipsTranslation: Float32Array;
  /** bones と同じ順。各要素は frameCount × 4 の quaternion */
  rotations: Float32Array[];
};

const QUATERNION_SCALE = 4096;

export async function encodeMotion(
  motion: DecodedMotion,
): Promise<EncodedMotion> {
  const frameCount = motion.times.length;
  const bytes = new Uint8Array(byteLength(motion.bones.length, frameCount));
  const view = new DataView(bytes.buffer);
  let offset = 0;

  for (const time of motion.times) {
    view.setFloat32(offset, time, true);
    offset += 4;
  }
  for (const value of motion.hipsTranslation) {
    view.setFloat32(offset, value, true);
    offset += 4;
  }
  for (const rotation of motion.rotations) {
    for (let component = 0; component < 4; component++) {
      let previous = 0;
      for (let frame = 0; frame < frameCount; frame++) {
        const value = Math.round(
          rotation[frame * 4 + component] * QUATERNION_SCALE,
        );
        view.setUint16(offset, (value - previous) & 0xffff, true);
        previous = value;
        offset += 2;
      }
    }
  }

  const compressed = await transform(bytes, new CompressionStream('deflate-raw'));
  scramble(compressed);
  return {
    version: 2,
    duration: motion.duration,
    restHipsPosition: motion.restHipsPosition,
    bones: motion.bones,
    frameCount,
    data: toBase64(compressed),
  };
}

export async function decodeMotion(
  encoded: EncodedMotion,
): Promise<DecodedMotion> {
  const { frameCount, bones } = encoded;
  const compressed = fromBase64(encoded.data);
  scramble(compressed);
  const bytes = await transform(
    compressed,
    new DecompressionStream('deflate-raw'),
  );
  if (bytes.length !== byteLength(bones.length, frameCount)) {
    throw new Error('モーションデータが壊れています');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const times = new Float32Array(frameCount);
  for (let i = 0; i < times.length; i++, offset += 4) {
    times[i] = view.getFloat32(offset, true);
  }
  const hipsTranslation = new Float32Array(frameCount * 3);
  for (let i = 0; i < hipsTranslation.length; i++, offset += 4) {
    hipsTranslation[i] = view.getFloat32(offset, true);
  }
  const rotations = bones.map(() => {
    const values = new Float32Array(frameCount * 4);
    for (let component = 0; component < 4; component++) {
      let value = 0;
      for (let frame = 0; frame < frameCount; frame++, offset += 2) {
        // 差を足して元に戻す（16bit で桁あふれさせて、符号付きに読み直す）
        value = ((value + view.getUint16(offset, true)) << 16) >> 16;
        values[frame * 4 + component] = value / QUATERNION_SCALE;
      }
    }
    normalizeQuaternions(values);
    return values;
  });

  return {
    duration: encoded.duration,
    restHipsPosition: encoded.restHipsPosition,
    bones,
    times,
    hipsTranslation,
    rotations,
  };
}

/** CompressionStream / DecompressionStream に通す */
async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function byteLength(boneCount: number, frameCount: number) {
  return frameCount * 4 + frameCount * 3 * 4 + boneCount * frameCount * 4 * 2;
}

/** 量子化の誤差で長さが1からずれるので戻す */
function normalizeQuaternions(values: Float32Array) {
  for (let i = 0; i < values.length; i += 4) {
    const length = Math.hypot(
      values[i],
      values[i + 1],
      values[i + 2],
      values[i + 3],
    );
    if (length === 0) continue;
    for (let j = 0; j < 4; j++) values[i + j] /= length;
  }
}

/** 固定シードの xorshift32 と XOR する（2回かけると元に戻る） */
function scramble(bytes: Uint8Array) {
  let state = 0x59a7c0de ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] ^= state & 0xff;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
