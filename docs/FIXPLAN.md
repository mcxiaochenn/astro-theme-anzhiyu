# Fix Plan — 审查问题修复计划

> 来源：2026-11-24 全量只读审查（对照上游 anzhiyu-c/hexo-theme-anzhiyu 1.7.1 / `72439d93` 与仓库自身 README/PLAN/差异档口径），已做假阳筛查。基准 HEAD `eb3f493`。
> 本文档是修复执行的唯一任务清单。每个 ID 对应审查报告中的编号（H=高 / M=中 / L=低），可追溯。

---

## 0. 执行约束（先读）

1. **上游镜像禁改**：`examples/blog/src/styles/upstream/**` 与 `examples/blog/theme.config.yml` 是 SHA 守卫的基线证据（upstream-delta.md §4.5），任何触碰都会让 `pnpm check:upstream-delta` 变红。修复不碰它们。
2. **与 upstream-delta 锚点冲突时**：先改 `docs/upstream-delta.md` 正文 + §5 锚点，再动代码，commit 信息写明基准数字为什么变。
3. **构建/浏览器验证走 CI**：本地不跑 `astro build` / Playwright / Lighthouse（沙箱跑不了浏览器）。本地只跑 node 脚本级验证：`node packages/remark-hexo-tag/test/run.mjs`、`node scripts/check-*.mjs`、`node scripts/verify-css.mjs`、`node scripts/compare-css-vars.mjs` 等只读检查。
4. **Git 红线**：只做本地 commit（按 Batch 分组），**不 push、不打 tag、不 publish**。push/tag/publish 需用户单独授权。
5. **验收口径同步**：任何修复改变了 README/PLAN 里的数字（用例数、页数、差异条数、skip 数），必须同步全部出现处，不允许留下两个口径。
6. **「实现 or 登记」二选一项**（A6、B2）：默认实现；工作量明显超预期时降级为「README 登记为已知缺口」，并在执行报告标注降级原因。

## 1. 假阳筛查记录

筛查方式：逐条对源码复验（grep/read 原文 + 对消费链反查）。

- **删除 0 条**：无假阳。
- **措辞修正 3 条**（结论仍成立，按修正后表述执行）：
  - **M1**：check-loader 的全量深比较不是「恒真」——它能抓到 defaults 多出上游不存在的键；**抓不到**的是值漂移与上游新增键漂移（merge 后用户侧值恒胜出）。修复目标不变（加 defaults ↔ upstream 直比断言）。
  - **M24**：不是「唯独 navigation 用基础 test」——`pwa.spec.ts:20` 也用基础 test 但自行调用 `isolateExternalRequests`；navigation 既没用 helpers 的 test 也没自行挂隔离，3 条用例裸奔。修复只动 navigation。
  - **L2**：「schema 134 键」的精确总数以 `check:schema` 运行输出为准；已坐实的是 friends_lite（`schema.ts:823`）使 shape ≠ 上游 133 键。按此表述修文档。

## 2. 修复批次

执行顺序：**A → B → C → D → E → G → F**（F 文档收尾一次性对齐最终数字）。每 Batch 一个 commit。

---

### Batch A · additional-js 脚本/容器层补齐（功能缺口，根因同一：上游 additional-js.pug 与 shortcutKey.pug 的非组件节点漏移植）

