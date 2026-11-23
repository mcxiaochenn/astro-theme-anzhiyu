# P3-1 · aside 15 个 widget 卡片

> 范围：`packages/astro-theme-anzhiyu/src/components/widget/**` 与 `src/data/**`。
> 未改动 BaseLayout / HomeTop / post 组件 / `docs/PLAN.md`，未 commit / push。

## 1. 结论

- `pnpm --filter blog build` 成功（49 页）。
- 首页 aside 结构缺口从 **166 节点**（作者卡 6 + 微信卡 5 + sticky_layout 155）降到 **1 个文本节点**；
  首页全站 `missingNodes` 由任务开始时的 389（任务书基线 480）降到 **223**（≤ 300）。
- 归档页 `/archives/` aside **结构/属性差异 0**，仅剩同一条作者描述文本差异。
- 文章页 aside（TOC + 最近文章）同样只剩这一条文本差异，TOC 层级 / 编号 / 锚点逐节点一致。

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
| `src/components/widget/AsideContent.astro` | 由占位空容器改为 `widget/index.pug` 的三分支组装 |
| `src/components/widget/toc.ts` | 保留 `TocHeading` 契约，新增 `renderToc()`（逐行移植 hexo `plugins/helper/toc.js`） |

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
21:22:19 [build] ✓ Completed in 7.49s.
21:22:19 [build] 49 page(s) built in 55.79s
21:22:19 [build] Complete!
```

首页：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/index.html examples/blog/dist/index.html --limit 120
```

```text
FAIL … 48 条差异（结构 35 / 属性 10 / 文本 3），缺口 缺 223 节点，多 5 节点
aside 相关条目：1（文本节点）
```

`missingNodes` 前后：

| 时点 | missingNodes | aside 条目 |
| --- | --- | --- |
| 任务书基线 | 480 | — |
| 本任务开始时实测 | 389 | 3 条（作者卡 6 + 微信卡 5 + sticky_layout 155 = 166 节点） |
| 本任务完成后 | **223** | **1 条文本**（作者描述） |

归档页：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/archives/index.html examples/blog/dist/archives/index.html --limit 120
```

```text
FAIL … 44 条差异（结构 35 / 属性 9），缺口 缺 221 节点，多 5 节点
aside 相关条目：1（文本节点）；aside 结构/属性差异 = 0
```

文章页（附带验证 TOC + 最近文章）：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/2025/01/10/multi-taxonomy/index.html \
  examples/blog/dist/2025/01/10/multi-taxonomy/index.html --limit 120
```

```text
FAIL … 47 条差异（结构 37 / 属性 10），缺口 缺 225 节点，多 9 节点
aside 相关条目：1（文本节点）；TOC 层级/编号/锚点、最近文章条目均无差异
```

## 5. 剩余差异归属

首页 223 个缺失节点（另 5 个 unexpected）按路径归因：

| 归属 | 节点数 | 说明 |
| --- | --- | --- |
| console | 180 | `#console` 中控台整块，后续阶段接管 |
| head | 17 | `css/index.css`、CDN 资源、`GLOBAL_CONFIG` / `config-diff` 等脚本（P4 资源层） |
| body | 30 | 全局脚本 / 背景层 / footer 等非 aside 内容 |
| aside | 1 | 作者卡 `author-info__description` 的**文本节点**（见下） |

**aside 唯一剩余差异**：`card_author.description` 为空时，上游回退 `config.description`（站点描述）。
主题配置（`theme.*`）里没有站点级 `config.description`，而 BaseLayout 当前不向 AsideContent
传递 `site`（P3-1 的写入范围不允许改布局），因此这里只能退化为空文本。
属**站点配置层缺失**（Phase 7 迁移脚本落地后由 BaseLayout / 站点配置注入即可消除），
不影响 aside 的结构、class、id、层级。

## 6. 已知限制

1. 作者描述回退（上节），Phase 7 站点配置层接管。
2. `card_top_self` / `card_bottom_self` 的数据源 `site.data.widget` 在 Astro 站还没有对应物，
   组件已按上游结构实现并接收 `items`，当前调用方传空数组。
3. 加密文章（`page.encrypt`）的 TOC 分支不移植：当前数据模型没有加密内容。
4. `totalcount(site)` 为近似实现（CJK 逐字 + 拉丁单词）；示例站与基准站 `wordcount.enable=false`，
   不会渲染该项。
5. 分类卡的 `expand` / 层级逻辑已按 `asideCategories` 实现，但示例站 `card_categories.enable=false`，
   本次没有可对拍的 baseline 产物。
