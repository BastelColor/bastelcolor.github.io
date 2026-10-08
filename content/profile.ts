// 足し方・書き方は docs/content-guide.md を参照
import type { Profile } from './types';

export const profile: Profile = {
  leadLines: ['「なんでもやる！」をモットーに。'],
  body: 'Blenderでの3DCGをメインに、VRアバター制作や、映像制作などを行っています。新しい表現や制作方法を試すことが好きです！',
  skills: [
    { level: 'メイン', items: ['Blender', 'Unity'] },
    {
      level: 'よく使う',
      items: [
        'After Effects',
        'Premiere Pro',
        'Substance 3D Painter',
        'InDesign',
        'OBS Studio',
        'Python',
        'C#',
      ],
    },
    { level: '勉強中', items: ['Photoshop', 'Illustrator', 'Maya'] },
  ],
  certifications: [
    'CGクリエイター検定 エキスパート',
    'CGエンジニア検定 エキスパート',
  ],
  links: [
    { label: 'X / Twitter', url: 'https://twitter.com/bastelcolor' },
    { label: 'YouTube', url: 'https://youtube.com/@bastelcolor' },
    { label: 'Misskey', url: 'https://misskey.io/@BastelColor' },
  ],
};
