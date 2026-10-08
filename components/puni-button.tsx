import type { CSSProperties, Ref } from 'react';
import { CloudShape } from '@/components/cloud-shape';
import type { Mascot } from '@/content/types';
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
};

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
}: PuniButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn('puni', tone, size, isPressed && 'is-pressed')}
      style={{ '--i': index } as CSSProperties}
      onClick={(event) => onPress(event.currentTarget)}
    >
      <span className="puni-x">
        <span className="puni-y">
          {mascot && (
            <span
              className="puni-mascot"
              style={{ '--mascot-width': mascot.width ?? 1 } as CSSProperties}
            >
              <img src={mascot.normal} alt="" />
              <img className="is-happy" src={mascot.happy} alt="" />
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
