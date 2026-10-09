'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { VrmStage } from '@/components/vrm/vrm-stage';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars } from '@/content/avatars';
import { avatarExpressions, avatarMotion } from '@/content/motions';
import { site } from '@/content/site';
import { readLayers, replaceLayers } from '@/lib/history-layers';

/** 選ぶボタンにも目印を出す badge（まだ配布していない子だと、ひと目で分かるように） */
const WIP_BADGE = '制作中';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** 「視差効果を減らす」など、動きを減らす設定にしているか */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** URL（/avatar/quiple）で選ばれているアバター。無い・知らない子なら最初の1体 */
function linkedAvatarId() {
  const { avatar } = readLayers();
  return avatars.some((item) => item.id === avatar) ? avatar! : avatars[0].id;
}

/**
 * この部屋に入った人はモデルを見に来ているので、最初の1体はすぐ読み込む。
 * 選んだ子は URL（/avatar/quiple）に書く。選び直しても履歴は積まないので、
 * ブラウザの「戻る」では部屋ごともどる
 */
export function AvatarRoom() {
  const [selectedId, setSelectedId] = useState(linkedAvatarId);
  const selected =
    avatars.find((avatar) => avatar.id === selectedId) ?? avatars[0];
  // 表示できたモデルの舞台。読み込み中は null（表情のボタンは押せない）
  const [stage, setStage] = useState<VrmStage | null>(null);
  // 動きを減らす設定の人には、くるっと回るループのモーションは流さない（その場で小さく揺れるだけ）
  const reduceMotion = usePrefersReducedMotion();

  const select = (id: string) => {
    setSelectedId(id);
    replaceLayers({ room: 'avatar', avatar: id });
  };

  // ブラウザのタブの名前も、選んでいる子に合わせる
  useEffect(() => {
    document.title = `${selected.name} / ${selected.nameEn} | ${site.title}`;
    return () => {
      document.title = site.title;
    };
  }, [selected]);

  // URL の # を手で書きかえたときなどに、選んでいる子を合わせる
  useEffect(() => {
    const onPopState = () => {
      // 部屋を閉じる「戻る」のときは、縮んでいくあいだにモデルを読み直さない
      if (readLayers().room === 'avatar') setSelectedId(linkedAvatarId());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className="avatar-room">
      <div className="avatar-room-stage">
        <VrmViewer
          key={selected.id}
          modelUrl={selected.modelUrl}
          modelName={selected.name}
          motionId={reduceMotion ? undefined : avatarMotion.id}
          brightness={selected.brightness}
          liltoon={selected.liltoon}
          variant="bare"
          // Quiple の大きなしっぽなどが枠で切れないよう、部屋の左右の端まで描く
          bleedTo=".room-inner"
          onStage={setStage}
        />
      </div>

      <div className="avatar-room-side">
        <ul className="avatar-room-choices">
          {avatars.map((avatar) => (
            <li key={avatar.id}>
              <button
                type="button"
                className="avatar-room-choice"
                aria-pressed={avatar.id === selectedId}
                onClick={() => select(avatar.id)}
              >
                <span className="avatar-room-icon">
                  <img src={avatar.icon.normal} alt="" />
                  <img className="is-happy" src={avatar.icon.happy} alt="" />
                </span>
                <span className="avatar-room-choice-text">
                  {avatar.name}
                  <small>{avatar.nameEn}</small>
                </span>
                {avatar.badge === WIP_BADGE && (
                  <span className="avatar-room-badge is-small">
                    {avatar.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {/* 選んでいる子のひとこと紹介 */}
        <div className="avatar-room-about" aria-live="polite">
          {selected.badge && (
            <span className="avatar-room-badge">{selected.badge}</span>
          )}
          <p>{selected.description}</p>
        </div>
        {/* 表情のボタン。読み込み中は全部を押せない状態で出し、表示できたらその子に無い表情を隠す */}
        <div className="avatar-room-play">
          <p className="avatar-room-play-title">表情をかえてみる</p>
          <div className="avatar-room-play-buttons">
            {avatarExpressions
              .filter(
                (expression) =>
                  !stage || stage.expressionNames.includes(expression.id),
              )
              .map((expression) => (
                <button
                  key={expression.id}
                  type="button"
                  disabled={!stage}
                  onClick={() => stage?.showExpression(expression.id)}
                >
                  {expression.label}
                </button>
              ))}
          </div>
        </div>
        <p className="avatar-room-hint">ドラッグでまわせます</p>
        {/* BOOTH にまだ商品ページが無い子（制作中など）は、リンクにせず「準備中」と出す */}
        {selected.booth ? (
          <a href={selected.booth} target="_blank" rel="noreferrer">
            BOOTHで見る
          </a>
        ) : (
          <span className="avatar-room-booth-soon">BOOTH（準備中）</span>
        )}
        <p className="avatar-room-credit">{avatarMotion.credit}</p>
      </div>
    </div>
  );
}
