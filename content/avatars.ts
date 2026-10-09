// 足し方・書き方は docs/content-guide.md を参照
import type { Avatar } from './types';

export const boothUrl = 'https://bastelcolor.booth.pm/';

export const avatars: Avatar[] = [
  {
    id: 'quiple',
    name: 'キュイプル',
    nameEn: 'Quiple',
    description: 'リスのぬいぐるみ、キュイプルです！',
    badge: '無料配布中',
    en: { description: "I'm Quiple, a squirrel plushie!", badge: 'Free' },
    booth: 'https://bastelcolor.booth.pm/items/6746290',
    modelUrl: '/models/quiple.vrm',
    ogImage: '/avatars/quiple-og.png',
    icon: {
      normal: '/characters/quiple-icon.webp',
      happy: '/characters/quiple-icon-happy.webp',
    },
  },
  {
    id: 'coflet',
    name: 'こふりぃ',
    nameEn: 'Coflet',
    description: 'コーラフロートの妖精、こふりぃです！',
    badge: '無料配布中',
    en: { description: "I'm Coflet, a cola-float fairy!", badge: 'Free' },
    booth: 'https://bastelcolor.booth.pm/items/7525867',
    modelUrl: '/models/coflet.vrm',
    ogImage: '/avatars/coflet-og.png',
    icon: {
      normal: '/characters/coflet-icon.webp',
      happy: '/characters/coflet-icon-happy.webp',
    },
  },
  {
    id: 'timi',
    name: 'ティミ',
    nameEn: 'Timi',
    description: 'ゆきうさぎのティミです！',
    badge: '無料配布中',
    en: { description: "I'm Timi, a snow bunny!", badge: 'Free' },
    booth: 'https://bastelcolor.booth.pm/items/6372032',
    modelUrl: '/models/timi.vrm',
    ogImage: '/avatars/timi-og.png',
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
    description: '秋をつかさどるラスカルっ娘です！',
    badge: '制作中',
    en: { description: 'A raccoon girl who rules over autumn!', badge: 'WIP' },
    modelUrl: '/models/falle.vrm',
    ogImage: '/avatars/falle-og.png',
    icon: {
      normal: '/characters/falle-icon.webp',
      happy: '/characters/falle-icon-happy.webp',
    },
    liltoon: true,
  },
];
