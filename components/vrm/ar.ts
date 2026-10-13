import type {
  Group,
  Material,
  Object3D,
  Scene,
  WebGLRenderer,
} from 'three';
import { createARGestures, type ARGrabbable } from '@/components/vrm/ar-gestures';
import { createARHeightMark } from '@/components/vrm/ar-height-mark';
import { createAROcclusion } from '@/components/vrm/ar-occlusion';
import { createGroundShadow } from '@/components/vrm/ground-shadow';

/**
 * スマホのカメラ越しに、アバターを机や床の上に立たせる（AR）。
 *
 *   webxr     Android の Chrome など。いまの見た目（MToon / lilToon）・踊り・揺れものごと、
 *             このページの中でカメラの映像に重ねて描く。床を映して、置きたいところをタップする
 *   quicklook iPhone・iPad の Safari。モデルを踊りごと USDZ（Apple の AR 用の形式）に書き出して
 *             （components/vrm/usdz.ts）、iOS の「AR クイックルック」で開く。色はテクスチャの基本の色だけになる
 *
 * どちらも使えない画面（パソコンなど）では、AR のボタンを出さない
 */
export type ARMode = 'webxr' | 'quicklook';

/** この画面で使える AR の方法。無ければ null */
export async function detectAR(): Promise<ARMode | null> {
  try {
    const anchor = document.createElement('a');
    if (anchor.relList.supports('ar')) return 'quicklook';
    // iPhone・iPad は、どのブラウザでも AR クイックルックを開ける。ただ、Safari 以外（Chrome や、
    // LINE・X などのアプリの中で開いたページ）では、上の調べ方が「使えない」と答えることがあり、
    // AR のボタンが出なかった
    if (isAppleTouchDevice()) return 'quicklook';
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (xr && (await xr.isSessionSupported('immersive-ar'))) return 'webxr';
  } catch {
    // 調べられないときは、使えないものとして扱う
  }
  return null;
}

/**
 * iPhone・iPad か。iPad の Safari は、パソコン（Mac）と同じ名乗り方をするので、
 * Mac と名乗っていて、指で触れる画面のときも iPad とみなす
 */
function isAppleTouchDevice() {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) return true;
  return /Macintosh/.test(agent) && navigator.maxTouchPoints > 1;
}

// ---------------------------------------------------------------------------
// WebXR（Android など）
// ---------------------------------------------------------------------------

export type ARSession = {
  /** 机の上に置けるよう、小さく（1/4 の大きさに）する */
  setSmall: (small: boolean) => void;
  /**
   * カメラの映像ごと写真を撮れるか。カメラの映像をページから読める（WebXR の camera-access）ブラウザだけ。
   * 読めないときは、写真のボタンを出さない（スマホのスクリーンショットで撮ってもらう）
   */
  canPhoto: boolean;
  /**
   * 手前にある本物の物のうしろに隠れられるか（奥行きを測れる端末だけ。components/vrm/ar-occlusion.ts）。
   * はじめは隠れない（奥行きの地図が粗く、境目がギザギザになることがあるので、ボタンでオンにする）
   */
  canOcclude: boolean;
  setOcclusion: (enabled: boolean) => void;
  /**
   * 子の横に立てる「わたし」の柱（背丈くらべで入れた身長。components/vrm/ar-height-mark.ts）。null で隠す
   */
  setMark: (mark: { label: string; meters: number } | null) => void;
  /** カメラの映像とモデルを1枚にした写真を撮る（次に描くときに撮る）。撮れなければ null */
  photo: () => Promise<HTMLCanvasElement | null>;
  end: () => void;
};

/** AR の写真の大きさの上限（長い辺のピクセル） */
const PHOTO_MAX_SIZE = 2048;

/** カメラの映像を、画面いっぱいの背景として描く（カメラの位置や向きに関係なく、いちばん奥に） */
const BACKGROUND_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
// 写真は、まず光の強さのままの入れ物（linear）に描くので、カメラの映像（もともと sRGB）は、一度もどしておく
const BACKGROUND_FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(map, vUv).rgb;
  gl_FragColor = vec4(pow(color, vec3(2.2)), 1.0);
}
`;

// 光の強さのままの入れ物から、写真の入れ物（sRGB）へ写す。sRGB への直しは、入れ物が自動でする
const COPY_FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
}
`;

