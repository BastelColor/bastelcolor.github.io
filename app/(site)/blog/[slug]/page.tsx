import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostLayer } from '@/components/blog/post-layer';
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
    // 共有したときのカード。サムネイルが無い記事はサイト共通の画像を使う
    openGraph: {
      type: 'article',
      url: `/blog/${post.slug}`,
      siteName: site.title,
      title: post.title,
      description: post.summary ?? site.description,
      locale: 'ja_JP',
      publishedTime: post.date,
      images: [post.thumbnail ?? '/og.png'],
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
        {/* 本文は content/posts/*.md を変換した HTML（自分で書いたものだけ） */}
        <div
          className="post-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
        <div className="post-share">
          <ShareButtons path={`/blog/${slug}`} title={post.title} />
        </div>
      </article>
    </PostLayer>
  );
}
