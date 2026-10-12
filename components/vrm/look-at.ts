import type { Camera, Object3D, Quaternion, Scene, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * モデルの視線と顔の向きを、マウスのほうへ向ける（マウスのある画面だけ）。
 *
 * - マウスがモデルの枠（area）の上にあるあいだだけ、そちらを見る。
 *   ボタンを押しに行ったときなど、枠の外にあるときは、カメラ（見ている人）を見る
 * - ふだんは、カメラ（見ている人）のほうを、目の高さのまま水平に見る。
 *   全身を写すときのカメラは腰の高さにあるので、カメラそのものを見ると、うつむいて見えてしまうため
 * - マウスがあるときは、そこから、マウスの方向へ角度を半分ほどに弱め、上限をつけてずらす
 *   （黒目が目のふちへ寄りすぎない。下は上より狭くして、うつむいて見えないようにする）
 * - 目は VRM の視線（lookAt）、頭はそのうち少しだけ（HEAD_WEIGHT）ついていく。
 *   モーションや待機の動きのあとに足すので、踊っている最中でも、顔だけちらっとこちらを向く
 * - マウスがしばらく動かなかったら、カメラを見る
 *
 * AR のあいだ（setCamera の ar）は、スマホ（見ている人）のほうへ、上下もふくめて顔を向ける。
 * 首と頭で分けて少しずつ向け（かんたんな IK）、向けられる角度には上限をつける。
 * 踊ってうしろを向いているときは、無理にふり向かない
 *
 * 毎フレーム、モーションの更新のあと・vrm.update() の前に update() を呼ぶ
 */
export type PointerLook = {
  update: (delta: number) => void;
  /** 「見ている人」のカメラを替える（AR のあいだは、スマホのカメラで、ar を true にする） */
  setCamera: (camera: Camera, ar?: boolean) => void;
  dispose: () => void;
};

/** マウスの方向へ向ける割合（1 でマウスをまっすぐ見る） */
const FOLLOW = 0.5;
/** ふだんの向き（カメラの方向・水平）からずらせる角度の上限（ラジアン）。左右 約 18°、上 約 10°、下 約 6° */
const MAX_YAW = 0.32;
const MAX_UP = 0.17;
const MAX_DOWN = 0.1;
/**
 * 頭がついていく割合（目の向きのうち、どれだけ顔も向けるか）。
 * ループのモーションは顔が少し下を向いているので、これで少しだけ起こして、こちらを見ているようにする
 */
const HEAD_WEIGHT = 0.5;
/** AR のとき、見ている人のほうへ見上げる・見下ろす角度の上限（ラジアン。上 約 34°、下 約 20°） */
const AR_MAX_UP = 0.6;
const AR_MAX_DOWN = 0.35;
/** AR のとき、首と頭がそれぞれ向ける割合（合わせて、見る方向の 9 割ほど） */
const AR_NECK_WEIGHT = 0.4;
const AR_HEAD_WEIGHT = 0.8;
/** AR のとき、首・頭それぞれが向けられる角度の上限（ラジアン。約 40°） */
const AR_MAX_TURN = 0.7;
/** 顔の正面と見る方向がこれより開いているとき（うしろのほうを向いているとき）は、ふり向かない（約 115°） */
const AR_BEHIND = 2;
/** 視線を合わせる速さ（大きいほど速い） */
const EASE = 5;
/** マウスがこの時間（秒）動かなかったら、カメラのほうを見る */
const IDLE_SECONDS = 4;
/** マウスを追う範囲を、枠の外へ少し広げる量（枠の大きさに対する割合） */
const AREA_MARGIN = 0.1;

/** 目の位置を直したモデル（同じモデルで2回直さないように覚えておく） */
const fixedEyes = new WeakSet<object>();

/**
 * 目の位置（頭の骨からのずれ）を、骨の大きさ（スケール）の分だけ小さくする。
 * 骨に大きさがついているモデル（骨が 100 倍で、親で 1/100 にしているものなど）では、
 * three-vrm が目の位置も 100 倍ずらして計算するので、目が頭の何メートルも上にあることになり、
 * そこから見る人を見下ろそうとして、黒目がずっと下を向いてしまう
 */
function fixEyePosition(
  THREE: typeof import('three'),
  vrm: VRM,
): void {
  const lookAt = vrm.lookAt;
  const rawHead = vrm.humanoid.getRawBoneNode('head');
  if (!lookAt || !rawHead || fixedEyes.has(lookAt)) return;
  fixedEyes.add(lookAt);
  rawHead.updateWorldMatrix(true, false);
  const headScale = rawHead.getWorldScale(new THREE.Vector3());
  const modelScale = vrm.scene.getWorldScale(new THREE.Vector3());
  lookAt.offsetFromHeadBone.multiply(modelScale).divide(headScale);
}

export function createPointerLook(
  THREE: typeof import('three'),
  scene: Scene,
  initialCamera: Camera,
  canvas: HTMLCanvasElement,
  vrms: VRM[],
  /** マウスを追う範囲（モデルの枠）。省略すると canvas 全体 */
  area: HTMLElement = canvas,
): PointerLook {
  let camera = initialCamera;
  // AR のあいだか（見ている人のほうへ、上下もふくめて首と頭を向ける）
  let ar = false;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // マウスの位置（canvas 全体に対する -1〜1）。null ならカメラを見る
  let pointer: { x: number; y: number } | null = null;
  let idle = 0;
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const box = area.getBoundingClientRect();
    const marginX = box.width * AREA_MARGIN;
    const marginY = box.height * AREA_MARGIN;
    const inside =
      event.clientX >= box.left - marginX &&
      event.clientX <= box.right + marginX &&
      event.clientY >= box.top - marginY &&
      event.clientY <= box.bottom + marginY;
    if (!inside) {
      pointer = null;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
    idle = 0;
  };
  const onLeave = () => {
    pointer = null;
  };
  if (fine) {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
  }

  // それぞれの子が見る点。位置は世界の座標で置くので、scene の直下に置く
  const targets = vrms.map((vrm) => {
    fixEyePosition(THREE, vrm);
    const target = new THREE.Object3D();
    target.name = 'PointerLookTarget';
    scene.add(target);
    if (vrm.lookAt) {
      vrm.lookAt.target = target;
      vrm.lookAt.autoUpdate = true;
    }
    return target;
  });
  // いま見ている向き（「カメラを見る向き」からのずれ。なめらかに近づける）
  const offsets = vrms.map(() => ({ yaw: 0, pitch: 0 }));
  // 頭の向きをずらす量（AR のときは、首も）
  const turns = vrms.map(() => new THREE.Quaternion());
  const neckTurns = vrms.map(() => new THREE.Quaternion());

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const head = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const toPointer = new THREE.Vector3();
  const look = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const parentQuaternion = new THREE.Quaternion();
  const full = new THREE.Quaternion();
  const goal = new THREE.Quaternion();
  const identity = new THREE.Quaternion();

  /**
   * bone を、見る方向（look）へ向ける。親から見た、いまの正面と見る方向の回転のうち、weight の割合
   * （ただし maxAngle まで）を、turn になめらかに近づけてから足す。正面と見る方向が behind より開いていたら向けない
   */
  const turnToward = (
    bone: Object3D,
    turn: Quaternion,
    weight: number,
    maxAngle: number,
    behind: number,
    k: number,
  ) => {
    const parent = bone.parent;
    if (!parent) return;
    parent.getWorldQuaternion(parentQuaternion).invert();
    toward.copy(look).applyQuaternion(parentQuaternion).normalize();
    forward.set(0, 0, 1).applyQuaternion(bone.quaternion).normalize();
    const angle = forward.angleTo(toward);
    const amount = angle > behind ? 0 : Math.min(weight, maxAngle / Math.max(angle, 1e-6));
    full.setFromUnitVectors(forward, toward);
    // （slerpQuaternions の書き込み先に、読み込む側と同じものを渡すと回らなくなるので、別に分ける）
    goal.slerpQuaternions(identity, full, amount);
    turn.slerp(goal, k);
    bone.quaternion.premultiply(turn);
  };

  const yawOf = (v: Vector3) => Math.atan2(v.x, v.z);
  const pitchOf = (v: Vector3) => Math.asin(Math.max(-1, Math.min(1, v.y)));
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

  return {
    update: (delta) => {
      if (pointer) {
        idle += delta;
        if (idle > IDLE_SECONDS) pointer = null;
      }
      const k = 1 - Math.exp(-delta * EASE);
      camera.getWorldPosition(cameraPosition);
      camera.getWorldDirection(cameraForward);
      vrms.forEach((vrm, i) => {
        const headBone = vrm.humanoid.getNormalizedBoneNode('head');
        if (!headBone) return;
        headBone.getWorldPosition(head);
        toCamera.copy(cameraPosition).sub(head);
        const distance = toCamera.length();
        toCamera.normalize();

        // マウスの方向（頭を通り、カメラに向いた面の上の点）を、「カメラを見る向き」からのずれにする
        let yaw = 0;
        let pitch = 0;
        if (ar) {
          // AR: 見ている人（スマホ）の高さへ、見上げる・見下ろす
          pitch = Math.max(-AR_MAX_DOWN, Math.min(AR_MAX_UP, pitchOf(toCamera)));
        } else if (pointer) {
          ndc.set(pointer.x, pointer.y);
          ray.setFromCamera(ndc, camera);
          plane.setFromNormalAndCoplanarPoint(cameraForward, head);
          if (ray.ray.intersectPlane(plane, point)) {
            // 頭より少し手前（カメラ側）を見るようにすると、目がこちらを向いて見えやすい
            point.addScaledVector(cameraForward, -0.6);
            toPointer.copy(point).sub(head).normalize();
            yaw = wrap(yawOf(toPointer) - yawOf(toCamera)) * FOLLOW;
            // 上下は、目の高さからの角度（顔のあたりを指したら、まっすぐ前を見る）
            pitch = pitchOf(toPointer) * FOLLOW;
            yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw));
            pitch = Math.max(-MAX_DOWN, Math.min(MAX_UP, pitch));
          }
        }
        const offset = offsets[i];
        offset.yaw += (yaw - offset.yaw) * k;
        offset.pitch += (pitch - offset.pitch) * k;

        // 見る点: カメラの方向を水平に見る向きから、ずれのぶんだけ回した方向の、カメラと同じ距離の点
        // （上下は、マウスでずらした分だけ。カメラの高さには合わせない）
        const lookYaw = yawOf(toCamera) + offset.yaw;
        const lookPitch = offset.pitch;
        look.set(
          Math.sin(lookYaw) * Math.cos(lookPitch),
          Math.sin(lookPitch),
          Math.cos(lookYaw) * Math.cos(lookPitch),
        );
        targets[i].position.copy(head).addScaledVector(look, distance);

        if (ar) {
          // AR: 首、頭の順に、見る方向へ少しずつ向ける（首を向けたぶん、頭は残りを向ける）
          const neck = vrm.humanoid.getNormalizedBoneNode('neck');
          if (neck) turnToward(neck, neckTurns[i], AR_NECK_WEIGHT, AR_MAX_TURN, AR_BEHIND, k);
          turnToward(headBone, turns[i], AR_HEAD_WEIGHT, AR_MAX_TURN, AR_BEHIND, k);
        } else {
          // 頭の向き: いまの顔の正面と、見る方向。そのうち HEAD_WEIGHT だけ向ける
          // （うしろのほうを向いているとき（踊ってくるっと回っているときなど）は、無理にふり向かない）
          turnToward(headBone, turns[i], HEAD_WEIGHT, Math.PI, 1.4, k);
        }
      });
    },
    setCamera: (next, nextAr = false) => {
      camera = next;
      ar = nextAr;
    },
    dispose: () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      for (const target of targets) target.parent?.remove(target);
      for (const vrm of vrms) {
        if (vrm.lookAt) vrm.lookAt.target = undefined;
      }
    },
  };
}
