/**
 * 共有カードの画像（1200×630）を作るための共通の部品。
 * scripts/write-post-cards.mjs（記事）と scripts/write-share-cards.mjs（作品・アバター）で使う。
 *
 * 絵は satori（文字を図形にして SVG を作る）と resvg（SVG を PNG にする）で描く。
 * 文字はサイトと同じフォント（fonts/）を、使う文字だけにして渡す。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { root } from './built-posts.mjs';

export const WIDTH = 1200;
export const HEIGHT = 630;
export const INK = '#2f4558';
export const INK_SOFT = '#56697a';
export const SITE_SUB = '唯繕物置';
/** 「Yzmo」の1文字ずつの色（app/styles/base.css の部屋の色） */
const LOGO = [
  ['Y', '#ffb7d2'],
  ['z', '#a5e6cf'],
  ['m', '#acd3fa'],
  ['o', '#ffe08a'],
];

/** satori に渡す要素（React の要素と同じ形） */
export function h(type, style, ...children) {
  // 子が1つなら配列にしない（配列だと、文字だけの要素にも display: flex が要る）
  return {
    type,
    props: {
      style,
      children:
        children.length === 0
          ? undefined
          : children.length === 1
            ? children[0]
            : children,
    },
  };
}

/** 画像（satori の img）。src はデータ URL */
export function img(src, width, height, style) {
  return { type: 'img', props: { src, width, height, style } };
}

/** 画像ファイルを、決めた大きさの PNG のデータ URL にする（fit: cover なら切り抜いて埋める） */
export async function imageData(file, options) {
  const png = await sharp(file).resize(options).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** 下の雲の海（大きな白い丸を重ねる） */
export function clouds() {
  return [
    [-80, 470, 300],
    [150, 500, 260],
    [360, 480, 300],
    [600, 510, 260],
    [820, 470, 320],
    [1060, 500, 300],
  ].map(([left, top, size]) =>
    h('div', {
      position: 'absolute',
      left,
      top,
      width: size,
      height: size,
      borderRadius: size,
      background: '#ffffff',
    }),
  );
}

/** 左上のサイト名（「Yzmo」を1文字ずつ部屋の色で ＋ 唯繕物置 ＋ label） */
export function siteMark(label) {
  return h(
    'div',
    {
      position: 'absolute',
      left: 64,
      top: 44,
      display: 'flex',
      alignItems: 'baseline',
      gap: 18,
    },
    h(
      'div',
      { display: 'flex', fontFamily: 'Cherry Bomb One', fontSize: 64 },
      ...LOGO.map(([letter, color]) =>
        h(
          'div',
          {
            color,
            WebkitTextStroke: `8px ${INK}`,
            paintOrder: 'stroke fill',
          },
          letter,
        ),
      ),
    ),
    h(
      'div',
      { fontSize: 24, fontWeight: 900, letterSpacing: 6, color: INK },
      `${SITE_SUB}  ${label}`,
    ),
  );
}

/** 空の背景の上に children を重ねた、カード全体 */
export function sky(...children) {
  return skyWith(SKY, ...children);
}

/** トップの昼の空と同じ、上から下へ明るくなる水色 */
const SKY = 'linear-gradient(180deg, #bcdbf4 0%, #dcedfa 75%)';

/** 空の色（background）を決めて、その上に children を重ねた、カード全体 */
export function skyWith(background, ...children) {
  return h(
    'div',
    {
      position: 'relative',
      display: 'flex',
      width: WIDTH,
      height: HEIGHT,
      background,
      fontFamily: 'Zen Maru Gothic',
      color: INK,
      overflow: 'hidden',
    },
    ...children,
  );
}

/** fonts/ のフォントを、text に使う文字だけにして satori に渡す形にする */
async function font(file, name, weight, text) {
  const data = await subsetFont(
    await readFile(path.join(root, 'fonts', file)),
    text,
    { targetFormat: 'sfnt' },
  );
  return { name, data, weight, style: 'normal' };
}

/** カードを PNG にする。text はカードに書く文字すべて（フォントをその文字だけにする） */
export async function renderCard(element, text) {
  const all = `${text}${SITE_SUB}`;
  const fonts = [
    await font('ZenMaruGothic-Black.woff2', 'Zen Maru Gothic', 900, all),
    await font('ZenMaruGothic-Bold.woff2', 'Zen Maru Gothic', 700, all),
    await font('CherryBombOne-Regular.woff2', 'Cherry Bomb One', 400, 'Yzmo'),
  ];
  const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    .render()
    .asPng();
}
