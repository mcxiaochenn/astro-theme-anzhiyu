# P3-3 about 页验收报告

- 上游参考：`D:/Git-project/_research/anzhiyu-upstream`（1.7.1 / commit `72439d93`）
  的 `layout/includes/page/about.pug`（500 行）及 `source/css/_page/about.styl`、
  `_extra/skills|map|reward` 等样式。
- 基线：`.baseline-html/about/index.html`（只读）。
- 目标：`/about/` 的 `#about-page` 子树与基线结构一致；本阶段只出 DOM，
  交互脚本留给 Phase 4。
- 交付范围：`packages/astro-theme-anzhiyu/src/components/page/about/**` 与本报告。
  **未改** 路由 `[...path].astro`、BaseLayout / Head / Header / AsideContent、
  其它 page 模板、`docs/PLAN.md`、`scripts/diff-html.mjs`；
  `examples/blog/data/about.yml` 本阶段无需补字段，保持 P3-2 原样。

---

## 1. 区块清单（组件 ↔ 上游 pug 行号）

`AboutPage.astro` 是唯一入口，外层 `each item in site.data.about` 循环产出
`#about-page`；下面按拼装顺序对应上游的 `.author-content` 分组。

| 组件 / 位置 | 上游行 | 输出的 DOM |
| --- | --- | --- |
| `AboutAuthorBox.astro` | `:15-27` | `.author-box`（`avatarSkills` 左右标签 + 头像）、`p.p.center.logo.large`、`p.p.center.small` |
| `AboutPage.astro`（内联） | `:28-35` | `.author-content > .author-content-item.myInfoAndSayHello` |
| `AboutPage.astro`（内联） | `:36-49` | `.aboutsiteTips.author-content-item`：`h2` 内 `br` + `.mask`（静态轮播词 / `data-up` / `data-show`） |
| `AboutHello.astro` | `:51-58` | `.hello-about`：`.cursor` + 3 个 `.shape` + `.content > h1` |
| `AboutSkills.astro` | `:61-76` | `.author-content-item.skills`；`skills-style-group` 内复用 `home/TagsGroupAll.astro`，`site.data.creativity` 存在时追加 `.skills-list`（`skill-info` / `skill-icon` / `skill-name` / `.etc`） |
| `AboutCareers.astro` | `:77-90` | `.author-content-item.careers`：`careers.list` 时间线、`.careers-none` 分支、可选 `careers.img` |
| `AboutStatistic.astro` | `:92-112` | `.about-statistic.author-content-item`（`theme.LA.enable \|\| theme.umami.enable` 门控）、`#statistic`、`.post-tips`、`.banner-button-group` |
| `AboutMap.astro` | `:114-127` | `.mapAndInfo` 内的内联 `<style>`（亮/暗背景）+ `.author-content-item.map.single > span.map-title > b` |
| `AboutSelfInfo.astro` | `:128-141` | `.author-content-item.selfInfo.single` 三行标签/值（含 `#selfInfo-content-year`） |
| `AboutPersonality.astro` | `:143-155` | `.personalities`（`learn_more_at` 富文本）+ `.myphoto` |
| `AboutMaximBuff.astro` | `:157-174` | `.maxim` + `.buff`（空的 `.card-content` 与 tips/title 同级，见 §3） |
| `AboutGameComic.astro` | `:176-196` | `.game-yuanshen`（`.loading-bar` 条件样式）+ `.comic-content > .comic-box` |
| `AboutLikeMusic.astro` | `:198-217` | `.like-technology` + `.like-music`（`pjax.loadUrl` 按钮） |
| `AboutPage.astro`（内联） | `:219-222` | `page.content` → `.create-site-post.author-content-item.single` |
| `AboutReward.astro` + `AboutRewardTube.astro` | `:224-286` | `.reward#about-reward`：名单（按 amount 排序）、更新时间、`#con` / `#TA-con` / `#tube-con` / `#mask` / `#orange-mask`（3 份同构 SVG）/ `p#people` |
| —（Phase 4） | `:289-500` | `countup.js` 外链、`initAboutPage()` 内联脚本（CountUp / 51la / Umami / 文案轮播 / gsap 跟随） |

