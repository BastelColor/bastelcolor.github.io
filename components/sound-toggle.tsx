'use client';

import { useSyncExternalStore } from 'react';
import { useT } from '@/components/lang';
import { isSoundOn, playSound, setSoundOn, subscribeSound } from '@/lib/sound';

/** 右上のスピーカーのボタン。効果音（lib/sound.ts）を鳴らすかどうか。最初は鳴らさない */
export function SoundToggle() {
  const t = useT();
  const isOn = useSyncExternalStore(subscribeSound, isSoundOn, () => false);
  return (
    <button
      type="button"
      className="corner-button"
      aria-pressed={isOn}
      aria-label={t('音を鳴らす', 'Sound effects')}
      title={t('音を鳴らす', 'Sound effects')}
      onClick={() => {
        setSoundOn(!isOn);
        // オンにしたら、鳴ることが分かるように1回鳴らす
        playSound('pop');
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="is-filled" d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" />
        {isOn ? (
          <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
        ) : (
          <path d="m16 9.5 5 5m0-5-5 5" />
        )}
      </svg>
    </button>
  );
}
