# P2-4 / P2-5 · Header / Footer + Sidebar / Rightside

- 执行人：`p24-layout`（组员 agent-23）
- 时间：2026-11-23 19:49–20:10（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（基线 HEAD `0e4b824`；本次改动全部为未提交改动）
- 上游只读基准：`D:\Git-project\_research\anzhiyu-upstream`（`layout/includes/header/*`、`footer.pug`、`sidebar.pug`、`rightside.pug`）
- 验收基准：`.baseline-work/public/`（Hexo 7.3.0 + 上游 1.7.1 的 48 页产物）；`.baseline-html/` 由 `pnpm baseline:extract` 展开
- 环境：Node **v24.22.0** · pnpm **10.29.3** · astro **7.4.13**

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| `pnpm --filter blog build` | ✅ exit 0，**40 page(s)**（本次开工时 3 页；40 页是并行 P2-7/P2-9/P2-10 的页面也进来了） | §5 |
| nav / footer / sidebar / rightside 是否真实渲染 | ✅ 四个组件已替换占位容器，DOM 与 baseline **逐节点一致**（只有 `#console` 与外部链接属性两类已知差异） | §3、§6 |
| 首页 missingNodes | ✅ **857 → 698**（隔离归因，−159）；集成态（含并行改动，20:08 实测）**480** | §3.2 |
| 首页 diffCount | 103 → **91**（隔离归因）；集成态 **54** | §3.2 |
| 四个组件区域缺口 | nav `#nav-group` **207 → 180**（剩 `#console`）；footer `8 → 0`；sidebar `114 → 0`；rightside `10 → 0` | §3.3 |
| 文章页 | ⚠️ 主仓库**还没有文章页路由**（P2-8 未落）→ diff 只报 file-missing；用隔离环境的最小文章页验证了组件的 `post` 分支（`post-bg`、`#readmode`、`#mobile-toc-button`），**rightside 0 差异** | §3.4 |
| PASS 页数（48 页全量） | 0 → **0**（不是退化：本阶段每个页面都还有 P3-1 widget / P4-1 资源 / P4-2 脚本的缺口；判进度看缺口节点，见 P2-2-3 报告 §5.3） | §3.5 |
| `verify-css` | ✅ PASS（字节 −0.03%，gzip −0.84%） | §5 |
| 是否碰到写范围外文件 | ✅ 没有（只改了 `components/layout/`、`BaseLayout.astro`、本报告） | §7.1 |

### 改动清单（全部在写范围内）

| 文件 | 行数 | 说明 |
|---|---:|---|
| `src/components/layout/Header.astro` | 285 | `header/index.pug` + `header/nav.pug` |
| `src/components/layout/Footer.astro` | 253 | `footer.pug` |
| `src/components/layout/Sidebar.astro` | 152 | `sidebar.pug` |
| `src/components/layout/Rightside.astro` | 115 | `rightside.pug` 的 `#rightside` 容器与顺序逻辑 |
| `src/components/layout/RightsideItem.astro` | 103 | `rightside.pug` 的 `mixin rightsideItem` 单分支 |
| `src/components/layout/MenuItems.astro` | 117 | `header/menu_item.pug`（Header 与 Sidebar 共用） |
| `src/components/layout/lazyload.ts` | 56 | 复刻 Hexo `post_lazyload.js` 的 img 改写形态（2 处调用） |
| `src/layouts/BaseLayout.astro` | 476 → 491 | 占位容器换成四个组件；新增站点数据段（sidebar 计数/标签云） |

---

## 1. 必答 1：四个组件各自复刻了哪些 ID / class

下面的 ID/class 清单是从**真实产物**里抓出来的（脚本见 §8，命令 `node $env:TEMP/inv2.cjs examples/blog/dist/archives/index.html`），不是从源码抄的。完整输出：

```text
### HEADER
  ids: page-header, nav, nav-group, blog_name, site-name, name-container, page-name, menus,
       nav-right, randomPost_button, center-console, nav-totop, percent, toggle-menu
  classes: not-top-img, title, anzhiyufont, anzhiyu-icon-house-chimney, mask-name-container,
           nav-button, site-page, anzhiyu-icon-dice, widget, left, center, right, totopbtn,
           anzhiyu-icon-arrow-up, anzhiyu-icon-bars
### FOOTER
  ids: footer, footer-wrap, footer-bar, footer-bar-tips, footer-type-tips
  classes: footer-bar-links, footer-bar-left, copyright, footer-bar-link, footer-bar-right
### SIDEBAR
  ids: sidebar, menu-mask, sidebar-menus
  classes: sidebar-site-data, site-data, is-center, headline, length-num,
           sidebar-menu-item-title, sidebar-menu-item, darkmode_switchbutton, menu-child,
           anzhiyufont, anzhiyu-icon-circle-half-stroke, back-menu-list-groups,
           back-menu-list-group, back-menu-list-title, back-menu-list, back-menu-item,
           back-menu-item-icon, back-menu-item-text, card-tags, item-headline, card-tag-cloud
### RIGHTSIDE
  ids: rightside, rightside-config-hide, translateLink, darkmode, hide-aside-btn,
       rightside-config-show, rightside-config, go-up
  classes: anzhiyufont, anzhiyu-icon-circle-half-stroke, anzhiyu-icon-arrows-left-right,
           anzhiyu-icon-gear, anzhiyu-icon-arrow-up
```

文章页（`pageType="post"`）多出来的部分（隔离环境探针实测）：

```text
### HEADER   class: post-bg（代替 not-top-img）
### RIGHTSIDE ids: …, readmode, …, mobile-toc-button（class="close"）, …
```

### 1.1 Header.astro（对应 `header/index.pug` + `header/nav.pug`）

