'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * 表示する言語（日本語 / 英語）。
 *
 * - 最初は、ブラウザの言語が日本語なら日本語、それ以外は英語
 * - 右上の「日本語 / EN」で切りかえると、このブラウザに覚えておく
 * - ページを書き出すときは日本語で書き出し、読み込んだあとで言語を合わせる
 *
 * 文言は、コンポーネントの中で t('日本語', 'English') の形で書く。
 * content/ の文章の英語は、それぞれの en に書く（docs/content-guide.md）
 */
export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'yzmo-lang';
const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // 保存できない環境では、ブラウザの言語だけで決める
  }
  return window.navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 覚えられなくても、いまのページでは切りかえる
  }
  listeners.forEach((listener) => listener());
}

/** いまの言語。書き出したページと読み込んだ直後は日本語 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, readLang, () => 'ja');
}

/** t('日本語', 'English') で、いまの言語の文言を返す関数 */
export function useT() {
  const lang = useLang();
  return (ja: string, en: string) => (lang === 'en' ? en : ja);
}

/** 文言だけを切りかえる部品（サーバーで描くページの中で使う） */
export function T({ ja, en }: { ja: string; en: string }) {
  return useT()(ja, en);
}

/** 右上の「日本語 / EN」の切りかえ。<html lang> も合わせる */
export function LangToggle() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <fieldset className="lang-toggle" aria-label="Language / 言語">
      <button
        type="button"
        lang="ja"
        aria-pressed={lang === 'ja'}
        onClick={() => setLang('ja')}
      >
        日本語
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </fieldset>
  );
}
