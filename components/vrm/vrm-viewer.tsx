'use client';

import { useEffect, useRef, useState } from 'react';
import type { MotionId } from '@/components/vrm/motions';
import { createVrmStage, type VrmStage } from '@/components/vrm/vrm-stage';

type ViewerState = 'loading' | 'ready' | 'error';

type VrmViewerProps = {
  modelUrl: string;
  modelName: string;
  /** ループ再生する埋め込みモーション */
  motionId?: MotionId;
  /** 照明の明るさの倍率 */
  brightness?: number;
  /**
   * full: 操作ボタン・操作ガイド付き（アバターページ用）
   * bare: モデルだけを表示し、ドラッグでの回転のみ可能（ページ内の装飾用）
   */
  variant?: 'full' | 'bare';
};

/** モデルを差し替えるときは key を変えて作り直す前提 */
export function VrmViewer({
  modelUrl,
  modelName,
  motionId,
  brightness,
  variant = 'full',
}: VrmViewerProps) {
  const isFull = variant === 'full';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<VrmStage | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [progress, setProgress] = useState(0);
  const [autoRotate, setAutoRotate] = useState(isFull);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const controller = new AbortController();
    createVrmStage({
      canvas,
      container,
      modelUrl,
      motionId,
      brightness,
      autoRotate: isFull,
      zoom: isFull,
      signal: controller.signal,
      onProgress: setProgress,
    })
      .then((stage) => {
        // 中断済みなら stage は abort 時点で破棄されている
        if (controller.signal.aborted) return;
        stageRef.current = stage;
        setProgress(100);
        setViewerState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setViewerState('error');
      });

    return () => {
      controller.abort();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [modelUrl, motionId, brightness, isFull]);

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    stageRef.current?.setAutoRotate(next);
  };

  return (
    <div className="vrm-viewer" ref={containerRef}>
      <canvas ref={canvasRef} aria-label={`${modelName}の3Dモデル`} />

      {viewerState === 'loading' && (
        <output className="vrm-loading">
          <span className="vrm-loading-orb" />
          <b>{modelName}をよみこみ中</b>
          <small>
            {progress > 0 ? `${progress}%` : 'モデルを準備しています'}
          </small>
        </output>
      )}

      {viewerState === 'error' && (
        <div className="vrm-error" role="alert">
          <b>モデルを表示できませんでした</b>
          <span>ページを再読み込みして、もう一度選んでください。</span>
        </div>
      )}

      {isFull && viewerState === 'ready' && (
        <div className="vrm-controls" aria-label="3Dモデル操作">
          <button
            type="button"
            onClick={toggleAutoRotate}
            aria-pressed={autoRotate}
          >
            {autoRotate ? '回転をとめる' : '自動でまわす'}
          </button>
          <button type="button" onClick={() => stageRef.current?.resetView()}>
            正面にもどす
          </button>
          <button
            type="button"
            onClick={() => containerRef.current?.requestFullscreen?.()}
          >
            大きく見る
          </button>
        </div>
      )}

      {isFull && (
        <p className="vrm-guide">ドラッグで回転・ホイールで拡大縮小</p>
      )}
    </div>
  );
}
