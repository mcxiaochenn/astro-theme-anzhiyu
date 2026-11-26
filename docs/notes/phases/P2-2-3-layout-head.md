# P2-2 / P2-3 · BaseLayout 骨架 + Head 组件

- 执行人：`p22-skeleton`（组员）
- 时间：2026-11-23 19:34–19:52（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（HEAD `0d39b81`，本次改动全部为未提交改动）
- 环境：Node **v24.22.0** · pnpm **10.29.3** · astro **7.4.13** · vite 8 · Windows 11
- 上游只读基准：`D:\Git-project\_research\anzhiyu-upstream`（`layout/includes/layout.pug` / `head.pug` / `head/*.pug`）
- 验收基准：`.baseline-work/public/index.html`（Hexo 1.7.1 产物）

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| `pnpm --filter blog build` | ✅ exit 0，3 pages | §4 |
| 首页由真实内容集合渲染 | ✅ `getCollection('posts')` → 9 篇文章（1 个 `layout: page` 的 about 页被过滤） | §1.3 |
| layout.pug 全部挂载点 ID | ✅ 26/26 出现在产物里；整体 ID 覆盖 102 → 52（缺的都是后续阶段的内部 ID） | §1.2 |
| 首页 HTML diff `missingNodes` | ✅ **1058 → 857**（少 201 个节点） | §5 |
| 首页 diff `diffCount` | ⚠️ 66 → 103（不是退化，见 §5.3：对齐上的节点变多，差异从「整块缺失」变成「逐节点缺口」） | §5 |
| `verify-css` | ✅ PASS（字节 −0.03%，gzip −0.84%） | §6 |
| 组件包 exports 接好 | ✅ exports 已加；`astro-theme-anzhiyu/layouts/BaseLayout.astro` 可解析 | §7 |
| examples/blog 的 import 写法 | ⚠️ 用**相对路径**（`package.json` 没声明依赖，且不在本次写范围）；一行即可切回包名 | §7.3 |

### 改动清单（全部在写范围内）

| 文件 | 变更 | 说明 |
|---|---|---|
| `src/layouts/BaseLayout.astro` | 新增 476 行 | layout.pug 骨架 + 首屏 theme bootstrap + 占位容器 |
| `src/components/Head.astro` | 新增 263 行 | head.pug 基础部分（meta/link/OG/canonical/favicon/preconnect/站长验证/noscript） |
| `src/layouts/site.ts` | 新增 111 行 | 站点级元数据类型 + `url_for`/`full_url_for` 最小实现 |
| `src/layouts/theme-context.ts` | 新增 79 行 | 组件层读主题配置（复用 P1-8 loader，模块级缓存） |
| `packages/astro-theme-anzhiyu/package.json` | +5 行 | `exports` 加 `components/*`、`layouts/*` 与两个显式子路径 |
| `src/pages/index.astro` | 重写（47 → 98 行） | 用 BaseLayout + `getCollection('posts')` 渲染 9 篇文章列表 |
| `docs/notes/phases/P2-2-3-layout-head.md` | 新增 | 本报告 |

未触碰：`astro.config.mjs`、`src/content.config.ts`、`packages` 的 `src/config|i18n|utils`、根 `scripts/`、`examples/blog` 的其它页面与样式。

---

## 1. 必答 1：BaseLayout 结构清单（复刻了哪些 ID/容器、对应哪几行、哪些是占位）

### 1.1 挂载点逐条对照

`BaseLayout.astro` 的模板从 **L218 `<html>`** 到 **L476 `</html>`**。下表「行号」指当前文件里该容器所在行。

