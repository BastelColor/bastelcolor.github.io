import type { ReactNode } from 'react';
import { SiteApp } from '@/components/site-app';
import { getPosts } from '@/lib/posts';

/**
 * トップと記事のページで共通の部分（雲・部屋）。
 * ページを移っても作り直されないので、記事からもどったときもブログの部屋が開いたまま残る。
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  // 記事の一覧（本文なし）だけをブラウザへ渡す
  return <SiteApp posts={getPosts()}>{children}</SiteApp>;
}
