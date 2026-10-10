'use client';

import { useT } from '@/components/lang';
import { PuniButton } from '@/components/puni-button';
import { WorkImageViewer } from '@/components/rooms/work-image-viewer';
import { WorkThumbnail } from '@/components/rooms/work-thumbnail';
import { ShareButtons } from '@/components/share-buttons';
import type { Work } from '@/content/types';

type WorkDetailProps = {
  work: Work;
  /** ダイアログの見出しとして読み上げる要素の id */
  titleId: string;
  /** 一覧で1つ前・1つ後の作品（端なら無し） */
  previous?: Work;
  next?: Work;
  /** となりの作品へ切りかえる */
  onSwitch: (id: string) => void;
  onClose: () => void;
};

/**
 * 作品の詳細。上にサムネイル（動画があれば動画）を大きく出し、
 * content/works.ts に書いた項目だけを並べる。外部リンクはボタンにし、もどるボタンは下に固定する。
 */
export function WorkDetail({
  work,
  titleId,
  previous,
  next,
  onSwitch,
  onClose,
}: WorkDetailProps) {
  const t = useT();
  return (
    <article className="work-detail">
      <WorkMedia work={work} />

      <h3 id={titleId}>{work.title}</h3>
      <p className="work-detail-meta">
        {work.category}
        {work.year && <span>{work.year}</span>}
      </p>
      {work.tools && work.tools.length > 0 && (
        <ul className="work-detail-tools" aria-label={t('使った道具', 'Tools')}>
          {work.tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      )}
      <p className="work-detail-lead">{work.description}</p>

      {work.body?.map((paragraph) => (
        <p key={paragraph} className="work-detail-body">
          {paragraph}
        </p>
      ))}

      {/* 外部リンク（BOOTH・配布ページなど）がある作品だけ、ボタンで出す */}
      {work.links && work.links.length > 0 && (
        <ul className="work-detail-links">
          {work.links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
                <ExternalIcon />
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* 画像は押すと大きく見られる */}
      {work.images && work.images.length > 0 && (
        <WorkImageViewer images={work.images} />
      )}

      {/* 一覧にもどらずに、となりの作品へ */}
      {(previous || next) && (
        <nav
          className="work-detail-pager"
          aria-label={t('ほかの作品', 'More works')}
        >
          {previous && (
            <button
              type="button"
              className="is-previous"
              onClick={() => onSwitch(previous.id)}
            >
              <WorkThumbnail work={previous} />
              <span>
                <small>{t('前の作品', 'Previous')}</small>
                {previous.title}
              </span>
            </button>
          )}
          {next && (
            <button
              type="button"
              className="is-next"
              onClick={() => onSwitch(next.id)}
            >
              <WorkThumbnail work={next} />
              <span>
                <small>{t('次の作品', 'Next')}</small>
                {next.title}
              </span>
            </button>
          )}
        </nav>
      )}

      <div className="work-detail-share">
        <ShareButtons path={`/work/${work.id}`} title={work.title} />
      </div>

      <footer className="work-detail-footer">
        <PuniButton
          tone="white"
          size="small"
          label={t('もどる', 'Back')}
          onPress={onClose}
        />
      </footer>
    </article>
  );
}

/** 詳細のいちばん上: 動画 → cover → サムネイルの順に、あるものを出す */
function WorkMedia({ work }: { work: Work }) {
  const t = useT();
  if (work.youtubeId) {
    return (
      <div className="work-detail-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`}
          title={t(`${work.title}の動画`, `Video: ${work.title}`)}
          allow="encrypted-media; picture-in-picture; fullscreen"
          loading="lazy"
        />
      </div>
    );
  }
  // 詳細のいちばん上の画像は中身なので、説明を付ける（書いていなければ作品名から）
  const alt =
    work.imageAlt ??
    t(`${work.title}のメイン画像`, `Main image of ${work.title}`);
  if (work.cover) {
    return <img className="work-detail-cover" src={work.cover} alt={alt} />;
  }
  return <WorkThumbnail work={work} large alt={alt} />;
}

/** 別のタブで開くことを示す矢印 */
function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M6 3h7v7M13 3 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
