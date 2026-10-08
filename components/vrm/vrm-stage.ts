import type { Material, Object3D, Texture } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import modelSizes from 'virtual:model-sizes';
import { createIdleMotion } from '@/components/vrm/idle-motion';
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
  resetView: () => void;
  dispose: () => void;
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

// three.js 一式は重いので、アバターを選んだときに初めて読み込む
async function loadThreeModules() {
  const [
    THREE,
    { GLTFLoader },
    { OrbitControls },
    { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName },
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
    VRMAnimation,
    createVRMAnimationClip,
  };
}

export async function createVrmStage({
  canvas,
  container,
  bleed,
  modelUrl,
  motionId,
  brightness = 1,
  liltoon = false,
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

  const hemisphere = new THREE.HemisphereLight(
    0xf7fdff,
    0xa8bbdc,
    0.88 * brightness,
  );
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4 * brightness);
  keyLight.position.set(1.8, 2.8, 3.2);
  const fillLight = new THREE.DirectionalLight(0xffddea, 0.56 * brightness);
  fillLight.position.set(-2.4, 1.4, 1.2);
  scene.add(hemisphere, keyLight, fillLight);

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
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);
  if (bleed) resizeObserver.observe(bleed);
  resize();

  // --- 後片付け（何度呼ばれても1回だけ実行） ---
  let vrm: VRM | null = null;
  let motionPlayer: MotionPlayer | null = null;
  let releaseLilToon: (() => void) | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    releaseLilToon?.();
    resizeObserver.disconnect();
    controls.dispose();
    motionPlayer?.dispose();
    if (vrm) disposeObject(vrm.scene);
    renderer.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });

  try {
    // --- モデル読み込み ---
    const loader = new GLTFLoader();
    if (liltoon) {
      // lilToon の見た目のまま描く（輪郭線などの追加の描画も、ここで有効にする）
      const [{ enableLilToon }, { enableLilToonVRM }] = await Promise.all([
        import('@mochiya/three-liltoon'),
        import('@mochiya/three-liltoon/vrm'),
      ]);
      signal.throwIfAborted();
      releaseLilToon = enableLilToon(renderer);
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
    // 枠の大きさが変わったら合わせ直す
    onFrameChange = resetView;

    const player = createMotionPlayer({ ...modules, vrm });
    motionPlayer = player;
    // モーションが読めなくても待機モーションで表示は続ける
    motion
      ?.then((animation) => {
        if (!disposed) player.play(animation);
      })
      .catch((error: unknown) => console.error(error));

    // --- 描画ループ ---
    const timer = new THREE.Timer();
    const currentVrm = vrm;
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      // タブ復帰直後などに揺れものが暴れないよう、経過時間に上限を設ける
      const delta = Math.min(timer.getDelta(), 0.05);
      idleMotion.update(timer.getElapsed());
      player.update(delta);
      currentVrm.update(delta);
      controls.update();
      renderer.render(scene, camera);
    });

    return {
      setAutoRotate: (enabled) => {
        controls.autoRotate = enabled;
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
 * VRM のルートや SpringBone はモデル本体より遠い座標を持つことがあるため、
 * 実際に描画されるメッシュだけで範囲を測る。
 */
function measureVisibleBounds(THREE: typeof import('three'), root: Object3D) {
  const bounds = new THREE.Box3();
  root.traverse((object) => {
    const mesh = object as Object3D & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.visible) return;
    bounds.union(new THREE.Box3().expandByObject(mesh, true));
  });
  if (bounds.isEmpty()) bounds.setFromObject(root, true);
  return bounds;
}

function disposeObject(root: Object3D) {
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
