import type { MotionId } from '@/components/vrm/motions';

/**
 * アバターのビューアでループ再生するモーション。
 *
 * VRMアニメーション7種セット（VRoid Project）の VRMA_01「全身を見せる」。
 * 利用規約: https://booth.pm/ja/items/5512385
 *   - 取り出せる状態での二次配布は禁止 → .vrma は配信せず、
 *     scripts/encode-motion.mjs で変換した埋め込みデータを使う
 *   - 商用利用時はクレジット表記が必要
 */
export const avatarMotion: { id: MotionId; credit: string; creditEn: string } =
  {
    id: 'show-full-body',
    credit: 'キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト',
    creditEn: 'Character animation: pixiv Inc. VRoid Project',
  };

/**
 * アバターの部屋の「表情をかえてみる」のボタン。
 * id は VRM の表情の名前（happy・angry・sad・surprised・relaxed など）。押すと数秒だけその顔になる。
 * その子の VRM に無い表情のボタンは出さない
 */
export const avatarExpressions: {
  id: string;
  label: string;
  labelEn: string;
}[] = [
  { id: 'happy', label: 'にっこり', labelEn: 'Happy' },
  { id: 'surprised', label: 'びっくり', labelEn: 'Surprised' },
  { id: 'angry', label: 'ぷんぷん', labelEn: 'Angry' },
  { id: 'sad', label: 'しょんぼり', labelEn: 'Sad' },
];
