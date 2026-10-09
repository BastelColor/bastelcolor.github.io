'use client';

import { useEffect, useRef, useState } from 'react';
import type { WorkImage } from '@/content/types';

type WorkImageViewerProps = {
  images: WorkImage[];
};

/** 指で横になぞったとき、次・前の画像へ移るのに必要な距離（px） */
const SWIPE_PX = 50;

/**
 * 作品の詳細の画像一覧。押すと、その画像を画面いっぱいに大きく出す。
 * 作品の詳細（dialog）の上に、もう1つ dialog を重ねて開く。
 *
 * - ← → のボタン・キー、スマホは横になぞると、前後の画像へ
 * - 「とじる」・画像のまわり・Esc で閉じる（作品の詳細は開いたまま）
 */
export function WorkImageViewer({ images }: WorkImageViewerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const current = images[index];
  const hasMany = images.length > 1;

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  // 1枚だけなら動かない
  const move = (step: number) =>
    setIndex((i) => (i + step + images.length) % images.length);

  // 画像のまわり（dialog そのもの）を押したら閉じる。← → キーと、指で横になぞると前後の画像へ
  // （作品の詳細と同じく、dialog には addEventListener で付ける）
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let swipeStart: number | null = null;
    // なぞり終わりの直後に来る click では閉じない
    let swiped = false;
    const onClick = (event: MouseEvent) => {
      if (swiped) {
        swiped = false;
        return;
      }
      if (event.target === element) element.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') moveRef.current(1);
      if (event.key === 'ArrowLeft') moveRef.current(-1);
    };
    const onPointerDown = (event: PointerEvent) => {
      swipeStart = event.pointerType === 'touch' ? event.clientX : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (swipeStart === null) return;
      const distance = event.clientX - swipeStart;
      swipeStart = null;
      swiped = Math.abs(distance) >= SWIPE_PX;
      if (swiped) moveRef.current(distance < 0 ? 1 : -1);
    };
    element.addEventListener('click', onClick);
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <>
      <ul className="work-detail-images">
        {images.map((image, i) => (
          <li key={image.src}>
            <button
              type="button"
              className="work-detail-image"
              aria-label={`画像を大きく見る（${i + 1}枚目）`}
              onClick={() => open(i)}
            >
              <img src={image.src} alt={image.alt} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="work-viewer"
        aria-label="画像を大きく見る"
      >
        {current && (
          <figure className="work-viewer-figure">
            <img src={current.src} alt={current.alt} />
            {hasMany && (
              <figcaption>
                {index + 1} / {images.length}
              </figcaption>
            )}
          </figure>
        )}
        {hasMany && (
          <>
            <button
              type="button"
              className="work-viewer-nav is-prev"
              aria-label="前の画像"
              onClick={() => move(-1)}
            >
              <Arrow />
            </button>
            <button
              type="button"
              className="work-viewer-nav is-next"
              aria-label="次の画像"
              onClick={() => move(1)}
            >
              <Arrow />
            </button>
          </>
        )}
        <button
          type="button"
          className="work-viewer-close"
          onClick={() => dialog.current?.close()}
        >
          とじる
        </button>
      </dialog>
    </>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M10 3 5 8l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
