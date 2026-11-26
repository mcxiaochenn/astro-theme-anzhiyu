# P7-4 修复一：文章 URL 归一化 / taxonomy 完整路径 / todolist+friends_lite 兼容页 / 伪协议

> 任务：W2-A（task-6）。输入是 `.migration-out/accept-20261124-191107/acceptance-report.json`
> 的首跑结果（67 项 migration-gap），本任务负责其中 5 类共 57 项：
> `old-permalink 44` / `taxonomy-slug 7` / `identity 2` / `page-type 2` / `pseudo-scheme 2`。
>
> 结果：**5 类全部归零（57 → 0）**，总有缺口 67 → **10**（剩下 10 项全部属于 B1/B2/P7-6 的
> page-missing / feed / sitemap / search-index / theme-asset，本任务未越权修改）。
> `examples/blog` 基线回归 **48 PASS / 0 FAIL / 0 差异**。

## 1. 前后分类计数表（acceptance-report.json `summary.gapBreakdown`）

| classification | 修复前 | 修复后 | 归属 |
| --- | ---: | ---: | --- |
| old-permalink | 44 | **0** | ✅ task-6 |
| taxonomy-slug | 7 | **0** | ✅ task-6 |
| page-type | 2 | **0** | ✅ task-6 |
| pseudo-scheme | 2 | **0** | ✅ task-6 |
| identity | 2 | **0** | ✅ task-6 |
| page-missing | 3 | 3 | B1（task-7） |
| sitemap | 3 | 3 | B2（task-8） |
| feed | 2 | 2 | B2（task-8） |
| search-index | 1 | 1 | B2（task-8） |
| theme-asset | 1 | 1 | P7-6（`/anzhiyu/random.js`，task-7） |
| **合计** | **67** | **10** | |

`checks` 状态同步变化：`identity` / `page-types` 由 FAIL → **PASS**（identity 15/15 断言全过、
page-types 17/17 页全过），`links` 的 `missingDistinct` 由 **65 → 12**（`missingReferences`
838 → 383、`distinctInternalTargets` 177 → 125）。

## 2. old-permalink 44 + identity 2 —— 文章 URL 单一真源

### 根因

主题层 `components/post/post-list.ts` 在 `preparePosts()` 里**写死** Hexo 默认 permalink
`/:year/:month/:day/:id/`（P2 阶段的基准站形态）。迁移脚本已经把**文章路由**改成源站
`_config.yml` 的 `permalink`（真实站 `posts/p:abbrlink/`，`migrate-hexo` 生成
`src/data/post-permalink.ts` 的 `postHref()/postRouteParams()`，归档页链接也改用它），
但所有**从内容集合派生卡片**的组件仍用旧形态：

- 首页 `home_top` 的 `.topGroup` 卡片（`TopGroup.astro`，22 条）；
- 文章页 `#pagination` 的 prev/next 与「相关推荐」（`post-page.ts` 的 `posts/prev/next/related`，22 条）；
- 侧栏「最近发布」卡（`site-stats.ts` 的 `getSiteStats()`）；
- 文章页 `page.permalink`（canonical / og:url / 版权卡「原创」链接）→ identity 2 条。

### 改法：主题层只认「解析器」，不认任何 permalink 形态

新增可选 `PostHrefResolver`（`layouts/site.ts`），由**站点配置**注入，主题不写死日期形态：

1. `layouts/site.ts`：`type PostHrefResolver = (entry) => string`、`SiteConfig.postHref?`、
   `postHrefOf(site)`（取不到一律当未配置）。
2. `components/post/post-list.ts`：`PrepareOptions.resolvePostHref?`；`preparePosts()` 里
   `article.path` 由解析器给出（`/posts/pXXXX/` → `posts/pXXXX/`），无解析器时保持原日期形态
   —— fixture 站点行为逐字节不变。
3. `components/post/post-page.ts`：`PreparePostPageOptions.resolvePostHref?` 透传；有解析器时
   **不再**套 `applyAbbrlink()`（解析器已含 abbrlink 语义）；`permalink`/prev/next/related 全部随之正确。
4. `data/site-stats.ts`：`getSiteStats({ resolvePostHref })`，按解析器分 key 缓存（避免「先算了一份
   不带解析器的结果」污染后续页面）。
