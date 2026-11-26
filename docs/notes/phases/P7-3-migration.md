# P7-3 · Hexo → Astro 迁移脚本与真实站演练

- 日期：2026-11-23
- 范围：Phase 7 的 P7-3 / P7-4（迁移脚本 + 迁移指南 + 真实站演练）
- 环境：Windows 11 / Node 24.22.0（`export PATH="/c/Program Files/nodejs:$PATH"`）/ pnpm 9.14.4
- 源站：`D:/Git-project/xcAnzhiyu`（`hexo-theme-anzhiyu 1.6.14`，**只读**）
- 1.7.1 基准：`packages/astro-theme-anzhiyu/src/config/defaults.ts`（AUTO-GENERATED from
  `D:/Git-project/_research/anzhiyu-upstream/_config.yml`）

---

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `scripts/migrate-hexo.mjs` | 迁移 CLI，约 600 行，仅依赖 Node 内置模块 + 仓库已 hoisted 的 `yaml` |
| `docs/guides/MIGRATION.md` | 完整迁移指南（前置、脚本、配置、内容、资源、评论/搜索/统计、CDN、部署、回滚、验证清单、FAQ） |
| `docs/notes/phases/P7-3-migration.md` | 本报告 |
| `.migration-out/xcAnzhiyu/**` | 真实演练产物（292 个文件，被 `.gitignore` 忽略） |
| `.gitignore` | 追加 `.migration-out/` 一行（其余行未动） |

未改动：`packages/**`、`examples/blog` 现有文件、`docs/plan/PLAN.md`、其它 `docs/notes/*`、
`scripts/diff-html.mjs`。未 commit / push / 改分支。

---

## 2. 脚本用法

```bash
# 在仓库根 D:/Git-project/astro-theme-anzhiyu 执行
export PATH="/c/Program Files/nodejs:$PATH"

# dry-run：不写任何文件（含报告本身），完整报告 JSON 打 stdout
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu \
  --out .migration-out/xcAnzhiyu --dry-run

# 真实迁移（默认 out = .migration-out/<站点目录名>）
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu \
  --out .migration-out/xcAnzhiyu

# 可选：显式指定上游 1.7.1 参考 / 跳过静态资源 / 帮助
node scripts/migrate-hexo.mjs --site <dir> --upstream <dir|_config.yml> --no-assets
node scripts/migrate-hexo.mjs --help
```

行为要点：

- 逐文件打印 `+ <目标> <- <源>`，8 个阶段各有进度头，末尾打印汇总；错误以非零退出并给出可操作提示。
- `--out` 落在源站目录内、目标目录非空、缺 `_config.yml`、YAML 解析失败都会直接退出，不覆盖任何东西。
- 主题包 / stylus 插件 / remark 插件通过 `file:` 相对引用指向本仓库 `packages/*`；
  **每个产物文件到仓库根的 ESM import 前缀单独计算**（不同页面深度不同，见 §5 修复记录）。
- 主题配置按 1.7.1 键集合清洗后写 `anzhiyu.config.yml`，原文（含注释）备份到
  `anzhiyu.config.original.yml`；`site.config.ts` 被 4 个页面路由 import，替换掉硬编码的基准站身份。

---

## 3. 真实站演练（`D:/Git-project/xcAnzhiyu`）

### 3.1 验收命令：真实迁移 vs `--dry-run` 输出对比

两条命令都在仓库根 `D:/Git-project/astro-theme-anzhiyu` 执行，参数只差一个开关：

```bash
# A. 真实迁移（验收命令）
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu
# B. dry-run
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu --dry-run
```

