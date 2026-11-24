# P7-4 · 真实站迁移验收脚手架（scripts/accept-migration.mjs）与首跑结论

范围：为真实 Hexo 站 `D:\Git-project\xcAnzhiyu`（Hexo 7.3.0 + anzhiyu 1.6.14，只读）的
Astro 迁移提供**一条命令可复跑**的验收：`migrate-hexo → pnpm install → build → 10 项检查 →
JSON + Markdown 报告 → 明确退出码`。脚本独立判断，不信任 `migrate-hexo` 自述的
`migration-report.json`：路由从源站配置与 frontmatter 重算，链接/资源/身份全部从构建产物实测。

本文记录脚手架设计、首跑真实结果（缺口分类计数表）、94 vs 97 页差异归属、与 Lead 一次性
探针的口径对账、根因与修复建议。

---

## 0. 结论摘要

| 项 | 结果 |
| --- | --- |
| 命令 | `node scripts/accept-migration.mjs`（本文首跑：工作目录 `.migration-out/accept-20261124-191107`） |
| 退出码 | **1**（有迁移缺口；0=全部 PASS / 1=有 gap / 2=环境·构建失败） |
| 总耗时 | **25s**（migrate 1.0s / install 7.5s / build 14.0s / 检查差分 <2s） |
| 构建 | exit 0，94 个 HTML，根级产物 7 个 |
| 独立重算路由 | posts 22 + pages 18 = **40 条期望 URL，40/40 命中 dist** |
| golden（源站 public）/dist | **97 / 94 页，差 3 页**，全部是 Hexo 插件生成页（见 §4.4） |
| 迁移缺口 | **67** 个（migration-gap） |
| 源站既有 | 7 个（inherited，不算迁移缺陷） |
| 已知豁免 | 1 个（whitelisted，`/img-url`） |
| 检查 PASS | build、tag-residue；其余 7 项 FAIL；structure 为 INFO |

缺口分类计数（migration-gap，按 `(分类 + URL)` 去重后；原始明细 72 条，links/assets 重叠 5 条）：

| 分类 | 计数 | 归属 |
| --- | ---: | --- |
| `old-permalink` | 44 | 主题 URL 归一化（当前 permalink 是 `posts/p:abbrlink/`，组件仍产出旧形态） |
| `taxonomy-slug` | 7 | 主题分类/标签链接生成（缺父级 + slugize 不一致） |
| `page-missing` | 3 | Hexo 插件生成页（envelope / bangumi / safego）→ Astro 侧补生成器 |
| `sitemap` | 3 | sitemap / 百度提交产物生成 |
| `feed` | 2 | feed 生成（hexo-generator-feed 等价物） |
| `identity` | 2 | 文章页 canonical / og:url 仍用旧 permalink |
| `page-type` | 2 | fcircle（friends_vue 门控）/ todolist（主题无模板） |
| `pseudo-scheme` | 2 | `mailto:` / `javascript:` 被拼成站内路径 |
| `search-index` | 1 | 本地搜索索引（search.xml） |
| `theme-asset` | 1 | `/anzhiyu/random.js` 未迁移 |
| **合计** | **67** | |

---

## 1. 为什么需要独立验收

`migrate-hexo` 自己的 `migration-report.json` 统计的是「它写了多少文件」（文章 22 / 页面 18 /
数据 8 / 静态资源 111 / 产物 302），回答不了下面这些问题：

- 重算出的 URL 在 dist 里真的存在吗？（它只写文件，不验证路由）
- 产物里的站内链接指向的文件真的存在吗？（94 页 × 800+ 引用）
- 主题身份（title / lang / canonical / og:*）用的是源站身份，还是**当前路由**？
- 页面类型模板真的渲染出对应 DOM 了吗？
- 源站 `_config.yml` 里的 feed / sitemap / search / 插件页配置，产物等价物存在吗？

而这些恰恰是「迁移完成」的真正判据。脚本因此把验收做成**黑盒事实检查**，所有 FAIL 都带
可复算的 URL 清单与页面样本。

---

## 2. 用法、退出码与工作目录

