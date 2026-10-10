'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { site } from '@/content/site';
import { LAYERS_CHANGE_EVENT } from '@/lib/history-layers';

declare global {
  interface Window {
    goatcounter?: {
      count?: (vars?: { path?: string; title?: string; event?: boolean }) => void;
    };
  }
}

/** 画面が変わってから数えるまでの待ち時間。開いてすぐ別の画面へ移ったものは数えない */
const SETTLE_MS = 1000;
/** GoatCounter の読み込みを待つ回数と間隔（合わせて20秒） */
const READY_TRIES = 40;
const READY_INTERVAL_MS = 500;

/** いまの画面の住所。部屋は # で表しているので、# も含める */
function currentPath() {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}

/** GoatCounter が読み込まれるのを待ってから、path を1回数える（event なら「できごと」として） */
function countWhenReady(path: string, tries = READY_TRIES, event = false) {
  const count = window.goatcounter?.count;
  if (count) {
    count(event ? { path, title: path, event: true } : { path });
    return;
  }
  if (tries > 0) {
    window.setTimeout(
      () => countWhenReady(path, tries - 1, event),
      READY_INTERVAL_MS,
    );
  }
}

/**
 * ページではない「できごと」を1回数える（例: アバターの写真を撮った → photo/quiple）。
 * GoatCounter では、ページの一覧とは別に、できごととして並ぶ
 */
export function countEvent(name: string) {
  if (!site.goatcounter) return;
  countWhenReady(name, READY_TRIES, true);
}

/**
 * GoatCounter（Cookie を使わないアクセス解析）で、見られた画面を数える。
 * content/site.ts の goatcounter が空なら何もしない。
 *
 * GoatCounter が自分で数えるのは止めて（no_onload）、最初のページも
 * そのあと部屋・作品・アバター・記事を移ったときも、ここで # 付きの住所を数える。
 * 自分のパソコン（localhost）で開いたときは、GoatCounter が数えない。
 */
export function PageCounter() {
  const pathname = usePathname();
  // 最後に数えた画面
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!site.goatcounter) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const path = currentPath();
        if (path === lastPath.current) return;
        lastPath.current = path;
        countWhenReady(path);
      }, SETTLE_MS);
    };
    window.addEventListener(LAYERS_CHANGE_EVENT, schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    // 最初に開いたページと、記事のページへ移ったとき（pathname が変わる）
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
    <script
      async
      data-goatcounter={`https://${site.goatcounter}.goatcounter.com/count`}
      data-goatcounter-settings='{"no_onload": true}'
      src="https://gc.zgo.at/count.js"
    />
  );
}
