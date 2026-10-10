'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useT } from '@/components/lang';
import { useReducedMotion } from '@/lib/motion';
import { playSound } from '@/lib/sound';

/**
 * 「ページがみつかりません」の画面の、小さなあそび。星が空から降ってくるので、押してつかまえる。
 *
 * - 「星をつかまえる」を押すと始まり、「おわる」で止まる
 * - いちばんたくさんつかまえた数は、このブラウザに覚えておく
 * - 動きを減らす設定の人には出さない（星が降る動きそのものが遊びなので）
 * 見た目は app/styles/not-found.css の「星をつかまえる」
 */

/** 星が降ってくる間隔（ミリ秒） */
const SPAWN_MS = 750;
/** 星が下まで落ちる時間の、いちばん短い・長い（秒） */
const FALL_MIN = 3.6;
const FALL_MAX = 6;
const TONES = ['pink', 'mint', 'blue', 'yellow'] as const;
const BEST_KEY = 'yzmo-star-best';

type FallingStar = {
  id: number;
  /** 左からの位置（%） */
  x: number;
  seconds: number;
  tone: (typeof TONES)[number];
  caught: boolean;
};

function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function StarCatch() {
  const t = useT();
  const reduced = useReducedMotion(true);
  const [playing, setPlaying] = useState(false);
  const [stars, setStars] = useState<FallingStar[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const nextId = useRef(0);

  // 遊んでいるあいだ、一定の間隔で星を降らせる
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStars((current) => [
        ...current,
        {
          id: nextId.current++,
          x: 6 + Math.random() * 88,
          seconds: FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN),
          tone: TONES[Math.floor(Math.random() * TONES.length)],
          caught: false,
        },
      ]);
    }, SPAWN_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  if (reduced) return null;

  const start = () => {
    playSound('chime');
    setBest(readBest());
    setScore(0);
    setStars([]);
    setPlaying(true);
  };

  const stop = () => {
    setPlaying(false);
    setStars([]);
  };

  const catchStar = (id: number) => {
    const star = stars.find((item) => item.id === id);
    if (!star || star.caught) return;
    playSound('pop');
    setStars((current) =>
      current.map((item) => (item.id === id ? { ...item, caught: true } : item)),
    );
    const next = score + 1;
    setScore(next);
    if (next > best) {
      setBest(next);
      try {
        window.localStorage.setItem(BEST_KEY, String(next));
      } catch {
        // 覚えられなくても、遊ぶのには困らない
      }
    }
  };

  // 下まで落ちた星と、つかまえて消えた星を片付ける
  const removeStar = (id: number) =>
    setStars((current) => current.filter((item) => item.id !== id));

  return (
    <div className="star-catch">
      {playing ? (
        <div className="star-catch-bar">
          <output className="star-catch-score" aria-live="polite">
            {t(`つかまえた星: ${score}`, `Stars caught: ${score}`)}
            {best > 0 && (
              <small>{t(`（いちばん: ${best}）`, ` (best: ${best})`)}</small>
            )}
          </output>
          <button type="button" className="star-catch-button" onClick={stop}>
            {t('おわる', 'Stop')}
          </button>
        </div>
      ) : (
        <button type="button" className="star-catch-button" onClick={start}>
          {t('★ 星をつかまえてあそぶ', '★ Play: catch the stars')}
        </button>
      )}
      {playing && (
        // 星は、マウスや指で押す遊び（キーボードでは遊べないので、読み上げからは隠す）
        <div className="star-catch-sky" aria-hidden="true">
          {stars.map((star) => (
            <span
              key={star.id}
              className={`star-catch-star ${star.tone}${star.caught ? ' is-caught' : ''}`}
              style={
                {
                  left: `${star.x}%`,
                  '--fall': `${star.seconds}s`,
                } as CSSProperties
              }
              onPointerDown={() => catchStar(star.id)}
              // 下まで落ちきったとき（外側の落ちる動き）と、つかまえて弾けおわったとき（中の星の動き）に片付ける
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget || star.caught) {
                  removeStar(star.id);
                }
              }}
            >
              <svg viewBox="0 0 40 40">
                <path d="M20 4.5 L24.4 14.9 L35.6 15.9 L27.1 23.3 L29.6 34.3 L20 28.5 L10.4 34.3 L12.9 23.3 L4.4 15.9 L15.6 14.9 Z" />
              </svg>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
