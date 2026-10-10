import type { Group, Mesh, Object3D, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import modelSizes from 'virtual:model-sizes';
import { createIdleMotion, type IdleMotion } from '@/components/vrm/idle-motion';
import { createLightRig, type Lighting } from '@/components/vrm/lighting';
import {
  captureFrame,
  disposeObject,
  loadThreeModules,
  measureVisibleBounds,
  type StageShot,
} from '@/components/vrm/vrm-stage';

/**
 * 何体かのモデルを、同じ縮尺で横に並べて見せる「舞台」（アバターの部屋の「みんなで並ぶ」）。
 * 背丈をくらべるので、遠くから望遠で（遠近がほとんど出ないように）正面から写し、カメラは動かさない。
 * （遠近のまったくないカメラ（OrthographicCamera）だと、MToon の輪郭線が大きく崩れるため）
 * まわすボタンでは、カメラではなく、それぞれの子をその場でまわす
 */
export type LineupModel = {
  id: string;
  modelUrl: string;
  liltoon?: boolean;
  brightness?: number;
};

/** 並べた子の、画面の上での位置（名前と背丈の札を置くため。枠の左上からの CSS のピクセル） */
export type LineupLayout = {
  models: { id: string; x: number; top: number; height: number }[];
  /** 目もりの線（m）と、その高さ */
  rulers: { meters: number; y: number }[];
};

export type LineupStage = {
  showExpression: (name: string, options?: { seconds?: number }) => void;
  /** みんなを、その場で angle（ラジアン、正でモデルから見て右へ＝画面では左を向く）だけまわす */
  orbit: (angle: number) => void;
  front: () => void;
  /** だれかが持っている表情の名前 */
  expressionNames: string[];
  setLighting: (lighting: Lighting, instant?: boolean) => void;
  capture: () => StageShot;
  dispose: () => void;
};

type CreateLineupStageOptions = {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  models: LineupModel[];
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  /** 並べ終わったときと、枠の大きさが変わったときに、札の位置を知らせる */
  onLayout: (layout: LineupLayout) => void;
};

const MAX_PIXEL_RATIO = 2;
/** カメラの画角（度）。小さいほど遠くから写すことになり、遠近が出ない */
const FOV = 6;
/** 頭のてっぺんを測る範囲。頭の骨の真上から、この半径（m）の中だけを見る（しっぽなどを除く） */
const HEAD_RADIUS = 0.2;
/** となりの子とのあいだ（m） */
const GAP = 0.14;
/** 左右の余白（枠の幅に対する割合） */
const SIDE_MARGIN = 0.07;
/** いちばん背の高い子の上にあける余白（名前と背丈の札のぶん。px） */
const LABEL_SPACE = 64;
/**
 * 足元の高さ（枠の下からの px）。展示台（avatar.css の .is-lineup の展示台。
 * 枠の幅の 92%、横 12 : 縦 1、下に 1% はみ出す）の上の面の真ん中あたりに立たせる
 */
const groundFromBottom = (width: number, height: number) =>
  -height * 0.01 + ((width * 0.92) / 12) * 0.55;
/** まわすときの速さ（大きいほど速い） */
const TURN_EASE = 7;
const EXPRESSION_SECONDS = 2.5;
const EXPRESSION_FADE = 0.2;

export async function createLineupStage({
  canvas,
  container,
  models,
  signal,
  onProgress,
  onLayout,
}: CreateLineupStageOptions): Promise<LineupStage> {
  const modules = await loadThreeModules();
  const { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils } = modules;
  signal.throwIfAborted();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100);
  // 明るさの倍率は子ごとに違うが、ライトは1つの舞台で共有するので、平均にする
  const brightness =
    models.reduce((sum, model) => sum + (model.brightness ?? 1), 0) /
    Math.max(1, models.length);
  const lights = createLightRig(THREE, scene, brightness);

  type Placed = {
    id: string;
    vrm: VRM;
    group: Group;
    idle: IdleMotion;
    height: number;
    width: number;
  };
  const placed: Placed[] = [];
  let releaseLilToon: (() => void) | null = null;
  let disposed = false;
  let resizeFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    cancelAnimationFrame(resizeFrame);
    resizeObserver?.disconnect();
    releaseLilToon?.();
    for (const item of placed) disposeObject(item.vrm.scene);
    renderer.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });

  try {
    // lilToon の子がいれば、lilToon の描画部品も読み込む
    const lilToon = models.some((model) => model.liltoon)
      ? await Promise.all([
          import('@mochiya/three-liltoon'),
          import('@mochiya/three-liltoon/vrm'),
        ])
      : null;
    signal.throwIfAborted();
    if (lilToon) releaseLilToon = lilToon[0].enableLilToon(renderer);

    // みんなを同時に読み込む。進み具合は、ファイルの大きさの合計に対する割合
    const loaded = new Map<string, number>();
    const total = models.reduce(
      (sum, model) => sum + ((modelSizes[model.modelUrl] as number) ?? 0),
      0,
    );
    const vrms = await Promise.all(
      models.map(async (model) => {
        const loader = new GLTFLoader();
        if (model.liltoon && lilToon) {
          const { enableLilToonVRM } = lilToon[1];
          loader.register((parser) =>
            enableLilToonVRM(new VRMLoaderPlugin(parser)),
          );
        } else {
          loader.register((parser) => new VRMLoaderPlugin(parser));
        }
        const gltf = await loader.loadAsync(model.modelUrl, (event) => {
          loaded.set(model.modelUrl, event.loaded);
          if (total > 0 && !signal.aborted) {
            const sum = [...loaded.values()].reduce((a, b) => a + b, 0);
            onProgress(Math.min(100, Math.round((sum / total) * 100)));
          }
        });
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) throw new Error('VRM 1.0データを読み込めませんでした');
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrm);
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });
        return vrm;
      }),
    );
    if (signal.aborted) {
      vrms.forEach((vrm) => disposeObject(vrm.scene));
      signal.throwIfAborted();
    }

    // --- 待機ポーズにしてから大きさを測り、左から順に並べる ---
    let cursor = 0;
    vrms.forEach((vrm, i) => {
      const idle = createIdleMotion(vrm);
      idle.update(0);
      vrm.update(0);
      vrm.springBoneManager?.reset();
      vrm.scene.updateMatrixWorld(true);
      const bounds = measureVisibleBounds(THREE, vrm.scene);
      const head = vrm.humanoid.getRawBoneNode('head');
      // 腰の真上を軸に、その場でまわす
      const hips = vrm.humanoid.getRawBoneNode('hips');
      const pivot = hips
        ? hips.getWorldPosition(new THREE.Vector3())
        : bounds.getCenter(new THREE.Vector3());
      const leftWidth = pivot.x - bounds.min.x;
      const rightWidth = bounds.max.x - pivot.x;
      const group = new THREE.Group();
      vrm.scene.position.set(-pivot.x, 0, -pivot.z);
      group.add(vrm.scene);
      // 画面の左から右へ並べる（モデルの右手側が画面の左なので、-X 側の幅を先に足す）
      cursor += rightWidth;
      group.position.x = cursor;
      cursor += leftWidth + GAP;
      scene.add(group);
      placed.push({
        id: models[i].id,
        vrm,
        group,
        idle,
        height: Math.max(
          head
            ? measureHeadTop(
                THREE,
                vrm.scene,
                head.getWorldPosition(new THREE.Vector3()),
              )
            : bounds.max.y,
          0.01,
        ),
        width: leftWidth + rightWidth,
      });
    });
    // まんなかを原点に
    const totalWidth = cursor - GAP;
    for (const item of placed) item.group.position.x -= totalWidth / 2;
    const tallest = Math.max(...placed.map((item) => item.height));

    // --- 枠の大きさに合わせて、カメラの写す範囲を決める ---
    const view = { width: 1, height: 1, scale: 1, ground: 0 };
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      const ground = groundFromBottom(width, height);
      const scale = Math.min(
        (height - ground - LABEL_SPACE) / tallest,
        (width * (1 - SIDE_MARGIN * 2)) / totalWidth,
      );
      Object.assign(view, { width, height, scale, ground });
      // 足元（y = 0）の面で、枠の高さが height / scale（m）になる距離から、真正面を写す
      const visible = height / scale;
      const distance = visible / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
      camera.aspect = width / height;
      camera.near = Math.max(0.1, distance - 10);
      camera.far = distance + 10;
      camera.position.set(0, visible / 2 - ground / scale, distance);
      camera.lookAt(0, camera.position.y, 0);
      camera.updateProjectionMatrix();
      const toY = (meters: number) => height - ground - meters * scale;
      const rulers: LineupLayout['rulers'] = [];
      for (let meters = 0.5; meters < tallest + 0.25; meters += 0.5) {
        rulers.push({ meters, y: toY(meters) });
      }
      onLayout({
        models: placed.map((item) => ({
          id: item.id,
          x: width / 2 + item.group.position.x * scale,
          top: toY(item.height),
          height: item.height,
        })),
        rulers,
      });
    };
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    resizeObserver.observe(container);
    resize();

    // --- まわす ---
    let turnGoal = 0;

    // --- 表情（持っている子だけ） ---
    const expressionNames = [
      ...new Set(
        placed.flatMap((item) =>
          item.vrm.expressionManager
            ? Object.keys(item.vrm.expressionManager.expressionMap)
            : [],
        ),
      ),
    ];
    // いま（か、さっきまで）見せている表情。0 へもどし終えるまで値を書き続ける
    let lastExpression: string | null = null;
    let shownUntil = -1;
    let weight = 0;

    const timer = new THREE.Timer();
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const target = elapsed < shownUntil ? 1 : 0;
      weight =
        target > weight
          ? Math.min(1, weight + delta / EXPRESSION_FADE)
          : Math.max(0, weight - delta / EXPRESSION_FADE);
      const k = 1 - Math.exp(-delta * TURN_EASE);
      placed.forEach((item, i) => {
        // 子ごとに少しずらして、そろって揺れないようにする
        item.idle.update(elapsed + i * 1.7);
        const manager = item.vrm.expressionManager;
        if (manager && lastExpression) {
          manager.setValue(lastExpression, weight);
        }
        item.group.rotation.y += (turnGoal - item.group.rotation.y) * k;
        item.vrm.update(delta);
      });
      lights.update(delta);
      renderer.render(scene, camera);
    });
    return {
      showExpression: (name, { seconds = EXPRESSION_SECONDS } = {}) => {
        if (!expressionNames.includes(name)) return;
        if (lastExpression && lastExpression !== name) {
          for (const item of placed) {
            item.vrm.expressionManager?.setValue(lastExpression, 0);
          }
          weight = 0;
        }
        lastExpression = name;
        shownUntil = timer.getElapsed() + seconds;
      },
      orbit: (angle) => {
        turnGoal -= angle;
      },
      front: () => {
        // いちばん近い「正面」へ
        turnGoal = Math.round(turnGoal / (Math.PI * 2)) * Math.PI * 2;
      },
      expressionNames,
      setLighting: lights.set,
      capture: () => {
        // 上のあきすぎた空は写さない（いちばん背の高い子の少し上から）
        const top = Math.max(
          0,
          view.height - view.ground - tallest * view.scale * 1.15,
        );
        const { image, ratio } = captureFrame(
          renderer,
          () => renderer.render(scene, camera),
          { x: 0, y: top, width: view.width, height: view.height - top },
        );
        return {
          image,
          frame: {
            left: 0,
            top: -top * ratio,
            width: image.width,
            height: view.height * ratio,
          },
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * 頭のてっぺんの高さ。頭の骨の真上の、半径 HEAD_RADIUS の円柱の中にある頂点のうち、いちばん高いもの
 * （耳や帽子はふくめ、頭より高く上がるしっぽなどはふくめない）。見つからなければ 0
 */
function measureHeadTop(
  THREE: typeof import('three'),
  root: Object3D,
  headPosition: Vector3,
) {
  let top = 0;
  const vertex = new THREE.Vector3();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    for (let i = 0; i < position.count; i += 1) {
      // 骨で動かしたあとの位置（Mesh.getVertexPosition が揺れもの・表情もふくめて計算する）
      mesh.getVertexPosition(i, vertex);
      vertex.applyMatrix4(mesh.matrixWorld);
      if (vertex.y <= top) continue;
      if (
        Math.hypot(vertex.x - headPosition.x, vertex.z - headPosition.z) <=
        HEAD_RADIUS
      ) {
        top = vertex.y;
      }
    }
  });
  return top || headPosition.y;
}