修完这批即与上游行为一致，**不需要**登记上游差异。

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| A1 (H1) | `packages/astro-theme-anzhiyu/src/components/head/AdditionalJs.astro`（对照上游 additional-js.pug:44-50）；注释现状见 `third-party/search/local-search.astro:5-7` | 补搜索脚本块：`algolia_search.enable` → algolia_search + instantsearch + algolia_js 三件套；else `local_search.enable` → `assetUrl('local_search')`。docsearch 分支不动 | `local_search.enable=true` 构建产物 `<head>`/body 含 `js/search/local-search.js` 引用；e2e `search.spec.ts` 两条用例可实跑（去掉因脚本缺失而 skip 的前提） |
| A2 (H2) | 同上（上游 :52-54） | `mainTone.mode==='colorthief'` 时输出 `<script src={assetUrl('colorthief')}>` | 构建产物含 `color-thief.umd.min.js` 引用；`main.js:1279` 分支不再 ReferenceError（人工或 e2e 断言 window.ColorThief 存在） |
| A3 (M10) | 同上（上游 :79-81） | `comment_barrage_config.enable && comments.use==='Twikoo' && page.comments` 时注入 `comment_barrage_js`（`data-pjax`） | 构建产物含 `js/anzhiyu/comment_barrage.js` 引用；Console 开关与 `.comment-barrage` 容器联动 |
| A4 (M11) | 同上（上游 :126-127 脚本、:131-132 容器） | 补 busuanzi 脚本节点（theme.asset.busuanzi 或默认 CDN）；补 `#greetingBox` 容器（`is_current('/') && greetingBox.enable`） | `busuanzi.site_uv=true` 时页面含 busuanzi 脚本；`greetingBox.enable=true` 首页存在 `#greetingBox` 且 `main.js:1536` 不再空转 |
| A5 (H5) | 新组件移植上游 `shortcutKey.pug`（挂 `layout.pug:80-81` 位置，样式 `upstream/_layout/shortcutKey.styl` 已有） | 输出 `#keyboard-tips` 帮助浮层 + 11 条键位说明（i18n 键 `shortcut.*`） | `shortcutKey.enable=true` 构建后 DOM 含 `#keyboard-tips`；window focus / Shift 释放无 TypeError（对照 `main.js:1644/1686/1693`） |
| A6 (M12) | `HomeTop` 区域（上游 bbTimeList 位置）；消费链 `assets/js/utils.js:459/472`、`main.js:215-217` | 实现 `#bbTimeList`/`#bbtalk` 渲染，按 `site.data.essay`（examples 为 `data/essay.yml`）门控 | 站点有 essay 数据时首页输出 `#bbTimeList`；无数据时零输出。工作量超预期则降级：README 登记缺口 |

### Batch B · 契约与配置层

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| B1 (H3) | `examples/blog/src/content.config.ts:119`、`src/components/post/PostAiDescription.astro:23`、`render.mjs:480`、`slug.astro:119` | `ai` 放宽 `z.union([z.boolean(), z.string()])`；门控改真值判断（对齐上游）；postAI 传原值不 `String(true)` | `ai: true` 不再把 `"true"` 当摘要输出；`ai: "摘要文本"` 可通过 schema 并在 local 模式正常显示 |
| B2 (H4) | `src/components/head/AdditionalJs.astro:169-171`、`src/components/third-party/math/render.mjs:19-24` | 路由层把 front-matter `mathjax`/`katex` 透传给 `<MathIndex page={…}/>`（与 aplayer 一起补 page 级开关）；修正 :170 注释与 PLAN.md:732「行为一致」表述；**内容侧公式管线缺口**（无 remark-math，`$...$` 不渲染）在 MIGRATION.md 登记为已知边界 | `per_page:false + 文章 mathjax:true` 时脚本可加载（此前永不可达）；MIGRATION 有明确登记 |
| B3 (H7) | `src/config/schema.ts:35/492-498` 等 | 渲染容缺的数组元素子键改 `.optional()`：`rewardQrCodeSchema.link`、nav menu item `icon`、footer badge `message`、footer social `title`、home_top.category `shadow`/`class`；`home_top.category[].icon`（`BannerGroup.astro:68` 无条件消费）保持必填 | 手写 reward.QR_code 元素省略 link 可通过 loader 且渲染走 `item.link || item.img` 兜底；README 配置说明列必填/可选清单 |
| B4 (H8) | `examples/blog/src/pages/archives/_data.ts:193`、`src/components/**/post-list.ts:338`、`[year]/[month]/[day]/[slug].astro:50-51` | 「文章 URL 末段 = abbrlink ?? id」收口成单一解析函数（并入 site.ts postHrefOf 缺省实现），列表/路由共用 | 新增 abbrlink fixture 文章：归档/分类/标签/404 链接与实际路由一致，CI 冒烟覆盖 |
| B5 (M14) | `examples/blog/astro.config.mjs:687-691`、`packages/astro-theme-anzhiyu/src/config/loader.ts:37` | 让 HTML 与 CSS 读同一份配置：examples/blog 用 loader 认识的名字（`anzhiyu.config.yml`）或构建时显式传 configPath；README 明示各配置文件作用域 | 改 examples/blog 的主题配置能同时改变 CSS 与 HTML 输出；无静默双通道 |
| B6 (M18 + L2) | `examples/blog/src/data/site-data.ts:23`、`examples/blog/package.json:12-15`、`src/config/schema.ts:820-823/935` | examples/blog dependencies 加 `"yaml": "^2.9.1"`；schema 注释与 README 的「133 顶层键」改为「133 上游键 + friends_lite 兼容键」口径（精确总数以 `check:schema` 输出为准） | 独立安装 examples 依赖后 `import 'yaml'` 可解析；README/schema 注释/check-schema 输出三方数字一致 |