/** 小さくしたときの大きさ（本当の背丈に対する割合） */
const SMALL_SCALE = 0.25;

export type ARView = {
  session: ARSession;
  /** 毎フレーム、描く前に呼ぶ（床の位置を調べて、置く場所の輪を動かす） */
  update: (frame: XRFrame | undefined) => void;
};

/**
 * WebXR の AR を始める。押したときの操作の中で（await をはさまずに）呼ぶこと
 * （ブラウザは、押した直後でないとカメラを使わせてくれない）。
 *
 * model はモデルの一番上（vrm.scene）。AR のあいだは、置く場所を決める入れ物に移し、終わったら scene にもどす
 */
export async function startWebXR({
  THREE,
  renderer,
  scene,
  model,
  hips,
  grabbables,
  onScale,
  overlay,
  onPlaced,
  onScaleChange,
  onEnd,
}: {
  THREE: typeof import('three');
  renderer: WebGLRenderer;
  scene: Scene;
  /** 置くもの。みんなで並ぶときは、みんなをまとめた入れ物 */
  model: Object3D;
  /** それぞれの子の腰の骨。足元の影を、腰の真下について行かせる */
  hips: Object3D[];
  /**
   * 指でつかんで動かせる子（components/vrm/ar-gestures.ts）。省略すると、model をまるごと動かす
   * （みんなで並ぶときは、1人ずつ動かせるよう、子ごとに渡す）
   */
  grabbables?: () => ARGrabbable[];
  /**
   * 置く大きさ（1 が本当の大きさ）が変わったとき。揺れものの当たり判定などは、
   * モデルの大きさではなく場面の長さで決まっているので、モデルに合わせて縮めてもらう
   */
  onScale: (scale: number) => void;
  /** カメラの映像の上に重ねる、ボタンなどの入った要素 */
  overlay: HTMLElement;
  onPlaced: () => void;
  /** 置く大きさ（1 が本当の大きさ）が変わったとき（「ちいさく」・2本指） */
  onScaleChange?: (scale: number) => void;
  onEnd: () => void;
}): Promise<ARView> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error('WebXR に対応していません');
  const options = {
    requiredFeatures: ['hit-test'],
    // camera-access: 写真を撮るときに、カメラの映像を読む
    // depth-sensing: 奥行きの地図（手前の本物の物のうしろに隠れる。components/vrm/ar-occlusion.ts）
    optionalFeatures: ['dom-overlay', 'camera-access', 'depth-sensing'],
    domOverlay: { root: overlay },
    depthSensing: {
      usagePreference: ['cpu-optimized'],
      dataFormatPreference: ['luminance-alpha', 'float32'],
    },
  } as XRSessionInit;
  // 奥行きの設定を知らないブラウザでは、設定を読むところで断られることがあるので、そのときは奥行きなしで始め直す
  // （断られるのは、始める前の、書き方を調べるところなので、押した操作の中のまま、すぐ始め直せる）
  const session = await xr.requestSession('immersive-ar', options).catch(() => {
    const { depthSensing: _, ...rest } = options as XRSessionInit & { depthSensing?: unknown };
    return xr.requestSession('immersive-ar', {
      ...rest,
      optionalFeatures: ['dom-overlay', 'camera-access'],
    });
  });

  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  // 置く場所の入れ物。置くまでは見せない
  const anchor: Group = new THREE.Group();
  anchor.visible = false;
  scene.add(anchor);
  const parent = model.parent;
  anchor.add(model);

  // 床に落ちる影（components/vrm/ground-shadow.ts）
  const ground = createGroundShadow({ THREE, renderer, parent: anchor, model, hips });

  // 床の上の、置く場所の輪
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.13, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // 写真のときだけ出す、カメラの映像の背景
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: BACKGROUND_VERTEX,
      fragmentShader: BACKGROUND_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }),
  );
  background.frustumCulled = false;
  background.renderOrder = -1000;
  background.visible = false;
  scene.add(background);
  // 写真の入れ物へ写すための、画面いっぱいの板
  const copyScene = new THREE.Scene();
  const copyQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: BACKGROUND_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }),
  );
  copyQuad.frustumCulled = false;
  copyScene.add(copyQuad);
  const copyCamera = new THREE.Camera();
  // 光の強さのままの入れ物は、なめらかに残せるよう小数で（使えない端末では 8 ビット）
  const floatColor = renderer.extensions.has('EXT_color_buffer_float');
  const photoCamera = new THREE.PerspectiveCamera();
  photoCamera.matrixAutoUpdate = false;
  photoCamera.matrixWorldAutoUpdate = false;
  const enabledFeatures =
    (session as XRSession & { enabledFeatures?: string[] }).enabledFeatures ?? [];
  const canPhoto = enabledFeatures.includes('camera-access');
  let photoRequest: ((photo: HTMLCanvasElement | null) => void) | null = null;

  /**
   * いまのカメラの映像の上に、モデルを描いて写真にする。
   * AR の画面（カメラの映像はブラウザの外で重ねられる）はページから読めないので、
   * 写真用の入れ物に、カメラの映像とモデルを描き直す。
   *
   * sRGB の入れ物に直接描くと、lilToon は自分で sRGB に直し、入れ物もまた直すので、色が二重に明るく
   * （薄く）なってしまう。なので、まず光の強さのままの入れ物（linear）に描き、そこから sRGB の入れ物へ写す
   */
  const capture = (frame: XRFrame): HTMLCanvasElement | null => {
    const space = renderer.xr.getReferenceSpace();
    const view = space ? frame.getViewerPose(space)?.views[0] : undefined;
    // XRView.camera は、カメラの映像を読めるときだけある（型の定義にはまだ無い）
    const xrCamera = (view as (XRView & { camera?: { width: number; height: number } }) | undefined)
      ?.camera;
    const texture = xrCamera
      ? renderer.xr.getCameraTexture(
          xrCamera as unknown as Parameters<typeof renderer.xr.getCameraTexture>[0],
        )
      : null;
    if (!view || !xrCamera || !texture) return null;
    const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(xrCamera.width, xrCamera.height));
    const width = Math.round(xrCamera.width * scale);
    const height = Math.round(xrCamera.height * scale);
    // 写すカメラは、スマホのカメラと同じ位置・向き・画角
    photoCamera.projectionMatrix.fromArray(view.projectionMatrix);
    photoCamera.projectionMatrixInverse.copy(photoCamera.projectionMatrix).invert();
    photoCamera.matrixWorld.fromArray(view.transform.matrix);
    photoCamera.matrixWorldInverse.copy(photoCamera.matrixWorld).invert();
    background.material.uniforms.map.value = texture;
    background.visible = true;
    const reticleShown = reticle.visible;
    reticle.visible = false;
    const linear = new THREE.WebGLRenderTarget(width, height, {
      type: floatColor ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: 4,
    });
    const target = new THREE.WebGLRenderTarget(width, height, {
      colorSpace: THREE.SRGBColorSpace,
    });
    const previous = renderer.getRenderTarget();
    // AR の描き方（スマホのカメラで描く）をいったん止めて、写真用のカメラで描く
    renderer.xr.enabled = false;
    renderer.setRenderTarget(linear);
    renderer.clear();
    ground.setPhoto(true);
    occlusion.setPhoto(true);
    renderer.render(scene, photoCamera);
    ground.setPhoto(false);
    occlusion.setPhoto(false);
    copyQuad.material.uniforms.map.value = linear.texture;
    renderer.setRenderTarget(target);
    renderer.render(copyScene, copyCamera);
    renderer.xr.enabled = true;
    renderer.setRenderTarget(previous);
    linear.dispose();
    background.visible = false;
    reticle.visible = reticleShown;
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    target.dispose();
    // 読んだ画素は下の行から並んでいるので、上下を返して写真にする
    const photo = document.createElement('canvas');
    photo.width = width;
    photo.height = height;
    const context = photo.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }
    context.putImageData(image, 0, 0);
    return photo;
  };

  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitTestSource = await session.requestHitTestSource?.({
    space: viewerSpace,
  });

  // ボタンや、写真・説明の画面（data-ar-block）を押したときは、置く操作（select）にしない
  const keepButtons = (event: Event) => {
    if ((event.target as Element | null)?.closest('button, [data-ar-block]')) {
      event.preventDefault();
    }
  };
  overlay.addEventListener('beforexrselect', keepButtons);

  // 置く大きさ（1 が本当の大きさ）。影を写す範囲と揺れものも合わせる
  const applyScale = (scale: number) => {
    anchor.scale.setScalar(scale);
    ground.setScale(scale);
    onScale(scale);
    onScaleChange?.(scale);
  };

  // 指でつかんで動かす・2本指で大きさを変える・ひねってまわす
  const modelPosition = new THREE.Vector3();
  // 手前の本物の物のうしろに隠れる（奥行きを測れる端末だけ）
  const occlusion = createAROcclusion({ THREE, renderer, scene, session });

  // 「わたし」の柱。はじめて置いたときに、子の右どなりに立てる
  const mark = createARHeightMark({ THREE, parent: anchor, model });
  let markShown = false;
  let markPlaced = false;
  const markPosition = new THREE.Vector3();
  const markGrabbable: ARGrabbable = {
    object: mark.object,
    moveTo: (x, z) => {
      markPosition.set(x, 0, z);
      anchor.worldToLocal(markPosition);
      mark.moveTo(markPosition.x, markPosition.z);
    },
    // 柱は丸いので、まわしても変わらない
    turn: () => {},
  };

  const baseGrabbables =
    grabbables ??
    (() => [
        {
          object: model,
          // model をまるごと動かす（model の足元が、そこへ来るように、置く場所の入れ物を動かす）
          moveTo: (x, z) => {
            model.getWorldPosition(modelPosition);
            anchor.position.x += x - modelPosition.x;
            anchor.position.z += z - modelPosition.z;
          },
          turn: (angle) => {
            anchor.rotation.y += angle;
          },
        },
      ]);
  const gestures = createARGestures({
    THREE,
    anchor,
    overlay,
    grabbables: () => (markShown ? [...baseGrabbables(), markGrabbable] : baseGrabbables()),
    getScale: () => anchor.scale.x,
    setScale: applyScale,
  });
  const onSelectStart = (event: XRInputSourceEvent) => gestures.start(event.inputSource);
  const onSelectEnd = (event: XRInputSourceEvent) => gestures.end(event.inputSource);
  session.addEventListener('selectstart', onSelectStart);
  session.addEventListener('selectend', onSelectEnd);

  const cameraPosition = new THREE.Vector3();
  const onSelect = (event: XRInputSourceEvent) => {
    // 子をつかんで動かした・さわったタップでは、置き直さない
    if (gestures.used(event.inputSource)) return;
    if (!reticle.visible) return;
    anchor.position.setFromMatrixPosition(reticle.matrix);
    // 見ている人のほうを向けて置く
    renderer.xr.getCamera().getWorldPosition(cameraPosition);
    anchor.rotation.set(
      0,
      Math.atan2(
        cameraPosition.x - anchor.position.x,
        cameraPosition.z - anchor.position.z,
      ),
      0,
    );
    if (!anchor.visible) {
      anchor.visible = true;
      if (!markPlaced) {
        mark.reset();
        markPlaced = true;
      }
      onPlaced();
    }
  };
  session.addEventListener('select', onSelect);

  let ended = false;
  session.addEventListener('end', () => {
    ended = true;
    hitTestSource?.cancel();
    overlay.removeEventListener('beforexrselect', keepButtons);
    session.removeEventListener('select', onSelect);
    session.removeEventListener('selectstart', onSelectStart);
    session.removeEventListener('selectend', onSelectEnd);
    gestures.dispose();
    occlusion.dispose();
    mark.dispose();
    // モデルを元の場所へもどす
    anchor.remove(model);
    parent?.add(model);
    scene.remove(anchor, reticle, background);
    reticle.geometry.dispose();
    (reticle.material as Material).dispose();
    background.geometry.dispose();
    (background.material as Material).dispose();
    ground.dispose();
    onScale(1);
    copyQuad.geometry.dispose();
    (copyQuad.material as Material).dispose();
    photoRequest?.(null);
    photoRequest = null;
    renderer.xr.enabled = false;
    onEnd();
  });

  return {
    session: {
      setSmall: (small) => applyScale(small ? SMALL_SCALE : 1),
      canPhoto,
      canOcclude: occlusion.available,
      setOcclusion: occlusion.setEnabled,
      setMark: (next) => {
        markShown = !!next;
        mark.set(next);
      },
      photo: () =>
        new Promise((resolve) => {
          if (!canPhoto || ended) {
            resolve(null);
            return;
          }
          photoRequest = resolve;
        }),
      end: () => {
        if (!ended) void session.end();
      },
    },
    update: (frame) => {
      if (!frame || ended) return;
      if (anchor.visible) {
        ground.update();
        mark.update(anchor.scale.x);
      }
      if (photoRequest) {
        const resolve = photoRequest;
        photoRequest = null;
        try {
          resolve(capture(frame));
        } catch (error) {
          console.error(error);
          resolve(null);
        }
      }
      if (!hitTestSource) return;
      const space = renderer.xr.getReferenceSpace();
      if (space) {
        gestures.update(frame, space);
        occlusion.update(frame, space);
      }
      const hit = space && frame.getHitTestResults(hitTestSource)[0];
      const pose = hit?.getPose(space!);
      reticle.visible = !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    },
  };
}

