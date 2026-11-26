# P2-1 内容集合与 Markdown 处理器

- 组员：p21-content
- 时间：2026-11-23 19:15–19:27（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（上游基准：`.baseline-work/`，只读）
- 环境：Node **v24.22.0** · pnpm **10.29.3** · astro **7.4.13** · `@astrojs/markdown-remark` **7.3.10** · zod **4.6.7** · Windows 11
- 本次改动（写范围内）：

| 文件 | 变更 | 说明 |
|---|---|---|
| `examples/blog/src/content.config.ts` | 新增 129 行 | glob loader 直读仓库根 `fixtures/` + frontmatter schema |
| `examples/blog/src/pages/debug-collection.astro` | 新增 76 行 | 临时验证页（Phase 2 后续被真实页面替换） |
| `examples/blog/astro.config.mjs` | +8 行 | import `unified` + `markdown.processor`；`cssMinify: false` 注释与 stylus 插件配置**未动** |
| `examples/blog/package.json` | +1 行 | `@astrojs/markdown-remark: ^7.3.10`（`pnpm add` 写入） |
| `pnpm-lock.yaml` | +1233 / −6 行 | 新依赖树的 lock 变更（预期） |
| `docs/notes/phases/P2-1-content-collection.md` | 新增 | 本报告 |

- 未触碰：`packages/`、`scripts/`、`docs/reference/baseline.json`、`fixtures/`（`git status --short fixtures` 为空）

## 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| `@astrojs/markdown-remark` 安装 | ✅ 7.3.10（astro 7.4.13 的 peer 要求 `^7.3.0`） | §1 |
| `content.config.ts` loader | ✅ `glob({ pattern: '**/*.md', base: '../../fixtures' })`，id = 文件名去扩展名 | §2.1 |
| frontmatter schema | ✅ 显式 25 键；fixtures 实际用到的 **19 个字段全覆盖，0 漏网** | §3 |
| 10 篇全部通过校验 | ✅ 构建 0 错误；10 条 id 与题目一致 | §4 |
| 按 slug 取一篇 | ✅ `getEntry('posts', 'longform-hexo-astro')` 命中 | §4 |
| about 页类型识别 | ✅ `layout: page` + `type: about`，与 9 篇文章区分开 | §4 |
| unified 处理器生效 | ✅ 配置对象 `processor.name === 'unified'`；A/B 构建的脚注序列化形态与 Sätteri 不同 | §5 |
| GFM / 脚注渲染 | ✅ `<table>`、`<del>`、`data-footnotes` 脚注区块、公式原文保留 | §4 |
| 构建 | ✅ `pnpm --filter blog build` exit 0 | §6 |
| `pnpm install --frozen-lockfile` | ✅ exit 0（lock 与 package.json 一致） | §7.9 |

---

## 1. 依赖安装

**版本依据**：`node_modules/astro/package.json` 的 `peerDependencies` 是：

```json
{ "@astrojs/markdown-remark": "^7.3.0" }
```

本机 `npm view @astrojs/markdown-remark versions` 因 DSH 沙箱拒绝写 npm 缓存目录而失败（`EPERM ... npm-cache\_cacache\tmp`，不是网络问题），改用 registry HTTP 查 latest：**7.3.10**，与 peer `^7.3.0` 匹配，故安装 7.3.10。

命令与输出（仓库根）：

```powershell
pnpm add "@astrojs/markdown-remark@^7.3.0" --filter blog
```

```text
Progress: resolved 447, reused 99, downloaded 119, added 120, done
Done in 3.7s using pnpm v10.29.3
```

落盘结果：

```json
// examples/blog/package.json
"dependencies": {
  "@astrojs/markdown-remark": "^7.3.10",
  "astro": "^7.4.13"
}
```

`node_modules/@astrojs/markdown-remark` 版本 7.3.10；其导出确认含 `unified`（另有 `createMarkdownProcessor`、`parseFrontmatter` 等）。lock 变化：`astro@7.4.13(stylus@0.64.0)(yaml@2.9.1)` → `astro@7.4.13(@astrojs/markdown-remark@7.3.10)(stylus@0.64.0)(yaml@2.9.1)`，另新增 unified/remark/rehype/@mdx-js 等约 120 个传递依赖。这是 ADR-001 已接受的代价。

## 2. `content.config.ts` 关键代码