| 上游节点 | 组件里的实做 | 条件 / 备注 |
|---|---|---|
| `header#page-header[class][style]` | ✅ `page-header` | class 四分支：`not-top-img` / `full_page`（首页有图）/ `not-home-page`（非首页有图）/ `post-bg`（文章有图）；style 仅首页有 `index_img` 时 = 该配置串 |
| `nav#nav > #nav-group` | ✅ | 层级不变（`#nav` 是 CSS/JS 锚点，不能挪） |
| `span#blog_name` | ✅ | 内含恰好一个直接 `<a>`（`a#site-name`）——JS 用 `#blog_name > a` 量宽度，见 §6 |
| `a#site-name[accesskey=h] > .title + i.anzhiyu-icon-house-chimney` | ✅ | `.title` 文本 = `config.title`（site.title） |
| `.back-home-button > i + .back-menu-list-groups` | ✅ | 仅 `theme.nav.enable: true`；组/项来自 `theme.nav.menu`（基准站 false，不渲染） |
| `.mask-name-container > #name-container > a#page-name` | ✅ | 文本固定 `PAGE_NAME`，真名由 JS 写（§6） |
| `#menus` | ✅ | 内容 = `MenuItems.astro`（`theme.menu`，基准站 null → 空 div，与 baseline 一致） |
| `#nav-right` | ✅ | 见下 |
| `.nav-button.only-home#travellings_button` | ✅ | `theme.nav.travelling` |
| `.nav-button#randomPost_button > a.site-page > i.anzhiyu-icon-dice` | ✅ | 常驻 |
| `.nav-button#search-button > a.site-page.social-icon.search` | ✅ | 三套搜索任一 enable（基准站全关） |
| `input#center-console[type=checkbox]` + `label.widget[for] > i.left + i.widget.center + i.widget.right` | ✅ | `theme.centerConsole.enable` |
| `.nav-button#nav-totop > a.totopbtn > i + span#percent` | ✅ | `#percent` 文本由 JS 写（§6） |
| `#toggle-menu > a.site-page > i.anzhiyu-icon-bars` | ✅ | 移动端抽屉开关 |
| `#site-info`（首页有 top_img） | ✅ | `h1#site-title` + `#site-subtitle > span#subtitle` + `#site_social_icons`（`theme.social`）+ `#scroll-down > i.anzhiyu-icon-angle-down.scroll-down-effects` |
| `#page-site-info`（其它页有 top_img） | ✅ | `h1#site-title` |
| 文章页 `#post-info` + 波浪 + `#post-top-cover` | ⏳ **P2-8** | Header 里留 `<slot name="post-info" />`；`BaseLayout` 用 `<slot name="post-info" slot="post-info" />` 转发。**已实测转发生效**（见 §3.4 注） |
| `#console`（nav.pug:50 的 include） | ⏳ **P4-6** | 见 §4「为什么不放空壳」 |

### 1.2 Footer.astro（对应 `footer.pug`）

| 上游节点 | 状态 | 条件 |
|---|---|---|
| `footer#footer[style]` | ✅ | style 来自 `layout.pug:51-58` 的 `footer_bg` 三支（false / true→bg_img / 字符串） |
| `#footer-wrap` | ✅ | 基准站里它是**空 div**（socialBar/runtime/list/bdageitem 全关、footerBar 开着所以 `owner` 版权也不在这），与 baseline 一致 |
| `#footer_deal > a.deal_link… + img.footer_mini_logo` | ✅ | `footer.socialBar`（含左右图标三种写法、中间头像回顶） |
| `.copyright`（`#footer-wrap` 内） | ✅ | `footer.owner.enable && !footerBar.enable` |
| `#workboard > img.workSituationImg.boardsign + #runtimeTextTip` | ✅ | `footer.runtime.enable` |
| `.footer_custom_text` | ✅ | `footer.custom_text`，`set:html` |
| `#anzhiyu-footer`（`.footer-group/.footer-title/.footer-links/a.footer-item`） | ✅ | `footer.list.enable` |
| `.footer-group > .footer-title-group > .footer-title + a#footer-random-friends-btn` + `#friend-links-in-footer` | ✅ | `footer.list.randomFriends > 0` |
| `p#ghbdages > a.github-badge > img` | ✅ | `footer.bdageitem.enable` |
| `#footer-bar > .footer-bar-links > .footer-bar-left` | ✅ | `footerBar.enable` |
| `#footer-bar-tips > .copyright`（`©since - year By` + `a.footer-bar-link[target=_blank]`） | ✅ | `footer.owner.enable`；`authorLink` 缺省回退 `config.url` |
| `#footer-type-tips` | ✅（空容器） | 内容由打字机脚本填 |
| `.js-pjax`（`footerBarSubtitle.pug` 打字机） | ⏳ **P4-1** | 要 Typed.js / 一言 / 今日诗词 + `getScript`，属资源层 |
| `.footer-bar-right > a.footer-bar-link` + `a.footer-bar-link.cc > 4×i` | ✅ | `footerBar.linkList`、`footerBar.cc` |

### 1.3 Sidebar.astro（对应 `sidebar.pug`）

| 上游节点 | 状态 | 条件 |
|---|---|---|
| `#sidebar > #menu-mask + #sidebar-menus` | ✅ | 层级不变（JS 靠 `#menu-mask` 关闭抽屉） |
| `.sidebar-site-data.site-data.is-center > a×3 (.headline + .length-num)` | ✅ | `sidebar.site_data.{archive,tag,category}`；计数来自内容集合（§2.2） |
| `span.sidebar-menu-item-title`（功能）+ `.sidebar-menu-item > a.darkmode_switchbutton.menu-child > i + span` | ✅ | `sidebar.display_mode` |
| `.back-menu-list-groups > .back-menu-list-group > .back-menu-list-title + .back-menu-list > a.back-menu-item > img.back-menu-item-icon + span.back-menu-item-text` | ✅ | `sidebar.nav_menu_project`，数据 `theme.nav.menu` |
| `.menus_items`（= MenuItems.astro） | ✅ | `sidebar.menus_items`，数据 `theme.menu`（基准站 null → 不渲染 `.menus_items`） |
| `span.sidebar-menu-item-title`（标签）+ `.card-tags > .item-headline + .card-tag-cloud` + `hr` | ✅ | `sidebar.tags_cloud` && `aside.card_tags.enable` && 有标签；云内容由 `cloudTags()` 生成（**71 节点与 baseline 一致**） |