5. 调用方：`index.astro` / `page/[...page].astro` / 文章路由传 `postHrefOf(site)`；
   `HomeTop.astro`、`AsideContent.astro`、`Header.astro → Console.astro` 从 `site` 取同一个解析器
   （`BaseLayout` 的 `site` 已经流到这几个子组件）。
6. `scripts/migrate-hexo.mjs`：生成的 `src/data/site-identity.ts` 从
   `export { site as SITE_IDENTITY }` 改为

   ```ts
   import { site as siteIdentity } from '../../site.config'
   import { postHref } from './post-permalink.ts'
   export const SITE_IDENTITY = { ...siteIdentity, postHref }
   ```

   `site.config.ts` 保持 `export const site = {…JSON…}` 不变（acceptance 脚本会 JSON.parse 它，
   不能塞函数）。于是所有页面 `import { SITE_IDENTITY }` 后拿到的 `site` 就带着解析器，
   页面/布局里统一 `postHrefOf(site)` 取用 —— **URL 单一真源 = `post-permalink.ts`**。

> canonical/og:url 没有再「从日期重建」：`page.permalink` 现在等于
> `origin + root + postHref(entry).slice(1)`，与 `Astro.url.pathname` 的构建产物真实路径一致；
> acceptance 的 `routes` 检查独立重算 40/40 命中、`identity` 抽样 3 页 15/15 断言全过。
> 侧栏 `.topGroup` 的 `<a href>` 仍用 `post.path`（相对形态）——这是**上游 1.7.1 模板原样行为**
> （golden 也是 `posts/pXXXX/`），保留 `post.path` 才能让基线 fixture 的 48 页 diff 保持 0。

### 验证证据

修复前（首跑报告）：

```
/mailto:...                      pseudo-scheme pages=93
/categories/教程/Arch Linux/     taxonomy-slug pages=3
...
/2025/11/15/1观鬼灭…首映有感/     old-permalink pages=23
/2025/08/22/1b75e3c5/           old-permalink pages=3
identity /posts/p1b75e3c5/index.html: canonical 实际 https://…/2025/08/22/1b75e3c5/
```

修复后（`.migration-out/w2a/migrated/dist`）：

```
=== href/src 中 4 位年份旧 permalink（应为 0）=== 0
=== 侧栏/卡片 pjax.loadUrl 旧形态（应为 0）=== 0
=== 文章页 canonical / og:url ===
<meta property="og:url" content="https://blog.mcxiaochen.top/posts/p1b75e3c5/index.html">
<link rel="canonical" href="https://blog.mcxiaochen.top/posts/p1b75e3c5/">
class="post-copyright__original" … href="https://blog.mcxiaochen.top/posts/p1b75e3c5/"
=== 文章页 prev/next/related ===
href="/posts/p5b9fe4a/"  href="/posts/pc83e94c5/"  href="/posts/pae3/" …
```

与 golden 逐字一致（golden 同一文章页的 canonical / og:url / copyright 链接同形）。

## 3. taxonomy-slug 7 —— Hexo `Category.slug` 语义（逐段 slugize + 完整父级链）

### 根因（三处，互不相同）

1. `collectCategoryBarItems()`（首页 `#catalog-bar`）直接用**原始分类名**拼路径：
   `/categories/教程/Arch Linux/`（golden/目录是 `Arch-Linux`）。
2. `categoryHref()`（文章页 post-meta 分类）同样不 slugize：
   `/categories/教程/Arch%20Linux/`。
3. 独立页面路由 `[...path].astro` 的 categories 总览页（`page.type === 'categories'`）
   用「摊平叶名 + 计数 Map」自建一份数据：`博客` 把 `教程/博客` 与 `项目推荐/博客` 合并成
   一个 `/categories/博客/` 链接（golden 是带父级的两个分类页），且 `Arch Linux` 不 slugize。

### 改法（全部收敛到同一套 `taxonomySlug`/`slugize`）

- `post-list.ts` `collectCategoryBarItems()`：分类 path 逐段 `slugize()`（`Arch Linux` → `Arch-Linux`）。
- `post-page.ts` `categoryHref()`：逐段 `slugize()` 后再 `encodeURI(url_for())`，与 golden 的
  `/categories/%E6%95%99%E7%A8%8B/Arch-Linux/` 完全同形。
- `[...path].astro`：categories/tags 总览直接复用 `archives/_data.ts` 的 `loadArchiveSite()`——
  那里的 `taxonomySlug()` 就是 Hexo `hexo-util.slugize` 的移植，且 `CategoryTerm.path` 已经
  **逐段 slug 化 + 完整父级链**、`term.posts.length` 已按「父分类页包含子分类文章」口径统计。
  这样「列表页链接」与「真实路由」由同一函数生成，不会再出现「链接 404 / 丢父级」。
