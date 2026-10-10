import type {
  Color,
  Material,
  Mesh,
  Object3D,
  Scene,
  SkeletonHelper,
  Texture,
} from 'three';

/**
 * モデルの「中身を見る」表示（アバターの部屋の「表示」のボタン）。
 *
 *   normal    ふつうの見た目（MToon / lilToon）
 *   wireframe ポリゴンの線だけ（形の作り・密度が分かる）
 *   texture   影もライトもつけず、基本の色とテクスチャだけ（塗り分けが分かる）。
 *             色を MatCap だけでつけている部分は、MatCap のまま
 *   bones     ふつうの見た目の上に、ボーン（骨組み）を線で重ねる
 *
 * 元のマテリアルは覚えておき、normal にもどすときにそのまま差しもどす
 */
export const VIEW_MODES = ['normal', 'wireframe', 'texture', 'bones'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** ワイヤーフレームの線の色（部屋の青の濃い版） */
const WIRE_COLOR = 0x4f79a3;
/** ボーンの線の色（部屋の桃色の濃い版） */
const BONE_COLOR = 0xe2709a;

export type ViewModes = {
  set: (mode: ViewMode) => void;
  dispose: () => void;
};

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
    if (value && (value as Texture).isTexture) return value;
  }
  return null;
}

/** MToon の MatCap のテクスチャ（無ければ null） */
function matcapTexture(material: Material): Texture | null {
  const value = (
    material as Material & {
      uniforms?: Record<string, { value: unknown } | undefined>;
    }
  ).uniforms?.matcapTexture?.value as Texture | undefined;
  return value?.isTexture ? value : null;
}

export function createViewModes(
  THREE: typeof import('three'),
  scene: Scene,
  roots: Object3D[],
): ViewModes {
  // 表示を切りかえるメッシュと、元のマテリアル
  const meshes: { mesh: Mesh; original: Material | Material[] }[] = [];
  for (const root of roots) {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) meshes.push({ mesh, original: mesh.material });
    });
  }

  const wire = new THREE.MeshBasicMaterial({
    color: WIRE_COLOR,
    wireframe: true,
    transparent: true,
    // 線が重なっても形が分かるよう、うすめにする
    opacity: 0.5,
  });
  // テクスチャだけの表示用（元のマテリアルごとに1つ作って使い回す）
  const flat = new Map<Material, Material>();
  const flatOf = (material: Material) => {
    let made = flat.get(material);
    if (!made) {
      const map = baseTexture(material);
      const matcap = matcapTexture(material);
      const common = {
        transparent: material.transparent,
        alphaTest: material.alphaTest,
        side: material.side,
      };
      if (!map && matcap) {
        // 色をすべて MatCap（球にうつした色見本）でつけている部分（髪・服など）は、MatCap のまま見せる
        made = new THREE.MeshMatcapMaterial({ matcap, ...common });
      } else {
        // テクスチャを使わず、色だけで塗っている部分もある。マテリアルの基本の色も掛ける
        const color = (material as Material & { color?: Color }).color;
        made = new THREE.MeshBasicMaterial({
          map,
          color: color ? color.clone() : 0xffffff,
          ...common,
        });
      }
      flat.set(material, made);
    }
    return made;
  };
  // MToon の輪郭線は、同じ形にもう1つ重ねた「輪郭線のマテリアル」（isOutline）で描かれている。
  // ワイヤーフレームとテクスチャだけの表示では、輪郭線の分は描かない
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const isOutline = (material: Material) =>
    (material as Material & { isOutline?: boolean }).isOutline === true;
  const swap = (
    original: Material | Material[],
    make: (material: Material) => Material,
  ) => {
    const one = (material: Material) =>
      isOutline(material) ? hidden : make(material);
    return Array.isArray(original) ? original.map(one) : one(original);
  };

  const skeletons: SkeletonHelper[] = roots.map((root) => {
    const helper = new THREE.SkeletonHelper(root);
    const material = helper.material as Material & {
      color?: { set: (value: number) => void };
      linewidth?: number;
    };
    material.color?.set(BONE_COLOR);
    // モデルの中に埋まっていても見えるよう、いちばん手前に描く
    material.depthTest = false;
    material.transparent = true;
    helper.renderOrder = 999;
    helper.visible = false;
    scene.add(helper);
    return helper;
  });

  return {
    set: (mode) => {
      for (const { mesh, original } of meshes) {
        if (mode === 'wireframe') {
          mesh.material = swap(original, () => wire);
        } else if (mode === 'texture') {
          mesh.material = swap(original, flatOf);
        } else {
          mesh.material = original;
        }
      }
      for (const helper of skeletons) helper.visible = mode === 'bones';
    },
    dispose: () => {
      wire.dispose();
      hidden.dispose();
      for (const material of flat.values()) material.dispose();
      for (const helper of skeletons) {
        scene.remove(helper);
        helper.dispose();
      }
    },
  };
}
