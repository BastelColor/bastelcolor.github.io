/**
 * アバターの部屋の「写真」。いまの背景・ライト・展示台・モデルを1枚の PNG にして保存する。
 *
 * モデルは 3D の舞台が透明な背景で写し（vrm-stage.ts の capture）、
 * 背景と展示台は、部屋の CSS（app/styles/rooms/avatar.css）と同じ形・色をここで描き足す。
 * 展示台の色は、画面の展示台（.avatar-room-podium）の色をそのまま読む
 */
export type PhotoBackdrop = 'sky' | 'white' | 'sunset' | 'sakura' | 'night';

type Shot = {
  /** モデルだけを写した画像（背景は透明） */
  image: HTMLCanvasElement;
  /** 画像の中での、展示台の枠（画面の .avatar-room-stage）の位置。画像のピクセル */
  frame: { left: number; top: number; width: number; height: number };
};

type PhotoOptions = {
  shot: Shot;
  backdrop: PhotoBackdrop;
  /** 画面の展示台（色を読む） */
  podium: HTMLElement | null;
  /** 画面の部屋の背景（空のときの色を読む） */
  backdropElement: HTMLElement | null;
  /** 展示台が横長（みんなで並ぶ） */
  wide: boolean;
  /** 右下に入れる文字 */
  caption: string;
};

/** 画面の要素に CSS の色を当てて、実際の色（rgb）を読む */
function readColor(parent: HTMLElement, value: string) {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  parent.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** 夜空の星（いつも同じ位置になるよう、決まった数列で散らす） */
function stars(ctx: CanvasRenderingContext2D, width: number, height: number) {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const unit = Math.max(width, height) / 900;
  for (let i = 0; i < 70; i += 1) {
    ctx.globalAlpha = 0.5 + random() * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(random() * width, random() * height * 0.85, (0.8 + random() * 1.4) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 桜の花びら（うすい桃色の小さな楕円） */
function petals(ctx: CanvasRenderingContext2D, width: number, height: number) {
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const unit = Math.max(width, height) / 900;
  for (let i = 0; i < 26; i += 1) {
    ctx.save();
    ctx.translate(random() * width, random() * height);
    ctx.rotate(random() * Math.PI);
    ctx.globalAlpha = 0.55 + random() * 0.35;
    ctx.fillStyle = random() < 0.5 ? '#ffc4d8' : '#ffd6e4';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * unit, 5 * unit, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: PhotoBackdrop,
  width: number,
  height: number,
  skyColor: string,
) {
  const fillGradient = (stops: [number, string][]) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  };
  switch (backdrop) {
    case 'sky':
      ctx.fillStyle = skyColor;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'white':
      ctx.fillStyle = '#fbfdff';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'sunset':
      fillGradient([
        [0, '#c3c9ec'],
        [0.5, '#f7c6cf'],
        [1, '#ffd2ac'],
      ]);
      break;
    case 'sakura':
      fillGradient([
        [0, '#ffe8f1'],
        [1, '#fff8fb'],
      ]);
      petals(ctx, width, height);
      break;
    case 'night':
      fillGradient([
        [0, '#18213d'],
        [1, '#33426b'],
      ]);
      stars(ctx, width, height);
      break;
  }
}

/** 楕円の中を、上下のグラデーションで塗る */
function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 写真を1枚の canvas にまとめる */
export function composePhoto({
  shot,
  backdrop,
  podium,
  backdropElement,
  wide,
  caption,
}: PhotoOptions) {
  const { image, frame } = shot;
  const photo = document.createElement('canvas');
  photo.width = image.width;
  photo.height = image.height;
  const ctx = photo.getContext('2d');
  if (!ctx) return photo;
  const skyColor = backdropElement
    ? getComputedStyle(backdropElement).backgroundColor
    : '#dfecfa';
  paintBackdrop(ctx, backdrop, photo.width, photo.height, skyColor);

  if (podium) {
    const color = (name: string) => readColor(podium, `var(${name})`);
    // 画面の CSS のピクセル → 写真のピクセル
    const scale = frame.width / Math.max(1, podium.clientWidth);

    // ふんわりしたライト（.avatar-room-podium::before と同じ位置・大きさ）
    const glowWidth = frame.width * 0.64;
    const glowHeight = frame.height * 0.7;
    ctx.save();
    ctx.translate(frame.left + frame.width / 2, frame.top + frame.height * 0.04 + glowHeight / 2);
    ctx.scale(1, glowHeight / glowWidth);
    // CSS の楕円のグラデーションは、角まで届く大きさ（半径の √2 倍）で 68% に透明
    const radius = (glowWidth / 2) * Math.SQRT2 * 0.68;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, color('--stage-glow'));
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 足元の展示台（.avatar-room-podium::after と同じ。みんなで並ぶときは横長）
    const width = wide
      ? frame.width * 0.92
      : Math.min(frame.width * 0.62, 340 * scale);
    const height = width / (wide ? 12 : 5);
    const x = frame.left + (frame.width - width) / 2;
    const y = frame.top + frame.height * 1.01 - height;
    // 下にぼんやり落ちる影（CSS の box-shadow: 0 14px 24px）。canvas の filter（ぼかし）は
    // Safari 18 より前で使えないので、ふちへ向かって透明になる楕円のグラデーションで描く
    const blur = 24 * scale;
    ctx.save();
    ctx.translate(x + width / 2, y + 14 * scale + height / 2);
    ctx.scale(1, (height + blur) / (width + blur));
    const shadowRadius = (width + blur) / 2;
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
    shadow.addColorStop(0, 'rgba(47, 69, 88, 0.12)');
    shadow.addColorStop(1 - blur / (width + blur), 'rgba(47, 69, 88, 0.1)');
    shadow.addColorStop(1, 'rgba(47, 69, 88, 0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ellipse(ctx, x, y + 7 * scale, width, height, color('--stage-rim'));
    const side = ctx.createLinearGradient(0, y, 0, y + height);
    side.addColorStop(0.45, color('--stage-top'));
    side.addColorStop(1, color('--stage-side'));
    ellipse(ctx, x, y, width, height, side);
  }

  ctx.drawImage(image, 0, 0);

  // 右下に、だれの写真か・どこのサイトか
  const size = Math.round(Math.min(photo.width, photo.height) * 0.028);
  ctx.font = `900 ${size}px "Zen Maru Gothic", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle =
    backdrop === 'night' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(47, 69, 88, 0.6)';
  ctx.fillText(caption, photo.width - size * 1.2, photo.height - size);
  return photo;
}

/**
 * 写真を保存する。スマホなどで「共有」から写真に保存できるときは共有の画面を出し、
 * それ以外はファイルとしてダウンロードする
 */
export async function savePhoto(photo: HTMLCanvasElement, fileName: string) {
  const blob = await new Promise<Blob | null>((resolve) =>
    photo.toBlob(resolve, 'image/png'),
  );
  if (!blob) return;
  const file = new File([blob], fileName, { type: 'image/png' });
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // やめたときは何もしない。共有できなかったときはダウンロードにする
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