```powershell
# 全量：migrate → install → build → 10 项检查 → 报告（默认工作目录 .migration-out/accept-<时间戳>）
node scripts/accept-migration.mjs

# 指定源站 / 工作目录
node scripts/accept-migration.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/accept-latest

# 复用已迁移工程（跳过 migrate/install），仍重新构建 + 重新检查
node scripts/accept-migration.mjs --out .migration-out/accept-latest --reuse

# 只对现有 dist 做检查（不构建），CI 上快速回归用
node scripts/accept-migration.mjs --out .migration-out/accept-latest --reuse --skip-build

# 机器可读：stdout 只留 JSON 报告，人读进度走 stderr
node scripts/accept-migration.mjs --json
```

| 退出码 | 语义 |
| ---: | --- |
| 0 | 全部检查 PASS（inherited / whitelisted 不计入失败） |
| 1 | 存在迁移缺口（migration-gap） |
| 2 | 环境或构建失败（blocked：站点目录不对 / migrate / install / build 挂掉） |

工作目录结构（`--out` 指定，默认 `.migration-out/accept-<YYYYMMDD-HHmmss>`，已被 `.gitignore` 的
`.migration-out/` 覆盖）：

```
accept-<ts>/
├── migrated/                 # migrate-hexo 产物（独立 Astro 工程：package.json/astro.config.mjs/src/dist…）
├── logs/                     # 每个外部命令的 stdout/stderr 落盘（01-migrate / 02-pnpm-install / 03-pnpm-build / structure-diff-*）
├── acceptance-report.json    # 机器可读：meta/phases/checks/gaps/whitelist/summary/reports
└── acceptance-report.md      # 人读：阶段、检查总览、分类计数表、逐类缺口、身份/页面类型表、修复建议
```

> 子进程输出为什么落盘：本仓库 agent 运行在带沙箱的 Windows 环境，沙箱禁止子进程通过命名管道
> 回传 stdout（`child_process` 默认 pipe 会 EPERM）。脚本把 stdout/stderr 直接写到 `logs/*.log`
> 再读回，证据完整且可复跑。

---

## 3. 检查项设计

| id | 取数方式 | PASS 判据 | 首跑 |
| --- | --- | --- | --- |
| `build` | 真实 `pnpm build`（`CODEBUDDY_SAFE_DELETE_ENABLED=0`） | exit=0 且 dist HTML>0 | ✅ PASS（94 页） |
| `routes` | ① 解析 `_config.yml.permalink` + 每篇 post frontmatter `abbrlink`/`date`/`permalink`，逐条渲染期望 URL；② 每个 `source/**/index.md`（及 `*.md`）按路径 + frontmatter `permalink` 推期望 URL；③ golden `public/` HTML 清单 vs dist 清单 | ① 全部命中；② 差集只允许登记过的插件页 | ❌ FAIL（① 40/40；② 缺 3 插件页） |
| `links` | 扫描 94 个 dist HTML 的 `href`/`src` + `onclick` 里的 `pjax.loadUrl`，相对 URL 按页面目录解析，映射到 dist 文件系统目标 | 缺失目标经三栏归属后无 migration-gap | ❌ FAIL（65 个缺失目标：57 gap / 7 inherited / 1 whitelisted） |
| `assets` | `links` 里静态资源后缀（js/css/img/…）子集 + golden `js/css/img/anzhiyu/feed` 目录文件清单对比 | 无 migration-gap 静态资源 | ❌ FAIL（2 个 gap：`/anzhiyu/random.js`、`/atom.xml`；1 inherited） |
| `identity` | 读迁移产物 `site.config.ts`，对首页 / 文章页 / about 断言 title、`html lang`、canonical、`og:url`、`og:type` | 15 条断言全过 | ❌ FAIL（13/15，文章页 canonical+og:url 仍是旧 permalink） |
| `page-types` | 17 个 `source/*/index.md` 逐个断言存在 + 该 `page.type` 的根选择器（依据 `docs/notes/P3-2-page-types.md` §6.2 + golden 实测；default 页断言 `#article-container` 正文非空） | 17/17 | ❌ FAIL（15/17：fcircle、todolist） |
| `tag-residue` | 全量扫 `\{%`、`<%`、`hexoPostRender`、hexo 注释、title/page-title 的 undefined·NaN | 0 命中 | ✅ PASS（0/0） |
| `search` | 解析首页 `GLOBAL_CONFIG.localSearch`，与 `_config.yml.search.path` 对照 | enabled 时索引文件存在 | ❌ FAIL（`/search.xml` 缺失） |
| `feed` | 按 `_config.yml` 的 `feed.path` / `sitemap.path` / `baidusitemap` / `baidu_url_submit.path` 断言存在 + 非空 + 条目数 | 全部存在且条目数>0 | ❌ FAIL（5 个全缺） |
| `structure` | 抽样 6 页复用 `scripts/diff-html.mjs <golden> <dist> --json` | 只报 `diffCount`（INFO，不判罚） | ℹ️ INFO（总 1500 条差异，见 §4.8） |

