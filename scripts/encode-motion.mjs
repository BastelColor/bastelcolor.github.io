/**
 * VRMA ファイルを、サイトに埋め込む独自形式のモーションデータに変換する。
 *
 *   npm run motion:encode -- <入力.vrma> <モーションID> [fps]
 *   例) npm run motion:encode -- motion-sources/VRMA_01.vrma show-full-body
 *
 * 出力: components/vrm/motions/generated/<モーションID>.ts
 * 生成後、components/vrm/motions/index.ts の sources に登録する。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { encodeMotion } from '../components/vrm/motions/motion-codec.ts';

const [input, id, fpsArg = '30'] = process.argv.slice(2);
if (!input || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error(
    '使い方: npm run motion:encode -- <入力.vrma> <モーションID(英小文字・数字・ハイフン)> [fps]',
  );
  process.exit(1);
}
const targetFps = Number(fpsArg);

// --- three-vrm-animation で読み込む（ブラウザで読むのと同じ変換がかかる） ---
const file = readFileSync(input);
const loader = new GLTFLoader();
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
const gltf = await loader.parseAsync(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  '',
);
const animation = gltf.userData.vrmAnimations?.[0];
if (!animation) throw new Error(`VRMA として読み込めませんでした: ${input}`);

if (
  animation.expressionTracks.preset.size > 0 ||
  animation.expressionTracks.custom.size > 0 ||
  animation.lookAtTrack
) {
  console.warn('表情・視線のトラックは未対応のため含めません');
}

// --- 全トラックが同じ時刻列を持つ前提で1本にまとめ、間引く ---
const rotationTracks = [...animation.humanoidTracks.rotation];
const hipsTrack = animation.humanoidTracks.translation.get('hips');
if (!hipsTrack) throw new Error('hips の移動トラックがありません');

const sourceTimes = hipsTrack.times;
for (const [bone, track] of rotationTracks) {
  const sameTimes =
    track.times.length === sourceTimes.length &&
    track.times.every((time, i) => Math.abs(time - sourceTimes[i]) < 1e-6);
  if (!sameTimes) throw new Error(`${bone} のキーフレーム時刻が他と異なります`);
}

const frames = [];
let nextTime = 0;
sourceTimes.forEach((time, i) => {
  const isLast = i === sourceTimes.length - 1;
  if (time + 1e-6 >= nextTime || isLast) {
    frames.push(i);
    nextTime = time + 1 / targetFps;
  }
});

const pick = (values, size) =>
  Float32Array.from(
    frames.flatMap((frame) =>
      Array.from(values.subarray(frame * size, frame * size + size)),
    ),
  );

const encoded = await encodeMotion({
  duration: animation.duration,
  restHipsPosition: animation.restHipsPosition.toArray(),
  bones: rotationTracks.map(([bone]) => bone),
  times: Float32Array.from(frames.map((frame) => sourceTimes[frame])),
  hipsTranslation: pick(hipsTrack.values, 3),
  rotations: rotationTracks.map(([, track]) => pick(track.values, 4)),
});

// --- TS ファイルとして書き出す ---
const output = `components/vrm/motions/generated/${id}.ts`;
writeFileSync(
  output,
  `// このファイルは scripts/encode-motion.mjs で生成しています。直接編集しないでください。
// 元データ: ${basename(input)}
import type { EncodedMotion } from '../motion-codec';

const motion: EncodedMotion = ${JSON.stringify(encoded)};

export default motion;
`,
);
console.log(
  `${output} を書き出しました（${sourceTimes.length} → ${frames.length} フレーム, ${encoded.bones.length} ボーン, ${Math.round(encoded.data.length / 1024)} KB）`,
);
