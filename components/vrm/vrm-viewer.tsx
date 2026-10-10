'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/lang';
import type { MotionId } from '@/components/vrm/motions';
import {
  createVrmStage,
  LilToonRenderError,
  type VrmStage,
} from '@/components/vrm/vrm-stage';

type ViewerState = 'loading' | 'ready' | 'error';

type VrmViewerProps = {
  modelUrl: string;
  modelName: string;
  /** ループ再生する埋め込みモーション */
  motionId?: MotionId;
  /** 照明の明るさの倍率 */
  brightness?: number;
  /** lilToon の見た目で表示する（vrm-stage.ts の liltoon） */
  liltoon?: boolean;
  /**
   * full: 操作ボタン・操作ガイド付き（アバターページ用）
   * bare: モデルだけを表示し、ドラッグでの回転のみ可能（ページ内の装飾用）
   */
  variant?: 'full' | 'bare';
  /**
   * 枠の外へはみ出して描いてよい範囲（祖先要素の CSS セレクター）。
   * 指定すると、その要素の左右の端までモデルを描ける
   */
  bleedTo?: string;
  /**
   * 表示できたときに舞台（しぐさ・表情を動かす窓口）を渡す。片付けるときは null を渡す。
   * 呼ばれる関数が変わっても作り直さない（いちばん新しいものを呼ぶ）
   */
  onStage?: (stage: VrmStage | null) => void;
};

/** モデルを差し替えるときは key を変えて作り直す前提 */
export function VrmViewer({
  modelUrl,
  modelName,
  motionId,
  brightness,
  liltoon,
  variant = 'full',
  bleedTo,
  onStage,
}: VrmViewerProps) {
  const isFull = variant === 'full';
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<VrmStage | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [progress, setProgress] = useState(0);
  const [autoRotate, setAutoRotate] = useState(isFull);
  // lilToon で描けなかったら、ふつうの見た目で表示し直す（vrm-stage.ts の LilToonRenderError）
  const [lilToonFailed, setLilToonFailed] = useState(false);
  const useLilToon = liltoon && !lilToonFailed;
  const onStageRef = useRef(onStage);
  useEffect(() => {
    onStageRef.current = onStage;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const controller = new AbortController();
    createVrmStage({
      canvas,
      container,
      bleed: bleedTo
        ? (container.closest<HTMLElement>(bleedTo) ?? undefined)
        : undefined,
      modelUrl,
      motionId,
      brightness,
      liltoon: useLilToon,
      autoRotate: isFull,
      zoom: isFull,
      signal: controller.signal,
      onProgress: setProgress,
    })
      .then((stage) => {
        // 中断済みなら stage は abort 時点で破棄されている
        if (controller.signal.aborted) return;
        stageRef.current = stage;
        onStageRef.current?.(stage);
        setProgress(100);
        setViewerState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        if (error instanceof LilToonRenderError) {
          setLilToonFailed(true);
          return;
        }
        setViewerState('error');
      });

    return () => {
      controller.abort();
      stageRef.current?.dispose();
      if (stageRef.current) onStageRef.current?.(null);
      stageRef.current = null;
    };
  }, [modelUrl, motionId, brightness, useLilToon, isFull, bleedTo]);

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    stageRef.current?.setAutoRotate(next);
  };

  return (
    <div className="vrm-viewer" ref={containerRef}>
      <canvas
        ref={canvasRef}
        aria-label={t(`${modelName}の3Dモデル`, `3D model of ${modelName}`)}
      />

      {viewerState === 'loading' && (
        <output className="vrm-loading">
          <span className="vrm-loading-orb" />
          <b>{t(`${modelName}をよみこみ中`, `Loading ${modelName}`)}</b>
          <small>
            {progress > 0
              ? `${progress}%`
              : t('モデルを準備しています', 'Preparing the model')}
          </small>
        </output>
      )}

      {viewerState === 'error' && (
        <div className="vrm-error" role="alert">
          <b>
            {t('モデルを表示できませんでした', 'The model couldn’t be shown')}
          </b>
          <span>
            {t(
              'ページを再読み込みして、もう一度選んでください。',
              'Please reload the page and choose it again.',
            )}
          </span>
        </div>
      )}

      {isFull && viewerState === 'ready' && (
        <div
          className="vrm-controls"
          aria-label={t('3Dモデル操作', '3D model controls')}
        >
          <button
            type="button"
            onClick={toggleAutoRotate}
            aria-pressed={autoRotate}
          >
            {autoRotate
              ? t('回転をとめる', 'Stop rotating')
              : t('自動でまわす', 'Auto-rotate')}
          </button>
          <button type="button" onClick={() => stageRef.current?.resetView()}>
            {t('正面にもどす', 'Reset view')}
          </button>
          <button
            type="button"
            onClick={() => containerRef.current?.requestFullscreen?.()}
          >
            {t('大きく見る', 'Fullscreen')}
          </button>
        </div>
      )}

      {isFull && (
        <p className="vrm-guide">
          {t(
            'ドラッグで回転・ホイールで拡大縮小',
            'Drag to rotate, scroll to zoom',
          )}
        </p>
      )}
    </div>
  );
}