### Batch C · 迁移工具正确性（scripts/migrate-hexo.mjs 与 diff-html.mjs）

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| C1 (M2) | `scripts/migrate-hexo.mjs:232-247`、`:2616-2623` | `timezoneOffsetMinutes`：裸 `GMT` 记 0（UTC 站不再回落 +08:00）；DST 时区不再按 6/1 固定采样——按文章日期现场换算（Intl）或至少登记限制到 MIGRATION.md | 新增 UTC 时区 fixture：迁移后日期不平移 8 小时；DST 用例有明确断言或登记 |
| C2 (M3) | `scripts/migrate-hexo.mjs:2996-3003` vs `:1130-1132` | postHref 对 `.html`/`.htm` 末段不加尾斜杠，与 createPostPathResolver 对齐（最好抽同一函数） | `.html permalink` fixture：postHref 与 resolver 产出同形 URL，链接不 404 |
| C3 (M4) | `scripts/migrate-hexo.mjs:1084-1086` | parsePostDateParts 正则对齐 content.config.ts hexoDate 的 `[-/]` 双分隔符；fallback 改告警不伪造 1970 | `date: 2024/01/15` fixture：random.js posts 列表链接年月日正确 |
| C4 (M5) | `scripts/diff-html.mjs:682-743` | N21 豁免的 id 收集/删除跳过 `pre/code/textarea` 内部（或只保留整段字面量形态，删宽泛 inlineArtifact 收集） | 代码块含 `## word` 的页面不再牵连两侧真实标题；`--verbose` 输出已收集 id 便于审计。**注意**：收紧豁免可能让现有基线出现新 FAIL，需重跑 `diff-html --all` 并按 upstream-delta §7 流程决定是真回归还是口径调整 |
| C5 (L12) | `scripts/migrate-hexo.mjs:2693-2696` | twikoo.styl 修正的 warning/日志移进 `if (!DRY)`，dry-run 改「将修正…」措辞 | `--dry-run` 输出零「已修正」字样 |

### Batch D · 验收假绿堵死（「48/48 / gap=0 / 全等」变不可绕过）

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| D1 (M6) | `scripts/diff-html.mjs:1445/1519-1531`、`README.md:156` | `--all` 模式 baseline 缺失 / 无 pages / filter 无命中 → 非零退出（或 `--strict` 开关 + CI 启用）；skipReport 的 ok 不再为 true；README 本地验证清单补 `pnpm baseline:extract` 前置步骤 | 删掉 .baseline-html 后 `diff-html --all` exit ≠ 0；CI 加一行对 `diff-report.json` 的 skipped 断言 |
| D2 (M9) | `scripts/verify-css.mjs:45-49` | baseline 缺失改 fail（迁移期豁免用显式 env 开关）；SHA 不一致由 WARN 升 FAIL 或显式登记 | 删 baseline.json 后 `pnpm verify` exit ≠ 0 |
| D3 (M7) | `scripts/accept-migration.mjs:1711-1715` | search 检查以源站 `facts.config.search` 为前提：源站启用而产物缺 localSearch/索引 → 计 gap；SKIP 只留源站未启用 | 构造缺搜索产物的用例 → gap > 0 |
| D4 (M8) | `scripts/accept-migration.mjs:1777` | feed/sitemap gap 条件加 `row.items !== row.goldenItems` | 条目数不等（非零）→ gap > 0 |
| D5 (M1) | `packages/astro-theme-anzhiyu/scripts/check-loader.mjs:139-143` | 加真断言：`deepEqual(defaults, parse(upstream _config.yml))`（键序无关），或对比 gen-defaults 内存输出与现文件字节；接入 `pnpm verify` 或 CI | 故意改 defaults.ts 一个值 → check 失败（当前会假绿） |

