import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const MODULE_ID = 'virtual:model-stats';
const RESOLVED_ID = `\0${MODULE_ID}`;

/** アバターの部屋に出す「モデルの情報」 */
export type ModelStats = {
  /** 三角形の数 */
  triangles: number;
  materials: number;
  /** スキンに使っているボーンの数 */
  bones: number;
  /** 揺れもの（VRM の spring）の数 */
  springs: number;
  /** 中身のある表情の数（口の形・まばたきを含む） */
  expressions: number;
  /** 表示用 VRM のファイルの大きさ（バイト） */
  fileSize: number;
  /** 目の高さ（m）。両目のボーンの高さの平均。目のボーンが無ければ null */
  eyeHeight: number | null;
};

type Gltf = {
  accessors: { count: number }[];
  meshes?: {
    primitives: {
      indices?: number;
      attributes: { POSITION: number };
      mode?: number;
    }[];
  }[];
  nodes?: GltfNode[];
  materials?: unknown[];
  skins?: { joints: number[] }[];
  extensions?: {
    VRMC_vrm?: {
      humanoid?: { humanBones?: Record<string, { node: number }> };
      expressions?: {
        preset?: Record<string, ExpressionDef>;
        custom?: Record<string, ExpressionDef>;
      };
    };
    VRMC_springBone?: { springs?: unknown[] };
  };
};
type GltfNode = {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};
type ExpressionDef = {
  morphTargetBinds?: unknown[];
  materialColorBinds?: unknown[];
  textureTransformBinds?: unknown[];
};

const TRIANGLES = 4;

/**
 * public/models/ の VRM を読んで、ポリゴン数・ボーン数などを数え、
 * `import modelStats from 'virtual:model-stats'` で読めるようにする（URL → ModelStats）。
 * 公開するたびに数え直すので、モデルを差し替えても手で書き直さなくてよい
 */
export function modelStats(): Plugin {
  const modelsDir = path.resolve('public/models');
  return {
    name: 'model-stats',
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const stats: Record<string, ModelStats> = {};
      const names = await readdir(modelsDir).catch(() => []);
      for (const name of names) {
        if (!name.endsWith('.vrm')) continue;
        const file = await readFile(path.join(modelsDir, name));
        stats[`/models/${name}`] = countStats(readGltfJson(file), file.length);
      }
      return `export default ${JSON.stringify(stats)};`;
    },
  };
}

function readGltfJson(glb: Buffer): Gltf {
  const length = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

function countStats(gltf: Gltf, fileSize: number): ModelStats {
  // メッシュを使っているノードごとに数える（同じメッシュを2か所で使えば2回分）
  let triangles = 0;
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const accessor =
        primitive.indices !== undefined
          ? gltf.accessors[primitive.indices]
          : gltf.accessors[primitive.attributes.POSITION];
      triangles += Math.floor(accessor.count / 3);
    }
  }
  const bones = new Set((gltf.skins ?? []).flatMap((skin) => skin.joints)).size;
  const { preset = {}, custom = {} } =
    gltf.extensions?.VRMC_vrm?.expressions ?? {};
  const expressions = [
    ...Object.values(preset),
    ...Object.values(custom),
  ].filter(
    (expression) =>
      (expression.morphTargetBinds?.length ?? 0) +
        (expression.materialColorBinds?.length ?? 0) +
        (expression.textureTransformBinds?.length ?? 0) >
      0,
  ).length;
  return {
    eyeHeight: measureEyeHeight(gltf),
    triangles,
    materials: gltf.materials?.length ?? 0,
    bones,
    springs: gltf.extensions?.VRMC_springBone?.springs?.length ?? 0,
    expressions,
    fileSize,
  };
}

/** 両目のボーンの、いちばん元の形（T ポーズ）での高さの平均 */
function measureEyeHeight(gltf: Gltf) {
  const nodes = gltf.nodes ?? [];
  const bones = gltf.extensions?.VRMC_vrm?.humanoid?.humanBones ?? {};
  const eyes = [bones.leftEye, bones.rightEye].filter(
    (bone): bone is { node: number } => bone !== undefined,
  );
  if (eyes.length === 0) return null;
  const parents = new Map<number, number>();
  nodes.forEach((node, index) =>
    node.children?.forEach((child) => parents.set(child, index)),
  );
  const worldY = (index: number) => {
    let matrix = localMatrix(nodes[index]);
    for (let p = parents.get(index); p !== undefined; p = parents.get(p)) {
      matrix = multiply(localMatrix(nodes[p]), matrix);
    }
    return matrix[13];
  };
  return eyes.reduce((sum, eye) => sum + worldY(eye.node), 0) / eyes.length;
}

/** 列ごとに並んだ 4×4 行列（glTF と同じ並び） */
function localMatrix(node: GltfNode): number[] {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function multiply(a: number[], b: number[]) {
  const result = Array.from({ length: 16 }, () => 0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      }
    }
  }
  return result;
}
