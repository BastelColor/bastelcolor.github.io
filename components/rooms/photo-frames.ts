import { drawCaption } from '@/components/rooms/avatar-photo';

/**
 * 写真の飾り枠（アバターの部屋の写真と、AR の写真）。撮った写真を大きく見せるところで選べる。
 *
 *   plain   枠なし（右下に「名前 · Yzmo」だけ）
 *   cheki   チェキ風。白いふちで、下の広いところに名前と日付
 *   cloud   空色のふちに、ぷっくりした白い雲がならぶ
 *   starry  夜空のふちに、星がちらばる
 *
 * 枠は、写真の外側に足す（写真そのものは切らない）。名前の字は見出しのフォント（Cherry Bomb One）
 */
export type PhotoFrame = 'plain' | 'cheki' | 'cloud' | 'starry';

export const PHOTO_FRAMES: { id: PhotoFrame; label: string; labelEn: string }[] = [
  { id: 'plain', label: 'なし', labelEn: 'None' },
  { id: 'cheki', label: 'チェキ', labelEn: 'Instant' },
  { id: 'cloud', label: '雲', labelEn: 'Clouds' },
  { id: 'starry', label: '星空', labelEn: 'Stars' },
];

/** 選んだ枠を、その端末で覚えておく */
const STORAGE_KEY = 'yzmo-photo-frame';
export function readSavedFrame(): PhotoFrame {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return PHOTO_FRAMES.some((frame) => frame.id === saved) ? (saved as PhotoFrame) : 'plain';
  } catch {
    return 'plain';
  }
}
export function saveFrame(frame: PhotoFrame) {
  try {
    window.localStorage.setItem(STORAGE_KEY, frame);
  } catch {
    // 覚えられなくても、次は「なし」から始まるだけ
  }
}

const INK = '#2f4558';
const DISPLAY_FONT = '"Cherry Bomb One", "Zen Maru Gothic", sans-serif';
const BODY_FONT = '"Zen Maru Gothic", sans-serif';

/** 今日の日付（2026.10.17） */
function today() {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}.${two(now.getMonth() + 1)}.${two(now.getDate())}`;
}

/** 角の丸い四角の形 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/** 写真を、角を丸めて置く */
function drawPhoto(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, x: number, y: number, radius: number) {
  ctx.save();
  roundRect(ctx, x, y, photo.width, photo.height, radius);
  ctx.clip();
  ctx.drawImage(photo, x, y);
  ctx.restore();
}

/** 5 つの角の星 */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}

/** いつも同じ並びになる乱数（枠を選び直しても、星や雲の位置が変わらないように） */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * 写真に枠をつけた、新しい canvas を返す（photo はそのまま）。
 * caption は「名前 · Yzmo」。light は、枠なしのときに、明るい字で書くか（暗い背景・カメラの映像の上）
 */
export function framePhoto(
  photo: HTMLCanvasElement,
  frame: PhotoFrame,
  { caption, light }: { caption: string; light: boolean },
): HTMLCanvasElement {
  const unit = Math.min(photo.width, photo.height);
  const out = document.createElement('canvas');
  if (frame === 'plain') {
    out.width = photo.width;
    out.height = photo.height;
    out.getContext('2d')?.drawImage(photo, 0, 0);
    drawCaption(out, caption, light);
    return out;
  }

  const margin = Math.round(unit * (frame === 'cheki' ? 0.05 : 0.07));
  const bottom = Math.round(unit * (frame === 'cheki' ? 0.2 : 0.13));
  out.width = photo.width + margin * 2;
  out.height = photo.height + margin + bottom;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  const radius = frame === 'cheki' ? unit * 0.006 : unit * 0.035;
  const random = seeded(7);
  const textY = photo.height + margin + bottom / 2;

  if (frame === 'cheki') {
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, out.width, out.height);
    drawPhoto(ctx, photo, margin, margin, radius);
    // 下の広いところに、名前（左）と日付（右）
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(bottom * 0.3)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(caption, margin * 1.4, textY);
    ctx.font = `700 ${Math.round(bottom * 0.17)}px ${BODY_FONT}`;
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.6;
    ctx.fillText(today(), out.width - margin * 1.4, textY);
    ctx.globalAlpha = 1;
    return out;
  }

  if (frame === 'cloud') {
    // 空色のふち
    const sky = ctx.createLinearGradient(0, 0, 0, out.height);
    sky.addColorStop(0, '#cfe6fb');
    sky.addColorStop(1, '#eaf4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, out.width, out.height);
    // ふちにそって、ぷっくりした白い雲（丸をいくつか重ねる）
    ctx.fillStyle = '#ffffff';
    const puff = (x: number, y: number, size: number) => {
      for (const [dx, dy, r] of [
        [-0.55, 0.15, 0.45],
        [0, -0.1, 0.6],
        [0.55, 0.12, 0.48],
        [0, 0.3, 0.5],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx * size, y + dy * size, r * size, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const step = unit * 0.16;
    for (let x = step * 0.3; x < out.width; x += step * (0.9 + random() * 0.4)) {
      puff(x, margin * 0.35, margin * (0.8 + random() * 0.4));
      puff(x + step * 0.4, out.height - bottom * 0.12, margin * (0.8 + random() * 0.4));
    }
    for (let y = step * 0.6; y < out.height - bottom; y += step * (0.9 + random() * 0.4)) {
      puff(margin * 0.3, y, margin * (0.7 + random() * 0.3));
      puff(out.width - margin * 0.3, y + step * 0.3, margin * (0.7 + random() * 0.3));
    }
    // 写真（白いふちどり）
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, margin - unit * 0.008, margin - unit * 0.008, photo.width + unit * 0.016, photo.height + unit * 0.016, radius * 1.2);
    ctx.fill();
    drawPhoto(ctx, photo, margin, margin, radius);
    // 下に、白い雲の札と名前
    ctx.font = `${Math.round(bottom * 0.34)}px ${DISPLAY_FONT}`;
    const label = `${caption}   ${today()}`;
    const width = ctx.measureText(label).width + bottom * 0.9;
    const height = bottom * 0.6;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, (out.width - width) / 2, textY - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = '#4b84c4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, out.width / 2, textY + bottom * 0.02);
    return out;
  }

  // starry: 夜空のふちに、星がちらばる
  const night = ctx.createLinearGradient(0, 0, 0, out.height);
  night.addColorStop(0, '#1c2547');
  night.addColorStop(1, '#2d2f63');
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, out.width, out.height);
  const inPhoto = (x: number, y: number) =>
    x > margin * 0.6 && x < out.width - margin * 0.6 && y > margin * 0.6 && y < photo.height + margin * 1.4;
  for (let i = 0; i < 260; i++) {
    const x = random() * out.width;
    const y = random() * out.height;
    if (inPhoto(x, y)) continue;
    const big = random() < 0.25;
    ctx.fillStyle = big ? '#ffd36e' : 'rgba(255, 255, 255, 0.75)';
    if (big) star(ctx, x, y, unit * (0.012 + random() * 0.01));
    else {
      ctx.beginPath();
      ctx.arc(x, y, unit * (0.002 + random() * 0.003), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawPhoto(ctx, photo, margin, margin, radius);
  ctx.fillStyle = '#ffd36e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(bottom * 0.34)}px ${DISPLAY_FONT}`;
  ctx.fillText(caption, out.width / 2, textY - bottom * 0.08);
  ctx.font = `700 ${Math.round(bottom * 0.2)}px ${BODY_FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText(today(), out.width / 2, textY + bottom * 0.27);
  return out;
}
