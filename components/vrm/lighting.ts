import type { Color, Scene, Vector3 } from 'three';

/**
 * モデルを照らすライトの組み合わせ（アバターの部屋の「ライト」のボタン）。
 * 空の光（上と下の色）・主な光（向きのある光）・補いの光の3つで照らす。
 * 位置はモデルの足元を原点に、+Z がモデルの正面、+X がモデルの左手側
 */
export const LIGHTINGS = ['day', 'evening', 'night', 'stage'] as const;
export type Lighting = (typeof LIGHTINGS)[number];

type Light = { color: number; intensity: number; position: [number, number, number] };
type Rig = {
  sky: number;
  ground: number;
  ambient: number;
  key: Light;
  fill: Light;
};

const RIGS: Record<Lighting, Rig> = {
  // 昼: 白い光が右上の手前から。いつもの明るさ
  day: {
    sky: 0xf7fdff,
    ground: 0xa8bbdc,
    ambient: 0.88,
    key: { color: 0xffffff, intensity: 1.4, position: [1.8, 2.8, 3.2] },
    fill: { color: 0xffddea, intensity: 0.56, position: [-2.4, 1.4, 1.2] },
  },
  // 夕方: 低い橙色の光が横から。影の側はうすむらさき
  evening: {
    sky: 0xffe1cc,
    ground: 0x9b8cc4,
    ambient: 0.72,
    key: { color: 0xffa25c, intensity: 1.55, position: [3.4, 1.1, 1.6] },
    fill: { color: 0xa9a6ff, intensity: 0.5, position: [-2.6, 1.6, 1.4] },
  },
  // 夜: 青白い月明かりが左上から。全体を少し落とす
  night: {
    sky: 0xa9bdf0,
    ground: 0x3d4a75,
    ambient: 0.62,
    key: { color: 0xd8e6ff, intensity: 1.0, position: [-1.6, 3.2, 2.4] },
    fill: { color: 0x7d8ff0, intensity: 0.42, position: [2.4, 1.0, 1.4] },
  },
  // ステージ: 真上からのスポットライトと、うしろからの桃色のふちどりの光
  stage: {
    sky: 0xfff4f8,
    ground: 0x6a6f8f,
    ambient: 0.42,
    key: { color: 0xffffff, intensity: 2.0, position: [0, 4.2, 1.6] },
    fill: { color: 0xff9ec8, intensity: 1.1, position: [0.4, 1.6, -3.2] },
  },
};

/** ライトを切りかえるときの速さ（大きいほど速い） */
const LIGHT_EASE = 5;

export type LightRig = {
  /** ライトを切りかえる。instant ならすぐ、そうでなければなめらかに */
  set: (lighting: Lighting, instant?: boolean) => void;
  /** 毎フレーム呼ぶ（なめらかに近づける） */
  update: (delta: number) => void;
};

/** scene にライトを置く。brightness はモデルごとの明るさの倍率 */
export function createLightRig(
  THREE: typeof import('three'),
  scene: Scene,
  brightness: number,
): LightRig {
  const hemisphere = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight();
  scene.add(hemisphere, key, fill);

  type Goal = {
    sky: Color;
    ground: Color;
    ambient: number;
    keyColor: Color;
    keyIntensity: number;
    keyPosition: Vector3;
    fillColor: Color;
    fillIntensity: number;
    fillPosition: Vector3;
  };
  const goalOf = (rig: Rig): Goal => ({
    sky: new THREE.Color(rig.sky),
    ground: new THREE.Color(rig.ground),
    ambient: rig.ambient * brightness,
    keyColor: new THREE.Color(rig.key.color),
    keyIntensity: rig.key.intensity * brightness,
    keyPosition: new THREE.Vector3(...rig.key.position),
    fillColor: new THREE.Color(rig.fill.color),
    fillIntensity: rig.fill.intensity * brightness,
    fillPosition: new THREE.Vector3(...rig.fill.position),
  });
  let goal = goalOf(RIGS.day);
  let moving = false;

  const apply = (k: number) => {
    hemisphere.color.lerp(goal.sky, k);
    hemisphere.groundColor.lerp(goal.ground, k);
    hemisphere.intensity += (goal.ambient - hemisphere.intensity) * k;
    key.color.lerp(goal.keyColor, k);
    key.intensity += (goal.keyIntensity - key.intensity) * k;
    key.position.lerp(goal.keyPosition, k);
    fill.color.lerp(goal.fillColor, k);
    fill.intensity += (goal.fillIntensity - fill.intensity) * k;
    fill.position.lerp(goal.fillPosition, k);
  };
  apply(1);

  return {
    set: (lighting, instant = false) => {
      goal = goalOf(RIGS[lighting]);
      if (instant) apply(1);
      moving = !instant;
    },
    update: (delta) => {
      if (!moving) return;
      apply(1 - Math.exp(-delta * LIGHT_EASE));
      if (Math.abs(goal.keyIntensity - key.intensity) < 0.002) {
        apply(1);
        moving = false;
      }
    },
  };
}
