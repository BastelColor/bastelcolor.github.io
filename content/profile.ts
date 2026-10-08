// 足し方・書き方は docs/content-guide.md を参照
import type { Profile } from './types';

export const profile: Profile = {
  leadLines: [
    'キャラクターモデルと映像を中心に、',
    '「つくって遊べるもの」を制作しています。',
  ],
  body: 'Blenderでのモデリング、VRChat向けアバター、After Effectsを使った映像制作など。新しい表現や制作方法を試すのが好きです。',
  skills: ['Blender', 'After Effects', 'Unity', 'VRChat'],
  links: [
    { label: 'X / Twitter', url: 'https://twitter.com/bastelcolor' },
    { label: 'YouTube', url: 'https://youtube.com/@bastelcolor' },
    { label: 'Misskey', url: 'https://misskey.io/@BastelColor' },
  ],
};
