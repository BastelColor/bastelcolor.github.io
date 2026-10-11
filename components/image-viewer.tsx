'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useT } from '@/components/lang';
import { cn } from '@/lib/utils';

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
/** 大きくできる上限と、ダブルタップ・「拡大」ボタンで大きくする倍率 */
const MAX_ZOOM = 4;
const TAP_ZOOM = 2.5;
/** ダブルタップとみなす、2回のタップのあいだの時間（ms）と、ずれ（px） */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** 押したまま動かしたとみなす距離（px）。これより動いたら、離したときの click では閉じない */
const DRAG_PX = 6;

/** 画像の大きさと位置（拡大の倍率と、真ん中からのずれ px） */
type Zoom = { scale: number; x: number; y: number };
const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

/**
 * 画像を画面いっぱいに大きく出す（作品の詳細・ブログの記事の画像）。
 * 開いている画面（作品の詳細の dialog など）の上に、もう1つ dialog を重ねて開く。
 *
 * - ← → のボタン・キー、スマホは横になぞると、前後の画像へ（なぞっているあいだ、画像が指について来る）
 * - 2本指でつまむ・ダブルタップ（ダブルクリック）・マウスのホイール・「拡大」ボタン・＋ − 0 キーで拡大。
 *   拡大しているあいだは、指やマウスで動かして見る
 * - 広い画面では、下に小さな画像の一覧を出し、押した画像へ移る
 * - 「とじる」・画像のまわり・Esc で閉じる（下の画面は開いたまま）
 */