// ---------------------------------------------------------------------------
// AR クイックルック（iPhone・iPad）
// ---------------------------------------------------------------------------

/** AR クイックルックの画面の下に出す帯（名前と、押せるボタン） */
export type QuickLookBanner = {
  title: string;
  subtitle?: string;
  /** 帯のボタン。押すと、このページで url を開く */
  action?: { label: string; url: string };
};

/** AR クイックルックのボタンを押したときに、リンクに届く知らせ */
const QUICK_LOOK_BUTTON = '_apple_ar_quicklook_button_tapped';

/** いま開いている AR クイックルックのリンク（帯のボタンの知らせを受けるので、開いているあいだは残す） */
let quickLookLink: HTMLAnchorElement | null = null;

/** USDZ を AR クイックルックで開く（iOS が開いてくれるのは、<a rel="ar"> を押したときだけ） */
export function openQuickLook(blob: Blob, banner?: QuickLookBanner) {
  const url = URL.createObjectURL(blob);
  quickLookLink?.remove();
  const anchor = document.createElement('a');
  quickLookLink = anchor;
  anchor.rel = 'ar';
  anchor.hidden = true;
  // 指でつまんで大きさを変えられるようにし、画面の下に帯を出す（Apple の AR クイックルックの決まり）
  const options: [string, string][] = [['allowsContentScaling', '1']];
  if (banner) {
    options.push(['checkoutTitle', banner.title]);
    if (banner.subtitle) options.push(['checkoutSubtitle', banner.subtitle]);
    if (banner.action) options.push(['callToAction', banner.action.label]);
  }
  anchor.href = `${url}#${options
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`;
  anchor.download = 'avatar.usdz';
  // AR クイックルックのリンクには、画像が1つ入っている必要がある
  anchor.append(document.createElement('img'));
  const action = banner?.action;
  if (action) {
    anchor.addEventListener('message', (event) => {
      if ((event as MessageEvent).data !== QUICK_LOOK_BUTTON) return;
      // 新しいタブで開けなければ、このタブで開く（noopener を付けると、開けても null が返るので、あとで切る）
      const opened = window.open(action.url, '_blank');
      if (opened) opened.opener = null;
      else window.location.assign(action.url);
    });
  }
  document.body.append(anchor);
  anchor.click();
  // 開くのに時間がかかることがあるので、しばらくしてから片付ける
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
