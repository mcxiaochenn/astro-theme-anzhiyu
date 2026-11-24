/**
 * site.ts — 站点级元数据（P2-2 / P2-3）。
 *
 * 上游把「站点配置」(`_config.yml`) 与「主题配置」(`_config.anzhiyu.yml`) 分成两份：
 *   - 站点配置：title / subtitle / description / keywords / author / language / url / root
 *     —— 由 Hexo 提供，主题里的 `config.xxx` 读的就是它；
 *   - 主题配置：`theme.xxx`，由 `loadThemeConfig()` 读取并校验。
 *
 * 本仓库当前还没有站点配置层（Phase 7 的迁移脚本才会把 Hexo 的 `_config.yml`
 * 落成 Astro 侧的站点配置），所以站点元数据先以 props 形式由页面传入，
 * 缺省值给一份最小可用的中性站点。
 *
 * 注意：`ThemeConfig` 是主题配置，不含站点配置；两者不要混在同一个文件里。
 */

/**
 * 文章 permalink 解析器：把一条内容集合条目映射成站内文章路径。
 *
 * 主题层不写死任何 permalink 形态（上游 Hexo 的 `permalink` 是站点配置，不是主题配置）。
 * 默认行为（不传解析器）沿用基准站的 `/:year/:month/:day/:id/`（见 post-list.ts）；
 * 迁移站由 `scripts/migrate-hexo.mjs` 生成的 `src/data/post-permalink.ts` 提供实现，
 * 再经迁移站 `src/data/site-identity.ts` 挂到 `site.postHref` 注入到这里（见 P7-4）。
 */
export type PostHrefResolver = (entry: { id: string; data: Record<string, unknown> }) => string;

/** 站点级元数据（对应上游 `config.*`）。 */
export interface SiteConfig {
  /** `config.title`。 */
  title: string;
  /** `config.subtitle`；首页标题会拼成 `title - subtitle`。 */
  subtitle?: string;
  /** `config.description`。 */
  description?: string;
  /** `config.keywords`，上游允许字符串或字符串数组。 */
  keywords?: string | string[];
  /** `config.author`。 */
  author?: string;
  /** `config.email`；存在时 `pageAuthor` 拼成 `author,email`。 */
  email?: string;
  /** `config.copyright`；缺省回退 `config.author`。 */
  copyright?: string;
  /** `config.language`，同时写进 `<html lang>` 与 `og:locale`。 */
  language?: string;
  /** `config.url`，不带结尾斜杠；缺省时页面 URL 取 Astro 自己的 origin。 */
  url?: string;
  /** `config.root`，默认 `/`；`url_for()` 用它拼站内前缀。 */
  root?: string;
  /** `config.favicon`；主题配置的 `theme.favicon` 优先。 */
  favicon?: string;
  /**
   * 文章 permalink 解析器（站点配置注入，可选）。
   *
   * 主题自身不生成它：fixture 站点不传 → 走 post-list.ts 的默认日期形态；
   * 迁移站由 `site.config.ts` 从源站 `_config.yml.permalink` 编译后注入。
   */
  postHref?: PostHrefResolver;
}

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
 * 不属于主题默认值。示例站要复刻基准的 head，由 `examples/blog` 的页面显式传入。
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