### 1.4 Rightside.astro / RightsideItem.astro（对应 `rightside.pug`）

| 上游节点 | 状态 | 条件 |
|---|---|---|
| `#rightside > #rightside-config-hide` | ✅ | **必须是 `#rightside` 的第一个子元素**（JS 用 `firstElementChild`，§6） |
| `button#readmode > i.anzhiyu-icon-book-open` | ✅ | `is_post() && theme.readmode` |
| `button#translateLink`（文本 `translate.default`） | ✅ | `translate.enable` |
| `button#darkmode > i.anzhiyu-icon-circle-half-stroke` | ✅ | `darkmode.enable && darkmode.button` |
| `button#hide-aside-btn > i.anzhiyu-icon-arrows-left-right` | ✅ | `aside.enable && aside.button && page.aside !== false` |
| `#rightside-config-show > button#rightside-config > i.anzhiyu-icon-gear` | ✅ | 两支条件照抄（`rightside_item_order.enable` 与否） |
| `button#mobile-toc-button.close > i.anzhiyu-icon-list-ul` | ✅ | `showToc`（BaseLayout 的 `showToc` prop，P2-8 传入） |
| `button#chat-btn` | ✅ | `chat_btn && (chatra\|tidio\|daovoice\|crisp)` |
| `a#to_comment` / `a#switch-commentBarrage` | ✅ | `commentsLoaded` / `comment_barrage_config.enable` |
| `button#go-up > i.anzhiyu-icon-arrow-up` | ✅ | 常驻 |
| 顺序语义 | ✅ | `rightside_item_order.enable:false` → 写死 `hide=[readmode,translate,darkmode,hideAside]`、`show=[toc,chat,comment]`；enable:true 时按配置逗号分隔顺序渲染（`RightsideItem` 逐项 case） |

### 1.5 明确没做（都有归属）

| 上游 | 归属 | 原因 |
|---|---|---|
| `#console` 中控台面板（nav.pug:50，baseline 180 节点） | **P4-6** | 静态面板含最新评论/标签云/归档/赞赏二维码，且开关与副作用都归交互阶段；`input#center-console` + `label.widget` 已在位，`#console` 要作为 `#nav-right` 的**直接子元素**追加（CSS `#center-console:checked ~ #console`） |
| `theme.nav.clock`（和风天气 widget） | P4-1 | 外部 css/js（`widget.qweather.net`） |
| 搜索弹层本体 | P4-8 | 只出了 `#search-button` 入口 |
| `#post-info`/波浪/`#post-top-cover` | P2-8 | slot 已就位 |
| footerBar 打字机 `.js-pjax` | P4-1 | Typed.js + 外部 API |
| 三套搜索 / 评论 / 赞赏 等第三方 | P2-8 / P5 | 与本次无关 |

---

## 2. 必答 2：菜单 / 社交 / 侧栏数据从哪来

### 2.1 主题配置键 → DOM 的映射（全部来自 `theme-context.ts` 的 `getThemeConfig()`）

| DOM 位置 | 数据源（主题配置键） | 基准站取值 | 处理函数 |
|---|---|---|---|
| `#menus` / `.menus_items` | `theme.menu`（**顶层**菜单，非 `nav.menu`） | `null` → 空 | `MenuItems.astro`：`url \|\| icon \|\| animation` 三段解析；leaf / 下拉两种形态；图标三分支（fa→i、icon→svg/use、anzhiyu→i.anzhiyufont+`font-size:.9em`），动画默认 `faa-tada` |
| `.back-home-button` + sidebar `.back-menu-list-groups` | `theme.nav.menu[]`（`{title, item:[{name, link, icon}]}`） | 2 组 × 1 项 | nav: 仅 `nav.enable`；sidebar: 仅 `sidebar.nav_menu_project` |
| 导航展开方式 | `theme.nav.enable` / `theme.nav.travelling` / `theme.nav.clock` | false / false / false | `Header.astro` |
| `#site_social_icons` 社交图标 | `theme.social`（`title: "link \|\| icon \|\| anima"`） | `null` → 不渲染 | 只在首页有 top_img 时出现（基准站不出现） |
| `#nav-right` 中控台开关 | `theme.centerConsole.enable` | true | `readFlag` |
| `#search-button` | `theme.algolia_search.enable \|\| theme.local_search.enable \|\| theme.docsearch.enable` | 全 false | — |
| i18n 文案 | `src/i18n`（`tp(key, site.language)`） | 语言 `zh-CN` | 键：`nav.travelling`、`nav.random_post`、`nav.search`、`nav.toggle_menu`、`console.title`、`search.title`、`footer.back_to_top`、`footer.friend_links`、`footer.refresh_friends`、`footer.cc_license`、`aside.articles`、`aside.tags`、`aside.categories`、`aside.function`、`aside.display_mode`、`rightside.{readmode_title,translate_title,night_mode_title,aside,toc,chat,scroll_to_comment,setting,back_to_top}` |
| footer 版权 | `theme.footer.owner.{enable,since}` + `footer.footerBar.{enable,authorLink}` + `site.author` / `site.url` | enable=true / since=2020 / footerBar=true | 年份用构建期 `new Date().getFullYear()`（baseline 也是 2026） |
| footer 右侧链接 / CC | `theme.footer.footerBar.linkList[]`、`.cc.{enable,link}` | 1 条“主题” / cc 关闭 | — |
| footer 社交栏 | `theme.footer.socialBar.{enable,centerImg,left,right}` + `theme.avatar.img` | 关闭 | 三分支图标（footer 版本没有 animation 类） |
| footer 摸鱼 board / 自定义文本 / 项目组 / 徽标 | `theme.footer.runtime.*` / `.custom_text` / `.list.*` / `.bdageitem.*` | 全关 | — |
| footer 背景 | `theme.footer_bg`（+ 页面 top_img） | false | — |
| sidebar 三块开关 | `theme.sidebar.{site_data,display_mode,nav_menu_project,menus_items,tags_cloud}` | 全 true | — |
| sidebar 标签云 | `theme.aside.card_tags.{enable,limit,color,highlightTags}` + `cloudTags()` | limit 40 / color false | `minfontsize=maxfontsize=0.875`、`unit:'rem'` → `font-size: 0.88rem;`（与 baseline 逐字节一致） |
| rightside 顺序 | `theme.rightside_item_order.{enable,hide,show}` | enable=false → 默认数组 | `Rightside.astro` |
| rightside 显隐 | `theme.readmode`、`theme.translate.{enable,default}`、`theme.darkmode.{enable,button}`、`theme.aside.{enable,button}`、`theme.chat_btn`+4 个 chat 插件、`theme.comment_barrage_config.enable` | 见 §1.4 | — |
| `pageType` / `aside` / `showToc` / `commentsLoaded` | BaseLayout props（页面数据） | page / undefined / false / false | 文章页由 P2-8 传 |