| 观察项 | A 真实迁移 | B `--dry-run` |
| --- | --- | --- |
| EXIT | `0` | `0` |
| 头部 | `Hexo → Astro 迁移脚手架` | `Hexo → Astro 迁移脚手架（DRY-RUN，不写任何文件）` |
| 逐文件进度 | `+ site.config.ts`、`+ src/content/posts/1.hello-world.md  <- source/_posts/2025/07/1.hello-world.md`（共 292 行） | `[dry-run] write site.config.ts`、`[dry-run] copy data/about.yml  <- source/_data/about.yml`（共 291 行） |
| 8 个阶段 | `[1/8] 校验` … `[8/8] migration-report.json` 全部执行 | 同样的 8 个阶段输出，但每步不落盘 |
| 报告落点 | `+ migration-report.json`（写入产物目录，47174 字节） | `--- migration-report.json（dry-run，未写入任何文件）---` 之后把完整 JSON（约 1400 行）打 stdout |
| 汇总关键行 | `产物文件 292（写 28 / 复制 264）` / `报告 migration-report.json` | `产物文件 291（dry-run：0 字节落盘）` / `报告 stdout（未写文件）` |
| 阶段数字 | `覆盖率 132/136 = 97.06%`、`1.7.1 新增键 (1): umami`、`1.7.1 缺失键 (4): …` | 与 A 完全一致（读的是同一份源站配置） |
| 对磁盘影响 | 新建 `.migration-out/xcAnzhiyu/` 共 292 文件 | **零写入**；产物已存在时再跑，`migration-report.json` 的 mtime 不变 |

A 的完整 stdout 汇总见 §3.2。B 不写任何文件（含报告自身），因此可以直接在真实产物目录上反复跑来做回归对比。

### 3.2 stdout 汇总（验收命令原样）

```
========================================================================
汇总
========================================================================
  文章            : 22（abbrlink 22）
  独立页面        : 17；type: about, categories, charts, default, equipment, essay, fcircle, link, music, tags, todolist
  数据文件        : 8（.yml 7）
  静态资源        : 112
  主题配置覆盖    : 132/136 = 97.06%
  1.7.1 新增/缺失 : 1 / 4
  无法自动迁移项  : 21（page.type, layout, config-key, comment-backend-secret, cdn, inject, hexo-only, hexo-plugin）
  警告            : 1
  产物文件        : 292（写 28 / 复制 264）
  报告            : migration-report.json
========================================================================

下一步：
  cd .migration-out/xcAnzhiyu && pnpm install && pnpm build
  详见 docs/guides/MIGRATION.md（评论/搜索/统计、CDN、部署、回滚、验证清单）。
```

阶段输出（节选）：

```
[2/8] 读取源站配置
  ✓ _config.yml          : 61 个顶层键
  ✓ _config.anzhiyu.yml  : 136 个顶层键
  ✓ 站点字段命中 11/13: title, subtitle, description, keywords, author, language, url, timezone, per_page, permalink, external_link
[4/8] 主题配置 → anzhiyu.config.yml（含 1.6.14 → 1.7.1 键差异）
  ✓ 覆盖率 132/136 = 97.06%
  · 1.7.1 新增键 (1): umami
  · 1.7.1 缺失键 (4): Day_night_toggle_button, friends_lite, ai_summary, Umami
  · 其中 1.6.14 官方遗留 4 / 第三方注入 0（主题源码扫描 308 个文件）
```

### 3.3 `migration-report.json` 关键字段

