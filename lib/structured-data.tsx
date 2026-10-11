/**
 * 検索エンジン向けの、ページの説明（構造化データ・JSON-LD）。
 * 書き出したページの中に <script type="application/ld+json"> として入り、画面には何も出ない。
 * Google などが「作品」「記事」「3D モデル」などとして読み取り、検索結果に画像や説明が出やすくなる。
 *
 *   トップ           WebSite（サイトの名前・説明・作者）
 *   /work/<id>       CreativeWork（作品）
 *   /avatar/<id>     3DModel（アバター）
 *   /blog/<slug>     BlogPosting（記事）
 *
 * 作者は、サイトに出しているハンドル名と SNS（content/profile.ts の links）だけを書く
 */
import { profile } from '@/content/profile';
import { site } from '@/content/site';
import type { Avatar, Work } from '@/content/types';

type Data = Record<string, unknown>;

/** サイトの作者 */
const author: Data = {
  '@type': 'Person',
  name: 'Bastelcolor',
  url: site.url,
  sameAs: profile.links.map((link) => link.url),
};

/** サイトの中の住所を、https:// からの住所にする */
const absolute = (path: string) => new URL(path, site.url).toString();

export function websiteData(): Data {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.title,
    url: absolute('/'),
    description: site.description,
    inLanguage: ['ja', 'en'],
    author,
  };
}

export function workData(work: Work): Data {
  const year = /\d{4}/.exec(work.year ?? '')?.[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: work.title,
    description: work.description,
    url: absolute(`/work/${work.id}`),
    // 画像は、共有したときのカード（作品の絵と名前。公開するときに scripts/write-share-cards.mjs が作る）
    image: absolute(`/og/works/${work.id}.png`),
    genre: work.category,
    ...(work.tools?.length ? { keywords: work.tools.join(', ') } : {}),
    ...(year ? { dateCreated: year } : {}),
    inLanguage: 'ja',
    author,
  };
}

export function avatarData(avatar: Avatar): Data {
  return {
    '@context': 'https://schema.org',
    '@type': '3DModel',
    name: avatar.name,
    alternateName: avatar.nameEn,
    description: avatar.description,
    url: absolute(`/avatar/${avatar.id}`),
    // 画像は、共有したときのカード（その子の絵と名前。公開するときに scripts/write-share-cards.mjs が作る）
    image: absolute(`/og/avatars/${avatar.id}.png`),
    ...(avatar.booth ? { sameAs: avatar.booth } : {}),
    inLanguage: 'ja',
    author,
  };
}

export function postData(post: {
  slug: string;
  title: string;
  date: string;
  summary?: string;
  thumbnail?: string;
  category?: string;
}): Data {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    ...(post.summary ? { description: post.summary } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
    url: absolute(`/blog/${post.slug}`),
    image: absolute(post.thumbnail ?? `/og/posts/${post.slug}.png`),
    inLanguage: 'ja',
    author,
    publisher: author,
  };
}

/** ページに入れる <script type="application/ld+json">（</script> などで閉じられないよう、< は書きかえる） */
export function JsonLd({ data }: { data: Data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