### 2.2 「站点数据」不是主题配置：来自内容集合

上游 `sidebar.pug` 用的是 Hexo 的**站点全局变量**（不是 `theme.*`）：

```pug
.length-num= site.posts.length      // 文章数（不含 layout: page 的独立页）
.length-num= site.tags.length       // 标签种类数
.length-num= site.categories.length // 分类节点数
.card-tag-cloud!= cloudTags({source: site.tags, …})
```

`BaseLayout.astro` 新增一段（L127-180）从内容集合 `posts` 现算：

```ts
const collectionEntries = await getCollection('posts')
const posts = collectionEntries.filter((entry) => entry.data.layout !== 'page')
// tags：Map<名称, 出现文章数>；categories：递归摊平嵌套分类后 Set 去重
const sidebarTags = [...tagCounts.entries()].map(([name, length]) => ({
  name, path: `tags/${encodeURIComponent(name)}/`, length,
}))
```

实测产物（与 baseline 一致）：

```html
<div class="sidebar-site-data site-data is-center">
  <a href="/archives/" title="archive"><div class="headline">文章</div><div class="length-num">9</div></a>
  <a href="/tags/" title="tag"><div class="headline">标签</div><div class="length-num">17</div></a>
  <a href="/categories/" title="category"><div class="headline">分类</div><div class="length-num">7</div></a>
</div>
```

标签云的 URL 用 `encodeURIComponent`（`tag插件` → `/tags/tag%E6%8F%92%E4%BB%B6/`），与 Hexo 的 `url_for(tag.path)` 一致；`hr` 是 `.card-tags` 的兄弟节点（对应 sidebar.pug 的缩进）。

**两个已知取舍**（Phase 7 处理，DOM 不变）：
1. `archive_dir / tag_dir / category_dir` 在 Hexo 是**站点配置**，本仓库还没有站点配置层 → `Sidebar.astro` 里先写成 `archives/tags/categories` 常量（基准站就是默认值）。
2. 「主题布局直接 `getCollection('posts')`」是 P2-5 引入的临时耦合：Phase 7 站点配置层落地后，应改成站点向布局注入 site 数据（或主题导出 data adapter），Sidebar 的 props（`postCount/tagCount/categoryCount/tags`）不用动。

### 2.3 页面侧调用（BaseLayout → 组件）

```astro
<Header site={site} isHome={isHome} pageType={pageType} topImg={topImg} siteTitle={title}>
  <slot name="post-info" slot="post-info" />
</Header>
…
<Footer site={site} topImg={topImg} />
<Sidebar site={site} postCount={posts.length} tagCount={tagCounts.size}
         categoryCount={categoryNames.size} tags={sidebarTags} />
<Rightside site={site} pageType={pageType} aside={aside} showToc={showToc} commentsLoaded={commentsLoaded} />
```

`BaseLayout` 新增 4 个 props：`topImg?: string | false`、`showToc?: boolean`、`commentsLoaded?: boolean`（`siteTitle` 复用已有的 `title`）。**P2-8 只需要传 `topImg`（`page.top_img || page.cover || page.randomcover`）和 `showToc`**，其余 DOM 不用碰。

---

## 3. 必答 3：diff 前后（PASS 页数 / 缺口节点数 / diffCount）

> 并发说明：本次执行期间 P2-7（首页）、P2-9/P2-10（归档/分类/标签/404）在同一个工作区并行改文件，
> `examples/blog/dist/` 是共享产物。为了给出**只归因于本次改动**的数字，除了集成态测量外，
> 还做了一个隔离快照：`git archive HEAD` → `D:\Git-project\_p24-verify`（HEAD 的页面 + junction 到主仓库的
> `node_modules`），先量「改前」，再把本次 7 个新文件 + `BaseLayout.astro` 叠上去量「改后」。
> 两份测量用同一个 `scripts/diff-html.mjs`、同一份 baseline。

### 3.1 隔离快照：首页（只归因本次改动）

命令：`node scripts/diff-html.mjs .baseline-work/public/index.html <快照>/examples/blog/dist/index.html`

| 指标 | 改前（HEAD 页面骨架） | 改后（+ 本次组件） | 变化 |
|---|---:|---:|---:|
| status | FAIL | FAIL | — |
| **missingNodes** | **857** | **698** | **−159** |
| unexpectedNodes | 60 | 60 | 0（组件没有引入任何多余节点） |
| **diffCount** | **103** | **91** | −12 |
| 差异分类 | 结构 91 / 属性 12 | 结构 73 / 属性 18 | 结构 −18，属性 +6 |

