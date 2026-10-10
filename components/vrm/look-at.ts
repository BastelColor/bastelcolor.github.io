import type { Camera, Object3D, Quaternion, Scene, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * モデルの視線と顔の向きを、マウスのほうへ向ける（マウスのある画面だけ）。
 *
 * - 目は VRM の視線（lookAt）で、マウスのある点を見る
 * - 頭も少しだけ（最大 MAX_TURN）マウスのほうへ向ける。モーションや待機の動きのあとに足すので、
 *   踊っている最中でも、顔だけちらっとこちらを向く
 * - マウスが画面から出たり、しばらく動かなかったりしたら、カメラ（見ている人）を見る
 *
 * 毎フレーム、モーションの更新のあと・vrm.update() の前に update() を呼ぶ
 */
export type PointerLook = {
  update: (delta: number) => void;
  dispose: () => void;
};

/** 頭がマウスのほうへ向く最大の角度（ラジアン、約 35°） */
const MAX_TURN = 0.6;
/** 頭がマウスのほうへ向く割合（目だけでなく、顔も少しついていく） */
const HEAD_WEIGHT = 0.45;
/** 向きを合わせる速さ（大きいほど速い） */
const EASE = 6;
/** マウスがこの時間（秒）動かなかったら、カメラのほうを見る */
const IDLE_SECONDS = 4;

export function createPointerLook(
  THREE: typeof import('three'),
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
  vrms: VRM[],
): PointerLook {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // マウスの位置（画面全体に対する -1〜1）。null ならカメラを見る
  let pointer: { x: number; y: number } | null = null;
  let idle = 0;
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
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

  // それぞれの子が見る点（目の高さの、マウスの方向）。位置は世界の座標で置くので、scene の直下に置く
  const targets = vrms.map((vrm) => {
    const target = new THREE.Object3D();
    target.name = 'PointerLookTarget';
    scene.add(target);
    if (vrm.lookAt) {
      vrm.lookAt.target = target;
      vrm.lookAt.autoUpdate = true;
    }
    return target;
  });
  // 頭の向きをずらす量（なめらかに近づける）
  const turns = vrms.map(() => new THREE.Quaternion());

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const head = new THREE.Vector3();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const parentQuaternion = new THREE.Quaternion();
  const goal = new THREE.Quaternion();
  const identity = new THREE.Quaternion();

  /** 頭の位置を通り、カメラに向いた面の上で、マウスが指している点 */
  const pointerPoint = (headPosition: Vector3, out: Vector3) => {
    if (!pointer) return camera.getWorldPosition(out);
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);
    camera.getWorldDirection(forward);
    plane.setFromNormalAndCoplanarPoint(forward, headPosition);
    // 頭より少し手前（カメラ側）を見るようにすると、目がこちらを向いて見えやすい
    if (!ray.ray.intersectPlane(plane, out)) return camera.getWorldPosition(out);
    return out.addScaledVector(forward, -0.6);
  };

  return {
    update: (delta) => {
      if (pointer) {
        idle += delta;
        if (idle > IDLE_SECONDS) pointer = null;
      }
      const k = 1 - Math.exp(-delta * EASE);
      vrms.forEach((vrm, i) => {
        const headBone = vrm.humanoid.getNormalizedBoneNode('head');
        if (!headBone) return;
        headBone.getWorldPosition(head);
        pointerPoint(head, point);
        targets[i].position.copy(point);

        // 頭の向き: 親（首）から見た、いまの顔の正面と、マウスの方向
        const parent = headBone.parent as Object3D | null;
        if (!parent) return;
        parent.getWorldQuaternion(parentQuaternion).invert();
        toward.copy(point).sub(head).applyQuaternion(parentQuaternion).normalize();
        forward
          .set(0, 0, 1)
          .applyQuaternion(headBone.quaternion as Quaternion)
          .normalize();
        const angle = forward.angleTo(toward);
        // うしろのほうを指していたら、無理にふり向かない
        const weight = angle > 1.8 ? 0 : HEAD_WEIGHT;
        goal.setFromUnitVectors(forward, toward);
        // 向く角度に上限をつける
        if (angle * weight > MAX_TURN) {
          goal.slerpQuaternions(identity, goal, MAX_TURN / angle);
        } else {
          goal.slerpQuaternions(identity, goal, weight);
        }
        turns[i].slerp(goal, k);
        headBone.quaternion.premultiply(turns[i]);
      });
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