**缺口三栏归属**（links/assets）：

- `migration-gap`：golden 有该产物，或迁移新造了错误 URL → 迁移必须修；
- `inherited`：golden 也缺、且 golden 自己的 HTML 也引用了它 → 源站既有死链，不算迁移缺陷；
- `whitelisted`：命中脚本顶部 `WHITELIST`（id + 匹配方式 + 理由 + 归属任务），单独计数、逐条列出，不影响退出码。

优先级：`inherited`（golden 证据最硬）> `whitelisted` > `migration-gap`。

**链接扫描语义**（决定与「直接 grep href」的差异）：

1. 只扫真实 HTML 属性（双/单引号 `href`/`src` + `onclick` 内 `pjax.loadUrl`）；
2. **排除** `<script>/<style>` 内联正文与代码块（`figure.highlight` / `pre` / `code`）里被示例出来的
   `src=`、`href=`——否则会扫出 `/posts/pXXXX/<span class="variable">$url</span>` 这类噪声
   （本次排除 11 处，单独计数 `ignoredCodeSamples`）；
3. 伪协议 `/mailto:` `/javascript:` 以 `/` 开头、在浏览器里是坏链接，按 `pseudo-scheme` 报出。

---

## 4. 首跑结果（2026-11-24 19:08，git HEAD `e8f4228` + 并行任务未提交改动）

### 4.1 阶段

| 阶段 | 状态 | exit | 耗时 | 命令 |
| --- | --- | ---: | ---: | --- |
| migrate | PASS | 0 | 1.0s | `node scripts/migrate-hexo.mjs --site … --out …` |
| install | PASS | 0 | 7.5s | `pnpm install --ignore-workspace` |
| build | PASS | 0 | 14.0s | `pnpm build`（astro build + normalize-html-output） |

构建日志关键行：`[build] 94 page(s) built in …`、`[normalize-html-output] 平文件化 1 处 .html 目录`。

### 4.2 检查总览

| # | 检查 | 状态 | 关键计数 |
| ---: | --- | --- | --- |
| 1 | build | ✅ PASS | exit=0，htmlFiles=94，rootFiles=7 |
| 2 | routes | ❌ FAIL | 40/40 独立路由命中；golden 97 / dist 94，缺 3 |
| 3 | links | ❌ FAIL | 站内目标 177，缺失 65（57 gap / 7 inherited / 1 whitelisted），838 次引用 |
| 4 | assets | ❌ FAIL | 静态资源缺失 3（2 gap + 1 inherited），golden js 17→dist 17、css 6→dist 5 |
| 5 | identity | ❌ FAIL | 3 页 15 条断言，失败 2 |
| 6 | page-types | ❌ FAIL | 17 页，15 PASS / 2 FAIL |
| 7 | tag-residue | ✅ PASS | 94 页 × 6 类标记，0 命中 |
| 8 | search | ❌ FAIL | localSearch=true，`/search.xml` 缺失（golden 254,208 字节） |
| 9 | feed | ❌ FAIL | 期望 5 个产物，存在 0 |
| 10 | structure | ℹ️ INFO | 6 页 sampler，总 diffCount 1500 |

