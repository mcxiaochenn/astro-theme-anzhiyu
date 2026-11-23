/**
 * P2-1 · 内容集合（单一数据源：仓库根 `fixtures/`，不复制）
 *
 * 约定：
 * - 10 篇 fixture 全部进一个 `posts` 集合，用 glob loader 直接读 `../../fixtures`。
 *   `base` 相对 Astro 项目根（examples/blog）解析，因此指向仓库根，而不是 `src/content`。
 * - 文章与独立页面共用一个集合，靠 frontmatter 的 `layout` / `type` 区分：
 *   about 页是 `layout: page` + `type: about`，Phase 3 的 page.type 分发读这两个字段。
 * - schema 只收紧已知字段；其余字段由 `.passthrough()` 原样透传，
 *   避免用户文章里的自定义 frontmatter 被 Zod 静默剥掉或报错。
 * - `date` / `updated` 的时区语义见下方 `hexoDate` 注释。
 */
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

/**
 * 基准站 `.baseline-work/_config.yml` 的 `timezone: 'Asia/Shanghai'`（无夏令时，固定 +08）。
 * Hexo 用 moment 按这个时区解释不带时区的 frontmatter 日期。
 */
const SITE_UTC_OFFSET_MINUTES = 8 * 60

/**
 * 把 frontmatter 日期归一化成「Hexo 语义的真实时刻」。
 *
 * fixtures 里写的是 `date: 2024-11-01 09:30:00`（不带时区）：
 * - Astro 的 frontmatter 解析器（yaml，customTags: ['timestamp']）按 YAML 规范
 *   把它当成 UTC → Date('2024-11-01T09:30:00Z')，即 UTC 字段恰好等于字面量；
 * - Hexo/moment 按站点时区 Asia/Shanghai 解释 → 实际是 +08 的 09:30。
 * 两者相差 8 小时。若不还原，后续页面把 09:30 渲染成 17:30（19:45 这种还会跨天）。
 * 所以这里减掉 +08 偏移，让 `data.date` 与 Hexo 解析出的是同一时刻。
 *
 * 已知限制：显式带时区的字面量（如 `2024-11-01T09:30:00Z`）经 YAML 解析后得到的
 * 同样是 Date，已无法与「无时区字面量」区分，会被一并按 +08 处理。fixtures 全部是
 * 无时区写法；若真实站点混用显式时区，需要自定义 loader 保留原字面量再转换。
 */
function parseHexoDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // YAML 把无时区字面量落在 UTC 字段上，这里整体平移到 +08 对应的时刻
    return new Date(value.getTime() - SITE_UTC_OFFSET_MINUTES * 60_000)
  }

  const text = value.trim()

  // 不带时区的 `YYYY-MM-DD[ HH:mm[:ss]]`：按站点时区 +08 解释（Hexo/moment 语义）
  const bare = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text)
  if (bare) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = bare
    const utcMillis =
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return new Date(utcMillis - SITE_UTC_OFFSET_MINUTES * 60_000)
  }

  // 带时区（Z / +08:00）或其它可被 Date 解析的写法：按绝对时刻走
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const hexoDate = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const parsed = parseHexoDate(value)
  if (parsed === null) {
    ctx.addIssue({ code: 'custom', message: `无法解析为日期：${JSON.stringify(value)}` })
    return z.NEVER
  }
  return parsed
})

/**
 * Hexo 的 categories 允许嵌套：`categories: [[前端, Astro], 工程实践]`
 * （见 fixtures/multi-taxonomy.md），这里按递归的 string | string[] 校验。
 */
const categoryPath: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.array(categoryPath)]))

/** `cover` / `top_img` 允许 `false` 显式关闭（见 fixtures/cover-variants.md）。 */
const imageOrDisabled = z.union([z.string(), z.boolean()])

const posts = defineCollection({
  loader: glob({
    // fixtures 是扁平目录；`**/` 为将来允许子目录留余地（子目录会成为 id 前缀）
    pattern: '**/*.md',
    base: '../../fixtures',
  }),
  schema: z
    .object({
      // —— 必填 ——
      title: z.string(),

      // —— 时间（Hexo 语义，见 hexoDate）——
      date: hexoDate.optional(),
      updated: hexoDate.optional(),

      // —— 分类 / 标签 ——
      tags: z.array(z.string()).optional(),
      categories: z.array(categoryPath).optional(),

      // —— 图片 / 摘要 ——
      cover: imageOrDisabled.optional(),
      top_img: imageOrDisabled.optional(),
      description: z.string().optional(),

      // —— 首页排序 / 置顶 ——
      sticky: z.number().optional(),
      top: z.boolean().optional(),
      swiper_index: z.number().optional(),
      top_group_index: z.number().optional(),
      abbrlink: z.union([z.string(), z.number()]).optional(),

      // —— 单篇覆盖项 ——
      main_color: z.string().optional(),
      mathjax: z.boolean().optional(),
      comments: z.boolean().optional(),
      aside: z.boolean().optional(),
      toc: z.boolean().optional(),
      copyright: z.union([z.boolean(), z.string()]).optional(),
      copyright_author: z.string().optional(),
      copyright_url: z.string().optional(),
      aplayer: z.boolean().optional(),
      ai: z.boolean().optional(),

      // —— 页面类型（about 页：layout: page + type: about）——
      layout: z.string().optional(),
      type: z.string().optional(),
    })
    // 未列出的 frontmatter 字段原样透传，不报错、不丢失
    .passthrough(),
})

export const collections = { posts }
