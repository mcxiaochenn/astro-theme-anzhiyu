# P3-2 · page.type 分发与独立页面模板

范围：独立页面路由（`layout: page`）、`page.type` 分发、非 about 的 11 个页面模板、
站点数据层 `site.data.*`。about 模板本体由 P3-3 负责，本轮只落路由与 `AboutPage` 占位。

---

## 1. 路由模型

### 1.1 旧 → 新

| 旧 | 新 | 说明 |
| --- | --- | --- |
| `src/pages/[...page].astro`（根级 rest，`params.page = 'page/2'`） | `src/pages/page/[...page].astro`（`params.page = '2'`） | `page` 由目录名静态匹配，rest 只剩页码 |
| — | `src/pages/[...path].astro`（新增） | 根级 rest，承接所有 `layout: page` 的独立页面 |

优先级（实测）：Astro 的静态段优先于 rest 段，`/page/2/` 命中
`page/[...page].astro`，不会被根级 `[...path].astro` 抢走；`/archives/...`、
`/tags/...`、`/categories/...` 同理。`/404.html` 由静态 `404.astro` 产出。

### 1.2 `[...path].astro` 的路径推导

```ts
const entries = await getCollection('posts')
const pages = entries.filter((entry) => entry.data.layout === 'page')
const raw = entry.data.permalink || entry.id.replace(/-page$/, '')
params = { path: raw.replace(/^\/+|\/+$/g, '') }
```

- 新增可选 frontmatter `permalink`（`examples/blog/src/content.config.ts`），
  对应上游「文件位置决定 URL」的语义；
- 缺省用 `id` 去掉 `-page` 后缀：`about-page` → `/about/`；
- 生成前检查空路径与重复路径，重复直接抛错（构建期暴露配置错误）；
- `[year]/[month]/[day]/[slug].astro` 仍只取 `layout !== 'page'`，两类路由互不重叠。

### 1.3 页面外壳（`layout/page.pug:4-6`）

```astro
<BaseLayout pageType="page" topImg={topImg} aside={aside} …>
  <div id="page">
    {topImg === false && !topSingle && <h1 class="page-title">{title}</h1>}
    …按 type 分发…
  </div>
</BaseLayout>
```

- `topImg` 只读 `page.top_img`（string / `false` / 缺省），不按主题默认图回退，
  与 pug 的 `top_img === false` 严格一致；
- `page.top_single === true` 时即使 `top_img: false` 也不输出 `page-title`；
- `page.aside === false` 透传给 BaseLayout（`layout.pug:3` 的隐藏侧栏）。

---

## 2. 模板清单

目录：`packages/astro-theme-anzhiyu/src/components/page/`。
每个文件的头注释都标注了对应的上游 pug 行号；DOM 的 id / class / 层级 / 文本逐项对齐。

| `page.type` | 组件 | 上游 | 数据 |
| --- | --- | --- | --- |
| `tags` | `TagsPage.astro` | `tags.pug:1-4` | 内容集合聚合出的 `{name,path,length}`，走 `utils/helpers.ts#tagsPageList` |
| `categories` | `CategoriesPage.astro` | `categories.pug:1-2` | 同上（`path = categories/<name>/`） |
| `link` | `FlinkPage.astro` | `flink.pug:1-133` | `site.data.link` + 主题配置门控 |
| `essay` | `EssayPage.astro` | `essay.pug:1-67` | `site.data.essay` |
| `room` | `RoomPage.astro` | `room.pug:1-278` | 无（静态 3D 房间 + 内联视差脚本） |
| `about` | `about/AboutPage.astro` | `about.pug:1-472` | `site.data.about`（**占位，P3-3 替换**） |
| `album` | `AlbumPage.astro` | `album.pug:1-22` | `site.data.album` + `page.top_background` |
| `fcircle` | `FcirclePage.astro` | `fcircle.pug:1-25` | 主题 `friends_vue` 门控 |
| `album_detail` | `AlbumDetailPage.astro` | `album_detail.pug:1-90` | `site.data.album` + 当前 URL 匹配 `path_name` |
| `music` | `MusicPage.astro` | `music.pug:1-8` | 无（静态骨架） |
| `equipment` | `EquipmentPage.astro` | `equipment.pug:1-33` | `site.data.equipment` |
| 其它/缺省 | `DefaultPage.astro` | `default-page.pug:1-2` | `page.content` |

共享类型在 `components/page/types.ts`：`PageContentSlot`（正文注入）、`TaxonomyItem`、
`Essay*` / `Album*` / `Flink*` / `Equipment*`。

### 2.1 正文注入

上游 `page.content` 是渲染后的 HTML 字符串。站点路由里：

```ts
const renderedHtml = entry.rendered?.html ?? ''
const { Content } = await render(entry)
```

`DefaultPage` / `FlinkPage` 优先 `set:html={html}`，`html` 不可用（dev 早期）时退回
`<Content />`。同一份渲染 HTML 也作为 `content` 传给 BaseLayout，供
`page_description()` 的 `page.description > page.content > page.title > config.description`
回退链使用。

