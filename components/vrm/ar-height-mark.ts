import type {
  CanvasTexture,
  Group,
  Material,
  Mesh,
  Object3D,
  Sprite,
} from 'three';
import { measureLocal } from '@/components/vrm/ar-gestures';

/**
 * AR（WebXR）で、置いた子の横に立てる「わたし」の柱（背丈くらべで入れた身長）。
 * 部屋の中で、本当の大きさの子と、自分の背丈をくらべられる。
 *
 * - 柱は置く場所の入れ物（anchor）の子なので、「ちいさく」・2本指で大きさを変えると、子と同じだけ縮む
 *   （名札だけは、読めるよう、縮めない）
 * - 置いたときに、子（みんなで並ぶときは、並んだ列）の右どなりに立てる。指でつかんで動かせる
 */
export type ARHeightMark = {
  /** 柱ぜんたい（指でつかむときに、さわったかを調べるもの。足元が、柱の位置） */
  object: Object3D;
  /** 出す身長（null で隠す） */
  set: (mark: { label: string; meters: number } | null) => void;
  /** 子の右どなりへもどす（置いたとき） */
  reset: () => void;
  /** 柱の足元を、置く場所の入れ物から見た x, z へ動かす（指でつかんだとき） */
  moveTo: (x: number, z: number) => void;
  /** 毎フレーム呼ぶ（名札の大きさを、置く大きさに合わせる） */
  update: (scale: number) => void;
  dispose: () => void;
};

/** 柱の太さ（半径 m）と、子とのすきま（m） */
const POLE_RADIUS = 0.03;
const GAP = 0.25;
/** 柱と名札の色（背丈くらべの夜の線と同じ、明るい黄色） */
const COLOR = 0xffd36e;
/** 名札の高さ（m） */
const LABEL_HEIGHT = 0.09;

export function createARHeightMark({
  THREE,
  parent,
  model,
}: {
  THREE: typeof import('three');
  /** 置く場所の入れ物 */
  parent: Object3D;
  /** 置いた子（となりに立てる） */
  model: Object3D;
}): ARHeightMark {
  const group: Group = new THREE.Group();
  group.visible = false;
  parent.add(group);

  // 柱。半分すけて、うしろの部屋も見える
  const poleMaterial = new THREE.MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const pole: Mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, 1, 24, 1, true).translate(0, 0.5, 0),
    poleMaterial,
  );
  group.add(pole);
  // 頭の高さの板（ここが身長）と、足元の丸
  const capMaterial = new THREE.MeshBasicMaterial({ color: COLOR, side: THREE.DoubleSide });
  const cap: Mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS * 3, POLE_RADIUS * 3, 0.012, 32),
    capMaterial,
  );
  group.add(cap);
  const footMaterial = new THREE.MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const foot: Mesh = new THREE.Mesh(
    new THREE.CircleGeometry(POLE_RADIUS * 3, 32).rotateX(-Math.PI / 2).translate(0, 0.002, 0),
    footMaterial,
  );
  group.add(foot);

  // 名札（文字を描いた画像を、いつもこちらを向く板に貼る）
  const canvas = document.createElement('canvas');
  const texture: CanvasTexture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const label: Sprite = new THREE.Sprite(labelMaterial);
  label.center.set(0.5, 0);
  group.add(label);
  let labelAspect = 1;
  let meters = 0;

  const drawLabel = (text: string) => {
    const height = 96;
    const context = canvas.getContext('2d');
    if (!context) return;
    const font = `900 56px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    context.font = font;
    const width = Math.ceil(context.measureText(text).width) + 64;
    canvas.width = width;
    canvas.height = height;
    context.font = font;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.roundRect(2, 2, width - 4, height - 4, (height - 4) / 2);
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = '#ffd36e';
    context.stroke();
    context.fillStyle = '#3a4256';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + 2);
    texture.needsUpdate = true;
    labelAspect = width / height;
  };

  const reset = () => {
    const box = measureLocal(THREE, model, parent);
    group.position.set(box.isEmpty() ? GAP : box.max.x + GAP, 0, box.isEmpty() ? 0 : (box.min.z + box.max.z) / 2);
  };

  return {
    object: group,
    set: (mark) => {
      group.visible = !!mark;
      if (!mark) return;
      meters = mark.meters;
      pole.scale.y = meters;
      cap.position.y = meters;
      drawLabel(`${mark.label} ${Math.round(meters * 100)}cm`);
    },
    reset,
    moveTo: (x, z) => {
      group.position.x = x;
      group.position.z = z;
    },
    update: (scale) => {
      if (!group.visible) return;
      // 名札は、置く大きさほどには縮めない（いっしょに縮むと読めない。1/4 にしたときは 1/2）
      const size = LABEL_HEIGHT / Math.sqrt(scale);
      label.scale.set(size * labelAspect, size, 1);
      label.position.y = meters + 0.03 / scale;
    },
    dispose: () => {
      parent.remove(group);
      pole.geometry.dispose();
      cap.geometry.dispose();
      foot.geometry.dispose();
      for (const material of [poleMaterial, capMaterial, footMaterial, labelMaterial] as Material[]) {
        material.dispose();
      }
      texture.dispose();
    },
  };
}
