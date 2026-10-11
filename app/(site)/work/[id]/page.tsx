import type { Metadata } from 'next';
import { site } from '@/content/site';
import { works } from '@/content/works';
import { JsonLd, workData } from '@/lib/structured-data';

/**
 * 作品の詳細の URL（/work/<作品のid>）。
 * 中身は共通部分（components/site-app.tsx）が、さくひんの部屋とその作品の詳細を開いて表示する。
 * このページは、SNS などで共有したときのカード（タイトル・説明・サムネイル）のためにある。
 *
 * 作品の画像は public/works/<id>/ にあるので、同じ /works/<id> にすると
 * GitHub Pages がフォルダとして扱ってしまう。そのため URL は単数形の /work/ にしている
 */
type WorkPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return works.map((work) => ({ id: work.id }));
}

export async function generateMetadata({
  params,
}: WorkPageProps): Promise<Metadata> {
  const { id } = await params;
  const work = works.find((item) => item.id === id);
  if (!work) return { title: site.title };
  return {
    title: `${work.title} | ${site.title}`,
    description: work.description,
    openGraph: {
      type: 'article',
      url: `/work/${work.id}`,
      siteName: site.title,
      title: work.title,
      description: work.description,
      locale: 'ja_JP',
      // サムネイルとタイトルを並べたカード（公開するときに scripts/write-share-cards.mjs が作る）
      images: [`/og/works/${work.id}.png`],
    },
  };
}

/** 中身は共通部分が出すので、ここには検索エンジン向けの説明（lib/structured-data.tsx）だけを置く */
export default async function WorkPage({ params }: WorkPageProps) {
  const { id } = await params;
  const work = works.find((item) => item.id === id);
  return work ? <JsonLd data={workData(work)} /> : null;
}
