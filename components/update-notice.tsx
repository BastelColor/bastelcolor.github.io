'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/lang';

/**
 * サイトを公開し直したあと、古い版のまま開いているページに「新しい版があります（更新）」と小さく出す。
 *
 * 公開するとき（scripts/write-sw.mjs）に、プログラムの版の印を /version.json と、ページの
 * <meta name="yzmo-build"> に書いている。開いているあいだ、ときどき /version.json を読み、
 * ページの印とちがえば出す。古い版のままだと、あとから読むプログラム（アバターの部屋など）が
 * 新しい公開で消えていて、開けないことがあるため。
 *
 * 公開したサイトでだけ動かす（npm run dev では印が無いので、何もしない）
 */

/** 開いてから、はじめて調べるまで（ミリ秒） */
const FIRST_CHECK_DELAY = 10_000;
/** 開いたままのとき、調べる間隔 */
const CHECK_INTERVAL = 15 * 60_000;
/** ほかのタブからもどってきたときに調べる。ただし、前に調べてから、これより短ければ調べない */
const MIN_CHECK_GAP = 5 * 60_000;

export function UpdateNotice() {
  const t = useT();
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (closed) return;
    const current = document
      .querySelector('meta[name="yzmo-build"]')
      ?.getAttribute('content');
    if (!current) return;
    let active = true;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < MIN_CHECK_GAP) return;
      last = Date.now();
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        if (!response.ok) return;
        const { build } = (await response.json()) as { build?: string };
        if (active && build && build !== current) setShown(true);
      } catch {
        // つながらないときは、次の機会に
      }
    };
    const first = window.setTimeout(() => void check(), FIRST_CHECK_DELAY);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [closed]);

  if (!shown || closed) return null;
  return (
    <output className="update-notice">
      <span>{t('新しい版があります', 'A new version is available')}</span>
      <button
        type="button"
        className="update-notice-reload"
        onClick={() => window.location.reload()}
      >
        {t('更新', 'Refresh')}
      </button>
      <button
        type="button"
        className="update-notice-close"
        aria-label={t('閉じる', 'Close')}
        onClick={() => setClosed(true)}
      >
        ×
      </button>
    </output>
  );
}
