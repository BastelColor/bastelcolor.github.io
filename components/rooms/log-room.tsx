'use client';

import Link from 'next/link';
import { useState } from 'react';
import { site } from '@/content/site';
import { formatPostDate, type Post } from '@/lib/post-meta';
import { rememberPostOrigin } from '@/lib/post-origin';

/** 記事の一覧。押すと、その位置から記事（/blog/<slug>）が膨らんで開く */
export function LogRoom({ posts }: { posts: Post[] }) {
  const [category, setCategory] = useState<string | null>(null);
  if (posts.length === 0) {
    return <p className="log-empty">まだ記事はありません。</p>;
  }

  // カテゴリが2つ以上あるときだけ、絞り込みのボタンを出す
  const categories = [
    ...new Set(posts.flatMap((post) => (post.category ? [post.category] : []))),
  ];
  const listed = category
    ? posts.filter((post) => post.category === category)
    : posts;

  return (
    <>
      {categories.length > 1 && (
        <ul
          className="works-genres log-categories"
          aria-label="カテゴリで絞り込む"
        >
          {[null, ...categories].map((item) => (
            <li key={item ?? 'all'}>
              <button
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item ?? 'すべて'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="log">
        {listed.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="log-item"
              // サムネイルの位置から膨らませる
              onClick={(event) =>
                rememberPostOrigin(
                  event.currentTarget.querySelector('.log-thumbnail') ??
                    event.currentTarget,
                )
              }
            >
              {/* 画像のない記事は、部屋の色の上にカテゴリ名を置いて並びをそろえる */}
              {post.thumbnail ? (
                <img className="log-thumbnail" src={post.thumbnail} alt="" />
              ) : (
                <span className="log-thumbnail is-empty" aria-hidden="true">
                  {post.category ?? 'BLOG'}
                </span>
              )}
              <span className="log-text">
                <span className="log-meta">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  {post.category && <span>{post.category}</span>}
                </span>
                <span className="log-title">{post.title}</span>
                {post.summary && (
                  <span className="log-summary">{post.summary}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* RSS リーダーで更新を受け取るためのリンク（scripts/write-feed.mjs が作る） */}
      <p className="log-feed">
        <a href={`${site.url}/feed.xml`}>RSS で更新を受け取る</a>
      </p>
    </>
  );
}