### 2.1 loader：monorepo 单一数据源，不复制 fixtures

```ts
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({
    // fixtures 是扁平目录；`**/` 为将来允许子目录留余地（子目录会成为 id 前缀）
    pattern: '**/*.md',
    base: '../../fixtures',
  }),
  schema: /* 见 §2.2 */,
})

export const collections = { posts }
```

- `base` 相对 **Astro 项目根**（`examples/blog`）解析。Astro 源码 `node_modules/astro/dist/content/loaders/glob.js`：

  ```js
  baseDir = globOptions.base ? new URL(globOptions.base, config.root) : config.root;
  ```

  所以 `../../fixtures` → `D:\Git-project\astro-theme-anzhiyu\fixtures\`，**可以指向 `src/` 之外**（见 §7.1）。
- 10 篇全进一个 `posts` 集合；文章与独立页面靠 frontmatter 区分，不按目录拆集合（fixtures 是平铺的，拆目录等于复制数据源）。
- id 由「相对 base 的路径去扩展名」生成（`glob.js` 非 legacy 分支调 `getContentEntryIdAndSlug`，collection 传 `''`），因此 id 就是 `about-page`、`longform-hexo-astro` 这类文件名。对当前语料，**id 即 slug**。

### 2.2 schema 摘要

显式声明 25 个键，末尾 `.passthrough()` 透传未知字段：

```ts
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../../fixtures' }),
  schema: z.object({
    title: z.string(),                                  // 必填

    date: hexoDate.optional(),                          // 见 §2.3
    updated: hexoDate.optional(),

    tags: z.array(z.string()).optional(),
    categories: z.array(categoryPath).optional(),       // 递归：string | string[]（见 §7.3）

    cover: imageOrDisabled.optional(),                  // string | boolean（fixtures 有 cover: false）
    top_img: imageOrDisabled.optional(),
    description: z.string().optional(),

    sticky: z.number().optional(),
    top: z.boolean().optional(),
    swiper_index: z.number().optional(),
    top_group_index: z.number().optional(),
    abbrlink: z.union([z.string(), z.number()]).optional(),

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

    layout: z.string().optional(),                      // about 页：layout: page
    type: z.string().optional(),                        // about 页：type: about
  }).passthrough(),
})
```

其中 `categoryPath` 与 `imageOrDisabled`：

```ts
const categoryPath: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.array(categoryPath)]))
const imageOrDisabled = z.union([z.string(), z.boolean()])
```

### 2.3 日期：Hexo 时区语义还原（`hexoDate`）

```ts
const SITE_UTC_OFFSET_MINUTES = 8 * 60   // 基准站 _config.yml: timezone: 'Asia/Shanghai'

function parseHexoDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // YAML 把无时区字面量落在 UTC 字段上，这里整体平移到 +08 对应的时刻
    return new Date(value.getTime() - SITE_UTC_OFFSET_MINUTES * 60_000)
  }

  const text = value.trim()
  const bare = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text)
  if (bare) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = bare
    const utcMillis =
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return new Date(utcMillis - SITE_UTC_OFFSET_MINUTES * 60_000)
  }

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
```

为什么需要这一段：见 §7.2。效果：`longform-hexo-astro` 的 `2024-11-01 09:30:00` → `data.date = 2024-11-01T01:30:00.000Z`；用 `Asia/Shanghai` 格式化即 `2024-11-01 09:30`，与基准 HTML 的 `postUpdate: '2024-11-01 09:30:00'` 一致。

## 3. fixtures 的 frontmatter 字段实际统计

统计脚本按 Astro 自己的 frontmatter 解析口径（`yaml.parseDocument(..., { customTags: ['timestamp'], merge: true, schema: 'core' })`，与 `@astrojs/internal-helpers/frontmatter.js` → `yaml.js` 一致）解析 10 篇：

| 字段 | 出现次数 | 解析后类型 | 样例 |
|---|---:|---|---|
| `title` | 10 | string | 关于本站 / 短讯 |
| `date` | 10 | date | `2025-05-01T08:00:00.000Z`（YAML 解析结果，见 §7.2） |
| `categories` | 9 | array（可嵌套） | `["生活"]` / `[["前端","Astro"],"工程实践"]` |
| `tags` | 9 | array | `["封面","图片"]` |
| `cover` | 8 | string \| boolean | `false` / `/img/default_cover.jpg` |
| `description` | 8 | string | — |
| `top_img` | 3 | string | `/img/comment_bg.png` |
| `toc` | 2 | boolean | true / false |
| `ai` | 1 | boolean | true |
| `aside` | 1 | boolean | true |
| `copyright` | 1 | boolean | false |
| `layout` | 1 | string | `page`（about 页） |
| `main_color` | 1 | string | `#3e5658` |
| `mathjax` | 1 | boolean | true |
| `sticky` | 1 | number | 10 |
| `swiper_index` | 1 | number | 3 |
| `top` | 1 | boolean | true |
| `top_group_index` | 1 | number | 2 |
| `type` | 1 | string | `about`（about 页） |