### 4.3 逐类缺口清单（migration-gap）

**old-permalink（44）**：分两组，根因都是「组件仍按旧 permalink 模板生成 URL」：

- **22 条** `/2024/…/2025/MM/DD/<abbrlink>/` 形态（如 `/2025/08/21/5b9fe4a/`）：文章页
  `#pagination` 的 prev/next 链接，页面数 2–15 不等；
- **22 条** `/2025/MM/DD/<title-slug>/` 形态（如 `/2025/11/15/1观鬼灭…首映有感/`）：首页/列表页
  `home_top` 的 `recent-post-item`（`href` 与 `pjax.loadUrl` 双份；其中 5 条出现在 23 页）。

当前 `_config.yml.permalink = posts/p:abbrlink/`，正确目标是 `/posts/p<abbrlink>/`（dist 已按此
落位，40/40 路由命中，golden 也是 `/posts/pXXXX/`）。源站 `vercel.json` / `netlify.toml` 里没有
redirect 规则，所以这是**迁移新造的错误 URL**（golden 不引用旧形态），不是源站既有问题。

**taxonomy-slug（7）**：`/categories/` 链接缺父级或 slug 不一致，golden 有真实分类页可对：

| 产物里的错误链接 | golden 真实分类页 | 页面数 |
| --- | --- | ---: |
| `/categories/教程/Arch Linux/` | `/categories/教程/Arch-Linux/` | 3 |
| `/categories/Arch Linux/` | `/categories/教程/Arch-Linux/` | 1 |
| `/categories/Hexo/` | `/categories/教程/Hexo/` | 1 |
| `/categories/IOS折腾/` | `/categories/教程/IOS折腾/` | 1 |
| `/categories/mc/` | `/categories/教程/mc/` | 1 |
| `/categories/福利/` | `/categories/日常/福利/` | 1 |
| `/categories/博客/` | golden 里有 `/教程/博客/` 与 `/项目推荐/博客/` 两个同名末级分类 | 1 |

**page-missing（3）**：`/comments/`（hexo-butterfly-envelope，`envelope_comment.enable=true`）、
`/bangumis/`（hexo-bangumi，`bangumi.enable=true`）、`/go.html`（hexo-safego，
`hexo_safego.general.enable=true`）。golden 有对应文件，dist 没有。

**feed（2）**：`/atom.xml`（93 页引用）、`/rss2.xml`；golden 各 222,667 / 225,431 字节、20 条目。

**sitemap（3）**：`/sitemap.xml`（golden 84 条 URL）、`/baidusitemap.xml`（22 条）、
`/baidu_urls.txt`（22 条）。

**search-index（1）**：首页 `GLOBAL_CONFIG.localSearch.path = /search.xml`，dist 无该文件；
golden 254,208 字节。

**identity（2）**：抽样文章页 `/posts/p1b75e3c5/` 的 `canonical` 与 `og:url` 仍由旧 permalink 生成
（`https://blog.mcxiaochen.top/2025/08/22/1b75e3c5/`），期望
`https://blog.mcxiaochen.top/posts/p1b75e3c5/`；标题/html lang/og:type 与首页、about 全部正确。
该字段由文章模板统一生成，推断 22 篇文章页均受影响（抽样只列 1 页）。

**page-type（2）**：

- `/fcircle/`：产物只有 `<h1 class="page-title">朋友圈</h1>`，无 `.fcircle_page`。迁移产物
  `anzhiyu.config.yml` 中 `friends_vue.enable=false`；源站 `_config.anzhiyu.yml` 用的是 1.6.14 的
  `friends_lite`（1.7.1 无此键，migrate-hexo 已把它列入「无法自动迁移项」），需要人工把
  `friends_lite.enable` 映射为 `friends_vue.enable`；
- `/todolist/`：产物 `<div id="article-container"></div>` 为空（源页面正文本来为空，内容全在主题
  `todolist.pug` 模板里）。主题包 `components/page/` 没有 `TodolistPage.astro`，1.6.14 的模板未迁移。