- `site-stats.ts` 的分类卡 path 同样逐段 slugize（真实站 `aside.card_categories.enable=false`
  未渲染，但规则统一，避免下一站踩坑）。

### 验证证据

修复后真实站产物（注意：`categories` 总览页与首页 `#catalog-bar` 是 CJK 原文（上游 helper
`!{}` 直出），文章页 post-meta 走 `url_for()` 编码——与 golden 的两种形态分别一致）：

```
=== categories overview (/categories/) ===
/categories/教程/            <- 教程
/categories/教程/博客/        <- 博客
/categories/教程/Arch-Linux/  <- Arch Linux   ← 之前是 /categories/Arch Linux/
/categories/日常/福利/        <- 福利
/categories/项目推荐/博客/     <- 博客
=== 首页 categoryBar ===
/categories/教程/Arch-Linux/  /categories/教程/Hexo/  /categories/教程/博客/ …
=== 文章页 post-meta ===
/categories/%E6%95%99%E7%A8%8B/  /categories/%E6%95%99%E7%A8%8B/Arch-Linux/
=== 空格形态 /categories/...%20... 或空格（应为 0）=== 0
```

golden 全站 16 处 dash 形态、0 处空格形态；本产物同样 0 处空格形态，且 7 条 taxonomy 缺口
全部消失（`links.byClassification` 里已无 `taxonomy-slug`）。

> 残留差异（不影响验收、属 INFO）：categories 总览列表的**排序**与 golden 略有不同。
> 上游顺序来自 Hexo `hexo.locals.get('categories')`（Category 模型文档插入序，再被
> `tags_page_list()` 按 `length` 降序做稳定插入排序）；我们按「文章日期降序」建分类，
> 相同 `length` 的末级分类先后可能不同。链接与计数均正确，acceptance 的 taxonomy 分类只看
> 「链接能否解析」，结构 diff 也只是 INFO。

## 4. page-type 2 —— todolist 与 friends_lite（1.6.14 → 1.7.1 上游移除的能力）

### 4.1 `/todolist/`：移植 1.6.14 `layout/includes/page/todolist.pug`

1.7.1 的 `page.pug` 删掉了 `when 'todolist'` 分支与 `todolist.pug` 模板，但真实站仍有该页面。
新增 `packages/astro-theme-anzhiyu/src/components/page/TodolistPage.astro`，按 1.6.14 模板逐块移植：

- `#todolist-box` → 顶部卡（`page.top_background` 内联背景）+ `#todolist-main`；
- `#todolist-left` / `#todolist-right`：按 `site.data.todolist` 的 `seat` 分栏；
- 每条待办 `completed ? 'todolist-li-done' : 'todolist-li'` + `fa-regular fa-circle[-check]`；
- `[...path].astro` 的 `page.type` 分发新增 `todolist` 分支，数据从 `getSiteData('todolist')`
  读迁移产物 `data/todolist.yml`（`site-data.ts` 的 `SiteDataName` 增加 `'todolist'`）。

实测（`.migration-out/w2a/migrated/dist/todolist/index.html`）：

```
todolist-box: True    todolist-main: True
todolist items: 18    todolist titles: 4      (golden items: 18 / titles: 4)
```

### 4.2 `/fcircle/`：保留 1.6.14 `friends_lite` 的 lite 分支

真实站 `_config.anzhiyu.yml` 用 1.6.14 的 `friends_lite: {enable: true}`（lite 朋友圈，
`fclite.js` + `UserConfig`），而 1.7.1 只有 `friends_vue`。按 Lead 拍板取**做法 (i)**：

- `config/schema.ts` 增加可选 legacy 顶层键 `friends_lite: looseObject.optional()`（注释标
  deprecated）——顶层仍是 `.strict()`，其它未知键照旧报错；
- `defaults.ts` **不注入**该键（没有配置时 `theme.friends_lite === undefined`；`.optional()`
  保证上游 133 键配置与所有 fixture 配置都能原样校验通过）；
- `scripts/migrate-hexo.mjs` 增加 `LEGACY_THEME_KEYS = new Set(['friends_lite'])`：
  1.6.14 站点配置里的该键算「命中」，**原样保留**进 `anzhiyu.config.yml`（不再进
  `missingIn171`/`unsupported`），并在 warnings 里说明「1.6.14 遗留、新配置建议迁移到 friends_vue」；
