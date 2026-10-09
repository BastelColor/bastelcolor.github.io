import type { Lang } from '@/components/lang';
import type { Avatar, Work } from '@/content/types';

/**
 * 英語で表示するとき、content/ に書いた en の文章で置きかえた作品を返す。
 * en に書いていないものは日本語のまま
 */
export function localizeWork(work: Work, lang: Lang): Work {
  if (lang !== 'en' || !work.en) return work;
  const { en } = work;
  return {
    ...work,
    title: en.title ?? work.title,
    description: en.description ?? work.description,
    body: en.body ?? work.body,
    links: work.links?.map((link, i) => ({
      ...link,
      label: en.links?.[i] ?? link.label,
    })),
  };
}

/** 英語で表示するとき、アバターのひとこと紹介と目印を en で置きかえる */
export function localizeAvatar(avatar: Avatar, lang: Lang): Avatar {
  if (lang !== 'en' || !avatar.en) return avatar;
  return {
    ...avatar,
    description: avatar.en.description ?? avatar.description,
    badge: avatar.en.badge ?? avatar.badge,
  };
}