diff 集合的逐条对账（脚本比较改前/改后的 `kind|path` 集合）：

- **删除 19 条**（都是占位容器造成的整块缺失）：
  `#nav-group/span#blog_name`、`#nav-group/div[1]`（mask-name）、`#nav-group/div#menus`、`#nav-group/div#nav-right`、
  `#footer-bar-tips`、`#footer-type-tips`、`.footer-bar-right > a`、
  `#sidebar-menus` 下 7 条（site_data / 功能 / menu-item / back-menu / 标签 / card-tags / hr）、
  `#rightside-hide/show` 下 5 条 button
- **新增 7 条**：`#console`（180 节点，→ P4-6）+ 6 条外部链接 `target/rel` 属性（→ Phase 7 站点层 `external_link` 过滤）
- **其它 84 条与改前完全相同**（首页卡片、`#home_top`、`#aside-content`、head 脚本、additional-js 等，都不是本次的活）

### 3.2 隔离快照：组件区域缺口逐项对账

| 区域 | 改前缺失节点 | 改后缺失节点 | 说明 |
|---|---:|---:|---|
| nav（`#nav-group` 整棵） | **207** | **180** | 剩 `#console`（180）→ P4-6 |
| footer（`#footer-bar` 整棵） | **8** | **0** | 版权 + 主题链接全出 |
| sidebar（`#sidebar-menus` 整棵） | **114** | **0** | site_data(16) + 功能(2+5) + back-menu(17) + 标签(2+71) + hr(1) |
| rightside（`#rightside` 整棵） | **10** | **0** | 5 个 button × 2 节点 |
| **合计** | **339** | **180** | **−159**，与首页 missingNodes 差值完全吻合 |

即：**四条占位容器里除了 `#console` 之外的 DOM 全部与 baseline 对齐，一个有 id 的节点都没错。**

### 3.3 集成态（主仓库当前工作区：本次 + 并行 P2-7/P2-9/P2-10；20:08 构建后实测）

> 并行任务还在往这个工作区落代码，**这些数字会继续变**；组件区域那两行才是本次交付的稳定部分。

| 页面 | status | diffCount | missingNodes | unexpectedNodes |
|---|---|---:|---:|---:|
| `/`（首页） | FAIL | **54** | **480** | 5 |
| `/page/2/` | FAIL | 47 | 388 | 5 |
| `/archives/` | FAIL | 46 | 386 | 5 |
| `/tags/Astro/` | FAIL | 46 | 386 | 5 |
| `/categories/生活/` | FAIL | 46 | 386 | 5 |
| `/404.html` | FAIL | 41 | 220 | 5 |
| `/2024/11/01/longform-hexo-astro/` | FAIL | 1 | 0 | 0（**file-missing**：dist 还没有文章页路由 → P2-8） |

全量（`node scripts/diff-html.mjs --all`）：**48 页 / PASS 0 / FAIL 48 / 差异共 1762 条 / 缺 14598 / 多 190**，
其中 10 页是 file-missing（9 篇文章 + `/about/`，→ P2-8 / P3）。

四个组件区域在**全部已有 dist 的 38 页**上的合计（`--all --json` 聚合）：

```text
全站 4 个组件区域：差异条数 = 264
  node-missing nav-console : 38 页 × 180 = 6840 节点     ← P4-6
  attr-missing footer      : 37 页 × 2  = 74 条属性      ← external_link（Phase 7 站点层）
  attr-missing sidebar     : 38 页 × 4  = 152 条属性     ← external_link（Phase 7 站点层）
（footer 只有 37 页：404 页没有 footer；sidebar 38 页：38 = 已有 dist 的页数）
```

### 3.4 文章页（当前 dist 缺路由 → 用隔离探针验证 post 分支）

主仓库没有 `post/[...slug]` 路由（P2-8 未落），`--all` 对 9 篇文章只报 `file-missing`。
为验证组件的 `post` 分支，在隔离快照里建了一个**最小文章页**（`src/pages/[...slug].astro`，
只接 BaseLayout、不渲染正文/PostInfo，故意留出 P2-8 的缺口），路由与 baseline 相同：

```text
post probe: status=FAIL diffCount=54 missingNodes=982 unexpectedNodes=5
```

组件区域内的差异**只有**（其它全是 P2-8 的正文区块与 head）：

```text
node-missing  nav#nav/#nav-right/div#console             w=180   ← P4-6
node-missing  header#page-header/div#post-info           w=52    ← P2-8
node-missing  header#page-header/section（波浪）          w=9     ← P2-8
node-missing  header#page-header/div#post-top-cover      w=2     ← P2-8
attr-missing  footer .footer-bar-right > a ×2 / sidebar back-menu a ×4  ← external_link
```

关键结论（逐项核对过 baseline 文章页）：

- `#page-header` class = **`post-bg`** ✅
- `#rightside-config-hide`：`#readmode` → `#translateLink` → `#darkmode` → `#hide-aside-btn` ✅
- `#rightside-config-show`：`#rightside-config` → `#mobile-toc-button.close` → `#go-up` ✅（**rightside 0 差异**）
- footer / sidebar / nav 与首页完全同构 ✅
- `post-info` 插槽转发**实测生效**：临时在探针页塞 `<Fragment slot="post-info">`，产物里它出现在
  `</nav>` 之后、`</header>` 之前（= 上游 `header/index.pug:27-31` 的位置）；验证完已移除。

### 3.5 PASS 页数

| 时点 | PASS | 说明 |
|---|---:|---|
| 改前（本次开工，主仓库 3 页 dist） | 0 / 48 | 47 页 file-missing |
| 改后（主仓库 40 页 dist） | 0 / 48 | 缺口集中：`#console`(P4-6)、`#aside-content`(P3-1)、head 资源(P4-1)、additional-js(P4-2/3)、首页 banner/topGroup(P2-7)、文章页(P2-8) |