```json
{
  "sourceSite": "D:/Git-project/xcAnzhiyu",
  "sourceSiteReadOnly": true,
  "outputDir": ".migration-out/xcAnzhiyu",
  "themeVersion": { "source": "1.6.14", "target": "1.7.1 (upstream reference)" },
  "counts": {
    "posts": 22, "postsWithAbbrlink": 22,
    "pages": 17,
    "pageTypes": ["about","categories","charts","default","equipment","essay","fcircle","link","music","tags","todolist"],
    "dataFiles": 8, "dataYmlFiles": 7,
    "staticAssets": 112, "outputFiles": 292
  },
  "configKeyDelta": {
    "baseline": "packages/astro-theme-anzhiyu/src/config/defaults.ts (AUTO-GENERATED from 1.7.1)",
    "targetKeyCount": 133,
    "siteThemeKeyCount": 136,
    "matchedKeys": 132,
    "coverageRate": 0.9706,
    "addedIn171": ["umami"],
    "missingIn171": ["Day_night_toggle_button","friends_lite","ai_summary","Umami"],
    "unknownKeys": ["Day_night_toggle_button","friends_lite","ai_summary","Umami"],
    "legacyOfficialKeys": ["Day_night_toggle_button","friends_lite","ai_summary","Umami"],
    "thirdPartyKeys": [],
    "themeSourceScan": { "available": true, "filesScanned": 308 }
  },
  "unsupportedCount": 21,
  "warnings": [
    "源站 timezone 为空/无法解析（\"\"），content.config.ts 沿用 +08:00；若文章日期含显式时区请人工核对（见 MIGRATION.md「时区」）。"
  ],
  "generatedFiles": 292,
  "filesWritten": 28,
  "filesCopied": 264
}
```

一致性校验：`counts.outputFiles === generatedFiles.length === 292`，
`filesWritten + filesCopied === 28 + 264 = 292`。

站点字段：请求 13 个，命中 11 个，缺 `email` / `root`（`root` 自动补 `'/'`）。

### 3.4 产物文件树（最终状态，292 个文件）

```
.migration-out/xcAnzhiyu/
├── migration-report.json
├── site.config.ts
├── anzhiyu.config.yml                 # 清洗后，132 个顶层键
├── anzhiyu.config.original.yml        # 原文备份（含注释）
├── astro.config.mjs                   # 复用 examples/blog 的 processor + stylus 插件，路径已重写
├── package.json                       # astro + file:../../packages/*
├── data/
│   ├── about.yml      ├── creativity.yml   ├── equipment.yml
│   ├── essay.yml      ├── link.yml         ├── todolist.yml
│   ├── widget.yml     └── bangumis.json   # .json 不会被 site-data.ts 读取
├── public/                            # 112 个静态资源
│   ├── img/  css/  js/  json/  feed/  QwQ/
│   ├── favicon.ico  robots.txt  LICENSE-GPL
│   └── friend.json  flink_count.json
└── src/
    ├── content.config.ts              # glob base = ./src/content/posts
    ├── content/posts/                 # 39 个：22 篇文章（保留 2025/07… 子目录）+ 17 个 *-page.md
    ├── data/site-data.ts
    ├── styles/                        # 121 个（upstream/*.styl + _extra/**/*.css）
    └── pages/                         # 最小路由 4 个
        ├── index.astro
        ├── page/[...page].astro
        ├── [...path].astro
        └── [year]/[month]/[day]/[slug].astro
```

各目录文件数：`src/content/posts` 39、`src/styles` 121、`public` 112、`data` 8、`src/pages` 4。

路径重写校验（每个文件独立计算，修复后）：

```
src/pages/index.astro                          → '../../../../packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro'
src/pages/page/[...page].astro                 → '../../../../../packages/...'
src/pages/[...path].astro                      → '../../../../packages/...'
src/pages/[year]/[month]/[day]/[slug].astro   → '../../../../../../../packages/...'
astro.config.mjs                               → '../../packages/remark-hexo-tag/src/index.mjs'
4 个页面里的 const site = {...}                → import { site } from '<相对>/site.config'
```

### 3.5 dry-run 验证

- `--dry-run` 退出码 0，stdout 打印完整 `migration-report.json`（含 291 个计划产物，不含报告自身），
  汇总显示「产物文件 291（dry-run：0 字节落盘）」「报告 stdout（未写文件）」。
- 在产物目录已存在的情况下再跑 dry-run，`migration-report.json` 的 mtime 未变 → 确认零写入。
- dry-run 分别验证了两条基准路径：`--upstream D:/Git-project/_research/anzhiyu-upstream`（133 键）
  与不传（走 `defaults.ts`，133 键），结果一致。

