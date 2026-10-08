'use client';

import { useSyncExternalStore } from 'react';
import { PuniButton } from '@/components/puni-button';
import { findPage } from '@/content/pages';

const noop = () => () => {};

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

  return (
    <>
      <p className="not-found-note">
        {isOldHomepageUrl
          ? '前のホームページは、いま新しいサイトへお引っ越し中です。'
          : 'URL がまちがっているか、ページがお引っ越ししたのかもしれません。'}
      </p>
      <div className="not-found-back">
        <PuniButton
          tone="blue"
          mascot={findPage('avatar').mascot}
          label="トップへ"
          // 存在しない URL の上にいるので、ページごと読み込み直してトップを開く
          onPress={() => window.location.assign('/')}
        />
      </div>
    </>
  );
}
