'use client';

import { useEffect, useRef, useState } from 'react';
import { WorkDetail } from '@/components/rooms/work-detail';
import { WorkThumbnail } from '@/components/rooms/work-thumbnail';
import { site } from '@/content/site';
import type { WorkGenre } from '@/content/types';
import { workGenres, works } from '@/content/works';
import {
  leaveLayer,
  pushLayers,
  readLayers,
  replaceLayers,
} from '@/lib/history-layers';

/** ダイアログが消えるまでの時間（works.css の .work-dialog の transition と合わせる） */
const DIALOG_FADE_MS = 200;
/** # 付きの URL で来たとき、部屋が広がってから作品の詳細を開くまでの時間 */
const LINKED_OPEN_DELAY_MS = 700;

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
      if (readLayers().work) leaveLayer({ room: 'works' });
    };
    // ブラウザの「戻る」「進む」で、詳細を閉じたり開き直したりする
    const onPopState = () => {
      const { work } = readLayers();
      if (!work && element.open) element.close();
      else if (work && !element.open) showRef.current(work);
    };
    // # 付きの URL（例: /#works/toon-shader）で来たら、部屋が開いてからその作品を開く。
    // 知らない作品なら、URL を部屋だけにもどす
    const linked = readLayers().work;
    const linkTimer = linked
      ? window.setTimeout(() => {
          if (works.some((work) => work.id === linked)) showRef.current(linked);
          else replaceLayers({ room: 'works' });
        }, LINKED_OPEN_DELAY_MS)
      : undefined;
    element.addEventListener('click', onClick);
    element.addEventListener('close', onClose);
    window.addEventListener('popstate', onPopState);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('close', onClose);
      window.removeEventListener('popstate', onPopState);
      window.clearTimeout(clearTimer.current);
      window.clearTimeout(linkTimer);
    };
  }, []);

  const open = (id: string) => {
    show(id);
    pushLayers({ room: 'works', work: id });
  };

  // ブラウザのタブの名前も、開いている作品に合わせる
  // （URL は書きかえるだけで、ページの読み込み直しは起きないため）
  useEffect(() => {
    if (!shown) return;
    document.title = `${shown.title} | ${site.title}`;
    return () => {
      document.title = site.title;
    };
  }, [shown]);

  const listed =
    genre === 'all' ? works : works.filter((work) => work.genre === genre);

  // 詳細の「前の作品・次の作品」。いま一覧に出ている順（絞り込み中ならその中）でたどる
  const shownIndex = listed.findIndex((work) => work.id === shownId);
  const previous = shownIndex > 0 ? listed[shownIndex - 1] : undefined;
  const next =
    shownIndex >= 0 && shownIndex < listed.length - 1
      ? listed[shownIndex + 1]
      : undefined;
  // 詳細を開いたまま、となりの作品へ切りかえる（履歴は積まず、URL だけ変える）
  const switchTo = (id: string) => {
    setShownId(id);
    replaceLayers({ room: 'works', work: id });
    dialog.current?.scrollTo({ top: 0 });
  };

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
            previous={previous}
            next={next}
            onSwitch={switchTo}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
