import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * 開発中（npm run dev）に、/fonts/<名前>-basic.woff2・/fonts/<名前>-extra.woff2 へ、
 * fonts/ の元のフォントを丸ごと渡す。
 *
 * 公開するときは scripts/subset-fonts.mjs が、サイトで使っている文字だけのフォントを作る。
 * 開発中は書いた文章がすぐ変わるので、文字を絞らずに全部入りのものを使う。
 */
export function fonts(): Plugin {
  const fontsDir = path.resolve('fonts');
  const list: { source: string; name: string }[] = JSON.parse(
    readFileSync(path.join(fontsDir, 'fonts.json'), 'utf8'),
  );
  return {
    name: 'fonts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/fonts\/([^/?]+)-(basic|extra)\.woff2/)?.[1];
        const font = list.find((item) => item.name === name);
        if (!font) return next();
        res.setHeader('Content-Type', 'font/woff2');
        res.end(readFileSync(path.join(fontsDir, font.source)));
      });
    },
  };
}
