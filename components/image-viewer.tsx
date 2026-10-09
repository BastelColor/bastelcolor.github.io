'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useT } from '@/components/lang';

export type ViewerImage = { src: string; alt: string };

/** 外から開くための窓口（ref で受け取る） */
export type ImageViewerHandle = {
  /** images の index 番目を大きく出す */
  open: (index: number) => void;
};

type ImageViewerProps = {
  images: ViewerImage[];
  ref: Ref<ImageViewerHandle>;
};

/** 指で横になぞったとき、次・前の画像へ移るのに必要な距離（px） */
const SWIPE_PX = 50;

/**
 * 画像を画面いっぱいに大きく出す（作品の詳細・ブログの記事の画像）。
 * 開いている画面（作品の詳細の dialog など）の上に、もう1つ dialog を重ねて開く。
 *
 * - ← → のボタン・キー、スマホは横になぞると、前後の画像へ
 * - 「とじる」・画像のまわり・Esc で閉じる（下の画面は開いたまま）
 */
export function ImageViewer({ images, ref }: ImageViewerProps) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const current = images[index];
  const hasMany = images.length > 1;

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

  useImperativeHandle(ref, () => ({
    open: (i: number) => {
      setIndex(i);
      dialog.current?.showModal();
    },
  }));

  return (
    <dialog
      ref={dialog}
      className="image-viewer"
      aria-label={t('画像を大きく見る', 'Image viewer')}
    >
      {current && (
        <figure className="image-viewer-figure">
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
            className="image-viewer-nav is-prev"
            aria-label={t('前の画像', 'Previous image')}
            onClick={() => move(-1)}
          >
            <Arrow />
          </button>
          <button
            type="button"
            className="image-viewer-nav is-next"
            aria-label={t('次の画像', 'Next image')}
            onClick={() => move(1)}
          >
            <Arrow />
          </button>
        </>
      )}
      <button
        type="button"
        className="image-viewer-close"
        onClick={() => dialog.current?.close()}
      >
        {t('とじる', 'Close')}
      </button>
    </dialog>
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