**theme-asset（1）**：`/anzhiyu/random.js`（94 页引用）。其余主题 JS/CSS 已由主题包 assets 管线
提供（见 §6 工作区演进）。

**pseudo-scheme（2）**：`/javascript:toRandomPost()`（94 页，导航「随便逛逛」）、
`/mailto:mcxiaochenn.yyds@gmail.com`（93 页，页脚邮箱）。golden 里是合法的
`javascript:toRandomPost()` / `mailto:…`（无前导 `/`），迁移侧 URL 归一化多拼了一个 `/`。

### 4.4 「当前 94 页 vs 源站 97 页」差异归属

golden（源站 `public/`，Hexo 自己的构建产物）97 个 HTML，迁移 dist 94 个，**缺 3 页，多 0 页**：

| 缺失页面 | 源站生成者 | 源站配置证据 |
| --- | --- | --- |
| `/comments/` | hexo-butterfly-envelope | `_config.yml → envelope_comment.enable: true` |
| `/bangumis/` | hexo-bangumi | `_config.yml → bangumi.enable: true` |
| `/go.html` | hexo-safego（base64 安全跳转页） | `_config.yml → hexo_safego.general.enable: true` |

即：**94 = 97 − 3 个 Hexo 插件生成页**。文章 22 篇、归档 13 页、标签 31 页、分类 12 页、
独立页面 17 个 + `QwQ/equipment/jxgm-link.html`、`page/2`、`404` 等静态路由与 golden 一一对应
（`matched = 94`）。这三页属于「迁移缺口：插件生成页，需要在 Astro 侧补生成器」，不是内容丢失。

### 4.5 inherited（7，源站既有，不算迁移缺陷）

`/img/tgbj-cai-xiaochen.svg`、`/posts/801b/`、`/wordScenery/`、`/thousand/`、`/wallpaper/`、
`/uitest/Pasted image`、`/uitest/Slides Demo`。

证据：这些 URL 在 golden 里同样不存在文件，且 golden 自己的 HTML 也引用了它们——来源是文章正文里的
主题 demo/旧文链接（如「本文已过时，请看新一篇」指向 801b、docs 里的 `/img-url` 相册占位）。
源站 `vercel.json` / `netlify.toml` 没有 redirect，登记为**源站既有问题**。

### 4.6 whitelisted（1）

`WL-01 ^/img-url$`：uitest 页 Hexo tag 语法示例 `{% galleryGroup name description link img-url %}`
的占位参数（字面量 `img-url`），不是真实资源；源站 golden 对同一 demo 渲染为空 href，当前产物
多出一个相对路径。属主题 tag demo 内容的渲染差异，不影响真实导航，豁免并登记归属。

### 4.7 两个 PASS 项

- **build**：exit 0、94 页、根级 7 个文件（404.html / favicon.ico / flink_count.json / friend.json /
  index.html / LICENSE-GPL / robots.txt）。
- **tag-residue**：94 页 × 6 类标记（`\{%`、`<%`、`hexoPostRender`、hexo 注释、title/page-title
  的 undefined/NaN）= **0 命中**，产物无原始 Hexo tag 残留、无 undefined/NaN 标题。

### 4.8 结构抽样（INFO）

| 页面 | diffCount | 缺节点 | 多节点 | 主要差异分类 |
| --- | ---: | ---: | ---: | --- |
| 首页 | 484 | 322 | 20 | 属性 350 / 文本 82 / 结构 43 |
| 文章页 `/posts/p3eeb/` | 211 | 207 | 0 | 属性 166 / 结构 32 |
| 归档页 | 244 | 193 | 2 | 属性 168 / 文本 41 |
| 关于页 | 210 | 411 | 31 | 属性 150 / 结构 46 |
| 分类索引 | 174 | 235 | 38 | 属性 120 / 结构 39 |
| 标签索引 | 177 | 241 | 50 | 属性 120 / 结构 42 |

说明：`diff-html.mjs` 归一化 DOM 结构但保留属性值差异（CDN 版本号、`meta` 书写顺序、脚本注入等），
所以真实站迁移的 diffCount 不为 0 属预期；本项只给数字、不判罚。