| DOM 节点（tag#id.class） | 上游来源 | BaseLayout 行 | 状态 |
|---|---|---|---|
| `html[lang][data-theme][class]` | layout.pug:7 | L219 | ✅ 实做（`lang`←site、`data-theme`←`theme.display_mode`、`class`←`aside.enable && aside.hide ? 'hide-aside' : ''`） |
| `body[data-type="anzhiyu"]` | layout.pug:10 | L239 | ✅ 实做 |
| `div#web_bg` | layout.pug:11 | L241 | ✅ 实做（空容器，样式来自上游 CSS） |
| `div#an_music_bg` | layout.pug:12 | L244 | ✅ 实做 |
| `div#loading-box` > `.loading-bg` > `img.loading-img.nolazyload` + `.loading-image-dot` + 内联 preloader 脚本 | layout.pug:13-14 → `loading/index.pug` + `loading/fullpage-loading.pug:1-21` | L246-259 | ✅ 实做（脚本逐 token 对齐上游，`if (true)` 由 `theme.pjax.enable` 求值；**pace 那半段未做**，见 §8） |
| `div#body-wrap.page` | layout.pug:18 | L264 | ✅ 实做（`class=pageType`，首页为 `page`；`post` 由 P2-8 传 `pageType`） |
| `header#page-header.not-top-img` | layout.pug:19 → `header/index.pug:1-24` | L266 | 🟡 容器实做（class 按 `index_img/default_top_img` 分支算出 `not-top-img`）；**内部 nav/site-info 是占位**，P2-4 填 |
| `nav#nav > div#nav-group` | `header/nav.pug` | L267-269 | 🟡 占位（P2-4） |
| `main#blog-container` | layout.pug:20 | L273 | ✅ 实做 |
| `div#home_top > div.swiper_container_card` | layout.pug:23-24 → `top/top.pug:4-5` | L275-279 | 🟡 容器实做（`isHome && isCurrentRoot` 时渲染，`style="height:auto;width:100%"` 与上游一致）；**bannerGroup/topGroup 是占位**，P2-7 填 |
| `div#content-inner.layout` | layout.pug:43 | L282 | ✅ 实做（`class` 为 `layout`，`page.aside === false` 时追加 `hide-aside`） |
| `<slot />`（页面内容） | layout.pug:44-47（`block content`） | L283 | ✅ 实做 |
| `div#aside-content.aside-content` | layout.pug:48-49 → `widget/index.pug:1` | L286-288 | 🟡 占位（P3-1 填卡片） |
| `footer#footer` | layout.pug:60 | L293 | ✅ 实做 |
| `div#footer-wrap` | layout.pug:60-61 → `footer.pug:1` | L294 | 🟡 占位（P2-4） |
| `div#footer-bar > .footer-bar-links > .footer-bar-left + .footer-bar-right` | `footer.pug:67-68`（`theme.footer.footerBar.enable`） | L295-303 | 🟡 占位（P2-4） |
| `div#sidebar > div#menu-mask + div#sidebar-menus` | layout.pug:78 → `sidebar.pug:1-3` | L308-312 | 🟡 占位（P2-5） |
| `div#rightside > #rightside-config-hide + #rightside-config-show` | layout.pug:82 → `rightside.pug:36-61` | L314-318 | 🟡 占位（P2-5） |
| `div#nav-music` > `a#nav-music-hoverTips[accesskey=m]` + `div#console-music-bg` + `meting-js` | layout.pug:84-85 → `music.pug:4-7` | L321-337 | ✅ 静态结构实做（属性值来自 `theme.nav_music.*`；交互 P4-7） |
| `div#rightMenu`（4 个 `.rightMenu-group` + 全部菜单项）+ `div#rightmenu-mask` | layout.pug:87 → `anzhiyu/rightmenu.pug:1-82` | L343-459 | ✅ 静态结构实做（文案/图标/`#menu-music-playlist` 的 onclick 与上游一致；交互 P4-5） |
| `div`（空 wrapper） | layout.pug:88 → `additional-js.pug:1` | L461-462 | 🟡 占位（脚本本体 P4-2/P4-3）；空 div 是上游 include 的真实根节点，不是多余包裹 |
| `div#popup-window` > `.popup-window-title` + `.popup-window-divider` + `.popup-window-content` > `.popup-tip` + `.popup-link` > `i.anzhiyufont` | layout.pug:91 → `popup/index.pug:1-7` | L464-475 | ✅ 实做（纯静态） |

**明确不做**（都有归属阶段）：

| 上游挂载 | 为什么不做 | 归属 |
|---|---|---|
| `mourn.pug` | `theme.mourn.enable: false`，上游本身不渲染 | — |
| `bbTimeList.pug` | 需要 `site.data.essay`，当前站点没有数据 | P3-3 |
| `shortcutKey.pug` | `theme.shortcutKey.enable: false` | P4-5 |
| search include | `algolia_search` / `docsearch` / `local_search` 三个开关全 false，上游 include 本身输出为空（baseline 里也没有节点） | P4-8 |
| 404 分支 | `page.type === '404'` 走 `404.pug`，本布局只留 `<slot name="404" />` 空位 | P2-10 |
| pace 进度条（`loading/pace.pug`） | CSS/JS 是 CDN asset URL（`plugins.yml` 的 asset 层），Phase 2 不内联 | P4-1 |
| `ClientRouter` / `transition:persist` / pjax shim | 不属于 layout.pug 的 DOM，是 Phase 4 路由层 | P4-3 |

### 1.2 ID 覆盖的可复现证明

脚本逻辑：分别抓取 baseline 与 dist 的全部 `id="…"`，再对 layout.pug 的 26 个挂载点 ID 逐项判定（脚本是临时产物，核心只有下面几行，可随时重跑）：

```js
const ids = (file) => [...readFileSync(file, 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
const baseline = ids('.baseline-work/public/index.html')
const dist = ids('dist/index.html')
console.log(baseline.filter((id) => !dist.includes(id)))   // dist 缺失的 baseline id
```

输出（原始）：

