import type {
  DataTexture,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
  Texture,
  Vector4,
  WebGLRenderer,
} from 'three';

/**
 * AR（WebXR）で、置いた子が、手前にある本物の物（机・ソファ・人など）のうしろに隠れるようにする。
 *
 * Android の Chrome などは、カメラから見た奥行きの地図（WebXR の depth-sensing。1 フレームごとの、
 * 小さな「何 m 先に物があるか」の画像）をくれる。描く前に、画面いっぱいの板で、その奥行きを
 * 描画の奥行き（depth buffer）に書きこんでおくと、本物の物より奥にある子の部分は描かれなくなる。
 * 色は描かない（カメラの映像はそのまま見える）。
 *
 * 奥行きの地図はとても粗い（画面の 1/10 ほどの細かさ）ので、そのままだと境目がマス目のようにギザギザになる。
 * なので、次の 3 つで境目をなめらかにする
 * - まわりのマス（3×3）の奥行きを、近いものほど重く混ぜる（マス目の階段を、なめらかな線にする）
 * - カメラの映像が読めるときは、いまの画素と色が近いマスほど重くする（奥行きの境目が、本物の物の
 *   輪郭（色の境目）に寄る。「joint bilateral upsampling」という方法）
 * - フレームごとのゆれを、少し前の奥行きとならす（境目のちらつきを抑える）
 *
 * 奥行きを測れない端末（depth-sensing を使えない）では、何もしない
 */
export type AROcclusion = {
  /** 奥行きの地図をもらえる AR か */
  available: boolean;
  setEnabled: (enabled: boolean) => void;
  /** 毎フレーム、描く前に呼ぶ */
  update: (frame: XRFrame, space: XRReferenceSpace) => void;
  dispose: () => void;
};

/**
 * 本物の物の奥行きを、少しだけ奥へずらす量（m。近さに比例して足す）。
 * 奥行きの地図は粗く、ゆれるので、床に立っている子の足元や、床の影がちらつかないように
 */
const DEPTH_BIAS = 0.04;
const DEPTH_BIAS_PER_METER = 0.03;
/**
 * 色の近さの効き方。小さいほど、色の境目で、奥行きの境目をくっきり分ける
 * （カメラの映像の RGB の差の 2 乗の合計に対する幅）
 */
const COLOR_SIGMA = 0.12;
/**
 * 前のフレームの奥行きを残す割合（0〜1。大きいほどちらつかないが、動くものにおくれてついてくる）。
 * 奥行きが大きく変わったところ（物が動いた・境目が動いた）は、すぐ新しい奥行きにする
 */
const TEMPORAL_KEEP = 0.6;
/** 「大きく変わった」とみなす差（奥行きに対する割合） */
const TEMPORAL_JUMP = 0.08;

const VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = `
uniform sampler2D depthMap;
uniform vec2 depthSize;
uniform mat4 uvTransform;
uniform mat4 viewFromDepth;
uniform sampler2D cameraMap;
uniform float hasCamera;
uniform float colorSigma2;
uniform vec4 viewportRect;
uniform vec2 projection;
uniform float bias;
uniform float biasPerMeter;

// 画面の上の位置（左上が 0,0）の、カメラの映像の色（映像は左下が 0,0）
vec3 cameraColor(vec2 view) {
  return texture2D(cameraMap, vec2(view.x, 1.0 - view.y)).rgb;
}

void main() {
  // 画面の上の位置（左上が 0,0。WebXR の「normalized view」の向き）から、奥行きの地図の上の位置へ
  vec2 view = vec2(
    (gl_FragCoord.x - viewportRect.x) / viewportRect.z,
    1.0 - (gl_FragCoord.y - viewportRect.y) / viewportRect.w
  );
  vec2 uv = (uvTransform * vec4(view, 0.0, 1.0)).xy;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragDepth = 1.0;
    return;
  }
  vec2 texel = uv * depthSize - 0.5;
  vec2 base = floor(texel + 0.5);
  vec3 here = hasCamera > 0.5 ? cameraColor(view) : vec3(0.0);
  float sum = 0.0;
  float weights = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      vec2 cellUv = (cell + 0.5) / depthSize;
      float meters = texture2D(depthMap, cellUv).r;
      // 測れなかったマスは使わない
      if (meters <= 0.0) continue;
      // 近いマスほど重く（なだらかな山の形）
      vec2 away = abs(texel - cell);
      float weight = max(0.0, 1.5 - away.x) * max(0.0, 1.5 - away.y);
      // 色が近いマスほど重く（マスのまんなかの画面の位置の、カメラの映像の色とくらべる）
      if (hasCamera > 0.5) {
        vec2 cellView = (viewFromDepth * vec4(cellUv, 0.0, 1.0)).xy;
        vec3 diff = cameraColor(cellView) - here;
        weight *= exp(-dot(diff, diff) / colorSigma2);
      }
      sum += meters * weight;
      weights += weight;
    }
  }
  if (weights <= 1e-6) {
    // 測れなかったところは、いちばん奥（隠さない）
    gl_FragDepth = 1.0;
    return;
  }
  float meters = sum / weights;
  meters += bias + meters * biasPerMeter;
  // カメラの前 meters m の点の、描画の奥行き（0〜1）
  float ndc = (projection.x * -meters + projection.y) / meters;
  gl_FragDepth = clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
}
`;