- `FcirclePage.astro`：`friends_vue.enable` 分支保持 1.7.1 原样；新增 `!friends_vue.enable &&
  friends_lite.enable` 分支，逐块移植 1.6.14 `fcircle.pug`：`fclite_css_url` 的 `<link>`、
  内联主题 CSS、`#friend-circle-lite-root`、`#random-post`、内联 `UserConfig`
  （`private_api_url` / `page_turning_number` / `error_img`）、`fclite_js_url` 与
  `theme.asset.random_friends_post_js`。

选 (i) 而不是 (ii)（迁移脚本映射到 siteExtras）的理由：lite 分支需要读取的是一整块配置
（7 个字段 + 开启状态），走 schema 可选键能让**所有** 1.6.14 站点（不只是当前真实站）
迁移后直接工作；映射到 siteExtras 则每个新站点都要迁移脚本再改一次，且丢失「配置来源可查」。

实测（`.migration-out/w2a/migrated/dist/fcircle/index.html`）：

```
fcircle_page: True    friend-circle-lite-root: True    UserConfig: True    fclite.js: True
```

`anzhiyu.config.yml` 已原样保留 `friends_lite`（含 `fclite_css_url` / `fclite_js_url` /
`private_api_url` / `page_turning_number` / `error_img` / `top_background` / `top_tips`），
迁移站构建时主题 loader 校验通过（build PASS）。

### 4.3 配置层自检未被破坏

`friends_lite` 只是「多接受一个 optional 键」，不改变上游行为：

```
# packages/astro-theme-anzhiyu（THEME_UPSTREAM_CONFIG= .baseline-work/themes/anzhiyu/_config.yml）
node scripts/check-schema.mjs
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）     EXIT=0

node scripts/check-loader.mjs
[check-loader] 结果: PASS（通过 42 项，失败 0 项）                EXIT=0
```

即「上游 `_config.yml` 原样校验 0 error」与「未知顶层键仍必须失败」两条硬约束都保持；
`defaults.ts` 未改（顶层键仍 133 个）。

## 5. pseudo-scheme 2 —— 伪协议被拼成站内路径

### 根因

`layouts/site.ts` 的 `createUrlFor()`（`url_for()` 的最小等价实现）只对
`//…`、`http(s)://…`、`data:`、`#` 原样返回；`mailto:` / `javascript:` 落进「相对路径」分支，
被拼成 `/mailto:…`、`/javascript:…`（94 页各 1 处）。上游 hexo-util 的 `url_for` 用
`new URL(path, site)` 判定 hostname：`mailto:`/`javascript:` 的 hostname 为空 → 原样返回。

### 改法

`createUrlFor()` 增加「任意带 scheme 的 URL 原样返回」分支
（`/^[a-z][a-z0-9+.-]*:/i`），覆盖 `mailto:` / `javascript:` / `tel:` / `data:` / `ftp:` 等；
锚点与绝对 URL 分支不变。修复后真实站产物：

```
=== pseudo-scheme 被拼成站内路径（应为 0）=== 0
=== 原样 pseudo-scheme 链接数 === 268     （mailto: / javascript: 按 golden 原样输出）
```

## 6. 回归红线：examples/blog 基线 48 页

fixture 站点不传 `postHref`（`SITE_IDENTITY` 没有该键），走原默认日期 permalink；
taxonomy 改动对 fixture 的分类名（`前端` / `前端/Astro` / `工程实践` / `标签测试` / …）是
slugize 恒等变换；todolist/fcircle 在 fixture 配置下不产出新 DOM。构建 + 全量 diff：

```
$ (抢 .build.lock) cd examples/blog && node ../../node_modules/astro/bin/astro.mjs build
[build] 62 page(s) built in 2.89s
[build] Complete!                                   BUILD_EXIT=0

$ BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
汇总：48 页 / PASS 48 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致                        DIFF_EXIT=0
```

## 7. 真实站验收（最终命令与输出）

