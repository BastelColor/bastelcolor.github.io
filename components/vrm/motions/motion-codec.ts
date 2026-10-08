/**
 * モーションデータを JS に埋め込むための独自形式。
 *
 * VRMA ファイルをそのまま配信すると「取り出せる状態での二次配布」になるため、
 * three-vrm-animation が読み込んだ後のキーフレームだけを詰め直し、
 * 量子化・難読化してから base64 文字列として埋め込む。
 *
 * scripts/encode-motion.mjs（Node）とブラウザの両方から使うので、
 * このファイルは three.js やパスエイリアスに依存させない。
 *
 * バイナリの並び:
 *   times          Float32 × frameCount
 *   hipsTranslation Float32 × frameCount × 3
 *   rotations      Int16   × bones.length × frameCount × 4  (quaternion × 32767)
 */

export type EncodedMotion = {
  version: 1;
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

const QUATERNION_SCALE = 32767;

export function encodeMotion(motion: DecodedMotion): EncodedMotion {
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
    for (const value of rotation) {
      view.setInt16(offset, Math.round(value * QUATERNION_SCALE), true);
      offset += 2;
    }
  }

  scramble(bytes);
  return {
    version: 1,
    duration: motion.duration,
    restHipsPosition: motion.restHipsPosition,
    bones: motion.bones,
    frameCount,
    data: toBase64(bytes),
  };
}

export function decodeMotion(encoded: EncodedMotion): DecodedMotion {
  const { frameCount, bones } = encoded;
  const bytes = fromBase64(encoded.data);
  if (bytes.length !== byteLength(bones.length, frameCount)) {
    throw new Error('モーションデータが壊れています');
  }
  scramble(bytes);
  const view = new DataView(bytes.buffer);
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
    for (let i = 0; i < values.length; i++, offset += 2) {
      values[i] = view.getInt16(offset, true) / QUATERNION_SCALE;
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
