/** クラス名を並べる。false / undefined などは飛ばす（例: cn('room', isOpen && 'is-open')） */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
