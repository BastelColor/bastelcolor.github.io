'use client';

import { useRef } from 'react';
import { ImageViewer, type ImageViewerHandle } from '@/components/image-viewer';
import type { WorkImage } from '@/content/types';

/** 作品の詳細の画像一覧。押すと、その画像を画面いっぱいに大きく出す（components/image-viewer.tsx） */
export function WorkImageViewer({ images }: { images: WorkImage[] }) {
  const viewer = useRef<ImageViewerHandle>(null);
  return (
    <>
      <ul className="work-detail-images">
        {images.map((image, i) => (
          <li key={image.src}>
            <button
              type="button"
              className="work-detail-image"
              aria-label={`画像を大きく見る（${i + 1}枚目）`}
              onClick={() => viewer.current?.open(i)}
            >
              <img src={image.src} alt={image.alt} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      <ImageViewer images={images} ref={viewer} />
    </>
  );
}