```text
baseline id 数: 102  dist id 数: 52
dist 缺失的 baseline id: ["config-diff","blog_name","site-name","name-container","page-name","menus","nav-right","randomPost_button","center-console","console","card-newest-comments","consoleHideAside","consoleMusic","nav-totop","percent","toggle-menu","bannerGroup","random-banner","peoplecanvas","random-hover","todayCard","categoryBar","category-bar","catalog-bar","catalog-list","首页","/categories/前端/Astro/", … "footer-bar-tips","footer-type-tips","translateLink","darkmode","hide-aside-btn","rightside-config","go-up","universe","page-type"]
dist 独有 id: []
layout.pug 挂载点: web_bg=OK an_music_bg=OK loading-box=OK body-wrap=OK page-header=OK nav=OK nav-group=OK blog-container=OK home_top=OK content-inner=OK aside-content=OK footer=OK footer-wrap=OK footer-bar=OK sidebar=OK menu-mask=OK sidebar-menus=OK rightside=OK rightside-config-hide=OK rightside-config-show=OK nav-music=OK nav-music-hoverTips=OK console-music-bg=OK rightMenu=OK rightmenu-mask=OK popup-window=OK
```

`layout.pug` 的 **26 个直接挂载点 ID 全部命中**；剩余缺失 ID 全部属于后续阶段内部结构：
`nav-right`/`console`/`blog_name`（P2-4）、`bannerGroup`/`categoryBar`/`pagination`（P2-7）、`card-wechat`（P3-1）、`translateLink`/`darkmode`/`go-up`（P2-5）、`config-diff`（P4-1）、`universe`/`page-type`（P4-2）。

### 1.3 首页真实内容渲染

`src/pages/index.astro`：

```astro
const entries = await getCollection('posts')
const articles = entries
  .filter((entry) => entry.data.layout !== 'page')      // about 页不进首页列表
  .map(...)                                            // Hexo permalink: /YYYY/MM/DD/<id>/
  .sort((a, b) => b.sticky - a.sticky || b.createdAt - a.createdAt)
```

产物 `dist/index.html` 里实测（`class="recent-post-item` 计数 + 标题/时间提取）：

```text
recent-post-item 数: 9
标题: 置顶与推荐位样本 / 第三方嵌入与卡片标签样本 / 媒体与卡片标签全量样本 / 块级容器标签全量样本 /
      行内标签全量样本 / 无封面与自定义顶部图 / 多分类与多标签的归档样本 / 短讯 / 长文基准：从 Hexo 到 Astro 的完整迁移札记
时间: 2025-02-02T00:20:00.000Z => 2025-02-02   … 2024-11-01T01:30:00.000Z => 2024-11-01
```

- 排序（`sticky` 10 的 sticky-top 第一，其余按日期降序）与 baseline 首页 6 张卡片的顺序完全一致；
- `datetime` 与 baseline 的 `date_xml()` 输出逐篇一致（如 `2025-02-02T00:20:00.000Z`），说明 P2-1 的时区归一化在页面层被正确消费；
- 10 条内容里 `about-page`（`layout: page`）被过滤，首页正好 9 篇 —— 与任务口径一致；
- baseline 首页是 6 篇（Hexo `per_page: 6`），本页一次渲染 9 篇（分页 P2-7 再做），这是 §5 `unexpectedNodes` 增加的主要原因。

---

## 2. 必答 2：`html[data-theme]` 首屏 bootstrap 怎么做的

### 2.1 三层保证

1. **静态兜底**（与上游 pug 一致，无 JS 也有值）：`<html … data-theme={theme.display_mode}>`；
2. **首屏同步脚本**（在 `</head>` 前的 `<script is:inline>`，paint 之前执行，位置对应上游 `GLOBAL_CONFIG`）：
   按「`localStorage.theme`（上游 `saveToLocal` 格式）→ `prefers-color-scheme` / 时段 → 静态默认」修正；
3. **属性只改不重建**：脚本只 `setAttribute('data-theme', …)`，让 `[data-theme="light"|"dark"]` 下的 `--anzhiyu-*` 变量在首帧就生效，避免 P1.5 观测到的 `#web_bg` 透明。

### 2.2 代码（`BaseLayout.astro` L152-201、L219、L232-235）

`<html>`（L219）：

```astro
<html lang={site.language} data-theme={displayMode} class={htmlClass || undefined}>
```

bootstrap（L169-201，`displayMode`/`autoChangeMode` 来自主题配置）：

```ts
const displayMode = theme.display_mode === 'dark' ? 'dark' : 'light'
const darkmodeConfig = theme.darkmode
const autoChangeMode =
  darkmodeConfig.enable && (darkmodeConfig.autoChangeMode === 1 || darkmodeConfig.autoChangeMode === 2)
    ? darkmodeConfig.autoChangeMode
    : 0

const themeBootstrap = `(function () {
    var root = document.documentElement
    var fallback = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    var AUTO = ${autoChangeMode}
    var mode = fallback
    try {
      var raw = localStorage.getItem('theme')
      var saved = raw ? JSON.parse(raw) : null
      var alive = saved && (!saved.expiry || saved.expiry > Date.now())
      if (alive && (saved.value === 'dark' || saved.value === 'light')) {
        mode = saved.value
      } else if (AUTO) {
        var prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
        var supportsPrefers = !!(prefers && typeof prefers.matches === 'boolean')
        if (AUTO === 1 && supportsPrefers) {
          mode = prefers.matches ? 'dark' : 'light'
        } else {
          var hour = new Date().getHours()
          mode = hour >= 18 || hour < 6 ? 'dark' : 'light'
        }
      }
    } catch (error) {
      mode = fallback
    }
    root.setAttribute('data-theme', mode)
  })()`
```

