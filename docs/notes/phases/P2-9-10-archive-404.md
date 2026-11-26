# P2-9 / P2-10 — 归档 · 分类 · 标签 · 404

> 范围：`archives/`、`categories/`、`tags/` 三组列表路由 + `404.astro`。
> 上游对照：`layout/archive.pug`、`layout/category.pug`、`layout/tag.pug`、`layout/includes/404.pug`、
> `includes/mixins/article-sort.pug`、`includes/pagination.pug`。
> 基线：`.baseline-work/public`（= `.baseline-html/`，48 页）。
> 结论先行：**36 页全部生成且 URL 与基线 1:1；36 页的内容区与基线结构差异为 0**。
> `--all` 的 PASS 仍是 0 —— 整页 PASS 被 head 脚本 / aside 卡片 / additional-js 等其它 phase 阻断，
> 详见 §5。

---

## 1. 产出文件

| 文件 | 职责 |
| --- | --- |
| `examples/blog/src/pages/archives/[...page].astro` | 归档首页 + 分页：`/archives/`、`/archives/page/N/` |
| `examples/blog/src/pages/archives/[year]/[...page].astro` | 年归档 + 分页：`/archives/2025/`、`/archives/2025/page/N/` |
| `examples/blog/src/pages/archives/[year]/[month]/[...page].astro` | 月归档 + 分页：`/archives/2025/04/`、`/archives/2025/04/page/N/` |
| `examples/blog/src/pages/categories/[...category].astro` | 分类页 + 分页（支持层级分类）：`/categories/前端/`、`/categories/前端/Astro/` |
| `examples/blog/src/pages/tags/[tag]/[...page].astro` | 标签页 + 分页：`/tags/Astro/` |
| `examples/blog/src/pages/404.astro` | 404：`/404.html` |
| `examples/blog/src/pages/archives/_data.ts` | 站点数据适配层：内容集合 → path/date/cover/taxonomy；helper 注入点；分页切片 |
| `packages/astro-theme-anzhiyu/src/components/archive/ArticleSort.astro` | `article-sort.pug` 的移植（三类页面共用） |
| `packages/astro-theme-anzhiyu/src/components/archive/Pagination.astro` | `pagination.pug` 非文章页分支（`hexo-paginator` 语义） |
| `packages/astro-theme-anzhiyu/src/components/archive/LazyImage.astro` | lazyload 插件产物形态（`article-sort` / 404 最近文章共用） |
| `packages/astro-theme-anzhiyu/src/components/archive/types.ts` | `ArticleSort` 的渲染数据类型（组件/站点层共用，避免从 `.astro` 导类型） |

为什么 `_data.ts` 放在 `pages/archives/`：本次写范围只覆盖 archives / categories / tags 三个页面目录，
而三个目录都要用同一份数据；文件名以 `_` 开头会被 Astro 路由忽略（`create-manifest.js` 里
`if (name[0] === "_") continue`），只当普通模块用。

---

## 2. 路由参数与 `getStaticPaths`

### 2.1 归档三组（rest 参数 `[...page]`）

`pagination_dir: page`：第 1 页是列表根路径，第 n 页是 `<root>/page/<n>/`。
**Astro 7 的 rest 参数值必须是字符串**（`validateGetStaticPathsParameter` 只接受
`string | undefined`，传数组会报 `GetStaticPathsInvalidRouteParam`），所以 `page` 传 `'page/2'`
而不是 `['page','2']`。

```ts
// archives/[...page].astro
export const getStaticPaths: GetStaticPaths = async () => {
  const data = await loadArchiveSite()
  const total = pageCount(data.posts.length, ARCHIVE_PER_PAGE)
  return Array.from({ length: total }, (_, index) => {
    const current = index + 1
    return {
      params: { page: current === 1 ? undefined : `page/${current}` },
      props: { current, total },
    }
  })
}
```