```
$ node scripts/accept-migration.mjs --out .migration-out/w2a
[1/5] migrate → OK 0.9s
[2/5] install：pnpm install --ignore-workspace → OK 9.0s
[3/5] build   → PASS exitCode=0 durationMs=11678 htmlFiles=94 rootFiles=7

  PASS  build        exitCode=0，htmlFiles=94，rootFiles=7
  FAIL  routes       routesExpected=40 present=40 goldenMissing=3（= B1 的插件页）
  FAIL  links        missingDistinct=12（无 old-permalink/taxonomy-slug/pseudo-scheme）
  FAIL  assets       gapTotal=2（theme-asset，P7-6）
  PASS  identity     assertions=15 failed=0
  PASS  page-types   17/17（含 todolist / fcircle）
  PASS  tag-residue  0 残留
  FAIL  search       gapTotal=1（B2）
  FAIL  feed         missing=5（B1/B2）
  INFO  structure    totalDiffs=1433

  迁移缺口（migration gap）：10（明细 15 条，去重 5 条）
  源站既有（inherited）：7    已知豁免（whitelisted）：1
  缺口分类：
    - page-missing 3 / sitemap 3 / feed 2 / search-index 1 / theme-asset 1
  退出码：1
  报告：.migration-out/w2a/acceptance-report.json / .md
```

`gapBreakdown` 里已无 `old-permalink` / `taxonomy-slug` / `identity` / `page-type` /
`pseudo-scheme`；剩余 10 项全部是 B1（task-7）/ B2（task-8）/ P7-6 的产物生成类缺口。

## 8. 改动文件清单（本任务）

主题包（`packages/astro-theme-anzhiyu/src/**`）：

- `layouts/site.ts`：`PostHrefResolver` / `SiteConfig.postHref` / `postHrefOf()`；`createUrlFor()` 伪协议透传
- `components/post/post-list.ts`：`PrepareOptions.resolvePostHref`；`preparePosts()` path 走解析器；`collectCategoryBarItems()` 逐段 slugize
- `components/post/post-page.ts`：`PreparePostPageOptions.resolvePostHref`；`categoryHref()` 逐段 slugize
- `data/site-stats.ts`：`getSiteStats({resolvePostHref})` 按解析器缓存；分类 path slugize
- `components/home/HomeTop.astro`、`components/widget/AsideContent.astro`、
  `components/layout/Header.astro`、`components/console/Console.astro`：透传解析器
- `components/page/TodolistPage.astro`（新增）、`components/page/FcirclePage.astro`（lite 分支）、
  `components/page/types.ts`（TodoItem/TodoGroup）
- `config/schema.ts`：`friends_lite: looseObject.optional()`（deprecated 兼容键，`defaults.ts` 未改）

站点侧（`examples/blog/src/**`）：

- `pages/index.astro`、`pages/page/[...page].astro`、`pages/[year]/[month]/[day]/[slug].astro`：传 `postHrefOf(site)`
- `pages/[...path].astro`：categories/tags 总览改用 `loadArchiveSite()` 数据；新增 `todolist` 分发
- `data/site-data.ts`：`SiteDataName` 增加 `'todolist'`

迁移脚本（`scripts/migrate-hexo.mjs`，最小必要）：

- 生成的 `src/data/site-identity.ts` 挂 `postHref`（文章 URL 单一真源注入点）
- `LEGACY_THEME_KEYS = new Set(['friends_lite'])`：1.6.14 兼容键不再被剔除
- `STANDARD_PAGE_TYPES` 增加 `todolist`（不再按 unknown page.type 走 default）
- `KEY_ALIAS_HINTS` 移除 `friends_lite`（已由主题包支持，不再提示人工映射）

> **给 B1/B2 的注意**：本任务对 `scripts/migrate-hexo.mjs` 的改动集中在
> 「site-identity 生成 / LEGACY_THEME_KEYS / STANDARD_PAGE_TYPES / KEY_ALIAS_HINTS」四处，
> 新增插件页/feed 生成时请叠加在这些改动之后，不要回退 `site-identity.ts` 的 `postHref` 注入，
> 否则文章 URL 会退回日期形态。

## 9. 残留问题（明确不在本任务范围）

- `/comments/`、`/bangumis/`、`/go.html`：Hexo 插件生成页 → B1；
- `/anzhiyu/random.js`：主题静态资源接线 → P7-6 / B1；
- `/atom.xml`、`/rss2.xml`、`/sitemap.xml`、`/baidusitemap.xml`、`/baidu_urls.txt` → B2；
- `/search.xml` → B2；
- `structure` 的 diff 数字（INFO，不判罚）：主要来自尚未迁移的第三方脚本/内容块，非本任务目标。
