import type { CSSProperties } from 'react';
import type { BitShape as Shape } from '@/content/types';
import { useSeason } from '@/lib/season';
import { cn } from '@/lib/utils';

/**
 * 背景でふわふわ浮き沈みする小物（星・しずく・ハート・まる）。
 * 雲のボタンと同じく、色の濃い版で縁取った飴のような見た目にする。
 * 見た目は app/styles/floating-bits.css。
 *
 * 位置は画面に対する % で決め打ちにしている（毎回同じ場所に出るように）。
 * 季節のかざりの期間（content/seasons.ts）は、形だけをその季節のものに変える。
 */
type BaseShape = 'star' | 'drop' | 'heart' | 'dot';
type Tone = 'pink' | 'mint' | 'blue' | 'yellow';

type Bit = {
  shape: BaseShape;
  /** 画面の左上からの位置（%） */
  x: number;
  y: number;
  /** 大きさ（px、幅 900px の画面のとき。広い画面ではもう少し大きくなる） */
  size: number;
  /** トップでの色（部屋の中では、どれも部屋の色になるので書かない） */
  tone?: Tone;
  /** 浮き沈み1回の秒数と、始まりのずれ（秒） */
  duration: number;
  delay: number;
  /** 細い画面では出さない（名前や中身と重なりやすい場所） */
  wideOnly?: boolean;
};

/** トップ: 名前のまわりと空のあいたところ。下の雲の海より上に置く */
const HOME_BITS: Bit[] = [
  {
    shape: 'star',
    x: 56,
    y: 12,
    size: 34,
    tone: 'yellow',
    duration: 6.4,
    delay: 0,
    wideOnly: true,
  },
  {
    shape: 'heart',
    x: 84,
    y: 10,
    size: 28,
    tone: 'pink',
    duration: 7.2,
    delay: -2.1,
  },
  {
    shape: 'dot',
    x: 70,
    y: 26,
    size: 14,
    tone: 'mint',
    duration: 5.6,
    delay: -1.2,
    wideOnly: true,
  },
  {
    shape: 'drop',
    x: 44,
    y: 30,
    size: 22,
    tone: 'blue',
    duration: 6.8,
    delay: -3.4,
    wideOnly: true,
  },
  {
    shape: 'star',
    x: 90,
    y: 38,
    size: 22,
    tone: 'mint',
    duration: 5.9,
    delay: -0.6,
  },
  {
    shape: 'dot',
    x: 8,
    y: 46,
    size: 14,
    tone: 'yellow',
    duration: 6.2,
    delay: -4.0,
  },
  {
    shape: 'star',
    x: 30,
    y: 42,
    size: 20,
    tone: 'pink',
    duration: 7.0,
    delay: -1.8,
  },
  {
    shape: 'drop',
    x: 76,
    y: 48,
    size: 18,
    tone: 'blue',
    duration: 6.6,
    delay: -2.7,
  },
  {
    shape: 'dot',
    x: 58,
    y: 40,
    size: 10,
    tone: 'pink',
    duration: 5.2,
    delay: -0.3,
  },
  {
    shape: 'heart',
    x: 18,
    y: 5,
    size: 18,
    tone: 'blue',
    duration: 6.1,
    delay: -3.0,
    wideOnly: true,
  },
];

/** 部屋: 中身は左に寄っているので、右側とすみに多めに置く */
const ROOM_BITS: Bit[] = [
  { shape: 'star', x: 88, y: 9, size: 30, duration: 6.6, delay: 0 },
  { shape: 'dot', x: 77, y: 20, size: 12, duration: 5.4, delay: -1.5 },
  { shape: 'heart', x: 93, y: 33, size: 22, duration: 7.0, delay: -2.4 },
  {
    shape: 'drop',
    x: 68,
    y: 5,
    size: 18,
    duration: 6.2,
    delay: -3.1,
    wideOnly: true,
  },
  {
    shape: 'star',
    x: 58,
    y: 16,
    size: 14,
    duration: 5.8,
    delay: -0.8,
    wideOnly: true,
  },
  { shape: 'dot', x: 85, y: 52, size: 16, duration: 6.8, delay: -2.0 },
  {
    shape: 'star',
    x: 74,
    y: 64,
    size: 18,
    duration: 6.0,
    delay: -4.2,
    wideOnly: true,
  },
  {
    shape: 'dot',
    x: 46,
    y: 3,
    size: 10,
    duration: 5.0,
    delay: -1.0,
    wideOnly: true,
  },
  { shape: 'heart', x: 4, y: 88, size: 16, duration: 6.4, delay: -2.9 },
  // 下のほう（スマホで中身の下があきやすい）
  { shape: 'dot', x: 12, y: 64, size: 12, duration: 5.6, delay: -3.6 },
  { shape: 'star', x: 26, y: 78, size: 20, duration: 6.9, delay: -1.3 },
];

type FloatingBitsProps = {
  /** home: トップ（4色） / room: 部屋の中（部屋の色で、うすく） */
  variant: 'home' | 'room';
};

