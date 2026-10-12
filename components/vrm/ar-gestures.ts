import type { Box3, Mesh, Object3D, Ray, Vector3 } from 'three';

/**
 * AR（WebXR）で、置いた子を指でつかんで動かす（components/vrm/ar.ts）。
 *
 *   1本指  子をつかんで、床の上を動かす（みんなで並ぶときは、つかんだ子だけ）
 *   2本指  広げる・すぼめると、みんなの大きさが変わる。ひねると、さわった子（いなければ、みんな）がまわる
 *
 * 1本指は、WebXR の「画面の指」（targetRayMode が screen の入力）から読む。毎フレーム、カメラから部屋の中へ
 * 伸びる光線（ray）がわかるので、さわった点の高さの水平な面と光線が交わる点を追う（さわった点が、指の下からずれない）。
 * 2本指は、AR の画面に重ねているボタンの層（overlay）で、ページの指のイベントから読む
 * （Android の Chrome は、AR の中では1本目の指しか WebXR に渡さないことがあり、2本目が届かなかったため）。
 * 画面の上での、指と指の距離と角度で測る
 * 子にさわらずにタップしたときは、これまでどおり、そこへみんなを置き直す（ar.ts の select）
 */
export type ARGrabbable = {
  /** さわったかを調べるもの（この中の、メッシュの範囲） */
  object: Object3D;
  /** object の足元（ワールドの x, z）を、そこへ動かす */
  moveTo: (x: number, z: number) => void;
  /** その場でまわす（ラジアン。上から見て左回りが正） */
  turn: (angle: number) => void;
};

export type ARGestures = {
  /** 指が画面にふれたとき（session の selectstart） */
  start: (source: XRInputSource) => void;
  /** 指を離したとき（session の selectend） */
  end: (source: XRInputSource) => void;
  /** その指で、子を動かした・さわったか（そのときは、タップで置き直さない） */
  used: (source: XRInputSource) => boolean;
  /** 毎フレーム呼ぶ */
  update: (frame: XRFrame, space: XRReferenceSpace) => void;
  dispose: () => void;
};

/** 2本指で変えられる大きさの範囲（本当の大きさに対する割合） */
const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
/** さわったかを調べる範囲を、まわりへ広げる量（子の大きさに対する割合）。指は太いので */
const TOUCH_MARGIN = 0.15;

type Touch = {
  ray: Ray;
  hasRay: boolean;
  /** さわった子を調べ終えたか */
  checked: boolean;
  target: ARGrabbable | null;
  /** つかんだ点の高さ（この高さの水平な面の上で、指を追う） */
  grabY: number;
  /** つかんだ子の足元と、指を追う面の上の点とのずれ */
  offsetX: number;
  offsetZ: number;
  used: boolean;
};

