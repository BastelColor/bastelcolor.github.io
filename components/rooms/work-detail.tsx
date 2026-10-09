import { PuniButton } from '@/components/puni-button';
import { WorkImageViewer } from '@/components/rooms/work-image-viewer';
import { WorkThumbnail } from '@/components/rooms/work-thumbnail';
import { ShareButtons } from '@/components/share-buttons';
import type { Work } from '@/content/types';

type WorkDetailProps = {
  work: Work;
  /** ダイアログの見出しとして読み上げる要素の id */
  titleId: string;
  onClose: () => void;
};

/**
 * 作品の詳細。上にサムネイル（動画があれば動画）を大きく出し、
 * content/works.ts に書いた項目だけを並べる。外部リンクはボタンにし、もどるボタンは下に固定する。
 */
export function WorkDetail({ work, titleId, onClose }: WorkDetailProps) {
  return (
    <article className="work-detail">
      <WorkMedia work={work} />

      <h3 id={titleId}>{work.title}</h3>
      <p className="work-detail-meta">
        {work.category}
        {work.year && <span>{work.year}</span>}
      </p>
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

      <div className="work-detail-share">
        <ShareButtons path={`/work/${work.id}`} title={work.title} />
      </div>

      <footer className="work-detail-footer">
        <PuniButton
          tone="white"
          size="small"
          label="もどる"
          onPress={onClose}
        />
      </footer>
    </article>
  );
}

/** 詳細のいちばん上: 動画 → cover → サムネイルの順に、あるものを出す */
function WorkMedia({ work }: { work: Work }) {
  if (work.youtubeId) {
    return (
      <div className="work-detail-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`}
          title={`${work.title}の動画`}
          allow="encrypted-media; picture-in-picture; fullscreen"
          loading="lazy"
        />
      </div>
    );
  }
  if (work.cover) {
    return <img className="work-detail-cover" src={work.cover} alt="" />;
  }
  return <WorkThumbnail work={work} large />;
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
