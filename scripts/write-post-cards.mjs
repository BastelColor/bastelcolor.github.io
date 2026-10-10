/**
 * サムネイル（thumbnail）の無いブログの記事に、共有したときのカードの画像を作る。
 * npm run build のあとに自動で実行される（package.json の postbuild）。
 *
 * 出力: dist/client/og/posts/<記事の名前>.png（1200×630）
 * 記事のページ（app/(site)/blog/[slug]/page.tsx）が、この画像をカードに使う。
 *
 * トップと同じ空と雲の上に、記事のタイトル・日付・カテゴリを白いカードで置き、
 * ブログの部屋の子（キュイプル）が右下からのぞく。
 * 絵の部品は scripts/card-parts.mjs。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dist, readBuiltPosts, root } from './built-posts.mjs';
import {
  clouds,
  h,
  imageData,
  img,
  INK,
  INK_SOFT,
  renderCard,
  siteMark,
  sky,
} from './card-parts.mjs';

const OUTPUT_DIR = path.join(dist, 'og', 'posts');
/** のぞく子（ブログの部屋の子） */
const MASCOT = path.join(root, 'public', 'characters', 'quiple-happy.webp');
const TONE = '#ffe08a';

const posts = (await readBuiltPosts()).filter((post) => !post.thumbnail);
if (posts.length === 0) {
  console.log('[cards] 作るカードはありません');
  process.exit(0);
}

const mascot = await imageData(MASCOT, { width: 440 });

await mkdir(OUTPUT_DIR, { recursive: true });
for (const post of posts) {
  const title = post.title ?? post.slug;
  const meta = [formatDate(post.date), post.category].filter(Boolean);
  const png = await renderCard(card({ title, meta }), [title, ...meta, 'BLOG'].join(''));
  await writeFile(path.join(OUTPUT_DIR, `${post.slug}.png`), png);
}
console.log(`[cards] ${posts.length} 枚の記事のカードを書きました`);

/** 2026-10-09 → 2026.10.09 */
function formatDate(date) {
  return date ? date.replaceAll('-', '.') : '';
}

function card({ title, meta }) {
  return sky(
    // のぞく子は雲のうしろ
    img(mascot, 440, 398, { position: 'absolute', right: 40, top: 250 }),
    ...clouds(),
    siteMark('BLOG'),
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