**PASS 仍是 0 不代表这次没进展**：P2-2-3 报告 §5.3 已解释过——本阶段的验收口径是
「`missingNodes` 单调下降 + 容器层级/ID 对齐」，PASS 要等 P3-1/P4 那几层补齐。本次把四个组件区域的
339 → 180，且没有引入意外节点。

---

## 4. 必答 4：剩余差异分类（缺什么、归哪个后续任务）

### 4.1 与本次四个组件直接相关的（只有两类）

| 差异 | 数量（单页） | 分类 | 归属 | 说明 |
|---|---:|---|---|---|
| `#console` 子树 | 180 节点 | **属后续阶段（静态面板 + 交互）** | **P4-6** | 为什么不在 P2-4 放一个空壳：空壳会让 diff 从「console 一缺(180)」变成「console 四个子块各缺一次」→ diffCount +3 而 missingNodes 不变；`#console` 的静态内容依赖最新评论/标签云/归档/赞赏配置，且开关与副作用都归 P4-6。挂载点已写死在 `Header.astro` 注释：必须是 `#nav-right` 的直接子元素（CSS `#center-console:checked ~ #console`） |
| 外链的 `target="_blank" rel="noopener"` | 6 条属性/页（footer 2 + sidebar 4） | **属于后续阶段（站点级后处理）** | Phase 7 站点配置层 | 不是 pug 写的，是 Hexo 站点配置 `external_link: {enable: true, field: 'site'}` 的 `after_render:html` 过滤器加的（`hexo/dist/plugins/filter/after_render/external_link.js`）。主题组件里硬编码会违反配置语义；按 §6 契约应该在站点层做 |

### 4.2 页面其余缺口（不是 P2-4/P2-5 的锅，逐类列出便于 Lead 分配）

| 类别 | 首页典型节点 | 归属 |
|---|---|---|
| **缺数据/内容渲染** | `#home_top/#bannerGroup`(24)、`#topGroup`(67)、`#categoryBar` 内的 `#catalog-list` 条目、PostCard 的 tags/摘要文本、`#pagination` 属性 | **P2-7**（进行中） |
| **缺交互 JS** | `div[10]`（additional-js 挂载点）下 18 个 `<script>` + 2 个 `<link>` + `canvas#universe` + `.js-pjax` | **P4-2 / P4-3** |
| **缺资源层** | head 的 `GLOBAL_CONFIG` / `config-diff` / `injectHeadJs` 脚本、`/css/index.css`、snackbar/fancybox `<link>`、`<meta name="generator">`、body 的 pace 进度条；`#nav` 的可见性还依赖 JS 加 `.show`（§6） | **P4-1** |
| **缺 widget 卡片** | `#aside-content` 的 3 个块（作者卡 6 + 微信卡 5 + 其余 155） | **P3-1** |
| **缺布局/内容** | 文章页整页（PostInfo/正文/版权/打赏/ptool）、归档列表条目、分类/标签页卡片、404 的 error-box | **P2-8 / P2-9 / P2-10** |
| **无法消除的框架差异** | `og:url` 的 `/` vs `/index.html`、Astro 注入的 `/_astro/*.css` 与上游 `/css/index.css` 位置不同、`<noscript>` 对齐噪声 | P2-2-3 报告 §8 已登记 |

---

## 5. 必答 5：build / verify 输出

### 5.1 `pnpm --filter blog build`（exit 0）

```text
20:05:18 ✓ Completed in 403ms.

20:05:18 [build] ✓ Completed in 2.77s.
20:05:18 [build] 40 page(s) built in 3.76s
20:05:18 [build] Complete!
```

40 页 = 首页 + `/page/2/` + `/debug-collection/` + `/page2/` + 404 + 归档 9 + 分类 7 + 标签 17（本次开工时是 3 页；
多出来的是并行 P2-7/P2-9/P2-10 的页面）。构建告警仍是 Phase 1 已知的 10 条 stylus 配置键提示 + `/img/comment_bg.png`
的 vite WARN，**没有新增告警**（我这次只加了 `.astro`/`.ts`，没动样式与资源）。

### 5.2 `node scripts/verify-css.mjs`（exit 0）

```text
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\upstream.DeEHpLXK.css
[verify-css] PASS 字节数: 实际 682990 / baseline 683218（-0.03%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78457 / baseline 79124（-0.84%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）：实际 429ff06f… / baseline 7c1b1ec0…
[verify-css] 比对通过
```

与 P2-2-3 报告数字完全相同（本次没有改任何样式/资源）。

### 5.3 隔离快照的构建（用于 §3.1/§3.2 的归因测量）

```powershell
git -C D:\Git-project\astro-theme-anzhiyu archive --format=tar HEAD -o $env:TEMP\p24-head.tar
tar -xf $env:TEMP\p24-head.tar -C D:\Git-project\_p24-verify
# 两个 junction，避免复制 1GB node_modules：
New-Item -ItemType Junction D:\Git-project\_p24-verify\node_modules -Target D:\Git-project\astro-theme-anzhiyu\node_modules
New-Item -ItemType Junction D:\Git-project\_p24-verify\examples\blog\node_modules -Target D:\Git-project\astro-theme-anzhiyu\examples\blog\node_modules
cd D:\Git-project\_p24-verify\examples\blog
node D:\Git-project\_p24-verify\node_modules\astro\bin\astro.mjs build
```

---

## 6. 必答 6：Phase 4 需要注意的运行时契约（本次实测/读上游 JS 得到）

> 都是从上游 `source/js/main.js` / `utils.js` 里读出来的**选择器契约**，Phase 4 移植脚本时逐条对。

### 6.1 nav

