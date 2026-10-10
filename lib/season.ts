import { useSyncExternalStore } from 'react';
import { seasons } from '@/content/seasons';
import type { Season } from '@/content/types';

/** その日（月・日）にあてはまる季節（content/seasons.ts）。なければ null */
export function seasonOn(date: Date): Season | null {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return (
    seasons.find((season) =>
      season.start <= season.end
        ? season.start <= mmdd && mmdd <= season.end
        : // 年をまたぐ期間（例: 12-20 〜 01-05）
          mmdd >= season.start || mmdd <= season.end,
    ) ?? null
  );
}

const noSubscribe = () => () => {};

/**
 * いまの季節。見ている人の日付で決めるので、書き出したページと読み込んだ直後は「季節なし」で描き、
 * 読み込んだあとで合わせる
 */
export function useSeason(): Season | null {
  return useSyncExternalStore(
    noSubscribe,
    () => seasonOn(new Date()),
    () => null,
  );
}
