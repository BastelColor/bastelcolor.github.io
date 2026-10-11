import type {
  Color,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';

/**
 * iPhone・iPad の「AR クイックルック」用に、モデルを USDZ（Apple の AR 用の形式）にする。
 *
 * 骨（UsdSkel）ごと書き出し、踊りを1周ぶん、こま送りで骨の動きとして記録して入れる
 * （AR クイックルックは、入っている動きをくり返し再生する）。揺れもの（髪・しっぽ）も、
 * 記録したときに計算した動きのまま入る。
 * three.js の USDZExporter は骨で動くモデルを書き出せないので、ここで USD の文章を組み立てる。
 *
 * マテリアルは、基本の色とテクスチャだけ（AR クイックルックは MToon / lilToon を描けないため）。
 * 色の大半は光る色（emissive）にして、まわりの光によるリアルな陰影を弱め、アニメ塗りに近づける。
 * 表情（モーフ）は入れない
 */

/** 書き出す動き。null なら、いまのポーズで止まったモデルにする */
export type UsdzMotion = {
  /** 記録する長さ（秒）。踊りの1周 */
  duration: number;
  /** 動きを dt 秒だけ進める（描かずに、骨と揺れものだけを動かす） */
  step: (dt: number) => void;
};

/** 動きを記録する、1 秒あたりのこま数 */
const FPS = 30;
/**
 * 色の割合。光る色（まわりの光で変わらない）と、まわりの光で陰る色。
 * 光る色を多くするほど、アニメ塗りのように平らに見える（足して 1 くらいで、元の明るさ）
 */
const GLOW_SHARE = 0.75;
const SHADED_SHARE = 0.3;
/** USDZ に入れるテクスチャの大きさの上限（iPhone で開くのに時間がかからないよう、小さめ） */
const TEXTURE_SIZE = 1024;

type Three = typeof import('three');

/** 書き出す面のまとまり（マテリアルごと） */
type Group = { start: number; count: number; material: Material };

export async function exportUsdz(
  THREE: Three,
  model: Object3D,
  motion: UsdzMotion | null,
): Promise<Blob> {
  const { strToU8, zipSync } = await import(
    'three/examples/jsm/libs/fflate.module.js'
  );
  model.updateMatrixWorld(true);
  const modelInverse = model.matrixWorld.clone().invert();

  // --- 書き出すメッシュ（見えているもの。MToon の輪郭線は入れない） ---
  const parts: { mesh: Mesh; groups: Group[] }[] = [];
  model.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const indexCount =
      mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
    const sourceGroups =
      mesh.geometry.groups.length > 0
        ? mesh.geometry.groups
        : [{ start: 0, count: indexCount, materialIndex: 0 }];
    const groups = sourceGroups.flatMap((group): Group[] => {
      const material = materials[group.materialIndex ?? 0];
      if (!material || (material as Material & { isOutline?: boolean }).isOutline) {
        return [];
      }
      return [
        {
          start: group.start,
          count: Math.min(group.count, indexCount - group.start),
          material,
        },
      ];
    });
    if (groups.length > 0) parts.push({ mesh, groups });
  });

  // --- 骨（関節）。メッシュを動かす骨と、その親をすべて、親が先に来る順に並べる ---
  const jointSet = new Set<Object3D>();
  const addChain = (node: Object3D | null) => {
    for (let n = node; n && n !== model; n = n.parent) jointSet.add(n);
  };
  for (const { mesh } of parts) {
    const skinned = mesh as SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.bones.forEach(addChain);
    // 骨の子として付いているだけのメッシュは、その親といっしょに動かす
    else addChain(mesh.parent);
  }
  const joints: Object3D[] = [];
  model.traverse((object) => {
    if (jointSet.has(object)) joints.push(object);
  });
  const jointIndex = new Map(joints.map((joint, i) => [joint, i]));
  const jointPaths: string[] = [];
  joints.forEach((joint, i) => {
    const parent = joint.parent ? jointIndex.get(joint.parent) : undefined;
    jointPaths.push(parent === undefined ? `j${i}` : `${jointPaths[parent]}/j${i}`);
  });

  // 関節の動きは、大きさを抜いて、位置と回転だけで書く。VRM は骨の一番上（Armature）が 100 倍などの
  // 大きさを持つことがあり、関節の大きさをうまく扱えない再生側があるため。
  // 抜いた大きさは、骨を付けたときの位置（bindTransforms）の側で割っておくので、形は変わらない
  const decomposed = {
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
  };
  const unit = new THREE.Vector3(1, 1, 1);
  const rigid = (value: Matrix4) => {
    value.decompose(decomposed.position, decomposed.rotation, decomposed.scale);
    return value.compose(decomposed.position, decomposed.rotation, unit);
  };
  // いまの、モデルから見た関節の位置（大きさなし）
  const modelSpace = (joint: Object3D) =>
    rigid(new THREE.Matrix4().multiplyMatrices(modelInverse, joint.matrixWorld));
  // 骨を付けたときの位置（bindTransforms）。骨で動くメッシュは、付けたときの形が基準になる
  const binds: (Matrix4 | null)[] = joints.map(() => null);
  for (const { mesh } of parts) {
    const skinned = mesh as SkinnedMesh;
    if (!skinned.isSkinnedMesh) continue;
    skinned.skeleton.bones.forEach((bone, i) => {
      const k = jointIndex.get(bone)!;
      const bind = modelInverse
        .clone()
        .multiply(skinned.skeleton.boneInverses[i].clone().invert());
      if (!binds[k]) binds[k] = bind;
      else if (!nearlyEqual(binds[k]!, bind)) {
        console.warn('USDZ: 骨の基準の位置が、メッシュによって違います', bone.name);
      }
    });
  }
  // 動きの側で抜く大きさ（いまの、モデルから見た関節の大きさ。踊っても変わらない）で割る
  const bindTransforms = joints.map((joint, i) => {
    const full = new THREE.Matrix4().multiplyMatrices(modelInverse, joint.matrixWorld);
    full.decompose(decomposed.position, decomposed.rotation, decomposed.scale);
    const { x, y, z } = decomposed.scale;
    return (binds[i] ?? full).clone().multiply(new THREE.Matrix4().makeScale(1 / x, 1 / y, 1 / z));
  });

  // --- メッシュの形（モデルから見た座標で、骨を付けたときの形） ---
  const materialIds = new Map<Material, number>();
  // モデル全体の範囲（いちばん上の SkelRoot に書く）
  const extent = new THREE.Box3();
  const meshTexts = parts.map(({ mesh, groups }, partIndex) => {
    const skinned = (mesh as SkinnedMesh).isSkinnedMesh
      ? (mesh as SkinnedMesh)
      : null;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const sourceNormal = geometry.getAttribute('normal');
    const sourceUv = geometry.getAttribute('uv');
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    const index = geometry.index;
    const indexAt = (i: number) => (index ? index.getX(i) : i);

    // 骨で動くメッシュは、骨を付けたときの形。骨の子のメッシュは、いまの形を親の骨の基準の位置へもどす
    let toModel: Matrix4;
    let rigidJoint = -1;
    if (skinned) {
      toModel = modelInverse.clone().multiply(skinned.bindMatrix);
    } else {
      rigidJoint = mesh.parent ? (jointIndex.get(mesh.parent) ?? -1) : -1;
      toModel = modelInverse.clone().multiply(mesh.matrixWorld);
      if (rigidJoint >= 0) {
        toModel.premultiply(
          bindTransforms[rigidJoint]
            .clone()
            .multiply(modelSpace(joints[rigidJoint]).invert()),
        );
      }
    }
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(toModel);

    // USDZ は「裏も描く」マテリアルに対応していないので、裏も描く面は、裏返した面と頂点を足す
    const backVertex = new Map<number, number>();
    let vertexCount = position.count;
    for (const group of groups) {
      if (group.material.side !== THREE.DoubleSide) continue;
      for (let i = group.start; i < group.start + group.count; i++) {
        const v = indexAt(i);
        if (!backVertex.has(v)) backVertex.set(v, vertexCount++);
      }
    }

    const points = new Float32Array(vertexCount * 3);
    const normals = sourceNormal ? new Float32Array(vertexCount * 3) : null;
    const uvs = sourceUv ? new Float32Array(vertexCount * 2) : null;
    const jointIndices = new Int32Array(vertexCount * 4);
    const jointWeights = new Float32Array(vertexCount * 4);
    const point = new THREE.Vector3();
    const writeVertex = (source: number, target: number, flip: boolean) => {
      point.fromBufferAttribute(position, source).applyMatrix4(toModel);
      point.toArray(points, target * 3);
      if (normals && sourceNormal) {
        point
          .fromBufferAttribute(sourceNormal, source)
          .applyMatrix3(normalMatrix)
          .normalize();
        if (flip) point.negate();
        point.toArray(normals, target * 3);
      }
      if (uvs && sourceUv) {
        uvs[target * 2] = sourceUv.getX(source);
        uvs[target * 2 + 1] = 1 - sourceUv.getY(source);
      }
      if (skinned && skinIndex && skinWeight) {
        let total = 0;
        for (let k = 0; k < 4; k++) total += skinWeight.getComponent(source, k);
        for (let k = 0; k < 4; k++) {
          const weight = skinWeight.getComponent(source, k);
          const bone = skinned.skeleton.bones[skinIndex.getComponent(source, k)];
          jointIndices[target * 4 + k] = weight > 0 && bone ? jointIndex.get(bone)! : 0;
          jointWeights[target * 4 + k] = total > 0 ? weight / total : 0;
        }
      } else if (rigidJoint >= 0) {
        jointIndices[target * 4] = rigidJoint;
        jointWeights[target * 4] = 1;
      }
    };
    for (let v = 0; v < position.count; v++) writeVertex(v, v, false);
    for (const [source, target] of backVertex) writeVertex(source, target, true);

    // 面と、マテリアルごとの面の番号
    const faces: number[] = [];
    const subsets: { material: number; faces: number[] }[] = [];
    for (const group of groups) {
      const subset: number[] = [];
      const doubleSided = group.material.side === THREE.DoubleSide;
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        const a = indexAt(i);
        const b = indexAt(i + 1);
        const c = indexAt(i + 2);
        subset.push(faces.length / 3);
        faces.push(a, b, c);
        if (doubleSided) {
          subset.push(faces.length / 3);
          faces.push(backVertex.get(a)!, backVertex.get(c)!, backVertex.get(b)!);
        }
      }
      if (!materialIds.has(group.material)) {
        materialIds.set(group.material, materialIds.size);
      }
      subsets.push({ material: materialIds.get(group.material)!, faces: subset });
    }

    const box = new THREE.Box3();
    for (let v = 0; v < vertexCount; v++) {
      box.expandByPoint(point.fromArray(points, v * 3));
    }
    extent.union(box);
    const bound = skinned || rigidJoint >= 0;
    const lines = [
      `    def Mesh "Mesh${partIndex}" (`,
      `        prepend apiSchemas = [${bound ? '"SkelBindingAPI", ' : ''}"MaterialBindingAPI"]`,
      '    )',
      '    {',
      `        float3[] extent = [${vec3(box.min)}, ${vec3(box.max)}]`,
      `        int[] faceVertexCounts = [${Array.from({ length: faces.length / 3 }, () => 3).join(', ')}]`,
      `        int[] faceVertexIndices = [${faces.join(', ')}]`,
      `        point3f[] points = [${tuples(points, 3)}]`,
    ];
    if (normals) {
      lines.push(
        `        normal3f[] normals = [${tuples(normals, 3)}] (`,
        '            interpolation = "vertex"',
        '        )',
      );
    }
    if (uvs) {
      lines.push(
        `        texCoord2f[] primvars:st = [${tuples(uvs, 2)}] (`,
        '            interpolation = "vertex"',
        '        )',
      );
    }
    if (bound) {
      lines.push(
        `        int[] primvars:skel:jointIndices = [${Array.from(jointIndices).join(', ')}] (`,
        '            elementSize = 4',
        '            interpolation = "vertex"',
        '        )',
        `        float[] primvars:skel:jointWeights = [${Array.from(jointWeights, num).join(', ')}] (`,
        '            elementSize = 4',
        '            interpolation = "vertex"',
        '        )',
        // 関節の並びと、形の基準の位置も、メッシュに書く（Apple のお手本と同じ）
        `        uniform token[] skel:joints = [${jointPaths.map((path) => `"${path}"`).join(', ')}]`,
        `        matrix4d primvars:skel:geomBindTransform = ${matrix(new THREE.Matrix4())}`,
        '        rel skel:skeleton = </Avatar/Skeleton>',
      );
    }
    lines.push('        uniform token subdivisionScheme = "none"');
    // 面はどれも、ちょうど1つのマテリアルの組に入る
    lines.push('        uniform token subsetFamily:materialBind:familyType = "partition"');
    subsets.forEach((subset, i) => {
      lines.push(
        '',
        `        def GeomSubset "Subset${i}" (`,
        '            prepend apiSchemas = ["MaterialBindingAPI"]',
        '        )',
        '        {',
        '            uniform token elementType = "face"',
        '            uniform token familyName = "materialBind"',
        `            int[] indices = [${subset.faces.join(', ')}]`,
        `            rel material:binding = </Avatar/Materials/Material${subset.material}>`,
        '        }',
      );
    });
    lines.push('    }');
    return lines.join('\n');
  });

  // --- 動きの記録。こまごとに、関節の位置・回転（親の関節から見た。大きさはいつも 1） ---
  const frameCount = motion ? Math.max(1, Math.round(motion.duration * FPS)) : 0;
  const parentJoint = joints.map((joint) =>
    joint.parent ? (jointIndex.get(joint.parent) ?? -1) : -1,
  );
  const translations: Vector3[][] = [];
  const rotations: Quaternion[][] = [];
  const scales: Vector3[][] = [];
  const local = new THREE.Matrix4();
  const record = () => {
    model.updateMatrixWorld(true);
    const spaces = joints.map(modelSpace);
    const previous = rotations[rotations.length - 1];
    const frameTranslations: Vector3[] = [];
    const frameRotations: Quaternion[] = [];
    joints.forEach((_, i) => {
      const parent = parentJoint[i];
      local.copy(spaces[i]);
      if (parent >= 0) local.premultiply(spaces[parent].clone().invert());
      const translation = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      local.decompose(translation, rotation, new THREE.Vector3());
      // こまの間を補間したときに、遠回りしないよう、前のこまと同じ向きの符号にそろえる
      if (previous && previous[i].dot(rotation) < 0) {
        rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
      }
      frameTranslations.push(translation);
      frameRotations.push(rotation);
    });
    translations.push(frameTranslations);
    rotations.push(frameRotations);
    scales.push(joints.map(() => unit));
  };
  record();
  if (motion) {
    const dt = motion.duration / frameCount;
    for (let frame = 1; frame <= frameCount; frame++) {
      motion.step(dt);
      record();
    }
  }
  const restTransforms = joints.map((_, i) =>
    new THREE.Matrix4().compose(translations[0][i], rotations[0][i], scales[0][i]),
  );

  const skeleton = [
    '    def Skeleton "Skeleton" (',
    '        prepend apiSchemas = ["SkelBindingAPI"]',
    '    )',
    '    {',
    `        uniform token[] joints = [${jointPaths.map((path) => `"${path}"`).join(', ')}]`,
    `        uniform matrix4d[] bindTransforms = [${bindTransforms.map(matrix).join(', ')}]`,
    `        uniform matrix4d[] restTransforms = [${restTransforms.map(matrix).join(', ')}]`,
  ];
  // 動きは、骨と同じ並びの、すべての関節で書き、Skeleton の中に置いて Skeleton から結ぶ
  // （Apple の AR クイックルックのお手本 toy_drummer と同じ形）
  if (motion) {
    skeleton.push('        rel skel:animationSource = </Avatar/Skeleton/Motion>', '');
    const samples = (
      frames: (Vector3 | Quaternion)[][],
      write: (value: Vector3 & Quaternion) => string,
    ) =>
      frames
        .map(
          (frame, f) =>
            `            ${f}: [${frame.map((value) => write(value as Vector3 & Quaternion)).join(', ')}],`,
        )
        .join('\n');
    skeleton.push(
      '        def SkelAnimation "Motion"',
      '        {',
      `            uniform token[] joints = [${jointPaths.map((path) => `"${path}"`).join(', ')}]`,
      '            float3[] translations.timeSamples = {',
      samples(translations, vec3),
      '            }',
      '            quatf[] rotations.timeSamples = {',
      samples(rotations, quat),
      '            }',
      `            half3[] scales = [${scales[0].map(vec3).join(', ')}]`,
      '        }',
    );
  }
  skeleton.push('    }');

  // --- マテリアルとテクスチャ ---
  const files: Record<string, Uint8Array> = {};
  const textureFiles = new Map<Texture, string>();
  const materialTexts: string[] = [];
  for (const [material, id] of materialIds) {
    const plain = plainMaterial(THREE, material);
    let file = plain.map ? textureFiles.get(plain.map) : undefined;
    if (plain.map && !file) {
      const png = await textureToPng(plain.map);
      if (png) {
        file = `textures/Texture${textureFiles.size}.png`;
        textureFiles.set(plain.map, file);
        files[file] = png;
      }
    }
    const path = `/Avatar/Materials/Material${id}`;
    const color = plain.color;
    const useAlpha = plain.transparent || plain.alphaTest > 0;
    // 色の大半は「光る色」（まわりの光で変わらない）にし、まわりの光で陰る色は少しだけにする。
    // AR クイックルックは本物の物のように光を当てるので、そのままだと、リアルな陰影でこわく見える
    const tinted = (share: number) =>
      `(${num(color.r * share)}, ${num(color.g * share)}, ${num(color.b * share)})`;
    const lines = [
      `        def Material "Material${id}"`,
      '        {',
      `            token outputs:surface.connect = <${path}/Surface.outputs:surface>`,
      '',
      '            def Shader "Surface"',
      '            {',
      '                uniform token info:id = "UsdPreviewSurface"',
      file
        ? `                color3f inputs:diffuseColor.connect = <${path}/Texture.outputs:rgb>`
        : `                color3f inputs:diffuseColor = ${tinted(SHADED_SHARE)}`,
      file
        ? `                color3f inputs:emissiveColor.connect = <${path}/Glow.outputs:rgb>`
        : `                color3f inputs:emissiveColor = ${tinted(GLOW_SHARE)}`,
      // てかり（映りこみ）は出さない
      '                int inputs:useSpecularWorkflow = 1',
      '                color3f inputs:specularColor = (0, 0, 0)',
      '                float inputs:roughness = 1',
      '                float inputs:metallic = 0',
    ];
    if (file && useAlpha) {
      lines.push(`                float inputs:opacity.connect = <${path}/Texture.outputs:a>`);
      if (plain.alphaTest > 0) {
        lines.push(`                float inputs:opacityThreshold = ${num(plain.alphaTest)}`);
      }
    }
    lines.push('                token outputs:surface', '            }');
    if (file) {
      // 同じテクスチャを、陰る色（Texture）と光る色（Glow）に、割合を変えて2回使う
      const textureNode = (name: string, share: number) => [
        '',
        `            def Shader "${name}"`,
        '            {',
        '                uniform token info:id = "UsdUVTexture"',
        `                asset inputs:file = @${file}@`,
        `                float2 inputs:st.connect = <${path}/Reader.outputs:result>`,
        `                float4 inputs:scale = (${num(color.r * share)}, ${num(color.g * share)}, ${num(color.b * share)}, 1)`,
        '                token inputs:sourceColorSpace = "sRGB"',
        '                token inputs:wrapS = "repeat"',
        '                token inputs:wrapT = "repeat"',
        '                float3 outputs:rgb',
        '                float outputs:a',
        '            }',
      ];
      lines.push(
        '',
        '            def Shader "Reader"',
        '            {',
        '                uniform token info:id = "UsdPrimvarReader_float2"',
        '                string inputs:varname = "st"',
        '                float2 outputs:result',
        '            }',
        ...textureNode('Texture', SHADED_SHARE),
        ...textureNode('Glow', GLOW_SHARE),
      );
    }
    lines.push('        }');
    materialTexts.push(lines.join('\n'));
  }

  const timing = motion
    ? [
        '    startTimeCode = 0',
        `    endTimeCode = ${frameCount}`,
        `    timeCodesPerSecond = ${FPS}`,
        `    framesPerSecond = ${FPS}`,
      ]
    : [];
  const usda = [
    '#usda 1.0',
    '(',
    '    defaultPrim = "Avatar"',
    '    metersPerUnit = 1',
    '    upAxis = "Y"',
    ...timing,
    ')',
    '',
    // いちばん上を SkelRoot にし、骨・動き・メッシュ・マテリアルを、すべてその中に置く
    // （Apple のお手本と同じ。いちばん上が Xform だと、動きが再生されない再生側がある）
    'def SkelRoot "Avatar" (',
    '    kind = "component"',
    ')',
    '{',
    `    float3[] extent = [${vec3(extent.min)}, ${vec3(extent.max)}]`,
    '    token preliminary:anchoring:type = "plane"',
    '    token preliminary:planeAnchoring:alignment = "horizontal"',
    '',
    skeleton.join('\n'),
    '',
    meshTexts.join('\n\n'),
    '',
    '    def Scope "Materials"',
    '    {',
    materialTexts.join('\n\n'),
    '    }',
    '}',
    '',
  ].join('\n');

  // USDZ は、圧縮しない zip。中のファイルは 64 バイトの区切りから始める（USDZ の決まり）
  const entries: Record<string, Uint8Array> = {
    'model.usda': strToU8(usda),
    ...files,
  };
  const zipped: Parameters<typeof zipSync>[0] = {};
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    offset += 30 + name.length;
    const extra = 4;
    const pad = (64 - ((offset + extra) % 64)) % 64;
    zipped[name] = [data, { extra: { 12345: new Uint8Array(pad) } }];
    offset += extra + pad + data.length;
  }
  const data = zipSync(zipped, { level: 0, mtime: new Date() });
  return new Blob([data as BlobPart], { type: 'model/vnd.usdz+zip' });
}

