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
export const avatarMotion: { id: MotionId; credit: string } = {
  id: 'show-full-body',
  credit: 'キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト',
};
