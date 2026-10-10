import type { CSSProperties, Ref } from 'react';
import { CloudShape } from '@/components/cloud-shape';
import type { Mascot } from '@/content/types';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

type PuniButtonProps = {
  tone: 'pink' | 'mint' | 'blue' | 'yellow' | 'white';
  label: string;
  /** 雲のうしろから顔を出すキャラクター。ホバーで笑顔に切り替わる */
  mascot?: Mascot;
  size?: 'large' | 'small';
  /** ふわふわ浮く周期をずらすための順番 */
  index?: number;
  isPressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
  onPress: (button: HTMLButtonElement) => void;
  /** 押しそうなとき（カーソルを乗せた・フォーカスした・指でふれた）に呼ぶ。先読みに使う */
  onIntent?: () => void;
};

/** キャラクター画像の基準の正方形の幅（px）。--mascot-width が 1 の子の画像の幅 */
const MASCOT_BASE_WIDTH = 640;

/**
 * キャラクター画像を、表示される大きさに合わせて選んでもらうための srcSet・sizes。
 * 半分の大きさの画像（public/characters/small/）は scripts/resize-characters.mjs が作る。
 * sizes は、画面の幅ごとの表示幅（app/styles/home.css・puni-button.css）に合わせてある
 */
function mascotSources(src: string, width = 1) {
  const full = Math.round(MASCOT_BASE_WIDTH * width);
  const small = src.replace(/\/([^/]+)$/, '/small/$1');
  return {
    srcSet: `${small} ${Math.round(full / 2)}w, ${src} ${full}w`,
    sizes: [
      `(max-width: 760px) calc(33vw * ${width})`,
      `(max-width: 1100px) and (orientation: portrait) calc(32vw * ${width})`,
      `calc(min(16vw, 240px) * ${width})`,
    ].join(', '),
  };
}

/**
 * 「押せるもの」だけに使う、ぷにっとした雲形のボタン。
 * 構造と見た目は app/styles/puni-button.css を参照。
 */
export function PuniButton({
  tone,
  label,
  mascot,
  size = 'large',
  index = 0,
  isPressed = false,
  ref,
  onPress,
  onIntent,
}: PuniButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn('puni', tone, size, isPressed && 'is-pressed')}
      style={{ '--i': index } as CSSProperties}
      onClick={(event) => {
        playSound('puni');
        onPress(event.currentTarget);
      }}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
    >
      <span className="puni-x">
        <span className="puni-y">
          {mascot && (
            <span
              className="puni-mascot"
              style={{ '--mascot-width': mascot.width ?? 1 } as CSSProperties}
            >
              {/* ページを開いて最初に目に入る絵なので、先に読み込む */}
              <img
                src={mascot.normal}
                {...mascotSources(mascot.normal, mascot.width)}
                alt=""
                fetchPriority="high"
              />
              {/* 笑顔はホバーしたときだけ使うので、ふつうの顔より後回しに読み込む */}
              <img
                className="is-happy"
                src={mascot.happy}
                {...mascotSources(mascot.happy, mascot.width)}
                alt=""
                fetchPriority="low"
                decoding="async"
              />
            </span>
          )}
          <CloudShape />
          <span className="puni-label" aria-hidden="true">
            {label}
          </span>
        </span>
      </span>
    </button>
  );
}
