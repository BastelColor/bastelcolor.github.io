'use client';

import { useEffect, useRef, useState } from 'react';
import { WorkDetail } from '@/components/rooms/work-detail';
import { WorkThumbnail } from '@/components/rooms/work-thumbnail';
import type { WorkGenre } from '@/content/types';
import { workGenres, works } from '@/content/works';
import { pushLayers, readLayers } from '@/lib/history-layers';

/** ダイアログが消えるまでの時間（works.css の .work-dialog の transition と合わせる） */
const DIALOG_FADE_MS = 200;

/**
 * 作品はサムネイルで並べ、ジャンルで絞り込める。押すと詳細をダイアログで開く。
 * 閉じるときは、消えるアニメーションが終わってから中身を外す
 * （すぐ外すと消える途中で空になり、残したままだと動画の音が鳴り続けるため）。
 *
 * 詳細を開くと履歴を1つ積むので、ブラウザの「戻る」で詳細だけを閉じられる
 * （lib/history-layers.ts）。
 */
export function WorksRoom() {
  const [genre, setGenre] = useState<WorkGenre | 'all'>('all');
  const [shownId, setShownId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const shown = works.find((work) => work.id === shownId);

  const show = (id: string) => {
    window.clearTimeout(clearTimer.current);
    setShownId(id);
    dialog.current?.showModal();
  };
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });

  // ダイアログの外（背景）を押したら閉じる。キーボードでは Esc で閉じられる
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === element) element.close();
    };
    const onClose = () => {
      clearTimer.current = window.setTimeout(
        () => setShownId(null),
        DIALOG_FADE_MS,
      );
      // 「もどる」ボタン・背景・Esc で閉じたときは、開いたときに積んだ履歴も外す
      // （ブラウザの「戻る」で閉じたときは、もう外れている）
      if (readLayers().work) window.history.back();
    };
    // ブラウザの「戻る」「進む」で、詳細を閉じたり開き直したりする
    const onPopState = () => {
      const { work } = readLayers();
      if (!work && element.open) element.close();
      else if (work && !element.open) showRef.current(work);
    };
    element.addEventListener('click', onClick);
    element.addEventListener('close', onClose);
    window.addEventListener('popstate', onPopState);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('close', onClose);
      window.removeEventListener('popstate', onPopState);
      window.clearTimeout(clearTimer.current);
    };
  }, []);

  const open = (id: string) => {
    show(id);
    pushLayers({ room: 'works', work: id });
  };

  const listed =
    genre === 'all' ? works : works.filter((work) => work.genre === genre);

  return (
    <>
      <ul className="works-genres" aria-label="ジャンルで絞り込む">
        {[{ id: 'all' as const, label: 'すべて' }, ...workGenres].map(
          (item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={genre === item.id}
                onClick={() => setGenre(item.id)}
              >
                {item.label}
              </button>
            </li>
          ),
        )}
      </ul>

      <ul className="works">
        {listed.map((work) => (
          <li key={work.id}>
            <button
              type="button"
              className="works-item"
              onClick={() => open(work.id)}
            >
              <WorkThumbnail work={work} />
              <span className="works-item-title">{work.title}</span>
              <span className="works-item-category">{work.category}</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="work-dialog"
        aria-labelledby="work-dialog-title"
      >
        {shown && (
          <WorkDetail
            work={shown}
            titleId="work-dialog-title"
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
