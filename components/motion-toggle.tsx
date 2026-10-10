'use client';

import { useT } from '@/components/lang';
import { setReducesMotion, useReducedMotion } from '@/lib/motion';
import { playSound } from '@/lib/sound';

/**
 * 右上の星のボタン。流れ星・きらきら・浮かぶ小物・アバターの踊りなどの動きを止める（lib/motion.ts）。
 * 最初は端末の「動きを減らす」設定に合わせる
 */
export function MotionToggle() {
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      className="corner-button"
      aria-pressed={reduced}
      aria-label={t('動きを減らす', 'Reduce motion')}
      title={t('動きを減らす', 'Reduce motion')}
      onClick={() => {
        setReducesMotion(!reduced);
        playSound('pop');
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {reduced ? (
          // 止まった星（地面の上）
          <>
            <path
              className="is-filled"
              d="M12 3 13.6 7.3 18.3 7.6 14.7 10.5 15.9 14.9 12 12.4 8.1 14.9 9.3 10.5 5.7 7.6 10.4 7.3Z"
            />
            <path d="M6 19.5h12" />
          </>
        ) : (
          // 流れる星（うしろに線）
          <>
            <path
              className="is-filled"
              d="M14.3 3.8 15.9 8.1 20.6 8.4 17 11.3 18.2 15.7 14.3 13.2 10.4 15.7 11.6 11.3 8 8.4 12.7 8.1Z"
            />
            <path d="M2.5 10h3.5M3.5 14h4.5M5 18h4" />
          </>
        )}
      </svg>
    </button>
  );
}