### Batch E · 依赖与工程门槛（发布前「最后一公里」）

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| E1 (H6) | `packages/remark-hexo-tag/package.json`、`src/tags/thirdparty/index.mjs:20` | 加 `"dependencies": {"yaml": "^2.9.1"}`；根 README.md:67「纯 ESM、零依赖」改如实描述 | 独立目录安装 tarball 后 import 成功；`npm pack` 清单含 package.json dependencies |
| E2 (M22) | 根 `package.json:6-8`、`packages/astro-theme-anzhiyu/package.json:28` | engines 统一 `">=22.23.4"`（或 README 改真实下限，二选一取前者） | 两处 engines 与 README 一致 |
| E3 (L1) | `packages/astro-theme-anzhiyu/scripts/gen-defaults.mjs:20-27`、check-schema.mjs、check-loader.mjs | 上游 `_config.yml` 路径存在性检查 + 明确报错（提示 `THEME_UPSTREAM_CONFIG`）；zod 版本解析不依赖 hoisted 布局 | 无 `_research` 的环境跑三个脚本得到清晰报错而非裸 ENOENT 栈 |
| E4 (L14) | 根 `package.json:22-25` | `@playwright/test` 与 `playwright` 统一同一精确版本 | 两行版本一致 |
| E5 (L15) | `.gitignore:59` | 补 `playwright-pwa-report/`、`test-results-pwa/`、`.lighthouseci/` | 本地跑 PWA e2e/lhci 后 git status 干净 |

### Batch G · 测试与代码卫生

| ID | 位置 | 修什么 | 验收 |
|---|---|---|---|
| G1 (M24) | `tests/e2e/navigation.spec.ts:22` | 改 `import { test, expect } from './helpers'`（Page 类型保留 `@playwright/test` 的 type import） | 3 条导航用例走 helpers 的 isolateExternalRequests |
| G2 (L16) | `tests/e2e/pwa.spec.ts:54` | precache 断言下界由 48 提到实测值（文档口径 84，按产物变化同步注释） | 下界与 P7-1 笔记口径一致 |
| G3 (L4) | `src/components/widget/CardNewestComment.astro`、`Console.astro:102-104` | 删死卡（或修好 lang 后让 Console 复用，二选一取删除）；「15 aside 卡片」口径改精确（12 aside + 2 中控台 + 1 最新评论） | 全仓无未引用 widget 卡；README/PLAN 口径同步 |
| G4 (M15) | `examples/blog/src/pages/debug-collection.astro`、`page2.astro`、`src/layouts/BaseLayout.astro`（examples 侧 P1.5 平行实现）、`public/slice-harness.js` 等 | 删除调试页与孤儿资产（bgm.wav / pug-probe.svg 一并评估）；「62 页」口径同步改 | 构建产物无 /debug-collection/、/page2/；README 页数口径更新 |
| G5 (L7) | `scripts/compare-css-vars.mjs:221-222` | 汇总文案按 upstreamChecked 分叉（未复核时不写「取值集合一致」） | 无 `.baseline-work` 环境输出含「未验证」字样 |
| G6 (L8) | `packages/vite-plugin-stylus-hexo-config/src/index.mjs:205-213` | 双引号告警去重 + warnOnMissing 统一门控；README 限制节补值改写说明 | 同键告警只打一次 |
| G7 (L11) | `packages/remark-hexo-tag/src/index.mjs:236-244` | raw 正文对 `ends===false` 块级（checkbox/radio）也展开，或 README 已知限制列受影响 tag 清单 | videos/btns 内嵌 checkbox 不留 `{% %}` 字面量（或限制已登记） |
| G8 (L5) | `src/components/widget/Card*.astro`、`AsideContent` | tp() 调用透传 `site.language`（与 Console 的 `_p` 同型） | en 站点侧栏标题不落中文 default 字典 |

### Batch F · 文档对齐（收尾一个 commit，数字以修复后实态为准）

