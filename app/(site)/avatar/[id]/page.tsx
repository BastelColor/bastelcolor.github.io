import type { Metadata } from 'next';
import { avatars } from '@/content/avatars';
import { site } from '@/content/site';

/**
 * アバターの URL（/avatar/<id>）。
 * 中身は共通部分（components/site-app.tsx）が、アバターの部屋を開いてその子を選んで表示する。
 * このページは、SNS などで共有したときのカード（名前・紹介・画像）のためにある。
 */
type AvatarPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return avatars.map((avatar) => ({ id: avatar.id }));
}

export async function generateMetadata({
  params,
}: AvatarPageProps): Promise<Metadata> {
  const { id } = await params;
  const avatar = avatars.find((item) => item.id === id);
  if (!avatar) return { title: site.title };
  const title = `${avatar.name} / ${avatar.nameEn}`;
  const description = avatar.badge
    ? `${avatar.description}（${avatar.badge}）`
    : avatar.description;
  return {
    title: `${title} | ${site.title}`,
    description,
    openGraph: {
      type: 'article',
      url: `/avatar/${avatar.id}`,
      siteName: site.title,
      title,
      description,
      locale: 'ja_JP',
      images: [avatar.ogImage ?? '/og.png'],
    },
  };
}

export default function AvatarPage() {
  return null;
}
