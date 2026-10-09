import type { AnimationAction, Object3D } from 'three';
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
  /** ずっとくり返すモーション */
  play: (animation: VRMAnimation) => void;
  /** 1回だけ再生し、終わったら play() のモーションへもどる（あいさつなどのしぐさ） */
  playOnce: (animation: VRMAnimation) => void;
  update: (delta: number) => void;
  dispose: () => void;
};

type MotionPlayerOptions = {
  THREE: Three;
  createVRMAnimationClip: AnimationModule['createVRMAnimationClip'];
  VRMHumanBoneName: VrmModule['VRMHumanBoneName'];
  vrm: VRM;
};

/** 待機 → VRMA、ループの終わり → 始まり、しぐさの前後をつなぐ時間（秒） */
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

  // 再生中のモーション。しぐさの再生中は action = onceAction
  let action: AnimationAction | null = null;
  let loopAction: AnimationAction | null = null;
  let onceAction: AnimationAction | null = null;
  // 同じモーションをくり返し使うので、作った AnimationAction を取っておく
  const actions = new Map<VRMAnimation, AnimationAction>();
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

  const actionFor = (animation: VRMAnimation) => {
    let found = actions.get(animation);
    if (!found) {
      found = mixer.clipAction(createVRMAnimationClip(animation, vrm));
      actions.set(animation, found);
    }
    return found;
  };

  // 今のポーズから混ぜながら、next の頭から再生する
  const switchTo = (next: AnimationAction | null) => {
    action?.stop();
    action = next;
    action?.reset().play();
    // モーションが読み込み済みだと、最初のフレームより先に再生が始まる。
    // そのときは今のポーズ（待機ポーズ）から混ぜる
    // （記録がないまま混ぜると、腰が原点＝床の高さから持ち上がって見える）
    if (!hasLastPose) rememberPose();
    startBlend();
  };

  return {
    play: (animation) => {
      loopAction = actionFor(animation);
      loopAction.setLoop(THREE.LoopRepeat, Infinity);
      // しぐさの最中なら、終わってから切りかえる
      if (!onceAction) switchTo(loopAction);
    },

    playOnce: (animation) => {
      onceAction = actionFor(animation);
      onceAction.setLoop(THREE.LoopOnce, 1);
      onceAction.clampWhenFinished = true;
      switchTo(onceAction);
    },

    update: (delta) => {
      if (action) {
        const previousTime = action.time;
        mixer.update(delta);
        if (action === onceAction && !action.isRunning()) {
          // しぐさが終わった。くり返しのモーションへもどる
          onceAction = null;
          switchTo(loopAction);
        } else if (action.time < previousTime) {
          // 再生位置が巻き戻った = ループの先頭に戻った
          startBlend();
        }

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
      actions.clear();
      action = null;
      loopAction = null;
      onceAction = null;
    },
  };
}