### 3.6 源站只读：保证机制与验证（含真实命令输出）

**代码层 5 条机制**（行号对应 `scripts/migrate-hexo.mjs`，`docs/guides/MIGRATION.md` §0-A 有同样清单）：

| # | 机制 | 位置 |
| --- | --- | --- |
| 1 | 前置校验：`--out` 等于源站目录或位于源站目录内 → `fail()` 非零退出，不产生任何写入 | `:337` |
| 2 | 目标目录已存在且非空 → 拒绝运行，不覆盖/不合并写入已有目录 | `:340` |
| 3 | 所有写操作收敛到 `writeOut()` / `copyOut()`，目标路径一律 `path.join(OUT, rel)`；源站路径只作为 `readFileSync` / `readdirSync` / `statSync` 的参数，或 `copyFileSync(srcAbs, abs)` 的 **src** 侧 | `:146`、`:152`、`:160`、`:166`、`:168` |
| 4 | `--dry-run` 在两个写函数开头 `if (DRY) return`，不调用 `mkdirSync` / `writeFileSync` / `copyFileSync`；报告只 `console.log` 不落盘 | `:148`、`:162`、`:823` |
| 5 | 不 `chdir` 进源站、不删除/重命名源站文件、不回写源站 frontmatter；`layout: page` / `permalink` 只补在目标站新建的内容文件里 | `injectPageFrontmatter()` |

**外部验证**：对源站全量文件（排除 `.git/` 与 `node_modules/`）做 `路径 + 字节数 + mtime` 清单并取 sha256，
在「迁移前 / 真实迁移后 / dry-run 后」各算一次；同时跑 `git status` 与 `git diff --stat`。

```bash
# 清单哈希函数
snapshot() {
  find D:/Git-project/xcAnzhiyu -type f \
    -not -path '*/.git/*' -not -path '*/node_modules/*' \
    -printf '%P %s %T@\n' | LC_ALL=C sort | sha256sum
}
```

真实命令输出（三次哈希**完全一致**）：

```
=== [BEFORE] ===
d698da2697713d2d550a71b51614f07b8bd879a80cc9c5744706beb31c31f27e *-
git status: ''
git diff --stat: ''

$ node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu
REAL_EXIT=0                       # 产物文件 292（写 28 / 复制 264）

=== [AFTER REAL] ===
d698da2697713d2d550a71b51614f07b8bd879a80cc9c5744706beb31c31f27e *-
git status: ''
git diff --stat: ''

$ node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu --dry-run
DRY_EXIT=0                        # 产物文件 291（dry-run：0 字节落盘）

=== [AFTER DRY] ===
d698da2697713d2d550a71b51614f07b8bd879a80cc9c5744706beb31c31f27e *-
```

抽查关键文件 mtime，全部仍是源站原始时间（2025 年），未见任何写入：

```
2025-11-16 00:07:24.570042900 +0800  D:/Git-project/xcAnzhiyu/_config.yml
2025-11-16 00:06:45.980161400 +0800  D:/Git-project/xcAnzhiyu/_config.anzhiyu.yml
2025-11-16 00:02:33.364090300 +0800  D:/Git-project/xcAnzhiyu/source/about/index.md
2025-10-06 06:53:32.659863600 +0800  D:/Git-project/xcAnzhiyu/source/_posts/2025/07/1.hello-world.md
```

`migration-report.json` 里的 `sourceSiteReadOnly: true` 只是脚本自述；上面三次哈希与
`git status` / `diff --stat` / mtime 才是独立复核。脚本只读 `_config.yml` / `_config.anzhiyu.yml` /
`source/**` / `themes/anzhiyu/**`，所有写入都发生在 `--out` 下。

---

## 4. 配置键覆盖（1.6.14 → 1.7.1）

