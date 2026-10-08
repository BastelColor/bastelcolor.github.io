'use client';

import { usePathname } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { FloatingBits } from '@/components/floating-bits';
import { PuniButton } from '@/components/puni-button';
import { AvatarRoom } from '@/components/rooms/avatar-room';
import { LogRoom } from '@/components/rooms/log-room';
import { ProfileRoom } from '@/components/rooms/profile-room';
import { WorksRoom } from '@/components/rooms/works-room';
import { findPage, pages } from '@/content/pages';
import { site } from '@/content/site';
import type { PageId } from '@/content/types';
import { pushLayers, readLayers } from '@/lib/history-layers';
import type { Post } from '@/lib/post-meta';
import { cn } from '@/lib/utils';

/** 雲を押してから部屋が膨らみ始めるまで（「ぷにっ」を見せる時間） */
const PRESS_MS = 200;
/** 部屋が雲へ縮み終わるまで（room.css の .room の transition と合わせる） */
const SHRINK_MS = 700;

/** 部屋に渡すデータ（サーバー側で読み込んだもの） */
type RoomProps = {
  posts: Post[];
};

const rooms: Record<PageId, ComponentType<RoomProps>> = {
  profile: ProfileRoom,
  works: WorksRoom,
  avatar: AvatarRoom,
  log: LogRoom,
};

/**
 * サイト全体。「押せるものだけが、ぷにっとした雲」というルールで作っている。
 *
 * トップは名前と役職と4つの雲だけ。雲を押すと、その雲の位置から部屋の色が
 * 膨らんで画面を満たし、もどるときは同じ雲へ縮んで帰る。
 *
 * 記事のページ（/blog/<slug>）では、ブログの部屋を開いた状態から始め、
 * その上に記事（children）を重ねる。
 */
type SiteAppProps = RoomProps & {
  /** 記事のページのときは記事。トップのときは何も表示しない */
  children: ReactNode;
};

