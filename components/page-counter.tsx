'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { site } from '@/content/site';
import { LAYERS_CHANGE_EVENT } from '@/lib/history-layers';

declare global {
  interface Window {
    goatcounter?: {
      path?: () => string;
      count?: () => void;
    };
  }
}

/** 画面が変わってから数えるまでの待ち時間。開いてすぐ別の画面へ移ったものは数えない */
const SETTLE_MS = 1000;

/** いまの画面の住所。部屋は # で表しているので、# も含める */
function currentPath() {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}

/**
 * GoatCounter（Cookie を使わないアクセス解析）で、見られた画面を数える。
 * content/site.ts の goatcounter が空なら何もしない。
 *
 * 最初に開いたページは GoatCounter が読み込まれたときに数える。
 * そのあと部屋・作品・アバター・記事を移ったときは、ここで数える。
 * 自分のパソコン（localhost）で開いたときは、GoatCounter が数えない。
 */
export function PageCounter() {
  const pathname = usePathname();
  // 最後に数えた画面。最初に開いたページは GoatCounter が数えるので、それを入れておく
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!site.goatcounter) return;
    lastPath.current ??= currentPath();
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const path = currentPath();
        if (path === lastPath.current) return;
        lastPath.current = path;
        window.goatcounter?.count?.();
      }, SETTLE_MS);
    };
    window.addEventListener(LAYERS_CHANGE_EVENT, schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    // 記事のページへ移ったときなど（pathname が変わる）
    schedule();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(LAYERS_CHANGE_EVENT, schedule);
      window.removeEventListener('popstate', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [pathname]);

  if (!site.goatcounter) return null;
  return (
    <>
      {/* 数える住所に # も含める（GoatCounter の設定。読み込みより先に置く） */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'window.goatcounter={path:function(){return location.pathname+location.search+location.hash}}',
        }}
      />
      <script
        async
        data-goatcounter={`https://${site.goatcounter}.goatcounter.com/count`}
        src="https://gc.zgo.at/count.js"
      />
    </>
  );
}
