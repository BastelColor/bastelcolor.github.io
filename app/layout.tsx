import type { Metadata } from 'next';
import {
  Cherry_Bomb_One,
  Geist,
  Geist_Mono,
  Zen_Maru_Gothic,
} from 'next/font/google';
import { site } from '@/content/site';
import { cn } from '@/lib/utils';
import './globals.css';
// サイト固有のスタイル（画面の構成順）
import './styles/base.css';
import './styles/home.css';
import './styles/puni-button.css';
import './styles/room.css';
import './styles/rooms/profile.css';
import './styles/rooms/works.css';
import './styles/rooms/avatar.css';
import './styles/rooms/log.css';
import './styles/vrm-viewer.css';
import './styles/blog.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// 見出し・メニューボタン用
const cherryBomb = Cherry_Bomb_One({
  variable: '--font-cherry-bomb',
  weight: '400',
  preload: false,
});

// 本文用
const zenMaru = Zen_Maru_Gothic({
  variable: '--font-zen-maru',
  weight: ['500', '700', '900'],
  preload: false,
});

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
    <html lang="ja">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          cherryBomb.variable,
          zenMaru.variable,
        )}
      >
        {children}
      </body>
    </html>
  );
}