挂进 head（L220-237）：

```astro
<head>
  <Head …>
    {/* 首屏 theme bootstrap：必须在 paint 前执行；位置对应上游 GLOBAL_CONFIG（noscript 之前） */}
    <script slot="head-script" is:inline set:html={themeBootstrap}></script>
  </Head>
  <slot name="head-extra" />
</head>
```

产物首帧（`dist/index.html` head 尾部，脚本在 `<noscript>` **之前**、`<link rel=stylesheet>` **之前**）：

```html
<meta name="msvalidate.01" content="xxx"><script>(function () {
    var root = document.documentElement
    var fallback = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    var AUTO = 1
    …
    root.setAttribute('data-theme', mode)
  })()</script><noscript>…</noscript><link rel="stylesheet" href="/_astro/upstream.DeEHpLXK.css"></head>
```

### 2.3 为什么 localStorage 格式要按 `{value, expiry}` 读

上游 `source/js/main.js:856` 切换主题时写 `saveToLocal.set("theme", willChangeMode, 2)`，`saveToLocal` 存的是 `JSON.stringify({value, expiry})`（TTL 2 天，ms 时间戳）。Phase 4 移植的 `main.js` 会继续写这个格式，所以首屏脚本必须按同一格式读，不能按裸字符串 `localStorage.theme === 'dark'` 读，否则 Phase 4 接通后首屏会闪一下 light。

`autoChangeMode` 语义取自上游主题配置注释：`1` = 跟随系统（系统不支持深色时回退 18:00–06:00），`2` = 只看时段。

---

## 3. 必答 3：Head.astro 输出了哪些 meta/link（逐条）

产物 `dist/index.html` 的 `<head>` 实际顺序（= 上游 head.pug/OG/preconnect/verification/noscript 的顺序）：

