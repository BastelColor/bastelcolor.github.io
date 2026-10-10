import type { Camera, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * モデルをマウスでつまんで、引っぱってあそぶ。
 *
 * - 体（頭・腕・胸など）をつまむ: つまんだところが、引っぱったほうへ寄る。足は動かさず、
 *   つまんだところから背骨までの骨（腕なら手・ひじ・肩・胸・背骨、頭なら頭・首・胸・背骨）を
 *   少しずつ曲げて届かせる（IK。それぞれの骨に曲げられる角度の上限がある）。
 *   はなすと、ばねのようにぷるんと揺れてもどる（そのあいだ、髪や服が揺れる）。
 *   腰や足をつまんだときは、上半身が揺れる
 * - 揺れもの（しっぽ・髪・スカートなど）をつまむ: その揺れものだけを、つまんだところから付け根までの
 *   骨を曲げて引っぱる。はなすと、揺れもの（VRM のスプリングボーン）の動きに、その形と勢いのまま
 *   引きつぐので、ぷるんと揺れてもどる
 * - モデルのないところをドラッグしたときは、いつもどおりカメラがまわる。
 *   指の画面では、なぞるとページをスクロールしたいことが多いので、つままない
 *
 * 体の骨は、モーション（と視線）で毎フレーム決め直されるので、その上から毎フレーム曲げ直す（update）。
 * 揺れものの骨は、vrm.update() の中で揺れの計算に決め直されるので、そのあとに曲げ直す（afterUpdate）。
 * 毎フレーム、モーションと視線の更新のあと・vrm.update() の前に update()、vrm.update() のあとに afterUpdate() を呼ぶ
 */
export type Sway = {
  update: (delta: number) => void;
  afterUpdate: () => void;
  /** 「見ている人」のカメラを替える（AR のあいだは、スマホのカメラ） */
  setCamera: (camera: Camera) => void;
  dispose: () => void;
};

/** 引っぱりのばね（大きいほど速くもどる）と、揺れの止まりやすさ */
const SPRING = 70;
const DAMPING = 6;
/** 体を引っぱれる距離の上限（m） */
const MAX_PULL = 0.35;
/** 揺れものを引っぱれる距離の上限（m） */
const MAX_SPRING_PULL = 0.6;
/** IK をくり返す回数（多いほど、つまんだところがマウスにぴったり寄る） */
const IK_ROUNDS = 3;
/**
 * 体の骨ごとの、曲げられる角度の上限（ラジアン）。背骨や首は少しずつ、腕は大きく。
 * ここに無い骨（腰・足・指など）は曲げない
 */
const BEND_LIMITS: Partial<Record<VRMHumanBoneName, number>> = {
  spine: 0.3,
  chest: 0.3,
  upperChest: 0.25,
  neck: 0.3,
  head: 0.25,
  leftShoulder: 0.25,
  rightShoulder: 0.25,
  leftUpperArm: 1.1,
  rightUpperArm: 1.1,
  leftLowerArm: 1.2,
  rightLowerArm: 1.2,
  leftHand: 0.5,
  rightHand: 0.5,
};
/** 揺れものの骨1本あたりの、曲げられる角度の上限（ラジアン） */
const SPRING_BEND_LIMIT = 0.7;
/** マウスを止めてから、つまめる場所かを調べるまでの時間（ms）。調べるのは少し重いので、動いているあいだはしない */
const HOVER_DELAY = 90;

/** VRM の揺れものの骨（three-vrm の VRMSpringBoneJoint）のうち、ここで使うもの */
type SpringJoint = {
  bone: Object3D;
  child: Object3D | null;
  center: Object3D | null;
  initialLocalChildPosition: Vector3;
  _currentTail: Vector3;
  _prevTail: Vector3;
};

/** 引っぱっているところ。effector（骨と、その骨から見た位置）を、chain の骨を曲げて動かす */
type Pull = {
  effector: Object3D;
  local: Vector3;
  /** 曲げる骨（effector の側から付け根へ）と、それぞれの上限 */
  chain: { bone: Object3D; limit: number; joint?: SpringJoint }[];
  /** 揺れものを引っぱっているか（体を引っぱるのとは、曲げるときと、はなしたあとが違う） */
  spring: boolean;
  /**
   * 揺れものは、つまんだときの位置（世界の座標）から、引っぱった分だけずらしたところへ寄せる
   * （揺れものは揺れの計算で毎フレーム少しずつ元の形へもどろうとするので、いまの位置からではなく）
   */
  anchor?: Vector3;
};

export function createSway(
  THREE: typeof import('three'),
  initialCamera: Camera,
  canvas: HTMLCanvasElement,
  vrms: VRM[],
): Sway {
  let camera = initialCamera;

  // ---- モデルごとの、引っぱりのばね。offset は「つまんだところを、いまどれだけずらしているか」（m） ----
  const models = vrms.map((vrm) => {
    // モデルの骨（表示に使う骨・動かす骨）から、人の骨の名前を引く表
    const rawNames = new Map<Object3D, VRMHumanBoneName>();
    const normalizedNames = new Map<Object3D, VRMHumanBoneName>();
    for (const name of Object.keys(vrm.humanoid.humanBones) as VRMHumanBoneName[]) {
      const raw = vrm.humanoid.getRawBoneNode(name);
      const normalized = vrm.humanoid.getNormalizedBoneNode(name);
      if (raw) rawNames.set(raw, name);
      if (normalized) normalizedNames.set(normalized, name);
    }
    // 揺れものの骨から、その骨の揺れの計算を引く表
    const springJoints = new Map<Object3D, SpringJoint>();
    for (const joint of vrm.springBoneManager?.joints ?? []) {
      const springJoint = joint as unknown as SpringJoint;
      springJoints.set(springJoint.bone, springJoint);
    }
    return {
      vrm,
      rawNames,
      normalizedNames,
      springJoints,
      pull: null as Pull | null,
      grabbing: false,
      offset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      goal: new THREE.Vector3(),
    };
  });
  type Model = (typeof models)[number];

  /**
   * name の体の骨を effector にして引っぱるときの、曲げる骨の並び（その骨から、腰の手前まで）。
   * 腰・足をつまんだときは、胸を引っぱる
   */
  const makeBodyPull = (
    model: Model,
    name: VRMHumanBoneName,
    point: Vector3,
  ): Pull | null => {
    const { humanoid } = model.vrm;
    let effectorName = name;
    if (/Thumb|Index|Middle|Ring|Little/.test(name)) {
      effectorName = name.startsWith('left') ? 'leftHand' : 'rightHand';
    } else if (/Eye|jaw/.test(name)) {
      effectorName = 'head';
    } else if (!(name in BEND_LIMITS)) {
      effectorName = humanoid.getNormalizedBoneNode('upperChest')
        ? 'upperChest'
        : 'chest';
    }
    const effector = humanoid.getNormalizedBoneNode(effectorName);
    if (!effector) return null;
    const chain: Pull['chain'] = [];
    let bone: Object3D | null = effector;
    while (bone) {
      const boneName = model.normalizedNames.get(bone);
      if (!boneName || boneName === 'hips') break;
      const limit = BEND_LIMITS[boneName];
      if (limit) chain.push({ bone, limit });
      bone = bone.parent;
    }
    if (chain.length === 0) return null;
    effector.updateWorldMatrix(true, false);
    const local =
      effectorName === name
        ? effector.worldToLocal(point.clone())
        : new THREE.Vector3();
    return { effector, local, chain, spring: false };
  };

  /** 揺れものの骨 bone をつまんだときの、曲げる骨の並び（その骨から、揺れものの付け根まで） */
  const makeSpringPull = (
    model: Model,
    bone: Object3D,
    point: Vector3,
  ): Pull | null => {
    const chain: Pull['chain'] = [];
    let node: Object3D | null = bone;
    while (node) {
      const joint = model.springJoints.get(node);
      if (!joint) break;
      chain.push({ bone: node, limit: SPRING_BEND_LIMIT, joint });
      node = node.parent;
    }
    if (chain.length === 0) return null;
    bone.updateWorldMatrix(true, false);
    return {
      effector: bone,
      local: bone.worldToLocal(point.clone()),
      chain,
      spring: true,
      anchor: point.clone(),
    };
  };

  // ---- つまむ ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  const infinite = new THREE.Sphere(new THREE.Vector3(), Infinity);
  let grab: { model: Model; pointerId: number; start: Vector3 } | null = null;

  const setRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
  };

  /** マウスの下にあるモデルと、当たったところ・そこを動かしている骨。なければ null */
  const pick = (event: PointerEvent) => {
    setRay(event);
    const meshes: Object3D[] = [];
    const owners = new Map<Object3D, Model>();
    for (const model of models) {
      model.vrm.scene.traverseVisible((object) => {
        const mesh = object as Object3D & {
          isMesh?: boolean;
          isSkinnedMesh?: boolean;
          boundingSphere?: unknown;
          boundingBox?: unknown;
        };
        if (!mesh.isMesh) return;
        // 踊っているあいだに体の範囲は変わるが、three.js が覚えている範囲は最初のポーズのまま。
        // 範囲で先にふるい落とさず、三角形ごとに当たりを調べる
        if (mesh.isSkinnedMesh) {
          mesh.boundingSphere = infinite;
          mesh.boundingBox = null;
        }
        meshes.push(mesh);
        owners.set(mesh, model);
      });
    }
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const model = hit && owners.get(hit.object);
    if (!hit || !model) return null;
    return { model, point: hit.point, bone: boneAt(hit) };
  };

  /** 当たった三角形の頂点を、いちばん強く動かしている骨 */
  const boneAt = (hit: {
    object: Object3D;
    face?: { a: number } | null;
  }): Object3D => {
    const mesh = hit.object as Object3D & {
      isSkinnedMesh?: boolean;
      skeleton?: { bones: Object3D[] };
      geometry?: {
        getAttribute: (
          name: string,
        ) => { getComponent: (index: number, component: number) => number } | undefined;
      };
    };
    if (!mesh.isSkinnedMesh || !mesh.skeleton || !hit.face) return mesh;
    const indices = mesh.geometry?.getAttribute('skinIndex');
    const weights = mesh.geometry?.getAttribute('skinWeight');
    if (!indices || !weights) return mesh;
    let best = 0;
    for (let k = 0; k < 4; k++) {
      if (weights.getComponent(hit.face.a, k) > weights.getComponent(hit.face.a, best)) best = k;
    }
    return mesh.skeleton.bones[indices.getComponent(hit.face.a, best)] ?? mesh;
  };

  /** つまんだ骨から、引っぱり方を決める（揺れものならその揺れもの、そうでなければ体） */
  const makePull = (model: Model, bone: Object3D, at: Vector3) => {
    if (model.springJoints.has(bone)) return makeSpringPull(model, bone, at);
    let node: Object3D | null = bone;
    while (node) {
      const name = model.rawNames.get(node);
      if (name) return makeBodyPull(model, name, at);
      node = node.parent;
    }
    return makeBodyPull(model, 'chest', at);
  };

  const canGrab = (event: PointerEvent) =>
    event.pointerType !== 'touch' && event.button === 0 && !event.ctrlKey;

  const onPointerDown = (event: PointerEvent) => {
    if (!canGrab(event)) return;
    const hit = pick(event);
    if (!hit) return;
    const pull = makePull(hit.model, hit.bone, hit.point);
    if (!pull) return;
    // カメラをまわす操作（OrbitControls）には渡さない
    event.stopImmediatePropagation();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const { model } = hit;
    // 体が揺れている途中に、体のほかのところをつまみ直したときは、ずれをなくしてから
    if (pull.spring || model.pull?.effector !== pull.effector) {
      model.offset.set(0, 0, 0);
      model.velocity.set(0, 0, 0);
    }
    model.pull = pull;
    model.grabbing = true;
    model.goal.copy(model.offset);
    grab = {
      model,
      pointerId: event.pointerId,
      start: hit.point.clone().sub(model.offset),
    };
    // つまんだところを通り、カメラのほうを向いた面の上で、マウスを追う
    camera.getWorldDirection(point);
    plane.setFromNormalAndCoplanarPoint(point, hit.point);
    canvas.style.cursor = 'grabbing';
  };

  const onPointerMove = (event: PointerEvent) => {
    if (grab && event.pointerId === grab.pointerId) {
      setRay(event);
      if (!raycaster.ray.intersectPlane(plane, point)) return;
      grab.model.goal
        .copy(point)
        .sub(grab.start)
        .clampLength(0, grab.model.pull?.spring ? MAX_SPRING_PULL : MAX_PULL);
      return;
    }
    scheduleHover(event);
  };

  const release = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    const { model } = grab;
    model.goal.set(0, 0, 0);
    model.grabbing = false;
    // 揺れものは、ここからは揺れの計算にまかせる（曲げた形と勢いは、毎フレーム引きついである）
    if (model.pull?.spring) model.pull = null;
    grab = null;
    canvas.style.cursor = '';
  };

  // マウスを止めたところがモデルの上なら、つまめることを手の形で知らせる
  let hoverTimer = 0;
  let lastMove: PointerEvent | null = null;
  const scheduleHover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    lastMove = event;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      if (!lastMove || grab) return;
      canvas.style.cursor = pick(lastMove) ? 'grab' : '';
    }, HOVER_DELAY);
  };
  const onPointerLeave = () => {
    window.clearTimeout(hoverTimer);
    if (!grab) canvas.style.cursor = '';
  };

  // OrbitControls より先に受け取るため、capture で付ける
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', onPointerLeave);

  // ---- IK（つまんだところを target へ寄せるよう、chain の骨を順に少しずつ曲げる） ----
  const target = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const boneWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const toCenter = new THREE.Matrix4();
  const bend = (pull: Pull, offset: Vector3) => {
    const root = pull.chain[pull.chain.length - 1].bone;
    root.parent?.updateWorldMatrix(true, false);
    root.updateMatrixWorld(true);
    if (pull.anchor) target.copy(pull.anchor).add(offset);
    else pull.effector.localToWorld(target.copy(pull.local)).add(offset);
    // 骨ごとに、この回までに曲げた角度（上限を超えないように）
    const used = pull.chain.map(() => 0);
    for (let round = 0; round < IK_ROUNDS; round++) {
      pull.chain.forEach(({ bone, limit }, i) => {
        bone.getWorldPosition(pivot);
        tip.copy(pull.local);
        pull.effector.localToWorld(tip);
        from.subVectors(tip, pivot);
        to.subVectors(target, pivot);
        if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
        turn.setFromUnitVectors(from.normalize(), to.normalize());
        const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
        const allowed = limit - used[i];
        if (allowed <= 0) return;
        if (angle > allowed) turn.slerpQuaternions(identity, turn.clone(), allowed / angle);
        used[i] += Math.min(angle, allowed);
        // 世界の向きで回し、親から見た向きに直す
        bone.getWorldQuaternion(boneWorld).premultiply(turn);
        bone.parent?.getWorldQuaternion(parentWorld);
        (bone.quaternion as Quaternion).copy(parentWorld.invert().multiply(boneWorld));
        // 揺れものの骨は、位置と向きの行列を自動では作り直さない設定なので、ここで作る
        if (!bone.matrixAutoUpdate) bone.updateMatrix();
        bone.updateMatrixWorld(true);
      });
    }
    if (!pull.spring) return;
    // 揺れの計算に、曲げた形をわたす。前の先端の位置を「ひとつ前」に残しておくので、はなしたときに勢いがつく
    for (const { joint } of pull.chain) {
      if (!joint) continue;
      toCenter.copy(
        joint.center ? (joint.center.matrixWorld as Matrix4).clone().invert() : identity4,
      );
      joint._prevTail.copy(joint._currentTail);
      if (joint.child) joint.child.getWorldPosition(tip);
      else joint.bone.localToWorld(tip.copy(joint.initialLocalChildPosition));
      joint._currentTail.copy(tip).applyMatrix4(toCenter);
    }
  };
  const identity4 = new THREE.Matrix4();

  return {
    update: (delta) => {
      // ---- 体: 引っぱりのばね と IK ----
      for (const model of models) {
        if (!model.pull || model.pull.spring) continue;
        const { offset, velocity, goal } = model;
        velocity.addScaledVector(
          from
            .subVectors(offset, goal)
            .multiplyScalar(-SPRING)
            .addScaledVector(velocity, -DAMPING),
          delta,
        );
        offset.addScaledVector(velocity, delta);
        // 揺れがおさまったら、引っぱるのをやめる
        if (!model.grabbing && offset.lengthSq() < 1e-6 && velocity.lengthSq() < 1e-5) {
          model.pull = null;
          offset.set(0, 0, 0);
          velocity.set(0, 0, 0);
          continue;
        }
        bend(model.pull, offset);
      }
    },
    afterUpdate: () => {
      // ---- 揺れもの: 揺れの計算のあとに、つまんだところまで曲げる ----
      for (const model of models) {
        if (model.pull?.spring && model.grabbing) bend(model.pull, model.goal);
      }
    },
    setCamera: (next) => {
      camera = next;
    },
    dispose: () => {
      window.clearTimeout(hoverTimer);
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', release);
      canvas.removeEventListener('pointercancel', release);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.style.cursor = '';
    },
  };
}