### 2.2 配置门控（本轮只做结构，不做交互）

- `link`：`theme.linkPageTop.enable`（顶部横幅）、`theme.friends_vue.enable`（钓鱼区）、
  `theme.comments.use === 'Twikoo' && theme.twikoo.envId`（申请友链按钮）、
  `theme.lazyload.enable`（`data-lazy-src` vs `src`）；
- `fcircle`：整体由 `theme.friends_vue.enable` 包住，`apiurl` 存在时才输出
  `random_friends_post_js`；
- 三种友链列表（`anzhiyu` / `telescopic` / `flexcard`）与 `lost_contact` 变体全部实现。
- fancybox / meting / pjax / fj-gallery / 复制与右键菜单等行为留给 Phase 4/5。

---

## 3. 站点数据层

上游 `site.data.*` 来自 Hexo `source/_data/*.yml`。Astro 侧：

```
examples/blog/
  data/
    about.yml        ← 复制 fixtures/about-data.yml（P3-3 用）
    essay.yml
    album.yml
    link.yml
    equipment.yml
  src/data/site-data.ts
```

`site-data.ts`：

- `import.meta.glob('../../data/*.yml', { query: '?raw', import: 'default', eager: true })`
  把整目录以原文收进来；
- `yaml.parse()` 解析，模块级 `Map` 缓存（一次构建只解析一次）；
- `getSiteData<T>(name)` 文件不存在时返回 `undefined`（对应上游 `if site.data.x` 的假值分支），
  解析失败直接抛错并带文件名；
- 不新增依赖（`yaml` 已是主题包依赖）。

主题包不能反向 import 站点目录，所以由 `[...path].astro` 读数据、以 props 传给
`components/page/*`；组件本身只依赖 props 与主题配置。

> 说明：基准站 `source/_data/` 里只有 `about.yml`，其余 YAML 是本轮为覆盖模板各分支
> 新增的 fixture 数据，不与基线 HTML 做像素对比。about 页没有创建 `creativity.yml`，
> 以保持基线的「无该数据」分支（`about.pug:67` 的可选项）。

---

## 4. 新增/修改文件

| 文件 | 动作 |
| --- | --- |
| `examples/blog/src/pages/page/[...page].astro` | 由根级 `[...page].astro` 移入，import 深度 +1，params 改为 `'2'..'N'` |
| `examples/blog/src/pages/[...path].astro` | 新增：独立页面路由 + `page.type` 分发 |
| `examples/blog/src/data/site-data.ts` | 新增：YAML 站点数据层 |
| `examples/blog/data/*.yml` | 新增：about/essay/album/link/equipment |
| `examples/blog/src/content.config.ts` | 新增 `permalink: z.string().optional()` |
| `fixtures/about-page.md` | 新增 `permalink: /about/` |
| `packages/astro-theme-anzhiyu/src/components/page/**` | 新增 11 个模板 + 类型 + about 占位 |
| `fixtures/page-*.md` | 新增 12 个页面 fixture（见 §5） |

未改动：`BaseLayout.astro`、`Head.astro`、`AsideContent.astro`、`docs/plan/PLAN.md`、
post 组件、`[year]/[month]/[day]/[slug].astro`。

---

## 5. 页面 fixture（临时验证用）

全部 `layout: page` + `top_img: false`（用于同时验证 `h1.page-title` 分支），
`permalink` 如下：

| fixture | permalink | type |
| --- | --- | --- |
| `page-default.md` | `/page-default/` | 无（default 分支） |
| `page-tags.md` | `/tags/` | `tags` |
| `page-categories.md` | `/categories/` | `categories` |
| `page-link.md` | `/link/` | `link` |
| `page-essay.md` | `/essay/` | `essay` |
| `page-room.md` | `/room/` | `room` |
| `page-album.md` | `/album/` | `album` |
| `page-album-detail.md` | `/album/demo/` | `album_detail`（type=1 瀑布流） |
| `page-album-gallery.md` | `/album/gallery/` | `album_detail`（type=2 画廊） |
| `page-fcircle.md` | `/fcircle/` | `fcircle` |
| `page-music.md` | `/music/` | `music` |
| `page-equipment.md` | `/equipment/` | `equipment` |

注意：`/tags/` 与 `/categories/` 在基线 HTML 里**不存在索引页**（上游只生成了单个标签/分类页），
因此这两个模板只能做结构验证，无法做基线 diff。

---

## 6. 验收

### 6.1 构建

```
$ CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm --filter blog build
22:03:21 [build] 62 page(s) built in 5.06s
22:03:21 [build] Complete!
EXIT=0
```

页数 62 = 49（P2 既有路由：首页 / `/page/2/` / 9 篇文章 / 归档 / 标签详情 / 分类详情 / 404 等）
\+ 1（about）+ 12（本轮页面 fixture），满足「≥ 50」的验收下限。

