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
  title: site.title,
  description: site.description,
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
          'antialiased',
        )}
      >
        {children}
      </body>
    </html>
  );
}