| # | 输出 | 上游来源 | 实际值（首页） | 与 baseline 对比 |
|---|---|---|---|---|
| 1 | `<meta charset="UTF-8">` | head.pug:21 | `UTF-8` | ✅ 一致 |
| 2 | `<meta http-equiv="X-UA-Compatible" content="IE=edge">` | head.pug:22 | `IE=edge` | ✅ |
| 3 | `<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">` | head.pug:23 | 同左 | ✅ |
| 4 | `<title>` | head.pug:8-9,24 | `AnZhiYu Baseline - 上游 1.7.1 参考产物` | ✅ |
| 5 | `<meta name="keywords">` | head.pug:11-14,25-26 | `Hexo,AnZhiYu,baseline` | ✅（page.keywords → page.tags → config.keywords 三级回退已实现） |
| 6 | `<meta name="author">` | head.pug:15,27 | `AnZhiYu Baseline`（有 email 时拼 `author,email`） | ✅ |
| 7 | `<meta name="copyright">` | head.pug:16,28 | `AnZhiYu Baseline`（`config.copyright || config.author`） | ✅ |
| 8 | `<meta name="format-detection" content="telephone=no">` | head.pug:29 | 同左 | ✅ |
| 9 | `<meta name="theme-color">` | head.pug:17-19,30 | `#f7f9fe`（theme_color.enable 时取 `meta_theme_color_light`，否则 `#ffffff`；dark 分支对应 `#0d0d0d`/`#18171d`） | ✅ |
| 10 | `<meta name="mobile-web-app-capable" content="yes">` | head.pug:31 | ✅ | ✅ |
| 11 | `<meta name="apple-touch-fullscreen" content="yes">` | head.pug:32 | ✅ | ✅ |
| 12 | `<meta name="apple-mobile-web-app-title">` | head.pug:33 | `AnZhiYu Baseline`（`pageTitle`） | ✅ |
| 13 | `<meta name="application-name">` | head.pug:34 | `AnZhiYu Baseline` | ✅ |
| 14 | `<meta name="apple-mobile-web-app-capable" content="yes">` | head.pug:35 | ✅ | ✅（baseline 里确实是重复出现的两条，照抄） |
| 15 | `<meta name="apple-mobile-web-app-status-bar-style">` | head.pug:36 | `#f7f9fe` | ✅ |
| 16 | `<meta property="og:type">` | Open_Graph.pug:5 | `website`（post → article） | ✅ |
| 17 | `<meta property="og:title">` | Open_Graph.pug:6 | `AnZhiYu Baseline` | ✅ |
| 18 | `<meta property="og:url">` | Open_Graph.pug:7 | `https://baseline.anzhiyu.test/` | ⚠️ baseline 是 `<SITE>/index.html`（Hexo `pretty_urls.trailing_index: true` 的产物；Astro 侧是 trailing-slash 路由模型）→ 唯一一条 head 属性差异，见 §8 |
| 19 | `<meta property="og:site_name">` | Open_Graph.pug:8 | `AnZhiYu Baseline` | ✅ |
| 20 | `<meta property="og:description">` | Open_Graph.pug:9 | `hexo-theme-anzhiyu 1.7.1 在固定内容与固定配置下的参考构建` | ✅（走 `pageDescription()`：page.description→page.content→page.title→config.description，stripHTML+150 字符+escape） |
| 21 | `<meta property="og:locale">` | Open_Graph.pug:10 | `zh-CN` | ✅ |
| 22 | `<meta property="og:image">` | Open_Graph.pug:3,11 | `https://bu.dusays.com/2023/04/27/64496e511b09c.jpg`（`page.cover || theme.avatar.img` → 绝对 URL） | ✅ |
| 23 | `<meta property="article:author">` | Open_Graph.pug:12 | `AnZhiYu Baseline` | ✅ |
| 24 | `<meta property="article:tag">` | Open_Graph.pug:13 | `Hexo,AnZhiYu,baseline`（上游取 `config.keywords`，不是 pageKeywords） | ✅ |
| 25 | `<meta name="twitter:card" content="summary">` | Open_Graph.pug:14 | ✅ | ✅ |
| 26 | `<meta name="twitter:image">` | Open_Graph.pug:15 | 同 og:image | ✅ |
| 27 | `<meta name="description">` | Open_Graph.pug:17 | 同 og:description | ✅ |
| 28 | `<link rel="shortcut icon" href="/favicon.ico">` | head.pug:42（`favicon_tag`） | `theme.favicon || config.favicon`，`.ico` 用 `shortcut icon` | ✅ |
| 29 | `<link rel="canonical" href="https://baseline.anzhiyu.test/">` | head.pug:43（`urlNoIndex()`） | 去掉结尾 `index.html` | ✅ |
| 30 | `<link rel="preconnect" href="//cdn.cbd.int">` | head/preconnect.pug:15-21 | `internal_provider: local`、`third_party_provider: cbd` | ✅（含上游那条缩进错位的分支行为，见组件注释） |
| 31 | `<meta name="google-site-verification">` / `baidu-site-verification` / `msvalidate.01` | head/site_verification.pug | 来自 `theme.site_verification[]` | ✅ 三条全对 |
| 32 | `<noscript><style>…</style></noscript>` | head/noscript.pug | 4 条规则原文对齐 | ✅（内容一致；diff 里因 Astro 样式表注入位置产生对齐噪声，见 §5.4） |
| 33 | 首屏 theme bootstrap `<script>` | 对应 head.pug:85 `GLOBAL_CONFIG` 的位置 | 见 §2 | ➕ 新增（Phase 2 必需） |

**`<html lang>`**：按任务要求属于 head 语义，但 Astro 的 `<html>` 只能由布局组件声明，所以由 `BaseLayout` 从同一份 `site.language` 写出（L219），值与 `og:locale` 共用同一个来源，不会漂移。

**本组件明确不输出**（都有归属阶段，理由写进组件头注释）：

- `GLOBAL_CONFIG` / `GLOBAL_CONFIG_SITE` / `inject_head_js` 三段内联脚本 → P4-1；
- `main_css`、fontawesome、snackbar、fancybox 的 `<link>` → P4-1（需要 `plugins.yml` 的 provider→URL 解析层，9 种 CDN provider）；
- pwa.pug（`theme.pwa.enable: false`）→ P5-4；
- analytics ×5 / google_adsense → P5-3；
- `theme.inject.head` → P4-1。

---

## 4. 必答 4：构建输出末尾 5 行

命令：`pnpm --filter blog build`（exit 0）

```text
19:46:14 ✓ Completed in 99ms.

19:46:14 [build] ✓ Completed in 2.35s.
19:46:14 [build] 3 page(s) built in 3.25s
19:46:14 [build] Complete!
```

3 页 = `/index.html`、`/page2/index.html`、`/debug-collection/index.html`。构建告警全部是 Phase 1 已知的（10 条 stylus 配置键提示 + `/img/comment_bg.png` 的 vite WARN），没有新增告警。

---

## 5. 必答 5：diff 结果（改前 / 改后）

命令：`node scripts/diff-html.mjs .baseline-work/public/index.html dist/index.html --verbose`

### 5.1 改动前（P1.5 垂直切片的 dist，本次动手前实测）

```text
FAIL .baseline-work\public\index.html ↔ examples\blog\dist\index.html  66 条差异（结构 57 / 属性 8 / 文本 1），缺口 缺 1058 节点，多 30 节点
  · baseline: 节点 1070，站内 origin https://baseline.anzhiyu.test
  · dist: 节点 42，注释 6，data-astro-* 属性 3，Astro 机制元素 3
```

### 5.2 改动后

