import type {
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  Object3D,
  Scene,
  SkinnedMesh,
  Texture,
  WebGLRenderer,
} from 'three';

/**
 * スマホのカメラ越しに、アバターを机や床の上に立たせる（AR）。
 *
 *   webxr     Android の Chrome など。いまの見た目（MToon / lilToon）・踊り・揺れものごと、
 *             このページの中でカメラの映像に重ねて描く。床を映して、置きたいところをタップする
 *   quicklook iPhone・iPad の Safari。いまのポーズのモデルを USDZ（Apple の AR 用の形式）に書き出して、
 *             iOS の「AR クイックルック」で開く。止まったポーズで、色はテクスチャの基本の色だけになる
 *
 * どちらも使えない画面（パソコンなど）では、AR のボタンを出さない
 */
export type ARMode = 'webxr' | 'quicklook';

/** この画面で使える AR の方法。無ければ null */
export async function detectAR(): Promise<ARMode | null> {
  try {
    const anchor = document.createElement('a');
    if (anchor.relList.supports('ar')) return 'quicklook';
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (xr && (await xr.isSessionSupported('immersive-ar'))) return 'webxr';
  } catch {
    // 調べられないときは、使えないものとして扱う
  }
  return null;
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
// 写真は sRGB の入れ物に描く（モデルの色は自動で sRGB に直る）ので、カメラの映像（もともと sRGB）は、一度もどしておく
const BACKGROUND_FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(map, vUv).rgb;
  gl_FragColor = vec4(pow(color, vec3(2.2)), 1.0);
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
  overlay,
  onPlaced,
  onEnd,
}: {
  THREE: typeof import('three');
  renderer: WebGLRenderer;
  scene: Scene;
  model: Object3D;
  /** カメラの映像の上に重ねる、ボタンなどの入った要素 */
  overlay: HTMLElement;
  onPlaced: () => void;
  onEnd: () => void;
}): Promise<ARView> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error('WebXR に対応していません');
  const session = await xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    // camera-access: 写真を撮るときに、カメラの映像を読む
    optionalFeatures: ['dom-overlay', 'camera-access'],
    domOverlay: { root: overlay },
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
   * 写真用の入れ物に、カメラの映像とモデルを描き直す
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
    const target = new THREE.WebGLRenderTarget(width, height, {
      colorSpace: THREE.SRGBColorSpace,
    });
    const previous = renderer.getRenderTarget();
    // AR の描き方（スマホのカメラで描く）をいったん止めて、写真用のカメラで描く
    renderer.xr.enabled = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, photoCamera);
    renderer.xr.enabled = true;
    renderer.setRenderTarget(previous);
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

  // ボタンを押したときは、置く操作（select）にしない
  const keepButtons = (event: Event) => {
    if ((event.target as Element | null)?.closest('button')) {
      event.preventDefault();
    }
  };
  overlay.addEventListener('beforexrselect', keepButtons);

  const cameraPosition = new THREE.Vector3();
  const onSelect = () => {
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
    // モデルを元の場所へもどす
    anchor.remove(model);
    parent?.add(model);
    scene.remove(anchor, reticle, background);
    reticle.geometry.dispose();
    (reticle.material as Material).dispose();
    background.geometry.dispose();
    (background.material as Material).dispose();
    photoRequest?.(null);
    photoRequest = null;
    renderer.xr.enabled = false;
    onEnd();
  });

  return {
    session: {
      setSmall: (small) => anchor.scale.setScalar(small ? SMALL_SCALE : 1),
      canPhoto,
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

/** USDZ に入れるテクスチャの大きさの上限（iPhone で開くのに時間がかからないよう、小さめ） */
const USDZ_TEXTURE_SIZE = 1024;

/**
 * いまのポーズのモデルを、USDZ にする。
 * 骨で動かしている形をその場のポーズで固め、マテリアルは、基本の色とテクスチャだけのものに置きかえる
 * （AR クイックルックは MToon / lilToon を描けないため）
 */
export async function exportUsdz(
  THREE: typeof import('three'),
  model: Object3D,
): Promise<Blob> {
  const { USDZExporter } = await import(
    'three/examples/jsm/exporters/USDZExporter.js'
  );
  const baked = bakePose(THREE, model);
  try {
    const data = await new USDZExporter().parseAsync(baked, {
      quickLookCompatible: true,
      maxTextureSize: USDZ_TEXTURE_SIZE,
    });
    return new Blob([data as BlobPart], { type: 'model/vnd.usdz+zip' });
  } finally {
    baked.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    });
  }
}

