import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostLayer } from '@/components/blog/post-layer';
import { site } from '@/content/site';
import { formatPostDate } from '@/lib/post-meta';
import { getPost, getPosts } from '@/lib/posts';

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: site.title };
  return {
    title: `${post.title} | ${site.title}`,
    description: post.summary ?? site.description,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: 'article',
      images: post.thumbnail ? [post.thumbnail] : undefined,
    },
  };
}

/** 記事のページ。ブログの部屋の上に重ねて表示する（components/blog/post-layer.tsx） */
export default async function PostPage({ params }: PostPageProps) {
  const post = getPost((await params).slug);
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
      </article>
    </PostLayer>
  );
}