```text
FAIL .baseline-work\public\index.html ↔ examples\blog\dist\index.html  103 条差异（结构 91 / 属性 12），缺口 缺 857 节点，多 60 节点
  · baseline: 节点 1070，站内 origin https://baseline.anzhiyu.test
  · dist: 节点 273，站内 origin https://baseline.anzhiyu.test
```

| 指标 | 改前 | 改后 | 变化 |
|---|---:|---:|---|
| **missingNodes（进度指标）** | **1058** | **857** | **−201** |
| unexpectedNodes | 30 | 60 | +30（见 §5.3） |
| diffCount | 66 | 103 | +37（见 §5.3） |
| dist 节点数 | 42 | 273 | +231 |
| 结构差异条数 | 57 | 91 | — |
| 属性差异条数 | 8 | 12 | — |

### 5.3 为什么 diffCount 反而变多（不是退化）

diff 的粒度是「两个能对齐的节点之间逐项比较」：

- 改前 dist 只有 42 个节点，baseline 的 1000+ 个节点基本只能报成 **1 条 node-missing + 子树节点数**，一条差异覆盖一大片；
- 改后骨架对上了，`#body-wrap`/`#nav`/`#content-inner`/`#footer`/`#sidebar`/`#rightside`/`#nav-music`/`#rightMenu`/`#popup-window` 这些都成了「配对节点」，它们的内部缺口不再被折叠成一条，而是按容器逐条报出来 —— 所以**缺失节点数下跌 201，而差异条数上涨**。判进度看 `missingNodes`/dist 节点数，不看 `diffCount`。

`unexpectedNodes` 从 30 → 60 的两个来源：

1. **首页一次渲染 9 篇，baseline 首页只有 6 篇**（Hexo `per_page: 6`）：多出的 3 张卡片整棵子树计入「多 60 节点」；
2. `dist` 独有的 `<script>`（theme bootstrap）、`<html>` 上的 `data-theme` 是 Phase 2 新增的合法节点。

分页 P2-7 做完后第 1 页会回到 6 篇，这一项自然收敛。

### 5.4 剩余 103 条差异按归属阶段分解

| 归属 | 典型差异 | 说明 |
|---|---|---|
| **P4-1 资源层** | `GLOBAL_CONFIG` / `config-diff` / `injectHeadJs` 三段脚本缺失、`/css/index.css`、snackbar/fancybox 的 `<link>`、`media="print" onload` 属性、Hexo generator meta | head.pug 里依赖 `theme.asset`（`plugins.yml`）的部分，Phase 2 不硬编码 CDN URL |
| **P4-2/P4-3 additional-js** | `div[10]` 下 18 个 `<script>` + 2 个 `<link>` + `canvas#universe` + `.js-pjax` 全缺 | 交互层 |
| **P2-4 Header/Footer** | `#nav-group` 内 197 个节点（`#nav-right` 整棵）、`#footer-bar` 内 `#footer-bar-tips`/`#footer-type-tips`/链接 | 占位容器已就位 |
| **P2-5 Sidebar/Rightside** | `#sidebar-menus` 内 7 个块、`#rightside-config-hide/show` 内 5 个 button | 占位容器已就位 |
| **P2-7 首页/分页** | `#home_top` 内 `#bannerGroup`(24)+`.topGroup`(67)、`#categoryBar`(32)、PostCard 内部（cover/tags/excerpt/time_hidden）、`#pagination` | 占位容器已就位 |
| **P3-1 widget** | `#aside-content` 内 3 个卡片 | 占位容器已就位 |
| **Astro 机制差异（无法消除）** | `og:url` 的 `/` vs `/index.html`；Astro 注入的 `/_astro/*.css` 与上游 `/css/index.css` 位置/值不同；`<noscript>` 因样式表注入位置产生的对齐噪声（一多一缺 2 条）；Hexo `generator` meta | 路由模型/框架注入，Phase 7 资产层收敛时再评估 |

---

## 6. 必答 6：`verify-css` 输出

命令：`node scripts/verify-css.mjs`（exit 0）

```text
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\upstream.DeEHpLXK.css
[verify-css] PASS 字节数: 实际 682990 / baseline 683218（-0.03%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78457 / baseline 79124（-0.84%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）：实际 429ff06f63bbfd6852917608d3737c8654d4bfe88571ea4ef2530270c1439175 / baseline 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
[verify-css] 比对通过
```

- 样式入口只有页面里的一次 import（`src/pages/index.astro:21 → ../styles/upstream/index.styl`），**主题包没有复制样式**，产物仍是单文件 682990 B；
- 与 `docs/notes/phases/P1.5-vertical-slice.md` 记的 687869 B 不同：P1.5 之后有 commit `996e21b`（「复刻 Hexo define 层使 CSS 收敛至 -228B」），当前 -228 B 正是那次工作的结果，不是本次改动引入的（本次没有碰 `src/styles/`，`git status` 可证）；
- ClientRouter 的 CSS 增量消失，是因为首页不再用 P1.5 的站点侧 layout（`page2` 仍用它，但那页不参与 verify-css 的取值）。

