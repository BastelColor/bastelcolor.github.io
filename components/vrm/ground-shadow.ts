import type { Box3, Mesh, Object3D, WebGLRenderer } from 'three';

/**
 * AR で、床の上に落ちるモデルの影（components/vrm/ar.ts）。
 * カメラの映像の床にはモデルの影が落ちないので、そのままだと浮いて見える。
 *
 *   影   ほぼ真上（少し前）から照らす光で、モデルの形どおりの影を床に落とす。ふちはぼかす。
 *        光の明るさは 0 にして、モデルの見た目は変えない（影だけを使う）
 *   接地 足元の、まん中が濃い小さな丸。床とくっついている感じを出す（腰の真下について行く）
 *
 * parent（置く場所の入れ物）の中に入れるので、置いた場所・向きについて行く。
 * 入れ物を小さくしたときは setScale で、影を写す範囲も合わせる
 */
export type GroundShadow = {
  /** 毎フレーム、描く前に呼ぶ（足元の丸を腰の真下へ） */
  update: () => void;
  /** 置く場所の入れ物の大きさ（1 が本当の大きさ）に合わせる */
  setScale: (scale: number) => void;
  /**
   * 写真を描くあいだだけ、影を濃くする。AR の画面では、影はカメラの映像に sRGB のまま重なるが、
   * 写真は光の強さのまま（linear）で重ねるので、同じ濃さでも薄く見えるため
   */
  setPhoto: (photo: boolean) => void;
  dispose: () => void;
};

/** sRGB で重ねたときと同じ暗さになる、linear で重ねるときの濃さ */
const photoOpacity = (opacity: number) => 1 - (1 - opacity) ** 2.2;

/** 床の影の濃さ */
const SHADOW_OPACITY = 0.32;
/** 影のふちのぼかし（影の地図のピクセル。VSM のとき） */
const SHADOW_BLUR = 10;
/** PCF のときのぼかし（VSM より強く効くので、小さめ） */
const SHADOW_BLUR_PCF = 6;
/** 足元の丸の濃さ（まん中） */
const CONTACT_OPACITY = 0.32;
/** 足元の丸の半径（腰の高さに対する割合） */
const CONTACT_RADIUS = 0.3;
/** 光の来る向き（置く場所の入れ物の中で。+Y が上、+Z が見ている人のほう） */
const LIGHT_DIRECTION = [0.15, 1, 0.3] as const;

// 足元の丸。まん中が濃く、まわりへ向かってふんわり消える
const CONTACT_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const CONTACT_FRAGMENT = `
uniform float opacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float fade = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(0.0, 0.0, 0.0, opacity * fade * fade);
}
`;