**覆盖率**：fixtures 实际用到 19 个字段，schema 显式声明其中 19/19；另外预置了 6 个「docs/02 §4 列出、上游常见但本批 fixture 尚未使用」的键：`updated`、`abbrlink`、`comments`、`copyright_author`、`copyright_url`、`aplayer`（都是 optional，不强制）。**fixtures 侧漏网字段 = 0**。未知字段由 `.passthrough()` 兜底（实测见 §7.6）。

## 4. 集合可用性证明

### 4.1 构建日志里的证据

`pnpm --filter blog build` 输出（中间段）：

```text
19:25:07 [content] Syncing content
19:25:07 [content] Synced content
...
 generating static routes 
19:25:07   ├─ /debug-collection/index.html[debug-collection] 集合 posts 条目数 = 10
[debug-collection] ids = about-page, cover-variants, longform-hexo-astro, multi-taxonomy, short-note, sticky-top, tags-block, tags-inline, tags-media, tags-thirdparty
[debug-collection] 文章 = 9 篇 / 独立页面 = 1 个（about-page）
[debug-collection] about 页识别: layout=page type=about
[debug-collection] getEntry('longform-hexo-astro') = 长文基准：从 Hexo 到 Astro 的完整迁移札记 / date=2024-11-01T01:30:00.000Z
```

### 4.2 `/debug-collection/` 页面的检查报告（从 dist HTML 提取）

```json
{
  "集合 posts 条目数": 10,
  "集合 posts 的 id（排序后）": ["about-page", "cover-variants", "longform-hexo-astro",
    "multi-taxonomy", "short-note", "sticky-top", "tags-block", "tags-inline",
    "tags-media", "tags-thirdparty"],
  "内容来源 filePath 样例": [
    "../../fixtures/about-page.md",
    "../../fixtures/cover-variants.md",
    "../../fixtures/longform-hexo-astro.md"
  ],
  "所有 filePath 都指向 ../../fixtures/（未复制）": true,
  "文章数（layout !== page）": 9,
  "独立页面数（layout === page）": 1,
  "独立页面 id": ["about-page"],
  "about 是否存在": true,
  "about.layout": "page",
  "about.type": "about",
  "getEntry(\"longform-hexo-astro\") 命中": true,
  "取到的 id": "longform-hexo-astro",
  "取到的 title": "长文基准：从 Hexo 到 Astro 的完整迁移札记",
  "取到的 date（Hexo 语义，ISO）": "2024-11-01T01:30:00.000Z",
  "取到的 tags": ["Hexo", "Astro", "迁移", "长文"],
  "渲染 headings 数": 9,
  "渲染 HTML 含 <table>": true,
  "渲染 HTML 含 <del>": true,
  "渲染 HTML 含 GFM 脚注区块（data-footnotes）": true,
  "渲染 HTML 保留行内公式原文 mc^2": true,
  "脚注区块 HTML 片段": "<section data-footnotes=\"\" class=\"footnotes\"><h2 class=\"sr-only\" id=\"footnote-label\">Footnotes</h2>\n<ol>\n<li id=\"user-content-fn-note1\">\n<p>这是一条脚注定义，迁移时 Astro 侧需要产出可跳转的脚注区块。 <a href=\"#user-content-fnref-note1\" data-footnote-backref=\"\" aria-label=\"Back to reference 1\" class=\"data-footnote-backref\">↩</a></p>\n</li>\n</ol>\n</section>"
}
```

