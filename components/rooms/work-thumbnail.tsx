import type { Work } from '@/content/types';
import { cn } from '@/lib/utils';

type WorkThumbnailProps = {
  work: Work;
  /** 詳細で大きく見せるとき */
  large?: boolean;
};

/** 画像がまだ無い作品は、部屋の色の上に分類名を置いて代わりにする */
export function WorkThumbnail({ work, large = false }: WorkThumbnailProps) {
  const className = cn('work-thumbnail', large && 'is-large');
  if (work.thumbnail) {
    return <img className={className} src={work.thumbnail} alt="" />;
  }
  return (
    <span className={cn(className, 'is-empty')} aria-hidden="true">
      {work.category}
    </span>
  );
}