export function createGroundShadow({
  THREE,
  renderer,
  parent,
  model,
  hips,
}: {
  THREE: typeof import('three');
  renderer: WebGLRenderer;
  parent: Object3D;
  model: Object3D;
  /** 腰の骨（足元の丸を、腰の真下について行かせる） */
  hips: Object3D | null;
}): GroundShadow {
  // 足元の丸の大きさの目安は、腰の高さ（モデルの足元からの高さ）
  const hipsPosition = new THREE.Vector3();
  const hipsHeight = hips
    ? Math.max(
        0.2,
        model.worldToLocal(hips.getWorldPosition(hipsPosition)).y * model.scale.y,
      )
    : 0.7;
  // 影を写す範囲は、しっぽまで含めたモデル全体の大きさで決める
  // （腰の高さから決めると、Quiple の頭より高いしっぽが範囲からはみ出し、影が落ちなかった）
  const bounds = measureModel(THREE, model);
  // 踊ってはみ出すぶんの余裕もとる
  const top = Math.max(bounds.max.y, hipsHeight * 2) * 1.15;
  const reach =
    Math.max(
      -bounds.min.x,
      bounds.max.x,
      -bounds.min.z,
      bounds.max.z,
      hipsHeight,
    ) * 1.25;
  // 光が少し斜めなので、高いところの影は、そのぶん横へずれる
  const half = reach + top * 0.4;
  const lightDistance = top * 2 + half;

  // 影を落とす光。明るさは 0 で、影だけを使う。
  // lilToon は、場面で最初に見つかった光をおもな光にするので、舞台の光（lighting.ts）より後に置く
  // （置く場所の入れ物は、AR を始めたときに場面の最後に足される）
  const shadowWasEnabled = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = true;
  // ふちをなめらかにぼかせる VSM は、小数の入れ物に描ける端末だけ（ほかは、少しざらっとする PCF）
  const soft = renderer.extensions.has('EXT_color_buffer_float');
  renderer.shadowMap.type = soft ? THREE.VSMShadowMap : THREE.PCFShadowMap;
  const light = new THREE.DirectionalLight(0xffffff, 0);
  light.position
    .set(...LIGHT_DIRECTION)
    .normalize()
    .multiplyScalar(lightDistance);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.radius = soft ? SHADOW_BLUR : SHADOW_BLUR_PCF;
  light.shadow.bias = -0.002;
  light.shadow.blurSamples = 16;
  parent.add(light, light.target);

  // 影を受ける、見えない床
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY, depthWrite: false }),
  );
  floor.receiveShadow = true;
  floor.position.y = 0.001;
  parent.add(floor);

  // 足元の丸
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { opacity: { value: CONTACT_OPACITY } },
      vertexShader: CONTACT_VERTEX,
      fragmentShader: CONTACT_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  const contactSize = hipsHeight * CONTACT_RADIUS * 2;
  contact.scale.set(contactSize * 1.2, 1, contactSize);
  contact.position.y = 0.002;
  contact.renderOrder = -1;
  parent.add(contact);

  // モデルに影を落とさせる（自分の体には落とさない）。終わったら元にもどす
  const casters = new Map<Mesh, boolean>();
  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    casters.set(mesh, mesh.castShadow);
    mesh.castShadow = true;
  });

  const setScale = (scale: number) => {
    // 光は入れ物の中にあるので、位置は入れ物といっしょに縮む。影を写す範囲は、自分で合わせる
    const camera = light.shadow.camera;
    camera.left = -half * scale;
    camera.right = half * scale;
    camera.top = half * scale;
    camera.bottom = -half * scale;
    camera.near = 0.01 * scale;
    camera.far = (lightDistance + half * 2) * scale;
    camera.updateProjectionMatrix();
  };
  setScale(1);

  return {
    update: () => {
      if (!hips) return;
      parent.worldToLocal(hips.getWorldPosition(hipsPosition));
      contact.position.x = hipsPosition.x;
      contact.position.z = hipsPosition.z;
    },
    setScale,
    setPhoto: (photo) => {
      floor.material.opacity = photo ? photoOpacity(SHADOW_OPACITY) : SHADOW_OPACITY;
      contact.material.uniforms.opacity.value = photo
        ? photoOpacity(CONTACT_OPACITY)
        : CONTACT_OPACITY;
    },
    dispose: () => {
      parent.remove(light, light.target, floor, contact);
      light.shadow.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      for (const [mesh, cast] of casters) mesh.castShadow = cast;
      renderer.shadowMap.enabled = shadowWasEnabled;
    },
  };
}

/**
 * モデルの、いまの形での範囲（model の中の座標に、model 自身の大きさをかけたもの。足元が y = 0）。
 * 骨で動かしている形は three.js の範囲（boundingBox）に入っていないので、頂点を骨で動かしてから測る。
 * three.js が覚えている範囲は変えない（ほかで使っているため）。時間がかからないよう、頂点は間引く
 */
function measureModel(THREE: typeof import('three'), model: Object3D): Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const toModel = new THREE.Matrix4();
  model.updateWorldMatrix(true, true);
  const modelInverse = model.matrixWorld.clone().invert();
  const modelScale = new THREE.Matrix4().makeScale(
    model.scale.x,
    model.scale.y,
    model.scale.z,
  );
  model.traverse((object) => {
    const mesh = object as Mesh;
    const position = mesh.isMesh ? mesh.geometry.getAttribute('position') : undefined;
    if (!position) return;
    toModel.multiplyMatrices(modelInverse, mesh.matrixWorld).premultiply(modelScale);
    const step = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += step) {
      mesh.getVertexPosition(i, point);
      box.expandByPoint(point.applyMatrix4(toModel));
    }
  });
  return box;
}