| 口径 | 值 |
| --- | --- |
| 站点 `_config.anzhiyu.yml` 顶层键 | 136 |
| 1.7.1 默认配置顶层键 | 133 |
| 命中（可直接迁移） | 132 → **覆盖率 97.06%** |
| `addedIn171`（1.7.1 新增、站点未配置，由 `defaults` 深合并自动补齐） | `umami` |
| `missingIn171` / `unknownKeys`（站点在用、1.7.1 已无 / strict schema 拒绝） | 4 个，见下 |
| `legacyOfficialKeys` / `thirdPartyKeys`（扫描 1.6.14 主题源码 308 个文件） | 4 / 0 |

4 个站点独有键都是 1.6.14 官方遗留键（源码有引用），不是第三方插件注入：

| 键 | 报告里的 `aliasHints` | 脚本处理 |
| --- | --- | --- |
| `Umami` | `umami`（1.7.1 已改为小写，子键变为 `apiHost`/`websiteId`/`token`，需人工重填） | 剔除 + 备份；不自动改值（子键不兼容，直接搬会语义错误） |
| `ai_summary` | `post_head_ai_description`（语义不同，需核对） | 剔除 + 备份 |
| `Day_night_toggle_button` | `darkmode.button` | 剔除 + 备份 |
| `friends_lite` | `friends_vue`（需核对） | 剔除 + 备份 |

清洗后的 `anzhiyu.config.yml` 保留 132 个键；`umami` 由主题包 `defaults` 补齐。
头部注释写明了剔除项、备份位置、自动补齐项。

---

## 5. 构建尝试记录（`pnpm install` + `build`）

按要求如实记录，未为此修改主题源码或 `examples/blog` 现有文件。

### 5.1 install 的 workspace 陷阱

```bash
cd .migration-out/xcAnzhiyu && pnpm install
# Scope: all 5 workspace projects … Done in 3.1s
# 演练包没有 node_modules；副作用：根 pnpm-lock.yaml 多 2 行 `packages/remark-hexo-tag: {}`
```

根 `pnpm-lock.yaml` 的这两行已精确还原（`git status pnpm-lock.yaml` 干净）。

```bash
cd .migration-out/xcAnzhiyu && CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm install --ignore-workspace
# EXIT=0：resolved 448 / added 350 / Done in 33.6s
# + @astrojs/markdown-remark 7.3.10  astro 7.4.13  astro-theme-anzhiyu 0.0.0  yaml 2.9.1
# + highlight.js 11.12.0  stylus 0.64.0  vite-plugin-stylus-hexo-config 0.1.0
# 根 pnpm-lock.yaml 未再变化
```

### 5.2 build #1 / #2（依赖缺失 → 内容 tag 失败）

```
# 无 node_modules 时
[astro] Unable to load your Astro config
Cannot find module 'vite-plugin-stylus-hexo-config' imported from '.../astro.config.mjs'
WARN  Local package.json exists, but node_modules missing, did you mean to install?

# 独立安装后，完整内容
22:57:29 [ERROR] [glob-loader] Error rendering uitest-page.md:
[remark-hexo-tag] Unclosed Hexo tag `{% tabs %}`: missing `{% endtabs %}`
```

真实站内容里 39 个文件中 21 个含 `{%`，`uitest/index.md` 单个文件 676 个标签（渲染测试页），
`remark-hexo-tag` 对未闭合标签严格报错 → 内容集合渲染阶段中断。

### 5.3 诊断构建：发现并修复脚本自身的路径 bug

临时排除 21 个含 tag 的内容文件后，第一次诊断暴露：

```
[UNRESOLVED_IMPORT] Could not resolve '../../packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro'
                    in src/pages/page/[...page].astro
```

原因：初版脚本把**所有**页面的 `(\.\./)+packages/` 统一替换成「相对 out 根」的 `../../packages/`，
但 ESM import 按「引用文件所在目录」解析，不同页面深度需要不同的 `../` 数量。
已修复为按每个文件计算 `relativeSpecifier(fileRel, REPO_ROOT)`（见 §3.4 校验），重跑脚本 + 重装依赖。

