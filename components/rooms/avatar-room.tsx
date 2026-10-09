'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import modelStats from 'virtual:model-stats';
import { useLang, useT } from '@/components/lang';
import { ShareButtons } from '@/components/share-buttons';
import { preloadVrmStage, type VrmStage } from '@/components/vrm/vrm-stage';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars } from '@/content/avatars';
import { avatarExpressions, avatarMotion } from '@/content/motions';
import { site } from '@/content/site';
import { readLayers, replaceLayers } from '@/lib/history-layers';
import { localizeAvatar } from '@/lib/localize';

/** 選ぶボタンにも目印を出す badge（まだ配布していない子だと、ひと目で分かるように） */
const WIP_BADGE = '制作中';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** まわすボタン1回で回り込む角度（45°） */
const ORBIT_STEP = Math.PI / 4;

/** モデルのうしろの背景。空はいつもの部屋の色のまま */
const BACKDROPS = [
  { id: 'sky', label: '空', labelEn: 'sky' },
  { id: 'white', label: '白', labelEn: 'white' },
  { id: 'night', label: '夜', labelEn: 'night' },
] as const;
type Backdrop = (typeof BACKDROPS)[number]['id'];

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

/**
 * 「モデルの情報」に出す項目。数は公開のたびに VRM から数える（scripts/vite-model-stats.ts）
 */
function specRows(
  modelUrl: string,
  t: (ja: string, en: string) => string,
): [string, string][] {
  const stats = modelStats[modelUrl];
  if (!stats) return [];
  const count = (value: number) => value.toLocaleString('ja-JP');
  const rows: [string, string][] = [];
  if (stats.eyeHeight) {
    rows.push([
      t('目の高さ', 'Eye height'),
      `${Math.round(stats.eyeHeight * 100)}cm`,
    ]);
  }
  rows.push(
    [t('ポリゴン', 'Polygons'), count(stats.triangles)],
    [t('マテリアル', 'Materials'), `${stats.materials}`],
    [t('ボーン', 'Bones'), `${stats.bones}`],
    [t('揺れもの', 'Springs'), `${stats.springs}`],
    [t('表情', 'Expressions'), `${stats.expressions}`],
    [
      t('データ量', 'File size'),
      `${(stats.fileSize / 1024 / 1024).toFixed(1)}MB`,
    ],
  );
  return rows;
}

/** URL（/avatar/quiple）で選ばれているアバター。無い・知らない子なら最初の1体 */
function linkedAvatarId() {
  const { avatar } = readLayers();
  return avatars.some((item) => item.id === avatar) ? avatar! : avatars[0].id;
}

/**
 * 部屋を開く前に、最初に出す子のモデルなどを読み込み始めておく（トップのアバターの雲にふれたとき）
 */
export function preloadAvatarRoom() {
  const id = linkedAvatarId();
  const avatar = avatars.find((item) => item.id === id) ?? avatars[0];
  preloadVrmStage({
    modelUrl: avatar.modelUrl,
    motionId: window.matchMedia(REDUCED_MOTION).matches
      ? undefined
      : avatarMotion.id,
    liltoon: avatar.liltoon,
  });
}

/**
 * この部屋に入った人はモデルを見に来ているので、最初の1体はすぐ読み込む。
 * 選んだ子は URL（/avatar/quiple）に書く。選び直しても履歴は積まないので、
 * ブラウザの「戻る」では部屋ごともどる
 */
