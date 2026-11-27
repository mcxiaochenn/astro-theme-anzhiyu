import { parse } from "yaml";

export type SiteDataName =
  | "about"
  | "essay"
  | "album"
  | "link"
  | "equipment"
  | "creativity"
  | "todolist";

const modules = import.meta.glob("./*.yml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sources = new Map<string, string>();
for (const [filePath, raw] of Object.entries(modules)) {
  const name = /\/([^/]+)\.yml$/.exec(filePath)?.[1];
  if (name) sources.set(name, raw);
}

const cache = new Map<string, unknown>();

export function getSiteData<T = unknown>(name: SiteDataName | string): T | undefined {
  if (cache.has(name)) return cache.get(name) as T | undefined;

  const raw = sources.get(name);
  if (raw === undefined) {
    cache.set(name, undefined);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[site-data] 解析 src/data/${name}.yml 失败：${message}`);
  }

  cache.set(name, parsed);
  return parsed as T;
}