- 10 条：`getCollection('posts')` 返回 10 条，id 与 10 个 fixture 文件一一对应。
- 按 slug 取一篇：`getEntry('posts', 'longform-hexo-astro')` 命中，title/tags/date 均可读。
- about 页：`layout === 'page'` 且 `type === 'about'`，是集合里唯一的独立页面；其余 9 篇是文章。Phase 3 的 `page.type` 分发可直接用这两个字段。
- 单数据源：每条 `filePath` 都是 `../../fixtures/<name>.md`，没有复制。
- 渲染能力：`<table>`（GFM 表格）、`<del>`（删除线）、`data-footnotes`（脚注）、公式原文 `mc^2` 全部由 unified 渲染产出。

> `debug-collection.astro` 是临时验证页，Phase 2 的 P2-7/P2-8 落地后应删除或替换。

## 5. unified 处理器生效的证据

### 5.1 配置片段

```js
// examples/blog/astro.config.mjs
import { unified } from '@astrojs/markdown-remark'

export default defineConfig({
  // ADR-001：显式切回 unified 处理器（@astrojs/markdown-remark），不用 Astro 7 默认的 Sätteri。
  // …（4 行注释，见文件）
  markdown: {
    processor: unified(),
  },
  vite: { /* 原有 cssMinify 注释与 stylus 插件配置一字未动 */ },
})
```

`git diff` 只有新增的 8 行，原有 `cssMinify: false` 的 17 行注释与 `stylusHexoConfig` 插件块没有任何改动（见文件 diff）。

### 5.2 运行时读取配置对象

```powershell
node -e "import('./examples/blog/astro.config.mjs').then(m => { const p = m.default.markdown.processor; console.log(p.name, typeof p.createRenderer) })"
```

```text
unified function
```

`processor.name` 就是 Astro `isUnifiedProcessor()` 判定用的标记；`createRenderer` 是内容渲染入口。

### 5.3 A/B 构建对照（真实构建产物，不是单元示例）

Astro 源码 `node_modules/astro/dist/vite-plugin-markdown/content-entry-type.js` 里，Markdown 内容渲染走的就是配置里的 processor：

```js
const processor = await markdown.processor.createRenderer({ ... })
```

为了证明「实际渲染用的确实是 unified 而不是默认 Sätteri」，临时注释掉 `markdown` 配置做了一次 A/B 构建（同一份 fixture、同一条命令；测完已恢复并通过 diff 校验恢复无误）：

| 构建 | 脚注区块序列化 | 脚注引用属性 |
|---|---|---|
| 不配 `markdown.processor`（Astro 7 默认 Sätteri） | `<section data-footnotes class="footnotes">` | `data-footnote-ref`（无值属性） |
| `markdown: { processor: unified() }`（当前配置） | `<section data-footnotes="" class="footnotes">` | `data-footnote-ref=""` |

当前最终产物（`dist/debug-collection/index.html` 正文）是后者：

```html
<p>这里放一个脚注引用<sup><a href="#user-content-fn-note1" id="user-content-fnref-note1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup>…</p>
...
<section data-footnotes="" class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>
```

即：**构建日志 + 配置对象 + 产物序列化形态三重证据都指向 unified 生效**。

## 6. 构建输出末尾 10 行

命令：`pnpm --filter blog build`（`$TEMP\p21-build-final4.log`，exit 0）

```text
[debug-collection] about 页识别: layout=page type=about
[debug-collection] getEntry('longform-hexo-astro') = 长文基准：从 Hexo 到 Astro 的完整迁移札记 / date=2024-11-01T01:30:00.000Z
 (+27ms) 
19:25:09   ├─ /page2/index.html (+10ms) 
19:25:09   ├─ /index.html (+5ms) 
19:25:09 ✓ Completed in 68ms. 

19:25:09 [build] ✓ Completed in 2.07s. 
19:25:09 [build] 3 page(s) built in 2.97s 
19:25:09 [build] Complete! 
```

（3 页 = `/`、`/page2/`、`/debug-collection/`；内容同步与内容渲染在更早的 `[content] Synced content` / `[vite] built` 段落完成，完整日志共 47 行。）

## 7. 遇到的问题与处理

### 7.1 glob base 指向 `src/` 之外是否可行 —— **可行**

