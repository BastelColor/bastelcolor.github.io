import type { Camera, Object3D, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * 揺れもの（髪・服・しっぽ）を揺らしてあそぶ。
 *
 * - つまむ: マウスでモデルを押さえて横に引くと、足元を軸に、起き上がりこぼしのように傾く。
 *   はなすと、ぷるんと揺れてもどる（そのあいだ、髪や服が揺れる）。
 *   モデルのないところをドラッグしたときは、いつもどおりカメラがまわる。
 *   指の画面では、なぞるとページをスクロールしたいことが多いので、つままない（「ゆらす」のボタンで揺らす）
 * - shake(): 横へぽんと押したように揺らす（「ゆらす」のボタン）
 * - setWind(): 風を吹かせる。見ている人の左うしろから、強くなったり弱くなったりしながら吹く。
 *   揺れものの「重力」の向きと強さを、風の向きへ足して表す（止めると元の値へもどす）
 *
 * 毎フレーム、vrm.update() の前に update() を呼ぶ
 */
export type Sway = {
  update: (delta: number) => void;
  shake: () => void;
  setWind: (on: boolean) => void;
  /** 「見ている人」のカメラを替える（AR のあいだは、スマホのカメラ） */
  setCamera: (camera: Camera) => void;
  dispose: () => void;
};

/** 傾きのばね（大きいほど速くもどる）と、揺れの止まりやすさ */
const SPRING = 60;
const DAMPING = 5.5;
/** つまんで傾けられる角度の上限（ラジアン、約 23°） */
const MAX_TILT = 0.4;
/** 「ゆらす」で与える、傾く速さ（ラジアン/秒） */
const SHAKE_SPEED = 2.6;
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

export function createSway(
  THREE: typeof import('three'),
  initialCamera: Camera,
  canvas: HTMLCanvasElement,
  vrms: VRM[],
): Sway {
  let camera = initialCamera;
  // ---- 傾き（モデルごと）。tilt は「どちらへ、どれだけ傾いているか」を水平の向き（x, z）で表す ----
  const models = vrms.map((vrm) => ({
    vrm,
    tilt: new THREE.Vector2(),
    velocity: new THREE.Vector2(),
    goal: new THREE.Vector2(),
    // いま足している傾き（次のフレームで外してから、新しい傾きを足す）
    applied: new THREE.Quaternion(),
  }));

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
  let grab: {
    index: number;
    pointerId: number;
    start: Vector3;
    /** つまんだところの、足元からの高さ */
    height: number;
  } | null = null;

  const setRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
  };

  /** マウスの下にあるモデル（と、当たったところ）。なければ null */
  const pick = (event: PointerEvent) => {
    setRay(event);
    const meshes: Object3D[] = [];
    const owners = new Map<Object3D, number>();
    models.forEach(({ vrm }, index) => {
      vrm.scene.traverseVisible((object) => {
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
        owners.set(mesh, index);
      });
    });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return { index: owners.get(hit.object) ?? 0, point: hit.point };
  };

  const canGrab = (event: PointerEvent) =>
    event.pointerType !== 'touch' && event.button === 0 && !event.ctrlKey;

  const onPointerDown = (event: PointerEvent) => {
    if (!canGrab(event)) return;
    const hit = pick(event);
    if (!hit) return;
    // カメラをまわす操作（OrbitControls）には渡さない
    event.stopImmediatePropagation();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const feet = models[hit.index].vrm.scene.getWorldPosition(point.clone());
    grab = {
      index: hit.index,
      pointerId: event.pointerId,
      start: hit.point.clone(),
      height: Math.max(0.2, hit.point.y - feet.y),
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
      // 引いた量のうち、画面の左右の分だけで傾ける（足元を軸に、引いたほうへ）
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      right.y = 0;
      right.normalize();
      const pulled = point.sub(grab.start).dot(right);
      const angle = THREE.MathUtils.clamp(
        Math.atan2(pulled, grab.height),
        -MAX_TILT,
        MAX_TILT,
      );
      models[grab.index].goal.set(right.x * angle, right.z * angle);
      return;
    }
    scheduleHover(event);
  };

  const release = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    models[grab.index].goal.set(0, 0);
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

  const tiltAxis = new THREE.Vector3();
  const tiltQuaternion = new THREE.Quaternion();
  const parentQuaternion = new THREE.Quaternion();
  const windDir = new THREE.Vector3();
  const gravity = new THREE.Vector3();

  return {
    update: (delta) => {
      elapsed += delta;
      // ---- 傾きのばね ----
      for (const model of models) {
        const { tilt, velocity, goal, vrm } = model;
        velocity.x += (-SPRING * (tilt.x - goal.x) - DAMPING * velocity.x) * delta;
        velocity.y += (-SPRING * (tilt.y - goal.y) - DAMPING * velocity.y) * delta;
        tilt.addScaledVector(velocity, delta);
        // 傾き（水平の向き）→ その向きへ倒す回転。軸は「上」と「倒す向き」に直交する向き
        const angle = tilt.length();
        tiltAxis.set(tilt.y, 0, -tilt.x);
        if (angle > 1e-5) {
          // 並んでいるときは、親（みんなをまわす入れ物）が回っているので、親から見た向きに直す
          if (vrm.scene.parent) {
            tiltAxis.applyQuaternion(
              vrm.scene.parent.getWorldQuaternion(parentQuaternion).invert(),
            );
          }
          tiltAxis.normalize();
          tiltQuaternion.setFromAxisAngle(tiltAxis, angle);
        } else {
          tiltQuaternion.identity();
        }
        // 前のフレームの傾きを外して、新しい傾きを足す（ほかで決めた向きはそのまま）
        vrm.scene.quaternion
          .premultiply(model.applied.invert())
          .premultiply(tiltQuaternion);
        model.applied.copy(tiltQuaternion);
      }

      // ---- 風 ----
      const target = windOn ? 1 : 0;
      wind += (target - wind) * (1 - Math.exp(-delta * WIND_EASE));
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
      // 見ている人から見て横へ、ぽんと押す（並んでいるときは、となりと逆向きに、少しずつ違う強さで）
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      right.y = 0;
      right.normalize();
      models.forEach((model, i) => {
        const sign = i % 2 === 0 ? 1 : -1;
        const speed = SHAKE_SPEED * (1 - (i % 3) * 0.12) * sign;
        model.velocity.x += right.x * speed;
        model.velocity.y += right.z * speed;
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
