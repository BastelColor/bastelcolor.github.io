import { NotFoundBack, NotFoundTitle } from '@/components/not-found-back';
import { site } from '@/content/site';

/**
 * 「ページが見つかりません」のページ。
 * 静的に書き出すと 404.html になり、GitHub Pages は存在しない URL でこれを表示する。
 */
export default function NotFound() {
  return (
    <main className="not-found">
      <title>{`ページがみつかりません | ${site.title}`}</title>
      <p className="not-found-code" aria-hidden="true">
        404
      </p>
      <NotFoundTitle />
      <NotFoundBack />
    </main>
  );
}