辅助文件：`types.ts`（`site.data.about` / `creativity` 的数据形状）、
`shared.ts`（`_p()` / `url_for()` / lazyload 图片属性 / 赞赏日期格式化 / `pjaxLoad()`）。

---

## 2. 数据契约

数据来源：`examples/blog/data/about.yml` → `examples/blog/src/data/site-data.ts`
的 `getSiteData('about')` → 站点路由 `[...path].astro` 的 `aboutData` →
`<AboutPage data={aboutData} html={renderedHtml} />`。
顶层是数组（对应上游 `each item in aboutData`），每个 item 产出一棵 `#about-page`。

| `AboutPage` props | 上游变量 | 说明 |
| --- | --- | --- |
| `data: AboutItem[]` | `site.data.about` | 空数组时整页不输出（上游 `if site.data.about`） |
| `html: string` | `page.content` | 非空才输出 `.create-site-post` |
| `creativity?: unknown` | `site.data.creativity` | 可选；当前路由未传，基线站也没有 `data/creativity.yml`，故 skills 图标列表为空 |

`AboutItem` 字段（均取自 `about.yml`，缺字段按上游 `if` 分支跳过或输出空值）：

| 字段 | 消费者 | 缺失 / 条件行为 |
| --- | --- | --- |
| `avatarSkills.left/right` | `AboutAuthorBox` | 整个 `avatarSkills` 缺失 → 左右标签容器都不输出 |
| `avatarImg` | `AboutAuthorBox` | 回退 `theme.avatar.img`（上游 `:5`） |
| `subtitle` / `name` / `description` | `AboutAuthorBox`、`AboutPage`、`AboutLikeMusic` | 上游回退 `config.subtitle` / `theme.author` / `config.description`；站点配置未透传，见 §6 |
| `helloAbout` | `AboutHello` | 空则 `h1` 无文本 |
| `aboutsiteTips.{tips,title1,title2,word}` | `AboutPage` | `word` 末两项给 `data-up` / `data-show`，前 `length-2` 项为静态词（首项带 `first-tips`） |
| `skillsTips.{tips,title}` | `AboutSkills` | — |
| `careers.{tips,title,list,img}` | `AboutCareers` | 无 `list` → `.careers-none`；`list[].color` 缺省 `#357ef5`；`img` 可选 |
| `map.{background,backgroundDark,title,StrengthenTitle}` | `AboutMap` | 拼内联 `<style>` |
| `selfInfo.*` | `AboutSelfInfo` | 三行；首行值带 `#selfInfo-content-year` |
| `statistic.{cover,link,text}` | `AboutStatistic` | 仅当 `LA.enable \|\| umami.enable`；两者皆关 → 整卡不渲染 |
| `personalities.{author_name,personality_type,photo_url,personality_img,name_url,personality_type_color}` | `AboutPersonality` | 颜色缺省 `#ac899c` |
| `maxim.*` / `buff.*` | `AboutMaximBuff` | — |
| `game.{game_tips,game_title,game_uid,game_bg}` | `AboutGameComic` | `game_title !== '原神'` → `.loading-bar[style="display: none"]` |
| `comic.{comic_tips,comic_title,comic_list[]}` | `AboutGameComic` | 无 `comic_list` → 空 `.comic-box` |
| `music.*` / `like.*` | `AboutLikeMusic` | `enjoy_music_with` 用 `aboutName` 插值 |
| `reward_list[]` | `AboutReward` | 字段不存在 → 整块不输出 |

---

## 3. 关键实现决策

1. **静态类名全部沿用上游**，不写新 CSS；命中 `about.styl` 与 `_extra/*`。
2. **i18n**：与 `FlinkPage` / `FcirclePage` 一致，用 `tp(key, 'zh-CN')`（基准站语言）。
   涉及 `about.title/hello/im/data/visit_stats/stats_from/enjoy_music_with/
   more_recommend/personality/personality_img_alt/selfie_alt/learn_more_at/
   thanks/reward_list/reward_thanks/last_update/charge_for_ta/total_people`。
