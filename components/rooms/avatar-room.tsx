'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import modelStats from 'virtual:model-stats';
import { useLang, useT } from '@/components/lang';
import { countEvent } from '@/components/page-counter';
import {
  composePhoto,
  drawCaption,
  photoFile,
  saveFile,
  savePhoto,
} from '@/components/rooms/avatar-photo';
import { ShareButtons } from '@/components/share-buttons';
import { LIGHTINGS, type Lighting } from '@/components/vrm/lighting';
import {
  detectAR,
  openQuickLook,
  type ARMode,
  type ARSession,
} from '@/components/vrm/ar';
import { LineupViewer } from '@/components/vrm/lineup-viewer';
import {
  VIEW_MODES,
  type ViewMode as DisplayMode,
} from '@/components/vrm/view-modes';
import type { LineupStage } from '@/components/vrm/lineup-stage';
import { preloadVrmStage, type VrmStage } from '@/components/vrm/vrm-stage';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars, boothUrl } from '@/content/avatars';
import { avatarExpressions, avatarMotion } from '@/content/motions';
import {
  BackIcon,
  BoxIcon,
  CameraIcon,
  HeightIcon,
  MoodIcon,
  PersonIcon,
  StopwatchIcon,
} from '@/components/rooms/ar-icons';
import { site } from '@/content/site';
import { readLayers, replaceLayers } from '@/lib/history-layers';
import { reportError } from '@/lib/report-error';
import { localizeAvatar } from '@/lib/localize';
import { reducesMotion, useReducedMotion } from '@/lib/motion';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

/** 選ぶボタンにも目印を出す badge（まだ配布していない子だと、ひと目で分かるように） */
const WIP_BADGE = '制作中';


/** まわすボタン1回で回り込む角度（45°） */
const ORBIT_STEP = Math.PI / 4;

/** iPhone で、モデルを表示してから AR クイックルック用のファイルを先に作るまでの時間（ミリ秒） */
const USDZ_PREPARE_DELAY = 3000;
/** AR の写真のタイマーの秒数 */
const AR_TIMER_SECONDS = 3;

/** AR のボタンの説明を、もう見たか（はじめて置いたときに一度だけ出す） */
const AR_GUIDE_KEY = 'yzmo-ar-guide';
function arGuideSeen() {
  try {
    return window.localStorage.getItem(AR_GUIDE_KEY) === 'seen';
  } catch {
    return false;
  }
}
function markArGuideSeen() {
  try {
    window.localStorage.setItem(AR_GUIDE_KEY, 'seen');
  } catch {
    // 覚えられなくても、次にまた出るだけ
  }
}

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
  | 'setViewMode'
  | 'setPaused'
  | 'capture'
> &
  // AR は、ひとりずつでも、みんなで並んでいても（Android は WebXR、iPhone は AR クイックルック）
  Partial<Pick<VrmStage, 'startAR' | 'exportUsdz'>> &
  // 出す・しまうのは、みんなで並ぶときだけ（components/vrm/lineup-stage.ts）
  Partial<Pick<LineupStage, 'setShown'>>;

/** 表示の名前（components/vrm/view-modes.ts） */
const VIEW_MODE_LABELS: Record<DisplayMode, [string, string]> = {
  normal: ['ふつう', 'Normal'],
  wireframe: ['ワイヤー', 'Wireframe'],
  texture: ['テクスチャ', 'Texture'],
  bones: ['ボーン', 'Bones'],
};

