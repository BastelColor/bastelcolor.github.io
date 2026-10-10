'use client';

import { useEffect } from 'react';
import { reducesMotion } from '@/lib/motion';

/** 星を出す間隔（px）。これだけマウスが動いたら1つ出す */
const SPACING = 26;
/** 同時に出ている星の上限 */
const MAX_SPARKLES = 24;
/** 4つの部屋の色（app/styles/base.css） */
const TONES = ['pink', 'mint', 'blue', 'yellow'];

/**
 * マウスを動かすと、小さな星がついてきて、ふわっと消える（app/styles/base.css の .sparkle）。
 * マウスのある画面だけ。動きを減らしているとき（lib/motion.ts）は出さない。画面には何も描かない部品
 */
export function CursorSparkles() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let last: { x: number; y: number } | null = null;
    let count = 0;
    let tone = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !fine.matches || reducesMotion()) {
        return;
      }
      const { clientX: x, clientY: y } = event;
      if (last && Math.hypot(x - last.x, y - last.y) < SPACING) return;
      last = { x, y };
      if (count >= MAX_SPARKLES) return;
      const sparkle = document.createElement('span');
      sparkle.className = `sparkle ${TONES[tone % TONES.length]}`;
      tone += 1;
      sparkle.style.left = `${x}px`;
      sparkle.style.top = `${y}px`;
      // 少しずつ違う大きさ・向き・落ち方にする
      sparkle.style.setProperty('--size', `${12 + Math.random() * 8}px`);
      sparkle.style.setProperty('--drift', `${(Math.random() - 0.5) * 30}px`);
      sparkle.style.setProperty('--spin', `${(Math.random() - 0.5) * 180}deg`);
      sparkle.append(document.createElement('span'));
      count += 1;
      sparkle.addEventListener(
        'animationend',
        () => {
          sparkle.remove();
          count -= 1;
        },
        { once: true },
      );
      document.body.append(sparkle);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return null;
}