// ---------------------------------------------------------------------------
// マテリアル（基本の色とテクスチャだけ）
// ---------------------------------------------------------------------------

type PlainMaterial = {
  map: Texture | null;
  color: Color;
  transparent: boolean;
  alphaTest: number;
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
    if (value?.isTexture) return value;
  }
  return null;
}

/** 色を MatCap だけでつけている部分（髪・服など）は、MatCap の真ん中の色で塗る */
function matcapColor(THREE: Three, material: Material): Color | null {
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

function plainMaterial(THREE: Three, material: Material): PlainMaterial {
  const map = baseTexture(material);
  const color =
    (!map && matcapColor(THREE, material)) ||
    (material as Material & { color?: Color }).color?.clone() ||
    new THREE.Color(0xffffff);
  return {
    map,
    // USD の色は、three.js と同じ光の強さのまま（linear）で書く
    color,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
  };
}

/**
 * テクスチャを PNG にする（大きすぎるものは縮める）。読めないものは null。
 * 色は元のまま（sRGB）。光の強さのまま（linear）に直して "raw" として入れると、iPhone では
 * もう一度 sRGB として読まれ、暗く濃くなった
 */
async function textureToPng(texture: Texture): Promise<Uint8Array | null> {
  const image = texture.image as
    | (CanvasImageSource & { width: number; height: number })
    | undefined;
  if (!image?.width || !image.height) return null;
  const scale = Math.min(1, TEXTURE_SIZE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return null;
  if (texture.flipY) {
    context.translate(0, canvas.height);
    context.scale(1, -1);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

// ---------------------------------------------------------------------------
// USD の文章の書き方
// ---------------------------------------------------------------------------

/** 数を短く書く（小数 5 けたまで） */
function num(value: number) {
  return String(+value.toFixed(5));
}

function vec3(value: { x: number; y: number; z: number }) {
  return `(${num(value.x)}, ${num(value.y)}, ${num(value.z)})`;
}

/** 四元数は (w, x, y, z) の順 */
function quat(value: Quaternion) {
  return `(${num(value.w)}, ${num(value.x)}, ${num(value.y)}, ${num(value.z)})`;
}

/** 行列。USD は行ベクトルの書き方なので、three.js の列の並びが、そのまま USD の行になる */
function matrix(value: Matrix4) {
  const e = value.elements;
  const row = (i: number) =>
    `(${[e[i], e[i + 1], e[i + 2], e[i + 3]].map((v) => String(+v.toFixed(7))).join(', ')})`;
  return `(${row(0)}, ${row(4)}, ${row(8)}, ${row(12)})`;
}

function tuples(values: Float32Array, size: number) {
  const out: string[] = [];
  for (let i = 0; i < values.length; i += size) {
    const items: string[] = [];
    for (let k = 0; k < size; k++) items.push(num(values[i + k]));
    out.push(`(${items.join(', ')})`);
  }
  return out.join(', ');
}

function nearlyEqual(a: Matrix4, b: Matrix4) {
  return a.elements.every((value, i) => Math.abs(value - b.elements[i]) < 1e-4);
}
