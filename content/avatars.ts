// 足し方・書き方は docs/content-guide.md を参照
import type { Avatar } from './types';

export const boothUrl = 'https://bastelcolor.booth.pm/';

export const avatars: Avatar[] = [
  {
    id: 'quiple',
    name: 'キュイプル',
    nameEn: 'Quiple',
    booth: 'https://bastelcolor.booth.pm/items/6746290',
    modelUrl: '/models/quiple.vrm',
    icon: {
      normal: '/characters/quiple-icon.webp',
      happy: '/characters/quiple-icon-happy.webp',
    },
  },
  {
    id: 'coflet',
    name: 'こふりぃ',
    nameEn: 'Coflet',
    booth: 'https://bastelcolor.booth.pm/items/7525867',
    modelUrl: '/models/coflet.vrm',
    icon: {
      normal: '/characters/coflet-icon.webp',
      happy: '/characters/coflet-icon-happy.webp',
    },
  },
  {
    id: 'timi',
    name: 'ティミ',
    nameEn: 'Timi',
    booth: 'https://bastelcolor.booth.pm/items/6372032',
    modelUrl: '/models/timi.vrm',
    icon: {
      normal: '/characters/timi-icon.webp',
      happy: '/characters/timi-icon-happy.webp',
    },
    brightness: 1.3,
  },
  {
    // 制作途中のお試し。Unity の Mochiya Avatar Tools で書き出した、lilToon の設定入りの VRM
    id: 'falle',
    name: 'ファーレ',
    nameEn: 'Falle',
    modelUrl: '/models/falle.vrm',
    icon: {
      normal: '/characters/falle-icon.webp',
      happy: '/characters/falle-icon-happy.webp',
    },
    liltoon: true,
  },
];
