import type { Camera, Object3D, Quaternion, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * 揺れもの（髪・服・しっぽ）を揺らしてあそぶ。
 *
 * - つまむ: マウスでモデルを押さえて引っぱると、つまんだところが引っぱったほうへ寄る。
 *   足は動かさず、つまんだところから背骨までの骨（腕なら手・ひじ・肩・胸・背骨、頭なら頭・首・胸・背骨）を
 *   少しずつ曲げて届かせる（IK。それぞれの骨に曲げられる角度の上限がある）。
 *   はなすと、ばねのようにぷるんと揺れてもどる（そのあいだ、髪や服が揺れる）。
 *   腰や足・しっぽをつまんだときは、上半身が揺れる。
 *   モデルのないところをドラッグしたときは、いつもどおりカメラがまわる。
 *   指の画面では、なぞるとページをスクロールしたいことが多いので、つままない（「ゆらす」のボタンで揺らす）
 * - shake(): 頭を横へぽんと押したように、上半身を揺らす（「ゆらす」のボタン）
 * - setWind(): 風を吹かせる。見ている人の左うしろから、強くなったり弱くなったりしながら吹く。
 *   揺れものの「重力」の向きと強さを、風の向きへ足して表す（止めると元の値へもどす）
 *
 * 骨は、モーション（と視線）で毎フレーム決め直されるので、その上から毎フレーム曲げ直す。
 * 毎フレーム、モーションと視線の更新のあと・vrm.update() の前に update() を呼ぶ
 */
export type Sway = {
  update: (delta: number) => void;
  shake: () => void;
  setWind: (on: boolean) => void;
  /** 「見ている人」のカメラを替える（AR のあいだは、スマホのカメラ） */
  setCamera: (camera: Camera) => void;
  dispose: () => void;
};

/** 引っぱりのばね（大きいほど速くもどる）と、揺れの止まりやすさ */
const SPRING = 70;
const DAMPING = 6;
/** 引っぱれる距離の上限（m） */
const MAX_PULL = 0.35;
/** 「ゆらす」で頭を押す速さ（m/秒） */
const SHAKE_SPEED = 1.4;
/** IK をくり返す回数（多いほど、つまんだところがマウスにぴったり寄る） */
const IK_ROUNDS = 3;
/**
 * 骨ごとの、曲げられる角度の上限（ラジアン）。背骨や首は少しずつ、腕は大きく。
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
/**
 * 風の強さ。揺れものの「元にもどろうとする強さ（stiffness）」に対する割合で、重力に足す。
 * 揺れものの硬さはモデルによって 10 倍近く違うので、同じ量を足すと、やわらかい子だけ真横になびいてしまう
 */
const WIND_RATIO = 0.25;
/** 風が強くなったり弱くなったりする幅 */
const WIND_GUST = 0.5;
/** 風を吹かせたり止めたりするとき、強さが変わりきるまでの速さ */
const WIND_EASE = 1.5;
/** マウスを止めてから、つまめる場所かを調べるまでの時間（ms）。調べるのは少し重いので、動いているあいだはしない */
const HOVER_DELAY = 90;

type Joint = {
  settings: { gravityDir: Vector3; gravityPower: number; stiffness: number };
};

/** 引っぱっているところ。effector（骨と、その骨から見た位置）を、chain の骨を曲げて動かす */
type Pull = {
  effector: Object3D;
  local: Vector3;
  /** 曲げる骨（effector の側から背骨へ）と、それぞれの上限 */
  chain: { bone: Object3D; limit: number }[];
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
    return {
      vrm,
      rawNames,
      normalizedNames,
      pull: null as Pull | null,
      grabbing: false,
      offset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      goal: new THREE.Vector3(),
    };
  });
  type Model = (typeof models)[number];

  /**
   * name の骨を effector にして引っぱるときの、曲げる骨の並び（その骨から、腰の手前まで）。
   * 腰・足（しっぽやスカートも、つながっているのは腰か足）をつまんだときは、胸を引っぱる
   */
  const makePull = (model: Model, name: VRMHumanBoneName, point: Vector3): Pull | null => {
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
    return { effector, local, chain };
  };

  // ---- 風。揺れものの元の重力を覚えておき、風の分を足す ----
  const joints = vrms.flatMap((vrm) =>
    [...(vrm.springBoneManager?.joints ?? [])].map((joint) => {
      const { settings } = joint as unknown as Joint;
      return {
        settings,
        dir: settings.gravityDir.clone(),
        power: settings.gravityPower,
        wind: WIND_RATIO * settings.stiffness,
      };
    }),
  );
  let windOn = false;
  let wind = 0;
  let elapsed = 0;

  // ---- つまむ ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
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

  /** マウスの下にあるモデルと、当たったところ・そこを動かしている骨の名前。なければ null */
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
    return { model, point: hit.point, name: boneAt(model, hit) };
  };

  /** 当たった三角形の頂点を、いちばん強く動かしている骨の、人の骨の名前（髪なら頭、しっぽなら腰） */
  const boneAt = (
    model: Model,
    hit: { object: Object3D; face?: { a: number } | null },
  ): VRMHumanBoneName => {
    const mesh = hit.object as Object3D & {
      isSkinnedMesh?: boolean;
      skeleton?: { bones: Object3D[] };
      geometry?: {
        getAttribute: (
          name: string,
        ) => { getComponent: (index: number, component: number) => number } | undefined;
      };
    };
    let node: Object3D | null = mesh;
    if (mesh.isSkinnedMesh && mesh.skeleton && hit.face) {
      const indices = mesh.geometry?.getAttribute('skinIndex');
      const weights = mesh.geometry?.getAttribute('skinWeight');
      if (indices && weights) {
        let best = 0;
        for (let k = 0; k < 4; k++) {
          if (weights.getComponent(hit.face.a, k) > weights.getComponent(hit.face.a, best)) best = k;
        }
        node = mesh.skeleton.bones[indices.getComponent(hit.face.a, best)] ?? mesh;
      }
    }
    while (node) {
      const name = model.rawNames.get(node);
      if (name) return name;
      node = node.parent;
    }
    return 'chest';
  };

  const canGrab = (event: PointerEvent) =>
    event.pointerType !== 'touch' && event.button === 0 && !event.ctrlKey;

  const onPointerDown = (event: PointerEvent) => {
    if (!canGrab(event)) return;
    const hit = pick(event);
    if (!hit) return;
    const pull = makePull(hit.model, hit.name, hit.point);
    if (!pull) return;
    // カメラをまわす操作（OrbitControls）には渡さない
    event.stopImmediatePropagation();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    // 揺れている途中につまみ直したときは、いまのずれを引きつぐ
    const { model } = hit;
    if (model.pull && model.pull.effector !== pull.effector) {
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
      grab.model.goal.copy(point).sub(grab.start).clampLength(0, MAX_PULL);
      return;
    }
    scheduleHover(event);
  };

  const release = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    grab.model.goal.set(0, 0, 0);
    grab.model.grabbing = false;
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
  const bend = (pull: Pull, offset: Vector3) => {
    pull.chain[pull.chain.length - 1].bone.parent?.updateWorldMatrix(true, false);
    pull.chain[pull.chain.length - 1].bone.updateMatrixWorld(true);
    target.copy(pull.local);
    pull.effector.localToWorld(target).add(offset);
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
        bone.updateMatrixWorld(true);
      });
    }
  };

  const windDir = new THREE.Vector3();
  const gravity = new THREE.Vector3();

  return {
    update: (delta) => {
      elapsed += delta;
      // ---- 引っぱりのばね と IK ----
      for (const model of models) {
        if (!model.pull) continue;
        const { offset, velocity, goal } = model;
        velocity.addScaledVector(
          gravity.subVectors(offset, goal).multiplyScalar(-SPRING).addScaledVector(velocity, -DAMPING),
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

      // ---- 風 ----
      const windTarget = windOn ? 1 : 0;
      wind += (windTarget - wind) * (1 - Math.exp(-delta * WIND_EASE));
      if (wind < 0.01 && !windOn) {
        if (wind !== 0) {
          wind = 0;
          for (const joint of joints) {
            joint.settings.gravityDir.copy(joint.dir);
            joint.settings.gravityPower = joint.power;
          }
        }
        return;
      }
      // 見ている人から見て、左うしろから右奥へ吹く（カメラをまわしても、いつも同じように見える）
      camera.getWorldDirection(windDir);
      windDir.y = 0;
      windDir.normalize().applyAxisAngle(up, -0.6);
      const gust =
        1 +
        WIND_GUST *
          (Math.sin(elapsed * 1.3) * 0.7 + Math.sin(elapsed * 3.1 + 1.7) * 0.3);
      for (const joint of joints) {
        gravity
          .copy(joint.dir)
          .multiplyScalar(joint.power)
          .addScaledVector(windDir, joint.wind * gust * wind);
        const power = gravity.length();
        joint.settings.gravityPower = power;
        if (power > 1e-5) joint.settings.gravityDir.copy(gravity).divideScalar(power);
      }
    },
    shake: () => {
      // 見ている人から見て横へ、頭をぽんと押す（並んでいるときは、となりと逆向きに、少しずつ違う強さで）
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      right.y = 0;
      right.normalize();
      models.forEach((model, i) => {
        if (model.grabbing) return;
        const head = model.vrm.humanoid.getNormalizedBoneNode('head');
        if (!head) return;
        const pull = makePull(model, 'head', head.getWorldPosition(new THREE.Vector3()));
        if (!pull) return;
        if (model.pull?.effector !== pull.effector) {
          model.offset.set(0, 0, 0);
          model.velocity.set(0, 0, 0);
        }
        model.pull = pull;
        model.goal.set(0, 0, 0);
        const sign = i % 2 === 0 ? 1 : -1;
        model.velocity.addScaledVector(right, SHAKE_SPEED * (1 - (i % 3) * 0.12) * sign);
      });
    },
    setWind: (on) => {
      windOn = on;
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
      for (const joint of joints) {
        joint.settings.gravityDir.copy(joint.dir);
        joint.settings.gravityPower = joint.power;
      }
    },
  };
}
