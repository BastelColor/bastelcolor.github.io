/**
 * lilToon のシェーダーを、スマホの GPU でも作れるように軽くする。
 *
 * lilToon（@mochiya/three-liltoon）は、マテリアルの設定（色・テクスチャの位置・影の強さなど 400 近く）を
 * ひとつのまとまり（type_Globals _Globals）にして、頂点のシェーダーとピクセルのシェーダーの両方に渡している。
 * 頂点のシェーダーが実際に使うのはそのうち 20 数個だけだが、まとまりを使うと、使わない項目まで数えられる。
 * パソコンの GPU は 1024 個以上まで受け取れるので動くが、スマホ（Android の Chrome）は 256 個までなので、
 * 「VERTEX shader uniforms count exceeds MAX_VERTEX_UNIFORM_VECTORS(256)」で作れず、何も描かれなかった。
 *
 * そこで、シェーダーを作る直前に、それぞれのシェーダーが使う項目だけのまとまり（_GlobalsV・_GlobalsF）に
 * 置きかえる。値は、元のまとまり（_Globals）と同じものを見るので、見た目は変わらない。
 *
 * 使い方: lilToon のマテリアル（LilToonMaterial）の onBeforeCompile にする
 */

type Uniforms = Record<string, { value: unknown } | undefined>;

const STRUCT = /struct\s+type_Globals\s*\{([\s\S]*?)\};/;
const UNIFORM = /uniform\s+type_Globals\s+_Globals\s*;/;

/** source（1つのシェーダー）の _Globals を、そのシェーダーが使う項目だけの name に置きかえる */
function slimShader(source: string, suffix: string, uniforms: Uniforms) {
  const struct = STRUCT.exec(source);
  if (!struct || !UNIFORM.test(source)) return source;
  const used = new Set([...source.matchAll(/_Globals\.(\w+)/g)].map((match) => match[1]));
  const members = struct[1]
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const name = /(\w+)\s*(?:\[\s*\d+\s*\])?$/.exec(declaration)?.[1];
      return !!name && used.has(name);
    });
  // まったく使わないシェーダーでは、まとまりごと外す
  if (members.length === 0) {
    return source.replace(struct[0], '').replace(UNIFORM, '');
  }
  const name = `_Globals${suffix}`;
  // 値は、元のまとまりと同じもの（lilToon が書きかえる _Globals を、読むたびに見る）
  uniforms[name] = {
    get value() {
      return uniforms._Globals?.value;
    },
  };
  return source
    .replace(
      struct[0],
      `struct type_Globals${suffix}\n{\n    ${members.join(';\n    ')};\n};`,
    )
    .replace(UNIFORM, `uniform type_Globals${suffix} ${name};`)
    .replace(/_Globals\./g, `${name}.`);
}

/** lilToon のマテリアルの onBeforeCompile。頂点・ピクセルのシェーダーの _Globals を、それぞれ使う項目だけにする */
export function slimLilToonUniforms(shader: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Uniforms;
}) {
  shader.vertexShader = slimShader(shader.vertexShader, 'V', shader.uniforms);
  shader.fragmentShader = slimShader(shader.fragmentShader, 'F', shader.uniforms);
}
