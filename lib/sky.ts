/**
 * トップと 404 の空の色を、見ている人の時間帯で変える（app/styles/sky.css）。
 *
 *   朝 5〜9時 / 昼 9〜16時 / 夕方 16〜19時 / 夜 19〜5時
 *   端末をダークモードにしている人には、時間に関係なく夜の空（星空）を出す
 *
 * <html data-sky="morning|day|evening|night"> に書く。部屋の中（屋内）の色は変えない。
 */
export type SkyPhase = 'morning' | 'day' | 'evening' | 'night';

/**
 * いまの時間帯を <html> に書く。ページを描く前に1回（SKY_SCRIPT）と、
 * そのあと時間がたったときやダークモードを切りかえたとき（components/sky-clock.tsx）に呼ぶ。
 * 文字列にして <head> に埋め込むので、外の変数や import を使わないこと
 */
export function applySky() {
  try {
    const hour = new Date().getHours();
    let phase = 'night';
    if (hour >= 5 && hour < 9) phase = 'morning';
    else if (hour >= 9 && hour < 16) phase = 'day';
    else if (hour >= 16 && hour < 19) phase = 'evening';
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      phase = 'night';
    }
    document.documentElement.dataset.sky = phase;
  } catch {
    // 空の色が変わらないだけなので、何もしない
  }
}

/** ページを描く前に空の色を決める、<head> に置く小さなスクリプト（夜に一瞬だけ昼の空が見えないように） */
export const SKY_SCRIPT = `(${applySky.toString()})()`;
