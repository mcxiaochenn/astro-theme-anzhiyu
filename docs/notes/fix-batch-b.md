# Batch B 执行报告 — 契约与配置层（B1–B6 + G4 残留清理）

> 执行：agent-6 | 2026-01 | 基准 HEAD `eb3f493`（FIXPLAN）。
> 约束遵守：零 git 写操作（仅 `git diff/grep/status` 只读）；未跑 astro build / Playwright / Lighthouse；
> 未触碰 `examples/blog/src/styles/upstream/**` 与 `examples/blog/theme.config.yml`（`check-upstream-delta` 29/29 绿）；
> 文档数字口径与 README/PLAN/MIGRATION 文字一律未改，全部列入「待 F」。
> 本工作树同时有 C/E/G 等批次的并行未提交改动（git status 可见），本报告只覆盖下表文件。

## 0. 审查修正 / 范围澄清记录（约束 5、范围冲突以代码为准）

| # | 事项 | 处置 |
|---|---|---|
| R1 | 写范围「examples/blog/src/content/**（新增 fixture）」与代码实际不符：内容集合从**仓库根 `fixtures/`** 加载（`examples/blog/src/content.config.ts:80-83` `base: '../../fixtures'`），`examples/blog/src/content/` 不存在 | 按任务「先看现有 fixture 文章放哪、命名习惯」落位 **`fixtures/abbrlink-post.md`**（与 `short-note.md`/`sticky-top.md` 同目录、kebab-case 命名）。放 `src/content/` 对集合不可见 |
| R2 | 写范围「third-party/math/render.mjs」与 B1「render.mjs:480」指代不一：B1 的 480 行在 `third-party/render.mjs`（renderAiInfo），`math/render.mjs` 仅 139 行 | 两个文件都按任务条目各改一处：`third-party/render.mjs:482`（B1 门控）、`math/render.mjs:18-25`（B2 per_page 真值对齐） |
| R3 | B2 范围冲突：「仅 MathIndex 传参与注释两处」vs「与 aplayer 一起补 page 级开关」。已 send_message 请 Lead 裁决，回执：**裁决 B**——`<Aplayer page={{aplayer}}/>` 授权，:257-259 注释同步，写范围扩为「MathIndex/Aplayer 传参与对应注释」 | 按 B 执行。AdditionalJs 改动 = Props/destructure + MathIndex 传参 + Aplayer 传参 + 3 处注释（文件头 :27-33、MathIndex :220-222、Aplayer :257-260） |
| R4 | B2 透传要求 front-matter 契约含 `katex`，content schema 只声明了 mathjax/aplayer/comments、漏 `katex`（passthrough 不报错但契约不对称） | `content.config.ts:112-114` 补 `katex: z.boolean().optional()`（B2 的 schema 侧补丁，任务条目未明列） |
| R5 | `[...path].astro:158-159` 存在 B1 同型 bug（`String(data.ai)` 把 `true` 落成 `"true"`），在写范围内 | 与 slug.astro 同步修（必答 1 计入） |

## 1. 逐 ID 状态

| ID | 状态 | 交付要点 |
|---|---|---|
| B1 (H3) | ✅ 完成 | ai 放宽 `z.union([z.boolean(), z.string()])`；门控改真值判断；postAI 传原值不 `String(true)`（4 文件 + R5 第 5 处同步）；node 断言 5/5 |
| B2 (H4) | ✅ 完成（代码）/ 文档登记留 F | front-matter → 路由 → BaseLayout → AdditionalJs → `<MathIndex page={…}/>``<Aplayer page={…}/>` 全链打通；per_page:false + mathjax:true 可达（node 断言 4/4）；两条文档登记文本见「待 F」#1/#2 |
| B3 (H7) | ✅ 完成 | 6 个容缺子键改 `.optional()`；`home_top.category[].icon` 保持必填（BannerGroup.astro:68 依据）；node 断言 7/7 |
| B4 (H8) | ✅ 完成 | `postSlugOf()` 收口三处调用 + `fixtures/abbrlink-post.md`；node 断言 4/4；链接一致性冒烟待 CI |
| B5 (M14) | ✅ 完成（静态推理）/ 构建验证待 CI | 构建时显式 `configPath=theme.config.yml`，HTML/CSS 双通道收口同文件；证据链见必答 5 |
| B6 (M18+L2) | ✅ 完成 | `"yaml": "^2.9.1"` 入 dependencies；schema 注释改「133 上游键 + friends_lite 兼容键 = 134」（check-schema 实测）；README 口径留 F |
| G4 残留 | ✅ 完成 | 删 3 文件 + 2 script；grep 零悬空（余 2 条非悬空说明见必答 7）；tests/artifacts/** 原样保留 |

## 2. 必答逐条

### 必答 1 · B1 四文件改动点 + 两输入静态推演

| 文件 | 位置 | 改动 |
|---|---|---|
| `examples/blog/src/content.config.ts` | :122-124（原 :119） | `ai: z.boolean().optional()` → `ai: z.union([z.boolean(), z.string()]).optional()`（注释注明 ai-info.pug:5 真值门控与 ai_abstract.js local 的 `postAI.split(',')`） |
| `packages/astro-theme-anzhiyu/src/components/post/PostAiDescription.astro` | :26-27、:30（原 :23） | `ai={ai === true}`（收窄布尔）→ 真值门控 + 原值透传：`const aiGate = ai ? (ai as boolean) : undefined` → `<AiInfo ai={aiGate} …/>`（ai-info.astro 的 Props 暂收窄 boolean，过界断言，运行时原值） |
| `packages/astro-theme-anzhiyu/src/components/third-party/render.mjs` | :482（原 :480） | `if (!fill \|\| page.ai !== true)` → `if (!fill \|\| !page.ai)`——真值判断、postAI 传原值（字符串放行，不再只认 `=== true`） |
| `examples/blog/src/pages/[year]/[month]/[day]/[slug].astro` | :119 | `postAI={page.data.ai ? String(page.data.ai) : undefined}` → `postAI={typeof page.data.ai === 'string' ? page.data.ai : undefined}`——字符串原值，**不 `String(true)`** |
| （R5 同步）`examples/blog/src/pages/[...path].astro` | :158-159 | 同型 `String(data.ai)` → `typeof data.ai === 'string' ? data.ai : undefined` |

静态行为推演（node 断言佐证）：

- **`ai: true`**：schema boolean 分支 ✓ → `aiGate=true` → renderAiInfo（cfg.enable、fill=description‖正文非空、`!page.ai` 为假）→ 输出 `.post-ai-description` 整块：`.ai-title`（AI-摘要 + #ai-tag + 图标）、`.ai-explanation`「AI初始化中...」、`.ai-btn-box` 5 钮、`script[data-pjax][src=ai_abstract_js]`。postAI 通道：`typeof true !== 'string'` → postAI=undefined → `global-config.ts:297 escapeQuote(undefined)` → `GLOBAL_CONFIG_SITE.postAI: ''` → ai_abstract.js:285 local 模式 `"".split(",")` → `startAI("")`，**输出空摘要动画而不是 "true" 文本**（验收「ai:true 不再把 "true" 当摘要输出」✓）。
- **`ai: "摘要文本"`**：schema string 分支 ✓ → `aiGate="摘要文本"`（原值）→ renderAiInfo `!page.ai` 真值放行 → 同样出块（改前 `page.ai !== true` 会把字符串挡掉，块都不出）→ postAI="摘要文本" 原值 → `GLOBAL_CONFIG_SITE.postAI='摘要文本'` → ai_abstract.js:285 `postAI.split(",")` → local 模式 `startAI("摘要文本")`——**摘要正常显示**（验收 ✓；`"a,b"` 形态沿上游语义随机取一条）。
- 补充：`ai:false`/缺省 → `aiGate=undefined` → 块不输出；fill 为空也不出块（与上游 `pageFillDescription && page.ai` 一致，断言 4/5）。

### 必答 2 · B2 透传全链 + 可达性推演 + 两条文档登记文本

全链（front-matter → 判断点）：

1. front-matter `mathjax: true` → `examples/blog/src/content.config.ts:111`（mathjax）、:112-114（katex，R4 补）声明 `z.boolean().optional()` → `entry.data.mathjax`
2. `slug.astro:99`（`pageSwitch` 归一：boolean 原值 / 否则 undefined）→ `slug.astro:121-124`：`pageComments={pageSwitch(page.data.comments)}`、`pageMathjax=…mathjax`、`pageKatex=…katex`、`pageAplayer=…aplayer`（独立页面同：`[...path].astro:162` + :189-192）
3. `packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro:118-125`（props pageMathjax/pageKatex/pageAplayer，pageComments 为 A 批既有）→ :152（destructure）→ :563-575 `<AdditionalJs … pageMathjax={pageMathjax} pageKatex={pageKatex} pageAplayer={pageAplayer} pageComments={pageComments} />`
4. `AdditionalJs.astro:65-74`（props）→ :83-85（destructure）→ **:234** `<MathIndex page={{ mathjax: pageMathjax, katex: pageKatex }} />`；**:272** `<Aplayer page={{ aplayer: pageAplayer }} />`（Lead 裁决 B，R3）
5. `math/index.astro:22` `renderMathIndex(theme, Astro.props)` → `math/render.mjs:128-134` 按上游 index.pug 顺序拼 mathjax→katex→mermaid → `renderMathjax:43`/`renderKatex:30` 各自 `perPageGate(theme, <key>, pageOf(props))` → **`math/render.mjs:18-27 perPageGate`**（判断点）：`theme[key].enable` ✓ → `per_page` false 分支 → `Boolean(page.mathjax)`（:25，B2 按上游 `if page.mathjax` 真值语义对齐）。

`per_page:false + 文章 mathjax:true` 脚本可达性推演：

- 改前：`<MathIndex />`（无 props）→ `pageOf({})` = `{}` → `page.mathjax` undefined → gate false → **MathJax 脚本永不可达**（即审查结论「此前永不可达」）。
- 改后：链路 1→5 送 `page.mathjax=true` → gate（enable ✓、per_page=false、`Boolean(true)` ✓）→ renderMathjax 输出 `window.MathJax` 配置内联块 + 动态插入 `<script id="MathJax-script">`。node 断言：`B2 per_page:false + page.mathjax:true → MathJax 脚本可达` PASS；`page.katex` 缺省不输出、`page: {}` 双关均不输出（3 条 PASS）。
- aplayer 同构：renderAplayer（`third-party/render.mjs:444-454`）门控 `pjax.enable || aplayerInject.per_page || page.aplayer === true`——`page.aplayer` 分支自此可达（pjax 关 + per_page false 时）。aplayer.astro/renderAplayer 本体不在写范围，`=== true` 判断保留（pageSwitch 输出已是 boolean，语义等价）。
- pageComments：A 批已通 BaseLayout/AdditionalJs（缺省 undefined=不输出），本批补路由传参（:121 / :189）→ AdditionalJs:242 `commentBarrageEnabled && commentsUseIsTwikoo && pageComments`。

**B2 两条文档登记的准确文本（给 F）**：

1. `docs/MIGRATION.md` §13.2「其它已知限制」（:736 起）新增一条：
   > **内容侧公式管线缺口（Batch B 登记）**：站点 Markdown 渲染链未接 remark-math，正文 `$...$` / `$$...$$` 不会被解析成公式节点；主题侧 mathjax/katex 的脚本与样式已按 page 级开关正确加载（Batch B 透传：`per_page: false` + front-matter `mathjax: true`/`katex: true` 可达），但要看到公式效果需站点侧自行接入 remark-math，或在正文中直接写渲染后的 HTML。属内容管线缺口，非主题渲染层回归。
2. `docs/PLAN.md:732` 原文「7. **page 级开关未透传**：`page.mathjax` / `page.katex` / `page.aplayer`（默认 `per_page: true` 时由主题配置门控，行为一致）」改为：
   > 7. **page 级开关已透传（Batch B）**：`page.mathjax` / `page.katex` / `page.aplayer` 由路由层 front-matter 透传进 BaseLayout → AdditionalJs → `<MathIndex page={…}/>` / `<Aplayer page={…}/>`；`per_page: false` 时按上游 `math/index.pug` 语义读 `page.mathjax` / `page.katex`。内容侧公式管线缺口见 MIGRATION.md §13.2。

### 必答 3 · B3 子键清单 + reward 兜底 + icon 必填依据

改前必填 → 改后可选（`packages/astro-theme-anzhiyu/src/config/schema.ts`）：

| 子键 | 改前 | 改后 | 位置 |
|---|---|---|---|
| `rewardQrCodeSchema.link` | `nullableString`（必填可空） | `nullableString.optional()` | :498-499 |
| nav menu item `icon` | `z.string()` | `z.string().optional()` | :48 |
| footer badge `message` | `z.string()` | `z.string().optional()` | :286 |
| footer social `title` | `z.string()` | `z.string().optional()` | :301 |
| home_top.category `shadow`/`class` | `z.string()` ×2 | `z.string().optional()` ×2 | :220-221 |
| home_top.category `icon` | 必填 | **保持必填** | :224 |

- **`nullableString` 语义不动**：:35 `const nullableString = z.string().nullable()` 未改；link 是 `string | null | undefined`，null（上游默认）与省略都合法。
- **reward.QR_code 省略 link 的渲染兜底**：`item.link || item.img` 在 `packages/astro-theme-anzhiyu/src/components/post/PostReward.astro:46`（`<a href={urlFor(item.link || item.img)} target="_blank">`）；控制台打赏卡同型兜底 `Console.astro:91`。即省略 link 时二维码图自身当链接，不产出坏 `<a href>`。
- **icon 保持必填依据**：`packages/astro-theme-anzhiyu/src/components/home/BannerGroup.astro:68` `{item.icon.startsWith('fa') ? …}`（与 :70/:74 连锁）无条件调用 `startsWith`，`icon` 缺省即 TypeError；schema 层挡住。node 断言：省略 icon 的 home_top.category 配置 **校验失败** ✓，带 icon 通过 ✓。

### 必答 4 · B4 解析函数 + 三处调用点 + fixture + node 断言

最终形态（`packages/astro-theme-anzhiyu/src/layouts/site.ts:65-79`，紧邻 postHrefOf :60-63）：

```ts
/** 文章 URL 末段解析（B4 收口）：`abbrlink ?? id`。…（注释含上游 abbrlink 插件语义与 0 值说明） */
export function postSlugOf(entry: { id: string; data: Record<string, unknown> }): string {
  const abbrlink = entry.data.abbrlink;
  if (abbrlink !== undefined && abbrlink !== null && abbrlink !== '') return String(abbrlink);
  return entry.id;
}
```

收口的三处调用点：

| 调用点 | 位置 | 改前 → 改后 |
|---|---|---|
| 文章路由 slug | `slug.astro:49-50` | 手写 abbrlink 三段判空 → `const slug = postSlugOf(entry)` |
| 列表默认 path | `packages/astro-theme-anzhiyu/src/components/post/post-list.ts:339`（原 :338） | `/${y}/${m}/${d}/${entry.id}/` → `…/${postSlugOf(entry)}/` |
| 归档链接 | `examples/blog/src/pages/archives/_data.ts:194-195`（原 :193） | `…/${entry.id}/` → `…/${postSlugOf(entry)}/` |

- 附加核实：`post-page.ts:197-203 applyAbbrlink()` 对已含 abbrlink 的 path 幂等（`path.replace(/[^/]+\/$/, slug)` 只换末段），且有站点 resolver 时整段跳过（:319-321），不存在第四处错位。
- **fixture**：`fixtures/abbrlink-post.md`（新建，与 short-note.md 等同目录同命名习惯）：

```yaml
title: abbrlink 覆盖末段样本
date: 2024-11-20 10:30:00
categories: [随笔]
tags: [短讯]
abbrlink: 24531
description: 带数字 abbrlink 的 fixture：文章 URL 末段应为 abbrlink 而不是文件 id，……
```

  → 实际路由 `/2024/11/20/24531/`（id 本是 `abbrlink-post`）。复用既有分类「随笔」/标签「短讯」，不新增分类/标签页；归档/分类/标签/404 列表均可见此文。
- **node 断言输出**（`%TEMP%\b-batch-assert.mjs`）：

```
PASS B4 abbrlink:24531 → 末段 = 24531
PASS B4 无 abbrlink → 末段 = id
PASS B4 字符串 abbrlink → 原样
PASS B4 abbrlink:0 是合法值（不落回 id）
```

### 必答 5 · B5 两条配置通道与收口证据链

**改前各读什么**：

- CSS 通道：`examples/blog/astro.config.mjs:687-691`（现 :696-701）`stylusHexoConfig({ configPath: path.join(root, 'theme.config.yml') })` → Stylus 变量注入 → **读 theme.config.yml**。
- HTML 通道：组件 → `theme-context.ts:28-29` `getThemeConfig()`（无 env 时 `loadThemeConfig()` 无 configPath）→ `config/loader.ts:37` 按文件名搜索 `anzhiyu.config.yml` / `_config.anzhiyu.yml` → examples/blog 两者皆无 → **静默走 defaults**（`docs/notes/P2-2-3-layout-head.md:435` 曾登记此缺口）。两条通道各读一份 = M14 的静默双通道。

**改后收敛（方案定死：构建时显式传 configPath=theme.config.yml；未重命名、未建副本——git status 中 theme.config.yml 零改动）**：

- `examples/blog/astro.config.mjs:25-31`（新）：

```js
// B5（M14）：HTML 与 CSS 必须读同一份主题配置，消灭静默双通道。
//   - CSS 通道：下方 vite.plugins 的 stylusHexoConfig({ configPath: theme.config.yml })；
//   - HTML 通道：组件经 layouts/theme-context.ts 的 getThemeConfig() → config/loader.ts，
//     显式 configPath 由 ANZHIYU_THEME_CONFIG 提供（theme-context.ts:28-29）。
process.env.ANZHIYU_THEME_CONFIG = path.join(root, 'theme.config.yml')
```

共同读取的证据链（file:line）：

| 通道 | 链路 |
|---|---|
| CSS | `astro.config.mjs:696-701` `stylusHexoConfig({ configPath: path.join(root, 'theme.config.yml') })` |
| HTML | `astro.config.mjs:31` `process.env.ANZHIYU_THEME_CONFIG = path.join(root, 'theme.config.yml')` → `theme-context.ts:28-29`（env 值即显式 configPath，`loadThemeConfig({ configPath: explicit })`）→ `loader.ts:131-179`（读取 → defaults 深合并 → schema 校验）→ `loader.ts:19`（显式 configPath 不存在直接报错，不静默默认） |

**为什么没有双通道**：两通道现在解析到同一绝对路径 `path.join(root, 'theme.config.yml')`（同一表达式），HTML 的 ThemeConfig 与 CSS 的 Stylus 变量同源；改 theme.config.yml 一处，两路输出同时变。defaults 仅剩「站点完全没配置」时的兜底，不再参与 examples/blog 构建。`loader.ts:14-19` 注释同步记录该约定（B5 注记）。
**待 CI 验证**（本地禁 build）：改 `theme.config.yml` 一个值（如 `theme_color.main`）→ 构建产物 CSS 变量与 HTML 输出同时变化；产物页面数与关键页 HTML 不回归（diff 硬门禁兜底）。

### 必答 6 · B6 实测总数 + package.json diff

`node packages/astro-theme-anzhiyu/scripts/check-schema.mjs` 实测（原始输出）：

```
[check-schema] yaml top-level keys: 133
[check-schema] schema declared top-level keys: 134
[check-schema] unknown keys: 0
[check-schema] declared but absent in yaml: friends_lite
```

口径 = **133 上游键 + friends_lite 兼容键（1 个）= 134**。写入 `schema.ts` 两处注释：

- :826-828（friends_lite 注释块内新增）：「B6（L2）顶层键口径：**133 上游键 + friends_lite 兼容键 = 134**（check-schema.mjs 实测：yaml 133 / schema 134，唯一 declared-not-in-yaml 即本键）」
- :943（原 :935）：「schema 已声明的顶层 key（= 133 上游键 + friends_lite 兼容键，共 134；check-schema.mjs 实测 yaml 133 / schema 134）」

README「133 顶层键」口径留 F（见待 F #4）。`examples/blog/package.json` diff：

```diff
   "scripts": {
     "dev": "astro dev",
     "build": "astro build",
-    "preview": "astro preview",
-    "test:slice": "node tests/vertical-slice.mjs",
-    "test:slice:serve": "node tests/serve-and-collect.mjs"
+    "preview": "astro preview"
   },
   "dependencies": {
     "@astrojs/markdown-remark": "^7.3.10",
-    "astro": "^7.4.13"
+    "astro": "^7.4.13",
+    "yaml": "^2.9.1"
   },
