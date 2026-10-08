import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * モーションファイルを使わず、ボーンを直接動かす待機モーション。
 *
 * 正規化ボーン（Tポーズ = 回転0）に対して回転を与える。
 * VRMA 再生中もこのポーズを毎フレーム作り、motion-player がそこへ重ねる。
 * VRM 1.0 はモデルが +Z を向き、モデルの左手側が +X になる。
 *   - 上腕を Z 軸まわりに回すと腕が上下する（左は負、右は正で下がる）
 *   - 前腕を Y 軸まわりに回すと肘が前に曲がる（左は負、右は正）
 *   - 指を Z 軸まわりに回すと手のひら側へ曲がる（左は負、右は正）
 */
export type IdleMotion = {
  /** elapsed: モーション開始からの経過秒数 */
  update: (elapsed: number) => void;
};

const ARM_DOWN = 1.22; // 約70°
const ELBOW_BEND = 0.28;
const FINGER_CURL = 0.22;
const BREATH_PERIOD = 4.2; // 秒

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const FINGER_JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

export function createIdleMotion(vrm: VRM): IdleMotion {
  const bone = (name: VRMHumanBoneName) =>
    vrm.humanoid.getNormalizedBoneNode(name);

  const hips = bone('hips');
  const spine = bone('spine');
  const chest = bone('upperChest') ?? bone('chest');
  const neck = bone('neck');
  const head = bone('head');
  const arms = {
    left: {
      upper: bone('leftUpperArm'),
      lower: bone('leftLowerArm'),
      side: -1,
    },
    right: {
      upper: bone('rightUpperArm'),
      lower: bone('rightLowerArm'),
      side: 1,
    },
  };

  const fingerJoints = (['left', 'right'] as const).flatMap((prefix) =>
    FINGERS.flatMap((finger) =>
      FINGER_JOINTS.map((joint) => ({
        node: bone(`${prefix}${finger}${joint}` as VRMHumanBoneName),
        side: prefix === 'left' ? -1 : 1,
      })),
    ),
  );

  const blink = createBlinker(vrm);

  return {
    update: (elapsed) => {
      // 毎フレーム Tポーズから組み立て直す（VRMA 再生後の回転が残らないように）
      vrm.humanoid.resetNormalizedPose();

      for (const { node, side } of fingerJoints) {
        if (node) node.rotation.z = side * FINGER_CURL;
      }

      const breath = Math.sin((elapsed / BREATH_PERIOD) * Math.PI * 2);
      // 周期の違う sin を重ねて、規則的すぎない揺れにする
      const sway = Math.sin(elapsed * 0.53) + 0.4 * Math.sin(elapsed * 1.17);

      if (hips) hips.rotation.z = sway * 0.008;
      if (spine) spine.rotation.z = -sway * 0.012;
      if (chest) chest.rotation.x = breath * 0.018;
      if (neck) neck.rotation.y = sway * 0.02;
      if (head) {
        head.rotation.y = Math.sin(elapsed * 0.37) * 0.07;
        head.rotation.x = Math.sin(elapsed * 0.61) * 0.025 - breath * 0.01;
        head.rotation.z = -sway * 0.02;
      }

      for (const { upper, lower, side } of Object.values(arms)) {
        // 息を吸うと腕がわずかに開く
        if (upper) upper.rotation.z = side * (ARM_DOWN - breath * 0.025);
        if (lower) lower.rotation.y = side * ELBOW_BEND;
      }

      blink(elapsed);
    },
  };
}

/** 2〜5秒おきに、ときどき2回続けてまばたきする */
function createBlinker(vrm: VRM) {
  const BLINK_DURATION = 0.16;
  let nextBlinkAt = 1.5;
  let blinkStartedAt = -1;

  return (elapsed: number) => {
    const expressions = vrm.expressionManager;
    if (!expressions) return;

    if (blinkStartedAt < 0 && elapsed >= nextBlinkAt) {
      blinkStartedAt = elapsed;
    }

    let value = 0;
    if (blinkStartedAt >= 0) {
      const progress = (elapsed - blinkStartedAt) / BLINK_DURATION;
      if (progress >= 1) {
        blinkStartedAt = -1;
        const doubleBlink = Math.random() < 0.2;
        nextBlinkAt = elapsed + (doubleBlink ? 0.12 : 2 + Math.random() * 3);
      } else {
        value = Math.sin(progress * Math.PI);
      }
    }
    expressions.setValue('blink', value);
  };
}
