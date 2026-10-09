import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostBody } from '@/components/blog/post-body';
import { PostLayer } from '@/components/blog/post-layer';
import { T } from '@/components/lang';
import { ShareButtons } from '@/components/share-buttons';
import { site } from '@/content/site';
import { formatPostDate } from '@/lib/post-meta';
import { getPost, getPosts } from '@/lib/posts';

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

/** 記事がまだ1本も無いときに作る、「まだ記事はありません」だけのページ */
const NO_POSTS_SLUG = 'no-posts';

export function generateStaticParams() {
  const posts = getPosts();
  // 静的に書き出すときは、記事のページが最低1つ必要なため
  if (posts.length === 0) return [{ slug: NO_POSTS_SLUG }];
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: site.title };
  return {
    title: `${post.title} | ${site.title}`,
    description: post.summary ?? site.description,
    // 共有したときのカード
    openGraph: {
      type: 'article',
      url: `/blog/${post.slug}`,
      siteName: site.title,
      title: post.title,
      description: post.summary ?? site.description,
      locale: 'ja_JP',
      publishedTime: post.date,
      // サムネイルの無い記事は、公開するときにタイトル入りのカードを作る（scripts/write-post-cards.mjs）
      images: [post.thumbnail ?? `/og/posts/${post.slug}.png`],
    },
  };
}

/** 記事のページ。ブログの部屋の上に重ねて表示する（components/blog/post-layer.tsx） */
export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post && slug === NO_POSTS_SLUG) {
    return (
      <PostLayer>
        <p className="post-empty">まだ記事はありません。</p>
      </PostLayer>
    );
  }
  if (!post) notFound();

  // 一覧は新しい順なので、1つ後ろが前（古い）の記事
  const posts = getPosts();
  const index = posts.findIndex((item) => item.slug === post.slug);
  const older = index >= 0 ? posts[index + 1] : undefined;
  const newer = index > 0 ? posts[index - 1] : undefined;

  return (
    <PostLayer>
      <article className="post">
        {post.thumbnail && (
          <img className="post-thumbnail" src={post.thumbnail} alt="" />
        )}
        <p className="post-meta">
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          {post.category && <span>{post.category}</span>}
        </p>
        <h1>{post.title}</h1>
        {/* 本文の画像は押すと大きく見られる */}
        <PostBody html={post.html} />
        {/* 前の記事・次の記事（日付の順） */}
        {(older || newer) && (
          <nav className="post-pager" aria-label="ほかの記事 / More posts">
            {older && (
              // 履歴を積まずに切りかえ、「もどる」で一覧へ帰れるようにする
              <Link href={`/blog/${older.slug}`} replace className="is-older">
                <small>
                  <T ja="前の記事" en="Previous post" />
                </small>
                {older.title}
              </Link>
            )}
            {newer && (
              <Link href={`/blog/${newer.slug}`} replace className="is-newer">
                <small>
                  <T ja="次の記事" en="Next post" />
                </small>
                {newer.title}
              </Link>
            )}
          </nav>
        )}
        <div className="post-share">
          <ShareButtons path={`/blog/${slug}`} title={post.title} />
        </div>
      </article>
    </PostLayer>
  );
}