type DepthInformation = {
  width: number;
  height: number;
  data: ArrayBuffer;
  rawValueToMeters: number;
  normDepthBufferFromNormView: { matrix: Float32Array };
};

export function createAROcclusion({
  THREE,
  renderer,
  scene,
  session,
}: {
  THREE: typeof import('three');
  renderer: WebGLRenderer;
  scene: Scene;
  session: XRSession;
}): AROcclusion {
  const features =
    (session as XRSession & { enabledFeatures?: string[] }).enabledFeatures ?? [];
  const format = (session as XRSession & { depthDataFormat?: string }).depthDataFormat;
  const usage = (session as XRSession & { depthUsage?: string }).depthUsage;
  const available = features.includes('depth-sensing') && usage === 'cpu-optimized';
  if (!available) {
    return { available: false, setEnabled: () => {}, update: () => {}, dispose: () => {} };
  }
  const isFloat = format === 'float32';
  const canReadCamera = features.includes('camera-access');

  // 奥行き（m）を小数で入れる画像。届いた地図を JS で m に直し、前のフレームとならしてから入れる
  let texture: DataTexture | null = null;
  let meters: Float32Array<ArrayBuffer> = new Float32Array(0);
  const uvTransform: Matrix4 = new THREE.Matrix4();
  const viewFromDepth: Matrix4 = new THREE.Matrix4();
  const viewport: Vector4 = new THREE.Vector4();
  const material: ShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      depthMap: { value: null },
      depthSize: { value: new THREE.Vector2(1, 1) },
      uvTransform: { value: uvTransform },
      viewFromDepth: { value: viewFromDepth },
      cameraMap: { value: null },
      hasCamera: { value: 0 },
      colorSigma2: { value: COLOR_SIGMA * COLOR_SIGMA },
      viewportRect: { value: new THREE.Vector4() },
      projection: { value: new THREE.Vector2() },
      bias: { value: DEPTH_BIAS },
      biasPerMeter: { value: DEPTH_BIAS_PER_METER },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // 色は描かず、奥行きだけを、何があっても書きこむ
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
  });
  const mesh: Mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  // 子より先に描く
  mesh.renderOrder = -2000;
  mesh.visible = false;
  // 描くたびに、その画面（AR の画面・写真）の大きさと、カメラの写し方を渡す
  mesh.onBeforeRender = (target: WebGLRenderer, _scene, camera) => {
    target.getCurrentViewport(viewport);
    material.uniforms.viewportRect.value.copy(viewport);
    const e = camera.projectionMatrix.elements;
    material.uniforms.projection.value.set(e[10], e[14]);
  };
  scene.add(mesh);

  // はじめは隠れない（奥行きの地図が粗く、境目がギザギザになることがあるので、使う人が選ぶ）
  let enabled = false;
  let hasDepth = false;

  return {
    available: true,
    setEnabled: (next) => {
      enabled = next;
      mesh.visible = enabled && hasDepth;
      // 切ったあとにまた入れたときは、前の奥行きとならさない
      if (!next) meters.fill(0);
    },
    update: (frame, space) => {
      if (!enabled) {
        mesh.visible = false;
        return;
      }
      const view = frame.getViewerPose(space)?.views[0];
      const depth = view
        ? (
            frame as XRFrame & {
              getDepthInformation?: (view: XRView) => DepthInformation | null;
            }
          ).getDepthInformation?.(view)
        : null;
      hasDepth = !!depth;
      mesh.visible = hasDepth;
      if (!depth) return;
      const count = depth.width * depth.height;
      // 奥行きの画像を、大きさが変わったら作り直す
      if (!texture || texture.image.width !== depth.width || texture.image.height !== depth.height) {
        texture?.dispose();
        meters = new Float32Array(count);
        texture = new THREE.DataTexture(meters, depth.width, depth.height, THREE.RedFormat, THREE.FloatType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        material.uniforms.depthMap.value = texture;
        material.uniforms.depthSize.value.set(depth.width, depth.height);
      }
      // 届いた地図（2 バイトの整数か、小数）を m にして、前のフレームとならす
      const raw = isFloat ? new Float32Array(depth.data) : new Uint16Array(depth.data);
      const scale = depth.rawValueToMeters;
      for (let i = 0; i < count; i++) {
        const next = raw[i] * scale;
        const previous = meters[i];
        meters[i] =
          next > 0 && previous > 0 && Math.abs(next - previous) < previous * TEMPORAL_JUMP
            ? previous * TEMPORAL_KEEP + next * (1 - TEMPORAL_KEEP)
            : next;
      }
      texture.needsUpdate = true;
      uvTransform.fromArray(depth.normDepthBufferFromNormView.matrix);
      viewFromDepth.copy(uvTransform).invert();
      // カメラの映像（読めるときだけ。読めないときは、近さだけで混ぜる）
      const camera = canReadCamera ? (view as XRView & { camera?: unknown }).camera : undefined;
      const cameraTexture: Texture | undefined = camera
        ? renderer.xr.getCameraTexture(
            camera as Parameters<typeof renderer.xr.getCameraTexture>[0],
          )
        : undefined;
      material.uniforms.cameraMap.value = cameraTexture ?? null;
      material.uniforms.hasCamera.value = cameraTexture ? 1 : 0;
    },
    dispose: () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