export function FloatingBits({ variant }: FloatingBitsProps) {
  const bits = variant === 'home' ? HOME_BITS : ROOM_BITS;
  const season = useSeason();
  return (
    <div className={cn('floating-bits', `is-${variant}`)} aria-hidden="true">
      {bits.map((bit, i) => (
        <span
          key={i}
          className={cn(
            'floating-bit',
            variant === 'home' && bit.tone,
            bit.wideOnly && 'is-wide-only',
          )}
          style={
            {
              left: `${bit.x}%`,
              top: `${bit.y}%`,
              '--size': bit.size,
              '--duration': `${bit.duration}s`,
              '--delay': `${bit.delay}s`,
              '--tilt': `${i % 2 === 0 ? -8 : 8}deg`,
            } as CSSProperties
          }
        >
          <BitShape shape={season?.shapes[bit.shape] ?? bit.shape} />
        </span>
      ))}
    </div>
  );
}

const STAR_PATH = starPath(20, 21, 15, 7.5);

function BitShape({ shape }: { shape: Shape }) {
  // 線だけの形（雪の結晶）には、つやを付けない
  const hasGloss = shape !== 'snow';
  return (
    <svg viewBox="0 0 40 40" className={`is-${shape}`}>
      {shape === 'star' && <path className="floating-bit-body" d={STAR_PATH} />}
      {shape === 'heart' && (
        <path
          className="floating-bit-body"
          d="M20 33 C7 24 5 15 11 10 C15.5 6.5 19 9 20 12.5 C21 9 24.5 6.5 29 10 C35 15 33 24 20 33 Z"
        />
      )}
      {shape === 'drop' && (
        <path
          className="floating-bit-body"
          d="M20 5 C25 13 30 19 30 25 A10 10 0 0 1 10 25 C10 19 15 13 20 5 Z"
        />
      )}
      {shape === 'dot' && (
        <circle className="floating-bit-body" cx="20" cy="20" r="12" />
      )}
      {/* ---- 季節の形（content/seasons.ts）---- */}
      {shape === 'pumpkin' && (
        <>
          <path
            className="floating-bit-body"
            d="M20 12 C30 12 35 17 35 24 C35 31 29 35 20 35 C11 35 5 31 5 24 C5 17 10 12 20 12 Z"
          />
          <path
            className="floating-bit-line"
            d="M14.5 13.5 C11 19 11 29 14.5 34.5 M25.5 13.5 C29 19 29 29 25.5 34.5 M19.5 12.5 C19 9 20.5 6.5 24 5.5"
          />
        </>
      )}
      {shape === 'ghost' && (
        <>
          <path
            className="floating-bit-body"
            d="M20 5 C28 5 32 11 32 19 L32 33 L28 30 L24 34 L20 30 L16 34 L12 30 L8 33 L8 19 C8 11 12 5 20 5 Z"
          />
          <circle className="floating-bit-eye" cx="16" cy="18" r="1.8" />
          <circle className="floating-bit-eye" cx="24" cy="18" r="1.8" />
        </>
      )}
      {shape === 'bat' && (
        <path
          className="floating-bit-body"
          d="M20 15 L18 11 L17 15 C14 13 10 12 5 14 C8 16 9 19 8 22 C11 21 14 22 15 25 C17 24 19 25 20 28 C21 25 23 24 25 25 C26 22 29 21 32 22 C31 19 32 16 35 14 C30 12 26 13 23 15 L22 11 Z"
        />
      )}
      {shape === 'candy' && (
        <>
          <path
            className="floating-bit-body"
            d="M13 20 L5 14 L6 26 Z M27 20 L35 14 L34 26 Z"
          />
          <circle className="floating-bit-body" cx="20" cy="20" r="8" />
          <path className="floating-bit-line" d="M15 16 C18 19 22 21 25 24" />
        </>
      )}
      {shape === 'snow' && (
        <path
          className="floating-bit-line is-bold"
          d="M20 6 V34 M7.9 13 L32.1 27 M7.9 27 L32.1 13 M16 8.5 L20 12 L24 8.5 M16 31.5 L20 28 L24 31.5"
        />
      )}
      {shape === 'present' && (
        <>
          <path className="floating-bit-body" d="M9 18 H31 V34 H9 Z" />
          <path className="floating-bit-body" d="M7 13 H33 V19 H7 Z" />
          <path
            className="floating-bit-line"
            d="M20 13 V34 M20 13 C17 8 12 8 13 12 C14 14 18 13 20 13 C22 13 26 14 27 12 C28 8 23 8 20 13"
          />
        </>
      )}
      {/* 左上のつや */}
      {hasGloss && (
        <ellipse
          className="floating-bit-gloss"
          cx="15"
          cy="16"
          rx="3.4"
          ry="2.2"
        />
      )}
    </svg>
  );
}

/** 角の丸い5つ角の星（縁取りの stroke-linejoin: round で、ぷっくりさせる） */
function starPath(cx: number, cy: number, outer: number, inner: number) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join(' L')} Z`;
}
