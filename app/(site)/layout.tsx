import type { ReactNode } from 'react';
import { SiteApp } from '@/components/site-app';
import { isNewPost } from '@/lib/post-meta';
import { getPosts } from '@/lib/posts';

/**
 * トップと記事のページで共通の部分（雲・部屋）。
 * ページを移っても作り直されないので、記事からもどったときもブログの部屋が開いたまま残る。
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  // 記事の一覧（本文なし）だけをブラウザへ渡す
  const posts = getPosts();
  // トップの「NEW」のお知らせ。公開したとき（ページを書き出したとき）に新しかったかで決める
  const hasNewPost = posts.length > 0 && isNewPost(posts[0].date);
  return (
    <SiteApp posts={posts} hasNewPost={hasNewPost}>
      {children}
    </SiteApp>
  );
}
