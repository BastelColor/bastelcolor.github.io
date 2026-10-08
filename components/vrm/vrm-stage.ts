import type { Material, Mesh, Object3D, Texture, Vector3 } from 'three';
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
  /** このサイズに合わせて描画解像度を追従させる */
  container: HTMLElement;
  modelUrl: string;
  /** ループ再生する埋め込みモーション。省略時は待機モーションのみ */
  motionId?: MotionId;
  /** 照明の明るさの倍率（既定: 1） */
  brightness?: number;
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
  modelUrl,
  motionId,
  brightness = 1,
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
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

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

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // --- 後片付け（何度呼ばれても1回だけ実行） ---
  let vrm: VRM | null = null;
  let motionPlayer: MotionPlayer | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
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
    loader.register((parser) => new VRMLoaderPlugin(parser));
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
    const center = bounds.getCenter(new THREE.Vector3());
    const modelHeight = Math.max(size.y, 0.01);
    // くるっと回ったときに横へはみ出す幅（うしろに伸びたしっぽなども含む）
    const turnRadius = measureTurnRadius(THREE, vrm.scene, center);

    controls.minDistance = modelHeight * 0.45;
    controls.maxDistance = modelHeight * 4;
    controls.maxPolarAngle = Math.PI * 0.72;

    const resetView = () => {
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      // 正面の幅ではなく、どの向きに回っても収まる幅（turnRadius の2倍）で合わせる。
      // 正面だけで合わせると、回ったときに大きなしっぽが画面の端で切れる
      const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = turnRadius / Math.tan(horizontalFov / 2);
      // 横は、モーション中に体の向きが変わってしっぽが振れるぶんの余白を多めにとる。
      // （Quiple のしっぽは背丈より長く、真横を向く一瞬は端に触れることがある。
      //   それも収めようとすると体がとても小さくなるので、ここで釣り合いをとっている）
      const distance =
        Math.max(distanceForHeight * 1.06, distanceForWidth * 1.18) +
        Math.min(turnRadius, size.z) * 0.5;

      camera.near = Math.max(distance / 100, 0.001);
      camera.far = Math.max(distance * 10, distance + size.z * 4);
      camera.position.set(center.x, center.y, center.z + distance);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    };
    resetView();

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

/**
 * 体の中心を通る縦の軸から、いちばん遠い頂点までの水平な距離。
 * モデルが縦の軸で回ったときに、横へはみ出す幅の半分になる
 */
function measureTurnRadius(
  THREE: typeof import('three'),
  root: Object3D,
  center: Vector3,
) {
  const vertex = new THREE.Vector3();
  let radius = 0;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      // スキンや表情で動いたあとの位置（Box3.expandByObject と同じ方法）
      mesh.getVertexPosition(i, vertex);
      vertex.applyMatrix4(mesh.matrixWorld);
      radius = Math.max(
        radius,
        Math.hypot(vertex.x - center.x, vertex.z - center.z),
      );
    }
  });
  return Math.max(radius, 0.01);
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
