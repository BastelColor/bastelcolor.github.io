import type { CSSProperties } from 'react';

/**
 * トップと 404 の空の、時間帯の飾り（動きは app/styles/sky.css）。
 *
 * - 流れ星: 夜の星空（--stars が 1）のときだけ、ときどき流れる
 * - 暗いテーマの景色（lib/sky.ts が <html data-dark-scene> に書く）。暗いテーマでは、明るさは夜のまま、
 *   時間帯で景色だけが変わる
 *     朝 aurora  オーロラの光の帯が、ゆっくりゆれる
 *     昼 sea     深い海。上から光の筋が差しこみ、泡がのぼる
 *     夕方 snow  雪の夜。雪がふる
 *     夜 stars   星空（流れ星）
 */

/** いつも同じ並びになる乱数（描くたびに泡や雪の位置が変わらないように） */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/** 泡・雪の 1 つずつの位置・大きさ・速さ（CSS の変数で渡す） */
function particles(count: number, seed: number) {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    '--x': `${Math.round(random() * 100)}%`,
    '--y': `${Math.round(8 + random() * 84)}%`,
    '--size': `${(0.5 + random()).toFixed(2)}`,
    '--duration': `${(9 + random() * 10).toFixed(1)}s`,
    '--delay': `${(-random() * 18).toFixed(1)}s`,
  })) as CSSProperties[];
}

const BUBBLES = particles(16, 11);
const SNOW = particles(36, 23);

export function ShootingStars() {
  return (
    <>
      <div className="shooting-stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="dark-scene is-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="dark-scene is-sea" aria-hidden="true">
        <span className="sea-ray" />
        <span className="sea-ray" />
        <span className="sea-ray" />
        <span className="sea-ray" />
        {BUBBLES.map((style, i) => (
          <span key={i} className="sea-bubble" style={style} />
        ))}
      </div>
      <div className="dark-scene is-snow" aria-hidden="true">
        {SNOW.map((style, i) => (
          <span key={i} className="snowflake" style={style} />
        ))}
      </div>
    </>
  );
}