/** 背丈くらべに足せる「わたし」の高さ（cm）の範囲 */
const MY_HEIGHT_MIN = 50;
const MY_HEIGHT_MAX = 250;

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
    motionId: reducesMotion() ? undefined : avatarMotion.id,
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
  const [viewMode, setViewMode] = useState<DisplayMode>('normal');
  // 踊りを止めているか。別の子を選んでも、そのまま
  const [paused, setPaused] = useState(false);
  // みんなで並ぶときに、しまっている子（出ている子が1人だけのときは、その子はしまえない）
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const toggleShown = (id: string) => {
    playSound('pop');
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (avatars.length - next.size > 1) next.add(id);
      return next;
    });
  };
  // 背丈くらべの「わたし」の身長（入力のまま。数字として読めて、範囲の中のときだけ線を出す）
  const [myHeight, setMyHeight] = useState('');
  const myHeightCm = Number(myHeight);
  const myHeightMeters =
    myHeight !== '' &&
    myHeightCm >= MY_HEIGHT_MIN &&
    myHeightCm <= MY_HEIGHT_MAX
      ? myHeightCm / 100
      : undefined;
  // 写真を撮った瞬間の、白く光る演出（撮るたびに作り直す）
  const [flash, setFlash] = useState(0);
  // AR（components/vrm/ar.ts）。使える方法（スマホだけ）と、いまの様子
  const [arMode, setArMode] = useState<ARMode | null>(null);
  const [arState, setArState] = useState<'off' | 'searching' | 'placed'>(
    'off',
  );
  // AR で置いた大きさ（1 が本当の大きさ。「ちいさく」・2本指で変わる）
  const [arScale, setArScale] = useState(1);
  const arRealSize = Math.abs(arScale - 1) < 0.005;
  // AR で、手前の本物の物のうしろに隠れられるか（奥行きを測れる端末だけ）と、隠れるか
  const [arCanOcclude, setArCanOcclude] = useState(false);
  const [arOcclude, setArOcclude] = useState(false);
  // AR のあいだに写真を撮れるか（カメラの映像を読めるブラウザだけ）
  const [arCanPhoto, setArCanPhoto] = useState(false);
  const [arFlash, setArFlash] = useState(0);
  // AR の写真のタイマー（押してから AR_TIMER_SECONDS 秒後に撮る。スマホを置いて、自分もいっしょに写れる）と、
  // 撮るまでの残りの秒（数えていないときは null）
  const [arTimer, setArTimer] = useState(false);
  const [arCountdown, setArCountdown] = useState<number | null>(null);
  // AR の中に「わたし」の柱を立てるか（背丈くらべで身長を入れたときだけ）
  const [arMark, setArMark] = useState(true);
  // AR の表情のボタンの列を開いているか（ふだんは、顔のボタン1つにまとめておく）
  const [arExpressionsOpen, setArExpressionsOpen] = useState(false);
  // アイコンのボタンを押したときに、何をしたかを短く出す（アイコンだけでは分かりにくいので）
  const [arNote, setArNote] = useState<{ text: string; key: number } | null>(null);
  const showArNote = (text: string) =>
    setArNote((current) => ({ text, key: (current?.key ?? 0) + 1 }));
  // AR で最後に撮った写真（右上に小さく出し、押すと大きく見て、共有もできる）
  const [arPhoto, setArPhoto] = useState<{ file: File; url: string } | null>(null);
  const [arPhotoOpen, setArPhotoOpen] = useState(false);
  const arPhotoUrl = useRef<string | null>(null);
  // はじめて置いたときの、ボタンの説明
  const [arGuide, setArGuide] = useState(false);
  const [arBusy, setArBusy] = useState(false);
  const arSession = useRef<ARSession | null>(null);
  const arOverlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void detectAR().then((found) => {
      if (active) setArMode(found);
    });
    return () => {
      active = false;
    };
  }, []);
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
  const reduceMotion = useReducedMotion();
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

  // 踊りの止めも、選んだままにする
  useEffect(() => {
    stage?.setPaused(paused);
  }, [stage, paused]);

  // キーボード: P で、踊りを止める・また動かす。ボタンなどを選んでいないときは Space でも
  // （ボタンを選んでいるときの Space は、そのボタンを押すのに使う。入力欄では文字を打つ）
  useEffect(() => {
    if (reduceMotion) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      // ほかのダイアログ（作品の詳細・キーの一覧など）が開いているときは、何もしない
      if (document.querySelector('dialog[open]')) return;
      const isP = event.key === 'p' || event.key === 'P';
      const isSpace = event.key === ' ' && !target?.closest('button, a, [role="button"]');
      if (!isP && !isSpace) return;
      event.preventDefault();
      playSound('pop');
      setPaused((value) => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reduceMotion]);

  // みんなで並ぶときに、しまった子を舞台に伝える
  useEffect(() => {
    if (!stage?.setShown) return;
    for (const avatar of avatars) stage.setShown(avatar.id, !hiddenIds.has(avatar.id));
  }, [stage, hiddenIds]);

  // 表示（中身を見る）も、選んだままにする
  useEffect(() => {
    stage?.setViewMode(viewMode);
  }, [stage, viewMode]);

  // AR で見る。Android などはこのページの中で（WebXR）、iPhone は AR クイックルックで開く
  const openAR = async () => {
    if (!stage || arBusy) return;
    playSound('pop');
    countEvent(`ar/${mode === 'lineup' ? 'everyone' : selected.id}`);
    if (arMode === 'webxr' && stage.startAR && arOverlay.current) {
      setArScale(1);
      try {
        arSession.current = await stage.startAR(arOverlay.current, {
          onPlaced: () => {
            setArState('placed');
            if (!arGuideSeen()) setArGuide(true);
          },
          onScaleChange: setArScale,
          onEnd: () => {
            arSession.current = null;
            stopArCountdown();
            setArState('off');
          },
        });
        setArCanPhoto(arSession.current.canPhoto);
        setArMark(true);
        setArExpressionsOpen(false);
        setArNote(null);
        setArPhotoOpen(false);
        setArGuide(false);
        setArCanOcclude(arSession.current.canOcclude);
        // はじめは隠れない（境目がギザギザになることがあるので、使う人がオンにする）
        setArOcclude(false);
        setArState('searching');
      } catch (error) {
        console.error(error);
        reportError('ar-start', error);
        setArState('off');
      }
      return;
    }
    if (arMode === 'quicklook' && stage.exportUsdz) {
      setArBusy(true);
      try {
        // 画面の下の帯に、名前とサイトの名前、BOOTH へのボタンを出す
        // （みんなで並ぶときは、出ている子の名前と、BOOTH のお店のページ）
        const shown = avatars.filter((avatar) => !hiddenIds.has(avatar.id));
        const boothLink = mode === 'lineup' ? boothUrl : selected.booth;
        openQuickLook(await stage.exportUsdz(), {
          title:
            mode === 'lineup'
              ? shown.map((avatar) => t(avatar.name, avatar.nameEn)).join(' & ')
              : t(selected.name, selected.nameEn),
          subtitle: site.title,
          action: boothLink
            ? { label: t('BOOTH で見る', 'View on BOOTH'), url: boothLink }
            : undefined,
        });
      } catch (error) {
        console.error(error);
        reportError('ar-quicklook', error);
      } finally {
        setArBusy(false);
      }
    }
  };

  // iPhone では、モデルを表示して少したったら、AR クイックルック用のファイルを先に作っておく
  // （押してから作ると、ファイルが大きい子は待ち時間が長いため。作ったものは舞台が覚えている）
  useEffect(() => {
    if (arMode !== 'quicklook' || !stage?.exportUsdz) return;
    const timer = window.setTimeout(() => {
      stage.exportUsdz?.().catch(() => {
        // 先に作れなくても、押したときにもう一度作る
      });
    }, USDZ_PREPARE_DELAY);
    return () => window.clearTimeout(timer);
  }, [arMode, stage, paused, hiddenIds]);

  // みんなで並ぶときに、出ている子の名前（写真の右下に入れる）
  const shownNames = avatars
    .filter((avatar) => !hiddenIds.has(avatar.id))
    .map((avatar) => avatar.nameEn)
    .join(' & ');

  // AR の中の「わたし」の柱。身長を入れていて、出すを選んでいるときだけ立てる
  useEffect(() => {
    if (arState === 'off') return;
    arSession.current?.setMark(
      arMark && myHeightMeters !== undefined
        ? { label: lang === 'en' ? 'Me' : 'わたし', meters: myHeightMeters }
        : null,
    );
  }, [arState, arMark, myHeightMeters, lang]);

  // AR のあいだの写真。カメラの映像とモデルを1枚にして、ダウンロードする
  const takeArPhoto = async () => {
    const session = arSession.current;
    if (!session) return;
    playSound('shutter');
    setArFlash((count) => count + 1);
    const photo = await session.photo();
    if (!photo) return;
    const id = mode === 'lineup' ? 'everyone' : selected.id;
    countEvent(`ar-photo/${id}`);
    drawCaption(photo, `${mode === 'lineup' ? shownNames : selected.nameEn} · Yzmo`, true);
    const file = await photoFile(photo, `yzmo-${id}-ar.png`);
    if (!file) return;
    // AR のあいだは、共有の画面を出すと AR が止まるので、まずダウンロードに保存する
    void saveFile(file, { share: false });
    // 撮れたのが分かるよう、右上に小さく出す（前の写真の分は片付ける）
    if (arPhotoUrl.current) URL.revokeObjectURL(arPhotoUrl.current);
    arPhotoUrl.current = URL.createObjectURL(file);
    setArPhoto({ file, url: arPhotoUrl.current });
    showArNote(t('写真を保存しました', 'Photo saved'));
  };

  const closeArGuide = () => {
    playSound('pop');
    setArGuide(false);
    markArGuideSeen();
  };

  // AR の写真のタイマー（1 秒ずつ数える係）
  const arCountdownTimer = useRef<number | null>(null);
  const stopArCountdown = () => {
    if (arCountdownTimer.current !== null) window.clearTimeout(arCountdownTimer.current);
    arCountdownTimer.current = null;
    setArCountdown(null);
  };
  // 写真のボタン。タイマーのときは 3・2・1 と数えてから撮る（数えているあいだに押すと、やめる）
  const pressArPhoto = () => {
    if (arCountdown !== null) {
      stopArCountdown();
      return;
    }
    if (!arTimer) {
      void takeArPhoto();
      return;
    }
    const tick = (left: number) => {
      if (left === 0) {
        arCountdownTimer.current = null;
        setArCountdown(null);
        void takeArPhoto();
        return;
      }
      playSound('pop');
      setArCountdown(left);
      arCountdownTimer.current = window.setTimeout(() => tick(left - 1), 1000);
    };
    tick(AR_TIMER_SECONDS);
  };

  const takePhoto = () => {
    if (!stage) return;
    playSound('shutter');
    setFlash((count) => count + 1);
    countEvent(`photo/${mode === 'lineup' ? 'everyone' : selected.id}`);
    const name = mode === 'lineup' ? shownNames : selected.nameEn;
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

  // AR のボタンの説明（はじめて置いたときに出す）。いまの画面に出ているボタンだけ
  const arGuideItems: { key: string; icon: ReactNode; label: string }[] = [
    ...(arCanPhoto
      ? [
          { key: 'photo', icon: <CameraIcon />, label: t('写真を撮る', 'Take a photo') },
          {
            key: 'timer',
            icon: <StopwatchIcon />,
            label: t(`${AR_TIMER_SECONDS} 秒たってから撮る`, `Take it after ${AR_TIMER_SECONDS} seconds`),
          },
        ]
      : []),
    {
      key: 'size',
      icon: <PersonIcon small />,
      label: t('ちいさくする・本当の大きさにもどす', 'Make it small / real size'),
    },
    ...(myHeightMeters !== undefined
      ? [{ key: 'me', icon: <HeightIcon />, label: t('わたしの身長の柱を出す', 'Show your height pole') }]
      : []),
    { key: 'mood', icon: <MoodIcon />, label: t('表情を変える', 'Change the expression') },
    ...(arCanOcclude
      ? [{ key: 'hide', icon: <BoxIcon />, label: t('物のうしろに隠れる', 'Hide behind real objects') }]
      : []),
    { key: 'back', icon: <BackIcon />, label: t('AR をおわる', 'Exit AR') },
  ];
  const canShareArPhoto =
    !!arPhoto && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [arPhoto.file] });

  const backdropTone = BACKDROPS.find((item) => item.id === backdrop)!.tone;
  const lineupModels = avatars.map((avatar) => ({
    id: avatar.id,
    name: t(avatar.name, avatar.nameEn),
    modelUrl: avatar.modelUrl,
    liltoon: avatar.liltoon,
    brightness: avatar.brightness,
    icon: avatar.icon.normal,
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
            loadingIcon={selected.icon.normal}
            variant="bare"
            // Quiple の大きなしっぽなどが枠で切れないよう、部屋の左右の端まで描く
            bleedTo=".room-inner"
            onStage={setStage}
          />
        ) : (
          <LineupViewer
            models={lineupModels}
            mark={
              myHeightMeters === undefined
                ? undefined
                : { label: t('わたし', 'Me'), meters: myHeightMeters }
            }
            // ひとりずつのときと同じく、動きを減らす設定の人には、くるっと回るモーションは流さない
            motionId={reduceMotion ? undefined : avatarMotion.id}
            onStage={setStage}
          />
        )}
        {flash > 0 && (
          <span key={flash} className="avatar-room-flash" aria-hidden="true" />
        )}
        {/* AR のあいだ、カメラの映像の上に重ねる案内とボタン（WebXR の dom-overlay） */}
        <div
          ref={arOverlay}
          className="avatar-ar-overlay"
          hidden={arState === 'off'}
        >
          {/* 上: おわる（左上）と、案内 */}
          <div className="avatar-ar-top">
            <button
              type="button"
              className="avatar-ar-icon"
              aria-label={t('AR をおわる', 'Exit AR')}
              onClick={() => arSession.current?.end()}
            >
              <BackIcon />
            </button>
            <p className="avatar-ar-hint" aria-live="polite">
              {arState === 'placed'
                ? t(
                    'ほかの場所をタップすると、そこへ移ります',
                    'Tap somewhere else to move it',
                  )
                : t(
                    '床や机をゆっくり映して、白い輪が出たところをタップしてください',
                    'Slowly scan the floor or a table, then tap where the white ring appears',
                  )}
              {/* 本当の大きさでないときは、いまの大きさを出す（2本指で変えたのに気づけるように） */}
              {arState === 'placed' && !arRealSize && (
                <span className="avatar-ar-scale">
                  {t(
                    `いまの大きさ: 本当の ${Math.round(arScale * 100)}%`,
                    `Size: ${Math.round(arScale * 100)}% of real`,
                  )}
                </span>
              )}
            </p>
            {arPhoto && arState === 'placed' && (
              <button
                key={arPhoto.url}
                type="button"
                className="avatar-ar-thumb"
                aria-label={t('撮った写真を見る', 'View the photo')}
                onClick={() => {
                  playSound('pop');
                  setArPhotoOpen(true);
                }}
              >
                <img src={arPhoto.url} alt="" />
              </button>
            )}
          </div>
          {arFlash > 0 && (
            <span key={arFlash} className="avatar-ar-flash" aria-hidden="true" />
          )}
          {/* タイマーで撮るまでの残りの秒 */}
          {arCountdown !== null && arCountdown > 0 && (
            <span key={arCountdown} className="avatar-ar-countdown" aria-live="assertive">
              {arCountdown}
            </span>
          )}
          {/* アイコンのボタンを押したときの、短い説明 */}
          {arNote && (
            <output key={arNote.key} className="avatar-ar-note">
              {arNote.text}
            </output>
          )}
          {/* 撮った写真を大きく見る（この上をタップしても、置き直さない） */}
          {arPhoto && arPhotoOpen && arState === 'placed' && (
            <div className="avatar-ar-sheet" data-ar-block>
              <div className="avatar-ar-sheet-card">
                <img
                  className="avatar-ar-preview"
                  src={arPhoto.url}
                  alt={t('AR で撮った写真', 'Photo taken in AR')}
                />
                <p className="avatar-ar-sheet-small">
                  {t('ダウンロードに保存しました', 'Saved to your downloads')}
                </p>
                <div className="avatar-ar-sheet-buttons">
                  {canShareArPhoto && (
                    <button type="button" onClick={() => void saveFile(arPhoto.file)}>
                      {t('共有する', 'Share')}
                    </button>
                  )}
                  <button type="button" onClick={() => setArPhotoOpen(false)}>
                    {t('とじる', 'Close')}
                  </button>
                </div>
                {canShareArPhoto && (
                  <p className="avatar-ar-sheet-small">
                    {t('共有すると、AR はおわります', 'Sharing ends AR')}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* はじめて置いたときだけの、ボタンの説明 */}
          {arGuide && arState === 'placed' && (
            <div className="avatar-ar-sheet" data-ar-block>
              <div className="avatar-ar-sheet-card">
                <p className="avatar-ar-guide-title">{t('ボタンの使い方', 'What the buttons do')}</p>
                <ul className="avatar-ar-guide">
                  {arGuideItems.map((item) => (
                    <li key={item.key}>
                      <span className="avatar-ar-guide-icon">{item.icon}</span>
                      {item.label}
                    </li>
                  ))}
                </ul>
                <p className="avatar-ar-sheet-small">
                  {t(
                    '1本指でつかむと動かせて、2本指で大きさを変えたり、ひねってまわしたりできます。',
                    'Drag with one finger to move. Pinch to resize, twist to turn.',
                  )}
                </p>
                <div className="avatar-ar-sheet-buttons">
                  <button type="button" onClick={closeArGuide}>
                    {t('わかった', 'Got it')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="avatar-ar-bottom">
            {/* みんなで並ぶときは、1人ずつ出したりしまったりできる */}
            {mode === 'lineup' && (
              <ShownToggles hiddenIds={hiddenIds} onToggle={toggleShown} />
            )}
            {/* 表情の列（顔のボタンで開く） */}
            {arState === 'placed' && stage && arExpressionsOpen && (
              <div className="avatar-ar-buttons is-expressions">
                {avatarExpressions
                  .filter((expression) => stage.expressionNames.includes(expression.id))
                  .map((expression) => (
                    <button
                      key={expression.id}
                      type="button"
                      onClick={() => {
                        playSound('pop');
                        stage.showExpression(expression.id, { seconds: 3 });
                      }}
                    >
                      {t(expression.label, expression.labelEn)}
                    </button>
                  ))}
              </div>
            )}
            {/* カメラのアプリのように、写真を真ん中に大きく、ほかは左右にアイコンで */}
            <div className="avatar-ar-bar">
              <div className="avatar-ar-side is-start">
                {/* 本当の大きさのときは「ちいさく」（小さい人）、ちがう大きさのときは「本当の大きさ」（大きい人） */}
                <button
                  type="button"
                  className="avatar-ar-icon"
                  aria-label={
                    arRealSize
                      ? t('ちいさくする', 'Make it small')
                      : t('本当の大きさにもどす', 'Back to real size')
                  }
                  onClick={() => {
                    playSound('pop');
                    arSession.current?.setSmall(arRealSize);
                    showArNote(
                      arRealSize ? t('ちいさく', 'Small') : t('本当の大きさ', 'Real size'),
                    );
                  }}
                >
                  <PersonIcon small={arRealSize} />
                </button>
                {/* 背丈くらべで入れた身長の、「わたし」の柱（入れたときだけ） */}
                {myHeightMeters !== undefined && arState === 'placed' && (
                  <button
                    type="button"
                    className="avatar-ar-icon"
                    aria-label={t('わたしの身長の柱', 'Your height pole')}
                    aria-pressed={arMark}
                    onClick={() => {
                      playSound('pop');
                      setArMark(!arMark);
                      showArNote(
                        arMark
                          ? t('わたしの柱: かくす', 'Height pole: off')
                          : t('わたしの柱: だす', 'Height pole: on'),
                      );
                    }}
                  >
                    <HeightIcon />
                  </button>
                )}
                {/* 表情（押すと、表情のボタンの列が開く） */}
                {arState === 'placed' && stage && stage.expressionNames.length > 0 && (
                  <button
                    type="button"
                    className="avatar-ar-icon"
                    aria-label={t('表情', 'Expressions')}
                    aria-expanded={arExpressionsOpen}
                    onClick={() => {
                      playSound('pop');
                      setArExpressionsOpen((value) => !value);
                    }}
                  >
                    <MoodIcon />
                  </button>
                )}
              </div>
              {arCanPhoto && arState === 'placed' && (
                <button
                  type="button"
                  className="avatar-ar-shutter"
                  aria-label={
                    arCountdown !== null ? t('タイマーをやめる', 'Cancel timer') : t('写真を撮る', 'Take a photo')
                  }
                  onClick={pressArPhoto}
                >
                  {arCountdown !== null ? (
                    <span className="avatar-ar-shutter-count">{arCountdown}</span>
                  ) : (
                    <CameraIcon />
                  )}
                </button>
              )}
              <div className="avatar-ar-side is-end">
                {/* 押してから 3 秒後に撮る（スマホを置いて、自分もいっしょに写れる） */}
                {arCanPhoto && arState === 'placed' && (
                  <button
                    type="button"
                    className="avatar-ar-icon"
                    aria-label={t(`タイマー ${AR_TIMER_SECONDS}秒`, `${AR_TIMER_SECONDS}s timer`)}
                    aria-pressed={arTimer}
                    onClick={() => {
                      playSound('pop');
                      setArTimer(!arTimer);
                      showArNote(
                        arTimer
                          ? t('タイマー: なし', 'Timer: off')
                          : t(`タイマー: ${AR_TIMER_SECONDS}秒`, `Timer: ${AR_TIMER_SECONDS}s`),
                      );
                    }}
                  >
                    <StopwatchIcon />
                  </button>
                )}
                {/* 手前の本物の物のうしろに隠れる（奥行きを測れる端末だけ。うまく隠れないときは切れるように） */}
                {arCanOcclude && arState === 'placed' && (
                  <button
                    type="button"
                    className="avatar-ar-icon"
                    aria-label={t('物のうしろに隠れる', 'Hide behind objects')}
                    aria-pressed={arOcclude}
                    onClick={() => {
                      playSound('pop');
                      const next = !arOcclude;
                      setArOcclude(next);
                      arSession.current?.setOcclusion(next);
                      showArNote(
                        next
                          ? t('物のうしろに隠れる', 'Hides behind objects')
                          : t('物のうしろに隠れない', 'Always in front'),
                      );
                    }}
                  >
                    <BoxIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* 向きと背景のボタン。モデルの足元の左右に置く */}
        <div className="avatar-room-tools">
          <div className="avatar-room-tools-start">
          {/* 踊りを止める・また動かす（動きを減らしているときは、踊らないので出さない） */}
          {!reduceMotion && (
            <button
              type="button"
              className="avatar-room-pause"
              aria-label={
                paused
                  ? t('踊りを再生する', 'Play the dance')
                  : t('踊りを止める', 'Pause the dance')
              }
              disabled={!stage}
              onClick={() => {
                playSound('pop');
                setPaused((value) => !value);
              }}
            >
              <PlayIcon paused={paused} />
            </button>
          )}
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
          </div>
          <div className="avatar-room-tools-end">
          <div className="avatar-room-tools-row">
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
          {/* AR で見る（使えるスマホだけ。ひとりずつでも、みんなで並んでいても） */}
          {arMode && (
            <button
              type="button"
              className="avatar-room-ar"
              aria-label={t(
                'AR で、カメラの映像の中に立たせる',
                'View in your room with AR',
              )}
              title={t('AR で見る', 'View in AR')}
              disabled={!stage || arBusy}
              aria-busy={arBusy}
              onClick={() => void openAR()}
            >
              AR
            </button>
          )}
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
          {/* 表示（中身を見る）: ふつう・ワイヤー・テクスチャ・ボーン */}
          <fieldset
            className="avatar-room-display"
            aria-label={t('表示', 'Display')}
          >
            {VIEW_MODES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={viewMode === item}
                onClick={() => {
                  playSound('pop');
                  setViewMode(item);
                }}
              >
                {t(...VIEW_MODE_LABELS[item])}
              </button>
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
        {/* ライト */}
        <fieldset
          className="avatar-room-play avatar-room-light"
          aria-label={t('ライト', 'Light')}
        >
          <p className="avatar-room-play-title" aria-hidden="true">
            {t('ライトをかえる', 'Lighting')}
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
        </fieldset>
        {/* 背丈くらべに「わたし」の線を足す */}
        {/* みんなで並ぶときは、1人ずつ出したりしまったりできる（AR の中でも同じ） */}
        {mode === 'lineup' && (
          <div className="avatar-room-play avatar-room-shown">
            <p className="avatar-room-play-title">
              {t('ならぶ子をえらぶ', 'Who lines up')}
            </p>
            <ShownToggles hiddenIds={hiddenIds} onToggle={toggleShown} />
          </div>
        )}
        {mode === 'lineup' && (
          <div className="avatar-room-play avatar-room-me">
            <label className="avatar-room-play-title" htmlFor="lineup-me">
              {t('わたしの身長もならべる', 'Add your height')}
            </label>
            <div className="avatar-room-me-field">
              <input
                id="lineup-me"
                type="number"
                inputMode="numeric"
                min={MY_HEIGHT_MIN}
                max={MY_HEIGHT_MAX}
                placeholder="160"
                value={myHeight}
                onChange={(event) => setMyHeight(event.target.value)}
              />
              <span>cm</span>
            </div>
            <p className="avatar-room-spec-note">
              {t(
                '入れた数字はこの画面の中だけで使い、どこにも送りません。',
                'The number stays on this page and is never sent anywhere.',
              )}
            </p>
          </div>
        )}
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
          {t(
            'まわりをドラッグでまわせます。モデルをつまんで引っぱると、ぷるんと揺れます（しっぽや髪の先だけもつまめます）',
            'Drag around the model to rotate. Grab and pull the model to make it wobble (tails and hair tips too).',
          )}
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
/**
 * みんなで並ぶときの、1人ずつ出す・しまうボタン（顔のアイコン）。押すたびに出たり、しまわれたりする。
 * 出ている子が1人だけのときは、その子はしまえない
 */
function ShownToggles({
  hiddenIds,
  onToggle,
}: {
  hiddenIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useT();
  const shownCount = avatars.length - hiddenIds.size;
  return (
    <fieldset className="avatar-room-shown-toggles" aria-label={t('ならぶ子', 'Who lines up')}>
      {avatars.map((avatar) => {
        const shown = !hiddenIds.has(avatar.id);
        const name = t(avatar.name, avatar.nameEn);
        return (
          <button
            key={avatar.id}
            type="button"
            aria-pressed={shown}
            aria-label={name}
            title={shown ? t(`${name}をしまう`, `Hide ${name}`) : t(`${name}を出す`, `Show ${name}`)}
            disabled={shown && shownCount <= 1}
            onClick={() => onToggle(avatar.id)}
          >
            <img src={avatar.icon.normal} alt="" width={40} height={40} />
          </button>
        );
      })}
    </fieldset>
  );
}

/** 再生・停止のボタンの絵。止めているときは再生（▶）、動いているときは停止（❚❚） */
function PlayIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {paused ? (
        <path
          d="M5 3.2v9.6L12.6 8z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5.2 3.5v9M10.8 3.5v9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

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