3. **图片 lazyload 三段式**：`shared.ts:imageAttrs()` 复用
   `components/layout/lazyload.ts:lazyImageAttrs()`，产出
   `src=占位图` + `onerror` + `data-lazy-src`。上游 pug 在头像 / careers 图上
   还写了一条 `onerror`（`theme.error_img.flink`），站级过滤器插入的那条排在前面；
   `diff-html.mjs` 对重复属性「保留第一个」，因此启用 lazyload 时不重复输出。
4. **内联 `<style>`**：`AboutMap.astro` 用 `<style is:inline set:html={mapCss}>`，
   阻止 Astro 把样式抽到 `<head>`，保持它在 `.mapAndInfo` 内、地图 div 之前。
5. **`page.content` 的 headerlink**：上游用 `!=` 直出 Hexo marked 产物
   （`<h2 id="…"><a class="headerlink" …></a>文本</h2>`）；Astro/remark 的产物只有 id。
   `AboutPage.astro` 复用文章页的 `utils/slugger.ts:rewriteHeadings()` 补齐 id 口径与锚点。
6. **上游缩进怪癖**：`.buff` 里 `.card-content` 是空节点，tips / title / 图标是它的
   同级兄弟（`:165-174`），按基线 DOM 原样复刻，未「修正」。
7. **`word` 轮播 / `loading-bar` / `pjax.loadUrl` / `rewardShowConsole()`** 等静态属性
   全部输出；对应的 JS 行为属于 Phase 4。

---

## 4. 验收命令与真实输出

环境：`export PATH="/c/Program Files/nodejs:$PATH"`（系统 Node 24）。
所有命令在仓库根 `D:/Git-project/astro-theme-anzhiyu` 执行。

### 4.1 加锁构建（62 页）

```
cd /d/Git-project/astro-theme-anzhiyu && while ! mkdir .build.lock 2>/dev/null; do sleep 3; done; trap 'rmdir .build.lock' EXIT; CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm --filter blog build
```

```
22:34:55   ├─ /music/index.html (+8ms)
22:34:55   ├─ /room/index.html (+9ms)
22:34:55   ├─ /tags/index.html (+8ms)
22:34:55 ✓ Completed in 943ms.

22:34:55 [build] ✓ Completed in 3.41s.
22:34:55 [build] 62 page(s) built in 6.45s
22:34:55 [build] Complete!
```

### 4.2 私有快照的 `/about/` 单页 diff

```
DIST_DIR=.dist-snapshot BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs .baseline-html/about/index.html .dist-snapshot/about/index.html --limit 60
```

