import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';
import {
  decodeMotion,
  type DecodedMotion,
  type EncodedMotion,
} from './motion-codec';

type Three = typeof import('three');
type VRMAnimationClass =
  typeof import('@pixiv/three-vrm-animation').VRMAnimation;

/**
 * 埋め込みモーションの一覧。データは重いので、使うときに別チャンクとして読み込む。
 * 追加するときは scripts/encode-motion.mjs で generated/ に書き出してからここに足す。
 */
const sources = {
  'show-full-body': () => import('./generated/show-full-body'),
} satisfies Record<string, () => Promise<{ default: EncodedMotion }>>;

export type MotionId = keyof typeof sources;

// モデルを切り替えても使い回す
const cache = new Map<MotionId, Promise<VRMAnimation>>();

export function loadMotion(
  id: MotionId,
  THREE: Three,
  VRMAnimation: VRMAnimationClass,
): Promise<VRMAnimation> {
  const cached = cache.get(id);
  if (cached) return cached;

  const loading = sources[id]().then(async ({ default: encoded }) =>
    toVrmAnimation(await decodeMotion(encoded), THREE, VRMAnimation),
  );
  loading.catch(() => cache.delete(id));
  cache.set(id, loading);
  return loading;
}

/** three-vrm-animation が VRMA を読み込んだ直後と同じ形に組み立てる */
function toVrmAnimation(
  motion: DecodedMotion,
  THREE: Three,
  VRMAnimation: VRMAnimationClass,
) {
  const animation = new VRMAnimation();
  animation.duration = motion.duration;
  animation.restHipsPosition.fromArray(motion.restHipsPosition);

  // トラック名は createVRMAnimationClip がモデルのボーン名で付け直すので仮のもの
  animation.humanoidTracks.translation.set(
    'hips',
    new THREE.VectorKeyframeTrack(
      'hips.position',
      motion.times,
      motion.hipsTranslation,
    ),
  );
  motion.bones.forEach((bone, i) => {
    animation.humanoidTracks.rotation.set(
      bone as VRMHumanBoneName,
      new THREE.QuaternionKeyframeTrack(
        `${bone}.quaternion`,
        motion.times,
        motion.rotations[i],
      ),
    );
  });
  return animation;
}