| 契约 | 上游代码 | 后果 |
|---|---|---|
| `#nav` 的可见性靠 JS 加 class | `main.js:189` `$nav.classList.add("show")`；`adjustMenu` 里 `$nav.classList.toggle("hide-menu", …)` | 静态 HTML 里 `#nav` 默认不可见（CSS opacity 0）。**没有 P4 脚本时导航是「隐形但存在」的**（HTML diff 发现不了，像素 diff 会发现）；noscript 里另有 `#nav{opacity:1}` |
| `#blog_name` 必须有**恰好一个直接 `<a>` 子元素** | `main.js:169` `document.querySelector("#blog_name > a").children` | 我给 `#blog_name` 里放了 `.back-home-button`(div) + `a#site-name`，满足；**不要**把 `a#site-name` 再包一层 |
| `#menus` 直接子元素被量宽度 | `main.js:170` `document.getElementById("menus").children` | `#menus` 必须存在（哪怕空），本次保留 |
| `#page-name` 文本由 JS 写 | `main.js:1825` `document.getElementById("page-name").innerText = document.title.split(' \| '+configTitle)[0]` | 静态文本 `PAGE_NAME` 会被替换；`#name-container` / `.mask-name-container` 是它的容器，class 名不能改 |
| `#nav-totop` / `#percent` | `main.js:528-565`；`$navTotop.classList.add("long")`、`$percentBtn.textContent = percentage / "返回顶部"` | `.long` class 挂在 `#nav-totop` 上（CSS 里有 `#nav-totop.long`），按钮结构不能动 |
| 中控台 | `main.js:1811` `#toggle-menu` click → `sidebarFn.open()`；`#center-console:checked ~ #console` | `#console` 必须与 `input#center-console` **同级**（同为 `#nav-right` 子元素），P4-6 别包一层 div |
| 侧栏抽屉 | `main.js:197-205` 给 `#menu-mask` 跑 `animateIn/Out`、给 `#sidebar-menus` toggle `.open` | `#menu-mask`、`#sidebar-menus` 的 id/层级 = 全局契约 |
| 侧栏子菜单 | `main.js:934` `#sidebar-menus .menus_items` click 委托，target 需 `.site-page.group` | `theme.menu` 有下拉时，Phase 4 需要给下拉父项加 `site-page group` class（或改 JS），本次按上游 pug 原样输出 `a.site-page` |

### 6.2 rightside（最容易踩坑的一条）

```js
// main.js:895-903
document.getElementById("rightside").addEventListener("click", function (e) {
  const $target = e.target.closest("[id]");        // ← 靠 id 分发，图标点击会冒泡到 button
  if ($target && rightSideFn[$target.id]) rightSideFn[$target.id](this);
});

// main.js:859-870  #rightside-config
"rightside-config": item => {
  const hideLayout = item.firstElementChild;        // item === #rightside!!
  …
  hideLayout.classList.toggle("show");              // 给 .show 挂在 #rightside-config-hide
}
```

- **`#rightside-config-hide` 必须是 `#rightside` 的第一个子元素**（否则齿轮按钮会去 toggle 别的节点）——本次保留了这个顺序。
- `#rightside-config` 只 toggle `.show`/`.status` class，不改 inline style。
- `#hide-aside-btn` → `document.documentElement.classList.toggle("hide-aside")` + `saveToLocal.set("aside-status", …)`；状态在 **html** 上，不在按钮上。
- `#darkmode` → 改 `<html data-theme>` + `saveToLocal.set("theme", mode, 2)`（**这就是 P2-2 首屏 bootstrap 要读的 `{value,expiry}` 格式**，两处必须一致）。
- `#readmode` → `body.read-mode` + 动态 append `button.anzhiyufont.anzhiyu-icon-xmark.exit-readmode`（这个按钮**不在静态 HTML 里**，别去补）。
- `#mobile-toc-button` → `const tocEle = document.getElementById("card-toc"); tocEle.style…`。**`#card-toc` 是 P3-1 的 aside TOC 卡片；它不存在时点这个按钮会抛 TypeError。** P2-8 传 `showToc` 前，P3-1 必须先把 `#card-toc` 补上（或者 Phase 4 脚本里加空值保护）。
- 侧栏深色按钮走另一套：`addDarkModeEventListener("sidebar", ".darkmode_switchbutton")`（`main.js:1746`），**不经过 rightside 事件委托**；按钮 id 为空的 `.darkmode_switchbutton` 也能工作，但 class 名必须是这个。
- `#to_comment` / `#switch-commentBarrage` / `#chat-btn` 各自有 id 处理器；`#translateLink` 调 `window.translateFn.translatePage()`（translate 脚本 P4）。

### 6.3 lazyload（P2-4 复刻的静态形态 vs 运行时读取）

- 上游 `main.js:1123`：`new LazyLoad({ elements_selector: "img", threshold: 0, data_src: "lazy-src" })` → 运行时读 **`data-lazy-src`**。
- 静态形态（Hexo `post_lazyload.js` 产物）：`src=<base64 占位>` + `onerror="this.onerror=null,this.src=\"/img/404.jpg\""` + `data-lazy-src=<真图>`；`class` 含 `nolazyload` 的图跳过。
- **两份实现需要收敛**：本次在 `src/components/layout/lazyload.ts` 里做了一份（读 `theme.lazyload.{enable,field,placeholder}` + `theme.error_img.post_page`），并行的 P2-9/P2-10 在
  `src/components/archive/LazyImage.astro` 里也做了一份（placeholder/error_img 硬编码）。建议 Phase 4 统一成
  **一个 Astro integration（`astro:build:done` 重写 dist HTML）**，那才是 Hexo `after_render:html` 的等价物；
  组件级的这两份是 Phase 2 为了 diff 收敛的临时手段。

### 6.4 其它

