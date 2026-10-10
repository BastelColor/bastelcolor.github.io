/**
 * サイトを最初に開いたときの演出（app/styles/home.css の「はじまりの演出」）。
 * 雲が下からふわっと集まってきて、そのあとに名前がぽんっと出る。
 *
 * トップ（/）を # なしで開いたとき、そのタブで1回だけ。動きを減らす設定の人にはしない。
 * <html data-intro> を付けて、演出が終わったら外す
 */
export function applyIntro() {
  try {
    if (window.location.pathname !== '/' || window.location.hash) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.sessionStorage.getItem('yzmo-intro')) return;
    window.sessionStorage.setItem('yzmo-intro', '1');
    const root = document.documentElement;
    root.dataset.intro = '';
    window.setTimeout(() => {
      delete root.dataset.intro;
    }, 2200);
  } catch {
    // 演出がないだけなので、何もしない
  }
}
