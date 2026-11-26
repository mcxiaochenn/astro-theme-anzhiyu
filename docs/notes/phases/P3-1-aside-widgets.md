# P3-1 · aside 15 个 widget 卡片

> 范围：`src/components/widget/**`、`src/data/**`，
> 以及 BaseLayout 中**唯一一行** `<AsideContent … site={site} />` 参数透传。
> 未改动 HomeTop / post 组件 / `docs/plan/PLAN.md`，未 commit / push。

## 1. 结论

- `pnpm --filter blog build` 成功（62 页）。
- 首页 aside 结构缺口从 **166 节点**（作者卡 6 + 微信卡 5 + sticky_layout 155）降到 **0**；
  首页全站 `missingNodes` 由任务开始时的 389（任务书基线 480）降到 **4**。
- 归档页 `/archives/`、文章页 aside 的结构/属性/文本差异均为 **0**。
- 收尾：BaseLayout 把已解析的 `site` 透传给 AsideContent，`CardAuthor` 的
  `theme.aside.card_author.description || config.description` 回退链恢复，
  `author-info__description` 文本与基线逐字一致。

## 2. 改动清单

### 新增

| 文件 | 对应上游 |
| --- | --- |
| `src/data/site-stats.ts` | `site.posts` / `site.tags` / `site.categories` / `totalcount(site)` 的 Astro 投影（模块级 Promise 缓存） |
| `src/data/widget-data.ts` | `site.data.widget.top/bottom` 的形状 |
| `src/components/widget/CardAuthor.astro` | `widget/card_author.pug` |
| `src/components/widget/CardAnnouncement.astro` | `widget/card_announcement.pug` |
| `src/components/widget/CardWeixin.astro` | `widget/card_weixin.pug` |
| `src/components/widget/CardCategories.astro` | `widget/card_categories.pug` |
| `src/components/widget/CardTags.astro` | `widget/card_tags.pug` |
| `src/components/widget/CardArchives.astro` | `widget/card_archives.pug` |
| `src/components/widget/CardWebinfo.astro` | `widget/card_webinfo.pug` |
| `src/components/widget/CardRecentPost.astro` | `widget/card_recent_post.pug` |
| `src/components/widget/CardPostToc.astro` | `widget/card_post_toc.pug` |
| `src/components/widget/CardAd.astro` | `widget/card_ad.pug` |
| `src/components/widget/CardTopSelf.astro` | `widget/card_top_self.pug` |
| `src/components/widget/CardBottomSelf.astro` | `widget/card_bottom_self.pug` |
| `src/components/widget/CardNewestComment.astro` | `widget/card_newest_comment.pug`（console 页用，不在 aside 挂载） |
| `src/components/widget/CardConsoleArchives.astro` | `widget/card_console_archives.pug`（console 页用） |
| `src/components/widget/CardConsoleTags.astro` | `widget/card_console_tags.pug`（console 页用） |

### 修改

| 文件 | 内容 |
| --- | --- |
| `src/components/widget/AsideContent.astro` | 由占位空容器改为 `widget/index.pug` 的三分支组装；新增可选 `site?: Partial<SiteConfig>` prop |
| `src/components/widget/toc.ts` | 保留 `TocHeading` 契约，新增 `renderToc()`（逐行移植 hexo `plugins/helper/toc.js`） |
| `src/layouts/BaseLayout.astro` | **仅一行**：`<AsideContent … site={site} />`，把已解析的站点元数据透传给作者卡（基线要求的 `config.description` 回退） |

## 3. 关键实现点

### 3.1 AsideContent 三分支（`widget/index.pug:1-34`）

1. **post + `toc_style_simple`**：`#aside-content > .sticky_layout > #card-toc`；
2. **post 常规**：作者卡 / 公告 / 微信 / top_self，再 `.sticky_layout`（TOC? + 最近文章 + 广告）；
3. **其它页面**：作者卡 / 公告 / 微信 / top_self / 分类，再 `.sticky_layout`
   （TOC? + `.card-widget`(广告 + 标签 + 归档 + 站点信息) + bottom_self）。

第 3 分支的 `.card-widget` 是外层包装，即使 4 张子卡全关也会输出；标签/归档的 `<hr>` 在包装内部。
TOC 卡在 `showToc=false` 或标题为空时不进入 DOM（上游此时 `showToc` 也为 false）。

### 3.2 数据层

- `getSiteStats()` 用模块级 Promise 缓存，一次构建只扫描 `posts` 集合一次。
- 最近文章：`preparePosts()` 后按 **date 降序 → path 码点升序** 重排，取 `limit`（0 = 全部）。
  `cover` 保留 frontmatter 原值——最近文章卡的条件是 `cover === false || !cover.aside_enable`，
  不能复用已经套过 `default_cover` 的 `PreparedPost.cover`。
- 标签：`site.tags` 去重计数，路径走 `slugize()` + `encodeURI`（与 PostCard 的 tagHref 同口径）。
- 分类：`flattenCategories()` 展开 Hexo 的嵌套链，每级建一个节点并带 `parent`。
- 归档：`asideArchives` + `formatMomentLike`，语言固定 `zh-CN`、时区 `Asia/Shanghai`（Phase 7 前与 post-list 同口径）。
- 站点信息：文章数 / 建站天数 / 全站字数 / busuanzi UV·PV / 最后更新，全部按配置条件输出；
  计数类节点输出 spinner 占位，由前端 JS 回填（与 baseline 一致）。