/** USDZ を AR クイックルックで開く（iOS が開いてくれるのは、<a rel="ar"> を押したときだけ） */
export function openQuickLook(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.rel = 'ar';
  // 指でつまんで大きさを変えられるようにする
  anchor.href = `${url}#allowsContentScaling=1`;
  anchor.download = 'avatar.usdz';
  // AR クイックルックのリンクには、画像が1つ入っている必要がある
  anchor.append(document.createElement('img'));
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 開くのに時間がかかることがあるので、しばらくしてから片付ける
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** マテリアルのいちばん基本の色のテクスチャ（MToon は map、lilToon などは uniform の中） */
function baseTexture(material: Material): Texture | null {
  const withMap = material as Material & { map?: Texture | null };
  if (withMap.map) return withMap.map;
  const uniforms = (
    material as Material & {
      uniforms?: Record<string, { value: unknown } | undefined>;
    }
  ).uniforms;
  if (!uniforms) return null;
  for (const name of ['map', '_MainTex', 'mainTex', 'baseColorTexture']) {
    const value = uniforms[name]?.value as Texture | undefined;
    if (value?.isTexture) return value;
  }
  return null;
}

/** 色を MatCap だけでつけている部分（髪・服など）は、MatCap の真ん中の色で塗る */
function matcapColor(
  THREE: typeof import('three'),
  material: Material,
): Color | null {
  const matcap = (
    material as Material & {
      uniforms?: Record<string, { value: unknown } | undefined>;
    }
  ).uniforms?.matcapTexture?.value as Texture | undefined;
  const image = matcap?.isTexture
    ? (matcap.image as CanvasImageSource | undefined)
    : undefined;
  if (!image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, 8, 8);
  const [r, g, b] = context.getImageData(4, 4, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

/** AR クイックルック用の、基本の色とテクスチャだけのマテリアル（表だけを描く） */
function plainMaterial(THREE: typeof import('three'), material: Material) {
  const map = baseTexture(material);
  const color =
    (!map && matcapColor(THREE, material)) ||
    (material as Material & { color?: Color }).color?.clone() ||
    new THREE.Color(0xffffff);
  return new THREE.MeshStandardMaterial({
    map,
    color,
    roughness: 1,
    metalness: 0,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
  });
}

/**
 * モデルのいまのポーズを、骨で動かさない形にして写し取る（model から見た座標で）。
 * MToon の輪郭線（isOutline のマテリアル）と、見えていないメッシュは入れない。
 * USDZ は「裏も描く」マテリアルに対応していないので、裏も描く部分（髪など）は、裏返した面も足す
 */
function bakePose(THREE: typeof import('three'), model: Object3D) {
  const root = new THREE.Group();
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const skin = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();

  model.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry;
    const skinned = (mesh as SkinnedMesh).isSkinnedMesh
      ? (mesh as SkinnedMesh)
      : null;
    skinned?.skeleton.update();
    const toLocal = new THREE.Matrix4().multiplyMatrices(
      toModel,
      mesh.matrixWorld,
    );
    const count = source.getAttribute('position').count;
    const sourceNormal = source.getAttribute('normal');
    const sourceUv = source.getAttribute('uv');
    const skinIndex = source.getAttribute('skinIndex');
    const skinWeight = source.getAttribute('skinWeight');

    const positions = new Float32Array(count * 3);
    const normals = sourceNormal ? new Float32Array(count * 3) : null;
    // 小さい数の形（KHR_mesh_quantization）で持っている UV も、ふつうの数にもどす
    let uvs: Float32Array | null = null;
    if (sourceUv) {
      uvs = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        uvs[i * 2] = sourceUv.getX(i);
        uvs[i * 2 + 1] = sourceUv.getY(i);
      }
    }
    for (let i = 0; i < count; i++) {
      // 位置: 表情（モーフ）と骨の動きを足したもの
      mesh.getVertexPosition(i, position).applyMatrix4(toLocal);
      position.toArray(positions, i * 3);
      if (!normals || !sourceNormal) continue;
      normal.fromBufferAttribute(sourceNormal, i);
      if (skinned && skinIndex && skinWeight) {
        // 向き: 骨ごとの動きを重みで混ぜた回転を掛ける
        skin.makeScale(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const weight = skinWeight.getComponent(i, k);
          if (weight === 0) continue;
          const bone = skinIndex.getComponent(i, k);
          part
            .multiplyMatrices(
              skinned.skeleton.bones[bone].matrixWorld,
              skinned.skeleton.boneInverses[bone],
            )
            .multiplyScalar(weight);
          for (let e = 0; e < 16; e++) skin.elements[e] += part.elements[e];
        }
        skin.premultiply(skinned.bindMatrixInverse).multiply(skinned.bindMatrix);
        normal.applyMatrix3(normalMatrix.getNormalMatrix(skin));
      }
      normal.applyMatrix3(normalMatrix.getNormalMatrix(toLocal)).normalize();
      normal.toArray(normals, i * 3);
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const groups =
      source.groups.length > 0
        ? source.groups
        : [{ start: 0, count: source.index?.count ?? count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (
        !material ||
        (material as Material & { isOutline?: boolean }).isOutline
      ) {
        continue;
      }
      const indices: number[] = [];
      const end = Math.min(
        group.start + group.count,
        source.index?.count ?? count,
      );
      for (let i = group.start; i < end; i++) {
        indices.push(source.index ? source.index.getX(i) : i);
      }
      const make = (faceNormals: Float32Array | null, faceIndices: number[]) => {
        const geometry: BufferGeometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(positions, 3),
        );
        if (faceNormals) {
          geometry.setAttribute(
            'normal',
            new THREE.BufferAttribute(faceNormals, 3),
          );
        }
        if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(faceIndices);
        root.add(new THREE.Mesh(geometry, plainMaterial(THREE, material)));
      };
      make(normals, indices);
      if (material.side === THREE.DoubleSide) {
        // 裏: 三角形の回る向きを逆にし、向きも反対にする
        const back: number[] = [];
        for (let i = 0; i + 2 < indices.length; i += 3) {
          back.push(indices[i], indices[i + 2], indices[i + 1]);
        }
        make(normals ? normals.map((value) => -value) : null, back);
      }
    }
  });
  return root;
}
