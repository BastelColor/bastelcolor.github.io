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
  nodes?: { mesh?: number }[];
  materials?: unknown[];
  skins?: { joints: number[] }[];
  extensions?: {
    VRMC_vrm?: {
      expressions?: {
        preset?: Record<string, ExpressionDef>;
        custom?: Record<string, ExpressionDef>;
      };
    };
    VRMC_springBone?: { springs?: unknown[] };
  };
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
    triangles,
    materials: gltf.materials?.length ?? 0,
    bones,
    springs: gltf.extensions?.VRMC_springBone?.springs?.length ?? 0,
    expressions,
    fileSize,
  };
}
