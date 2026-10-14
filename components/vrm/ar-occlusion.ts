import type {
  Camera,
  DataTexture,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
  Texture,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/**
 * AR（WebXR）で、置いた子が、手前にある本物の物（机・ソファ・人など）のうしろに隠れるようにする。
 *
 * Android の Chrome などは、カメラから見た奥行きの地図（WebXR の depth-sensing。1 フレームごとの、
 * 小さな「何 m 先に物があるか」の画像）をくれる。奥行きの地図はとても粗い（画面の 1/10 ほどの細かさ）ので、
 * まず、まわりのマスの奥行きを混ぜて、カメラの映像の色の境目（本物の物の輪郭）に寄せ、前のフレームとならして、
 * なめらかな奥行きにする（「joint bilateral upsampling」という方法）。
 *
 * 隠し方は 2 つ。
 *
 *   soft  カメラの映像を読めて、小数の画像に描ける端末。なめらかにした奥行きを、画面の 1/3 ほどの小さな画像に
 *         一度だけ描いておく。子を描いたあとに、本物の物が手前にあるところへ、カメラの映像を重ねて塗る。
 *         奥行きを少しずつずらした 3 枚で、1/3 ずつ重ねるので、境目が数ピクセルかけてなじむ（パキッと切れない）
 *   hard  それ以外。子を描く前に、本物の物の奥行きを描画の奥行き（depth buffer）に書いておき、
 *         それより奥の子の部分を描かない（境目は、なめらかにした奥行きの線で、パキッと切れる）
 *
 * 奥行きを測れない端末（depth-sensing を使えない）では、何もしない
 */
export type AROcclusion = {
  /** 奥行きの地図をもらえる AR か */
  available: boolean;
  setEnabled: (enabled: boolean) => void;
  /** 毎フレーム、描く前に呼ぶ */
  update: (frame: XRFrame, space: XRReferenceSpace) => void;
  /** 写真を描くあいだは true（写真は光の強さのままの入れ物に描くので、重ねるカメラの映像も合わせる） */
  setPhoto: (photo: boolean) => void;
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
/**
 * 測れなかったマス（穴）に、前のフレームの奥行きを使い続けるフレーム数。
 * 穴はフレームごとにあちこちに開くので、そのたびに隠れ方が変わって、ちらついて見えた
 */
const HOLE_HOLD_FRAMES = 15;
/**
 * soft で、測れなかったところを、なめらかにした奥行きの画像に「とても遠い」として書く値（m）。
 * 0 と書くと、となりの奥行きとなめらかにつないだときに「すぐ目の前に物がある」ことになり、
 * 子の上に、点々とカメラの映像が重なって見えた
 */
const FAR_METERS = 100;
/**
 * soft で、子が本物の物から透けはじめて、すっかり隠れるまでの奥行きの幅の半分（m。近さに比例して足す）。
 * 大きいほど境目がふんわりするが、壁や床のすぐそばの子も、少し透けやすくなる
 */
const SOFT_WIDTH = 0.04;
const SOFT_WIDTH_PER_METER = 0.04;
/** soft で、ずらして重ねる枚数 */
const SOFT_LAYERS = 3;
/** soft で、なめらかにした奥行きを描く画像の大きさ（画面に対する割合） */
const SOFT_RESOLUTION = 1 / 3;

const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** なめらかにした奥行き（m。測れなかったところは 0）。view は画面の上の位置（左上が 0,0） */
const SMOOTH_DEPTH = `
uniform sampler2D depthMap;
uniform vec2 depthSize;
uniform mat4 uvTransform;
uniform mat4 viewFromDepth;
uniform sampler2D cameraMap;
uniform float hasCamera;
uniform float colorSigma2;

// 画面の上の位置（左上が 0,0）の、カメラの映像の色（映像は左下が 0,0）
vec3 cameraColor(vec2 view) {
  return texture2D(cameraMap, vec2(view.x, 1.0 - view.y)).rgb;
}

float smoothDepth(vec2 view) {
  vec2 uv = (uvTransform * vec4(view, 0.0, 1.0)).xy;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 texel = uv * depthSize - 0.5;
  vec2 base = floor(texel + 0.5);
  vec3 here = hasCamera > 0.5 ? cameraColor(view) : vec3(0.0);
  float sum = 0.0;
  float weights = 0.0;
  // まわりのマス（3×3）を、近いマスほど、色が近いマスほど重く混ぜる
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      vec2 cellUv = (cell + 0.5) / depthSize;
      float meters = texture2D(depthMap, cellUv).r;
      if (meters <= 0.0) continue;
      vec2 away = abs(texel - cell);
      float weight = max(0.0, 1.5 - away.x) * max(0.0, 1.5 - away.y);
      if (hasCamera > 0.5) {
        vec2 cellView = (viewFromDepth * vec4(cellUv, 0.0, 1.0)).xy;
        vec3 diff = cameraColor(cellView) - here;
        weight *= exp(-dot(diff, diff) / colorSigma2);
      }
      sum += meters * weight;
      weights += weight;
    }
  }
  return weights > 1e-6 ? sum / weights : 0.0;
}
`;

/** カメラの前 meters m の点の、描画の奥行き（0〜1） */
const DEPTH_OF = `
uniform vec2 projection;
float depthOf(float meters) {
  float ndc = (projection.x * -meters + projection.y) / meters;
  return clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
}
`;

// hard: 本物の物の奥行きを、描画の奥行きに書く
const HARD_FRAGMENT = `
${SMOOTH_DEPTH}
${DEPTH_OF}
uniform vec4 viewportRect;
uniform float bias;
uniform float biasPerMeter;
void main() {
  vec2 view = vec2(
    (gl_FragCoord.x - viewportRect.x) / viewportRect.z,
    1.0 - (gl_FragCoord.y - viewportRect.y) / viewportRect.w
  );
  float meters = smoothDepth(view);
  // 測れなかったところは、いちばん奥（隠さない）
  if (meters <= 0.0) {
    gl_FragDepth = 1.0;
    return;
  }
  gl_FragDepth = depthOf(meters + bias + meters * biasPerMeter);
}
`;

// soft の 1: なめらかにした奥行きを、小さな画像に描く（測れなかったところは、とても遠い）
const SMOOTH_FRAGMENT = `
${SMOOTH_DEPTH}
uniform float farMeters;
varying vec2 vUv;
void main() {
  float meters = smoothDepth(vec2(vUv.x, 1.0 - vUv.y));
  gl_FragColor = vec4(meters > 0.0 ? meters : farMeters, 0.0, 0.0, 1.0);
}
`;

// soft の 2: 本物の物が、ずらした奥行きより手前にあるところ（奥行きのテストで決まる）に、カメラの映像を重ねる
const SOFT_FRAGMENT = `
${DEPTH_OF}
uniform sampler2D smoothMap;
uniform sampler2D cameraMap;
uniform vec4 viewportRect;
uniform float bias;
uniform float biasPerMeter;
uniform float softWidth;
uniform float softWidthPerMeter;
uniform float shift;
uniform float farMeters;
uniform float opacity;
uniform float linearOutput;
void main() {
  vec2 screen = (gl_FragCoord.xy - viewportRect.xy) / viewportRect.zw;
  float meters = texture2D(smoothMap, screen).r;
  // 測れなかったところ（とても遠い。となりとつないだところも、隠さないくらい遠い）
  if (meters <= 0.0 || meters > farMeters * 0.25) discard;
  meters += bias + meters * biasPerMeter;
  gl_FragDepth = depthOf(meters + shift * (softWidth + meters * softWidthPerMeter));
  vec3 color = texture2D(cameraMap, screen).rgb;
  // 写真（光の強さのままの入れ物）のときは、カメラの映像（sRGB）をもどしておく
  if (linearOutput > 0.5) color = pow(color, vec3(2.2));
  gl_FragColor = vec4(color * opacity, opacity);
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
    return {
      available: false,
      setEnabled: () => {},
      update: () => {},
      setPhoto: () => {},
      dispose: () => {},
    };
  }
  const isFloat = format === 'float32';
  const canReadCamera = features.includes('camera-access');
  const soft = canReadCamera && renderer.extensions.has('EXT_color_buffer_float');

  // 奥行き（m）を小数で入れる画像。届いた地図を JS で m に直し、前のフレームとならしてから入れる
  let texture: DataTexture | null = null;
  let meters: Float32Array<ArrayBuffer> = new Float32Array(0);
  // マスごとの、穴が続いているフレーム数
  let holeAges = new Uint8Array(0);
  const uvTransform: Matrix4 = new THREE.Matrix4();
  const viewFromDepth: Matrix4 = new THREE.Matrix4();
  const viewport: Vector4 = new THREE.Vector4();
  // なめらかにする計算で使う値（hard と、soft の 1 で同じものを使う）
  const smoothUniforms = {
    depthMap: { value: null as Texture | null },
    depthSize: { value: new THREE.Vector2(1, 1) },
    uvTransform: { value: uvTransform },
    viewFromDepth: { value: viewFromDepth },
    cameraMap: { value: null as Texture | null },
    hasCamera: { value: 0 },
    colorSigma2: { value: COLOR_SIGMA * COLOR_SIGMA },
    farMeters: { value: FAR_METERS },
  };
  const projection = new THREE.Vector2();
  const viewportRect = new THREE.Vector4();
  const fullscreen = new THREE.PlaneGeometry(2, 2);
  // 描くたびに、その画面（AR の画面・写真）の大きさと、カメラの写し方を渡す
  const onBeforeRender = (target: WebGLRenderer, _scene: Scene, camera: Camera) => {
    target.getCurrentViewport(viewport);
    viewportRect.copy(viewport);
    const e = camera.projectionMatrix.elements;
    projection.set(e[10], e[14]);
  };
  const disposables: { dispose: () => void }[] = [fullscreen];
  /** 画面いっぱいの板を、scene に足す */
  const addQuad = (material: ShaderMaterial, renderOrder: number) => {
    const mesh: Mesh = new THREE.Mesh(fullscreen, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    mesh.onBeforeRender = onBeforeRender as Mesh['onBeforeRender'];
    scene.add(mesh);
    disposables.push(material);
    return mesh;
  };

  const quads: Mesh[] = [];
  const softMaterials: ShaderMaterial[] = [];
  let smoothTarget: WebGLRenderTarget | null = null;
  const smoothScene = new THREE.Scene();
  const smoothCamera = new THREE.Camera();
  if (soft) {
    // soft の 1: なめらかにした奥行きを描く、小さな画像と板（scene とは別に描く）
    const smoothMaterial = new THREE.ShaderMaterial({
      uniforms: smoothUniforms,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: SMOOTH_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const smoothQuad = new THREE.Mesh(fullscreen, smoothMaterial);
    smoothQuad.frustumCulled = false;
    smoothScene.add(smoothQuad);
    disposables.push(smoothMaterial);
    // soft の 2: 子を描いたあとに、ずらした奥行きで 1 枚ずつ重ねる。いちばん手前にずらしたもの（いちばん
    // 多くのところで重なる）から順に、重ねる濃さを 1/3・1/2・1 にすると、重なった枚数 n に対して、
    // 子の見え方が 1 - n/3 になる
    for (let k = 0; k < SOFT_LAYERS; k++) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          smoothMap: { value: null },
          cameraMap: smoothUniforms.cameraMap,
          viewportRect: { value: viewportRect },
          projection: { value: projection },
          bias: { value: DEPTH_BIAS },
          biasPerMeter: { value: DEPTH_BIAS_PER_METER },
          softWidth: { value: SOFT_WIDTH },
          softWidthPerMeter: { value: SOFT_WIDTH_PER_METER },
          // いちばん手前の 1 枚は、hard と同じ奥行き（それより手前にはずらさない。床や壁のそばの子が透けないように）
          shift: { value: (k / SOFT_LAYERS) * 2 },
          farMeters: { value: FAR_METERS },
          opacity: { value: 1 / (SOFT_LAYERS - k) },
          linearOutput: { value: 0 },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: SOFT_FRAGMENT,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessDepth,
        // 子の描いてあるところ（色の入れ物のすけ具合が 1）だけ、カメラの映像を重ねる。何も描いていない
        // ところ（すけ具合が 0）は、そのまま（AR の画面では、うしろにカメラの映像がそのまま見える）。
        // すけ具合そのものは変えない
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.DstAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
      softMaterials.push(material);
      // 子・影・柱（すけるものも）を描き終えてから
      quads.push(addQuad(material, 10000 + k));
    }
  } else {
    // hard: 子より先に、本物の物の奥行きを書く
    quads.push(
      addQuad(
        new THREE.ShaderMaterial({
          uniforms: {
            ...smoothUniforms,
            viewportRect: { value: viewportRect },
            projection: { value: projection },
            bias: { value: DEPTH_BIAS },
            biasPerMeter: { value: DEPTH_BIAS_PER_METER },
          },
          vertexShader: FULLSCREEN_VERTEX,
          fragmentShader: HARD_FRAGMENT,
          // 色は描かず、奥行きだけを、何があっても書きこむ
          colorWrite: false,
          depthWrite: true,
          depthTest: true,
          depthFunc: THREE.AlwaysDepth,
        }),
        -2000,
      ),
    );
  }

  // はじめは隠れない（奥行きの地図が粗く、境目がギザギザになることがあるので、使う人が選ぶ）
  let enabled = false;
  const show = (visible: boolean) => {
    for (const quad of quads) quad.visible = visible;
  };

  /** soft の 1: なめらかにした奥行きを、小さな画像に描く（AR の描き方をいったん止めて描く） */
  const drawSmoothDepth = () => {
    const layer = session.renderState.baseLayer;
    const width = Math.max(1, Math.round((layer?.framebufferWidth ?? 1024) * SOFT_RESOLUTION));
    const height = Math.max(1, Math.round((layer?.framebufferHeight ?? 1024) * SOFT_RESOLUTION));
    if (!smoothTarget || smoothTarget.width !== width || smoothTarget.height !== height) {
      smoothTarget?.dispose();
      smoothTarget = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        format: THREE.RedFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      for (const material of softMaterials) material.uniforms.smoothMap.value = smoothTarget.texture;
    }
    const previous = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    renderer.setRenderTarget(smoothTarget);
    renderer.render(smoothScene, smoothCamera);
    renderer.xr.enabled = true;
    renderer.setRenderTarget(previous);
  };

  return {
    available: true,
    setEnabled: (next) => {
      enabled = next;
      if (!next) {
        show(false);
        // 切ったあとにまた入れたときは、前の奥行きとならさない
        meters.fill(0);
      }
    },
    setPhoto: (photo) => {
      for (const material of softMaterials) material.uniforms.linearOutput.value = photo ? 1 : 0;
    },
    update: (frame, space) => {
      if (!enabled) {
        show(false);
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
      // カメラの映像（読めるときだけ。読めないときは、近さだけで混ぜる）
      const camera = canReadCamera
        ? (view as (XRView & { camera?: unknown }) | undefined)?.camera
        : undefined;
      const cameraTexture: Texture | undefined = camera
        ? renderer.xr.getCameraTexture(
            camera as Parameters<typeof renderer.xr.getCameraTexture>[0],
          )
        : undefined;
      // soft は、カメラの映像を重ねるので、映像が無いフレームでは隠さない
      if (!depth || (soft && !cameraTexture)) {
        show(false);
        return;
      }
      const count = depth.width * depth.height;
      // 奥行きの画像を、大きさが変わったら作り直す
      if (!texture || texture.image.width !== depth.width || texture.image.height !== depth.height) {
        texture?.dispose();
        meters = new Float32Array(count);
        holeAges = new Uint8Array(count);
        texture = new THREE.DataTexture(meters, depth.width, depth.height, THREE.RedFormat, THREE.FloatType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        smoothUniforms.depthMap.value = texture;
        smoothUniforms.depthSize.value.set(depth.width, depth.height);
      }
      // 届いた地図（2 バイトの整数か、小数）を m にして、前のフレームとならす
      const raw = isFloat ? new Float32Array(depth.data) : new Uint16Array(depth.data);
      const scale = depth.rawValueToMeters;
      for (let i = 0; i < count; i++) {
        const next = raw[i] * scale;
        const previous = meters[i];
        // 穴は、しばらくは前の奥行きのまま
        if (next <= 0) {
          if (previous > 0 && holeAges[i] < HOLE_HOLD_FRAMES) holeAges[i] += 1;
          else meters[i] = 0;
          continue;
        }
        holeAges[i] = 0;
        meters[i] =
          next > 0 && previous > 0 && Math.abs(next - previous) < previous * TEMPORAL_JUMP
            ? previous * TEMPORAL_KEEP + next * (1 - TEMPORAL_KEEP)
            : next;
      }
      texture.needsUpdate = true;
      uvTransform.fromArray(depth.normDepthBufferFromNormView.matrix);
      viewFromDepth.copy(uvTransform).invert();
      smoothUniforms.cameraMap.value = cameraTexture ?? null;
      smoothUniforms.hasCamera.value = cameraTexture ? 1 : 0;
      if (soft) drawSmoothDepth();
      show(true);
    },
    dispose: () => {
      for (const quad of quads) scene.remove(quad);
      for (const item of disposables) item.dispose();
      texture?.dispose();
      smoothTarget?.dispose();
    },
  };
}
