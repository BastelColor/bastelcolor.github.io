/**
 * 小さな効果音。音のファイルは使わず、その場でブラウザに合成させる（Web Audio）。
 *
 * - 最初は鳴らさない。右上のスピーカーのボタン（components/sound-toggle.tsx）でオンにした人だけ鳴る
 * - オンにしたことは、このブラウザに覚えておく
 *
 * 鳴らす場所: 雲のボタン（puni）、テーマの切りかえ（chime）、部屋の子をつつく（boing）、
 * アバターの背景（whoosh）・写真（shutter）、そのほかの小さなボタン（pop）
 */
export type SoundName = 'puni' | 'pop' | 'chime' | 'boing' | 'whoosh' | 'shutter';

const STORAGE_KEY = 'yzmo-sound';
const listeners = new Set<() => void>();
let context: AudioContext | null = null;

export function isSoundOn() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // 覚えられない環境では、オンにできない（ページを開き直すたびに静かにもどる）
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSound(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** 音を鳴らす（オフのときは何もしない）。押したときなど、操作の中から呼ぶこと */
export function playSound(name: SoundName) {
  if (!isSoundOn()) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    SOUNDS[name](context);
  } catch {
    // 音が出せない環境では、何もしない
  }
}

/** 全体の音量 */
const VOLUME = 0.5;

/** 音の高さが from から to へ動く、丸い音（サイン波）を1つ */
function tone(
  audio: AudioContext,
  {
    from,
    to = from,
    start = 0,
    duration,
    volume,
    type = 'sine',
  }: {
    from: number;
    to?: number;
    start?: number;
    duration: number;
    volume: number;
    type?: OscillatorType;
  },
) {
  const at = audio.currentTime + start;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume * VOLUME, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

/** ざーっという音（雑音）を、周波数をしぼって1つ */
function noise(
  audio: AudioContext,
  {
    start = 0,
    duration,
    volume,
    from,
    to = from,
    q = 1,
  }: {
    start?: number;
    duration: number;
    volume: number;
    from: number;
    to?: number;
    q?: number;
  },
) {
  const at = audio.currentTime + start;
  const length = Math.ceil(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + duration);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume * VOLUME, at + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(at);
}

const SOUNDS: Record<SoundName, (audio: AudioContext) => void> = {
  // 雲を押したときの「ぷにっ」。高いところから少し下がる、やわらかい音
  puni: (audio) => {
    tone(audio, { from: 620, to: 360, duration: 0.14, volume: 0.32 });
    tone(audio, { from: 1240, to: 720, duration: 0.08, volume: 0.06 });
  },
  // 小さなボタンの「ぽっ」
  pop: (audio) => {
    tone(audio, { from: 900, to: 620, duration: 0.07, volume: 0.2 });
  },
  // テーマを切りかえたときの「きらん」。2つの音を続けて
  chime: (audio) => {
    tone(audio, { from: 1047, duration: 0.5, volume: 0.16, type: 'triangle' });
    tone(audio, {
      from: 1568,
      start: 0.09,
      duration: 0.6,
      volume: 0.14,
      type: 'triangle',
    });
  },
  // 部屋の子をつついたときの「ぴょん」。上がってから少し下がる
  boing: (audio) => {
    tone(audio, { from: 330, to: 820, duration: 0.13, volume: 0.28 });
    tone(audio, { from: 820, to: 560, start: 0.12, duration: 0.12, volume: 0.18 });
  },
  // 背景が広がるときの「ふわっ」
  whoosh: (audio) => {
    noise(audio, { duration: 0.6, volume: 0.22, from: 300, to: 2400, q: 0.8 });
  },
  // 写真の「かしゃっ」
  shutter: (audio) => {
    noise(audio, { duration: 0.05, volume: 0.5, from: 3200, q: 0.7 });
    noise(audio, { start: 0.07, duration: 0.08, volume: 0.35, from: 2200, q: 0.7 });
  },
};
