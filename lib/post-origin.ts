/**
 * ブログの一覧で押した記事の位置を、記事のページへ受け渡す。
 * 記事はこの位置から膨らんで開き、閉じるときも同じ位置へ縮む。
 * （ページを直接開いたときは位置が無いので、膨らまずにそのまま表示する）
 */
type Point = { x: number; y: number };

/** 押してから記事が表示されるまでに使われなければ、古い位置として捨てる */
const VALID_MS = 3000;

let pending: { point: Point; at: number } | null = null;

export function rememberPostOrigin(element: Element) {
  const rect = element.getBoundingClientRect();
  pending = {
    point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    at: Date.now(),
  };
}

/**
 * 直前に押した位置を返す。読んでも消さない
 * （開発中は React が初期化を2回呼ぶので、1回目で消すと2回目に位置が無くなる）
 */
export function getPostOrigin(): Point | null {
  if (!pending || Date.now() - pending.at > VALID_MS) return null;
  return pending.point;
}