```ts
// archives/[year]/[...page].astro
export const getStaticPaths: GetStaticPaths = async () => {
  const data = await loadArchiveSite()
  const years = [...new Set(data.posts.map((post) => post.year))].sort((a, b) => b - a)
  return years.flatMap((year) => {
    const yearLabel = String(year)
    const posts = filterArchivePosts(data, { year: yearLabel })
    const total = pageCount(posts.length, ARCHIVE_PER_PAGE)
    return Array.from({ length: total }, (_, index) => {
      const current = index + 1
      return {
        params: {
          year: yearLabel,
          page: current === 1 ? undefined : `page/${current}`,
        },
        props: { year: yearLabel, current, total },
      }
    })
  })
}
```

月归档同理，多一个 `month: String(post.month).padStart(2, '0')`。
`/archives/page/2/` 与 `/archives/2025/` 由不同路由文件生成、路径不重叠，构建无 route collision。

### 2.2 分类：`[...category]` 而不是 `[category]`

Hexo 分类是**层级**的，基准站就有 `/categories/前端/Astro/`、`/categories/前端/Hexo/`。
单段 `[category]` 捕获不了斜杠，所以用一个 rest 参数同时承载「分类层级 + 可选分页段」：

```ts
for (const term of data.categories) {
  const total = pageCount(term.posts.length, CATEGORY_PER_PAGE)
  for (let current = 1; current <= total; current++) {
    paths.push({
      params: {
        // rest 参数是单个字符串：`前端` / `前端/Astro` / `前端/page/2`
        category: current === 1 ? term.id : `${term.id}/page/${current}`,
      },
      props: { categoryId: term.id, current, total },
    })
  }
}
```

页面用 `props.categoryId` 反查 term（而不是再从 URL 里拆），所以 `page/N` 与分类名不会混淆。

### 2.3 标签

标签是平铺的（Hexo tag 无层级），单段 `[tag]` + rest `[...page]` 足够：

```ts
for (const term of data.tags) {
  const total = pageCount(term.posts.length, TAG_PER_PAGE)
  for (let current = 1; current <= total; current++) {
    paths.push({
      params: { tag: term.name, page: current === 1 ? undefined : `page/${current}` },
      props: { tagName: term.name, current, total },
    })
  }
}
```

### 2.4 404

`404.astro` 不需要 `getStaticPaths`，Astro 约定静态产物落在 `dist/404.html`（与基线路径一致）。

---

## 3. 数据来源与 helper

**数据源**：`examples/blog/src/content.config.ts` 的 `posts` 集合（fixtures 10 条，排除
`layout: page` 的 about 页 → 9 篇文章），排序 `date` 降序（= Hexo 三个 generator 的
`sort('date', -1)`）。所有页面共用 `loadArchiveSite()`（模块级缓存，`getStaticPaths` 与
frontmatter 各调一次也只读一遍集合）。

| 上游 | 移植位置 |
| --- | --- |
| `findArchivesTitle`（page.js） | `helpers.ts` → `archivesTitle()`；注入的 `date` 负责把 helper 拼出的 `2025-4` 解释成该月 1 日（moment 行为） |
| `getArchiveLength`（findArchiveLength.js） | `helpers.ts` → `archivesPostCount()`，`archive_generator` 配置按基准站传入 |
| `catalog_list`（catalog_list.js） | `helpers.ts` → `catalogListHtml()`，入参按 name 升序（= 基线产物里的顺序） |
| `tags_page_list`（tags_page_list.js） | `helpers.ts` → `tagsPageListHtml()`，入参先按 name 升序，helper 再按文章数降序插入 |
| `date()` / `full_date()` / `date_xml()` | `utils/date.ts` 的 `createSiteDateFormatter()`（站点时区 Asia/Shanghai、`YYYY-MM-DD`、`HH:mm:ss`） |
| `_p()` / `_p('page.articles')` 等 | `src/i18n` 的 `t()` 绑定 `language: zh-CN` |
| `url_for()` | `_data.ts` 里的最小实现：站内前缀 + `encodeURI`（非 ASCII 段编码，与基线一致） |
| `article-sort` mixin | `components/archive/ArticleSort.astro` |
| `paginator`（hexo-paginator） | `components/archive/Pagination.astro`（`mid_size: 1`、prev/next 文案与图标顺序照抄） |