---

## 7. 必答 7：组件导出方式与 examples/blog 的 import 写法

### 7.1 `packages/astro-theme-anzhiyu/package.json`

```json
"exports": {
  ".": "./src/index.ts",
  "./schema": "./src/config/schema.ts",
  "./defaults": "./src/config/defaults.ts",
  "./components/Head.astro": "./src/components/Head.astro",
  "./components/*": "./src/components/*",
  "./layouts/BaseLayout.astro": "./src/layouts/BaseLayout.astro",
  "./layouts/*": "./src/layouts/*"
}
```

### 7.2 exports 解析已实测可用

用一个临时 junction 把包挂进 `node_modules` 后再跑 `import.meta.resolve`（证明 exports 子路径本身没问题）：

```text
astro-theme-anzhiyu/layouts/BaseLayout.astro -> file:///…/node_modules/astro-theme-anzhiyu/src/layouts/BaseLayout.astro
astro-theme-anzhiyu/components/Head.astro   -> file:///…/node_modules/astro-theme-anzhiyu/src/components/Head.astro
astro-theme-anzhiyu                        -> file:///…/node_modules/astro-theme-anzhiyu/src/index.ts
```

### 7.3 为什么 examples/blog 里实际用的是相对路径

`package.json` **没有声明** `astro-theme-anzhiyu` 依赖，仓库也没有任何包依赖它，所以真实解析直接失败：

```text
$ cd examples/blog; node --input-type=module -e "import.meta.resolve('astro-theme-anzhiyu/layouts/BaseLayout.astro')"
RESOLVE FAILED: ERR_MODULE_NOT_FOUND Cannot find package 'astro-theme-anzhiyu' imported from D:\Git-project\astro-theme-anzhiyu\examples\blog\[eval1]
$ Test-Path examples/blog/node_modules/astro-theme-anzhiyu   → False
$ Test-Path node_modules/astro-theme-anzhiyu                 → False
```

`package.json` 不在本次写范围（写范围只到 `src/pages/index.astro`），所以按任务给的退路用相对路径：

```astro
// src/pages/index.astro:20
import BaseLayout from '../../../../src/layouts/BaseLayout.astro'
import '../styles/upstream/index.styl'
```

**Lead 侧一行修正**（改完即可切回包名写法）：

```powershell
pnpm --filter blog add astro-theme-anzhiyu@workspace:*
# 然后 index.astro:20 换成：
# import BaseLayout from 'astro-theme-anzhiyu/layouts/BaseLayout.astro'
```

行号是对齐的（`src/pages/index.astro` 在 `src/pages/` 下，上四级是仓库根），换成包名时只改这一行即可，其余不用动。

### 7.4 样式为什么在页面里 import 而不是 BaseLayout 里

上游 302 KB Stylus 目前还在 `src/styles/upstream/`（Phase 1 的站点资产，主题包 `src/styles/` 还没建）。主题包组件无法用相对路径去 import 站点目录，所以按任务口径「examples/blog 已 import、别重复引入」——由页面 import 一次，BaseLayout 只负责 DOM。等 Phase 7 把样式搬进主题包时，这个 import 会随之下沉到 `src/layouts/BaseLayout.astro`。

---

## 8. 已知差异与留给后续阶段的坑

1. **`og:url` 的 `/` vs `/index.html`**（1 条属性差异）：Hexo 的 `url` 全局带 `index.html`（`pretty_urls.trailing_index: true`），Astro 的路由模型是目录式。要彻底对齐需要在站点配置层实现 `pretty_urls` 语义（Phase 7），现在不伪造。
2. **Astro 的样式表注入位置固定在 `</head>` 末尾**：baseline 的 `/css/index.css` 在脚本之前，导致 head 里一条 `<link rel=stylesheet>` 位置对不上，并连带 `<noscript>` 出现「一多一缺」的对齐噪声（2 条，不影响节点数统计）。这是 diff 工具的 LCS 对齐 + 框架注入位置共同作用，不是 DOM 写错。后续 P4-1 把三段 head 脚本补齐后，噪声会重新分布。
3. **Hexo generator meta** 无法复刻（`<meta name="generator" content="Hexo 7.3.0">`），Astro 产物的 generator meta 已被 diff 工具按 N12 归一并丢弃。
4. **pace 进度条**（`theme.preloader.source === 3` 的第二段）未做：需要 `plugins.yml` 的 asset URL 解析（P4-1）。`#loading-box` 那张 fullpage loading 已经实做并有脚本保证 10s 内一定 `loaded`，不会挡住首屏。
5. **首页一次性渲染 9 篇**，baseline 首页 6 篇（per_page 6）：分页属 P2-7；P2-7 做完第 1 页应为 6 篇 + `#pagination`。
6. **`src/layouts/BaseLayout.astro`（P1.5 切片）仍然存在**，`/page2/` 与 `/debug-collection/` 还在用它。本次没有删（不在写范围）：P2-4/P2-5/P2-7 迁移完页面后应把这两个页面切到主题包 BaseLayout，再删掉切片 layout 与 `public/slice-harness.js`。
7. **P1.5 的页内 harness 不再适用于首页**：`#nav-page2`/`#shim-page2` 等探针随首页重写被移除，`tests/vertical-slice.mjs` 若按原断言跑首页会失败。它属于 Phase 1.5 的历史证据，Phase 2 的验收应以 `diff-html` +（CI 上）浏览器测试为准。
8. **站点配置层还没有**：`site`（title/subtitle/description/author/url/language）现在是 `index.astro` 里显式传的基准站身份 + `BaseLayout`/`src/layouts/site.ts` 的中性默认值。Phase 7 迁移脚本把 Hexo `_config.yml` 落成站点配置后，页面里的这份常量应删除。
9. **主题配置来源**：`BaseLayout`/`Head` 通过 `src/layouts/theme-context.ts` 调 P1-8 的 `loadThemeConfig()`。`examples/blog` 里没有 `anzhiyu.config.yml`（只有给 stylus 插件用的 `theme.config.yml`，文件名不在 loader 的搜索列表里），所以走完整默认值；`ANZHIYU_THEME_CONFIG` 环境变量可显式指定配置文件。对本次涉及的开关（preloader/aside/home_top/nav_music/footerBar/display_mode）默认值与 `theme.config.yml` 一致，产物判断不受影响。

