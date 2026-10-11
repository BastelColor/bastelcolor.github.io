import type { Quaternion } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * 写真用の決めポーズ（アバターの部屋の「ポーズ」のボタン）。
 *
 *   dance   ポーズなし（いつもの踊り）
 *   peace   右手でピース
 *   wave    右手をあげて、手をふる
 *   banzai  両手をあげて、ばんざい
 *
 * 決めポーズのあいだも、待機の小さな揺れ（呼吸・まばたき）はそのまま。踊りからは、なめらかに切りかえる。
 * 角度は、正規化ボーン（Tポーズ = 回転 0）に対する回転（ラジアン）[x, y, z]。
 * x は骨の向き（Tポーズで左右にのびる腕・指の向き）のまわりのひねりで、いちばん先にかける。そのあと y・z の順に回す。
 * 書いていない骨は、待機ポーズ（components/vrm/idle-motion.ts）のまま。向きは idle-motion.ts の説明のとおり
 * （上腕は Z で上下（左は負・右は正で下がる）、前腕は Y で肘が前に曲がる・Z で上下、指は Z で曲がる）
 */
export const POSES = ['dance', 'peace', 'wave', 'banzai'] as const;
export type Pose = (typeof POSES)[number];

type Euler3 = [number, number, number];
type PoseSpec = {
  bones: Partial<Record<VRMHumanBoneName, Euler3>>;
  /** 時間で少し動かす骨（手をふるなど）。elapsed は秒 */
  animate?: (elapsed: number) => Partial<Record<VRMHumanBoneName, Euler3>>;
};

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

/** side の手の指を、曲げる量（0 でまっすぐ）で並べる */
function fingers(
  side: 'left' | 'right',
  curl: Record<(typeof FINGERS)[number] | 'Thumb', number>,
) {
  const sign = side === 'left' ? -1 : 1;
  const result: Partial<Record<VRMHumanBoneName, Euler3>> = {};
  for (const finger of FINGERS) {
    for (const joint of JOINTS) {
      result[`${side}${finger}${joint}` as VRMHumanBoneName] = [0, 0, sign * curl[finger]];
    }
  }
  // 親指は、手のひらのほうへ倒す（Y）
  for (const joint of ['Metacarpal', 'Proximal', 'Distal'] as const) {
    result[`${side}Thumb${joint}` as VRMHumanBoneName] = [0, sign * curl.Thumb, 0];
  }
  return result;
}

const POSE_SPECS: Record<Exclude<Pose, 'dance'>, PoseSpec> = {
  peace: {
    bones: {
      rightUpperArm: [0, 0.75, 0.55],
      // 前腕を、腕の向きのまわりにひねって、手のひらを見ている人のほうへ向ける
      rightLowerArm: [-1.2, 0.35, -2.1],
      rightHand: [0, 0, 0.15],
      ...fingers('right', { Index: 0, Middle: 0, Ring: 1.3, Little: 1.3, Thumb: 0.9 }),
      // 人さし指と中指を V の字に開く（指の付け根を Y まわりに逆向きへ）
      rightIndexProximal: [0, 0.3, 0],
      rightMiddleProximal: [0, -0.22, 0],
      head: [0, -0.12, 0.12],
      neck: [0, 0, 0.05],
    },
  },
  wave: {
    bones: {
      rightUpperArm: [0, 0.2, -0.35],
      rightLowerArm: [0, 0, -1.25],
      ...fingers('right', { Index: 0.05, Middle: 0.05, Ring: 0.05, Little: 0.05, Thumb: 0.2 }),
      head: [0, -0.08, 0.06],
    },
    animate: (elapsed) => ({
      rightLowerArm: [0, 0, -1.25 + Math.sin(elapsed * 7) * 0.28],
    }),
  },
  banzai: {
    bones: {
      leftUpperArm: [0, -0.15, 1.15],
      rightUpperArm: [0, 0.15, -1.15],
      leftLowerArm: [0, 0, 0.25],
      rightLowerArm: [0, 0, -0.25],
      ...fingers('left', { Index: 0.1, Middle: 0.1, Ring: 0.1, Little: 0.1, Thumb: 0.2 }),
      ...fingers('right', { Index: 0.1, Middle: 0.1, Ring: 0.1, Little: 0.1, Thumb: 0.2 }),
      head: [-0.1, 0, 0],
      spine: [-0.05, 0, 0],
    },
  },
};

/** 決めポーズからいつもの踊りへ、また踊りから決めポーズへ切りかえるのにかける時間（秒） */
const POSE_BLEND = 0.45;

export type PoseControl = {
  set: (pose: Pose) => void;
  /**
   * 待機ポーズ（idle.update のすぐあと）を覚える。毎フレーム、踊り（motion-player）の前に呼ぶ
   */
  rememberIdle: () => void;
  /** 踊り（motion-player）のあとに呼ぶ。決めポーズへ寄せる */
  apply: (elapsed: number, delta: number) => void;
};

export function createPoseControl(
  THREE: typeof import('three'),
  vrm: VRM,
): PoseControl {
  const humanoid = vrm.humanoid;
  const names = Object.keys(humanoid.humanBones) as VRMHumanBoneName[];
  const bones = names
    .map((name) => ({ name, node: humanoid.getNormalizedBoneNode(name) }))
    .filter((bone): bone is { name: VRMHumanBoneName; node: NonNullable<typeof bone.node> } => !!bone.node);
  const idle = bones.map(() => new THREE.Quaternion());
  const idleHips = new THREE.Vector3();
  const hips = humanoid.getNormalizedBoneNode('hips');
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const roll = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  let pose: Pose = 'dance';
  // 決めポーズへの寄せ具合（0 = 踊り、1 = 決めポーズ）
  let weight = 0;

  return {
    set: (next) => {
      pose = next;
    },
    rememberIdle: () => {
      bones.forEach(({ node }, i) => idle[i].copy(node.quaternion));
      if (hips) idleHips.copy(hips.position);
    },
    apply: (elapsed, delta) => {
      const goal = pose === 'dance' ? 0 : 1;
      weight =
        goal > weight
          ? Math.min(1, weight + delta / POSE_BLEND)
          : Math.max(0, weight - delta / POSE_BLEND);
      if (weight === 0) return;
      // なめらかに（はじめと終わりをゆっくり）
      const t = weight * weight * (3 - 2 * weight);
      const spec = pose === 'dance' ? null : POSE_SPECS[pose];
      const moving = spec?.animate?.(elapsed);
      bones.forEach(({ name, node }, i) => {
        const angles = moving?.[name] ?? spec?.bones[name];
        if (angles) {
          target
            .setFromEuler(euler.set(0, angles[1], angles[2]))
            .multiply(roll.setFromAxisAngle(xAxis, angles[0]));
        } else {
          target.copy(idle[i]);
        }
        (node.quaternion as Quaternion).slerp(target, t);
      });
      if (hips) hips.position.lerp(idleHips, t);
    },
  };
}