### 5.4 build A / B / C（修复后）

| 轮次 | 条件 | 结果 |
| --- | --- | --- |
| A | 完整内容 + 独立依赖 | 仍被 `uitest-page.md` 的 `{% tabs %}` 卡住（内容问题，非骨架问题） |
| B | 排除 21 个 tag 文件 | 配置加载 / content sync / types / 组件解析 / stylus 展开（102 键、150 文件）全部通过，最终 `postcss` 报 `src/styles/upstream/index.styl:16823:3 Unknown word cursor` |
| C | 排除 21 个 tag 文件 **+ 临时换成 `examples/blog/theme.config.yml` 基准配置** | **成功**：`19 page(s) built in 4.45s`、`[build] Complete!` |

build C 输出的页面（节选）：`/about/`、`/categories/`、`/charts/`、`/cookies/`、`/copyright/`、
`/disclaimer/`、`/equipment/`、`/essay/`、`/fcircle/`、`/messages/`、`/music/`、`/privacy/`、
`/tags/`、`/todolist/` 等。

结论：

1. **脚本生成的骨架本身可编译并产出页面**（build C 证明：package.json 的 `file:` 引用、
   astro.config.mjs、content.config.ts、4 个路由、site.config.ts、样式目录都正确）；
2. 剩余两个失败点都来自**真实站点的输入**，不是主题包未发布或脚本路径：
   - 内容：Hexo tag 语法未闭合 / 未实现（21/39 文件）；
   - 配置：站点 136 键主题配置喂给 `vite-plugin-stylus-hexo-config` 时，某条件分支展开出非法 CSS
     （换成基准配置即通过，说明是配置值差异，需逐项对齐，见 `docs/guides/MIGRATION.md` §4 / §13）。

所有诊断用的临时改动（移走的内容文件、替换的主题配置、构建锁）已恢复；
`node_modules` / `pnpm-lock.yaml` / `dist` / `.astro` 等演练环境派生物已清理，
最终 `.migration-out/xcAnzhiyu` 只剩脚本产物 292 个文件。

---

## 6. 失败 / 待办清单

### 6.1 `unsupported`（21 项，8 类）

各类项数由 `migration-report.json` 实测统计：`page.type 2 / layout 1 / config-key 4 /
comment-backend-secret 8 / cdn 2 / inject 2 / hexo-only 1 / hexo-plugin 1 = 21`。

| 类别 | 项数 | 本站条目 | 说明 / 处理建议 |
| --- | --- | --- | --- |
| `page.type` | 2 | `charts`、`todolist` | 非标准类型，落到 `DefaultPage`，专属布局/数据丢失；需在 `[...path].astro` 加分支或改自定义页面 |
| `layout` | 1 | `sitetime`（`source/log/index.md`） | `layout !== 'page'`，不命中 `[...path].astro`，URL 会 404；需专用路由 |
| `config-key` | 4 | `Umami`、`ai_summary`、`Day_night_toggle_button`、`friends_lite` | strict schema 会拒绝，已剔除 + 备份到 `anzhiyu.config.original.yml`，按 `aliasHints` 人工映射 |
| `comment-backend-secret` | 8 | `valine.appId/appKey`、`waline.serverURL`、`twikoo.envId`、`friends_vue.apiurl`、`post_head_ai_description.key`、`aisummary.token`、`baidu_url_submit.token` | 后端地址/密钥改环境变量 + 前端组件，不能进前端产物 |
| `cdn` | 2 | `CDN.custom_format / CDN.option`、`internal_provider=local / third_party_provider=cbd` | 无 Astro 等价机制，改 `build.assetsPrefix` / 部署层回源 |
| `inject` | 2 | `inject.head` 8 项、`inject.bottom` 5 项 | 搬到布局 / `BaseLayout` 插槽 |
| `hexo-only` | 1 | `pjax.enable` | 静态 MPA 无 pjax，删除或评估 View Transitions |
| `hexo-plugin` | 1 | `abbrlink, bangumi, envelope_comment, hexo_safego, baidu_url_submit, aisummary, feed, sitemap, baidusitemap, search, all_minifier, aplayer, nofollow, auto_spacing, highlight, prismjs, deploy` | 换 `@astrojs/rss`、`@astrojs/sitemap`、CI 脚本等；`abbrlink` 已作为 frontmatter 被文章路由读取 |