`per_page` 全部取基准站 `_config.yml`：`per_page = archive_generator.per_page =
category_generator.per_page = tag_generator.per_page = 6`。

---

## 4. 基线与当前构建的结构对照

命令：`node scripts/diff-html.mjs --all`（结构 diff，见 P2-13）。

### 4.1 样例页 diffCount（当前工作树，含并行落地的 P2-4/P2-5/P2-7）

| 页面 | diffCount | 其中内容区 | 其中「非 aside 的内容区」 |
| --- | --- | --- | --- |
| `/archives/`（归档首页） | 46 | 3 | **0** |
| `/archives/2025/04/`（月归档） | 46 | 3 | **0** |
| `/archives/2025/page/2/`（年归档第 2 页） | 46 | 3 | **0** |
| `/categories/前端/`（分类） | 46 | 3 | **0** |
| `/categories/前端/Astro/`（二级分类） | 46 | 3 | **0** |
| `/tags/Astro/`（标签） | 46 | 3 | **0** |
| `/tags/tag插件/`（标签） | 46 | 3 | **0** |
| `/404.html` | 41 | **0** | **0** |

- 「内容区」= `#archive` / `#category` / `#tag` / `.error-box` 子树；**非 aside 的内容区差异全部为 0**。
- 3 条内容区差异是 `#aside-content` 里的三张 widget 卡片（`card-info`、`card-wechat`、
  `sticky_layout`），归属 **P3-1**，不是页面列表本身。
- 404 的 `.error-box`（错误图/标题/副标题/回到主页/最近文章列表）与基线 **0 差异**。

### 4.2 剩余 46 条差异的归属（每个列表页相同）

| 差异 | 条数 | 归属 |
| --- | --- | --- |
| `<head>`：`/css/index.css`、snackbar css、fancybox css、`GLOBAL_CONFIG`、`config-diff`、`noscript`、`inject_head_js`、`generator` meta | 12 | P2-3/P4-1（主题 bootstrap 与资源层） |
| `<body>` 的 pace progress_bar `<link>` / `<script>` | 2 | P4-1 |
| `#nav-right > #console` | 1 | P4-6 |
| `#aside-content` 三张 widget 卡片 | 3 | P3-1 |
| `#footer-bar` / `#sidebar` 的少量属性 | 6 | P2-4 / P2-5 的剩余打磨 |
| `body > div`（additional-js 挂载点）的 22 个脚本/canvas/link | 22 | P4-2 |

### 4.3 `--all` 汇总的前后对比

改动前（本任务开始时，工作树 = 提交 `0e4b824`）：

```text
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 150 条（结构 91 / 文件 47 / 属性 12），缺口 缺 857 / 多 60 节点
```

改动后（当前工作树；并行 batch 已落地 P2-4/P2-5/P2-7 的部分页面）：

```text
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 1762 条（结构 1406 / 属性 342 / 文件 10 / 文本 4），缺口 缺 14598 / 多 190 节点
```

- **PASS：0 → 0**。原因不是本任务的页面，而是「整页所有节点都必须一致」的判定方式：
  上面 46 条差异每条页都有，属于 head 脚本层 / aside 卡片 / additional-js，任何页面在它们落地前
  都不可能 PASS。本任务能保证的是：**内容区 0 差异**（见 4.1）。
- **file-missing：47 → 10**。本次救回 36 页（另有并行 batch 的 `/page/2/`）；
  剩余 10 页 = 9 篇文章（P2-8）+ `/about/`（Phase 3 页类型分发）。
- 差异总数变大的原因：基线原来有 47 页「文件不存在」只计 1 条，现在真正参与结构比对后，
  每页的 head/脚本缺口被展开成几十条；这是度量从「缺文件」变成「逐节点」后的必然结果。

### 4.4 URL 与基线路径逐一对账

脚本按 `docs/reference/baseline.json` 里 `archives/categories/tags/404` 的 36 条路径找产物：