```
[diff-html] baseline: .baseline-html\about\index.html
[diff-html] dist:     .dist-snapshot\about\index.html
FAIL .baseline-html\about\index.html ↔ .dist-snapshot\about\index.html  14 条差异（属性 11 / 结构 2 / 脚本样式 1），缺口 缺 3 节点
    1. [属性/attr-changed] /html/head/meta[15]
       期望: content="website"
       实际: content="article"
    2. [属性/attr-changed] /html/head/meta[17]
       期望: content="<SITE>/about/index.html"
       实际: content="<SITE>/about/"
    3. [属性/attr-changed] /html/head/meta[19]
       期望: content="这是 P1-6 的独立页面 fixture，走 layout: page + type: about 分支，用来给「非文章页」提供 HTML 与视觉基准。 这个基准站点是什么它是上游 hexo-theme-anzhiyu 1.7.1（com…"
       实际: content="这是 P1-6 的独立页面 fixture，走 layout: page + type: about 分支，用来给「非文章页」提供 HTML 与视觉基准。 这个基准站点是什么 它是上游 hexo-theme-anzhiyu 1.7.1（co…"
    4. [属性/attr-changed] /html/head/meta[26]
       期望: content="这是 P1-6 的独立页面 fixture，走 layout: page + type: about 分支，用来给「非文章页」提供 HTML 与视觉基准。 这个基准站点是什么它是上游 hexo-theme-anzhiyu 1.7.1（com…"
       实际: content="这是 P1-6 的独立页面 fixture，走 layout: page + type: about 分支，用来给「非文章页」提供 HTML 与视觉基准。 这个基准站点是什么 它是上游 hexo-theme-anzhiyu 1.7.1（co…"
    5. [脚本样式/content] /html/head/script#config-diff[2]
       期望: 「var GLOBAL_CONFIG_SITE = { configTitle: 'AnZhiYu Baseline', title: '关于本站', postAI: '', pageFillDescription: '这个基准站点是什么, …」（414 字符）
       实际: 「var GLOBAL_CONFIG_SITE = { configTitle: 'AnZhiYu Baseline', title: '关于本站', postAI: '', pageFillDescription: '<p>这是 P1-6 …」（840 字符）
    6. [结构/node-missing] /html/body/div#body-wrap[4]/main#blog-container/div#content-inner/div#page[1]/script[1]
       期望: <script src="https://cdn.cbd.int/anzhiyu-theme-static@1.0.0/countup/countup.js">（子树 1 节点）
       实际: （不存在）
    7. [结构/node-missing] /html/body/div#body-wrap[4]/main#blog-container/div#content-inner/div#page[1]/script[2]
       期望: <script defer>"function initAboutPage() { const statisticEl = document.getElementById("statistic"); let statistic = []; …（子树 2 节点）
       实际: （不存在）
    8. [属性/attr-missing] /html/body/div#body-wrap[4]/footer#footer/div#footer-bar[2]/div/div[2]/a
       期望: rel="noopener"
       实际: （不存在）
    9. [属性/attr-missing] /html/body/div#body-wrap[4]/footer#footer/div#footer-bar[2]/div/div[2]/a
       期望: target="_blank"
       实际: （不存在）
   10. [属性/attr-missing] /html/body/div#sidebar[5]/div#sidebar-menus[2]/div[3]/div[1]/div[2]/a
       期望: rel="noopener"
       实际: （不存在）
   11. [属性/attr-missing] /html/body/div#sidebar[5]/div#sidebar-menus[2]/div[3]/div[1]/div[2]/a
       期望: target="_blank"
       实际: （不存在）
   12. [属性/attr-missing] /html/body/div#sidebar[5]/div#sidebar-menus[2]/div[3]/div[2]/div[2]/a
       期望: rel="noopener"
       实际: （不存在）
   13. [属性/attr-missing] /html/body/div#sidebar[5]/div#sidebar-menus[2]/div[3]/div[2]/div[2]/a
       期望: target="_blank"
       实际: （不存在）
   14. [属性/attr-changed] /html/body/div[10]/div/input#page-type
       期望: value="about"
       实际: value="anzhiyu"
[diff-html] 结构不一致
```

用本次构建的 `examples/blog/dist/about/index.html` 跑同一条命令，输出完全一致
（`14 条差异 / 缺口 缺 3 节点`）。

### 4.3 逐条判定（14 条里属于 `#about-page` 的：0 条）

`--json` 按路径自动归类：

```
diffCount = 14  missingNodes = 3  unexpectedNodes = 0
分类计数: {
  "head(Head/BaseLayout)": 5,
  "脚本层(Phase4)": 2,
  "footer": 2,
  "sidebar": 4,
  "全局 input#page-type": 1
}
```

