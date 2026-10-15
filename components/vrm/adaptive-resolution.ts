import type { WebGLRenderer } from 'three';

/**
 * 描くのが間に合っていない端末では、3D の画面の解像度（ピクセル比）を少しずつ下げる。
 *
 * 1 コマを描く手間は、ほとんどが画素の数で決まる（lilToon のファーレは、輪郭線などの追加の描き方もあって
 * とくに重い）。スマホは画面の画素が多いので、なめらかに動かせないと、カクカクするうえに、電池の減りも
 * 熱さも増える。間に合っている端末（パソコンや速いスマホ）では、何もしない。
 *
 * - 表示してしばらく（読み込み直後のゆれ）は見ない
 * - 1 コマの間隔の平均が SLOW_FRAME より長いと、STEP だけ下げる。MIN までしか下げない
 * - 裏のタブのあいだや、そこからもどったときの、間隔が大きく空いたコマは数えない
 * - 一度下げたら上げ直さない（上げ下げをくり返して、ちらつかないように）
 * - AR のあいだは、AR の描き方が大きさを決めるので、何もしない
 */
export type AdaptiveResolution = {
  /** 毎コマ、前のコマからの時間（秒。そのままの値）を渡す */
  update: (rawDelta: number) => void;
};

/** なめらかとみなす、1 コマの間隔の上限（秒。1 秒に 45 コマ） */
const SLOW_FRAME = 1 / 45;
/** 1 回に下げる量と、下げる下限（ピクセル比） */
const STEP = 0.25;
const MIN = 1.25;
/** 表示してから（下げてから）見始めるまでの時間（秒） */
const WARMUP_SECONDS = 3;
/** 平均をとる長さ（秒か、コマ数の、先に来たほう） */
const WINDOW_SECONDS = 2;
const WINDOW_FRAMES = 60;
/** これより間隔が空いたコマは数えない（秒。裏のタブからもどったときなど。とても重い端末の 1 コマよりは長く） */
const IGNORE_GAP = 0.5;

export function createAdaptiveResolution(renderer: WebGLRenderer): AdaptiveResolution {
  let warmup = WARMUP_SECONDS;
  let sum = 0;
  let count = 0;
  return {
    update: (rawDelta) => {
      if (renderer.xr.isPresenting || document.hidden || rawDelta > IGNORE_GAP) return;
      if (warmup > 0) {
        warmup -= rawDelta;
        return;
      }
      const ratio = renderer.getPixelRatio();
      if (ratio <= MIN) return;
      sum += rawDelta;
      count += 1;
      if (sum < WINDOW_SECONDS && count < WINDOW_FRAMES) return;
      const average = sum / count;
      sum = 0;
      count = 0;
      if (average <= SLOW_FRAME) return;
      renderer.setPixelRatio(Math.max(MIN, ratio - STEP));
      // 下げた直後は、まだ重さが変わっていないこともあるので、少し待ってから見直す
      warmup = WARMUP_SECONDS / 3;
    },
  };
}
