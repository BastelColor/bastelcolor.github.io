import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';

/**
 * トップの隠しコマンド。みんながいっせいにぴょんぴょん跳ねる（app/styles/home.css の「隠しコマンド」）。
 *
 * - キーボード: ↑ ↑ ↓ ↓ ← → ← → B A
 * - スマホなど: 「Yzmo」の文字を、2秒のうちに5回つつく（onTap を名前に付ける）
 *
 * party は跳ねるたびに増える番号（0 のあいだは何もしない）。key に使うと、続けて出したときも最初から動く
 */
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];
const TAPS = 5;
const TAP_WINDOW_MS = 2000;
/** 跳ねている時間（home.css の動きと合わせる） */
const PARTY_MS = 2600;

export function useSecretParty(enabled: boolean) {
  const [party, setParty] = useState(0);
  const [active, setActive] = useState(false);
  const progress = useRef(0);
  const taps = useRef<number[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const start = () => {
    playSound('chime');
    playSound('boing');
    setParty((count) => count + 1);
    setActive(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(false), PARTY_MS);
  };
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === SEQUENCE[progress.current]) {
        progress.current += 1;
        if (progress.current === SEQUENCE.length) {
          progress.current = 0;
          startRef.current();
        }
      } else {
        progress.current = key === SEQUENCE[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** 「Yzmo」の文字をつついたとき */
  const onTap = (timeStamp: number) => {
    taps.current = [
      ...taps.current.filter((time) => timeStamp - time < TAP_WINDOW_MS),
      timeStamp,
    ];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      start();
    }
  };

  return { party: active ? party : 0, onTap };
}