export function ImageViewer({ images, ref }: ImageViewerProps) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  // 指やマウスで動かしているあいだ（画像がすぐについて来るよう、なめらかに動かす効果を止める）
  const [dragging, setDragging] = useState(false);
  const current = images[index];
  const hasMany = images.length > 1;
  const zoomed = zoom.scale > 1.01;

  // 1枚だけなら動かない。移ったら、大きさはもとにもどす
  const move = (step: number) => {
    setIndex((i) => (i + step + images.length) % images.length);
    setZoom(NO_ZOOM);
  };

  // 画像の、拡大していないときの真ん中と大きさ（画面の座標）
  const restingBox = (current: Zoom) => {
    const rect = image.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      cx: rect.left + rect.width / 2 - current.x,
      cy: rect.top + rect.height / 2 - current.y,
      width: rect.width / current.scale,
      height: rect.height / current.scale,
    };
  };

  /** 画面のはしから大きく外れないよう、ずれを抑える */
  const clamp = (next: Zoom, box: { width: number; height: number }): Zoom => {
    if (next.scale <= 1) return NO_ZOOM;
    const maxX = ((next.scale - 1) * box.width) / 2;
    const maxY = ((next.scale - 1) * box.height) / 2;
    return {
      scale: next.scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  /** 画面の (px, py) を動かさずに、scale 倍にする */
  const zoomAt = (current: Zoom, scale: number, px: number, py: number): Zoom => {
    const box = restingBox(current);
    if (!box) return current;
    const nextScale = Math.max(1, Math.min(MAX_ZOOM, scale));
    const ratio = nextScale / current.scale;
    const dx = px - box.cx;
    const dy = py - box.cy;
    return clamp(
      {
        scale: nextScale,
        x: dx - (dx - current.x) * ratio,
        y: dy - (dy - current.y) * ratio,
      },
      box,
    );
  };

  // イベントの中から、いまの値を読めるようにする（dialog には addEventListener で付ける）
  const state = useRef({ zoom, move, zoomAt, clamp, restingBox });
  // 何枚あるかも、イベントの中から読む
  const hasManyRef = useRef(hasMany);
  useEffect(() => {
    state.current = { zoom, move, zoomAt, clamp, restingBox };
    hasManyRef.current = hasMany;
  });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // 押している指（マウス）の位置
    const pointers = new Map<number, { x: number; y: number }>();
    let start: {
      zoom: Zoom;
      x: number;
      y: number;
      distance: number;
      midX: number;
      midY: number;
    } | null = null;
    let moved = false;
    // 動かし終わりの直後に来る click では閉じない
    let suppressClick = false;
    // 押し始めたのが、画像のまわり（dialog そのもの）だったか。指やマウスをつかまえている
    // （setPointerCapture）ので、click は、どこを押しても dialog に届くため、押し始めで見分ける
    let pressedBackdrop = false;
    let lastTap = { time: 0, x: 0, y: 0 };

    const setFrom = (next: Zoom) => setZoom(next);
    const midpoint = () => {
      const [a, b] = [...pointers.values()];
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };
    const begin = () => {
      const first = [...pointers.values()][0];
      const mid = pointers.size >= 2 ? midpoint() : { x: first.x, y: first.y, distance: 0 };
      start = {
        zoom: state.current.zoom,
        x: first.x,
        y: first.y,
        distance: mid.distance,
        midX: mid.x,
        midY: mid.y,
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      // ボタン（前後・とじる・一覧）は、ふつうに押せるようにする
      if ((event.target as Element).closest('button')) {
        pressedBackdrop = false;
        return;
      }
      if (pointers.size === 0) pressedBackdrop = event.target === element;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      element.setPointerCapture(event.pointerId);
      moved = false;
      begin();
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !start) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const { zoomAt, clamp, restingBox } = state.current;
      if (pointers.size >= 2) {
        // 2本指: つまんで拡大・縮小し、指の真ん中の動きについて行く
        moved = true;
        const mid = midpoint();
        if (start.distance <= 0) return;
        const scaled = zoomAt(start.zoom, start.zoom.scale * (mid.distance / start.distance), start.midX, start.midY);
        const box = restingBox(start.zoom);
        setFrom(box ? clamp({ ...scaled, x: scaled.x + mid.x - start.midX, y: scaled.y + mid.y - start.midY }, box) : scaled);
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > DRAG_PX) moved = true;
      if (start.zoom.scale > 1.01) {
        // 拡大しているとき: 動かして見る
        const box = restingBox(start.zoom);
        if (box) setFrom(clamp({ ...start.zoom, x: start.zoom.x + dx, y: start.zoom.y + dy }, box));
      } else if (event.pointerType === 'touch' && hasManyRef.current) {
        // 拡大していないとき: 横になぞると、画像が指について来る
        setFrom({ scale: 1, x: dx, y: 0 });
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      const last = pointers.get(event.pointerId)!;
      pointers.delete(event.pointerId);
      if (moved) suppressClick = true;
      if (pointers.size > 0) {
        // 2本指のうち1本を離したら、残りの指で動かし続ける
        begin();
        return;
      }
      setDragging(false);
      const { zoom: now, move, zoomAt } = state.current;
      if (start && start.zoom.scale <= 1.01 && now.scale <= 1.01 && event.pointerType === 'touch') {
        // なぞった距離が足りれば前後の画像へ。足りなければ、もとの位置へもどる
        const dx = event.clientX - start.x;
        if (hasManyRef.current && Math.abs(dx) >= SWIPE_PX) move(dx < 0 ? 1 : -1);
        else setFrom(NO_ZOOM);
      }
      // ダブルタップで、そこを拡大する（拡大していたら、もとにもどす）
      if (!moved && event.pointerType === 'touch') {
        const time = performance.now();
        if (
          time - lastTap.time < DOUBLE_TAP_MS &&
          Math.hypot(last.x - lastTap.x, last.y - lastTap.y) < DOUBLE_TAP_PX
        ) {
          setFrom(now.scale > 1.01 ? NO_ZOOM : zoomAt(now, TAP_ZOOM, last.x, last.y));
          lastTap = { time: 0, x: 0, y: 0 };
          suppressClick = true;
        } else {
          lastTap = { time, x: last.x, y: last.y };
        }
      }
      start = null;
    };

    const onPointerCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) {
        setDragging(false);
        start = null;
        if (state.current.zoom.scale <= 1.01) setFrom(NO_ZOOM);
      }
    };

    const onClick = (event: MouseEvent) => {
      const backdrop = pressedBackdrop;
      pressedBackdrop = false;
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      // 画像のまわり（dialog そのもの）を押したら閉じる（キーボードでボタンを押したときは閉じない）
      if (backdrop && !(event.target as Element).closest('button')) element.close();
    };

    const onDoubleClick = (event: MouseEvent) => {
      // dblclick も dialog に届くので、押した場所が画像の上かで見分ける
      const rect = image.current?.getBoundingClientRect();
      if (
        !rect ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }
      const { zoom: now, zoomAt } = state.current;
      setFrom(now.scale > 1.01 ? NO_ZOOM : zoomAt(now, TAP_ZOOM, event.clientX, event.clientY));
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { zoom: now, zoomAt } = state.current;
      setFrom(zoomAt(now, now.scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const { zoom: now, move, zoomAt, restingBox } = state.current;
      const box = restingBox(now);
      const center = box ? { x: box.cx, y: box.cy } : { x: 0, y: 0 };
      if (event.key === 'ArrowRight') move(1);
      else if (event.key === 'ArrowLeft') move(-1);
      else if (event.key === '+' || event.key === '=') setFrom(zoomAt(now, now.scale * 1.5, center.x, center.y));
      else if (event.key === '-') setFrom(zoomAt(now, now.scale / 1.5, center.x, center.y));
      else if (event.key === '0') setFrom(NO_ZOOM);
    };

    // 閉じたら、大きさはもとにもどす
    const onClose = () => {
      pointers.clear();
      setDragging(false);
      setFrom(NO_ZOOM);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('click', onClick);
    element.addEventListener('dblclick', onDoubleClick);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('close', onClose);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('click', onClick);
      element.removeEventListener('dblclick', onDoubleClick);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('close', onClose);
    };
  }, []);

  // となりの画像は先に読んでおき、移ったときにすぐ出す
  useEffect(() => {
    if (!hasMany) return;
    for (const step of [1, -1]) {
      const next = images[(index + step + images.length) % images.length];
      if (next) new Image().src = next.src;
    }
  }, [images, index, hasMany]);

  useImperativeHandle(ref, () => ({
    open: (i: number) => {
      setIndex(i);
      setZoom(NO_ZOOM);
      dialog.current?.showModal();
    },
  }));

  // 「拡大」ボタン: 画像の真ん中を拡大する（拡大していたら、もとにもどす）
  const toggleZoom = () => {
    if (zoomed) {
      setZoom(NO_ZOOM);
      return;
    }
    const box = restingBox(zoom);
    if (box) setZoom(zoomAt(zoom, TAP_ZOOM, box.cx, box.cy));
  };

  return (
    <dialog
      ref={dialog}
      className={cn('image-viewer', hasMany && 'has-thumbs', zoomed && 'is-zoomed')}
      aria-label={t('画像を大きく見る', 'Image viewer')}
    >
      {current && (
        <figure className="image-viewer-figure">
          <img
            ref={image}
            src={current.src}
            alt={current.alt}
            draggable={false}
            className={cn(dragging && 'is-dragging')}
            style={{
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            }}
          />
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
          {/* 広い画面では、小さな画像の一覧から選べる */}
          <div className="image-viewer-thumbs">
            {images.map((item, i) => (
              <button
                key={item.src}
                type="button"
                aria-label={t(`${i + 1}枚目の画像`, `Image ${i + 1}`)}
                aria-current={i === index}
                onClick={() => {
                  setIndex(i);
                  setZoom(NO_ZOOM);
                }}
              >
                <img src={item.src} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className="image-viewer-zoom"
        aria-pressed={zoomed}
        onClick={toggleZoom}
      >
        {zoomed ? t('もどす', 'Fit') : t('拡大', 'Zoom')}
      </button>
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