```text
baseline pages (archives/categories/tags/404): 36, 产物命中: 36
dist 里超出基线的页面: 0 []
```

抽样对照：

| 基线路径 | 产物 | 路由 |
| --- | --- | --- |
| `/archives/` | `dist/archives/index.html` | `archives/[...page].astro`（page=undefined） |
| `/archives/page/2/` | `dist/archives/page/2/index.html` | `archives/[...page].astro`（page=`page/2`） |
| `/archives/2025/page/2/` | `dist/archives/2025/page/2/index.html` | `archives/[year]/[...page].astro` |
| `/archives/2025/04/` | `dist/archives/2025/04/index.html` | `archives/[year]/[month]/[...page].astro` |
| `/categories/前端/Astro/` | `dist/categories/前端/Astro/index.html` | `categories/[...category].astro`（category=`前端/Astro`） |
| `/tags/tag插件/` | `dist/tags/tag插件/index.html` | `tags/[tag]/[...page].astro` |
| `/404.html` | `dist/404.html` | `pages/404.astro` |

36 页构成：11 归档（1 首页 + 2 年 + 6 月 + 2 分页页） + 7 分类 + 17 标签 + 1 404。

---

## 5. 移植中的易错点与决策记录

### 5.1 Hexo 的 `categories` 有两种完全不同的语义（最容易移错）

`.baseline-work/node_modules/hexo/dist/models/post.js` 的 `setCategories()`：

- **只要有任一元素是数组**（`hasHierarchy === true`）：每个元素各自是一条分类；
- **全是字符串**（`hasHierarchy === false`）：**整个数组是一条层级路径**（`addHierarchy(cats)`）。

所以 fixtures 里：

```yaml
# longform-hexo-astro.md —— 两项都是字符串 → 一条路径 前端 > Hexo
categories:
  - 前端
  - Hexo
```

```yaml
# multi-taxonomy.md —— 有嵌套数组 → 两条独立路径：前端 > Astro、工程实践
categories:
  - - 前端
    - Astro
  - 工程实践
```

这也是基线 `/categories/前端/Hexo/` 存在、而 `/categories/Hexo/` 不存在的原因。
第一版实现把「全是字符串」当成了平级分类，构建出了 `/categories/Hexo/`，靠对基线目录才发现。

### 5.2 `article.tags.data` 按名字升序

`cover-variants.md` 的 frontmatter 是 `tags: [封面, 图片]`，但基线归档页输出的是 `图片` → `封面`。
Hexo 的 `post.tags` 是 Query，`article.tags.data` 按 name 升序；`article-sort` 又直接按这个顺序渲染。
所以在 `_data.ts` 里先把标签按名字（code point）排序，再由 `ArticleSort` 渲染。

### 5.3 分类页路由不能用单段 `[category]`

见 §2.2。这是与任务描述里 `categories/[category]/[...page].astro` 的唯一命名偏差：
`[category]` 无法表达 `/categories/前端/Astro/`，改成 rest 参数是必须的。

### 5.4 Astro 7 rest 参数只能是字符串

见 §2.1。传数组会直接构建失败；`'page/2'` / `'前端/Astro'` 这种带斜杠的字符串才是合法值。

### 5.5 `og:url` 要带 `index.html`、`canonical` 要去掉

Hexo generator 的 `page.path` 以 `index.html` 结尾，所以基线 `og:url` 是
`<SITE>/archives/2025/04/index.html`，而 `canonical` 经 `urlNoIndex()` 变成
`<SITE>/archives/2025/04/`。`Head.astro` 已有 `pageUrl` prop，页面按
`hexoPageUrl(BASELINE_SITE, Astro.url.pathname)` 传入即可（`Astro.url.pathname` 已是
percent-encoding 形态，与基线一致，不能二次 `encodeURI`）。这一项让每个页面少 1 条属性差异。

### 5.6 图片：直接产出 lazyload 的最终形态

