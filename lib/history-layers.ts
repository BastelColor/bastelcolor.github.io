import type { PageId } from '@/content/types';

/**
 * 部屋や作品の詳細を開くたびに、ブラウザの履歴を1つ積む。
 * URL は変えずに、履歴の state に「いま何が開いているか」だけを書いておく。
 *
 * こうすると、ブラウザやスマホの「戻る」で、ひとつ前の画面（詳細 → 部屋 → トップ）へ
 * 順にもどれる（積まないと、サイトに来る前のページまで一気にもどってしまう）。
 *
 * - 開くとき: pushLayers で履歴を積む
 * - サイトの「もどる」ボタンなどで閉じるとき: 積んだ履歴があれば history.back() し、
 *   実際に閉じるのは popstate を受けた側で行う（ブラウザの「戻る」と同じ道を通す）
 */
export type HistoryLayers = {
  /** 開いている部屋 */
  room?: PageId;
  /** さくひんの部屋で開いている作品の詳細 */
  work?: string;
};

const KEY = 'yzmo';

export function readLayers(): HistoryLayers {
  const state: unknown = window.history.state;
  if (!state || typeof state !== 'object') return {};
  const layers = (state as Record<string, unknown>)[KEY];
  return layers && typeof layers === 'object' ? (layers as HistoryLayers) : {};
}

export function pushLayers(layers: HistoryLayers) {
  window.history.pushState({ [KEY]: layers }, '');
}
