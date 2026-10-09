'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  ImageViewer,
  type ImageViewerHandle,
  type ViewerImage,
} from '@/components/image-viewer';

/** 本文の HTML の <img> に、押せることを書き足し、画像の一覧を作る */
function prepareImages(html: string) {
  const images: ViewerImage[] = [];
  const markup = html.replace(/<img\b([^>]*)>/g, (_tag, attributes: string) => {
    // 属性は「 名前="値"」の形（marked が書き出す形）
    const read = (name: string) =>
      new RegExp(` ${name}="([^"]*)"`).exec(attributes)?.[1] ?? '';
    const index = images.length;
    images.push({ src: read('src'), alt: read('alt') });
    const label = `画像を大きく見る（${read('alt') || `${index + 1}枚目`}）`;
    return `<img${attributes} class="is-zoomable" tabindex="0" role="button" aria-label="${label}" data-image-index="${index}">`;
  });
  return { markup, images };
}

/**
 * 記事の本文（Markdown を変換した HTML）。本文の画像は、押すと画面いっぱいに大きく見られる
 * （components/image-viewer.tsx）。キーボードでは、画像を選んで Enter で開く。
 * 本文は作り直されることがあるので、押されたかはページ全体で受けて、本文の画像かを確かめる
 */
export function PostBody({ html }: { html: string }) {
  const viewer = useRef<ImageViewerHandle>(null);
  const { markup, images } = useMemo(() => prepareImages(html), [html]);

  useEffect(() => {
    const zoomableImage = (target: EventTarget | null) =>
      target instanceof HTMLElement
        ? target.closest<HTMLElement>('.post-body img.is-zoomable')
        : null;
    const open = (image: HTMLElement) =>
      viewer.current?.open(Number(image.dataset.imageIndex ?? 0));
    const onClick = (event: MouseEvent) => {
      const image = zoomableImage(event.target);
      if (image) open(image);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const image = zoomableImage(event.target);
      if (!image) return;
      event.preventDefault();
      open(image);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <div
        className="post-body"
        // 本文は content/posts/*.md を変換した HTML（自分で書いたものだけ）
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {images.length > 0 && <ImageViewer images={images} ref={viewer} />}
    </>
  );
}
