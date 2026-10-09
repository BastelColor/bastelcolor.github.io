import type { MotionId } from '@/components/vrm/motions';

/**
 * アバターのビューアでループ再生するモーション。
 *
 * モーションはどれも、VRMアニメーション7種セット（VRoid Project）のもの。ループは VRMA_01「全身を見せる」。
 * 利用規約: https://booth.pm/ja/items/5512385
 *   - 取り出せる状態での二次配布は禁止 → .vrma は配信せず、
 *     scripts/encode-motion.mjs で変換した埋め込みデータを使う
 *   - 商用利用時はクレジット表記が必要
 */
export const avatarMotion: { id: MotionId; credit: string } = {
  id: 'show-full-body',
  credit: 'キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト',
};

/**
 * アバターの部屋の「うごかしてみる」のボタン。
 *
 * - expressions: 表情。id は VRM の表情の名前（happy・angry・sad・surprised・relaxed など）。
 *   押すと数秒だけその顔になる。その子の VRM に無い表情のボタンは押せない
 * - gestures: しぐさ。id は components/vrm/motions/index.ts に登録したモーション。
 *   押すと1回だけ再生して、いつものモーションにもどる。expression を書くと、そのあいだその顔になる
 */
export const avatarExpressions: { id: string; label: string }[] = [
  { id: 'happy', label: 'にっこり' },
  { id: 'surprised', label: 'びっくり' },
  { id: 'angry', label: 'ぷんぷん' },
  { id: 'sad', label: 'しょんぼり' },
];

export const avatarGestures: {
  id: MotionId;
  label: string;
  expression?: string;
}[] = [
  { id: 'greeting', label: 'あいさつ', expression: 'happy' },
  { id: 'peace', label: 'ピース', expression: 'happy' },
  { id: 'spin', label: 'くるっ' },
];
