import { pages } from '@/content/pages';
import type { PageId } from '@/content/types';

/**
 * 部屋や作品の詳細を開くたびに、ブラウザの履歴を1つ積み、URL の # を変える。
 *
 *   トップ             https://bastelcolor.github.io/
 *   さくひんの部屋     https://bastelcolor.github.io/#works
 *   作品の詳細         https://bastelcolor.github.io/#works/toon-shader
 *
 * - ブラウザやスマホの「戻る」で、ひとつ前の画面（詳細 → 部屋 → トップ）へ順にもどれる
 *   （積まないと、サイトに来る前のページまで一気にもどってしまう）
 * - # 付きの URL をそのまま開いたり共有したりすると、その部屋・作品が開く
 *
 * サイトの「もどる」ボタンなどで閉じるときは leaveLayer を使う。
 * このサイトの中で積んだ履歴なら history.back() し、実際に閉じるのは popstate を受けた側で行う
 * （ブラウザの「戻る」と同じ道を通す）。# 付きの URL を直接開いたときは、もどる先の履歴が
 * サイトに無いので、URL だけを書きかえて、呼んだ側がそのまま閉じる。
 */
export type HistoryLayers = {
  /** 開いている部屋 */
  room?: PageId;
  /** さくひんの部屋で開いている作品の詳細 */
  work?: string;
};

type StoredLayers = HistoryLayers & {
  /** このサイトの中で積んだ数。0 なら、もどる先がサイトの中に無い */
  depth: number;
};

const KEY = 'yzmo';

/** いまの履歴で開いているもの。履歴に無ければ URL の # から読む */
export function readLayers(): StoredLayers {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object') {
    const stored = (state as Record<string, unknown>)[KEY];
    if (stored && typeof stored === 'object') return stored as StoredLayers;
  }
  return { ...parseHash(window.location.hash), depth: 0 };
}

/** 開いたものを履歴に積み、URL の # を変える */
export function pushLayers(layers: HistoryLayers) {
  const depth = readLayers().depth + 1;
  window.history.pushState({ [KEY]: { ...layers, depth } }, '', toUrl(layers));
}

/** いまの履歴を書きかえる（積まない） */
export function replaceLayers(layers: HistoryLayers) {
  const { depth } = readLayers();
  window.history.replaceState(
    { [KEY]: { ...layers, depth } },
    '',
    toUrl(layers),
  );
}

/**
 * いまの画面を閉じて、ひとつ前（fallback）へもどる。
 * サイトの中で積んだ履歴なら history.back() して true を返す（閉じるのは popstate で）。
 * そうでなければ、URL を fallback に書きかえて false を返す（呼んだ側がすぐ閉じる）
 */
export function leaveLayer(fallback: HistoryLayers): boolean {
  if (readLayers().depth > 0) {
    window.history.back();
    return true;
  }
  replaceLayers(fallback);
  return false;
}

function toUrl({ room, work }: HistoryLayers) {
  const base = window.location.pathname + window.location.search;
  if (!room) return base;
  return `${base}#${room}${work ? `/${encodeURIComponent(work)}` : ''}`;
}

/** 「#works/toon-shader」を { room: 'works', work: 'toon-shader' } にする。知らない部屋は無視する */
function parseHash(hash: string): HistoryLayers {
  const [room, work] = hash.replace(/^#/, '').split('/');
  if (!pages.some((page) => page.id === room)) return {};
  return {
    room: room as PageId,
    work: work ? decodeURIComponent(work) : undefined,
  };
}
