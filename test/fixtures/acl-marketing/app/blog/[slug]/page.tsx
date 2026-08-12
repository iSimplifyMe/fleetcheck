import { allPosts, loadPost } from "../../../lib/posts";

export const revalidate = 3600;

export function generateStaticParams() {
  return allPosts().map((slug) => ({ slug }));
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await loadPost(params.slug);
  return <article>{post.title}</article>;
}
