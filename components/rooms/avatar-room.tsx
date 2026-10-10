'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import modelStats from 'virtual:model-stats';
import { useLang, useT } from '@/components/lang';
import { countEvent } from '@/components/page-counter';
import { composePhoto, savePhoto } from '@/components/rooms/avatar-photo';
import { ShareButtons } from '@/components/share-buttons';
import { LIGHTINGS, type Lighting } from '@/components/vrm/lighting';
import { LineupViewer } from '@/components/vrm/lineup-viewer';
import { preloadVrmStage, type VrmStage } from '@/components/vrm/vrm-stage';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars } from '@/content/avatars';
import { avatarExpressions, avatarMotion } from '@/content/motions';
import { site } from '@/content/site';
import { readLayers, replaceLayers } from '@/lib/history-layers';
import { localizeAvatar } from '@/lib/localize';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

/** 選ぶボタンにも目印を出す badge（まだ配布していない子だと、ひと目で分かるように） */
const WIP_BADGE = '制作中';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** まわすボタン1回で回り込む角度（45°） */
const ORBIT_STEP = Math.PI / 4;

/**
 * モデルのうしろの背景。空はいつもの部屋の色のまま。
 * tone は背景の明るさ（暗いテーマで明るい背景にしたら、部屋の中の文字を明るいテーマの色にもどす）
 */
const BACKDROPS = [
  { id: 'sky', label: '空', labelEn: 'sky', tone: 'theme' },
  { id: 'white', label: '白', labelEn: 'white', tone: 'light' },
  { id: 'sunset', label: '夕焼け', labelEn: 'sunset', tone: 'light' },
  { id: 'sakura', label: '桜', labelEn: 'cherry blossom', tone: 'light' },
  { id: 'night', label: '夜', labelEn: 'night', tone: 'dark' },
] as const;
type Backdrop = (typeof BACKDROPS)[number]['id'];

/** ライトの名前（components/vrm/lighting.ts） */
const LIGHTING_LABELS: Record<Lighting, [string, string]> = {
  day: ['昼', 'Day'],
  evening: ['夕方', 'Evening'],
  night: ['夜', 'Night'],
  stage: ['ステージ', 'Stage'],
};

/** 見かた: ひとりずつ / みんなで並ぶ（背丈くらべ） */
type ViewMode = 'single' | 'lineup';

/** 1体でも、みんなで並んでいても使える、舞台の操作 */
type RoomStage = Pick<
  VrmStage,
  | 'showExpression'
  | 'orbit'
  | 'front'
  | 'expressionNames'
  | 'setLighting'
  | 'capture'
