'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { FloatingBits } from '@/components/floating-bits';
import { useT } from '@/components/lang';
import { PuniButton } from '@/components/puni-button';
import { RoomMascot } from '@/components/room-mascot';
import { ShootingStars } from '@/components/shooting-stars';
import { AvatarRoom, preloadAvatarRoom } from '@/components/rooms/avatar-room';
import { LogRoom } from '@/components/rooms/log-room';
import { ProfileRoom } from '@/components/rooms/profile-room';
import { WorksRoom } from '@/components/rooms/works-room';
import { findPage, pages } from '@/content/pages';
import { site } from '@/content/site';
import type { PageId } from '@/content/types';
import { leaveLayer, pushLayers, readLayers } from '@/lib/history-layers';
import { isNewPost, type Post } from '@/lib/post-meta';
import { rememberPostOrigin } from '@/lib/post-origin';
import { cn } from '@/lib/utils';

/** 雲を押してから部屋が膨らみ始めるまで（「ぷにっ」を見せる時間） */
const PRESS_MS = 200;
/** 部屋が雲へ縮み終わるまで（room.css の .room の transition と合わせる） */
const SHRINK_MS = 700;
/** # 付きの URL で来たとき、トップを少し見せてから部屋を開くまでの時間 */
const LINKED_OPEN_DELAY_MS = 400;

/** 変化を知らせない useSyncExternalStore 用（日付は読み込んだときに1回確かめれば十分） */
const noSubscribe = () => () => {};

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
  /** いちばん新しい記事が、公開したときに新しかったか（トップに「NEW」を出す） */
  hasNewPost: boolean;
  /** 記事のページのときは記事。トップのときは何も表示しない */
  children: ReactNode;
};

export function SiteApp({ posts, hasNewPost, children }: SiteAppProps) {
  const pathname = usePathname();
  const t = useT();
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

  // トップの「NEW」のお知らせ。公開から時間がたって古くなっていたら、見ている人の側で隠す
  // （ページを書き出したときの判断で表示し、読み込んだあとに今日の日付で確かめ直す）
  const newPost = posts[0];
  const showNewPost = useSyncExternalStore(
    noSubscribe,
    () => hasNewPost && newPost !== undefined && isNewPost(newPost.date),
    () => hasNewPost,
  );

  /**
   * サイトの「もどる」ボタンや Esc で部屋を閉じる。部屋を開いたときに積んだ履歴があれば
   * ブラウザの「戻る」と同じく履歴をもどし、閉じるのは下の popstate で行う
   * （# 付きの URL を直接開いたときなどは、URL の # を外してすぐ閉じる）
   */
  const requestClose = () => {
    if (room && readLayers().room === room && leaveLayer({})) return;
    close();
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
  // 縮んでいる途中で「進む」を押されたら、閉じるのをやめて広げ直す
  // （ちょうど縮み終わって部屋が消えた直後でも、同じ部屋を開き直す）
  const reopen = (id: PageId) => {
    window.clearTimeout(timer.current);
    setRoom(id);
    setIsExpanded(true);
  };
  const latest = useRef({
    open,
    close,
    reopen,
    requestClose,
    room,
    isExpanded,
    isPostPage,
  });
  useEffect(() => {
    latest.current = {
      open,
      close,
      reopen,
      requestClose,
      room,
      isExpanded,
      isPostPage,
    };
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
      } else if (wanted && wanted === current.room && !current.isExpanded) {
        current.reopen(wanted);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // # 付きの URL（例: /#works）を直接開いたら、ページを表示してからその部屋を開く
  useEffect(() => {
    if (window.location.pathname.startsWith('/blog/')) return;
    const { room: linked } = readLayers();
    if (!linked) return;
    const timer = window.setTimeout(
      () =>
        latest.current.open(linked, buttons.current.get(linked), {
          push: false,
        }),
      LINKED_OPEN_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
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
      <ShootingStars />
      <main className="home" inert={room !== null || isPostPage}>
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
        {showNewPost && newPost && (
          <Link
            href={`/blog/${newPost.slug}`}
            className="home-news"
            // お知らせの位置から記事を膨らませ、閉じたらトップへもどる
            onClick={(event) => rememberPostOrigin(event.currentTarget)}
          >
            <span className="home-news-badge">NEW</span>
            <span className="home-news-title">{newPost.title}</span>
          </Link>
        )}

        <nav className="home-menu" aria-label={t('メニュー', 'Menu')}>
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
              // アバターの部屋は 3D の表示に時間がかかるので、雲にふれた時点で読み込み始める
              onIntent={item.id === 'avatar' ? preloadAvatarRoom : undefined}
              label={t(item.menuLabel, item.en.menuLabel)}
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
          aria-label={t(page.menuLabel, page.en.menuLabel)}
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
                label={t('もどる', 'Back')}
              />
              <h2>{t(page.menuLabel, page.en.menuLabel)}</h2>
              <p>{t(page.note, page.en.note)}</p>
            </header>
            <Room posts={posts} />
          </div>
          {page.mascot && <RoomMascot mascot={page.mascot} />}
        </section>
      )}

      {children}
    </div>
  );
}
