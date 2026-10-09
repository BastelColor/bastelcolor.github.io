'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Mascot } from '@/content/types';

/** つつかれて跳ねている時間（room.css の room-mascot-poke と合わせる） */
const POKE_MS = 700;
/** 押せるもの。ここを押したときは、うしろの子をつついたことにしない */
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, dialog, [role="button"], canvas';

/**
 * 部屋の右下からのぞく子。かざりなので中身（文字や画像）よりうしろに置いてあり、
 * 部屋の何もないところ越しにこの子を押すと「つついた」ことにして、ぴょんと跳ねてハートが出る。
 * 中身の上をふさがないよう、ボタンにはせず、部屋で押された位置がこの子に重なるかで判断する
 */
export function RoomMascot({ mascot }: { mascot: Mascot }) {
  const image = useRef<HTMLImageElement>(null);
  const [pokes, setPokes] = useState(0);
  const [isPoked, setIsPoked] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = image.current;
    const room = element?.closest('.room');
    if (!element || !room) return;
    const onClick = (event: Event) => {
      const { clientX: x, clientY: y, target } = event as MouseEvent;
      if (target instanceof Element && target.closest(INTERACTIVE)) return;
      // 画像の左の余白（撮影範囲の端）は除く
      const rect = element.getBoundingClientRect();
      const inside =
        x >= rect.left + rect.width * 0.15 &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom;
      if (!inside) return;
      setPokes((count) => count + 1);
      setIsPoked(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIsPoked(false), POKE_MS);
    };
    room.addEventListener('click', onClick);
    return () => {
      room.removeEventListener('click', onClick);
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <>
      <img
        ref={image}
        className={isPoked ? 'room-mascot is-poked' : 'room-mascot'}
        src={mascot.happy}
        style={{ '--mascot-width': mascot.width ?? 1 } as CSSProperties}
        alt=""
      />
      {/* つつくたびに作り直して、ハートを頭の上へ浮かべる */}
      {pokes > 0 && (
        <span key={pokes} className="room-mascot-hearts" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <svg
              key={i}
              viewBox="0 0 16 16"
              style={{ '--i': i } as CSSProperties}
            >
              <path d="M8 14S1.5 9.8 1.5 5.6A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6.5 1.6C14.5 9.8 8 14 8 14Z" />
            </svg>
          ))}
        </span>
      )}
    </>
  );
}