- 实现方式：`base: '../../fixtures'`。Astro 把它按 `new URL(base, config.root)` 解析，所以读的是 `examples/blog` 之外、仓库根下的 `fixtures/`。
- 限制：`pattern` **不能**以 `../` 或 `/` 开头（`glob.js` 会直接 `throw`，提示改用 `base`）。所以「模式相对 base、base 指向外面」是唯一正确写法。
- 副作用：id 相对 base 生成，`filePath` 记录为 `../../fixtures/xxx.md`（相对项目根）；后续 diff/校验脚本拿 filePath 时要能接受 `..` 前缀。
- `pnpm --filter blog build` 与 dev 均正常读取；watch 也监听 `fixtures/`（build 里 `[content] Synced content`）。

### 7.2 时区与日期解析（本次最大的语义坑）

事实链：

1. Astro 的 frontmatter 解析（`@astrojs/internal-helpers/frontmatter.js` → `yaml.js`）用 `parseDocument(..., { customTags: ['timestamp'], merge: true, schema: 'core' })`。
2. 实测：`date: 2024-11-01 09:30:00`（无时区）被解析成 **`2024-11-01T09:30:00.000Z`**——YAML 把无时区时间当 UTC，UTC 字段恰好等于字面量。
3. 基准站 `.baseline-work/_config.yml` 有 `timezone: 'Asia/Shanghai'`；基准 HTML 里 `postUpdate: '2024-11-01 09:30:00'`，说明 Hexo/moment 把同一字面量解释为 **+08**。
4. 两者相差 8 小时：若直接下发 Date，Phase 2 页面按站点时区格式化会得到 17:30；更糟的是 `19:45` 这类会跨天（显示成 02-21）。
5. 处理：`content.config.ts` 的 `hexoDate` 统一归一化为「Hexo 语义的真实时刻」：Date 值减 8h、字符串按 `+08` 解释（带偏移的字符串按绝对时刻）。验证：`data.date = 2024-11-01T01:30:00.000Z`，用 `Asia/Shanghai` 格式化 = `09:30`，与基准一致。排序/归档年份月份也随之与 Hexo 对齐。

**已知限制**：显式带时区的字面量（如 `2024-11-01T09:30:00Z`）经 YAML 解析后同样是 Date，已无法与无时区字面量区分，会被一并按 +08 平移。fixtures 全部是无时区写法；真实站点若混用，需要在 loader 层保留原始字面量再转换（Phase 7 迁移脚本可处理）。

**给 Phase 2 的硬要求**：日期格式化必须显式指定 `timeZone: 'Asia/Shanghai'`（或统一的 `formatDate` util）。CI 在 Linux/UTC 上跑，省略时区会得到与本地/基准不同的结果。

### 7.3 `categories` 有嵌套写法

`multi-taxonomy.md` 写的是 `categories: [[前端, Astro], 工程实践]`（Hexo 二级分类），不是 `string[]`。schema 用递归 `z.lazy` 的 `string | string[]` 覆盖；两层的实际值：`[["前端","Astro"],"工程实践"]`。

### 7.4 `cover` / `top_img` 有 `false` 字面量

`cover: false`（`cover-variants.md`、`tags-thirdparty.md`）表示显式关闭封面，schema 用 `z.union([z.string(), z.boolean()])`，不是纯 string。

### 7.5 schema 不是「摆设」——负向测试

用 fixtures 的**临时副本**（不动仓库 `fixtures/`）验证校验真的生效，测完恢复：

| 构造的错误 | 构建结果 |
|---|---|
| `short-note.md` 的 `title: 123`（number） | ❌ `[InvalidContentEntryDataError] posts → short-note data does not match collection schema.` `title: Expected type "string", received "number"` + 文件位置 |
| `short-note.md` 的 `date: 'not-a-date'` | ❌ `date: 无法解析为日期："not-a-date"`（自定义消息） |

### 7.6 多余字段透传（`.passthrough()`）实测

同一临时副本里加了一个 `probe-unknown.md`（`weird_field: 12345`、`another_unknown: { nested: true }`）：

```text
[debug-collection] 集合 posts 条目数 = 11
"未知字段透传（probe-unknown.weird_field）": 12345,
"未知字段透传（probe-unknown.another_unknown）": { "nested": true }
```

构建通过，未知字段原样进入校验后的 `data`。测完已删除临时副本、恢复 `base: '../../fixtures'`，仓库 `fixtures/` 始终零改动。

### 7.7 smartypants 会改写正文（未改配置，留给组长决策）

