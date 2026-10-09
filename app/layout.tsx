import type { Metadata } from 'next';
import { PageCounter } from '@/components/page-counter';
import { SkyClock } from '@/components/sky-clock';
import { site } from '@/content/site';
import { SKY_SCRIPT } from '@/lib/sky';
import './globals.css';
// サイト固有のスタイル（画面の構成順）
import './styles/fonts.css';
import './styles/base.css';
import './styles/sky.css';
import './styles/home.css';
import './styles/floating-bits.css';
import './styles/puni-button.css';
import './styles/room.css';
import './styles/rooms/profile.css';
import './styles/rooms/works.css';
import './styles/rooms/avatar.css';
import './styles/rooms/log.css';
import './styles/vrm-viewer.css';
import './styles/blog.css';
import './styles/not-found.css';
import './styles/share.css';
import './styles/image-viewer.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  // SNS で URL を共有したときのカード（画像は public/og.png）
  openGraph: {
    type: 'website',
    url: '/',
    siteName: site.title,
    title: site.title,
    description: site.description,
    locale: 'ja_JP',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: site.title }],
  },
  twitter: { card: 'summary_large_image' },
  // Google Search Console で、このサイトの持ち主であることを確かめるためのしるし
  verification: site.googleSiteVerification
    ? { google: site.googleSiteVerification }
    : undefined,
  // ブログの更新情報（RSS）。公開するときに scripts/write-feed.mjs が作る
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  // タブのアイコン（public/ に置いた画像）
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 空の色（data-sky）は、描く前に <head> のスクリプトが書き足すので、食い違いの警告は出さない
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKY_SCRIPT }} />
      </head>
      <body>
        {children}
        <SkyClock />
        <PageCounter />
      </body>
    </html>
  );
}
