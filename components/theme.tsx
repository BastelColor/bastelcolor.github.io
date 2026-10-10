'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useT } from '@/components/lang';
import { applySky } from '@/lib/sky';
import { playSound } from '@/lib/sound';
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

const listeners = new Set<() => void>();
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // 覚えられない環境では、端末の設定だけで決める
  }
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 覚えていないあいだは、端末のダークモードの切りかえにもついていく
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onChange);
  };
}

/** <html data-theme> と空の色を、いまのテーマに合わせる */
function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  applySky();
}

function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 覚えられなくても、いまのページでは切りかえる
  }
  listeners.forEach((listener) => listener());
}

/**
 * 右上の月・太陽のボタン。押したところから、新しい色がまるく広がる
 * （部屋が雲から膨らむのと同じ動き。対応していないブラウザや、動きを減らす設定ではすぐ切りかえる）
 */
export function ThemeToggle() {
  const t = useT();
  // 書き出したページと読み込んだ直後は明るいテーマとして描き、読み込んだあとで合わせる
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readTheme,
    () => 'light',
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    paint(theme);
  }, [theme]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = isDark ? 'light' : 'dark';
    playSound('chime');
    const change = () => {
      flushSync(() => saveTheme(next));
      paint(next);
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) {
      change();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = document.startViewTransition(change);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 700,
            easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // 動きが出せなくても、色は切りかわっている
      });
  };

  return (
    <button
      type="button"
      className="corner-button"
      aria-pressed={isDark}
      aria-label={t('暗い色にする', 'Dark theme')}
      title={t('暗い色にする', 'Dark theme')}
      onClick={toggle}
    >
      {isDark ? (
        // 太陽
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle className="is-filled" cx="12" cy="12" r="4.6" />
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" />
        </svg>
      ) : (
        // 月
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="is-filled"
            d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z"
          />
        </svg>
      )}
    </button>
  );
}
