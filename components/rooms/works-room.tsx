'use client';

import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '@/components/lang';
import { WorkDetail } from '@/components/rooms/work-detail';
import { WorkThumbnail } from '@/components/rooms/work-thumbnail';
import { site } from '@/content/site';
import type { Work, WorkGenre } from '@/content/types';
import { workGenres, works as worksJa } from '@/content/works';
import { localizeWork } from '@/lib/localize';
import {
  leaveLayer,
  pushLayers,
  readLayers,
  replaceLayers,
} from '@/lib/history-layers';
import { reducesMotion } from '@/lib/motion';
import { playSound } from '@/lib/sound';

/** ダイアログが消えるまでの時間（works.css の .work-dialog の transition と合わせる） */
const DIALOG_FADE_MS = 200;
/** # 付きの URL で来たとき、部屋が広がってから作品の詳細を開くまでの時間 */
const LINKED_OPEN_DELAY_MS = 700;
/** 詳細を指で横になぞって、となりの作品へ移るのに要る距離（px） */
const SWIPE_PX = 60;

/**
 * 作品はサムネイルで並べ、ジャンルで絞り込める。押すと詳細をダイアログで開く。
 * 閉じるときは、消えるアニメーションが終わってから中身を外す
 * （すぐ外すと消える途中で空になり、残したままだと動画の音が鳴り続けるため）。
 *
 * 詳細を開くと履歴を1つ積むので、ブラウザの「戻る」で詳細だけを閉じられる
 * （lib/history-layers.ts）。
 *
 * 詳細を開いたまま、← → キー・指で横になぞる・下の矢印で、となりの作品へ移れる。
 */
const VIEWS = [
  { id: 'grid', label: '一覧', labelEn: 'Grid' },
  { id: 'timeline', label: '年表', labelEn: 'Timeline' },
] as const;
type WorkView = (typeof VIEWS)[number]['id'];

/** 年のない作品をまとめる見出し */
const NO_YEAR = 'その他';

/**
 * 作品を、作り始めた年（year の最初の4けた。「2023〜2025」なら 2023）ごとにまとめ、新しい年から並べる。
 * 同じ年の中は content/works.ts の順のまま。年のない作品は最後に「その他」として出す
 */
function groupByYear(list: Work[]) {
  const groups = new Map<string, Work[]>();
  for (const work of list) {
    const year = /\d{4}/.exec(work.year ?? '')?.[0] ?? NO_YEAR;
    groups.set(year, [...(groups.get(year) ?? []), work]);
  }
  return [...groups]
    .map(([year, items]) => ({ year, works: items }))
    .sort((a, b) =>
      a.year === NO_YEAR
        ? 1
        : b.year === NO_YEAR
          ? -1
          : b.year.localeCompare(a.year),
    );
}

