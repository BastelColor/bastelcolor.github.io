import type {
  Material,
  Object3D,
  Quaternion,
  Spherical,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { VRM } from '@pixiv/three-vrm';
import modelSizes from 'virtual:model-sizes';
import { createIdleMotion } from '@/components/vrm/idle-motion';
import { createLightRig, type Lighting } from '@/components/vrm/lighting';
import { createPointerLook, type PointerLook } from '@/components/vrm/look-at';
import { createSway, type Sway } from '@/components/vrm/sway';
import { slimLilToonUniforms } from '@/components/vrm/liltoon-slim';
import {
  exportUsdz,
  startWebXR,
  type ARSession,
  type ARView,
} from '@/components/vrm/ar';
import {
  createViewModes,
  type ViewMode,
  type ViewModes,
} from '@/components/vrm/view-modes';
import {
  createMotionPlayer,
  type MotionPlayer,
} from '@/components/vrm/motion-player';
import { loadMotion, type MotionId } from '@/components/vrm/motions';

/**
 * three.js で VRM を表示する「舞台」。React には依存させず、
 * VrmViewer からはこのインターフェース越しに操作する。
 */
export type VrmStage = {
  setAutoRotate: (enabled: boolean) => void;
  /**
   * 表情（VRM の happy・angry など）を seconds 秒だけ見せて、ふだんの顔にもどす。
   * focusFace なら、そのあいだカメラが顔に寄る。モデルに無い表情なら何もしない
   */
  showExpression: (
    name: string,
    options?: { seconds?: number; focusFace?: boolean },
  ) => void;
  /** カメラをモデルのまわりに angle（ラジアン、正で左へ）だけ、なめらかにまわす */
  orbit: (angle: number) => void;
  /** カメラをなめらかに正面へもどす */
  front: () => void;
  /** 表示（ふつう・ワイヤーフレーム・テクスチャ・ボーン）を切りかえる（components/vrm/view-modes.ts） */
  setViewMode: (mode: ViewMode) => void;
  /** モデルが持っている表情の名前 */
  expressionNames: string[];
  /** ライトの組み合わせを切りかえる（components/vrm/lighting.ts） */
  setLighting: (lighting: Lighting, instant?: boolean) => void;
  /**
   * AR（WebXR）を始める。押したときの操作の中で呼ぶ。overlay はカメラの映像に重ねる要素
   * （components/vrm/ar.ts）
   */
  startAR: (
    overlay: HTMLElement,
    events: { onPlaced: () => void; onEnd: () => void },
  ) => Promise<ARSession>;
  /** いまのポーズのモデルを USDZ にする（iPhone の AR クイックルック用。components/vrm/ar.ts） */
  exportUsdz: () => Promise<Blob>;
  /** いまの画面を写真にする（枠の中、少し広めに。背景は透明） */
  capture: () => StageShot;
  resetView: () => void;
  dispose: () => void;
};

/**
 * 公開前の確認（scripts/smoke-scenarios.mjs）が読む、いまの目線と表情の数字。
 * URL に ?check を付けて開いたときだけ、window.__yzmoCheck() で読める
 */
export type StageCheck = {
  /** 目の位置が、頭の骨からどれだけ離れているか（m）。モデルの骨の大きさの扱いをまちがえると、何 m にもなる */
  eyeOffset: number;
  /** 黒目の向き（度）。yaw は左右、pitch は上下（正で下） */
  eyeYaw: number;
  eyePitch: number;
  /** 顔の上下の向き（度、正で上） */
  headPitch: number;
  /**
   * 調べるとき用の、向きの数字（度、[左右, 上下]）。顔（動かす骨・表示する骨）、目が見る点、カメラ、
   * three-vrm が最初に覚えた顔の向き（目の向きは、これを基準に計算される）
   */
  debug: Record<string, [number, number]>;
  /** いま見せている表情と、その強さ（0〜1） */
  expressions: Record<string, number>;
};

/**
 * lilToon の見た目で描けなかった（端末の GPU で、lilToon の描き方（シェーダー）を作れなかった）。
 * これが投げられたら、lilToon を使わずに（VRM のふつうの見た目で）表示し直す
 */
export class LilToonRenderError extends Error {
  /** シェーダーを作れなかった理由（ブラウザが出したもの。公開前の確認の ?check のときに画面に出す） */
  log: string;
  constructor(log: string) {
    super('lilToon のシェーダーを、この端末では作れませんでした');
    this.name = 'LilToonRenderError';
    this.log = log;
  }
}

/**
 * 1回描いてみて、描き方（シェーダー）を作れなかったものがあるかを調べる。
 * 作れなかったものは、three.js がエラーを出して描かないだけなので、画面には何も出なくなる
 * （Android の Chrome で、lilToon の子だけが表示されなかった）
 */
export function failsToRender(
  renderer: WebGLRenderer,
  render: () => void,
): string | null {
  const logs: string[] = [];
  const previous = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    const log = [
      gl.getProgramInfoLog(program),
      gl.getShaderInfoLog(vertexShader),
      gl.getShaderInfoLog(fragmentShader),
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    logs.push(log || '（理由は出ませんでした）');
    console.error('シェーダーを作れませんでした', log);
  };
  try {
    render();
  } finally {
    renderer.debug.onShaderError = previous;
  }
  return logs.length > 0 ? logs.join('\n---\n') : null;
}

/** 写真（capture）。画像と、画像の中での枠（container）の位置（画像のピクセル） */
export type StageShot = {
  image: HTMLCanvasElement;
  frame: { left: number; top: number; width: number; height: number };
};

type CreateVrmStageOptions = {
  canvas: HTMLCanvasElement;
  /** モデルを収める枠。モデルの大きさはこの枠に合わせる */
  container: HTMLElement;
  /**
   * 枠の外へはみ出して描いてよい範囲（枠を囲む要素）。
   * 指定すると、canvas をこの要素の左右の端まで広げ、しっぽなどが枠で切れないようにする
   */
  bleed?: HTMLElement;
  modelUrl: string;
  /** ループ再生する埋め込みモーション。省略時は待機モーションのみ */
  motionId?: MotionId;
  /** 照明の明るさの倍率（既定: 1） */
  brightness?: number;
  /**
   * lilToon の見た目で表示するか。Unity の Mochiya Avatar Tools で書き出した
   * （lilToon の設定が入った）VRM のときだけ true にする。そのときだけ lilToon の
   * 描画部品（@mochiya/three-liltoon、大きめ）を読み込む
   */
  liltoon?: boolean;
  /**
   * lilToon の子を、lilToon なしで読んだとき（lilToon で描けなかったとき）に true。
   * ふつうの材質を MToon に置きかえて、アニメ調に描く（toonify）
   */
  toonFallback?: boolean;
  /** 最初から自動回転させるか（既定: true） */
  autoRotate?: boolean;
  /** ホイールでの拡大縮小を許可するか。ページ内に埋め込むときはスクロールを奪わないよう false に（既定: true） */
  zoom?: boolean;
  /** 中断されたら、その時点までに作ったリソースをすぐ解放する */
  signal: AbortSignal;
  onProgress: (percent: number) => void;
};

const MAX_PIXEL_RATIO = 2;
const AUTO_ROTATE_SPEED = 0.65;
/** 枠の高さに対するカメラの画角（度） */
const FOV = 30;
const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);
/** bleed を指定したとき、枠の上下へはみ出して描く量（枠の高さに対する割合） */
const BLEED_TOP = 0.45;
const BLEED_BOTTOM = 0.2;
/** 表情を見せる時間の既定（秒） */
const EXPRESSION_SECONDS = 2.5;
/** 表情を切りかえるのにかける時間（秒） */
const EXPRESSION_FADE = 0.2;
/** カメラがねらいの位置へ近づく速さ（大きいほど速い） */
const CAMERA_EASE = 7;
/** 顔に寄ったとき、枠の高さに映す範囲（背丈に対する割合） */
const FACE_VIEW = 0.34;
/** 写真の、枠より下に広げる量（枠の高さに対する割合） */
const PHOTO_BOTTOM = 0.06;
/** 写真の高さ（ピクセル）。画面の大きさにかかわらず、だいたいこの大きさで撮る */
const PHOTO_HEIGHT = 1600;

