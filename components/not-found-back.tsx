'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { useLang, useT } from '@/components/lang';
import { PuniButton } from '@/components/puni-button';
import { findPage } from '@/content/pages';

const noop = () => () => {};

/** ふわふわ浮かぶ文字。1文字ずつ、名前「Yzmo」と同じ4色を順にあてる */
const LETTERS = {
  ja: { sub: 'ページが', letters: ['み', 'つ', 'か', 'り', 'ま', 'せ', 'ん'] },
  en: { sub: 'Page', letters: ['N', 'o', 't', ' ', 'f', 'o', 'u', 'n', 'd'] },
};
const TONES = ['pink', 'mint', 'blue', 'yellow'] as const;

/** 「ページがみつかりません」の見出し。文字がふわふわ浮かぶ */
export function NotFoundTitle() {
  const lang = useLang();
  const t = useT();
  const { sub, letters } = LETTERS[lang];
  return (
    <h1
      className="not-found-title"
      aria-label={t('ページがみつかりません', 'Page not found')}
    >
      <span className="not-found-sub" aria-hidden="true">
        {sub}
      </span>
      <span className="not-found-letters" aria-hidden="true">
        {letters.map((letter, i) => (
          <span
            key={i}
            className={letter === ' ' ? 'is-space' : TONES[i % TONES.length]}
            style={{ '--i': i } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </span>
    </h1>
  );
}

/** 前のホームページ（/homepage/...）の URL から来たかどうか */
function useIsOldHomepageUrl() {
  return useSyncExternalStore(
    noop,
    () => window.location.pathname.startsWith('/homepage'),
    () => false,
  );
}

/** 「ページがみつかりません」の説明と、トップへもどる雲のボタン */
export function NotFoundBack() {
  const isOldHomepageUrl = useIsOldHomepageUrl();
  const t = useT();

  return (
    <>
      <p className="not-found-note">
        {isOldHomepageUrl
          ? t(
              'こちらのページは公開を終了しました！',
              'This page is no longer available!',
            )
          : t(
              'URL がまちがっているか、ページがお引っ越ししたのかもしれません。',
              'The URL may be wrong, or the page may have moved.',
            )}
      </p>
      <div className="not-found-back">
        <PuniButton
          tone="blue"
          mascot={findPage('avatar').mascot}
          label={t('トップへ', 'Home')}
          // 存在しない URL の上にいるので、ページごと読み込み直してトップを開く
          onPress={() => window.location.assign('/')}
        />
      </div>
    </>
  );
}