---

## 9. 并行工作对本次验收的影响（交接注意）

本次运行期间 `git status` 里还有其它组员的未提交改动（`astro.config.mjs` 的 smartypants、`src/utils/date.ts`、`tests/`、`scripts/extract-baseline-html.mjs`、`.github/workflows/ci.yml` 等）。因此：

- 构建/`diff-html`/`verify-css` 的结果反映的是「我改的 + 其它组员当时未提交改动」的合成状态；
- `dist/` 是共享产物目录，多个 agent 同时 build 会互相覆盖。本报告的数字来自最后一次**独占**构建（19:46:14 那次，exit 0）；
- 若后续 diff 数字与本文不一致，先用 `git status` 确认是否有新的并发改动进了树，再重跑 §10 的命令。

---

## 10. 复现命令

```powershell
cd D:\Git-project\astro-theme-anzhiyu

# 1) 构建
pnpm --filter blog build

# 2) 首页结构 diff（进度指标看 missingNodes / dist 节点数）
node scripts/diff-html.mjs .baseline-work/public/index.html dist/index.html --verbose

# 3) 样式基准
node scripts/verify-css.mjs

# 4) 全站批量（只关心首页可加 --filter）
node scripts/diff-html.mjs --all --filter index
```

---

## 11. 最后一段（判定）

**首页已经由真实内容集合渲染出来了**：`src/pages/index.astro` 用 `getCollection('posts')` 取 10 条 fixture、过滤掉 `layout: page` 的 about 页，按 Hexo 的「sticky 降序 → 日期降序」排好 9 篇，每篇输出上游同构的 `div.recent-post-item > .recent-post-info > .recent-post-info-top > a.article-title` + `.article-meta-wrap > .post-meta-date > time[datetime]`，日期时区按 P2-1 的 `Asia/Shanghai` 语义格式化，`datetime` 与 baseline 逐篇一致；`BaseLayout` 把 layout.pug 的 26 个直接挂载点全部复刻成真实 DOM（`#web_bg` / `#an_music_bg` / `#loading-box` / `#body-wrap.page` / `#page-header` / `#nav` / `#blog-container` / `#home_top` / `#content-inner.layout` / `#aside-content` / `#footer` / `#footer-wrap` / `#footer-bar` / `#sidebar` / `#rightside` / `#nav-music` / `#rightMenu` / `#rightmenu-mask` / additional-js wrapper / `#popup-window`），`html[data-theme]` 用「静态 `display_mode` + 首屏同步 bootstrap（localStorage `saveToLocal` 格式 → 系统偏好 → 默认）」两层保证首帧不透明，`Head` 输出了 head.pug 的 32 条 meta/link（charset…站长验证 + `noscript`）且与 baseline 逐条对上（唯一属性差异是 `og:url` 的路由模型差异）。

**骨架缺口还剩 857 个节点（改前 1058，减少 201）**，且缺口的归属已经全部落到明确的后续任务上：P2-4 Header/Footer（最大头，`#nav-right` 一棵 197 节点）、P2-7 首页/分页（`#home_top` 91 + `#categoryBar` 32 + PostCard 内部）、P2-5 Sidebar/Rightside（约 20）、P3-1 widget（3 个卡片）、P4-1/P4-2 资源与脚本（head 三段脚本 + additional-js 的 20 个节点）。本次任务的两个交付物（`BaseLayout.astro`、`Head.astro`）按「容器 tag/id/class 必须对、内容可占位」的口径已经完整成立，后续任务只需要在已就位的容器里填内容，不需要再改骨架结构。