| 编号 | 归属 | 是否 `#about-page` 子树 | 处理方 |
| --- | --- | --- | --- |
| 1-4 | `head` 的 og:type / og:url / 两条 description | 否 | Head / BaseLayout（别的 agent） |
| 5 | `head` 的 `GLOBAL_CONFIG_SITE.pageFillDescription` | 否 | Head（别的 agent） |
| 6-7 | `#page` 直接子级的两个 `<script>`（about.pug `:289`/`:306`） | 否（在 `#about-page` **外面**） | Phase 4 脚本层 |
| 8-9 | `footer` 外链 `rel` / `target` | 否 | links-fix（别的 agent） |
| 10-13 | `sidebar` 外链 `rel` / `target` | 否 | links-fix（别的 agent） |
| 14 | 全局 `input#page-type` 的 `value="about"` | 否 | BaseLayout（别的 agent） |

`missingNodes = 3` 全部来自编号 6/7 的两个脚本元素（`1 + 2` 个子树节点），
即验收标准里允许的「脚本层」缺口；`unexpectedNodes = 0`，没有多输出节点。

### 4.4 独立的 `#about-page` 子树 diff

为避免整页对齐掩盖子树问题，把两边 `<div id="about-page">` 的闭合子树单独抽出来
（各自包一层 `<html><body>`）再跑同一个比较器：

```
[diff-html] baseline: .about-diff-base.html
[diff-html] dist:     .about-diff-dist.html
PASS .about-diff-base.html ↔ .about-diff-dist.html  0 条差异
[diff-html] 结构一致
```

抽取到的子树字节：基线 7531 / 产物 7470（差异仅来自属性写法、懒加载占位等
字节级形态；归一化后结构与文本完全一致）。

### 4.5 结论

- `#about-page` 子树：**结构 / 属性 / 文本差异 0**（§4.4 直接证明，§4.2 整页 diff 中
  无一条路径含 `div#about-page`）。
- 整页 `missingNodes = 3 ≤ 6`，且全部是 Phase 4 的脚本层缺口；
  其余 12 条差异全在 head / footer / sidebar / 全局 input，属于其它 agent 的收敛范围。
- 构建 62 页成功，未新增依赖，未改动禁止范围内的文件。

---

## 5. 未覆盖项

1. **交互脚本（明确移交 Phase 4）**：`about.pug:289-500` 的
   `countup.js` 外链与 `initAboutPage()`（CountUp 动画、51la / Umami 统计拉取、
   `aboutsiteTips.word` 轮播、`pjax:send` 清理、gsap 鼠标跟随）。这是整页仅剩的
   3 个 missing 节点来源；本阶段按要求只出 DOM。
   `pjax.loadUrl(...)` / `anzhiyu.rewardShowConsole()` 的 `onclick` 静态属性已输出。
2. **head / footer / sidebar / `input#page-type`**：共 12 条属性差异，
   落在 Head / BaseLayout / Header / Sidebar / Footer，由其它 agent 收敛，
   本任务按约束不碰。
3. **未被基线数据触发的分支（代码已实现，无基线可比对）**：
   - `AboutStatistic`（`LA.enable` / `umami.enable` 均为 false）；
   - `AboutReward`（`about.yml` 无 `reward_list`），含 3 份 SVG 管道；
   - `AboutSkills` 的 `.skills-list` 与 `TagsGroupAll`（无 `data/creativity.yml`，
     且当前路由未把 `creativity` 传给 `AboutPage`）；
   - `AboutCareers` 的 `careers.img` 与 `.careers-none` 分支；
   - `AboutGameComic` 的 `game_title !== '原神'` 隐藏分支、`comic_list` 多项。
   若要验证这些分支，需要补对应的 fixture 数据并生成新的上游参考产物。
4. **`config.*` 回退链**：上游 `subtitle || config.subtitle`、
   `name || theme.author`、`description || config.description` 只实现了
   `avatarImg || theme.avatar.img`。原因是站点级 `site` 未透传给子组件
   （见 `layouts/site.ts` 的说明，与 `CardAuthor.astro` 的已知限制同源）。
   基准 fixture 这些字段齐备，不影响验收；建议 Phase 7 站点配置层落地后补齐。
5. **`GLOBAL_CONFIG` 注入 / `body[data-type]`**：about 页的样式入口依赖运行时配置，
   属于 Phase 4 runtime；本阶段未改布局。