| ID | 位置 | 修什么 |
|---|---|---|
| F1 (H9) | `docs/MIGRATION.md:658-659`、`:736` | tag FAQ 改「42 个全实现 + lenient 语义」；§13.2.2 标历史结论 |
| F2 (H10) | `docs/MIGRATION.md:630-648` | permalink FAQ 改「路由已按源站 permalink 落位；redirect-map 仅不支持 token 时需要」 |
| F3 (H11) | `README.en.md` 全文 | 按 README.md 当前状态重写 status 块/勾选/路线图（或整页标 historical 指向中文版） |
| F4 (M13) | `docs/MIGRATION.md:254-258/275`、`docs/PLAN.md:730` | todolist 划出「未分发/无消费者」名单；真实边界收窄为 charts + sitetime |
| F5 (M16) | `examples/blog/README.md:3` | 62 页构成改真实算式（48 基线 + 12 独立 fixture + 2 调试页；G4 清理后按实际改） |
| F6 (M17) | `examples/blog/README.md:50` | 「112 条差异」改「48/48 PASS / 0 差异（CI 硬门禁）」 |
| F7 (M19) | `README.md:203` | 路线图 Phase 7 与状态块统一（✅ 或注明仅剩发布授权） |
| F8 (M20) | `docs/PLAN.md:262-265/702-711` | 阶段总览刷新；§8.1 旧快照删或加「历史快照」头注；94/97 页口径统一 |
| F9 (M21) | `docs/PLAN.md:236-239` | 删/补 `check-features.mjs`；「视觉回归」改「行为 e2e」；28/29 项统一 |
| F10 (M23) | `docs/upstream-delta.md:18-27` + `README.md:188` + `README.en.md:99` + `PLAN.md:70` | 总表补 U9 行；三处引用改 U1–U9 / 9 项 |
| F11 (M25) | `README.md:48`、`:200` | 音乐条目拆开表述（CI 验证 DOM 持久化；播放进度属真实浏览器验证）；9 skipped 归因改「搜索2+右键3+暗色右键1+音乐1+pwa2」 |
| F12 (M26) | `README.md:40`、`docs/notes/P7-4-final-acceptance.md:88` | 快捷键描述改「config 总闸开启即自动注册（main.js:1752-1757），关闭不持久」；P7-4 归因改为构建配置导致 #consoleKeyboard 未输出，并补 #keyboard-tips 缺口记录 |
| F13 (L3) | `README.en.md:29` | 「83 dictionary entries」改断言口径或真实条目数（91/165/165/165） |
| F14 (L6) | `README.md:52/199` | page.type 12/13 口径统一，注明 todolist 覆盖方式 |
| F15 (L9) | `README.md:109` | 注明 `/css/index.css` 为结构性空占位，真实样式走 `/_astro/*.css` |
| F16 (L10) | `packages/remark-hexo-tag/src/parser.mjs:137` | 「59/59」改 62/62 或指向 test/run.mjs |
| F17 (L13) | `examples/blog/README.md:14` | public/ 目录清单改 `public/{img,anzhiyu}/` + integration 注入说明 |
| F18 (L17) | `docs/notes/P7-2-perf.md:450` 起 | §6.2/6.3 用 baseline.json 回填或标「历史快照，终值见 §8」；内联阈值改 seo 0.82 |

---

## 3. 完成定义（DoD）

1. Batch A–G 各自验收列全部满足；F 的每个数字在仓库内唯一。
2. `node scripts/check-upstream-delta.mjs` 绿（若动了锚点，upstream-delta.md 已同步）。
3. `node packages/remark-hexo-tag/test/run.mjs` 62/62（G7 若扩测试则按新计数同步 F16）。
4. CI 三 job（build / e2e / lighthouse）全绿；e2e 的 9 skipped 里因脚本缺失导致的 skip（搜索 2、音乐 1）应减少或有明确归因。
5. 执行报告 `docs/notes/FIX-<日期>.md`：逐 ID 状态（done / deferred+原因），贴关键命令输出。
6. 本地 commit 按 Batch 分组，不 push。

## 4. 风险提示

- **C4** 收紧 N21 可能让现有基线 diff 出现新 FAIL：先判断是真回归还是口径变化，口径变化走 upstream-delta §7 流程，不许直接洗白。
- **A5/B2** 涉及上游 pug 移植：DOM 结构保持上游原样（id/class 不改），否则 diff 硬门禁会红。
- **B5** 改配置加载通道影响 HTML 渲染全局：改完必须比对 examples/blog 构建产物页面数与关键页面 HTML 不回归（CI diff 硬门禁兜底）。
- **D 系列** 改的是验收脚本退出语义：若某历史 CI 用法依赖「跳过即通过」，改后会暴露真实缺口——这是预期行为，按缺口修，不回退语义。
