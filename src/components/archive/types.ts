/**
 * 归档 / 分类 / 标签列表的渲染数据类型（P2-9）。
 *
 * 放在独立文件而不是 `.astro` 的 frontmatter 里：`.astro` 组件的导出类型不属于
 * Astro 的公开组件契约（语言服务也不保证能解析），而这些结构同时被
 * `ArticleSort.astro`（主题包）和站点侧 `_data.ts`（数据适配层）引用，抽出来最稳。
 */

/** `ArticleSort` 的单条列表项。 */
export interface ArticleSortPost {
  title: string
  /** 文章路径（已 `url_for`）。 */
  href: string
  /** `false` = 上游 cover 被 random_cover 过滤器落成了 `false`（无封面）。 */
  cover: string | false
  /** `date_xml()`，即 `<time datetime>` 的 UTC ISO。 */
  isoDate: string
  /** `date(post.date, config.date_format)`。 */
  dateDisplay: string
  /** `_p('post.created') + ' ' + full_date(post.date)`。 */
  dateTitle: string
  /** `date(post.date, 'YYYY')`，年份分隔用。 */
  yearLabel: string
  /** 文章标签（`href` 已按 `url_for` 编码）。 */
  tags: Array<{ name: string; href: string }>
}
