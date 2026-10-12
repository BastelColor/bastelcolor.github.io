'use client';

import { useEffect } from 'react';
import { site } from '@/content/site';
import { watchErrors } from '@/lib/report-error';

/** 見ている人の端末で起きた、拾われなかったエラーを数える（lib/report-error.ts）。画面には何も出さない */
export function ErrorWatcher() {
  useEffect(() => {
    if (!site.goatcounter) return;
    return watchErrors();
  }, []);
  return null;
}
