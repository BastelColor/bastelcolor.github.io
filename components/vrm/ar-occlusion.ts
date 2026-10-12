import type {
  DataTexture,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
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

const VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = `
uniform sampler2D depthMap;
uniform mat4 uvTransform;
uniform float rawToMeters;
uniform float isFloat;
uniform vec4 viewportRect;
uniform vec2 projection;
uniform float bias;
uniform float biasPerMeter;

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
  vec4 texel = texture2D(depthMap, uv);
  // 2 バイトの整数（下・上の順）か、小数
  float raw = isFloat > 0.5 ? texel.r : texel.r * 255.0 + texel.g * 255.0 * 256.0;
  float meters = raw * rawToMeters;
  if (meters <= 0.0) {
    // 測れなかったところは、いちばん奥（隠さない）
    gl_FragDepth = 1.0;
    return;
  }
  meters += bias + meters * biasPerMeter;
  // カメラの前 meters m の点の、描画の奥行き（0〜1）
  float ndc = (projection.x * -meters + projection.y) / meters;
  gl_FragDepth = clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
}
`;

export function createAROcclusion({
  THREE,
  scene,
  session,
}: {
  THREE: typeof import('three');
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

  let texture: DataTexture | null = null;
  const uvTransform: Matrix4 = new THREE.Matrix4();
  const viewport: Vector4 = new THREE.Vector4();
  const material: ShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      depthMap: { value: null },
      uvTransform: { value: uvTransform },
      rawToMeters: { value: 0 },
      isFloat: { value: isFloat ? 1 : 0 },
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
  mesh.onBeforeRender = (renderer: WebGLRenderer, _scene, camera) => {
    renderer.getCurrentViewport(viewport);
    material.uniforms.viewportRect.value.copy(viewport);
    const e = camera.projectionMatrix.elements;
    material.uniforms.projection.value.set(e[10], e[14]);
  };
  scene.add(mesh);

  let enabled = true;
  let hasDepth = false;

  return {
    available: true,
    setEnabled: (next) => {
      enabled = next;
      mesh.visible = enabled && hasDepth;
    },
    update: (frame, space) => {
      const view = frame.getViewerPose(space)?.views[0];
      const depth = view
        ? (
            frame as XRFrame & {
              getDepthInformation?: (view: XRView) => {
                width: number;
                height: number;
                data: ArrayBuffer;
                rawValueToMeters: number;
                normDepthBufferFromNormView: { matrix: Float32Array };
              } | null;
            }
          ).getDepthInformation?.(view)
        : null;
      hasDepth = !!depth;
      mesh.visible = enabled && hasDepth;
      if (!depth) return;
      // 奥行きの地図を、画像として GPU へ（大きさが変わったら作り直す）
      if (!texture || texture.image.width !== depth.width || texture.image.height !== depth.height) {
        texture?.dispose();
        texture = isFloat
          ? new THREE.DataTexture(new Float32Array(depth.width * depth.height), depth.width, depth.height, THREE.RedFormat, THREE.FloatType)
          : new THREE.DataTexture(new Uint8Array(depth.width * depth.height * 2), depth.width, depth.height, THREE.RGFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        material.uniforms.depthMap.value = texture;
      }
      const data = texture.image.data as Float32Array | Uint8Array;
      data.set(isFloat ? new Float32Array(depth.data) : new Uint8Array(depth.data));
      texture.needsUpdate = true;
      material.uniforms.rawToMeters.value = depth.rawValueToMeters;
      uvTransform.fromArray(depth.normDepthBufferFromNormView.matrix);
    },
    dispose: () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
