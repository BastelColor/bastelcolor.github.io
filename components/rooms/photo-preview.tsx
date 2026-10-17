'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/lang';
import { photoFile } from '@/components/rooms/avatar-photo';
import {
  framePhoto,
  PHOTO_FRAMES,
  readSavedFrame,
  saveFrame,
  type PhotoFrame,
} from '@/components/rooms/photo-frames';
import { playSound } from '@/lib/sound';

/** 撮った写真（枠をつける前）と、枠に書く名前 */
export type PhotoSource = {
  canvas: HTMLCanvasElement;
  caption: string;
  /** 枠なしのとき、明るい字で名前を書くか（暗い背景・カメラの映像の上） */
  light: boolean;
  fileName: string;
};

/**
 * 撮った写真に、選んだ枠（components/rooms/photo-frames.ts）をつけたファイルを作る。
 * 枠を選び直すと作り直す。前のファイルの URL は片付ける
 */
export function usePhotoPreview() {
  const [source, setSource] = useState<PhotoSource | null>(null);
  const [frame, setFrame] = useState<PhotoFrame>(readSavedFrame);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);
  const url = useRef<string | null>(null);

  useEffect(() => {
    if (!source) return;
    let active = true;
    const canvas = framePhoto(source.canvas, frame, source);
    void photoFile(canvas, source.fileName).then((file) => {
      if (!active || !file) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(file);
      setResult({ file, url: url.current });
    });
    return () => {
      active = false;
    };
  }, [source, frame]);

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  return {
    result,
    frame,
    /** 新しく撮った写真を渡す（前の写真の分は、作り直したときに片付く） */
    show: (next: PhotoSource) => setSource(next),
    chooseFrame: (next: PhotoFrame) => {
      playSound('pop');
      setFrame(next);
      saveFrame(next);
    },
  };
}

/** 枠を選ぶ、小さなボタンの列 */
export function PhotoFramePicker({
  frame,
  onChoose,
}: {
  frame: PhotoFrame;
  onChoose: (frame: PhotoFrame) => void;
}) {
  const t = useT();
  return (
    <fieldset className="photo-frame-picker">
      <legend>{t('わく', 'Frame')}</legend>
      {PHOTO_FRAMES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={frame === item.id}
          className={`is-${item.id}`}
          onClick={() => onChoose(item.id)}
        >
          {t(item.label, item.labelEn)}
        </button>
      ))}
    </fieldset>
  );
}
