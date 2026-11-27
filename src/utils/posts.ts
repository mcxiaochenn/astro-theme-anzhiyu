import { getCollection, type CollectionEntry } from "astro:content";
import readingTime from "reading-time";

export type PostEntry = CollectionEntry<"blog">;
export type SpecEntry = CollectionEntry<"spec">;

export function normalizeCategoryList(categories: unknown[] = []): string[] {
  const result: string[] = [];
  for (const item of categories) {
    if (typeof item === "string") {
      result.push(item);
    } else if (Array.isArray(item)) {
      result.push(...normalizeCategoryList(item));
    }
  }
  return result;
}

export function getPostUrl(entry: PostEntry): string {
  if (entry.data.permalink) {
    const p = entry.data.permalink.startsWith("/") ? entry.data.permalink : `/${entry.data.permalink}`;
    return p.endsWith("/") ? p : `${p}/`;
  }
  if (entry.data.abbrlink !== undefined && entry.data.abbrlink !== null) {
    return `/posts/${entry.data.abbrlink}/`;
  }
  return `/posts/${entry.id.replace(/\.mdx?$/, "")}/`;
}

export async function getAllPosts(): Promise<PostEntry[]> {
  const all = await getCollection("blog");
  return all
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => {
      const stickyA = a.data.sticky ?? (a.data.top ? 1 : 0);
      const stickyB = b.data.sticky ?? (b.data.top ? 1 : 0);
      if (stickyA !== stickyB) return stickyB - stickyA;
      const dateA = a.data.date ? a.data.date.getTime() : 0;
      const dateB = b.data.date ? b.data.date.getTime() : 0;
      return dateB - dateA;
    });
}

export async function getAllSpecs(): Promise<SpecEntry[]> {
  return await getCollection("spec");
}

export function getPostStats(entry: PostEntry) {
  const stats = readingTime(entry.body ?? "");
  const text = (entry.body ?? "").replace(/```[\s\S]*?```/g, "").replace(/[#>*`\[\]()]/g, "");
  const cnCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const enCount = (text.replace(/[\u4e00-\u9fa5]/g, " ").match(/[a-zA-Z0-9_]+/g) || []).length;
  const words = cnCount + enCount;
  const minutes = Math.max(1, Math.round(stats.minutes));
  return { words, minutes };
}

export interface TaxonomyItem {
  name: string;
  count: number;
  posts: PostEntry[];
}

export function aggregateCategories(posts: PostEntry[]): TaxonomyItem[] {
  const map = new Map<string, PostEntry[]>();
  for (const post of posts) {
    const cats = normalizeCategoryList(post.data.categories);
    for (const cat of cats) {
      const list = map.get(cat) ?? [];
      list.push(post);
      map.set(cat, list);
    }
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, count: list.length, posts: list }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateTags(posts: PostEntry[]): TaxonomyItem[] {
  const map = new Map<string, PostEntry[]>();
  for (const post of posts) {
    for (const tag of post.data.tags ?? []) {
      const list = map.get(tag) ?? [];
      list.push(post);
      map.set(tag, list);
    }
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, count: list.length, posts: list }))
    .sort((a, b) => b.count - a.count);
}

export function getRelatedPosts(current: PostEntry, allPosts: PostEntry[], limit = 4): PostEntry[] {
  const currentTags = new Set(current.data.tags ?? []);
  const currentCats = new Set(normalizeCategoryList(current.data.categories));

  return allPosts
    .filter((p) => p.id !== current.id)
    .map((p) => {
      let score = 0;
      for (const t of p.data.tags ?? []) {
        if (currentTags.has(t)) score += 2;
      }
      for (const c of normalizeCategoryList(p.data.categories)) {
        if (currentCats.has(c)) score += 1;
      }
      return { post: p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.post);
}

export function formatDate(date?: Date): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
