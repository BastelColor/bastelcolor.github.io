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
 * 毎フレーム、モーションの更新のあと・vrm.update() の前に update() を呼ぶ
 */
export type PointerLook = {
  update: (delta: number) => void;
  /** 「見ている人」のカメラを替える（AR のあいだは、スマホのカメラ） */
  setCamera: (camera: Camera) => void;
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
  // 頭の向きをずらす量
  const turns = vrms.map(() => new THREE.Quaternion());

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
        if (pointer) {
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

        // 頭の向き: 親（首）から見た、いまの顔の正面と、見る方向。そのうち HEAD_WEIGHT だけ向ける
        const parent = headBone.parent as Object3D | null;
        if (!parent) return;
        parent.getWorldQuaternion(parentQuaternion).invert();
        toward.copy(look).applyQuaternion(parentQuaternion).normalize();
        forward
          .set(0, 0, 1)
          .applyQuaternion(headBone.quaternion as Quaternion)
          .normalize();
        // うしろのほうを向いているとき（踊ってくるっと回っているときなど）は、無理にふり向かない
        const weight = forward.angleTo(toward) > 1.4 ? 0 : HEAD_WEIGHT;
        full.setFromUnitVectors(forward, toward);
        // （slerpQuaternions の書き込み先に、読み込む側と同じものを渡すと回らなくなるので、別に分ける）
        goal.slerpQuaternions(identity, full, weight);
        turns[i].slerp(goal, k);
        headBone.quaternion.premultiply(turns[i]);
      });
    },
    setCamera: (next) => {
      camera = next;
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