export function createARGestures({
  THREE,
  anchor,
  overlay,
  grabbables,
  getScale,
  setScale,
}: {
  THREE: typeof import('three');
  /** AR の画面に重ねている層（2本指は、ここで読む） */
  overlay: HTMLElement;
  /** 置く場所の入れ物（scene の直下） */
  anchor: Object3D;
  /** いまつかめる子（見えている子） */
  grabbables: () => ARGrabbable[];
  getScale: () => number;
  setScale: (scale: number) => void;
}): ARGestures {
  const touches = new Map<XRInputSource, Touch>();
  let pinch: {
    spread: number;
    angle: number;
    scale: number;
    target: ARGrabbable | null;
  } | null = null;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const position = new THREE.Vector3();
  const localRay = new THREE.Ray();
  const inverse = new THREE.Matrix4();
  const hit = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const boxes = new WeakMap<Object3D, Box3>();

  /** 光線と、高さ y の水平な面が交わる点。交わらなければ false */
  const onPlane = (ray: Ray, y: number, out: Vector3) => {
    plane.constant = -y;
    return ray.intersectPlane(plane, out) !== null;
  };

  /** 光線が最初にさわる子と、さわった点（ワールド） */
  const touched = (ray: Ray): { grabbable: ARGrabbable; point: Vector3 } | null => {
    let best: { grabbable: ARGrabbable; point: Vector3 } | null = null;
    let bestDistance = Infinity;
    for (const grabbable of grabbables()) {
      const object = grabbable.object;
      object.updateWorldMatrix(true, false);
      let box = boxes.get(object);
      if (!box) {
        box = measureLocal(THREE, object);
        const size = box.getSize(new THREE.Vector3());
        box.expandByVector(size.multiplyScalar(TOUCH_MARGIN));
        boxes.set(object, box);
      }
      localRay.copy(ray).applyMatrix4(inverse.copy(object.matrixWorld).invert());
      if (!localRay.intersectBox(box, hit)) continue;
      hit.applyMatrix4(object.matrixWorld);
      const distance = hit.distanceTo(ray.origin);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { grabbable, point: hit.clone() };
      }
    }
    return best;
  };

  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

  // --- 2本指（ページの指のイベント。画面の上の位置 px） ---
  // 指の数は、ブラウザが毎回教えてくれる「いま触れている指の一覧」（touches）から読む。
  // 自分で指を数えていたときは、AR の中で「指を離した」知らせが届かないことがあり、離したはずの指が残って、
  // 1本指で触っただけで2本指として大きさが変わってしまった（キャラがやたら大きくなった）
  const onTouches = (event: TouchEvent) => {
    const list = event.touches;
    if (list.length < 2 || !anchor.visible) {
      pinch = null;
      return;
    }
    const a = list[0];
    const b = list[1];
    // 画面の上での、2本の指のはなれ具合と向き（上へ y が増える向きにして、左回りを正にする）
    const spread = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const angle = Math.atan2(a.clientY - b.clientY, b.clientX - a.clientX);
    if (!pinch) {
      // 1本目の指でつかんでいた子をまわす（つかんでいなければ、みんな）
      const holding = [...touches.values()].find((touch) => touch.target)?.target ?? null;
      pinch = { spread: Math.max(spread, 1), angle, scale: getScale(), target: holding };
      // 2本指のあいだと、そのあと残った指では、つかんでいた子を動かさず、離しても置き直さない
      for (const touch of touches.values()) {
        touch.used = true;
        touch.target = null;
      }
      return;
    }
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, (pinch.scale * spread) / pinch.spread)));
    // 画面の上で左回りにひねると、上から見て左回りにまわる
    const turn = wrap(angle - pinch.angle);
    pinch.angle = angle;
    if (pinch.target) pinch.target.turn(turn);
    else anchor.rotation.y += turn;
  };
  const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
  for (const name of touchEvents) {
    overlay.addEventListener(name, onTouches, { passive: true });
  }

  return {
    start: (source) => {
      if (source.targetRayMode !== 'screen') return;
      touches.set(source, {
        ray: new THREE.Ray(),
        hasRay: false,
        checked: false,
        target: null,
        grabY: 0,
        offsetX: 0,
        offsetZ: 0,
        used: false,
      });
    },
    end: (source) => {
      touches.delete(source);
    },
    used: (source) => touches.get(source)?.used ?? false,
    dispose: () => {
      for (const name of touchEvents) overlay.removeEventListener(name, onTouches);
    },
    update: (frame, space) => {
      // それぞれの指の光線
      for (const [source, touch] of touches) {
        const pose = frame.getPose(source.targetRaySpace, space);
        touch.hasRay = !!pose;
        if (!pose) continue;
        const { position: p, orientation: o } = pose.transform;
        touch.ray.origin.set(p.x, p.y, p.z);
        touch.ray.direction
          .set(0, 0, -1)
          .applyQuaternion(quaternion.set(o.x, o.y, o.z, o.w))
          .normalize();
      }
      // まだ置いていないあいだは、タップで置くだけ
      if (!anchor.visible) return;
      const active = [...touches.values()].filter((touch) => touch.hasRay);

      // さわりはじめに、どの子にさわったかを調べる
      for (const touch of active) {
        if (touch.checked) continue;
        touch.checked = true;
        const found = touched(touch.ray);
        if (!found) continue;
        touch.target = found.grabbable;
        touch.used = true;
        touch.grabY = found.point.y;
        found.grabbable.object.getWorldPosition(position);
        touch.offsetX = position.x - found.point.x;
        touch.offsetZ = position.z - found.point.z;
      }

      // 2本以上の指（AR の中の指が2本届く端末）は、ページの指で読むので、ここでは何もしない
      if (active.length >= 2) {
        for (const touch of active) touch.used = true;
        return;
      }

      if (active.length === 1 && !pinch) {
        const touch = active[0];
        if (!touch.target || !onPlane(touch.ray, touch.grabY, point)) return;
        touch.target.moveTo(point.x + touch.offsetX, point.z + touch.offsetZ);
      }
    },
  };
}

/**
 * object の中のメッシュの、いまの形での範囲（object から見た座標）。
 * 骨で動かしている形は three.js の範囲（boundingBox）に入っていないので、頂点を骨で動かしてから測る。
 * 時間がかからないよう、頂点は間引く
 */
function measureLocal(THREE: typeof import('three'), object: Object3D): Box3 {
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  const toLocal = new THREE.Matrix4();
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert();
  object.traverse((child) => {
    const mesh = child as Mesh;
    const position = mesh.isMesh ? mesh.geometry.getAttribute('position') : undefined;
    if (!position) return;
    toLocal.multiplyMatrices(inverse, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(position.count / 2000));
    for (let i = 0; i < position.count; i += step) {
      mesh.getVertexPosition(i, vertex);
      box.expandByPoint(vertex.applyMatrix4(toLocal));
    }
  });
  return box;
}
