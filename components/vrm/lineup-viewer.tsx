'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useT } from '@/components/lang';
import {
  createLineupStage,
  type LineupLayout,
  type LineupModel,
  type LineupStage,
} from '@/components/vrm/lineup-stage';

type ViewerState = 'loading' | 'ready' | 'error';

type LineupViewerProps = {
  models: (LineupModel & { name: string })[];
  /** 表示できたときに舞台を渡す。片付けるときは null を渡す */
  onStage?: (stage: LineupStage | null) => void;
};

/**
 * 「みんなで並ぶ」（背丈くらべ）。みんなを同じ縮尺で並べ、頭の上に名前と背丈、
 * うしろに 50cm ごとの目もりを出す（components/vrm/lineup-stage.ts）
 */
export function LineupViewer({ models, onStage }: LineupViewerProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [progress, setProgress] = useState(0);
  const [layout, setLayout] = useState<LineupLayout | null>(null);
  const onStageRef = useRef(onStage);
  useEffect(() => {
    onStageRef.current = onStage;
  });
  // 並べる子が変わったときだけ作り直す
  const modelKey = models.map((model) => model.modelUrl).join(' ');
  const modelsRef = useRef(models);
  useEffect(() => {
    modelsRef.current = models;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const controller = new AbortController();
    let stage: LineupStage | null = null;
    createLineupStage({
      canvas,
      container,
      models: modelsRef.current,
      signal: controller.signal,
      onProgress: setProgress,
      onLayout: setLayout,
    })
      .then((created) => {
        if (controller.signal.aborted) return;
        stage = created;
        onStageRef.current?.(created);
        setViewerState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setViewerState('error');
      });
    return () => {
      controller.abort();
      stage?.dispose();
      if (stage) onStageRef.current?.(null);
    };
  }, [modelKey]);

  const nameOf = (id: string) =>
    models.find((model) => model.id === id)?.name ?? id;

  return (
    <div className="vrm-viewer is-lineup" ref={containerRef}>
      {/* 目もり（50cm ごと）。モデルのうしろ */}
      {viewerState === 'ready' &&
        layout?.rulers.map((ruler) => (
          <span
            key={ruler.meters}
            className="lineup-ruler"
            style={{ '--y': `${ruler.y}px` } as CSSProperties}
            aria-hidden="true"
          >
            {ruler.meters < 1
              ? `${Math.round(ruler.meters * 100)}cm`
              : `${ruler.meters}m`}
          </span>
        ))}
      <canvas
        ref={canvasRef}
        aria-label={t(
          `${models.map((model) => model.name).join('・')}の背丈くらべ`,
          `Height comparison of ${models.map((model) => model.name).join(', ')}`,
        )}
      />
      {/* 頭の上の、名前と背丈の札 */}
      {viewerState === 'ready' && layout && (
        <ul className="lineup-tags">
          {layout.models.map((model) => (
            <li
              key={model.id}
              style={
                {
                  '--x': `${model.x}px`,
                  '--y': `${model.top}px`,
                } as CSSProperties
              }
            >
              <b>{nameOf(model.id)}</b>
              <span>{Math.round(model.height * 100)}cm</span>
            </li>
          ))}
        </ul>
      )}

      {viewerState === 'loading' && (
        <output className="vrm-loading">
          <span className="vrm-loading-orb" />
          <b>{t('みんなをよんでいます', 'Calling everyone over')}</b>
          <small>
            {progress > 0
              ? `${progress}%`
              : t('モデルを準備しています', 'Preparing the models')}
          </small>
        </output>
      )}

      {viewerState === 'error' && (
        <div className="vrm-error" role="alert">
          <b>
            {t('モデルを表示できませんでした', 'The models couldn’t be shown')}
          </b>
          <span>
            {t(
              'ページを再読み込みして、もう一度選んでください。',
              'Please reload the page and choose it again.',
            )}
          </span>
        </div>
      )}
    </div>
  );
}