- 外链 `target/rel`：见 §4.1，站点级过滤器，Phase 7。
- footer 打字机 / 中控台 / 搜索是**外部脚本 + 外部 API**：`footerBar.subTitle` 需要 Typed.js、`#console` 需要 APlayer/最新评论接口。P4-1 的资源解析层要先就位。
- `#nav-music`（BaseLayout 静态结构）与 `#console` 都依赖 APlayer/meting，P4-7/P4-6。

---

## 7. 交接、风险与已知问题

### 7.1 写范围

只改了：`packages/astro-theme-anzhiyu/src/components/layout/`（7 个新文件）、
`packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro`、本报告。
**没有**改 `examples/blog/src/pages/`、`src/utils/`、`src/i18n/`、`Head.astro`、根 `scripts/`。
（`git status` 里的 `examples/blog/src/pages/index.astro`、`404.astro`、`archives/`、`categories/`、`tags/`、
`components/archive/`、`components/post/`、`docs/notes/P2-9-10-archive-404.md` 都是并行组员的改动。）

### 7.2 需要 Lead 知道的三件事

1. **`BaseLayout` 现在依赖内容集合**（`getCollection('posts')`，为 sidebar 计数/标签云）。这是 P2-5 的临时接法，
   Phase 7 站点配置层落地后应该改成「站点注入 site 数据」。如果 Phase 7 之前有人要在**没有 `posts` 集合**的
   项目里用这个布局，会 build 失败——建议 Phase 7 把数据源做成 props + 默认空值。
2. **`theme.index_img` / `theme.default_top_img` / `theme.footer_bg` 的 schema 是 `z.boolean()`**，
   但上游允许字符串（`index_img: "background: url() top / cover no-repeat"`、`footer_bg: "background: …"`）。
   `Header.astro` / `Footer.astro` 已经按「布尔或字符串」写了防御分支，但**配置校验会先拒绝字符串**。
   `src/config/schema.ts` 不在本次写范围，登记为 config 层问题（建议 P4-1 或 Phase 7 改成 `z.union([z.boolean(), z.string()])` 再实测一次 top_img 分支）。
3. **404 页已经复用 `components/layout/Header.astro`**（P2-10 组员在本次落地后主动接上了，见 `examples/blog/src/pages/404.astro:27,73`），
   这是正确的复用方式；不再需要「复制一份 header」。同理 P2-8 的文章页可以直接用 `Header` 的 `post-info` slot。

### 7.3 未验证项（诚实登记）

- `#site-info` / `#page-site-info` / `#scroll-down` / `#site_social_icons`：基准站 `index_img/default_top_img` 都是 false，
  **当前配置下不渲染**，只做了编译验证（分支代码在，但没有 baseline 可对比）。
- footer socialBar / runtime / list / bdageitem / `footer_bg`：基准站配置全关，同上。
- `theme.menu` 非空时的菜单树、`theme.social` 非空时的社交图标、`theme.nav.enable` 的返回菜单：同上（配置全空）。
- 多语言：只验证了 `zh-CN`（基准站语言）；`en/zh-TW/default` 字典键齐全，但没有产物对比。

---

## 8. 复现命令

```powershell
cd D:\Git-project\astro-theme-anzhiyu

# 0) 解 baseline（若 .baseline-html 不存在）
node scripts/extract-baseline-html.mjs

# 1) 构建
pnpm --filter blog build

# 2) 单页 diff（首页 / 任一已有页）
node scripts/diff-html.mjs .baseline-work/public/index.html examples/blog/dist/index.html
node scripts/diff-html.mjs .baseline-work/public/archives/index.html examples/blog/dist/archives/index.html

# 3) 全量
node scripts/diff-html.mjs --all
node scripts/diff-html.mjs --all --json > $env:TEMP\html-diff.json

# 4) CSS 基准
node scripts/verify-css.mjs

# 5) ID/class 清单（从产物抓，本报告 §1 用）
#    node $env:TEMP\inv2.cjs examples/blog/dist/archives/index.html
```

隔离快照（§3.1/3.2/3.4 的归因测量）：见 §5.3；快照目录 `D:\Git-project\_p24-verify`（不属于仓库，可随时删）。

---

## 9. 最后一段（判定）

**nav / footer / sidebar / rightside 已经全部真实渲染，四个占位容器全部替换成组件**：
`Header.astro` 输出 `header#page-header > nav#nav > #nav-group`（logo/标题、`#page-name` 容器、`#menus`、
`#nav-right` 的随机文章/中控台开关/回顶百分比/移动端菜单按钮）并把 `post-info` 做成 slot 交给 P2-8；
`Footer.astro` 输出 `footer#footer > #footer-wrap + #footer-bar`（版权 + 主题链接，其余分支按配置实现）；
`Sidebar.astro` 输出 `#sidebar > #menu-mask + #sidebar-menus`（文章/标签/分类计数、显示模式、导航项目组、
标签云）；`Rightside.astro` 输出 `#rightside > #rightside-config-hide + #rightside-config-show`（简繁/深色/
单栏/阅读模式/目录/回顶，顺序支持 `rightside_item_order`）。

**缺口降了 159 个节点**（隔离归因：首页 857 → 698，其中 nav 207→180、footer 8→0、sidebar 114→0、
rightside 10→0；diffCount 103 → 91；没有引入任何多余节点，其余 84 条差异与改前逐条相同）。
**四个组件区域剩下的全部是两类已登记事项**：`#console`（180 节点 → P4-6）和 Hexo 站点级 `external_link`
过滤器加的 `target/rel`（6 条属性/页 → Phase 7）。文章页组件分支已在隔离环境用最小文章页验证：
`post-bg` header、`#readmode`、`#mobile-toc-button`、hideAside 条件全部与 baseline 一致（rightside 0 差异），
整页 diff 的 982 个缺口节点全部落在 P2-8 的正文/PostInfo 与 P4-6 的 console 上。
