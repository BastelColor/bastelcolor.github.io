'use client';

import { useEffect } from 'react';

/**
 * service worker（公開するときに作る /sw.js。中身は scripts/service-worker.js）を登録する。
 * 公開したサイトでだけ動かす（npm run dev では、作り直したものがすぐ見えるよう、登録しない）。
 * 画面には何も描かない部品
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        // 登録できなくても、サイトはふつうに使える
        console.warn(error);
      });
    };
    // ページの表示に要るものを読み終えてから
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