// three.js 一式は重いので、アバターの部屋を開くとき（か、その雲にふれたとき）に初めて読み込む。
// 一度読み込んだものは使い回す
let threeModules: ReturnType<typeof importThreeModules> | null = null;
export function loadThreeModules() {
  threeModules ??= importThreeModules();
  threeModules.catch(() => {
    threeModules = null;
  });
  return threeModules;
}

/** 先読みしたモデルの URL（同じものを2回取りに行かない） */
const preloadedModels = new Set<string>();

/**
 * アバターの部屋を開く前に、表示に使うものを読み込み始めておく（アバターの雲にふれたときなど）。
 * three.js 一式・ループのモーション・最初に出すモデル（lilToon の子なら lilToon の部品も）。
 * モデルはブラウザのキャッシュに入れておくだけで、表示するときにそこから読まれる。
 * 通信量を抑える設定（データセーバー）の人には、モデルは先読みしない
 */
export function preloadVrmStage({
  modelUrl,
  motionId,
  liltoon = false,
}: {
  modelUrl: string;
  motionId?: MotionId;
  liltoon?: boolean;
}) {
  const modules = loadThreeModules();
  if (motionId) {
    modules
      .then(({ THREE, VRMAnimation }) =>
        loadMotion(motionId, THREE, VRMAnimation),
      )
      .catch(() => {});
  }
  if (liltoon) {
    Promise.all([
      import('@mochiya/three-liltoon'),
      import('@mochiya/three-liltoon/vrm'),
    ]).catch(() => {});
  }
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;
  if (preloadedModels.has(modelUrl) || connection?.saveData) return;
  preloadedModels.add(modelUrl);
  fetch(modelUrl).catch(() => preloadedModels.delete(modelUrl));
}

