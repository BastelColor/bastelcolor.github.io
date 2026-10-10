/**
 * 作品とアバターのページを共有したときの、カードの画像を作る。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 出力（1200×630）
 * - dist/client/og/works/<作品の id>.png   : 空と雲の上に、作品のサムネイル・タイトル・一言
 * - dist/client/og/avatars/<アバターの id>.png : 空と雲の上に、その子の絵・名前・ひとこと紹介
 * 作品のページ（app/(site)/work/[id]/page.tsx）・アバターのページ（avatar/[id]/page.tsx）が、
 * この画像をカードに使う。
 *
 * 作品・アバターの内容は content/works.ts・content/avatars.ts をそのまま読む
 * （Node.js は .ts の型を読み飛ばして動かせる）。絵の部品は scripts/card-parts.mjs。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { avatars } from '../content/avatars.ts';
import { works } from '../content/works.ts';
import { dist, root } from './built-posts.mjs';
import {
  clouds,
  h,
  HEIGHT,
  imageData,
  img,
  INK,
  INK_SOFT,
  renderCard,
  siteMark,
  sky,
  skyWith,
} from './card-parts.mjs';

const publicFile = (url) => path.join(root, 'public', url.replace(/^\//, ''));

// ---- 作品 ----
const WORK_TONE = '#a5e6cf';
const THUMB_WIDTH = 600;
const THUMB_HEIGHT = 375;

await mkdir(path.join(dist, 'og', 'works'), { recursive: true });
for (const work of works) {
  const thumbnail = work.thumbnail
    ? await imageData(publicFile(work.thumbnail), {
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        fit: 'cover',
      })
    : null;
  const png = await renderCard(
    workCard(work, thumbnail),
    [work.title, work.description, work.category, work.year ?? '', 'WORKS'].join(''),
  );
  await writeFile(path.join(dist, 'og', 'works', `${work.id}.png`), png);
}

// ---- アバター ----
await mkdir(path.join(dist, 'og', 'avatars'), { recursive: true });
for (const avatar of avatars) {
  // その子の共有用の絵（1200×630。真ん中にその子）の、真ん中あたりを右半分に置く
  const art = avatar.ogImage
    ? await imageData(publicFile(avatar.ogImage), {
        width: 700,
        height: HEIGHT,
        fit: 'cover',
      })
    : null;
  const png = await renderCard(
    avatarCard(avatar, art),
    [avatar.name, avatar.nameEn, avatar.description, avatar.badge ?? '', 'AVATARS'].join(''),
  );
  await writeFile(path.join(dist, 'og', 'avatars', `${avatar.id}.png`), png);
}

console.log(
  `[cards] 作品 ${works.length} 枚・アバター ${avatars.length} 枚のカードを書きました`,
);

/** 小さな丸い札（分類・年・目印） */
function chip(text, background) {
  return h(
    'div',
    {
      padding: '3px 16px 5px',
      borderRadius: 999,
      background,
      fontSize: 22,
      fontWeight: 900,
      color: INK,
    },
    text,
  );
}

function workCard(work, thumbnail) {
  const meta = [work.category, work.year].filter(Boolean);
  return sky(
    ...clouds(),
    siteMark('WORKS'),
    // 左: タイトルと一言
    h(
      'div',
      {
        position: 'absolute',
        left: 64,
        top: 160,
        width: thumbnail ? 440 : 1072,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      },
      h(
        'div',
        { display: 'flex', flexWrap: 'wrap', gap: 10 },
        ...meta.map((item, i) => chip(item, i === 0 ? WORK_TONE : '#ffffff')),
      ),
      h(
        'div',
        {
          // 1行に入りきる長さなら大きく
          fontSize:
            work.title.length <= 7 ? 56 : work.title.length <= 14 ? 46 : 40,
          fontWeight: 900,
          lineHeight: 1.3,
          lineClamp: 3,
        },
        work.title,
      ),
      h(
        'div',
        {
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.5,
          color: INK_SOFT,
          lineClamp: 3,
        },
        work.description,
      ),
    ),
    // 右: サムネイル（白い縁取りの角丸）
    thumbnail &&
      h(
        'div',
        {
          position: 'absolute',
          right: 56,
          top: 132,
          display: 'flex',
          padding: 10,
          borderRadius: 36,
          background: '#ffffff',
          boxShadow: '0 10px 0 rgba(47, 69, 88, 0.12)',
        },
        img(thumbnail, THUMB_WIDTH, THUMB_HEIGHT, { borderRadius: 26 }),
      ),
  );
}

function avatarCard(avatar, art) {
  // 空は、その子の絵（public/avatars/<id>-og.png）の空と同じ色にして、つなぎ目を見せない
  return skyWith(
    '#c9e2f5',
    // 右に、その子の絵（雲の海も絵の中にある）
    art && img(art, 700, HEIGHT, { position: 'absolute', right: 0, top: 0 }),
    ...clouds().slice(0, 3),
    siteMark('AVATARS'),
    // 左: 名前とひとこと紹介の白いカード
    h(
      'div',
      {
        position: 'absolute',
        left: 64,
        top: 168,
        width: 470,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '32px 40px 36px',
        borderRadius: 40,
        background: '#ffffff',
        boxShadow: '0 10px 0 rgba(47, 69, 88, 0.12)',
      },
      avatar.badge && h('div', { display: 'flex' }, chip(avatar.badge, '#acd3fa')),
      h(
        'div',
        { fontSize: 64, fontWeight: 900, lineHeight: 1.2 },
        avatar.name,
      ),
      h(
        'div',
        { fontSize: 26, fontWeight: 900, color: INK_SOFT },
        avatar.nameEn,
      ),
      h(
        'div',
        { fontSize: 26, fontWeight: 700, lineHeight: 1.5, marginTop: 6 },
        avatar.description,
      ),
    ),
  );
}