export function WorksRoom() {
  const [genre, setGenre] = useState<WorkGenre | 'all'>('all');
  // 使った道具での絞り込み（ジャンルと組み合わせられる）
  const [tool, setTool] = useState<string>('all');
  const [view, setView] = useState<WorkView>('grid');
  const lang = useLang();
  const t = useT();
  // 英語のときは、作品の文章を content/works.ts の en で置きかえる
  const works = worksJa.map((work) => localizeWork(work, lang));
  const [shownId, setShownId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const shown = works.find((work) => work.id === shownId);

  const show = (id: string) => {
    window.clearTimeout(clearTimer.current);
    setShownId(id);
    dialog.current?.showModal();
  };
  const showRef = useRef(show);
  // ← → キーと指でなぞったときに移る先（描くたびに、いまのとなりの作品にする）
  const stepRef = useRef<(direction: -1 | 1) => void>(() => {});
  useEffect(() => {
    showRef.current = show;
  });

  // ダイアログの外（背景）を押したら閉じる。キーボードでは Esc で閉じられる
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === element) element.close();
    };
    const onClose = () => {
      clearTimer.current = window.setTimeout(
        () => setShownId(null),
        DIALOG_FADE_MS,
      );
      // 「もどる」ボタン・背景・Esc で閉じたときは、開いたときに積んだ履歴も外す
      // （ブラウザの「戻る」で閉じたときは、もう外れている）
      if (readLayers().work) leaveLayer({ room: 'works' });
    };
    // ブラウザの「戻る」「進む」で、詳細を閉じたり開き直したりする
    const onPopState = () => {
      const { work } = readLayers();
      if (!work && element.open) element.close();
      else if (work && !element.open) showRef.current(work);
    };
    // # 付きの URL（例: /#works/toon-shader）で来たら、部屋が開いてからその作品を開く。
    // 知らない作品なら、URL を部屋だけにもどす
    const linked = readLayers().work;
    const linkTimer = linked
      ? window.setTimeout(() => {
          if (worksJa.some((work) => work.id === linked)) showRef.current(linked);
          else replaceLayers({ room: 'works' });
        }, LINKED_OPEN_DELAY_MS)
      : undefined;
    // ← → キーで、となりの作品へ。詳細の上に重ねた画像のビューア（別の dialog）の中や、
    // 文字を打つところでは、そちらの操作にまかせる
    const isOwnEvent = (event: Event) => {
      const target = event.target as Element | null;
      return (
        target?.closest('dialog') === element &&
        !target.closest('input, textarea, select, [contenteditable]')
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isOwnEvent(event) || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === 'ArrowLeft') stepRef.current(-1);
      if (event.key === 'ArrowRight') stepRef.current(1);
    };
    // 指で横になぞったら、となりの作品へ（縦のスクロールとまちがえないよう、横に大きく動いたときだけ）
    let swipeStart: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      swipeStart =
        event.pointerType === 'touch' && isOwnEvent(event)
          ? { x: event.clientX, y: event.clientY }
          : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 2) {
        stepRef.current(dx < 0 ? 1 : -1);
      }
    };
    const onPointerCancel = () => {
      swipeStart = null;
    };
    element.addEventListener('click', onClick);
    element.addEventListener('close', onClose);
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('popstate', onPopState);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('close', onClose);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('popstate', onPopState);
      window.clearTimeout(clearTimer.current);
      window.clearTimeout(linkTimer);
    };
  }, []);

  const open = (id: string) => {
    show(id);
    pushLayers({ room: 'works', work: id });
  };

  // ブラウザのタブの名前も、開いている作品に合わせる
  // （URL は書きかえるだけで、ページの読み込み直しは起きないため）
  useEffect(() => {
    if (!shown) return;
    document.title = `${shown.title} | ${site.title}`;
    return () => {
      document.title = site.title;
    };
  }, [shown]);

  // 道具のボタン。作品で使っている数の多い順（同じ数なら名前の順）
  const toolCounts = new Map<string, number>();
  for (const work of works) {
    for (const name of work.tools ?? []) {
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
    }
  }
  const tools = [...toolCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  const listed = works.filter(
    (work) =>
      (genre === 'all' || work.genre === genre) &&
      (tool === 'all' || (work.tools ?? []).includes(tool)),
  );
  // 年表で見るときは、作り始めた年ごとにまとめる
  const yearGroups = view === 'timeline' ? groupByYear(listed) : [];
  const ordered =
    view === 'timeline' ? yearGroups.flatMap((group) => group.works) : listed;

  // 詳細の「前の作品・次の作品」。いま画面に出ている順（絞り込み中ならその中）でたどる
  const shownIndex = ordered.findIndex((work) => work.id === shownId);
  const previous = shownIndex > 0 ? ordered[shownIndex - 1] : undefined;
  const next =
    shownIndex >= 0 && shownIndex < ordered.length - 1
      ? ordered[shownIndex + 1]
      : undefined;
  // 詳細を開いたまま、となりの作品へ切りかえる（履歴は積まず、URL だけ変える）。
  // 進んだ向きから、すっと入ってくるように見せる
  const switchTo = (id: string) => {
    const direction = id === previous?.id ? -1 : 1;
    playSound('pop');
    setShownId(id);
    replaceLayers({ room: 'works', work: id });
    dialog.current?.scrollTo({ top: 0 });
    if (!reducesMotion()) {
      dialog.current?.querySelector('.work-detail')?.animate(
        [
          { opacity: 0, translate: `${direction * 28}px 0` },
          { opacity: 1, translate: '0 0' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  };
  useEffect(() => {
    stepRef.current = (direction) => {
      const target = direction < 0 ? previous : next;
      if (target) switchTo(target.id);
    };
  });

  const renderItem = (work: Work) => (
    <li key={work.id}>
      <button
        type="button"
        className="works-item"
        onClick={() => {
          playSound('pop');
          open(work.id);
        }}
      >
        <WorkThumbnail work={work} />
        <span className="works-item-title">{work.title}</span>
        <span className="works-item-category">{work.category}</span>
      </button>
    </li>
  );

  return (
    <>
      <div className="works-controls">
        <ul
          className="works-genres"
          aria-label={t('ジャンルで絞り込む', 'Filter by genre')}
        >
          {[
            { id: 'all' as const, label: 'すべて', labelEn: 'All' },
            ...workGenres,
          ].map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={genre === item.id}
                onClick={() => {
                  playSound('pop');
                  setGenre(item.id);
                }}
              >
                {t(item.label, item.labelEn)}
              </button>
            </li>
          ))}
        </ul>
        {/* 使った道具で絞り込む */}
        {tools.length > 0 && (
          <ul
            className="works-genres works-tools"
            aria-label={t('使った道具で絞り込む', 'Filter by tool')}
          >
            <li className="works-tools-label" aria-hidden="true">
              {t('道具', 'Tools')}
            </li>
            {['all', ...tools].map((item) => (
              <li key={item}>
                <button
                  type="button"
                  aria-pressed={tool === item}
                  onClick={() => {
                    playSound('pop');
                    setTool(item);
                  }}
                >
                  {item === 'all' ? t('すべて', 'All') : item}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* 並べ方: 一覧（いつもの）か、年ごとの年表か */}
        <fieldset className="works-view" aria-label={t('並べ方', 'Layout')}>
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => {
                playSound('pop');
                setView(item.id);
              }}
            >
              {t(item.label, item.labelEn)}
            </button>
          ))}
        </fieldset>
      </div>

      {listed.length === 0 ? (
        <p className="works-empty">
          {t(
            'この組み合わせの作品はまだありません。',
            'No works match this combination yet.',
          )}
        </p>
      ) : view === 'grid' ? (
        <ul className="works">{listed.map(renderItem)}</ul>
      ) : (
        <ol className="works-timeline">
          {yearGroups.map((group) => (
            <li key={group.year}>
              <h3 className="works-timeline-year">
                {group.year === NO_YEAR ? t('その他', 'Other') : group.year}
              </h3>
              <ul className="works">{group.works.map(renderItem)}</ul>
            </li>
          ))}
        </ol>
      )}

      <dialog
        ref={dialog}
        className="work-dialog"
        aria-labelledby="work-dialog-title"
      >
        {shown && (
          <WorkDetail
            work={shown}
            titleId="work-dialog-title"
            previous={previous}
            next={next}
            onSwitch={switchTo}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
