import type { CSSProperties } from 'react';
import { NotFoundBack } from '@/components/not-found-back';
import { site } from '@/content/site';

/** ふわふわ浮かぶ文字。1文字ずつ、名前「Yzmo」と同じ4色を順にあてる */
const LETTERS = ['み', 'つ', 'か', 'り', 'ま', 'せ', 'ん'];
const TONES = ['pink', 'mint', 'blue', 'yellow'] as const;

/**
 * 「ページが見つかりません」のページ。
 * 静的に書き出すと 404.html になり、GitHub Pages は存在しない URL でこれを表示する。
 */
export default function NotFound() {
  return (
    <main className="not-found">
      <title>{`ページがみつかりません | ${site.title}`}</title>
      <p className="not-found-code" aria-hidden="true">
        404
      </p>
      <h1 className="not-found-title" aria-label="ページがみつかりません">
        <span className="not-found-sub" aria-hidden="true">
          ページが
        </span>
        <span className="not-found-letters" aria-hidden="true">
          {LETTERS.map((letter, i) => (
            <span
              key={i}
              className={TONES[i % TONES.length]}
              style={{ '--i': i } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
      </h1>
      <NotFoundBack />
    </main>
  );
}