**两条真实缺口 —— 属 Phase 3 / Phase 7 已知边界，脚本如实标注、不假装支持：**

1. **`charts` 页 `type` 未分发**：Astro 侧 `[...path].astro` 的 `case page.type` 只分发
   `tags / categories / link / essay / room / about / album / album_detail / music /
   equipment / fcircle / default`（12 种），`charts`（以及 `todolist`）不在其中，
   会落到 `DefaultPage` 只渲染正文，专属布局和数据丢失。脚本把它们写进 `unsupported`，
   **没有**在产物里生成任何分发分支来假装支持。
2. **`layout: sitetime` 页会 404**：`[...path].astro` 的 `getStaticPaths` 用
   `entry.data.layout === 'page'` 过滤；`source/log/index.md` 声明 `layout: sitetime` ≠ `page`，
   因此不产出该 URL。脚本补 `layout: page` 时只对**缺失该字段**的页面补，已有的 `sitetime`
   原样保留并列入 `unsupported`，避免静默改写用户语义。

两条都在 `docs/guides/MIGRATION.md` §5.2 / §13.1 有对应的人工处理建议。

### 6.2 warnings（1 条）

源站 `timezone: ''` → `content.config.ts` 沿用 `+08:00`；若文章日期含显式时区字面量需人工核对
（`hexoDate` 的已知限制，见 `docs/guides/MIGRATION.md` FAQ「时区」）。

### 6.3 脚本未覆盖 / 后续工作

1. 归档 / 标签 / 分类 / 404 路由未生成（只给了最小 4 条路由）；要完整站点需从
   `examples/blog/src/pages/` 复制并替换 `BASELINE_SITE`（`archives/_data.ts` 仍硬编码基准站身份）。
2. 主题配置清洗只处理**顶层键**；区块内子键的类型校验（schema 已展开 17 个区块）仍需逐站验证。
3. `data/*.json`（本站 `bangumis.json`）不被 `site-data.ts` 的 `glob('*.yml')` 读取。
4. `siteExtras.external_link.exclude` 未接入 `[slug].astro`（那里仍是硬编码）。
5. 老 permalink（`posts/p:abbrlink/`）与新路由不兼容，需要 301 映射表（指南里给了生成脚本）。
6. 主题包仍是 `private: true` 的 workspace 源码包，只能 `file:` 引用，未发布 npm；
   独立站点需换成包名/版本导入。
7. `remark-hexo-tag` 只实现部分 Hexo tag，media/thirdparty 组仍透传；真实内容需逐页修。
8. 站点主题配置导致 stylus 展开非法 CSS 的具体分支未逐键定位（build C 已证明换基准配置可过），
   属于 P7-3 之后的配置对齐工作。

---

## 7. 边界与清理记录

- 只写了：`scripts/migrate-hexo.mjs`、`docs/guides/MIGRATION.md`、`docs/notes/phases/P7-3-migration.md`、
  `.migration-out/**`、`.gitignore`（追加一行）。
- 演练过程中 `pnpm install` 曾给根 `pnpm-lock.yaml` 加了 2 行 workspace importer，已精确还原；
  未 commit / push / 改分支。
- 源站 `D:/Git-project/xcAnzhiyu` 迁移前后 `git status --short` 均为空（只读验证）。
- 仓库根 `.build.lock` 在每次构建前后都确认已释放；演练产物里的 `node_modules`、
  `pnpm-lock.yaml`、`dist`、`.astro` 已清理，最终 292 个文件即 `generatedFiles` 全量。