### 3.3 TOC

`renderToc()` 完整移植 hexo `toc.js` 的 `lastNumber` / `firstLevel` / `toc-child` 逻辑，
`href` 用 `encodeURL(id)`（`encodeURI(decodeURIComponent(id))`），文本用 hexo `escapeHTML` 同表转义。
返回 HTML 字符串后 `set:html` 插入，避免 Astro 缩进产生多余文本节点。

### 3.4 图片与 lazyload

站级 lazyload（`theme.lazyload.enable && field === 'site'`）会把 `<img src=X>` 改写成
`src=<占位> onerror=... data-lazy-src=X`。组件直接输出最终形态，并刻意与 baseline 的**生效值**对齐：

- 作者头像：`onerror="this.onerror=null,this.src=\"<error_img.post_page>\""`（过滤器插入的那条在前，
  baseline 解析后生效的是它；`error_img.flink` 只在 lazyload 关闭时使用）；
- 最近文章缩略图：同上（`post_page`）。

### 3.5 作者描述的回退链（收尾修复）

上游：`theme.aside.card_author.description || config.description`。
`theme.aside.card_author.description` 在基准配置里是空，所以实际取站点描述。
`config.*` 属于站点元数据，主题配置层拿不到；修法是让 BaseLayout 把**已经解析好的** `site`
透传一行：

```astro
<AsideContent pageType={pageType} showToc={showToc} headings={headings} site={site} />
```

`AsideContent` 的 `site` 是可选 prop（`Partial<SiteConfig>`），`resolveSite(siteInput)` 后交给
`CardAuthor`，`CardAuthor` 用 `site.description` 回退。BaseLayout 仅改这一行，其它不动。

## 4. 验收命令与真实输出

构建（`.build.lock` 串行；Node 24）：

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd /d/Git-project/astro-theme-anzhiyu
while ! mkdir .build.lock 2>/dev/null; do sleep 3; done
trap 'rmdir .build.lock' EXIT
pnpm --filter blog build
```

真实输出（末尾）：

```text
22:12:34 [build] ✓ Completed in 6.90s.
22:12:34 [build] 62 page(s) built in 7.46s
22:12:34 [build] Complete!
```

首页：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/index.html dist/index.html --limit 120
```

```text
FAIL … 17 条差异（结构 5 / 属性 9 / 文本 2 / 脚本样式 1），缺口 缺 4 节点，多 2 节点
aside 相关条目：0
```

`missingNodes` 前后：

| 时点 | missingNodes | aside 条目 |
| --- | --- | --- |
| 任务书基线 | 480 | — |
| 本任务开始时实测 | 389 | 3 条（作者卡 6 + 微信卡 5 + sticky_layout 155 = 166 节点） |
| 卡片落地后 | 223 | 1 条文本（作者描述） |
| 描述回退修复后 | **4** | **0** |

归档页：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/archives/index.html dist/archives/index.html --limit 120
```

```text
FAIL … 14 条差异（结构 4 / 属性 9 / 脚本样式 1），缺口 缺 4 节点，多 2 节点
aside 相关条目：0
```

文章页（附带验证 TOC + 最近文章）：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/2025/01/10/multi-taxonomy/index.html \
  dist/2025/01/10/multi-taxonomy/index.html --limit 120
```

```text
FAIL … 15 条差异（结构 4 / 属性 10 / 脚本样式 1），缺口 缺 4 节点，多 2 节点
aside 相关条目：0；TOC 层级/编号/锚点、最近文章条目均无差异
```

## 5. 剩余差异归属

收尾修复后，三页 aside 的 diff 条目均为 **0**；首页剩余 4 个缺失节点全部在 aside 之外：

| 归属 | 节点数 | 说明 |
| --- | --- | --- |
| head | 1 | `<meta name="generator" content="Hexo 7.3.0">`（构建器标识，不移植） |
| body | 3 | pjax 初始化脚本（2 节点）+ accesskey 脚本（1 节点），属 P4 运行时/资源层 |

另 2 个 unexpected 节点为 Astro 自己注入的样式/脚本，属资源层差异。
`author-info__description` 已与基线逐字一致，aside 无剩余文本差异。

## 6. 已知限制

1. `card_top_self` / `card_bottom_self` 的数据源 `site.data.widget` 在 Astro 站还没有对应物，
   组件已按上游结构实现并接收 `items`，当前调用方传空数组。
2. 加密文章（`page.encrypt`）的 TOC 分支不移植：当前数据模型没有加密内容。
3. `totalcount(site)` 为近似实现（CJK 逐字 + 拉丁单词）；示例站与基准站 `wordcount.enable=false`，
   不会渲染该项。
4. 分类卡的 `expand` / 层级逻辑已按 `asideCategories` 实现，但示例站 `card_categories.enable=false`，
   本次没有可对拍的 baseline 产物。
