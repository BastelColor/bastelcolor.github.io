/**
 * トップと 404 の空の色を、見ている人の時間帯で変える（app/styles/sky.css）。
 *
 *   朝 5〜9時 / 昼 9〜16時 / 夕方 16〜19時 / 夜 19〜5時
 *   暗いテーマ（lib/theme.ts）のときは、時間に関係なく夜の空（星空）を出す
 *
 * <html data-sky="morning|day|evening|night"> に書く。部屋の中（屋内）の色は変えない。
 */
import { applyIntro } from '@/lib/intro';
import { applyTheme } from '@/lib/theme';

export type SkyPhase = 'morning' | 'day' | 'evening' | 'night';

/**
 * いまの時間帯を <html> に書く。ページを描く前に1回（SKY_SCRIPT）と、
 * そのあと時間がたったとき（components/sky-clock.tsx）やテーマを切りかえたとき（components/theme.tsx）に呼ぶ。
 * 文字列にして <head> に埋め込むので、外の変数や import を使わないこと
 */
export function applySky() {
  try {
    const hour = new Date().getHours();
    let phase = 'night';
    if (hour >= 5 && hour < 9) phase = 'morning';
    else if (hour >= 9 && hour < 16) phase = 'day';
    else if (hour >= 16 && hour < 19) phase = 'evening';
    if (document.documentElement.dataset.theme === 'dark') phase = 'night';
    document.documentElement.dataset.sky = phase;
  } catch {
    // 空の色が変わらないだけなので、何もしない
  }
}

/**
 * ページを描く前にテーマと空の色を決め、はじまりの演出をするかを決める、<head> に置く小さなスクリプト
 * （暗いテーマの人や夜に一瞬だけ明るい画面が見えたり、演出の前に雲が一瞬見えたりしないように）
 */
export const SKY_SCRIPT = [applyTheme, applySky, applyIntro]
  .map((apply) => `(${apply.toString()})();`)
  .join('');
