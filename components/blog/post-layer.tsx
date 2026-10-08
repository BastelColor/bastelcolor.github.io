'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { PuniButton } from '@/components/puni-button';
import { findPage } from '@/content/pages';
import { getPostOrigin, wasOpenedFromList } from '@/lib/post-origin';
import { cn } from '@/lib/utils';

/** 膨らみ終わる・縮み終わるまで（blog.css の .post-layer の transition と合わせる） */
const SHRINK_MS = 700;

type Phase = 'opening' | 'open' | 'closing';

/**
 * 記事を、ブログの部屋の上に重ねて出す層。
 * トップから部屋を開くときと同じく、押した記事の位置から膨らみ、
 * もどるときは同じ位置へ縮んでから、ブログの部屋（/）へ移る。
 * ブラウザの「戻る」で記事を離れたときは、縮まずにそのままブログの部屋にもどる。
 */
export function PostLayer({ children }: { children: ReactNode }) {
  const router = useRouter();
  // 一覧から来たときだけ、押した位置から膨らませる
  const [origin] = useState(getPostOrigin);
  const [phase, setPhase] = useState<Phase>(origin ? 'opening' : 'open');
  const backButton = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // 縮めた円の大きさ 0 で一度描いてから広げる
  useEffect(() => {
    if (phase !== 'opening') return;
    timer.current = window.setTimeout(() => setPhase('open'), 30);
    return () => window.clearTimeout(timer.current);
  }, [phase]);

  useEffect(() => {
    if (phase === 'open') backButton.current?.focus({ preventScroll: true });
  }, [phase]);

  const close = () => {
    if (phase === 'closing') return;
    setPhase('closing');
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    // 縮み終わりは時間で判断する（タブが裏にあると transitionend が来ないことがあるため）。
    // 一覧から来たときは履歴をもどる（新しく積むと、ブラウザの「戻る」で記事にもどってしまう）
    timer.current = window.setTimeout(
      () => (wasOpenedFromList() ? router.back() : router.push('/')),
      reduceMotion ? 0 : SHRINK_MS,
    );
  };

  // Esc でももどれるようにする（常に最新の close を呼ぶ）
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      // 見出しの下線などは、ブログの部屋と同じ色で描く
      className={cn(
        'post-layer',
        findPage('log').tone,
        phase === 'open' && 'is-expanded',
      )}
      style={
        {
          '--origin-x': origin ? `${origin.x}px` : '50%',
          '--origin-y': origin ? `${origin.y}px` : '50%',
        } as CSSProperties
      }
    >
      <div className="post-layer-inner">
        <header className="post-head">
          <PuniButton
            ref={backButton}
            tone="white"
            size="small"
            label="もどる"
            onPress={close}
          />
        </header>
        {children}
        <footer className="post-foot">
          <PuniButton
            tone="white"
            size="small"
            label="もどる"
            onPress={close}
          />
        </footer>
      </div>
    </div>
  );
}
