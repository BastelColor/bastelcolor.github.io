// 足し方・書き方は docs/content-guide.md を参照
import type { Avatar } from './types';

export const boothUrl = 'https://bastelcolor.booth.pm/';

export const avatars: Avatar[] = [
  {
    id: 'quiple',
    name: 'Quiple',
    version: '0.0.1 beta',
    modelUrl: '/models/quiple.vrm',
    icon: {
      normal: '/characters/quiple-icon.webp',
      happy: '/characters/quiple-icon-happy.webp',
    },
  },
  {
    id: 'coflet',
    name: 'こふりぃ / Coflet',
    version: 'Beta 1.1',
    modelUrl: '/models/coflet.vrm',
    icon: {
      normal: '/characters/coflet-icon.webp',
      happy: '/characters/coflet-icon-happy.webp',
    },
  },
  {
    id: 'timi',
    name: 'Timi',
    version: '1.0.0',
    modelUrl: '/models/timi.vrm',
    icon: {
      normal: '/characters/timi-icon.webp',
      happy: '/characters/timi-icon-happy.webp',
    },
    brightness: 1.3,
  },
];