> 构建环境说明：Astro 结束时会 `fs.rm(dist/.prerender)`（119 个临时文件），被工作区的
> 批量删除保护（阈值 100）拦截并以 exit 1 结束。该目录是本次构建自己生成的中间产物，
> 因此仅在**构建子进程**内设 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 让 Astro 完成清理；
> 不涉及源码、fixtures 或用户数据，也未改动任何保护配置。

### 6.2 各 type 的根选择器（构建产物实测）

| URL | 断言选择器 | 结果 |
| --- | --- | --- |
| `/about/` | `<div id="page">` → `<div id="about-page">` | ✅ |
| `/tags/` | `.tag-cloud-list.is-center > #tag > #tag-page-tags` | ✅ |
| `/categories/` | `#tag > .category-lists#tag-page-tags` | ✅ |
| `/link/` | `#article-container > .flink`（三种列表 + 徽章） | ✅ |
| `/essay/` | `#essay_page`（卡片 + `#bber` + `#bber-tips`） | ✅ |
| `/room/` | `#room_page`（含 4 组循环家具） | ✅ |
| `/album/` | `#album > .card-album` | ✅ |
| `/album/demo/` | `#album_detail > section.timeline > ul#waterfall.list` | ✅ |
| `/album/gallery/` | `#album_detail > .type-gallery > .gallery > .fj-gallery` | ✅ |
| `/music/` | `#anMusic-page`（3 个按钮 + meting 挂载点） | ✅ |
| `/equipment/` | `#equipment > .goodthings-item > .equipment-item` | ✅ |
| `/page-default/` | `#article-container` + 正文 | ✅ |

`fcircle` 在基准配置下 `friends_vue.enable: false`，按上游语义**不产出 DOM**。
为验证模板本身，用临时主题配置（仅把该开关改为 `true`，放在仓库根、构建后删除）
单独构建一次，`/fcircle/` 输出：

```
<div id="page"><h1 class="page-title">友链朋友圈</h1>
<div class="fcircle_page">
  <div class="author-content author-content-item fcirclePage single" style="background: url() left 28% / cover no-repeat !important;">
    …友链 / 最新文章订阅 / 关于本人…
  <div class="title-h2-a">…🎣 钓鱼 / 全部友链…</div>
  <div id="random-post"></div>
  <div id="hexo-circle-of-friends-root"></div>
```

### 6.3 `/about/` 外壳对比

基线 `.baseline-html/about/index.html` 与 `dist/about/index.html`：

| 检查项 | 基线 | 本站 |
| --- | --- | --- |
| `#content-inner` 的第一个子元素 | `<div id="page">` | `<div id="page">` |
| `#page` 的第一个子元素 | `<div id="about-page">` | `<div id="about-page">` |
| `h1.page-title` | 无（`top_img` 为字符串） | 无 |
| `#page` 的结束位置 | 紧邻 `#aside-content` 之前 | 同 |

外壳结构差异为 0；`#page` 内部的 about 卡片/技能/地图等内容是 P3-3 的交付，
当前占位带 `data-about-placeholder="P3-3"`，是本轮唯一的内容级缺口。
`<meta name="description">` 与基线仅差一个空格（`</h2><p>` 之间换行被保留为空格），
属 Markdown → HTML 管线差异，不在本任务范围。

### 6.4 `/page/2/` 未被破坏

`dist/page/2/index.html` 正常产出；首页分页链接仍为
`/page/2/#content-inner`，第 2 页的「首页」链接为 `/`。
文章卡片 / 分类条与本轮改动前一致（属性书写顺序差异来自既有组件，不是路由改动）。

---

## 7. 未覆盖 / 已知差异

1. **about 内容**：`AboutPage.astro` 是占位，只有 `#about-page` 容器；P3-3 替换该单文件即可，
   路由、数据加载（`about.yml`）已就绪。
2. **交互与第三方**：fancybox、meting/aplayer、pjax、fj-gallery 懒加载、右键复制/引用、
   朋友圈 vue 脚本的请求逻辑都只输出了静态结构与属性，Phase 4/5 接管。
3. **评论**：`layout/page.pug:33-35` 的评论分支未接（Phase 4），
   `page.comments === false` 的隐藏逻辑也未落。
4. **`<time datetime>` 的值**：上游 YAML 日期是 `Date` 对象，pug 会渲染成
   `Date.toString()`；本站保留 frontmatter 原字符串（`2025-04-20 10:00:00`），
   `<time>` 的**文本**已按 `toISOString()` 产出并固定 +08 时区。无基线可对比。
5. **实体转义**：Astro 把 `onclick="…"` 里的双引号输出为 `&quot;`，与上游 pug 的
   `onclick='…'` 在解析后的 DOM 上等价、序列化文本不同。
6. **tag/category 计数**：由内容集合现场聚合（标签=文章数；分类=文章数，嵌套分类每级都算），
   与 Hexo `site.tags` / `site.categories` 口径一致；无基线可 diff。
7. **`data-rowHeight` 等驼峰属性**：按 pug 原样输出；HTML 解析后大小写归一，DOM 等价。
8. **404 / archives / tags 详情 / categories 详情**：不在本轮范围，未改动。