```

（`yaml` 对应 `examples/blog/src/data/site-data.ts:23` `import { parse } from 'yaml'`；两 script 删除属 G4。）

### 必答 7 · G4 残留清理

删除（git status `D` ×3，`tests/artifacts/**` 11 个文件原样保留）：

| 文件 | 行数 | 性质 |
|---|---|---|
| `examples/blog/tests/vertical-slice.mjs` | 528 | P1.5 Playwright harness（首页重写后已失效，G 批报告 fix-batch-g.md:297 建议随本批清） |
| `examples/blog/tests/serve-and-collect.mjs` | 104 | P1.5 视口代理/收集器 |
| `examples/blog/src/scripts/pjax-shim.ts` | 48 | 孤儿（唯一引用方 examples 侧 BaseLayout.astro 已在 G 批删除） |

script 删除：`package.json:9-10` `test:slice` / `test:slice:serve`（见必答 6 diff）。

删除后悬空 grep（原始命令与结果）：

```
> git grep -n -E "pjax-shim|vertical-slice|serve-and-collect|test:slice" -- ":!docs"
.gitignore:37:# 垂直切片测试的临时证据（截图/日志，结论见 docs/notes/P1.5-vertical-slice.md）
scripts/diff-html.mjs:427:    if (/\/_astro\/[^"]*(?:ClientRouter|pjax-shim|BaseLayout)[^"]*\.js/.test(src)) return true

> git grep -n -E "pjax-shim|vertical-slice|serve-and-collect|test:slice" -- ".github"
NO MATCHES in .github/
```

仅剩 2 条，均非悬空引用：`.gitignore:37` 是指向 docs 历史归档的注释；`diff-html.mjs:427` 是 N21 豁免的**构建产物 chunk 名**正则（匹配 `_astro/*pjax-shim*.js`，源文件删除后自然不再命中，diff-html.mjs 属 C 批写范围未动）。package.json 无 test 别名残留；代码/CI 零悬空。

### 必答 8 · 验证命令与原始输出尾部

全部本地验证（约束 2 白名单内；输出落 %TEMP% 后回读）：

11 个检查脚本，**全部 EXIT=0**：

```
=== check-schema EXIT=0 ===
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）
=== check-loader EXIT=0 ===
[check-loader] 结果: PASS（通过 42 项，失败 0 项）
=== check-third-party EXIT=0 ===
通过 110 条，失败 0 条
P5-1 第三方集成组件门控与 DOM 验证通过 ✓
=== check-helpers / check-date / check-slugger / check-i18n EXIT=0 ===
=== upstream-delta EXIT=0 ===
[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
=== upstream-sync / tag-styles / remark-tags (packages/remark-hexo-tag/test/run.mjs) EXIT=0 ===
```

node 静态断言 1（`%TEMP%\b-batch-assert.mjs`，B1/B2/B4），EXIT=0：

```
PASS B1 ai:true → 渲染 AI 摘要块
PASS B1 ai:true → 块内无 "true" 字样
PASS B1 ai:"摘要" → 渲染 AI 摘要块（真值门控，原值放行）
PASS B1 ai:false → 不渲染
PASS B1 fill 为空 → 不渲染（上游 fill && page.ai）
PASS B2 per_page:false + page.mathjax:true → MathJax 脚本可达（此前永不可达）
PASS B2 page.katex 缺省 → Katex 不输出
PASS B2 per_page:false + page.katex:true → Katex 可达
PASS B2 page 开关缺省 → mathjax/katex 均不输出
PASS B4 abbrlink:24531 → 末段 = 24531
PASS B4 无 abbrlink → 末段 = id
PASS B4 字符串 abbrlink → 原样
PASS B4 abbrlink:0 是合法值（不落回 id）
ALL PASS
```

node 静态断言 2（`%TEMP%\b3-schema-assert.mjs`，B3 走真实 loader），EXIT=0：

```
PASS B3 reward.QR_code 省略 link → loader 通过
PASS B3 nav menu item 省略 icon → loader 通过
PASS B3 footer badge 省略 message → loader 通过
PASS B3 footer social 省略 title → loader 通过
PASS B3 home_top.category 省略 shadow/class → loader 通过
PASS B3 home_top.category.icon 仍必填且被保留
PASS B3 home_top.category 缺 icon → 校验失败（icon 保持必填） — [theme-config] 配置校验失败（…\b3-strict-icon.yml），共 1 处：
ALL PASS
```

## 3. 待 CI 验证清单（本地禁 build/浏览器）

1. **B4 链路冒烟**：`astro build` 后新文路由为 `/2024/11/20/24531/`（非 `/2024/11/20/abbrlink-post/`）；`/archives/`、`/categories/随笔/`、`/tags/短讯/`、`/404.html` 内该文链接与实际路由一致；文章页 `og:url`/版权 URL 同。期望断言：列表 href 末段 = `24531`。
2. **B1 产物断言**：（可临时给任一 fixture 加 `ai: true` / `ai: "摘要文本"`）`ai: true` → 产物含 `.post-ai-description` 且 `GLOBAL_CONFIG_SITE.postAI` 为 `''`（不出现 `'true'`）；`ai: "摘要文本"` → `postAI: '摘要文本'`，local 模式出摘要。
3. **B2 可达性**：站点 `mathjax.per_page: false` + 文章 `mathjax: true` → 页面含 `window.MathJax` 配置与 MathJax 脚本插入（node 层已证 render 可达，页面级待 CI）；`aplayer` 同构（pjax 关 + per_page false + `aplayer: true`）。
4. **B5 联动**：改 `theme.config.yml` 一个值（如 `theme_color.main`）→ CSS 变量与 HTML 输出同时变；构建页数与关键页 HTML 不回归（CI diff 硬门禁）。
5. **B3 容缺**：手写 reward.QR_code 省略 link 的配置可构建出站（node 已证 loader 侧）。
6. **B6**：独立安装 examples 依赖后 `import 'yaml'` 可解析（site-data 路径），CI 的 install/build 环节覆盖。
7. **⚠️ 新 fixture 对 diff/e2e 的口径影响（重点）**：
   - 构建页数 +1（62 → G4 删 2 调试页 → 本批 +1 = 61，最终以构建实态为准）；
   - 新文是第 11 篇 post，**会改动 golden 覆盖的列表页（首页、/archives/、/tags/短讯/、/categories/随笔/、/404.html 等）的文章列表 DOM** → `diff-html --all`（按 docs/baseline.json 的 48 页清单比对）预期在这些页出 FAIL。这不是代码回归而是基线口径变化，处置三选一（Lead/CI 决策）：(a) 走基线增补流程把新文纳入 golden（重跑上游基线）；(b) 给 diff 加列表行豁免；(c) 接受红并以 e2e 链接断言为准。本批按任务原文落 fixture，未动 baseline（写范围外）。
   - `tests/e2e/pwa.spec.ts:54` precache 下界随 +1 页再 +1（该文件属 G2 写范围，本批未动，见待 F/后续 #7）。
   - `tests/baseline-html/README.md:3/9/13`、`make-baseline-html-archive.mjs:6/123` 的「48 页」是**上游 golden** 口径，fixture 不改上游基线，无需动。

## 4. 待 F 同步清单（原文位置 → 目标内容）

1. `docs/PLAN.md:732` → 目标文本见必答 2 登记文本 #2。
2. `docs/MIGRATION.md` §13.2（:736 起）→ 新增条目见必答 2 登记文本 #1。
3. 页数口径（全仓 README/PLAN/MIGRATION）：`examples/blog/README.md:3`「62 页构成」（F5 已列）按构建实态改：48 基线 + 12 独立 fixture + 2 调试页 → G4 删 2 调试页、本批 +1 abbrlink fixture，最终数字以 CI 构建实态为准；`README.md`、`docs/PLAN.md:262-265/702-711/730` 等所有页数表述统一。
4. `README.md` 的「133 顶层键」口径 → 「133 上游键 + friends_lite 兼容键（共 134，check-schema.mjs 实测 yaml 133 / schema 134）」（与 schema.ts:826-828/:943 注释三方一致）。
5. B3 配置说明（FIXPLAN B3 验收第 2 句）：README 配置文档列必填/可选清单——`reward.QR_code[].link`、`nav.menu[].icon`、`footer.bdageitem.list[].message`、`footer.socialBar.*[].title`、`home_top.category[].shadow/.class` 为**可选**；`home_top.category[].icon` **必填**（BannerGroup.astro:68 无条件消费）。
6. `docs/notes/P2-2-3-layout-head.md:435`「examples/blog…走完整默认值」→ 历史归档可不动；若 F 统一刷新，补「Batch B 起构建显式传 configPath=theme.config.yml（ANZHIYU_THEME_CONFIG），HTML/CSS 同源」。
7. `tests/e2e/pwa.spec.ts:54` precache 下界 +1（新 fixture 页）——G2/后续批次写范围，随 CI 实测值同步。
8. README/PLAN 中 ai 字段、page 级开关（mathjax/katex/aplayer）的行为描述如仍写「未透传/仅布尔」，按 B1/B2 新行为刷新（具体出现处由 F 全量清点）。

## 5. 写范围文件清单（本批实际改动）

改：`examples/blog/src/content.config.ts`、`examples/blog/src/pages/[year]/[month]/[day]/[slug].astro`、`examples/blog/src/pages/[...path].astro`、`examples/blog/src/pages/archives/_data.ts`、`examples/blog/astro.config.mjs`、`examples/blog/package.json`、`packages/astro-theme-anzhiyu/src/components/post/PostAiDescription.astro`、`packages/astro-theme-anzhiyu/src/components/post/post-list.ts`、`packages/astro-theme-anzhiyu/src/components/third-party/render.mjs`、`packages/astro-theme-anzhiyu/src/components/third-party/math/render.mjs`、`packages/astro-theme-anzhiyu/src/components/head/AdditionalJs.astro`、`packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro`、`packages/astro-theme-anzhiyu/src/layouts/site.ts`、`packages/astro-theme-anzhiyu/src/config/schema.ts`、`packages/astro-theme-anzhiyu/src/config/loader.ts`。
新增：`fixtures/abbrlink-post.md`（R1）。
删：`examples/blog/tests/vertical-slice.mjs`、`examples/blog/tests/serve-and-collect.mjs`、`examples/blog/src/scripts/pjax-shim.ts`。
未动但写范围列出：`examples/blog/src/data/site-data.ts`（B6 只需依赖，代码无需改）、`examples/blog/src/content/**`（R1，实际落位 fixtures/）。
