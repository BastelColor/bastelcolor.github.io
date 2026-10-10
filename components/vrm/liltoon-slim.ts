/**
 * lilToon のシェーダーを、スマホの GPU でも作れるように軽くする。
 *
 * lilToon（@mochiya/three-liltoon）は、マテリアルの設定（色・テクスチャの位置・影の強さなど 400 近く）を
 * ひとつのまとまり（type_Globals _Globals）にして、頂点のシェーダーとピクセルのシェーダーの両方に渡している。
 * GPU が受け取れる数には上限があり、まとまりの中の項目は、数1つ（float）でも 4 つ分の場所を使う。
 * パソコンの GPU は 1024 個以上まで受け取れるので動くが、スマホ（Android の Chrome）は 256 個までなので、
 * 「VERTEX（FRAGMENT） shader uniforms count exceeds MAX_…_UNIFORM_VECTORS(256)」で作れず、何も描かれなかった。
 *
 * そこで、シェーダーを作る直前に、
 * 1. それぞれのシェーダーが実際に使う項目だけのまとまり（_GlobalsV・_GlobalsF）に置きかえ、
 * 2. 数1つの項目（float）は 4 つずつ vec4 にまとめて、場所を 1/4 にする。
 * 値は、元のまとまり（_Globals）から、渡すたびに読むので、見た目は変わらない。
 *
 * 使い方: lilToon のマテリアル（LilToonMaterial）の onBeforeCompile にする
 */

type Uniforms = Record<string, { value: unknown } | undefined>;

const STRUCT = /struct\s+type_Globals\s*\{([\s\S]*?)\};/;
const UNIFORM = /uniform\s+type_Globals\s+_Globals\s*;/;
const SWIZZLE = ['x', 'y', 'z', 'w'];

type Member = { declaration: string; type: string; name: string; array: boolean };

/** まとまりの中の1行（"float _Cutoff" など）を読む */
function parseMember(declaration: string): Member | null {
  const match =
    /^(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(\[\s*\d+\s*\])?$/.exec(declaration);
  if (!match) return null;
  return { declaration, type: match[1], name: match[2], array: !!match[3] };
}

/** source（1つのシェーダー）の _Globals を、そのシェーダーが使う項目だけの _Globals{suffix} に置きかえる */
function slimShader(source: string, suffix: string, uniforms: Uniforms) {
  const struct = STRUCT.exec(source);
  if (!struct || !UNIFORM.test(source)) return source;
  const used = new Set(
    [...source.matchAll(/_Globals\.(\w+)/g)].map((match) => match[1]),
  );
  const members = struct[1]
    .split(';')
    .map((declaration) => parseMember(declaration.trim()))
    .filter((member): member is Member => !!member && used.has(member.name));
  // まったく使わないシェーダーでは、まとまりごと外す
  if (members.length === 0) {
    return source.replace(struct[0], '').replace(UNIFORM, '');
  }

  // 数1つ（float）の項目は、4 つずつ vec4（_pack0 など）にまとめる
  const floats = members.filter((member) => member.type === 'float' && !member.array);
  const others = members.filter((member) => !floats.includes(member));
  const packs: string[][] = [];
  const access = new Map<string, string>();
  floats.forEach((member, i) => {
    const pack = Math.floor(i / 4);
    (packs[pack] ??= []).push(member.name);
    access.set(member.name, `_pack${pack}.${SWIZZLE[i % 4]}`);
  });

  const name = `_Globals${suffix}`;
  const declarations = [
    ...others.map((member) => member.declaration),
    ...packs.map((_, i) => `vec4 _pack${i}`),
  ];
  // 値: ふつうの項目は、元のまとまり（lilToon が書きかえる _Globals）のものをそのまま、
  // まとめた項目は、渡すたびに 4 つの値を並べる
  const globals = () =>
    (uniforms._Globals?.value ?? {}) as Record<string, unknown>;
  const packValues = packs.map(() => [0, 0, 0, 0]);
  uniforms[name] = {
    value: new Proxy(
      {},
      {
        get: (_, key) => {
          if (typeof key !== 'string') return undefined;
          const pack = /^_pack(\d+)$/.exec(key);
          if (!pack) return globals()[key];
          const index = Number(pack[1]);
          const values = packValues[index];
          packs[index].forEach((member, i) => {
            values[i] = Number(globals()[member] ?? 0);
          });
          return values;
        },
      },
    ),
  };

  return source
    .replace(
      struct[0],
      `struct type_Globals${suffix}\n{\n    ${declarations.join(';\n    ')};\n};`,
    )
    .replace(UNIFORM, `uniform type_Globals${suffix} ${name};`)
    .replace(
      /_Globals\.(\w+)/g,
      (_, member: string) => `${name}.${access.get(member) ?? member}`,
    );
}

/** lilToon のマテリアルの onBeforeCompile。頂点・ピクセルのシェーダーの _Globals を、それぞれ軽くする */
export function slimLilToonUniforms(shader: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Uniforms;
}) {
  shader.vertexShader = slimShader(shader.vertexShader, 'V', shader.uniforms);
  shader.fragmentShader = slimShader(shader.fragmentShader, 'F', shader.uniforms);
}