---

## 5. 与 Lead 一次性探针（70 个缺失目标）的口径对账

Lead 用 `.tmp-lead-linkcheck.mjs` 在**更早的产物**（`.migration-out/xcAnzhiyu/dist`）上扫出
**70 个缺失目标**。本脚本三层口径如下：

| 口径 | 数值 | 说明 |
| --- | ---: | --- |
| Lead 原始（双引号 + 以 `/` 开头 + 去 fragment，正则不排除代码块/`data-*`） | 70 | 历史证据 |
| 本脚本「Lead 同口径复算」（排除代码块后） | **69** | 差 1 = `/js/flink.js`：它出现在文章正文代码块示例里（`<script src="/js/flink.js">`），不是真实链接 |
| 本脚本 fresh build（2026-11-24，HEAD `e8f4228` + 主题资产管线未提交改动）同口径 | **64** | 比 69 少的 5 条 = `/css/index.css`、`/js/main.js`、`/js/utils.js`、`/js/tw_cn.js`、`/js/anzhiyu/right_click_menu.js`，已被主题包 assets 管线补齐（见 §7） |
| 本脚本归一化口径（解析相对 URL + `pjax.loadUrl`，decode 后按 URL 归并） | **65** | 相对 URL 与 js 导航补齐后的真实缺失目标数 |

结论：**70 → 69 是「代码块假阳性」**（口径修正），**69 → 64 是工作区演进**（主题静态资源管线补齐），
不是脚本不稳定；每一次运行都在报告 `links.counts.leadStyleAbsoluteAttrMissing` 与
`links.evidence.leadStyleMissingList` 里留了逐条证据。

---

## 6. 根因与修复建议（按归属）

| 优先级 | 分类 | 根因 | 修复方向 |
| --- | --- | --- | --- |
| P0 | `old-permalink` 44 | 主题组件（文章页分页 prev/next、首页 home_top 卡片）仍用 `:year/:month/:day/:title` 旧模板拼 URL，未走 `posts/p:abbrlink/` | 主题层统一用 `postHref()`/`postRouteParams()`（migrate-hexo 已生成 `src/data/post-permalink.ts`）；顺带修模板里 `href` 缺前导 `/` 的写法 |
| P0 | `identity` 2 | 文章页 canonical / og:url 用同一套旧 permalink | 与上一项同源，修 URL 生成即可；验收脚本已把「期望 canonical = site.url + 当前路由」断言落死 |
| P1 | `page-missing` 3 | 3 个 Hexo 插件页没有等价生成器 | 在迁移站补 `/comments/`、`/bangumis/`、`/go.html` 生成（数据来自 `_config.yml` 对应段 + `source` 里的数据），或在 Astro 侧实现 safego 跳转页 |
| P1 | `taxonomy-slug` 7 | 分类链接没带父级、name 未 slugize | 主题 taxonomy helper：用完整分类路径（`categories/…/` 层级拼接）+ 空格→`-`，与生成器同一函数 |
| P1 | `feed` 2 / `sitemap` 3 / `search-index` 1 | Astro 侧没有 feed/sitemap/本地搜索索引生成器 | 补 `atom.xml`/`rss2.xml`、`sitemap.xml`/`baidusitemap.xml`/`baidu_urls.txt`、`search.xml`；本地搜索的 `GLOBAL_CONFIG.localSearch.path` 已指向 `/search.xml`，产物一到位即 PASS |
| P2 | `page-type` 2 | ① `friends_lite`（1.6.14）未映射到 `friends_vue`（1.7.1）② 主题包缺 `TodolistPage` | ① 配置迁移补映射并置 `friends_vue.enable=true`；② 新写 `TodolistPage.astro`（golden 的 `#todolist-box` / `#todolist-main` 结构可作模板） |
| P2 | `theme-asset` 1 | `/anzhiyu/random.js` 未进主题 assets 管线 | 补进主题包 assets（其余主题 JS/CSS 已由 P7-6 管线覆盖） |
| P3 | `pseudo-scheme` 2 | URL 归一化给 `mailto:` / `javascript:` 加了 `/` | 主题 URL 拼接处识别 scheme 白名单，跳过前缀补全 |
| — | `inherited` 7 | 源站正文里的 demo/旧链接 | 内容侧维护（可选：站点级 301 / vercel.json redirect），不算迁移缺陷 |

