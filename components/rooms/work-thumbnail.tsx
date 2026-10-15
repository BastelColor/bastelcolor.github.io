import type { Work } from '@/content/types';
import { cn } from '@/lib/utils';

type WorkThumbnailProps = {
  work: Work;
  /** 詳細で大きく見せるとき */
  large?: boolean;
  /**
   * 画像の説明（読み上げ用）。一覧では、ボタンの文字（作品名）があるので空のまま。
   * 詳細で大きく見せるときに渡す
   */
  alt?: string;
};

/** 画像がまだ無い作品は、部屋の色の上に分類名を置いて代わりにする */
export function WorkThumbnail({
  work,
  large = false,
  alt = '',
}: WorkThumbnailProps) {
  const className = cn('work-thumbnail', large && 'is-large');
  if (work.thumbnail) {
    return (
      <img
        className={className}
        src={work.thumbnail}
        alt={alt}
        // 一覧の小さな画像は、画面に近づいてから読む（14 枚ぜんぶを最初に読むと、スマホで 800KB ほどになる）。
        // 詳細のいちばん上の大きな画像は、すぐ読む
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
      />
    );
  }
  return (
    <span className={cn(className, 'is-empty')} aria-hidden="true">
      {work.category}
    </span>
  );
}
