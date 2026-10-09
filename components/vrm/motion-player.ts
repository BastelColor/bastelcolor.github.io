import type { Interpolant, Object3D, Quaternion, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

type Three = typeof import('three');
type AnimationModule = typeof import('@pixiv/three-vrm-animation');
type VrmModule = typeof import('@pixiv/three-vrm');

/**
 * VRMA をループ再生し、待機モーションからなめらかにつなぐ。
 *
 * 毎フレームの流れ（vrm-stage.ts）:
 *   1. idle-motion が待機ポーズを作る（ボーンを全部 T ポーズから組み立て直す）
 *   2. update() が VRMA のポーズを、VRMA に入っているボーンへ毎フレーム必ず書き込む。
 *      再生開始直後とループの継ぎ目だけは、直前に表示していたポーズと混ぜる
 *   3. vrm.update() で実際のボーン・揺れものに反映
 *
 * three.js の AnimationMixer は使わない。AnimationMixer は「前のフレームと同じ値」なら
 * ボーンに書き込まないので、手順 1 で待機ポーズに戻された指などが、モーションが止まっている
 * 瞬間だけ待機ポーズになり、ぴくっと痙攣して見えていた。
 */
export type MotionPlayer = {
  play: (animation: VRMAnimation) => void;
  update: (delta: number) => void;
  dispose: () => void;
};

type MotionPlayerOptions = {
  THREE: Three;
  createVRMAnimationClip: AnimationModule['createVRMAnimationClip'];
  VRMHumanBoneName: VrmModule['VRMHumanBoneName'];
  vrm: VRM;
};

/** 待機 → VRMA、ループの終わり → 始まりをつなぐ時間（秒） */
const BLEND_DURATION = 0.4;

/** VRMA の1本のトラック（1つのボーンの回転、または腰の位置） */
type Channel = {
  target: Quaternion | Vector3;
  interpolant: Interpolant;
};

export function createMotionPlayer({
  THREE,
  createVRMAnimationClip,
  VRMHumanBoneName,
  vrm,
}: MotionPlayerOptions): MotionPlayer {
  const bones = Object.values(VRMHumanBoneName)
    .map((name) => vrm.humanoid.getNormalizedBoneNode(name))
    .filter((node): node is Object3D => node !== null);
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');

  // 直前のフレームで表示したポーズと、混ぜ始めたときのポーズ
  const lastPose = bones.map(() => new THREE.Quaternion());
  const lastHips = new THREE.Vector3();
  const blendFromPose = bones.map(() => new THREE.Quaternion());
  const blendFromHips = new THREE.Vector3();
  const motionPose = new THREE.Quaternion();
  const motionHips = new THREE.Vector3();

  let channels: Channel[] = [];
  let duration = 0;
  let time = 0;
  let blendElapsed = BLEND_DURATION;
  let hasLastPose = false;

  const rememberPose = () => {
    bones.forEach((bone, i) => lastPose[i].copy(bone.quaternion));
    if (hips) lastHips.copy(hips.position);
    hasLastPose = true;
  };

  const startBlend = () => {
    bones.forEach((_, i) => blendFromPose[i].copy(lastPose[i]));
    blendFromHips.copy(lastHips);
    blendElapsed = 0;
  };

  return {
    play: (animation) => {
      const clip = createVRMAnimationClip(animation, vrm);
      channels = clip.tracks.flatMap((track): Channel[] => {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(
          track.name,
        );
        const node = THREE.PropertyBinding.findNode(vrm.scene, nodeName) as
          | Object3D
          | undefined;
        if (!node) return [];
        const size = track.getValueSize();
        // 回転は球面で、腰の位置はまっすぐ、キーフレームの間を補間する
        if (propertyName === 'quaternion') {
          return [
            {
              target: node.quaternion,
              interpolant: new THREE.QuaternionLinearInterpolant(
                track.times,
                track.values,
                size,
                new Float32Array(size),
              ),
            },
          ];
        }
        if (propertyName === 'position') {
          return [
            {
              target: node.position,
              interpolant: new THREE.LinearInterpolant(
                track.times,
                track.values,
                size,
                new Float32Array(size),
              ),
            },
          ];
        }
        // 表情などのトラックは使わない
        return [];
      });
      duration = clip.duration;
      time = 0;
      // モーションが読み込み済みだと、最初のフレームより先に再生が始まる。
      // そのときは今のポーズ（待機ポーズ）から混ぜる
      // （記録がないまま混ぜると、腰が原点＝床の高さから持ち上がって見える）
      if (!hasLastPose) rememberPose();
      startBlend();
    },

    update: (delta) => {
      if (channels.length > 0 && duration > 0) {
        time += delta;
        if (time >= duration) {
          // ループの先頭に戻った
          time %= duration;
          startBlend();
        }
        for (const { target, interpolant } of channels) {
          target.fromArray(interpolant.evaluate(time));
        }
        // 補間の誤差で、回転の長さが1からずれないようにする
        for (const bone of bones) bone.quaternion.normalize();

        blendElapsed += delta;
        const weight = Math.min(1, blendElapsed / BLEND_DURATION);
        if (weight < 1) {
          bones.forEach((bone, i) => {
            motionPose.copy(bone.quaternion);
            bone.quaternion.slerpQuaternions(
              blendFromPose[i],
              motionPose,
              weight,
            );
          });
          if (hips) {
            motionHips.copy(hips.position);
            hips.position.lerpVectors(blendFromHips, motionHips, weight);
          }
        }
      }
      rememberPose();
    },

    dispose: () => {
      channels = [];
    },
  };
}