上游模板写普通 `<img src=cover>`，但 `hexo-lazyload` 会改写成
`src=占位 gif + data-lazy-src=cover + onerror='this.onerror=null,this.src="/img/404.jpg"'`。
Phase 2 的验收对象是上游最终 HTML，所以 `LazyImage.astro` 直接产出该形态
（占位图与兜底图取自 `theme.error_img.post_page`）；P4 的懒加载只需要接管 `data-lazy-src`。

### 5.7 404 的布局分支

上游 `layout.pug` 对 `page.type === '404'` 走独立分支：渲染
`#body-wrap.error > header + .error-box`，**不渲染** `main#blog-container` 和 footer。
`BaseLayout` 的 `is404` 分支只渲染 `<slot name="404" />`，所以 `404.astro` 自己在 slot 里写
`#body-wrap.error`，并**直接复用** P2-4 的 `components/layout/Header.astro`
（`topImg={false}` 对应 404 generator 注入的 `top_img: false`）。
最近文章列表口径：`card_recent_post.limit === 0 ? 全部 : related_post.limit || 6`（基准配置 → 6 条），
排序 `date` 降序，`no-cover` 条件 = `cover === false || !cover.aside_enable`。

### 5.8 月份标题的 `YYYY-M`

`findArchivesTitle` 按上游把 `page.year`/`page.month` 拼成 `2025-4`，moment 能解析；
`date.ts` 的 `parseHexoDate` 要求 `YYYY-MM-DD`。在注入的 `formatDate` 里把 `YYYY-M` 解释成
「该月 1 日」再格式化，得到 `四月 2025`（与基线 `<title>`/`og:title` 一致）。

---

## 6. 验证命令与输出

```bash
pnpm --filter blog build
node scripts/diff-html.mjs --all
```

构建末尾 5 行：

```text
20:05:58 ✓ Completed in 435ms.

20:05:58 [build] ✓ Completed in 2.83s.
20:05:58 [build] 40 page(s) built in 3.89s
20:05:58 [build] Complete!
```

（40 页 = 本次 36 页 + 首页/`page/2/`/`debug-collection`/`page2`；文章页由 P2-8 并行落地后才会到 48。）

---

## 7. 已知缺口（不属于本任务，但阻断整页 PASS）

| 差异 | 归属 | 说明 |
| --- | --- | --- |
| `<head>` 的 `GLOBAL_CONFIG` / `config-diff` / `inject_head_js` / CSS `<link>` / generator meta | P2-3、P4-1 | Head.astro 目前是 P2-3 的最小实现，脚本与资源链接留给 P4-1 |
| `<body>` 的 pace `<link>/<script>` | P4-1 | `preloader.source: 3` 的第二段 |
| `#nav-right > #console` | P4-6 | 中控台面板 |
| `#aside-content` 三张 widget 卡片 | P3-1 | 侧栏 widget |
| `#footer-bar` / `#sidebar` 少量属性 | P2-4 / P2-5 | 并行 batch 落地中 |
| `body > div`（additional-js 挂载点）的 22 个脚本 | P4-2 | 交互脚本层 |

## 8. 后续建议

1. **Phase 7 站点配置层**落地后，把 `_data.ts` 的站点常量（title/url/timezone/per_page…）与
   `SITE_PER_PAGE` 等拆到站点配置；`BASELINE_SITE` 现在与 `index.astro` 里那份是重复的。
2. `index.astro`（P2-7）里的 permalink/日期计算与 `_data.ts` 是两份实现，P2-8 落地文章页时
   建议抽成共用的「文章 path/date 查询层」，三处（首页、列表页、文章页）共用一套规则。
3. `Pagination.astro` 的 `mid_size` 窗口与 `space` 省略号分支没有基线可对照（基准数据最多 2 页），
   注释里已标；真实站点有 3+ 页时需要用更长的 fixture 补一个基线。
4. `BaseLayout` 的 404 分支目前只给 slot；`404.astro` 直接 import `Header.astro` 已等价。
   如果后续 BaseLayout 想统一 404 的 header，可考虑在 404 分支内渲染 `<Header>` 再提供内容 slot，
   但两者不要同时存在，避免两份 header。