Astro 默认 `markdown.smartypants: true`，`unified()` 未显式关闭时会启用。对 10 篇 fixture 做「smartypants 开/关」逐篇 diff：

```text
SAME about-page.md / cover-variants.md / longform-hexo-astro.md / multi-taxonomy.md
SAME short-note.md / sticky-top.md / tags-block.md / tags-inline.md / tags-media.md
DIFF tags-thirdparty.md
  smartypants=true : "{% mermaid %}\ngraph TD\nA[Hexo] —> B[fixture]\n..."
  smartypants=false: "{% mermaid %}\ngraph TD\nA[Hexo] --> B[fixture]\n..."
```

`{% mermaid %}` 块里的 `-->` 被改写成了 `—>`。Hexo/marked 默认不做 smartypants，所以有两件事需要拍板：

1. Phase 6 的 remark tag 插件必须在 smartypants 之前消费掉 `{% mermaid %}` 块；或
2. 为对齐上游，改成 `unified({ smartypants: false })`（当前按任务口径保持 `unified()` 字面写法，未擅自改）。

### 7.8 脚注行为与上游基准的已知差异

上游 Hexo/marked 不支持脚注，基准 HTML 里 `[^note1]` 是**普通文本**（`.baseline-work/public/2024/11/01/longform-hexo-astro/index.html` 里就是 `<p>这里放一个脚注引用[^note1]，…</p>`）。unified + remark-gfm 会渲染出真正的脚注区块（`data-footnotes`）。PLAN 附录 A #2 要求 Astro 侧脚注可渲染，这属于有意升级；但 **Phase 2 的 HTML diff 会在 longform 这篇产生一处已知差异**，diff 工具（P2-13）要么加白名单，要么接受「基准按新行为重建」的决策。同理，标题锚点也还没做：基准是 `<h2 id="…"><a class="headerlink">`，Astro 当前只有 `<h2 id="…">`，这是后续渲染层的事。

### 7.9 其它

- `npm view` 在本机被沙箱挡住（写 `%LOCALAPPDATA%\npm-cache` 报 EPERM），`pnpm view` 内部转 npm 同样失败；用 registry HTTP + astro peer 字段确认版本。`pnpm add` 本身正常（store 在 workspace 内的 `D:\Git-project\.pnpm-store`）。
- `pnpm install --frozen-lockfile` exit 0，lock 与 package.json 一致；随后重新 build 仍 exit 0。
- `about-data.yml` 没有纳入内容集合：glob 只匹配 `*.md`，它属于 about 模板的数据（Phase 3），届时用 `file()` data loader 或直接读 YAML 即可，同样不需要复制。
- `title` 设为必填、`date` 设为可选：fixtures 10/10 都有 date，但真实 Hexo 的独立页面可能没有 date，避免误伤；Phase 2 排序时要有 fallback（或届时收紧为必填）。
- 构建耗时参考（单次样本，不作性能结论）：unified 构建 3.99s / 默认 Sätteri 3.38s，差距在秒级，符合 ADR-001 预期。

---

## 8. 判定

**内容集合可用，P2-1 可以判定完成。** `glob` loader 直接读取仓库根 `fixtures/`（`filePath` 全部为 `../../fixtures/*.md`，零复制），10 篇 fixture 全部通过 schema 校验；9 篇文章 + 1 个 `layout: page` + `type: about` 的独立页面可以被 `getCollection` / `getEntry` 正确区分和取用；unified 处理器经配置对象、A/B 构建产物序列化差异与内容渲染链路源码三重确认已生效，GFM 表格/删除线/脚注在真实构建产物里可验证。

**schema 没有 fixture 字段漏网**：19 个实际字段 19/19 显式覆盖，另预置 6 个上游常见 optional 键，未知字段由 `.passthrough()` 兜底（已用临时探针实测透传、并用临时错误数据实测类型拒绝）。真正需要上游拍板的是两条：① 日期时区归一化策略已按基准站的 `Asia/Shanghai` 落地并写清限制，Phase 2 必须用同一时区格式化；② smartypants 默认开与 Hexo 不一致（会让 `{% mermaid %}` 里的 `-->` 变 `—>`），要么在 Phase 6 让 tag 插件先行、要么后续改成 `unified({ smartypants: false })`——本次按任务口径未擅自改。
