/**
 * 明るいテーマ / 暗いテーマ（app/styles/dark.css）。
 *
 * - 最初は、端末のダークモードに合わせる
 * - 右上の月・太陽のボタン（components/theme.tsx）で切りかえると、このブラウザに覚えておく
 *
 * <html data-theme="light|dark"> に書く。暗いテーマでは、トップと 404 の空も夜になる（lib/sky.ts）
 */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'yzmo-theme';

/**
 * 覚えているテーマ、なければ端末の設定を <html> に書く。
 * 文字列にして <head> に埋め込むので（lib/sky.ts の SKY_SCRIPT）、外の変数や import を使わないこと
 */
export function applyTheme() {
  try {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem('yzmo-theme');
    } catch {
      // 覚えられない環境では、端末の設定だけで決める
    }
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme =
      saved === 'light' || saved === 'dark' ? saved : dark ? 'dark' : 'light';
  } catch {
    // 明るいテーマのままになるだけなので、何もしない
  }
}
