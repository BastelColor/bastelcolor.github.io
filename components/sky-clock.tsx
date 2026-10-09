'use client';

import { useEffect } from 'react';
import { applySky } from '@/lib/sky';

/** 時間帯が変わったら空の色を変える間隔 */
const CHECK_MS = 5 * 60 * 1000;

/**
 * ページを開いたままでも、時間がたったり、端末のダークモードを切りかえたりしたら、
 * 空の色を合わせ直す（lib/sky.ts）。画面には何も出さない
 */
export function SkyClock() {
  useEffect(() => {
    applySky();
    const timer = window.setInterval(applySky, CHECK_MS);
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', applySky);
    return () => {
      window.clearInterval(timer);
      dark.removeEventListener('change', applySky);
    };
  }, []);
  return null;
}
