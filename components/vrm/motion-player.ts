import type { Object3D } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

type Three = typeof import('three');
type AnimationModule = typeof import('@pixiv/three-vrm-animation');
type VrmModule = typeof import('@pixiv/three-vrm');

/**
 * VRMA をループ再生し、待機モーションからなめらかにつなぐ。
 *
 * 毎フレームの流れ（vrm-stage.ts）:
 *   1. idle-motion が待機ポーズを作る
 *   2. update() が AnimationMixer で VRMA のポーズを書き込む。
 *      再生開始直後とループの継ぎ目だけは、直前に表示していたポーズと混ぜる
 *   3. vrm.update() で実際のボーン・揺れものに反映
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

export function createMotionPlayer({
  THREE,
  createVRMAnimationClip,
  VRMHumanBoneName,
  vrm,
}: MotionPlayerOptions): MotionPlayer {
  const mixer = new THREE.AnimationMixer(vrm.scene);

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

  let action: import('three').AnimationAction | null = null;
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
      action?.stop();
      action = mixer.clipAction(createVRMAnimationClip(animation, vrm));
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      // モーションが読み込み済みだと、最初のフレームより先に再生が始まる。
      // そのときは今のポーズ（待機ポーズ）から混ぜる
      // （記録がないまま混ぜると、腰が原点＝床の高さから持ち上がって見える）
      if (!hasLastPose) rememberPose();
      startBlend();
    },

    update: (delta) => {
      if (action) {
        const previousTime = action.time;
        mixer.update(delta);
        // 再生位置が巻き戻った = ループの先頭に戻った
        if (action.time < previousTime) startBlend();

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
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      action = null;
    },
  };
}