async function importThreeModules() {
  const [
    THREE,
    { GLTFLoader },
    { OrbitControls },
    { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName, MToonMaterial },
    { VRMAnimation, createVRMAnimationClip },
  ] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@pixiv/three-vrm'),
    import('@pixiv/three-vrm-animation'),
  ]);
  return {
    THREE,
    GLTFLoader,
    OrbitControls,
    VRMLoaderPlugin,
    VRMUtils,
    VRMHumanBoneName,
    MToonMaterial,
    VRMAnimation,
    createVRMAnimationClip,
  };
}

/**
 * lilToon のシェーダーを、スマホの GPU でも作れるように軽くする（components/vrm/liltoon-slim.ts）。
 * lilToon のマテリアルすべて（輪郭線などの、追加で描くものも）に効くよう、クラスに付ける
 */
export function applySlimLilToon(LilToonMaterial: { prototype: object }) {
  (LilToonMaterial.prototype as { onBeforeCompile: unknown }).onBeforeCompile =
    slimLilToonUniforms;
}

/** lilToon で描けなかった子を MToon で描くときの、色の明るさの倍率 */
const TOON_FALLBACK_BRIGHTNESS = 1.14;

/**
 * lilToon で描けなかった子を、MToon（ほかの子と同じアニメ調の描き方）で描き直す。
 * lilToon を使わずに読むと、VRM に入っているふつうの材質（光の当たり方がリアル寄りで、暗く見える）になるため、
 * その色とテクスチャを使って、影を少しだけつけた MToon に置きかえる
 */
export function toonify(
  THREE: typeof import('three'),
  MToonMaterial: (typeof import('@pixiv/three-vrm'))['MToonMaterial'],
  root: Object3D,
) {
  const made = new Map<Material, Material>();
  const convert = (material: Material) => {
    const standard = material as Material & {
      isMeshStandardMaterial?: boolean;
      map?: Texture | null;
      color?: import('three').Color;
      emissive?: import('three').Color;
      emissiveMap?: Texture | null;
    };
    if (!standard.isMeshStandardMaterial) return material;
    let toon = made.get(material);
    if (!toon) {
      // lilToon で見るより少し暗くくすんで見えるので、その分だけ明るくする
      const color = (standard.color?.clone() ?? new THREE.Color(1, 1, 1)).multiplyScalar(
        TOON_FALLBACK_BRIGHTNESS,
      );
      toon = new MToonMaterial({
        map: standard.map ?? undefined,
        color,
        // lilToon はほとんど影を落とさず明るく描くので、影はうすく（元の色をほんの少し紫寄りに）、
        // 光の当たる側を広めにする
        shadeColorFactor: color.clone().multiply(new THREE.Color(0.94, 0.9, 0.96)),
        shadeMultiplyTexture: standard.map ?? undefined,
        shadingShiftFactor: -0.4,
        shadingToonyFactor: 0.9,
        giEqualizationFactor: 0.9,
        emissive: standard.emissive?.clone(),
        emissiveMap: standard.emissiveMap ?? undefined,
        transparent: material.transparent,
        transparentWithZWrite: material.transparent,
        alphaTest: material.alphaTest,
        side: material.side,
      });
      made.set(material, toon);
    }
    return toon;
  };
  root.traverse((object) => {
    const mesh = object as Object3D & { material?: Material | Material[] };
    if (!mesh.material) return;
    const before = mesh.material;
    mesh.material = Array.isArray(before) ? before.map(convert) : convert(before);
  });
  for (const original of made.keys()) original.dispose();
}