>;

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
  const [stage, setStage] = useState<RoomStage | null>(null);
  const [mode, setMode] = useState<ViewMode>('single');
  const [backdrop, setBackdrop] = useState<Backdrop>('sky');
  const [lighting, setLighting] = useState<Lighting>('day');
  // 写真を撮った瞬間の、白く光る演出（撮るたびに作り直す）
  const [flash, setFlash] = useState(0);
  const podiumElement = useRef<HTMLDivElement>(null);
  const backdropElement = useRef<HTMLDivElement>(null);
  // 背景を切りかえた瞬間の「波」。モデルのところから新しい背景がぶわっと広がる。
  // base は、いちばん下に敷いてある（広がりきった）背景。広がっている途中の波は waves に順に重ねる
  // （広がりきる前に続けて押しても、まだ変わっていないところは前の背景のまま、その上に次の波が広がる）
  // key は、展示台の層を作り直さないための名前（広がりきった波の層を、そのまま下の層として使い続ける）
  const [base, setBase] = useState<{ backdrop: Backdrop; key: string }>({
    backdrop: 'sky',
    key: 'base',
  });
  const [waves, setWaves] = useState<
    { backdrop: Backdrop; x: number; y: number; key: number }[]
  >([]);
  const stageElement = useRef<HTMLDivElement>(null);
  // 波ごとの番号（重ねた順。作り直さないための key にも使う）
  const waveCount = useRef(0);
  const changeBackdrop = (next: Backdrop) => {
    if (next === backdrop) return;
    const rect = stageElement.current?.getBoundingClientRect();
    setWaves((current) => [
      ...current,
      {
        backdrop: next,
        // モデルの胸のあたりから広げる
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height * 0.45 : window.innerHeight / 2,
        key: ++waveCount.current,
      },
    ]);
    setBackdrop(next);
    playSound('whoosh');
  };
  // 波が広がりきったら、それを下に敷き、それより下の波は片付ける
  const finishWave = (key: number) => {
    const index = waves.findIndex((item) => item.key === key);
    if (index < 0) return;
    setBase({ backdrop: waves[index].backdrop, key: String(key) });
    setWaves(waves.slice(index + 1));
  };
  // 展示台とライトの層（下から順）。それぞれ、次の波の円の内側は隠す
  // （ライトは半分すけているので、隠さないと前の背景のライトが重なって明るく見えてしまう）
  const podiumLayers = [
    { key: base.key, backdrop: base.backdrop, isWave: false },
    ...waves.map((item) => ({ ...item, key: String(item.key), isWave: true })),
  ];
  // 動きを減らす設定の人には、くるっと回るループのモーションは流さない（その場で小さく揺れるだけ）
  const reduceMotion = usePrefersReducedMotion();
  const spec = specRows(selected.modelUrl, t);

  const select = (id: string) => {
    if (mode !== 'single') {
      setStage(null);
      setMode('single');
    }
    setSelectedId(id);
    replaceLayers({ room: 'avatar', avatar: id });
  };

  const changeMode = (next: ViewMode) => {
    if (next === mode) return;
    playSound('pop');
    setStage(null);
    setMode(next);
    if (next === 'lineup') countEvent('lineup');
  };

  // ライトは、モデルを切りかえても選んだままにする（新しく表示したモデルには、すぐ当てる）
  const litStage = useRef<RoomStage | null>(null);
  useEffect(() => {
    if (!stage) return;
    stage.setLighting(lighting, litStage.current !== stage);
    litStage.current = stage;
  }, [stage, lighting]);

  const takePhoto = () => {
    if (!stage) return;
    playSound('shutter');
    setFlash((count) => count + 1);
    countEvent(`photo/${mode === 'lineup' ? 'everyone' : selected.id}`);
    const name =
      mode === 'lineup'
        ? avatars.map((avatar) => avatar.nameEn).join(' & ')
        : selected.nameEn;
    const photo = composePhoto({
      shot: stage.capture(),
      backdrop,
      podium: podiumElement.current,
      backdropElement: backdropElement.current,
      wide: mode === 'lineup',
      caption: `${name} · Yzmo`,
    });
    void savePhoto(
      photo,
      `yzmo-${mode === 'lineup' ? 'everyone' : selected.id}.png`,
    );
  };

  const backdropTone = BACKDROPS.find((item) => item.id === backdrop)!.tone;
  const lineupModels = avatars.map((avatar) => ({
    id: avatar.id,
    name: t(avatar.name, avatar.nameEn),
    modelUrl: avatar.modelUrl,
    liltoon: avatar.liltoon,
    brightness: avatar.brightness,
  }));

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
    <div
      className="avatar-room"
      data-backdrop={backdrop}
      data-backdrop-tone={backdropTone}
      // 背景の波が広がっているあいだ（文字やカードの色を、波がとどくころに合わせて変える）
      data-switching={waves.length > 0 || undefined}
      data-mode={mode}
    >
      {/* 部屋ぜんたいの背景（空はいつもの部屋の色）。切りかえたときは、前の背景の上に
          新しい背景がモデルのところから広がる */}
      <div
        ref={waves.length === 0 ? backdropElement : undefined}
        className="avatar-backdrop"
        data-backdrop={base.backdrop}
        aria-hidden="true"
      />
      {waves.map((item, i) => (
        <div
          key={item.key}
          // いちばん上の波が、いま選んでいる背景（写真の空の色はここから読む）
          ref={i === waves.length - 1 ? backdropElement : undefined}
          className="avatar-backdrop is-wave"
          data-backdrop={item.backdrop}
          style={
            {
              '--wave-x': `${item.x}px`,
              '--wave-y': `${item.y}px`,
            } as CSSProperties
          }
          onAnimationEnd={() => finishWave(item.key)}
          aria-hidden="true"
        />
      ))}
      <div
        ref={stageElement}
        className="avatar-room-stage"
        data-backdrop={backdrop}
      >
        {/* ライトと展示台。背景を切りかえたときは、背景と同じ円で新しい色の台が広がる。
            外側の層が自分の円で切り抜き（.is-wave）、内側の層が次の波の円の内側を隠す（.is-covered） */}
        {podiumLayers.map((layer, i) => {
          const above = podiumLayers[i + 1];
          return (
            <div
              key={layer.key}
              className={cn(
                'avatar-room-podium-clip',
                layer.isWave && 'is-wave',
              )}
              aria-hidden="true"
            >
              <div
                // 次の波が来たら作り直して、その波と同時に隠し始める
                key={above ? `under-${above.key}` : 'top'}
                ref={above ? undefined : podiumElement}
                className={cn('avatar-room-podium', above && 'is-covered')}
                data-backdrop={layer.backdrop}
              />
            </div>
          );
        })}
        {mode === 'single' ? (
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
        ) : (
          <LineupViewer
            models={lineupModels}
            // ひとりずつのときと同じく、動きを減らす設定の人には、くるっと回るモーションは流さない
            motionId={reduceMotion ? undefined : avatarMotion.id}
            onStage={setStage}
          />
        )}
        {flash > 0 && (
          <span key={flash} className="avatar-room-flash" aria-hidden="true" />
        )}
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
              onClick={() => {
                playSound('pop');
                stage?.orbit(-ORBIT_STEP);
              }}
            >
              <TurnArrow />
            </button>
            <button
              type="button"
              disabled={!stage}
              onClick={() => {
                playSound('pop');
                stage?.front();
              }}
            >
              {t('正面', 'Front')}
            </button>
            <button
              type="button"
              aria-label={t('右へまわりこむ', 'Turn right')}
              disabled={!stage}
              onClick={() => {
                playSound('pop');
                stage?.orbit(ORBIT_STEP);
              }}
            >
              <TurnArrow flip />
            </button>
          </fieldset>
          <div className="avatar-room-tools-end">
          <button
            type="button"
            className="avatar-room-photo"
            aria-label={t('写真を撮って保存する', 'Take and save a photo')}
            title={t('写真を撮る', 'Take a photo')}
            disabled={!stage}
            onClick={takePhoto}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8.5 5.5 9.8 3.8h4.4l1.3 1.7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z" />
              <circle cx="12" cy="12.5" r="3.6" />
            </svg>
          </button>
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
                onClick={() => changeBackdrop(item.id)}
              />
            ))}
          </fieldset>
          </div>
        </div>
      </div>

      <div className="avatar-room-side">
        <fieldset
          className="avatar-room-mode"
          aria-label={t('見かた', 'View')}
        >
          <button
            type="button"
            aria-pressed={mode === 'single'}
            onClick={() => changeMode('single')}
          >
            {t('ひとりずつ', 'One at a time')}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'lineup'}
            onClick={() => changeMode('lineup')}
          >
            {t('みんなで並ぶ', 'Line up')}
          </button>
        </fieldset>
        <ul className="avatar-room-choices">
          {avatars.map((avatar) => (
            <li key={avatar.id}>
              <button
                type="button"
                className="avatar-room-choice"
                aria-pressed={mode === 'single' && avatar.id === selectedId}
                onClick={() => {
                  playSound('pop');
                  select(avatar.id);
                }}
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
        {/* 選んでいる子のひとこと紹介（みんなで並んでいるときは、背丈くらべの説明） */}
        <div className="avatar-room-about" aria-live="polite">
          {mode === 'lineup' ? (
            <p>
              {t(
                'みんなの背丈をくらべられます。数字は、耳や帽子もふくめた、頭のてっぺんまでの高さです。',
                'Compare everyone’s height. The numbers are the height to the very top, including ears and hats.',
              )}
            </p>
          ) : (
            <>
              {selected.badge && (
                <span className="avatar-room-badge">{selected.badge}</span>
              )}
              <p>{selected.description}</p>
            </>
          )}
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
                  onClick={() => {
                    playSound('pop');
                    stage?.showExpression(expression.id, {
                      seconds: 3,
                      focusFace: true,
                    });
                  }}
                >
                  {t(expression.label, expression.labelEn)}
                </button>
              ))}
          </div>
        </div>
        {/* ライトの組み合わせ */}
        <div className="avatar-room-play">
          <p className="avatar-room-play-title">
            {t('ライトをかえる', 'Change the lighting')}
          </p>
          <div className="avatar-room-play-buttons">
            {LIGHTINGS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={lighting === item}
                onClick={() => {
                  playSound('pop');
                  setLighting(item);
                }}
              >
                {t(...LIGHTING_LABELS[item])}
              </button>
            ))}
          </div>
        </div>
        {/* モデルの情報（ポリゴン数など） */}
        {mode === 'single' && spec.length > 0 && (
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
