/**
 * site.ts — 站点级元数据类型（P2-2 / P2-3）。
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
 *
 * 解析函数（postHrefOf / resolveSite / createUrlFor …）在 `utils/url-utils.ts`，
 * 那里 re-export 本文件的类型，`import { createUrlFor, type SiteConfig }` 一行即可。
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
