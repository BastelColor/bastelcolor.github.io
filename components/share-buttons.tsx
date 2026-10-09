'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/lang';
import { site } from '@/content/site';

type ShareButtonsProps = {
  /** 共有するページのパス（/work/toon-shader など） */
  path: string;
  /** 投稿の文面（ページの名前） */
  title: string;
};

/** 「コピーしました！」を出しておく時間 */
const COPIED_MS = 2000;

/**
 * 作品・アバター・記事を共有するボタン。X と Misskey は投稿画面を別のタブで開き、
 * URL のコピーはその場でクリップボードへ入れる。
 * 貼ったときのカード（画像・名前）は、それぞれのページの OGP で出る
 */
export function ShareButtons({ path, title }: ShareButtonsProps) {
  const t = useT();
  const url = `${site.url}${path}`;
  const text = `${title} | ${site.title}`;
  const query = `text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState('idle'), COPIED_MS);
  };

  return (
    <div className="share">
      <span className="share-label">{t('シェア', 'Share')}</span>
      <a
        href={`https://x.com/intent/post?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        X
      </a>
      {/* Misskey Hub の共有ページで、使っているサーバーを選んで投稿できる */}
      <a
        href={`https://misskey-hub.net/share/?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        Misskey
      </a>
      <button type="button" onClick={copy}>
        {t('URLをコピー', 'Copy URL')}
      </button>
      <output className="share-status">
        {copyState === 'copied' && t('コピーしました！', 'Copied!')}
        {copyState === 'failed' && t('コピーできませんでした', 'Couldn’t copy')}
      </output>
    </div>
  );
}
