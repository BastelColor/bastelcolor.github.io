'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/components/lang';

/** キーボードで使えるキーの一覧（隠しコマンドは、ないしょなので書かない） */
const KEYS: { keys: string[]; ja: string; en: string }[] = [
  { keys: ['Tab'], ja: '次のボタンやリンクへ（Shift と一緒で前へ）', en: 'Move to the next button or link (with Shift: previous)' },
  { keys: ['Enter', 'Space'], ja: 'えらんでいるボタンを押す（雲を押すと部屋が開く）', en: 'Press the focused button (a cloud opens its room)' },
  { keys: ['Esc'], ja: '部屋・作品の詳細・記事・大きな画像を閉じる', en: 'Close a room, work details, a post, or a large image' },
  { keys: ['←', '→'], ja: '作品の詳細で、となりの作品へ。大きな画像で、となりの画像へ', en: 'Next/previous work in work details, or image in the image viewer' },
  { keys: ['?'], ja: 'この一覧を出す・閉じる', en: 'Show or hide this list' },
];

/**
 * ? キーで出す、キーボードで使えるキーの一覧。画面には、開いたときだけ出る（ふだんは何も描かない）。
 * 文字を打っているところ（入力欄）では、? はそのまま文字として打てる
 */
export function KeyboardHelp() {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      const element = dialog.current;
      if (!element) return;
      event.preventDefault();
      if (element.open) element.close();
      // ほかのダイアログ（作品の詳細など）が開いているときは、その上に重ねる
      else element.showModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // まわり（ダイアログそのもの）を押したら閉じる
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === element) element.close();
    };
    element.addEventListener('click', onClick);
    return () => element.removeEventListener('click', onClick);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="keyboard-help"
      aria-labelledby="keyboard-help-title"
    >
      <h2 id="keyboard-help-title">{t('キーボードで使えるキー', 'Keyboard shortcuts')}</h2>
      <dl>
        {KEYS.map((item) => (
          <div key={item.keys.join()}>
            <dt>
              {item.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{t(item.ja, item.en)}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => dialog.current?.close()}>
        {t('とじる', 'Close')}
      </button>
    </dialog>
  );
}
