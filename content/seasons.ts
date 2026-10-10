// 季節のかざり。足し方・書き方は docs/content-guide.md の「季節のかざり」を参照
import type { Season } from './types';

/**
 * 期間のあいだだけ、トップと部屋に浮かぶ小物（星・しずく・ハート・まる）を、別の形に変える。
 * 日付は「月-日」（毎年くり返す）。見ている人のパソコンやスマホの日付で決める。
 * 期間が重なっているときは、上に書いたものを使う
 */
export const seasons: Season[] = [
  {
    id: 'halloween',
    label: 'ハロウィン',
    start: '10-01',
    end: '10-31',
    // 星 → かぼちゃ、ハート → おばけ、しずく → こうもり、まる → あめ
    shapes: { star: 'pumpkin', heart: 'ghost', drop: 'bat', dot: 'candy' },
  },
  {
    id: 'christmas',
    label: 'クリスマス',
    start: '12-01',
    end: '12-25',
    // しずく・まる → 雪の結晶、ハート → プレゼント（星はそのまま）
    shapes: { drop: 'snow', dot: 'snow', heart: 'present' },
  },
];