export async function createVrmStage({
  canvas,
  container,
  bleed,
  modelUrl,
  motionId,
  brightness = 1,
  liltoon = false,
  toonFallback = false,
  autoRotate = true,
  zoom = true,
  signal,
  onProgress,
}: CreateVrmStageOptions): Promise<VrmStage> {
  const modules = await loadThreeModules();
  const { THREE, GLTFLoader, OrbitControls, VRMLoaderPlugin, VRMUtils } =
    modules;
  signal.throwIfAborted();

  // モーションはモデルと並行して読み込んでおき、表示できたらすぐ再生する
  const motion = motionId
    ? loadMotion(motionId, THREE, modules.VRMAnimation)
    : null;
  // モデル側が先に失敗したときに未処理エラー扱いにならないようにする
  motion?.catch(() => {});

  // --- renderer / scene / camera ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // MToon はトーンマッピングなし前提の色づくり。ACES をかけると白がくすむ

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

  const lights = createLightRig(THREE, scene, brightness);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.autoRotate = autoRotate;
  controls.enableZoom = zoom;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  // スマホなど指で操作する画面では、カメラを動かせないようにする
  // （スクロールしようとして触れただけでモデルが回ってしまい、落ち着かないため）。
  // モデルの上をなぞっても、ふつうに画面がスクロールする
  if (window.matchMedia('(pointer: coarse)').matches) {
    controls.enabled = false;
    canvas.style.touchAction = 'auto';
  }

  // 枠（container）の大きさと、はみ出して描ける上下左右の幅
  const frame = { width: 1, height: 1, left: 0, right: 0, top: 0, bottom: 0 };
  let onFrameChange = () => {};
  const resize = () => {
    frame.width = Math.max(1, container.clientWidth);
    frame.height = Math.max(1, container.clientHeight);
    frame.left = 0;
    frame.right = 0;
    frame.top = 0;
    frame.bottom = 0;
    if (bleed) {
      // 左右は bleed の要素の端まで
      const frameRect = container.getBoundingClientRect();
      const bleedRect = bleed.getBoundingClientRect();
      const bleedLeft = bleedRect.left + bleed.clientLeft;
      frame.left = Math.max(0, frameRect.left - bleedLeft);
      frame.right = Math.max(
        0,
        bleedLeft + bleed.clientWidth - frameRect.right,
      );
      // 上下は枠の高さに対する割合で。回ってしっぽが手前に来ると、
      // 近いぶん大きく映って枠の上下にもはみ出すため
      frame.top = frame.height * BLEED_TOP;
      frame.bottom = frame.height * BLEED_BOTTOM;
    }
    // canvas は枠の外へはみ出して置く
    const width = frame.width + frame.left + frame.right;
    const height = frame.height + frame.top + frame.bottom;
    canvas.style.left = `${-frame.left}px`;
    canvas.style.top = `${-frame.top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    renderer.setSize(width, height, false);

    // カメラの中心は枠の真ん中のまま。上下左右対称の大きな画面を考え、
    // そのうち canvas に入る部分だけを描く（はみ出しが左右で違っても、モデルは枠の中央に立つ）。
    // 画角は「枠の高さで FOV 度」になるように、大きな画面のぶん広げる
    const halfWidth = frame.width / 2 + Math.max(frame.left, frame.right);
    const halfHeight = frame.height / 2 + Math.max(frame.top, frame.bottom);
    camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(TAN_HALF_FOV * (halfHeight / (frame.height / 2))),
    );
    camera.aspect = halfWidth / halfHeight;
    camera.setViewOffset(
      halfWidth * 2,
      halfHeight * 2,
      halfWidth - frame.width / 2 - frame.left,
      halfHeight - frame.height / 2 - frame.top,
      width,
      height,
    );
    camera.updateProjectionMatrix();
    onFrameChange();
  };
  // 大きさが変わった知らせの中で canvas の大きさを変えると、それでページのスクロールバーが
  // 出たり消えたりしたときに知らせがくり返され、「ResizeObserver loop」の警告が出る。
  // 次の描画の前にまとめて合わせる
  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  });
  resizeObserver.observe(container);
  if (bleed) resizeObserver.observe(bleed);
  resize();

  // --- 後片付け（何度呼ばれても1回だけ実行） ---
  let vrm: VRM | null = null;
  let motionPlayer: MotionPlayer | null = null;
  let viewModes: ViewModes | null = null;
  let pointerLook: PointerLook | null = null;
  let sway: Sway | null = null;
  let releaseLilToon: (() => void) | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // AR のあいだに片付けることになったら、AR も終える
    void renderer.xr.getSession()?.end();
    renderer.setAnimationLoop(null);
    releaseLilToon?.();
    cancelAnimationFrame(resizeFrame);
    resizeObserver.disconnect();
    controls.dispose();
    motionPlayer?.dispose();
    viewModes?.dispose();
    pointerLook?.dispose();
    sway?.dispose();
    if (vrm) disposeObject(vrm.scene);
    renderer.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });

  try {
    // --- モデル読み込み ---
    const loader = new GLTFLoader();
    if (liltoon) {
      // lilToon の見た目のまま描く（輪郭線などの追加の描画も、ここで有効にする）
      const [{ enableLilToon, LilToonMaterial }, { enableLilToonVRM }] = await Promise.all([
        import('@mochiya/three-liltoon'),
        import('@mochiya/three-liltoon/vrm'),
      ]);
      signal.throwIfAborted();
      releaseLilToon = enableLilToon(renderer);
      applySlimLilToon(LilToonMaterial);
      loader.register((parser) =>
        enableLilToonVRM(new VRMLoaderPlugin(parser)),
      );
    } else {
      loader.register((parser) => new VRMLoaderPlugin(parser));
    }
    // 届いた量は、圧縮をほどいたあとの大きさで数えられるので、
    // 割る数もファイルの実際の大きさにする（scripts/vite-model-sizes.ts）
    const fileSize = modelSizes[modelUrl] as number | undefined;
    const gltf = await loader.loadAsync(modelUrl, (event) => {
      const total = fileSize ?? event.total;
      if (total > 0 && !signal.aborted) {
        onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
      }
    });

    const loaded = gltf.userData.vrm as VRM | undefined;
    if (!loaded) throw new Error('VRM 1.0データを読み込めませんでした');
    if (signal.aborted) {
      disposeObject(loaded.scene);
      signal.throwIfAborted();
    }
    vrm = loaded;

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
    });
    if (toonFallback) toonify(THREE, modules.MToonMaterial, vrm.scene);
    scene.add(vrm.scene);

    // --- Tポーズから待機ポーズにしてから画角を測る ---
    const idleMotion = createIdleMotion(vrm);
    idleMotion.update(0);
    vrm.update(0);
    // Tポーズ時点の位置から揺れものが跳ねないよう、ポーズ確定後に初期化する
    vrm.springBoneManager?.reset();
    vrm.scene.updateMatrixWorld(true);

    // --- カメラをモデル全身が収まる位置に合わせる ---
    const bounds = measureVisibleBounds(THREE, vrm.scene);
    const size = bounds.getSize(new THREE.Vector3());
    const modelHeight = Math.max(size.y, 0.01);
    // 回す軸は腰の真上。モーションで体の向きが変わっても体は枠の中央に立ち、
    // しっぽなどは体のまわりを回る（枠の外へはみ出したぶんは bleed の範囲に描く）
    const hips = vrm.humanoid.getRawBoneNode('hips');
    const pivot = bounds.getCenter(new THREE.Vector3());
    if (hips) {
      const hipsPosition = hips.getWorldPosition(new THREE.Vector3());
      pivot.x = hipsPosition.x;
      pivot.z = hipsPosition.z;
    }
    // 軸より手前に出ている奥行き（近いぶん大きく映るので、そのぶん離す）
    const frontDepth = Math.max(bounds.max.z - pivot.z, 0);

    controls.minDistance = modelHeight * 0.45;
    controls.maxDistance = modelHeight * 4;
    controls.maxPolarAngle = Math.PI * 0.72;

    // 大きさは「背丈が枠に収まる」ことだけで決め、どの子も同じ大きさに映す。
    // しっぽなど横に大きく伸びるものは、枠をはみ出して描く。
    // （スマホなど細い画面では、Quiple が真横を向いた一瞬、しっぽの先が画面の端で切れる。
    //   しっぽに合わせて小さく映すより、ほかの子と同じ大きさを優先している）
    const resetView = () => {
      const distanceForHeight = size.y / 2 / TAN_HALF_FOV;
      const distance = distanceForHeight * 1.06 + frontDepth;

      // ズームで離れられる上限より遠くに置くと、上限まで引き戻されてしまう
      controls.maxDistance = Math.max(modelHeight * 4, distance * 1.5);
      camera.near = Math.max(distance / 100, 0.001);
      camera.far = Math.max(distance * 10, distance + size.z * 4);
      camera.position.set(pivot.x, pivot.y, pivot.z + distance);
      camera.updateProjectionMatrix();
      controls.target.copy(pivot);
      controls.update();
    };
    resetView();

    // --- カメラをなめらかに動かす（まわすボタン・正面・表情のアップ） ---
    // ねらいの位置（注視点と、そこからのカメラの向き・距離）へ、毎フレーム少しずつ近づける。
    // 動かしているあいだは、ドラッグでの操作を止める
    type CameraView = { target: Vector3; offset: Spherical };
    const controlsAllowed = controls.enabled;
    const offsetNow = new THREE.Spherical();
    const scratch = new THREE.Vector3();
    let cameraGoal: (() => CameraView) | null = null;
    let goalEndsOnArrival = false;
    // 顔に寄っているあいだは、顔の向きに合わせて回り込み続ける
    let faceUntil = -1;
    let viewBeforeFace: CameraView | null = null;

    const viewNow = (): CameraView => ({
      target: controls.target.clone(),
      offset: new THREE.Spherical().setFromVector3(
        scratch.copy(camera.position).sub(controls.target),
      ),
    });
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    const headQuaternion = new THREE.Quaternion();
    /** 全身を写すカメラ（theta はまわした角度） */
    const framedView = (theta: number): CameraView => ({
      target: pivot.clone(),
      offset: new THREE.Spherical(
        (size.y / 2 / TAN_HALF_FOV) * 1.06 + frontDepth,
        Math.PI / 2,
        theta,
      ),
    });
    const frontView = () => framedView(0);
    // 枠の大きさが変わったら合わせ直す
    onFrameChange = resetView;
    const faceView = (): CameraView => {
      if (!head) return frontView();
      const target = head.getWorldPosition(new THREE.Vector3());
      target.y += modelHeight * 0.03;
      // 顔の正面の向き（VRM 1.0 は +Z が正面）
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
        head.getWorldQuaternion(headQuaternion),
      );
      return {
        target,
        offset: new THREE.Spherical(
          (modelHeight * FACE_VIEW) / 2 / TAN_HALF_FOV,
          Math.PI / 2 - 0.08,
          Math.atan2(forward.x, forward.z),
        ),
      };
    };
    const setGoal = (goal: () => CameraView, endsOnArrival: boolean) => {
      cameraGoal = goal;
      goalEndsOnArrival = endsOnArrival;
      controls.enabled = false;
    };

    const moveCamera = (elapsed: number, delta: number) => {
      // 顔のアップが終わったら、寄る前の位置へもどる
      if (faceUntil >= 0 && elapsed >= faceUntil) {
        faceUntil = -1;
        const back = viewBeforeFace ?? frontView();
        viewBeforeFace = null;
        setGoal(() => back, true);
      }
      if (!cameraGoal) return;
      const goal = cameraGoal();
      const k = 1 - Math.exp(-delta * CAMERA_EASE);
      offsetNow.setFromVector3(
        scratch.copy(camera.position).sub(controls.target),
      );
      // 角度はいちばん近い回り方で
      let turn = goal.offset.theta - offsetNow.theta;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      offsetNow.theta += turn * k;
      offsetNow.phi += (goal.offset.phi - offsetNow.phi) * k;
      offsetNow.radius += (goal.offset.radius - offsetNow.radius) * k;
      controls.target.lerp(goal.target, k);
      camera.position.setFromSpherical(offsetNow).add(controls.target);
      const arrived =
        Math.abs(turn) < 0.002 &&
        Math.abs(goal.offset.radius - offsetNow.radius) < modelHeight * 0.002 &&
        controls.target.distanceTo(goal.target) < modelHeight * 0.002;
      if (arrived && goalEndsOnArrival) {
        cameraGoal = null;
        controls.enabled = controlsAllowed;
      }
    };

    const player = createMotionPlayer({ ...modules, vrm });
    motionPlayer = player;
    // 表示の切りかえ（中身を見る）と、マウスのほうを見る動き
    viewModes = createViewModes(THREE, scene, [vrm.scene]);
    const look = createPointerLook(THREE, scene, camera, canvas, [vrm], container);
    pointerLook = look;
    // モデルをつまんで引っぱる
    const swaying = createSway(THREE, camera, canvas, [vrm]);
    sway = swaying;
    // モーションが読めなくても待機モーションで表示は続ける
    motion
      ?.then((animation) => {
        if (!disposed) player.play(animation);
      })
      .catch((error: unknown) => console.error(error));

    // --- 表情 ---
    // 見せている表情と、見せ終わる時刻。ほかの表情はなめらかに 0 へもどす
    const expressionManager = vrm.expressionManager;
    const expressionNames = expressionManager
      ? Object.keys(expressionManager.expressionMap)
      : [];
    const expressionWeights = new Map<string, number>();
    let shownExpression: { name: string; until: number } | null = null;
    const updateExpressions = (elapsed: number, delta: number) => {
      if (!expressionManager) return;
      if (shownExpression && elapsed >= shownExpression.until) {
        shownExpression = null;
      }
      const step = delta / EXPRESSION_FADE;
      for (const [name, weight] of expressionWeights) {
        const target = shownExpression?.name === name ? 1 : 0;
        const next =
          target > weight
            ? Math.min(target, weight + step)
            : Math.max(target, weight - step);
        expressionManager.setValue(name, next);
        if (next === 0 && target === 0) expressionWeights.delete(name);
        else expressionWeights.set(name, next);
      }
    };

    // lilToon の見た目は、端末によっては描けないことがある。描けなければ、ふつうの見た目で表示し直す
    if (liltoon) {
      const log = failsToRender(renderer, () => renderer.render(scene, camera));
      if (log) throw new LilToonRenderError(log);
    }

    // --- AR（WebXR）。始めているあいだだけ ---
    let arView: ARView | null = null;

    // --- 公開前の確認のための数字（URL に ?check があるときだけ） ---
    if (new URLSearchParams(window.location.search).has('check')) {
      const headBone = vrm.humanoid.getNormalizedBoneNode('head');
      const checkVrm = vrm;
      const check = (): StageCheck => {
        const lookAt = checkVrm.lookAt;
        const headPosition = new THREE.Vector3();
        headBone?.getWorldPosition(headPosition);
        const forward = new THREE.Vector3(0, 0, 1);
        if (headBone) {
          forward.applyQuaternion(headBone.getWorldQuaternion(headQuaternion));
        }
        // 向き（+Z の向き、またはある点への向き）を [左右, 上下] の度にする
        const angles = (direction: Vector3): [number, number] => {
          const unit = direction.clone().normalize();
          return [
            Math.round(THREE.MathUtils.radToDeg(Math.atan2(unit.x, unit.z))),
            Math.round(THREE.MathUtils.radToDeg(Math.asin(unit.y))),
          ];
        };
        const facing = (quaternion: Quaternion) =>
          angles(new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion));
        const rawHead = checkVrm.humanoid.getRawBoneNode('head');
        const debug: Record<string, [number, number]> = {
          head: angles(forward),
          camera: angles(
            camera.getWorldPosition(new THREE.Vector3()).sub(headPosition),
          ),
        };
        if (rawHead) {
          debug.rawHead = facing(rawHead.getWorldQuaternion(new THREE.Quaternion()));
        }
        if (lookAt?.target) {
          debug.target = angles(
            lookAt.target.getWorldPosition(new THREE.Vector3()).sub(headPosition),
          );
        }
        const rest = (
          lookAt as unknown as { _restHeadWorldQuaternion?: Quaternion } | null
        )?._restHeadWorldQuaternion;
        if (rest) debug.rest = facing(rest);
        return {
          debug,
          eyeOffset: lookAt
            ? lookAt
                .getLookAtWorldPosition(new THREE.Vector3())
                .distanceTo(headPosition)
            : 0,
          eyeYaw: lookAt?.yaw ?? 0,
          eyePitch: lookAt?.pitch ?? 0,
          headPitch: THREE.MathUtils.radToDeg(Math.asin(forward.y)),
          expressions: Object.fromEntries(expressionWeights),
        };
      };
      const checkWindow = window as unknown as { __yzmoCheck?: () => StageCheck };
      checkWindow.__yzmoCheck = check;
      signal.addEventListener('abort', () => {
        if (checkWindow.__yzmoCheck === check) delete checkWindow.__yzmoCheck;
      });
    }

    // --- 描画ループ ---
    const timer = new THREE.Timer();
    const currentVrm = vrm;
    renderer.setAnimationLoop((time, frame) => {
      timer.update(time);
      // タブ復帰直後などに揺れものが暴れないよう、経過時間に上限を設ける
      const delta = Math.min(timer.getDelta(), 0.05);
      idleMotion.update(timer.getElapsed());
      updateExpressions(timer.getElapsed(), delta);
      player.update(delta);
      look.update(delta);
      swaying.update(delta);
      currentVrm.update(delta);
      swaying.afterUpdate();
      moveCamera(timer.getElapsed(), delta);
      lights.update(delta);
      controls.update();
      arView?.update(frame);
      renderer.render(scene, camera);
    });

    return {
      setAutoRotate: (enabled) => {
        controls.autoRotate = enabled;
      },
      showExpression: (
        name,
        { seconds = EXPRESSION_SECONDS, focusFace = false } = {},
      ) => {
        if (!expressionNames.includes(name)) return;
        const until = timer.getElapsed() + seconds;
        shownExpression = { name, until };
        if (!expressionWeights.has(name)) expressionWeights.set(name, 0);
        if (focusFace) {
          // 寄る前の位置を覚えておく（まわしている途中なら、まわし終わりの位置）
          if (faceUntil < 0) {
            viewBeforeFace =
              cameraGoal && goalEndsOnArrival ? cameraGoal() : viewNow();
          }
          faceUntil = until;
          setGoal(faceView, false);
        }
      },
      orbit: (angle) => {
        // 顔に寄っているあいだは、まわさない
        if (faceUntil >= 0) return;
        const base = cameraGoal && goalEndsOnArrival ? cameraGoal() : viewNow();
        const goal: CameraView = {
          target: base.target,
          offset: new THREE.Spherical(
            base.offset.radius,
            base.offset.phi,
            base.offset.theta + angle,
          ),
        };
        setGoal(() => goal, true);
      },
      front: () => {
        faceUntil = -1;
        viewBeforeFace = null;
        const goal = frontView();
        setGoal(() => goal, true);
      },
      setViewMode: (mode) => viewModes?.set(mode),
      expressionNames,
      setLighting: lights.set,
      startAR: async (overlay, { onPlaced, onEnd }) => {
        const view = await startWebXR({
          THREE,
          renderer,
          scene,
          model: currentVrm.scene,
          overlay,
          onPlaced,
          onEnd: () => {
            arView = null;
            // 目と揺れものは、またいつものカメラを見る。canvas の大きさも元にもどす
            look.setCamera(camera);
            swaying.setCamera(camera);
            resize();
            onEnd();
          },
        });
        arView = view;
        // AR のあいだは、スマホのカメラを「見ている人」にする
        look.setCamera(renderer.xr.getCamera());
        swaying.setCamera(renderer.xr.getCamera());
        return view.session;
      },
      exportUsdz: () => exportUsdz(THREE, currentVrm.scene),
      capture: () => {
        // 枠の中。しっぽなどが切れにくいよう、細い枠では横を少し広げ、
        // 足元の展示台の影まで入るよう、下も少し広げる
        const extra = Math.max(0, (frame.height * 0.9 - frame.width) / 2);
        const left = Math.min(frame.left, extra);
        const right = Math.min(frame.right, extra);
        const { image, ratio } = captureFrame(
          renderer,
          () => renderer.render(scene, camera),
          {
            x: frame.left - left,
            y: frame.top,
            width: frame.width + left + right,
            height:
              frame.height +
              Math.min(frame.bottom, frame.height * PHOTO_BOTTOM),
          },
        );
        return {
          image,
          frame: {
            left: left * ratio,
            top: 0,
            width: frame.width * ratio,
            height: frame.height * ratio,
          },
        };
      },
      resetView,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * canvas の一部を、大きめの解像度で描き直して切り出す（写真）。
 * region は canvas の中で写す範囲（CSS のピクセル）
 */
export function captureFrame(
  renderer: WebGLRenderer,
  render: () => void,
  region: { x: number; y: number; width: number; height: number },
) {
  const canvas = renderer.domElement;
  const previousRatio = renderer.getPixelRatio();
  const ratio = Math.min(
    4,
    Math.max(previousRatio, PHOTO_HEIGHT / region.height),
  );
  // 大きな解像度で描いて、すぐ（画面に出る前に）写し取り、元の解像度で描き直す
  renderer.setPixelRatio(ratio);
  render();
  const photo = document.createElement('canvas');
  photo.width = Math.round(region.width * ratio);
  photo.height = Math.round(region.height * ratio);
  photo
    .getContext('2d')
    ?.drawImage(
      canvas,
      Math.round(region.x * ratio),
      Math.round(region.y * ratio),
      photo.width,
      photo.height,
      0,
      0,
      photo.width,
      photo.height,
    );
  renderer.setPixelRatio(previousRatio);
  render();
  return { image: photo, ratio };
}

/**
 * VRM のルートや SpringBone はモデル本体より遠い座標を持つことがあるため、
 * 実際に描画されるメッシュだけで範囲を測る。
 */
export function measureVisibleBounds(THREE: typeof import('three'), root: Object3D) {
  const bounds = new THREE.Box3();
  root.traverse((object) => {
    const mesh = object as Object3D & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.visible) return;
    bounds.union(new THREE.Box3().expandByObject(mesh, true));
  });
  if (bounds.isEmpty()) bounds.setFromObject(root, true);
  return bounds;
}

export function disposeObject(root: Object3D) {
  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    materials.forEach(disposeMaterial);
  });
}

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}