---

## 7. 工作区演进说明（重要）

本脚本的产物依赖**当前仓库 HEAD + 工作区状态**。本次首跑时工作区里有并行任务未提交的改动
（`git status`：P7-6 主题静态资源管线，新增 `packages/astro-theme-anzhiyu/assets/`、
`integration.mjs`，删除 `examples/blog/public/js/**`、`examples/blog/public/css/index.css`），因此：

- **fresh migrate+build**：`/css/index.css`、`/js/main.js`、`/js/utils.js`、`/js/tw_cn.js`、
  `/js/anzhiyu/right_click_menu.js` 已由主题包 assets 管线产出，不再计入缺口；
- **更早的 `.migration-out/xcAnzhiyu/dist`（Lead 扫的那份）**：仍引用上述 5 个文件且缺失，
  这就是 70 / 69 口径的来源。

报告头部记录了 `git HEAD`；HEAD 变化或并行任务落盘后复跑，缺口数量会变，这是**预期**，
报告 §15「局限」里有同样说明。

---

## 8. 局限

1. 链接检查只覆盖 HTML `href`/`src` + `pjax.loadUrl`；**未**扫描 `data-lazy-src`、CSS `url()`、
   `srcset`（这些若缺资源不会计入 gap，可作为后续扩展；本次已按 HTML 语义排除代码块内示例）。
2. golden 是源站**上一次** Hexo 构建快照；源站源码若在其后改过，正文差异会体现为 inherited /
   migration-gap 明细，需按 URL 人工复核。
3. `identity` 只抽样首页 / 1 篇文章 / about（模板级问题，其余页面同理；全量断言可后续加）。
4. `structure` 抽样只复用 `diff-html.mjs` 的单页模式，不参与退出码。
5. 退出码只看是否有 migration-gap；inherited / whitelisted 不影响退出码（但都在报告里逐条列出）。

---

## 9. 复跑与负向用例验证

| 场景 | 命令 | 预期 / 实测 |
| --- | --- | --- |
| 全量首跑 | `node scripts/accept-migration.mjs` | exit 1，25s，67 gap |
| 复用工作目录重跑 | `--out .migration-out/accept-… --reuse` | exit 1，跳过 migrate/install，重新 build + 检查 |
| 只查不建 | `--out … --reuse --skip-build` | exit 1，<3s |
| 机器可读 | `--json` | stdout 为纯 JSON（`JSON.parse` 通过），人读进度走 stderr |
| 环境错误 | `--site D:/nope` | **exit 2**，报告仍写出（`blocked.phase=prepare`，含原因与阶段记录） |
| 帮助 | `--help` | exit 0 |

---

## 10. 本次产物清单

- `scripts/accept-migration.mjs` — 验收脚手架（~2600 行，含设计注释、classifier、whitelist、报告渲染）
- `.migration-out/accept-20261124-191107/acceptance-report.json` — 机器可读报告（含每个 gap 的 URL / 状态 / 页面数 / 页面样本 / 建议）
- `.migration-out/accept-20261124-191107/acceptance-report.md` — 人读报告（分类计数表、逐类缺口、身份表、页面类型表、结构抽样、修复建议）
- `.migration-out/accept-20261124-191107/logs/*.log` — migrate/install/build/diff 的完整原始输出
- 本文档

（`.migration-out/` 在 `.gitignore` 中，报告与产物不进仓库。）

---

## 11. 建议加入根 `package.json` 的脚本（由 Lead 统一加）

```json
{
  "scripts": {
    "accept:migration": "node scripts/accept-migration.mjs"
  }
}
```

CI 里若想不依赖完整构建（已有 dist 产物时）：

```json
"accept:migration:check": "node scripts/accept-migration.mjs --reuse --skip-build"
```
