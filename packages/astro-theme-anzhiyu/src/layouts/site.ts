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
 * - 绝对 URL / 协议相对 URL / `data:` / 锚点原样返回；
 * - `/xxx` 与 `xxx` 都拼到 `root` 之后；
 * - 空值返回 `root` 本身。
 */
export function createUrlFor(root: string = '/'): (path?: string | null) => string {
  const base = root.endsWith('/') ? root : `${root}/`;
  return (path?: string | null): string => {
    if (!path) return base;
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('#')) {
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
