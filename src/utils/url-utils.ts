/**
 * url-utils.ts — 站点 URL / permalink 解析（P2-2 / P2-3）。
 *
 * 站点级元数据类型（SiteConfig / PostHrefResolver）见 `../types/site.ts`；
 * 本文件 re-export 两者，调用方 `import { createUrlFor, type SiteConfig }` 一行即可。
 */
import type { PostHrefResolver, SiteConfig } from '../types/site.ts';

export type { PostHrefResolver, SiteConfig };

/** 从站点元数据里取出文章 permalink 解析器（非函数一律视为未配置）。 */
export function postHrefOf(site: unknown): PostHrefResolver | undefined {
  const resolver = (site as { postHref?: unknown } | null | undefined)?.postHref;
  return typeof resolver === 'function' ? (resolver as PostHrefResolver) : undefined;
}

/**
 * 文章 URL 末段解析（B4 收口）：`abbrlink ?? id`。
 *
 * 上游 abbrlink 插件覆盖 permalink 的最后一段（路由规则 `YYYY/MM/DD/(abbrlink ?? id)/`，
 * 见 post-page.ts:14）。此前三处各算一套：文章路由、post-list.ts 的默认 path、
 * archives/_data.ts 的归档链接——收口成这一个函数后，归档/分类/标签/404 的链接
 * 解析与实际路由共用同一段规则。判空语义与原 slug.astro 一致（0 是合法 abbrlink）。
 */
export function postSlugOf(entry: { id: string; data: Record<string, unknown> }): string {
  const abbrlink = entry.data.abbrlink;
  if (abbrlink !== undefined && abbrlink !== null && abbrlink !== '') return String(abbrlink);
  return entry.id;
}

/**
 * 缺省站点：一个「还没配置」的最小站点。
 *
 * 刻意不继承上游基准站（AnZhiYu Baseline）的标题/url —— 那是验收基准站的身份，
 * 不属于主题默认值。示例站要复刻基准的 head，由 页面显式传入。
 */
export const defaultSite: SiteConfig = {
  title: 'AnZhiYu',
  language: 'zh-CN',
  root: '/',
};

/** 合并调用方传入的站点元数据与默认值。 */
export function resolveSite(input?: Partial<SiteConfig> | null): SiteConfig {
  return { ...defaultSite, ...(input ?? {}) };
}

/**
 * 上游 `url_for()` 的最小等价实现（只处理站内前缀，不做 CDN 解析）。
 *
 * 与 `hexo-util` 的 `url_for` 对齐（P7-4）：以下三类原样返回，不拼站内前缀——
 *   1. 绝对 URL / 协议相对 URL：`https://…`、`//cdn…`；
 *   2. 任意带 scheme 的 URL：`mailto:`、`javascript:`、`tel:`、`data:`、`ftp:` …
 *      （上游 `url_for` 用 `new URL(path, site)` 判断，非本站 host 一律原样返回；
 *      `mailto:` / `javascript:` 的 hostname 为空，同样落到「原样返回」分支）；
 *   3. 锚点 `#…`；
 * 其余 `/xxx` 与 `xxx` 都拼到 `root` 之后；空值返回 `root` 本身。
 */
export function createUrlFor(root: string = '/'): (path?: string | null) => string {
  const base = root.endsWith('/') ? root : `${root}/`;
  return (path?: string | null): string => {
    if (!path) return base;
    if (
      /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) ||
      path.startsWith('#')
    ) {
      return path;
    }
    if (path.startsWith('/')) return base.replace(/\/$/, '') + path;
    return base + path;
  };
}

/**
 * 上游 `full_url_for()` 的最小等价实现：把站内路径补成绝对 URL。
 *
 * `site.url` 缺省时用 `fallbackOrigin`（调用方通常传 `Astro.url.origin`）。
 */
export function fullUrlFor(
  path: string | null | undefined,
  site: Pick<SiteConfig, 'url' | 'root'>,
  fallbackOrigin: string,
): string {
  if (!path) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  const origin = (site.url ? site.url.replace(/\/+$/, '') : fallbackOrigin.replace(/\/+$/, '')) || '';
  return `${origin}${createUrlFor(site.root ?? '/')(path)}`;
}
