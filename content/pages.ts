// 足し方・書き方は docs/content-guide.md を参照
import type { PageId, SitePage } from './types';

export const pages: SitePage[] = [
  {
    id: 'profile',
    tone: 'pink',
    menuLabel: 'プロフィール',
    note: 'つくる人のこと。',
  },
  {
    id: 'works',
    tone: 'mint',
    menuLabel: 'さくひん',
    note: 'これまでにつくったもの。',
    mascot: {
      normal: '/characters/coflet.webp',
      happy: '/characters/coflet-happy.webp',
    },
  },
  {
    id: 'avatar',
    tone: 'blue',
    menuLabel: 'アバター',
    note: 'キャラクターモデルと制作記録。',
    mascot: {
      normal: '/characters/timi.webp',
      happy: '/characters/timi-happy.webp',
    },
  },
  {
    id: 'log',
    tone: 'yellow',
    menuLabel: 'ブログ',
    note: '制作メモと技術記事。',
    mascot: {
      normal: '/characters/quiple.webp',
      happy: '/characters/quiple-happy.webp',
      // 大きなしっぽが入るよう、右と下に広げて撮っている
      width: 1.4,
    },
  },
];

export function findPage(id: PageId): SitePage {
  const page = pages.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown page: ${id}`);
  return page;
}
