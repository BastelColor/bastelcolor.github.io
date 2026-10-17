import type { ReactNode } from 'react';

/**
 * AR の画面のボタンのアイコン（components/rooms/avatar-room.tsx）。
 * どれも 24×24 の、丸い端の線（太さ 2）で描く。色は文字の色（currentColor）
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 写真（カメラ） */
export function CameraIcon() {
  return (
    <Icon>
      <path d="M5 7h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

/** タイマー（ストップウォッチ） */
export function StopwatchIcon() {
  return (
    <Icon>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14v-3.5M10 3h4M12 3v4M18 8l1.5-1.5" />
    </Icon>
  );
}

/** 「わたし」の柱（高さの矢印） */
export function HeightIcon() {
  return (
    <Icon>
      <path d="M5 3h14M5 21h14M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" />
    </Icon>
  );
}

/** うしろに隠れる（箱） */
export function BoxIcon() {
  return (
    <Icon>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </Icon>
  );
}

/** 人の形。small のときは小さく、足元をそろえて描く（ちいさく・本当の大きさ） */
export function PersonIcon({ small = false }: { small?: boolean }) {
  return (
    <Icon>
      <g transform={small ? 'translate(3.6 6.3) scale(0.7)' : undefined}>
        <circle cx="12" cy="7" r="4" vectorEffect="non-scaling-stroke" />
        <path
          d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </Icon>
  );
}

/** おわる（もどる矢印） */
export function BackIcon() {
  return (
    <Icon>
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h10.5a4.5 4.5 0 0 1 0 9H14" />
    </Icon>
  );
}

/** 表情（にっこりの顔と、小さな＋） */
export function MoodIcon() {
  return (
    <Icon>
      <path d="M20.9 12.9A9 9 0 1 0 12.9 20.9" />
      <path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0M16 19h6M19 16v6" />
    </Icon>
  );
}

/** ボタンの使い方（はてな） */
export function HelpIcon() {
  return (
    <Icon>
      <path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6v.6M12 18h.01" />
    </Icon>
  );
}

/** 踊りを止める（一時停止） */
export function PauseIcon() {
  return (
    <Icon>
      <path d="M9 6v12M15 6v12" />
    </Icon>
  );
}

/** 踊りをまた動かす（再生） */
export function PlayIcon() {
  return (
    <Icon>
      <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
    </Icon>
  );
}

/** 動画（ビデオカメラ） */
export function VideoIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3z" />
    </Icon>
  );
}
