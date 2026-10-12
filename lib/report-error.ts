import { countEvent } from '@/components/page-counter';

/**
 * 見ている人の端末で起きた不具合を、アクセス数の仕組み（GoatCounter）の「できごと」として数える。
 * 端末によってだけ起きる不具合（Android の Chrome でファーレが出なかった、など）に早く気づくため。
 *
 * - できごとの名前は error/<どこで>/<エラーの文>。GoatCounter のできごとの一覧で、回数が見られる
 * - 個人の情報は送らない。エラーの文から、URL と長い数字を消し、短く切ってから送る
 *   （どのブラウザ・端末かは、GoatCounter が、ほかの数と同じように自動で集計する）
 * - 同じものは1回のページの表示で1回だけ。1回の表示で送るのは 5 つまで
 * - content/site.ts の goatcounter が空・自分のパソコン（localhost）では、数えない
 */

/** 1回のページの表示で送る数の上限 */
const MAX_REPORTS = 5;
/** エラーの文の長さの上限 */
const MAX_MESSAGE = 80;

const reported = new Set<string>();

/** エラーの文を、送ってもよい短い形にする（URL・長い数字を消す） */
function clean(message: string) {
  return message
    .replace(/(?:https?|blob|data|file):[^\s)'"]*/g, 'URL')
    .replace(/\d{3,}/g, '#')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);
}

/** 何行もある文（シェーダーのエラーの記録など）の、最初の行 */
export function firstLine(text: string) {
  return text.split(/\r?\n/)[0] ?? '';
}

/** where（どこで起きたか。例: vrm-load・ar-start）と、エラーを数える */
export function reportError(where: string, error: unknown) {
  if (reported.size >= MAX_REPORTS) return;
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : 'unknown';
  const name = `error/${where}/${clean(message) || 'unknown'}`;
  if (reported.has(name)) return;
  reported.add(name);
  countEvent(name);
}

/** 拾われなかったエラー（どこかで起きて、だれも受け止めなかったもの）も数える。一度だけ呼ぶ */
export function watchErrors() {
  const onError = (event: ErrorEvent) => {
    // ほかのサイトのスクリプト（ブラウザの拡張など）のエラーは、中身が読めないので数えない
    if (!event.message || event.message === 'Script error.') return;
    // 画面の大きさの監視の、害のない知らせ
    if (event.message.includes('ResizeObserver loop')) return;
    reportError('page', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError('promise', event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