export function AvatarRoom() {
  const [selectedId, setSelectedId] = useState(linkedAvatarId);
  const lang = useLang();
  const t = useT();
  // 英語のときは、ひとこと紹介と目印を content/avatars.ts の en で置きかえる
  const selected = localizeAvatar(
    avatars.find((avatar) => avatar.id === selectedId) ?? avatars[0],
    lang,
  );
  // 表示できたモデルの舞台。読み込み中は null（表情のボタンは押せない）
  const [stage, setStage] = useState<VrmStage | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>('sky');
  // 動きを減らす設定の人には、くるっと回るループのモーションは流さない（その場で小さく揺れるだけ）
  const reduceMotion = usePrefersReducedMotion();
  const spec = specRows(selected.modelUrl, t);

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
      <div className="avatar-room-stage" data-backdrop={backdrop}>
        <VrmViewer
          key={selected.id}
          modelUrl={selected.modelUrl}
          modelName={t(selected.name, selected.nameEn)}
          motionId={reduceMotion ? undefined : avatarMotion.id}
          brightness={selected.brightness}
          liltoon={selected.liltoon}
          variant="bare"
          // Quiple の大きなしっぽなどが枠で切れないよう、部屋の左右の端まで描く
          bleedTo=".room-inner"
          onStage={setStage}
        />
        {/* 向きと背景のボタン。モデルの足元の左右に置く */}
        <div className="avatar-room-tools">
          <fieldset
            className="avatar-room-turn"
            aria-label={t('向きを変える', 'Turn the model')}
          >
            <button
              type="button"
              aria-label={t('左へまわりこむ', 'Turn left')}
              disabled={!stage}
              onClick={() => stage?.orbit(-ORBIT_STEP)}
            >
              <TurnArrow />
            </button>
            <button
              type="button"
              disabled={!stage}
              onClick={() => stage?.front()}
            >
              {t('正面', 'Front')}
            </button>
            <button
              type="button"
              aria-label={t('右へまわりこむ', 'Turn right')}
              disabled={!stage}
              onClick={() => stage?.orbit(ORBIT_STEP)}
            >
              <TurnArrow flip />
            </button>
          </fieldset>
          <fieldset
            className="avatar-room-backdrops"
            aria-label={t('背景', 'Background')}
          >
            {BACKDROPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`is-${item.id}`}
                aria-pressed={backdrop === item.id}
                aria-label={t(
                  `背景を${item.label}にする`,
                  `Use the ${item.labelEn} background`,
                )}
                title={t(item.label, item.labelEn)}
                onClick={() => setBackdrop(item.id)}
              />
            ))}
          </fieldset>
        </div>
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
                {/* 英語のときは、英語の名前を大きく */}
                <span className="avatar-room-choice-text">
                  {t(avatar.name, avatar.nameEn)}
                  <small>{t(avatar.nameEn, avatar.name)}</small>
                </span>
                {avatar.badge === WIP_BADGE && (
                  <span className="avatar-room-badge is-small">
                    {localizeAvatar(avatar, lang).badge}
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
          <p className="avatar-room-play-title">
            {t('表情をかえてみる', 'Try an expression')}
          </p>
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
                  // 表情が見やすいよう、カメラが顔に寄る
                  onClick={() =>
                    stage?.showExpression(expression.id, {
                      seconds: 3,
                      focusFace: true,
                    })
                  }
                >
                  {t(expression.label, expression.labelEn)}
                </button>
              ))}
          </div>
        </div>
        {/* モデルの情報（ポリゴン数など） */}
        {spec.length > 0 && (
          <div className="avatar-room-spec">
            <p className="avatar-room-play-title">
              {t('モデルの情報', 'Model info')}
            </p>
            <dl>
              {spec.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="avatar-room-spec-note">
              {t(
                '目の高さは VRChat などで視点になる高さ、ポリゴンは三角形の数、表情は口の形・まばたきを含む数、データ量はサイトで表示する用に軽くしたものです。',
                'Eye height is the viewpoint height in VRChat and similar apps. Polygons are triangles, expressions include mouth shapes and blinking, and file size is for the lightened version shown on this site.',
              )}
            </p>
          </div>
        )}
        <p className="avatar-room-hint">
          {t('ドラッグでまわせます', 'Drag to rotate')}
        </p>
        {/* BOOTH にまだ商品ページが無い子（制作中など）は、リンクにせず「準備中」と出す */}
        {selected.booth ? (
          <a href={selected.booth} target="_blank" rel="noreferrer">
            {t('BOOTHで見る', 'View on BOOTH')}
          </a>
        ) : (
          <span className="avatar-room-booth-soon">
            {t('BOOTH（準備中）', 'BOOTH (coming soon)')}
          </span>
        )}
        <div className="avatar-room-share">
          <ShareButtons
            path={`/avatar/${selected.id}`}
            title={`${selected.name} / ${selected.nameEn}`}
          />
        </div>
        <p className="avatar-room-credit">
          {t(avatarMotion.credit, avatarMotion.creditEn)}
        </p>
      </div>
    </div>
  );
}

/** まわすボタンの矢印（flip で右向き） */
function TurnArrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={flip ? { scale: '-1 1' } : undefined}
    >
      <path
        d="M10 3 5 8l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
