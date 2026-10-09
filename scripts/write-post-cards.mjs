/**
 * サムネイル（thumbnail）の無いブログの記事に、共有したときのカードの画像を作る。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 出力: dist/client/og/posts/<記事の名前>.png（1200×630）
 * 記事のページ（app/(site)/blog/[slug]/page.tsx）が、この画像をカードに使う。
 *
 * トップと同じ空と雲の上に、記事のタイトル・日付・カテゴリを白いカードで置き、
 * ブログの部屋の子（キュイプル）が右下からのぞく。
 * 絵は satori（文字を図形にして SVG を作る）と resvg（SVG を PNG にする）で描く。
 * 文字はサイトと同じフォント（fonts/）を、使う文字だけにして渡す。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { dist, readBuiltPosts, root } from './built-posts.mjs';

const WIDTH = 1200;
const HEIGHT = 630;
const OUTPUT_DIR = path.join(dist, 'og', 'posts');
/** のぞく子（ブログの部屋の子） */
const MASCOT = path.join(root, 'public', 'characters', 'quiple-happy.webp');
const SITE_SUB = '唯繕物置';

const INK = '#2f4558';
const INK_SOFT = '#56697a';
const TONE = '#ffe08a';
/** 「Yzmo」の1文字ずつの色（app/styles/base.css の部屋の色） */
const LOGO = [
  ['Y', '#ffb7d2'],
  ['z', '#a5e6cf'],
  ['m', '#acd3fa'],
  ['o', '#ffe08a'],
];

const posts = (await readBuiltPosts()).filter((post) => !post.thumbnail);
if (posts.length === 0) {
  console.log('[cards] 作るカードはありません');
  process.exit(0);
}

const mascot = `data:image/png;base64,${(
  await sharp(MASCOT).resize({ width: 440 }).png().toBuffer()
).toString('base64')}`;

await mkdir(OUTPUT_DIR, { recursive: true });
for (const post of posts) {
  const title = post.title ?? post.slug;
  const meta = [formatDate(post.date), post.category].filter(Boolean);
  const text = [title, ...meta, SITE_SUB, 'BLOG'].join('');
  const fonts = [
    await font('ZenMaruGothic-Black.woff2', 'Zen Maru Gothic', 900, text),
    await font('ZenMaruGothic-Bold.woff2', 'Zen Maru Gothic', 700, text),
    await font('CherryBombOne-Regular.woff2', 'Cherry Bomb One', 400, 'Yzmo'),
  ];
  const svg = await satori(card({ title, meta }), {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    .render()
    .asPng();
  await writeFile(path.join(OUTPUT_DIR, `${post.slug}.png`), png);
}
console.log(`[cards] ${posts.length} 枚の記事のカードを書きました`);

/** fonts/ のフォントを、text に使う文字だけにして satori に渡す形にする */
async function font(file, name, weight, text) {
  const data = await subsetFont(
    await readFile(path.join(root, 'fonts', file)),
    text,
    { targetFormat: 'sfnt' },
  );
  return { name, data, weight, style: 'normal' };
}

/** 2026-10-09 → 2026.10.09 */
function formatDate(date) {
  return date ? date.replaceAll('-', '.') : '';
}

/** satori に渡す要素（React の要素と同じ形） */
function h(type, style, ...children) {
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

function card({ title, meta }) {
  // 下の雲の海。大きな白い丸を重ねる
  const clouds = [
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
  return h(
    'div',
    {
      position: 'relative',
      display: 'flex',
      width: WIDTH,
      height: HEIGHT,
      background: 'linear-gradient(180deg, #bcdbf4 0%, #dcedfa 75%)',
      fontFamily: 'Zen Maru Gothic',
      color: INK,
      overflow: 'hidden',
    },
    // のぞく子は雲のうしろ
    {
      type: 'img',
      props: {
        src: mascot,
        width: 440,
        height: 398,
        style: { position: 'absolute', right: 40, top: 250 },
      },
    },
    ...clouds,
    // 左上のサイト名
    h(
      'div',
      {
        position: 'absolute',
        left: 64,
        top: 44,
        display: 'flex',
        alignItems: 'baseline',
        gap: 18,
      },
      // トップの「Yzmo」と同じく、1文字ずつ部屋の色で
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
        { fontSize: 24, fontWeight: 900, letterSpacing: 6 },
        `${SITE_SUB}  BLOG`,
      ),
    ),
    // タイトルのカード
    h(
      'div',
      {
        position: 'absolute',
        left: 64,
        top: 168,
        width: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '36px 44px 40px',
        borderRadius: 40,
        background: '#ffffff',
        boxShadow: '0 10px 0 rgba(47, 69, 88, 0.12)',
      },
      h(
        'div',
        {
          display: 'flex',
          gap: 14,
          fontSize: 24,
          fontWeight: 700,
          color: INK_SOFT,
        },
        ...meta.map((item, i) =>
          h(
            'div',
            i === 1
              ? {
                  padding: '2px 16px 4px',
                  borderRadius: 999,
                  background: TONE,
                  color: INK,
                }
              : { padding: '2px 0 4px' },
            item,
          ),
        ),
      ),
      h(
        'div',
        {
          fontSize: title.length > 24 ? 46 : 56,
          fontWeight: 900,
          lineHeight: 1.35,
          lineClamp: 3,
        },
        title,
      ),
    ),
  );
}
