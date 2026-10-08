import { useId } from 'react';

/**
 * ぷに雲ボタンの雲形（SVG）。
 *
 * viewBox はボタンと同じ 3:2。色はボタンのトーンごとに CSS 変数で切り替える
 * （app/styles/puni-button.css の --cloud-* を参照）。
 *
 * 「ぷにっと」した厚みは次の重ね合わせで出している:
 *   1. 接地影      … 下にぼかした楕円
 *   2. 本体        … 縦グラデーション + 内側の陰影フィルター（下の縁を暗く、上の縁を明るく）
 *   3. ツヤ        … 左上と右上にぼかした白いハイライト
 */

// 上辺に3つ、左右に2つずつふくらみを持つ雲形
const CLOUD_PATH = [
  'M 30 99',
  'C 21 88, 18 72, 23 58',
  'C 31 35, 52 22, 79 21',
  'C 93 20, 103 24, 113 30',
  'C 124 22, 137 19, 150 19',
  'C 163 19, 176 22, 187 30',
  'C 197 24, 207 20, 221 21',
  'C 248 22, 269 35, 277 58',
  'C 282 72, 279 88, 270 99',
  'C 280 110, 285 124, 284 138',
  'C 283 162, 263 179, 236 180',
  'C 206 181, 184 176, 150 177',
  'C 116 176, 94 181, 64 180',
  'C 37 179, 17 162, 16 138',
  'C 15 124, 20 110, 30 99',
  'Z',
].join(' ');

export function CloudShape() {
  const id = useId();
  const ids = {
    body: `${id}-body`,
    puffy: `${id}-puffy`,
    soft: `${id}-soft`,
  };

  return (
    <svg
      className="cloud-shape"
      viewBox="0 0 300 200"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ids.body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--cloud-top)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--cloud-bottom)' }} />
        </linearGradient>

        <PuffyFilter id={ids.puffy} depth={7} blur={7} />

        <filter id={ids.soft} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <ellipse
        className="cloud-shape-shadow"
        cx="150"
        cy="184"
        rx="122"
        ry="9"
        filter={`url(#${ids.soft})`}
      />

      <path
        className="cloud-shape-body"
        d={CLOUD_PATH}
        fill={`url(#${ids.body})`}
        filter={`url(#${ids.puffy})`}
      />

      <g className="cloud-shape-gloss" filter={`url(#${ids.soft})`}>
        <ellipse cx="62" cy="44" rx="20" ry="9" transform="rotate(-24 62 44)" />
        <ellipse cx="248" cy="46" rx="7" ry="4" transform="rotate(28 248 46)" />
      </g>
    </svg>
  );
}

/**
 * 図形の内側に陰影をつけて、ふくらんで見せるフィルター。
 * 図形を上下にずらしてぼかし、はみ出した部分だけを内側の影・光として重ねる。
 */
function PuffyFilter({
  id,
  depth,
  blur,
}: {
  id: string;
  depth: number;
  blur: number;
}) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="blur" />

      {/* 下側の縁の影 */}
      <feOffset in="blur" dy={-depth} result="raised" />
      <feComposite
        in="SourceAlpha"
        in2="raised"
        operator="out"
        result="lowerEdge"
      />
      <feFlood style={{ floodColor: 'var(--cloud-shade)' }} />
      <feComposite in2="lowerEdge" operator="in" result="shade" />

      {/* 上側の縁の光 */}
      <feOffset in="blur" dy={depth} result="lowered" />
      <feComposite
        in="SourceAlpha"
        in2="lowered"
        operator="out"
        result="upperEdge"
      />
      <feFlood floodColor="#fff" floodOpacity="0.85" />
      <feComposite in2="upperEdge" operator="in" result="light" />

      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="shade" />
        <feMergeNode in="light" />
      </feMerge>
    </filter>
  );
}
