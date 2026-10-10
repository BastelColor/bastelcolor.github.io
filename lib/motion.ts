/**
 * 動きを減らすかどうか。
 *
 * - 最初は、端末の「視差効果を減らす」「アニメーションを減らす」などの設定に合わせる
 * - 右上のボタン（components/motion-toggle.tsx）で切りかえると、このブラウザに覚えておく
 *
 * <html data-motion="reduce|full"> に書く。CSS は、端末の設定ではなく、この印を見て動きを止める
 * （app/styles/base.css ほか）。プログラムからは reducesMotion() / useReducedMotion() で調べる
 */
import { useSyncExternalStore } from 'react';

export const MOTION_STORAGE_KEY = 'yzmo-motion';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 覚えている設定、なければ端末の設定を <html> に書く。
 * 文字列にして <head> に埋め込むので（lib/sky.ts の SKY_SCRIPT）、外の変数や import を使わないこと
 */
export function applyMotion() {
  try {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem('yzmo-motion');
    } catch {
      // 覚えられない環境では、端末の設定だけで決める
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.motion =
      saved === 'reduce' || saved === 'full'
        ? saved
        : reduce
          ? 'reduce'
          : 'full';
  } catch {
    // 動きはそのまま（端末の設定に合わせた CSS が効く）
  }
}

function readSaved() {
  try {
    const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
    if (saved === 'reduce' || saved === 'full') return saved;
  } catch {
    // 覚えられない環境では、端末の設定だけで決める
  }
  return null;
}

/** いま、動きを減らしているか */
export function reducesMotion() {
  const saved = readSaved();
  if (saved) return saved === 'reduce';
  return window.matchMedia(REDUCED_QUERY).matches;
}

const listeners = new Set<() => void>();

export function subscribeMotion(onChange: () => void) {
  listeners.add(onChange);
  // 覚えていないあいだは、端末の設定の切りかえにもついていく
  const media = window.matchMedia(REDUCED_QUERY);
  media.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onChange);
  };
}

/** 動きを減らすかを切りかえて、覚えておく */
export function setReducesMotion(reduce: boolean) {
  const value = reduce ? 'reduce' : 'full';
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, value);
  } catch {
    // 覚えられなくても、いまのページでは切りかえる
  }
  document.documentElement.dataset.motion = value;
  listeners.forEach((listener) => listener());
}

/**
 * 動きを減らしているか（切りかえたら描き直す）。
 * 書き出したページと読み込んだ直後は serverValue として描き、読み込んだあとで合わせる
 */
export function useReducedMotion(serverValue = false) {
  return useSyncExternalStore(
    subscribeMotion,
    reducesMotion,
    () => serverValue,
  );
}
