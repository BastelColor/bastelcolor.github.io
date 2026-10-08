import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // GitHub Pages で公開するため、サイト全体を静的なファイルとして書き出す（dist/client）
  // 記事などはビルドの時点で作るので、サーバーは要らない
  output: 'export',
};

export default nextConfig;
