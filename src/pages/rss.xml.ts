import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { siteConfig } from "@/config";
import { getAllPosts, getPostUrl } from "@/utils/posts";

export async function GET(context: APIContext) {
  const posts = await getAllPosts();
  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site ?? siteConfig.url,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date ?? new Date(),
      description: post.data.description ?? "",
      link: getPostUrl(post),
    })),
  });
}