export function SiteApp({ posts, children }: SiteAppProps) {
  const pathname = usePathname();
  const isPostPage = pathname.startsWith('/blog/');
  // 記事のページを直接開いたときは、ブログの部屋が開いた状態から始める
  const [room, setRoom] = useState<PageId | null>(() =>
    isPostPage ? 'log' : null,
  );
  const [isExpanded, setIsExpanded] = useState(isPostPage);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const buttons = useRef(new Map<PageId, HTMLButtonElement>());
  const backButton = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const returnFocusTo = useRef<PageId | null>(null);

  /**
   * 部屋を開く。ブラウザの「進む」で開き直すときは、もう履歴があるので積まない
   * （lib/history-layers.ts）
   */
  const open = (
    id: PageId,
    button: HTMLButtonElement | undefined,
    { push = true } = {},
  ) => {
    if (room) return;
    const rect = button?.getBoundingClientRect();
    setOrigin(
      rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    );
    setRoom(id);
    if (push) pushLayers({ room: id });
    timer.current = window.setTimeout(() => setIsExpanded(true), PRESS_MS);
  };

  // 縮み終わりは transitionend ではなく時間で判断する
  // （タブが裏にあると transition が進まず、transitionend が来ないことがあるため）
  const close = () => {
    if (!room) return;
    const closingRoom = room;
    setIsExpanded(false);
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => {
        returnFocusTo.current = closingRoom;
        setRoom(null);
      },
      reduceMotion ? 0 : SHRINK_MS,
    );
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /**
   * サイトの「もどる」ボタンや Esc で部屋を閉じる。部屋を開いたときに積んだ履歴があれば
   * ブラウザの「戻る」と同じく履歴をもどし、閉じるのは下の popstate で行う
   */
  const requestClose = () => {
    if (room && readLayers().room === room) window.history.back();
    else close();
  };

  // 記事からもどったら、さっき開いた記事の一覧の項目へフォーカスを戻す
  const lastPostPath = useRef<string | null>(null);
  useEffect(() => {
    if (isPostPage) {
      lastPostPath.current = pathname;
      return;
    }
    if (!lastPostPath.current) return;
    document
      .querySelector<HTMLElement>(`.log-item[href="${lastPostPath.current}"]`)
      ?.focus({ preventScroll: true });
    lastPostPath.current = null;
  }, [pathname, isPostPage]);

  // トップの inert が外れてから、さっき押した雲へフォーカスを戻す
  useEffect(() => {
    if (room !== null || !returnFocusTo.current) return;
    buttons.current.get(returnFocusTo.current)?.focus();
    returnFocusTo.current = null;
  }, [room]);

  // リスナーから常に最新の関数・状態を使えるようにしておく
  // （記事を開いているあいだの Esc は、記事の側で閉じる）
  const latest = useRef({ open, close, requestClose, room, isPostPage });
  useEffect(() => {
    latest.current = { open, close, requestClose, room, isPostPage };
  });

  // ブラウザの「戻る」「進む」で、部屋を閉じたり開き直したりする
  useEffect(() => {
    const onPopState = () => {
      // 記事のページへの行き来は、ページの移動として扱われる
      if (window.location.pathname.startsWith('/blog/')) return;
      const { room: wanted } = readLayers();
      const current = latest.current;
      if (!wanted && current.room) current.close();
      else if (wanted && !current.room) {
        current.open(wanted, buttons.current.get(wanted), { push: false });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 部屋が開いたら「もどる」へフォーカスし、Esc でも戻れるようにする
  useEffect(() => {
    if (!isExpanded) return;
    backButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 部屋の中でダイアログ（作品の詳細など）を開いているときは、それだけを閉じる
      if (document.querySelector('dialog[open]')) return;
      if (latest.current.isPostPage) return;
      latest.current.requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const page = room ? findPage(room) : null;
  const Room = room ? rooms[room] : null;

  return (
    <div className="site">
      <FloatingBits variant="home" />
      <main className="home" inert={room !== null}>
        {/* 「Yzmo」の4文字は、4つの部屋（雲）と同じ順・同じ色 */}
        <h1 className="home-name" aria-label={site.title}>
          <span className="home-name-letters" aria-hidden="true">
            {['Y', 'z', 'm', 'o'].map((letter, i) => (
              <span key={letter} className={pages[i].tone}>
                {letter}
              </span>
            ))}
          </span>
          <span className="home-name-sub" aria-hidden="true">
            唯繕物置
          </span>
        </h1>
        <p className="home-roles">{site.roles.join(' / ')}</p>

        <nav className="home-menu" aria-label="メニュー">
          {pages.map((item, i) => (
            <PuniButton
              key={item.id}
              index={i}
              mascot={item.mascot}
              ref={(element) => {
                if (element) buttons.current.set(item.id, element);
              }}
              tone={item.tone}
              isPressed={room === item.id && !isExpanded}
              onPress={(button) => open(item.id, button)}
              label={item.menuLabel}
            />
          ))}
        </nav>
      </main>

      {page && Room && (
        <section
          className={cn('room', page.tone, isExpanded && 'is-expanded')}
          style={
            {
              '--origin-x': `${origin.x}px`,
              '--origin-y': `${origin.y}px`,
            } as CSSProperties
          }
          aria-label={page.menuLabel}
          inert={isPostPage}
        >
          <FloatingBits variant="room" />
          <div className="room-inner">
            <header className="room-head">
              <PuniButton
                ref={backButton}
                tone="white"
                size="small"
                onPress={requestClose}
                label="もどる"
              />
              <h2>{page.menuLabel}</h2>
              <p>{page.note}</p>
            </header>
            <Room posts={posts} />
          </div>
          {page.mascot && (
            <img
              className="room-mascot"
              src={page.mascot.happy}
              style={
                { '--mascot-width': page.mascot.width ?? 1 } as CSSProperties
              }
              alt=""
            />
          )}
        </section>
      )}

      {children}
    </div>
  );
}
