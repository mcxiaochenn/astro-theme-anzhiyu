# 迁移执行计划

从 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 1.7.1 到 Astro 7 的完整移植计划。

**这份文档是唯一的执行基线。** 任务粒度、依赖、验收命令、进度都在这里；[01 上游调研](01-upstream-analysis.md)、[02 技术映射](02-astro-mapping.md)、[03 初版计划](03-migration-plan.md) 是背景与决策记录。冲突时以本文件为准。

状态标记：`✅` 已完成 · `◐` 进行中 · `⏳` 待验证 · `⬜` 未开始

**更新规则**：每完成一个任务改它的状态并写一句验收结果；进度快照（§1）跟着改。不更新进度的计划没有意义。

---

## 1. 当前状态

**快照时间：2026-11-23 23:25（用户指令收尾：Phase 4/5/7 半成品固化为 wip，全部 agent 已停止）**

### 1.1 仓库

| 项 | 值 |
| --- | --- |
| 提交 | `19c9b80` fix(diff): 忽略机制元素后合并相邻文本节点（后续还有未提交的 Phase 4 收尾 / 迁移脚本 / 上游 public 资源） |
| 提交数 | 39 |
| 工作区 | 已按用户指令收尾：Phase 4 head 运行时（Head/Header/BaseLayout/Console/head\*\*）、P5 third-party 组件库 55 文件 + `check-third-party.mjs`、P7 lenient tag（index/parser/migrate 模板）、上游 `public/{js,css,img,anzhiyu}/` 均以 wip 提交固化，**均未验收**，可续接 |
| CI | 12 步流水线，主干全绿；diff 步骤只出报告不阻断 |
| 产物规模 | **62 页**构建成功（基线 48 页 + 9 文章 + about + 11 个 page.type fixture） |
| 代码量 | 主题包约 8k 行 + remark-hexo-tag 42 tag + 验证站 62 页 |
| 全量 diff | 48 页 / **PASS 0 / FAIL 48**、差异 **112** 条（脚本样式 48 / 属性 29 / 结构 29 / 文本 6）、缺 56 / 多 113 节点 |

### 1.2 已完成

| 项 | 说明 |
| --- | --- |
| Phase 0 | 上游调研（01）、技术映射（02）、迁移计划（03）、双语 README、GPL-3.0 |
| monorepo 骨架 | pnpm workspace，`packages/*` + `examples/*`，`.npmrc` 设 `node-linker=hoisted` |
| Stylus 兼容插件 | `vite-plugin-stylus-hexo-config` 230 行：import 展开 + `hexo-config()` 调用点变量化 |
| 技术验证 1、2 | glob import ✅；`hexo-config()` 在条件/`convert()`/`alpha()` 里求值 ✅ |
| P1-5 全量样式编译 | ✅ 上游 72 styl + 47 css 全量进产物：686772 B / gzip 79071，与基准 +0.52% / −0.07%，零残留 `@import` |
| P1-6 基准固化 | ✅ 上游 hexo g 实测 CSS 683218 B / gzip 79124；48 页 HTML 摘要；10 篇 fixture 覆盖 42 个 tag；4 次构建逐字节可复现 |
| P1-7 配置层首版 | ◐ `defaults.ts`（133 顶层键，与上游 YAML 深比较一致）+ `schema.ts`（133 顶层，31 个区块精确类型 / 178 二级键） |
| P1-10 CI | ◐ 流水线 + `verify-css.mjs` 已跑通本地行为矩阵；GitHub 首次运行暴露并修复了 lightningcss 构建错误 |
| P1-8 配置加载层 | ✅ loader + 30/30 用例通过；错误信息含完整键路径；CSS 变量比对 69/69 命中 |
| Phase 1.5 垂直切片 | ✅ 五项假设全过（详见 §Phase 1.5），Phase 4 原方案成立 |
| P2-13 HTML diff 工具 | ✅ 21 条归一化规则（N1–N21）+ 忽略机制元素后合并相邻文本节点；48 页全量比对，当前 112 条差异 |
| P2-1 内容集合 | ✅ 10 篇直接读 `fixtures/`（零复制）、frontmatter 19/19 字段覆盖、unified 处理器生效 |
| P2-2/P2-3 骨架与 Head | ✅ BaseLayout 26 个挂载点 ID 全命中；Head 32 条 meta/link；首页由真实内容渲染 |
| P2-6/P2-11 helper 与 i18n | ✅ 12 个 helper 以上游 JS 为 oracle 对拍 269 项全过；4 语言字典 83 项通过 |
| P2-14 基线归档进 CI | ✅ 48 页基线 HTML 压到 477 KB 进仓库（manifest 逐文件校验），CI 自动解压 + 跑 diff 出报告 |
| P2-15 Markdown/日期对齐 | ✅ smartypants 关闭（`-->` 不再被改写）；Hexo 语义日期格式化 59 条对拍全过 |
| P2-4/P2-5 布局组件 | ✅ Header/Footer/Sidebar/Rightside 真实组件替换占位，BaseLayout 的 26 个挂载点全部有归属 |
| P2-9/P2-10 归档与 404 | ✅ 归档（年/月三级）、分类、标签、404 路由全生成，构建 40 页 |
| P2-7 首页与 PostCard | ✅ M1 highlight.js 对齐上游 `figure.highlight`；首页缺口 857 → 480 |
| 上游差异档 | ✅ `docs/upstream-delta.md` 8 项 U1–U8；D9 已定位闭合，29 项机械守卫进 CI |
| P1-11 define 层 | ✅ CSS 686772 → 682990（上游样式子集），prismjs 规则族清零，对基线仅剩 −228B（U6 排版差） |
| P1-12 schema 收紧 | ✅ 顶层 `.strict()`，未知顶层键报错并列出键名；17 区块 +143 键展开；42/42 自检通过 |
| P2-7 首页收尾 | ✅ home_top 全子树（bannerGroup/topGroup/todayCard/分类条）；首页缺口 480 → 388 → 223 → 当前 4 条 |
| P2-8 文章页 | ✅ 9 篇文章路由与 post 组件；slugger 41 个标题 id 与基线一致（额外 footnote-label 属 M2） |
| P3-1 aside widgets | ✅ 15 张卡片；首页/归档/文章页 aside 结构差异 0 |
| P3-2 page.type 分发 | ✅ `[...path]` 独立页面路由 + 11 个模板；12 个 page.type fixture 全部命中根选择器 |
| P6-1 tag 骨架 | ✅ `packages/remark-hexo-tag`（纯 ESM 零依赖）+ 24 个行内/块级 tag，38 条单测 |
| P6-2 剩余 tag | ✅ 媒体/卡片 11 + 第三方 7，42 个 tag 全落地，59/59 单测；四篇 fixture `{%` 残留 0 |
| P2-4 外链语义 | ✅ `external-link.ts` + Footer/Sidebar/MenuItems 补 `target/rel`；attr-missing 286 → 0，全量 diff 398 → 112 |
| P3-3 about 页面 | ✅ 14 个区块组件，`#about-page` 子树独立 diff 0 条 |
| diff 归一化 N15–N21 | ✅ generator / ClientRouter / pjax / Vite CSS 路径 / 中文空白 / M2 脚注 / 上游未渲染标题豁免 |
| P4 运行时（进行中） | ◐ GLOBAL_CONFIG / config-diff / inject_head_js / 资源解析 / 上游 JS 搬运 / ClientRouter / console 已落盘；全量 diff 收敛到 112 条，收尾中 |
| P7 迁移脚本（进行中） | ◐ `scripts/migrate-hexo.mjs` + xcAnzhiyu 演练产物 292 文件 / 22 post / 21 项 unsupported；文档收尾中 |

### 1.3 Phase 1 的真实边界

**Phase 1 完成度：约 87%（6.5 / 7.5 人日）。** 只剩 P1-9 的构建链路接线（loader 尚未被 `examples/blog` 的构建调用，属 Phase 2 的 P2-1 范围）与 P1-10 的 CI 绿灯确认。

**Phase 1.5：5 / 5 假设通过，已退出。** 详见下方 Phase 1.5 小节。

17:00 时这里记的是「只编译过 `var.styl` 一个文件、302 KB 主体从未编译」。**现在这个缺口已经补上了**，记录如下以便追溯：

| 17:00 的状态 | 18:35 的实测 |
| --- | --- |
| 只编译 `var.styl`（63 处 `hexo-config`） | 全量 72 styl + 47 css，展开 150 个文件，102 个唯一配置键 |
| 302 KB 主体从未编译 | 产物 686772 B，与上游基准差 +0.52% |
| `dist/index.html` 823 B、CSS 内联 | 产出独立 `_astro/index.*.css`，index.html 引用它 |
| 179 处 `hexo-config` 只覆盖 63 处 | 179 处全部命中，唯一键 102 个与插件日志闭环 |

这一块的真实成本比预估高：插件从 230 行扩到约 700 行，补了 `@require` 语义、nib 兼容（vendor 30 个 styl）、`.css` 的 `@css{}` 字面量内联、Stylus 注释与 glob 语义复刻。**当初「Phase 1 是最容易的一段」的判断是错的。**

### 1.4 已知问题与文档债

| # | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| D1 | [02 §ADR-002](02-astro-mapping.md#adr-002样式继续用-stylus补一层-hexo-config) 写的是「用 `stylus.define()` 注入函数」 | 与实现不符（该方案实测失败，见 02 §6.2） | 读决策看 02 §6，执行看本文件 §4 |
| D2 | [03](03-migration-plan.md) 说特性清单是 31 项 | 实数是 **30 项**（附录 A 已重新数过） | 以附录 A 为准 |
| D3 | 03 的 Phase 1 说「配置 schema」是 M 级任务，没拆 | 约 200 个键 + 默认值对齐，实际是全阶段最机械的一块 | 拆成 P1-7 / P1-8 |
| D4 | 上游参考产物没有产出计划 | 三层验收全部依赖它，缺了等于无法验收 | P1-6 补上 |
| D5 | 没有示例内容 fixture | HTML diff / 像素 diff 需要同一份内容喂两边 | P1-6 一并产出 |
| D6 | 插件对 `@import` 做了全局去重 | Stylus 原生 include 语义是重复展开，去重后产物可能不同 | ✅ 已解决：改成按 Stylus 的 `@require`/`@import` 语义分别处理，产物与基准 +0.52% |
| D7 | 上游自身有非法 CSS：`source/css/_mode/readmode.styl:120` 写成 `var(-highlight-bg)`（104 行是正确的 `--highlight-bg`） | 浏览器静默丢弃该声明；lightningcss 严格解析直接构建失败。修上游会改变视觉，不修则必须关压缩 | 已决策：不改上游，`examples/blog/astro.config.mjs` 关 `cssMinify`，Phase 7 处理压缩时再议 |
| D8 | 量级纠正：上游 `_config.yml` 不是「约 200 键」，而是 **133 个顶层键 / 662 个递归 mapping key** | P1-7 的工作量估算需上调；schema 还有约 351 个嵌套键是 passthrough | 以 P1-7 报告实测为准，本文件相关表述已改 |
| D9 | ~~未定位：prismjs 守卫导致 +3.5 KB~~ | **已定位并修复**：上游用 Hexo filter 的 `.define()` 注入 4 个 Stylus 变量，我们插件没复刻；且 **Stylus 未定义变量在 `if` 里当「真」**（P1-5 报告已勘误）。P1-11 复刻后 CSS 686772 → 682990，对基线仅 −228（U6） | ✅ 关闭 |
| D10 | [02 §ADR-003](02-astro-mapping.md) 的风险段仍写「`#web_bg` 会被重建、音乐可能需要独立持久层」 | Phase 1.5 实测已推翻：同节点、音频不中断 | ADR 冻结不改，以 §6.8 实测记录为准 |

---

## 2. 硬约束

这些不是偏好，是改动前必须满足的条件。

### 2.1 基线冻结

- 上游基线：**1.7.1 / commit `72439d93`**。迁移期间不追上游新提交。
- 本地副本：`D:\Git-project\_research\anzhiyu-upstream`（331 文件，2.55 MB，与基线一致）。GitHub 上按同一 commit 可复现。
- 迁移完成后建立季度 diff 检查，差异写入 `docs/upstream-delta.md`（Phase 7）。

### 2.2 结构不可变

- DOM 树、ID、class 命名必须与上游一致。302 KB Stylus + 115 KB JS 全部按 `#web_bg`、`#body-wrap`、`#content-inner`、`#rightside` 这类选择器写死。
- 统一写法：**换渲染引擎，不重做前端**。任何「顺手优化结构」都会引发连锁失效。
- 唯一的例外需要单独列在 §7 风险登记册里，并附放弃理由。

### 2.3 工作流

- **构建与验收走 CI**：本地只做代码修改、`pnpm dev` 视觉调试、类型检查。`pnpm build` 的产物不作为验收依据——权威产物来自 CI（用户 2026-11-04 明确的项目级约定）。
- **发布不回头**：已发布的 tag/release 不覆盖、不重打，改动必 bump 版本并发新 tag。
- 远程操作（push、force、tags）需要明确授权后执行。
- 提交粒度：一个任务一个 commit，commit message 用中文，前缀沿用 `feat:` / `fix:` / `docs:` / `chore:` / `test:`。

### 2.4 环境

| 项 | 事实 |
| --- | --- |
| 本地 | Windows 11 · Node 24.22.0 · pnpm 10.29.3 · hexo-cli 4.3.2 |
| pnpm 布局 | 必须 `node-linker=hoisted`（默认 symlink 布局在 Windows 下产生 Node 解析不了的 junction） |
| registry | 本机默认 npmmirror，装老包偶发 `ECONNRESET`；CI 用官方 registry |
| TLS | Windows schannel 客户端在沙箱内失效，git 已设 `http.sslBackend=openssl` |
| 目标运行时 | Node ≥ 22（Astro 7 要求） |

### 2.5 许可

GPL-3.0，与上游一致。这是衍生作品的必要条件。所有从上游拷进来的模板、样式、JS 保持原许可，文件头不额外加署名——仓库级 LICENSE 覆盖。

---

## 3. 验收体系

先定标准再写代码。没有基准的「已支持」不算支持。

### 3.1 三套基准产物

都要在写业务组件之前产出（P1-6）。

| 基准 | 来源 | 用途 |
| --- | --- | --- |
| **样式基准** | 上游 `hexo g` 产出的 `public/css/index.css` | 字节数、gzip 体积、CSS 变量值、选择器集合比对 |
| **HTML 基准** | 上游 `hexo g` 产出的各页面 HTML | 结构 diff |
| **视觉基准** | Playwright 截上游站点（或本地 hexo server） | 像素 diff |

基线摘要写入 `docs/baseline.json`，**产物本身不进仓库**（含图片，数十 MB）。CI 需要时按 commit 现算并缓存。

### 3.2 三层对比

**第一层：HTML 结构 diff**

基线 HTML 以归档形式进仓库（`tests/baseline-html/baseline-html.tar.gz`，477 KB，48 页，manifest 逐文件校验），所以 CI 与任何一台机器都能跑：

```bash
node scripts/extract-baseline-html.mjs          # 解压到 .baseline-html/，校验整包与逐文件 SHA256
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs <baselineHtml> <distHtml> [--json]
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all      # 48 页全量
```

**归一化已覆盖**：属性顺序、空白折叠、注释、资源哈希段、自闭合写法、布尔属性、`data-astro-*`、HTML 实体、class 集合、站内 origin、Astro 机制元素、`<pre>` 首行换行、CRLF、大小写。

**通过标准（三条，缺一条会误判）**：
1. 单页 PASS = `diffCount === 0` **且** `truncated === false`
2. 进度看 `missingNodes + unexpectedNodes` 单调下降，不能只看差异条数（骨架对上后差异会从「整块折叠」变成「逐容器报缺口」，条数反而可能上涨）
3. Phase 2 期间允许 FAIL，但差异必须归类：目前登记两类豁免——**资源路径策略**（见 [resource-path-policy](resource-path-policy.md)）与 **Astro 机制元素**（已自动忽略并计数）。标签层级、id、class、文本、meta 全集是上游 CSS/JS 的硬契约，必须真修。

**当前基线数据**（2026-11-23）：48 页 PASS 0 / FAIL 48，差异 150 条，缺口 缺 857 / 多 60 节点。剩余缺口归属：nav/footer 197+、home_top 91+、PostCard、sidebar/rightside 约 20、aside 3 卡、资源与脚本。

**Phase 2 结束时要做的**：把 CI 里 diff 步骤的 `|| true` 去掉，变成硬门禁（步骤见 `docs/notes/P-baseline-html-ci.md` §7），并给 artifact upload 加 `if: always()`。

**第二层：视觉回归**

Playwright 逐页截图，三档视口 `1440×900` / `768×1024` / `375×812`，与基准做像素 diff。允许 ≤1% 的抗锯齿差异。

**第三层：特性清单**

附录 A 的 30 项，每项写清「怎么验」并附操作步骤。清单不勾满不算迁移完成。

### 3.3 行为基线

依赖 `GLOBAL_CONFIG` 的交互，先在上游站点录一遍行为（DOM 变化 + 网络请求 + 关键事件顺序），迁移后回放。没有基线的行为不认。

至少要录的六组：

| 行为 | 录制内容 |
| --- | --- |
| 暗色模式 | 首访跟随系统 / 手动切换 / 刷新保持 / 导航后保持 |
| 右键菜单 | 触发条件、菜单项、点击后动作 |
| 全局中控台 | 打开方式、面板内容、各开关副作用 |
| 音乐播放器 | 播放中导航 → 是否中断、进度是否保留 |
| 搜索 | 输入 → 请求 → 结果渲染 → 点击跳转 |
| 繁简转换 | 触发 → localStorage 键 → 页面文案变化 |

### 3.4 不可自动验的项

诚实列出来，靠人工走查：

- 沉浸式状态栏（依赖移动端浏览器 chrome 行为）
- 快捷键（键盘事件组合，可半自动）
- 第三方服务真实联通（评论 ×5、分析 ×5，各自要真实账号，只能一次性人工验）
- 移动端手势与滚动性能

### 3.5 验收命令集

```bash
pnpm install --frozen-lockfile     # 依赖可复现
pnpm --filter blog build           # 构建通过
node scripts/verify-css.mjs        # 样式基准比对
node scripts/diff-html.mjs         # HTML 结构 diff（Phase 2+）
npx playwright test                # 视觉回归（Phase 2+）
node scripts/compare-css-vars.mjs   # 69 个 CSS 变量逐值比对
node scripts/check-upstream-delta.mjs  # 上游差异守卫（28 项）
node scripts/check-features.mjs    # 特性清单自检（能自动化的部分）
```

---

## 4. 阶段与任务

### 任务切分原则

- **单个任务 = 一次 agent 会话能做完并验收**。做不完就拆。
- 每个任务必须有可执行的验收动作，不接受「看起来对了」。
- 任务之间只通过文件与命令交互，不靠上下文传递。
- 估时单位是人日，用来衡量复杂度，不用于排期；实际推进按任务数算。

### 阶段总览

| 阶段 | 内容 | 状态 | 估时 | 已完成 |
| --- | --- | --- | --- | --- |
| Phase 0 | 仓库骨架、调研与计划 | ✅ | 0.5 | 0.5 |
| Phase 1 | 构建管线与配置层 | ◐ | 7.5 | 6.5 |
| Phase 1.5 | 垂直切片去风险 + 基准固化 | ✅ | 1.8 | 1.8 |
| Phase 2 | 布局与核心页面 | ◐ | 9.5 | 9.0 |
| Phase 3 | widget 与页面模板 | ◐ | 10.8 | 6.0 |
| Phase 4 | 交互层与路由 | ◐ | 13 | 4.0 |
| Phase 5 | 第三方集成 | ◐ | 6.3 | 0.5 |
| Phase 6 | 42 个 Hexo tag | ◐ | 7.5 | 6.5 |
| Phase 7 | PWA、性能、迁移文档 | ◐ | 5.5 | 1.0 |
| **合计** | | | **≈62** | **35.8** |

> 合计按「已完成」列逐项相加；22:20 版写的 25.3 与列和不一致，此处按实修正。

**关于量级**：这里的分阶段汇总 ≈62 人日，比 [03 初版计划](03-migration-plan.md) 的 34–45 天高约 40%。差额不是加了新功能，而是细拆后暴露的：03 的原估算没算 CI、基准产物、fixture、去风险切片这四样，Phase 6 的 42 个 tag 也只按「一个插件」估。这一版按任务逐条估，数字更接近真实成本。

人日是复杂度度量，不是排期。实际推进按任务数算——由多个 agent 并行执行时，Phase 3 的 12 个模板、Phase 5 的 15 个集成都能同时开工，日历时间远小于这个总和。

---

### Phase 0 — 仓库骨架与调研 ✅

已完成。产出：01 / 02 / 03 三份文档、双语 README、LICENSE、monorepo 骨架。

**退出标准**（已满足）：技术路线有依据，工作量有量级，仓库可交付。

---

### Phase 1 — 构建管线与配置层 ◐

**目标**：样式能全量编译，配置能读能校验，产物可与上游对比。

| ID | 任务 | 产出 | 验收 | 估时 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P1-1 | monorepo 骨架 | `pnpm-workspace.yaml`、`.npmrc` | `pnpm install` 通过，workspace 链接正确 | 0.5 | ✅ |
| P1-2 | Astro 7 项目初始化 | `examples/blog`，astro 7.4.13 | `pnpm dev` 起得来 | 0.5 | ✅ |
| P1-3 | Stylus 管线（变量层） | `var.styl` 编译成功 | 63 处 `hexo-config` 求值正确（02 §6.6） | 0.5 | ✅ |
| P1-4 | `vite-plugin-stylus-hexo-config` | 230 行插件 + README | import 展开、调用点变量化、引号规则、缺失键告警 | 1 | ✅ |
| P1-5 | **上游完整样式全量编译** | 上游 `source/css/` 全量进 `examples/blog`，产物 686772 B | 见 docs/notes/P1-5-full-style-build.md | 1 | ✅ |
| P1-6 | 基准固化 + 内容 fixture | `docs/baseline.json`（CSS 683218 B / 48 页）、`fixtures/` 10 篇覆盖 42 tag | 上游 `hexo g` 跑通，4 次构建逐字节可复现 | 0.5 | ✅ |
| P1-7 | 配置 schema | `packages/astro-theme-anzhiyu/src/config/schema.ts`（133 顶层，31 区块精确类型） | 上游 `_config.yml` 校验零错误、unknown key 0 | 1.5 | ◐ |
| P1-8 | 配置加载层 | `loader.ts`：YAML → 深合并默认值 → 校验 → 类型导出 | ✅ 30/30 用例通过；类型错误报完整键路径（`highlight_copy（期望 boolean）`） | 1 | ✅ |
| P1-11 | **复刻 Hexo define 层**（D9 修复） | 插件按上游 `scripts/events/stylus.js` 逻辑注入 4 个 Stylus 变量 | ✅ CSS 686772 → 682990，prismjs 规则族清零；verify PASS +0.13% | 0.5 | ✅ |
| P1-12 | schema 收紧与 strict 顶层 | 顶层 `.strict()`；17 区块 +143 键展开 | ✅ 未知顶层键报错并列出键名；42/42 自检通过 | 1 | ✅ |
| P1-9 | Phase 1 验收 | 三条验收全绿（口径见决策 D-P1-9） | 前两条已过；第三条在 loader 层已满足，构建链路待 P2-1 接入 loader | 0.5 | ◐ |
| P1-10 | CI 基础流水线 | `.github/workflows/ci.yml` + 4 个校验脚本 | PR 上 install + build + verify + 差异守卫 | 0.5 | ◐ |

#### P1-5 ✅ 已完成（原「最高风险项」，现已关闭）

17:00 的判断是「先做它，因为 Phase 2–7 全压在这条管线上」，事实证明判断没错——但也严重低估了成本。实际踩到四类问题：

| 原预期问题 | 实际结果 |
| --- | --- |
| `_extra/**/*.css` 的 glob | 不是 glob 问题，是**纯 CSS 内联**：必须复刻 hexo-renderer-stylus 的 `include css: true`，用 Stylus `@css{}` 字面量承载，还要抵消 compiler 每行剥 2 空格的行为 |
| 116 处未验证 `hexo-config` | 另有发现：值可能是对象/数组（7 个键），按 truthy 处理；缺失键按 Hexo `getProperty` 返回 `''` 而非 `null` |
| 4 处条件 import | 正常，无问题 |
| import 去重差异 | D6 已解决；但新增了 `@require` 语义（只展开一次）与 nib 兼容（vendor 30 个 styl） |
| — | **新增**：上游 `readmode.styl:120` 的非法 CSS 触发 lightningcss 构建失败（D7） |

验收数据：686772 B / gzip 79071 / verify PASS（+0.52% / −0.07%）/ 零残留 `@import`。完整证据见 [P1-5 报告](notes/P1-5-full-style-build.md)。

#### P1-6 ✅ 基准固化（已完成）

本地 `_research/anzhiyu-upstream` + hexo 7.3.0 跑通 `hexo g`：75 文件 / 48 页 / CSS 683218 B / gzip 79124。同一 fixture 连续 4 次构建产物清单 SHA-256 完全一致（含 clean 与增量）。为达到可复现，额外做了 3 个站点级归一化（冻结生成时间戳、排序模型数据、关闭 fragment_cache），**Astro 侧必须按同样约定输出才能逐字节对齐**。详见 [P1-6 报告](notes/P1-6-baseline.md)。

注意：`hexo 7.3.0` 版本必须钉死，换机器要同版本。

#### P1-7 / P1-8 配置层

- schema 按 `_config.yml` 的 20 个分区块逐块写，键名与层级不动。
- 默认值直接从上游 `_config.yml` 生成（写一个一次性脚本读 YAML 出 defaults.ts，避免手抄 200 个值）。
- 类型从 zod 推导，不手写 interface。
- 兼容 `_config.anzhiyu.yml` 旧文件名，命中时打 deprecation 提示。

**验收**：
- 上游 `_config.yml` 原样喂进去，零错误零 unknown key。
- 删掉一个必填键（如 `theme_color.main` 所在区块的必填项），构建失败并打印 `theme_color.main` 这样的完整路径。
- `pnpm tsc --noEmit` 通过，组件里 `theme.comments.use` 有类型补全。

#### P1-9 / P1-10

Phase 1 三条验收（来自 03），当前状态：

- [x] 构建产出 CSS，与上游 `index.css` 差异 ≤5% —— 实测 +0.52%（686772 vs 683218），gzip −0.07%
- [x] `var(--anzhiyu-main)` 等 CSS 变量值与上游一致 —— 69 个 `--anzhiyu-*` 逐值比对，取值集合 69/69 一致（1 个 `--anzhiyu-header-translateY` 因规则顺序导致「首值」口径不同，值集合相同）
- [ ] 配置缺必填键时构建失败，报出键路径 —— **口径已调整**，见下

#### 决策 D-P1-9：第三条验收改成「类型错误 + 顶层键拼错必须失败」

原验收「少写必填键就构建失败」与 ADR-005 冲突：ADR-005 要求用户能把魔改过的 `_config.anzhiyu.yml` 直接拷过来用，而 loader 会补全 133 个默认键。如果缺键就报错，等于强迫每个用户补写几百个键，这正是 ADR-005 要避免的摩擦。

**所以验收改成两条更实际的：**
1. **类型写错必须失败**，且报错含完整键路径 —— ✅ 已满足（`highlight_copy（期望 boolean）: expected boolean, received string`）
2. **顶层键拼错必须失败** —— 当前 schema 尾部是 `.passthrough()`，拼错会被静默透传。**这是真缺陷**，由 P1-12 修成 `.strict()`。

缺键回落默认值是**设计选择**，不是缺陷，写进 README 的用户须知。

**退出标准**：三条验收全绿 + CI 在 PR 上跑通。

---

### Phase 1.5 — 垂直切片去风险 ✅

**为什么插这一阶段**：8 项技术验证里还剩 6 项，其中 5 项（ClientRouter 相关）决定 Phase 4 的实现方式，而它们是整个计划里唯一「可能推翻架构」的验证。Phase 2–4 有 33 人日的工作量压在这些假设上，验证成本却不到 2 天。横向铺完再验证是本末倒置。

**目标**：一个最小真实站点（两页）+ 真实上游样式 + ClientRouter，一次验掉 P1.5-1 到 P1.5-5。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P1.5-1 | ClientRouter 最小双页站 | 两页 Astro 站 + `ClientRouter`，套上游完整样式 | 点击站内链接不触发整页刷新（Network 里无 document 请求） | 0.3 |
| P1.5-2 | 全局元素持久化验证 | 验证 8 项 #3 | 导航后 `#web_bg` 背景不闪断、不重播入场动画 | 0.3 |
| P1.5-3 | `script[data-pjax]` 重执行等价 | 验证 8 项 #4 | 导航后新页的 data-pjax 脚本执行，旧页的不重复执行 | 0.3 |
| P1.5-4 | 音乐播放器持久化实验 | 验证 8 项 #8 | 播放中导航，音频不中断（`transition:persist` 或独立持久层） | 0.3 |
| P1.5-5 | pug 风格 HTML 与样式命中 | 验证 8 项 #5、#6 | Astro 7 编译不报未闭合标签；生成的 class 能命中上游 Stylus | 0.3 |
| P1.5-6 | 结论落盘 + 方案校准 | `docs/02-astro-mapping.md` 新增 §6.8 实测记录 | 5 项状态从「待验证」变「通过」 | 0.3 | ✅ |

**关键技术点**（提前定方向，减少试错）：

- Astro 的 `transition:persist` 属性让元素跨导航存活。`#web_bg`、音频容器、右键菜单都可以标它——这正好对应上游「pjax 不换 DOM」的语义。
- `pjax:send` → `astro:before-swap`，`pjax:complete` → `astro:page-load`。shim 的映射表在 02 §ADR-003 里。
- 若 P1.5-4 失败（音频仍中断），退路是音乐播放器独立成 Shadow DOM 持久层，不随 ClientRouter 走。这条退路影响 Phase 4 的 P4-7。

**退出标准**：5 项技术验证（附录 C 的 #3 / #4 / #5 / #6 / #8）全有明确结论——通过或改方案，不允许「待验证」留到 Phase 4。Phase 4 的实现路径不再有未知的架构分叉。

#### 实测结论（2026-11-23，5 / 5 通过）

| # | 假设 | 结论 | 证据 |
| --- | --- | --- | --- |
| #3 | 整 body 替换后 `#web_bg` 样式与节点保留 | ✅ | 导航后同一 DOM 节点（expando 读回），12 项 computed style 逐项相等 |
| #4 | `script[data-pjax]` 重执行等价 | ✅ 有前提 | 用 `data-astro-rerun`：执行次数 1→2→3→4，每次导航恰好 +1，旧页不重跑，console 零错误 |
| #5 | HTML 命中上游 Stylus | ✅ | `.note` / `.note.blue` / `.recent-post-item` / `#web_bg` 的 computed style 全命中上游值 |
| #6 | pug 风格 HTML 不被 Astro 7 拒绝 | ✅ | `<br><img><input><hr>` 不闭合原样进产物，DOM 解析正常 |
| #8 | 音乐播放器跨页不中断 | ✅ | 容器 + audio 跨 4 次导航同一节点，`paused=false` 全程，`currentTime` 持续增长 |

附加：导航 3 次 document 请求 = 0；`pjax.loadUrl → navigate()` shim 可用；`pjax:complete` 每次 page-load 补发一次。

**三条必须带进 Phase 4 的前提**（本次额外发现）：

1. **`html[data-theme]` 是上游 CSS 的运行时契约**——`--anzhiyu-*` 只定义在 `[data-theme=light/dark]` 下，不写则 `#web_bg` 背景是透明。Phase 4 必须做首屏前 theme bootstrap。
2. **重执行会给 document 叠加监听**——4 次执行后 dispatch 一次会命中 4 次。shim 必须提供幂等初始化 / refreshFn 注册表。
3. **上游「非 data-pjax 脚本 pjax 后不执行」的语义 Astro 不保证**——Astro 会执行首次见到的页面级脚本。Phase 4 需逐个审计：每次都要跑的用 `data-astro-rerun`，只整页跑的收敛进常驻模块。

**环境限制（诚实记录）**：本机 Playwright 被 DSH Windows 沙箱阻断（`spawn EPERM` + Chromium mojo 通道 `拒绝访问 (0x5)`），真实浏览器验证改走 wincu 浏览器通道（真实 Edge）+ 页内 harness，54/54 断言通过。Playwright 脚本已按同套断言写好保留，**作为 CI 入口**——本机跑不了这件事写进 §7 风险 R12。

---

### Phase 2 — 布局与核心页面 ⬜

**目标**：不接任何交互 JS 的情况下，首页 / 文章页 / 归档页的结构与样式与上游一致。

前置：Phase 1 完成（样式全量编译 + 配置层可用）。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P2-1 | 内容集合与 frontmatter schema | `src/content.config.ts` + unified 处理器配置（ADR-001） | fixture 的 10 篇文章全部通过校验；脚注、GFM 正常渲染 | 0.5 | ✅ |
| P2-13 | HTML diff 工具 | `scripts/diff-html.mjs`：归一化后比对两棵 DOM | 同一份 HTML diff 为空；属性顺序/空白/哈希差异被忽略 | 0.5 | ✅ |
| P2-14 | 基线归档 + CI 接线 | `tests/baseline-html/`（477 KB）+ `scripts/extract-baseline-html.mjs` | CI 自动解压并跑 diff；归档与 baseline.json 48 页 1:1 | 0.5 | ✅ |
| P2-15 | Markdown/日期对齐 | `smartypants: false`；`src/utils/date.ts` | `-->` 原样保留；59 条日期对拍（含跨天）通过 | 1 | ✅ |
| P2-2 | `BaseLayout.astro` | 对应 `layout.pug` 91 行：`#web_bg`、`#body-wrap`、`#content-inner` 等全部 ID | 渲染出的 DOM 里 ID 与上游一致 | 1 |
| P2-3 | Head 组件 | 对应 `head.pug` + OG + preconnect + site_verification | `view-source` 里 OG/canonical/favicon 齐全 | 0.5 |
| P2-4 | Header / Footer | 对应 `header/index.pug`、`footer.pug` | 视觉 diff 通过 | 1 |
| P2-5 | Sidebar / Rightside | 对应 `sidebar.pug`、`rightside.pug` | 视觉 diff 通过 | 1 |
| P2-6 | 12 个 Hexo helper 的 TS 实现 | `src/utils/`：`page_description`、`cloudTags`、`urlNoIndex`、`findArchivesTitle`、`related_post` 等 | 每个函数有单测，输出与上游 helper 一致 | 1 |
| P2-7 | 首页 + 分页 | `index.astro` + `[...page].astro` + PostCard | 第 1/2/3 页结构正确，视觉 diff 通过 | 1 |
| P2-8 | 文章页 | `post/[...slug].astro`：PostInfo、版权、打赏、ptool | 视觉 diff 通过 | 1.5 |
| P2-9 | 归档 / 分类 / 标签 | 三个路由 + 分页 | 每类页面至少一个样本视觉 diff 通过 | 1 |
| P2-10 | 404 | `404.astro` | 与上游 404 一致 | 0.2 |
| P2-11 | i18n | 4 个字典 + `t()`，对齐上游 `_p()` | 切换语言后文案正确，缺键回退 default | 0.5 |
| P2-12 | Phase 2 验收 | — | 见下 | 0.3 |

**验收**：
- [ ] 首页 / 文章 / 归档三类页面，三档视口像素差异 ≤1%
- [ ] HTML 结构 diff 只剩资源哈希差异
- [ ] 分页 2、3 页结构正确
- [ ] `view-source` 的 head 完整

**风险**：P2-8 文章页依赖的 `post-ui.pug` 体系较大，如果 diff 过不去，先按「区块逐个勾选」推进，不阻塞其他页面。

#### Phase 2 已确认的三类渲染差异（marked → remark，会稳定出现在 diff 里）

这三条不是噪音，是必须逐条决策的真实差异：

| # | 差异 | 上游行为 | 我们当前行为 | 决策 |
| --- | --- | --- | --- | --- |
| M1 | 代码块 | `figure.highlight` + hljs 类名体系（302KB 样式里 `_highlight/*` 全部按它写） | Shiki 默认输出 `<pre class="astro-code">` | **必须对齐**：Phase 2 文章页任务里配置 Shiki 或后处理成上游 DOM；否则 42 个 tag 的 `_tags/*.styl` 与代码高亮样式全不命中 |
| M2 | 脚注 | marked 7.0.1 不渲染，原样输出 `[^note1]` | remark-gfm 渲染出 `data-footnotes` 区块 | 保留我们的（附录 A #2 是特性），diff 白名单登记 |
| M3 | 标题 id slug | `不能被「优化」的部分`（保留中文引号） | `不能被优化的部分`（github-slugger 去掉标点） | **必须对齐**：写一个 Hexo/marked 兼容的 slugger，否则 TOC 锚点与上游不一致 |

---

### Phase 3 — widget 与页面模板 ⬜

**目标**：所有 `page.type` 都能正确分发并渲染。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P3-1 | 15 个 widget 卡片 | 作者、公告、最新文章、分类、标签、归档、网站信息、广告、TOC、控制台归档/标签… | 每个卡片视觉 diff 通过 | 3 |
| P3-2 | `page.type` 分发机制 | 按类型路由到模板 | 12 种类型都有对应输出 | 0.5 |
| P3-3 | 简单模板 ×6 | `essay`、`album`、`album_detail`、`flink`、`music`、`default` | 视觉 diff 通过 | 2 |
| P3-4 | 中等模板 ×3 | `categories`、`tags`、`fcircle` | 视觉 diff 通过 | 1.5 |
| P3-5 | 复杂模板 ×2 | `room`、`equipment` | 视觉 diff 通过 | 1.5 |
| P3-6 | `about` 模板（上游 23 KB） | 技能卡、收藏夹、音乐、地图等区块 | 逐块对比通过 | 2 |
| P3-7 | Phase 3 验收 | — | 见下 | 0.3 |

**验收**：12 种 `page.type` 全部渲染成功；`about` 页逐块截图对比无差异。

**排序建议**：P3-3 → P3-4 → P3-5 → P3-6 由易到难，`about` 放最后单独做，避免它卡住整个阶段。

---

### Phase 4 — 交互层与路由 ⬜

**目标**：站点「活」起来，且行为与上游基线一致。

前置：Phase 1.5 的五项结论落地。若 P1.5-4 判定音频无法持久，P4-7 走持久层方案。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P4-1 | `GLOBAL_CONFIG` 注入 + 资源解析层 | `<head>` 内联约 40 键对象；`plugins.yml` 的 asset URL 解析（9 种 provider） | 对象键集合与上游 diff 为空；切 provider 后资源 URL 全量变化 | 1 |
| P4-2 | `main.js` / `utils.js` 移植 | 保持原文件名与原逻辑，`export` 包装后挂 `window.anzhiyu` | 打包产物存在，`window.anzhiyu` 可访问 | 1.5 |
| P4-3 | ClientRouter + pjax shim | `pjax.loadUrl`、`pjax:complete` 兼容层 | 模板里现有的 `onclick="pjax.loadUrl(...)"` 不用改就能用 | 1.5 |
| P4-4 | 全局功能组一 | 暗色模式、阅读模式、回到顶部、侧栏折叠 | 逐项对照行为基线回放通过 | 2 |
| P4-5 | 全局功能组二 | lazyload、图片大图、右键菜单、快捷键、繁简转换 | 逐项对照行为基线回放通过 | 2 |
| P4-6 | 全局中控台 | 面板、开关、副作用 | 与基线一致 | 1 |
| P4-7 | 音乐播放器 | APlayer + Meting | 播放中导航不中断，进度保留 | 1.5 |
| P4-8 | 搜索 UI | 本地 / Algolia / DocSearch 三套的选择与初始化 | 三种模式各跑通一次 | 1.5 |
| P4-9 | 主色调随封面 | `colorthief` 取色 → CSS 变量 | 切换文章主色变化，与基线一致 | 0.5 |
| P4-10 | Phase 4 验收 | — | 见下 | 0.5 |

**验收**：
- [ ] 站内点击 document 请求为 0
- [ ] 暗色模式导航后保持
- [ ] 右键菜单 / 中控台 / 快捷键可用
- [ ] 前进后退不出现重复初始化（console 无重复监听报错）
- [ ] 音乐播放跨页不中断

**风险**：这是全计划风险最高的阶段。若 shim 无法覆盖上游模板里的编程式跳转，退路是保留模板的 `onclick` 但把 `pjax` 对象替换成一个只做 `navigate()` 的轻量替身——成本低于改 120 个 pug。

---

### Phase 5 — 第三方集成 ⬜

**目标**：所有外部服务接得上，每个用真实服务验一次。

| ID | 任务 | 内容 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P5-1 | 评论 ×5 | Valine、Waline、Twikoo、Artalk、Giscus + 计数 + 最新评论卡片 | 每种真实发表一条评论 | 2 |
| P5-2 | 搜索索引 ×3 | 本地索引生成、Algolia、DocSearch | 三种各搜出一个结果 | 1.5 |
| P5-3 | 分析 ×5 | Google、百度、CNZZ、Cloudflare、Microsoft Clarity | 每种在面板里看到一次 pageview | 1 |
| P5-4 | 增强 | AI 摘要、聊天 ×5、音乐球、广告位、隐私协议弹窗 | 逐项截图留档 | 1.5 |
| P5-5 | Phase 5 验收 | — | 全部集成有截图与分析面板证据 | 0.3 |

**注**：评论与分析的密钥走环境变量，不写进仓库。CI 只验「组件能渲染、无运行时错误」，真实联通验收在本地 dev 一次人工过。

---

### Phase 6 — 42 个 Hexo tag ⬜

**目标**：存量文章不改一个字也能正常渲染。

**可以与 Phase 3–5 并行**：`remark-hexo-tag` 是独立包，只依赖 Markdown/AST 层，不依赖组件层。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P6-1 | remark 插件骨架 | `packages/remark-hexo-tag`，能识别 `{% xxx %}` | 解析出 tag 名与参数，未知 tag 报错可定位 | 0.5 |
| P6-2 | 简单 tag ×12 | `u`、`emp`、`wavy`、`del`、`kbd`、`psw`、`label`、`inlineImg`、`icon`、`btn`、`p`、`span` | 单测：输入 → HTML 与上游一致 | 1 |
| P6-3 | 块级容器 tag ×12 | `note`/`subnote`、`tabs` 系列、`hide` 系列、`folding`、`checkbox`/`radio`、`timeline` | 同上 | 1.5 |
| P6-4 | 媒体与卡片 tag ×11 | `image`、`inlineimage`、`audio`、`video`、`videos`、`gallery`/`galleryGroup`、`site`/`sitegroup`、`btns`/`cell` | 同上 | 1.5 |
| P6-5 | 第三方嵌入 ×7 | `bilibili`、`dogeplayer`、`mermaid`、`link`、`flink`、`tip`、`intCard` | 同上 | 1 |
| P6-6 | 输出对齐验收 | 42 个 tag 各一篇 fixture 文章 | HTML diff 为空（忽略空白与属性顺序） | 0.5 |
| P6-7 | 样式命中 | `_tags/*.styl` 对生成的 HTML 生效 | 每类 tag 视觉与上游一致 | 0.5 |
| P6-8 | 可选 codemod | `{% note %}` → MDX 组件的转换工具 | 转换一个真实站点不出错 | 1 |

**验收**：
- [ ] 42 个 tag 的 fixture 页面 HTML diff 为空
- [ ] `_tags/*.styl` 全部命中
- [ ] 未知 tag 有清晰报错，不静默丢弃

**风险**：属性顺序与空白难以逐字节对齐。接受「DOM 归一化后 diff 为空」，不追求源文本一致。

---

### Phase 7 — PWA、性能、迁移文档 ⬜

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P7-1 | PWA | `@vite-pwa/astro` + `sw-rules.js` 规则翻译 | 离线可访问首页；CDN 备用 URL 逻辑生效 | 1 |
| P7-2 | 性能预算 | 首屏 JS 体积、LCP、CLS 基线 | Lighthouse 四项不低于上游 | 1 |
| P7-3 | 迁移指南 | Hexo 站 → Astro 的完整步骤 + 配置模板 | 拿真实 Hexo 站按文档走一遍能跑起来 | 1.5 |
| P7-4 | 迁移脚本 | `_config.anzhiyu.yml` → 新配置；frontmatter 校验 | 跑通用户现有配置（xcAnzhiyu 1.6.14 的配置） | 1 |
| P7-5 | 上游同步机制 | 季度 diff 检查流程 + `docs/upstream-delta.md` | 能列出基线之后的变更 | 0.5 |
| P7-6 | 发布 | 首个版本、主题包发布、示例站部署 | `npm i` 后用起来 | 0.5 |

**验收**：真实站点（`D:\Git-project\xcAnzhiyu`，主题 1.6.14）按迁移文档走通；Lighthouse 达标。

**注意**：用户的真实站是 1.6.14，基线是 1.7.1。迁移验收要区分两件事——「1.7.1 还原度」和「用户站从 1.6.14 升级」。后者含 1.6→1.7 的上游变更，Phase 7 需要单独一份变更清单。

---

## 5. 依赖与关键路径

### 5.1 依赖图

```
Phase 0 ✅
  └─> Phase 1 (P1-5 样式全量 → 其余任务)
        ├─> Phase 1.5 (垂直切片) ──> Phase 4 (交互层)
        ├─> Phase 2 (布局与核心页) ──> Phase 3 (widget/模板)
        │        └─> Phase 5 (集成，需要页面承载)
        └─> Phase 6 (tag 插件，可与 Phase 3/5 并行)

Phase 2–6 全部完成 ──> Phase 7 (收尾)
```

### 5.2 可并行的

- **Phase 6 与 Phase 3/5**：`remark-hexo-tag` 是独立包，AST 层工作，不碰组件。
- **P1-7/P1-8 配置层与 P1-5 样式编译**：一个改 TS，一个改 Stylus 与插件，文件不重叠。
- **P3 各模板之间**：12 个页面模板互不依赖，可分给多个 agent 各做一个。
- **P5 各集成之间**：评论 ×5、分析 ×5 彼此独立。

### 5.3 关键路径

```
P1-5 样式全量编译
  → P1.5 垂直切片（决定 Phase 4 架构）
  → P2-2 BaseLayout
  → P2-8 文章页
  → P4-3 pjax shim
  → P7-3 迁移文档
```

这条链上任何一环延期，整体延期。其中 **P1-5 和 P1.5 是本计划的真正闸门**——它们各自只需要 1–2 天，但如果结论是「跑不通」，需要重估的就不只是这两个任务。

### 5.4 阻塞点

| 阻塞 | 阻塞谁 | 解除方式 |
| --- | --- | --- |
| P1-5 未过 | Phase 2 全部 | 先解决样式编译，不并行开 Phase 2 |
| fixture 未产出 | 所有对比验收 | P1-6 必须早于 Phase 2 |
| CI 未建 | 权威构建 | P1-10 必须早于 Phase 2 |

---

## 6. CI 与发布

### 6.1 流水线设计

`.github/workflows/ci.yml`：

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter blog build
      - run: pnpm verify
      - run: pnpm compare-vars
      - run: pnpm check:upstream-delta
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: examples/blog/dist
```

实际落盘的 `.github/workflows/ci.yml` 比上面多两处修正：不写 `with.version`（否则与 `packageManager: pnpm@10.29.3` 冲突报 `Multiple versions of pnpm specified`）；加 `permissions: contents: read`、`timeout-minutes: 15`、`if-no-files-found: error`。

**浏览器测试放 CI，不放本地**：本机 Playwright 被 DSH 沙箱阻断（见 R12），Phase 2 起在 Ubuntu runner 上加 Playwright 步骤；本地只做结构断言与 wincu 通道抽查。

**为什么要这个 CI**：

1. 用户项目级约定：构建走 CI，本地不产出验收依据。
2. Linux CI 与 Windows 本地是两套路径语义——插件全是 Node 侧代码，跨平台是必须验证的假设，不是顺带。
3. HTML diff / 像素 diff 依赖固定环境，本地 Windows 字体与 CI Linux 渲染结果不同，基准必须在 CI 上跑。

**阶段扩展**：

| 阶段 | CI 增加 |
| --- | --- |
| Phase 2+ | `diff-html.mjs`、Playwright 像素 diff（Ubuntu + 固定字体） |
| Phase 4+ | 交互冒烟：Playwright 点一遍主要交互，看 console 无报错 |
| Phase 6+ | 42 tag fixture 的 HTML diff |
| Phase 7 | Lighthouse CI |

**注意**：`pnpm-lock.yaml` 锁 Node 24 + pnpm 10，CI 必须用同一版本，否则 lockfile 校验失败。

### 6.2 版本与发布

- 主题包 `astro-theme-anzhiyu` 走 npm 语义化版本，首个可用版本等 Phase 3 完成后再发。
- `remark-hexo-tag` 和 `vite-plugin-stylus-hexo-config` 是独立包，可以更早单独发布、单独被使用。
- tag 一次性打好不重打；不覆盖已有 release。

### 6.3 上游同步

- 迁移期：不追上游。基线锁在 `72439d93`。
- 迁移后：每季度跑一次 diff，把上游变更按「必须跟进 / 可选 / 无关」分类，写入 `docs/upstream-delta.md`。
- 上游仍在维护（1.7.1，2026-11 仍是活跃版本），长期不跟进会落后，这点在 Phase 7 写成固定流程。

---

## 7. 风险登记册

按「会不会推翻架构」排序。

| # | 风险 | 概率 | 影响 | 应对 | 归属 |
| --- | --- | --- | --- | --- | --- |
| R1 | 上游 302 KB 样式无法全量编译（`_extra/**/*.css`、未验证的 `hexo-config` 形态） | 中 | 高 | P1-5 提前验证；退路是编译前脚本预展开 glob | P1-5 |
| R2 | pjax 行为无法等价，音乐播放 / 全局背景失效 | ~~高~~ → **已排除** | 高 | ✅ Phase 1.5 实测：`#web_bg` 同节点、audio 跨页不中断、document 请求 0 | P1.5 |
| R3 | ClientRouter 整 body 替换导致初始化重复、事件泄漏 | 中 | 高 | **实测已出现**：重执行会叠加 document 监听（第 2 条前提）。Phase 4 必须做幂等初始化/refreshFn 注册表 | P4-3 |
| R4 | 42 个 tag 的 HTML 产物难以对齐 | 中 | 中 | 接受 DOM 归一化后 diff，不追求字节一致 | P6 |
| R5 | Astro 7 Rust 编译器对 pug 风格的 HTML 报未闭合标签 | ~~中~~ → **已排除** | 中 | ✅ P1.5 实测：`<br><img><input><hr>` 不闭合正常进产物 | P1.5 |
| R6 | 上游持续更新，移植版落后 | 中 | 中 | 冻结基线 + 季度 diff | P7-5 |
| R7 | 第三方库升级（Waline/Twikoo 等）导致集成失效 | 中 | 低 | 版本锁在 `plugins.yml` 对应版本，升级单独验 | P5 |
| R8 | `about` 等巨型模板（23 KB）迁移遗漏 | 中 | 低 | 逐块截图勾选，不靠整页 diff | P3-6 |
| R9 | Windows 与 Linux 的路径 / 大小写差异导致 CI 与本地结果不同 | 中 | 中 | CI 从 Phase 1 就有，跨平台问题早暴露 | P1-10 |
| R10 | 插件 import 去重与 Stylus 语义差异导致产物偏差（D6） | ~~低~~ → **已解决** | 中 | 按 `@require`/`@import` 分别处理，产物 +0.52% 且可完整归因 | P1-5 |
| R11 | 配置 schema 200 键手抄出错 | 中 | 低 | defaults 从上游 YAML 脚本生成，不手抄 | P1-7 |
| R12 | 本机 Playwright 被 DSH Windows 沙箱阻断（`spawn EPERM` + Chromium mojo `拒绝访问 0x5`），浏览器级回归本地跑不了 | 高 | 中 | 脚本按 CI 入口写好；Phase 2 起浏览器测试放 CI（Ubuntu 无此限制），本地用 wincu 通道抽查 | P2-12 |
| R13 | schema 大量区块 passthrough，拼错的顶层键被静默透传 | 中 | 中 | P1-12 收成 `.strict()`，未知顶层键必须报错 | P1-12 |

---

## 8. 当前进度与剩余清单（2026-11-23 22:56）

### 8.1 已完成（可以随时接手）

- **Phase 0 ✅ / Phase 1.5 ✅ / Phase 1 约 87%**（P1-9 第三条随构建链路收口）
- **Phase 2 约 95%**：布局四组件、首页 + home_top、文章页、归档/分类/标签/404、helper/i18n/日期、外链语义、diff 21 条归一化全部落地；退出动作（48 页 PASS + CI 硬门禁）未做
- **Phase 3 约 56%**：15 个 aside widget、page.type 分发 + 11 个模板、about 14 个区块组件（`#about-page` 子树 0 差异）
- **Phase 4 约 30%**：GLOBAL_CONFIG / config-diff / inject_head_js / 资源解析 / 上游 JS / ClientRouter / console 已落盘；7 类收尾差异修复中
- **Phase 5 约 8%**：第三方集成组件库 + 自检脚本进行中（未接线）
- **Phase 6 约 87%**：42 个 tag 全实现、59/59 单测；剩视觉与 TOC/脚注边角
- **Phase 7 约 18%**：迁移脚本 + xcAnzhiyu 真实站演练产物 292 文件已完成，指南/验收报告收尾中
- 关键度量：**构建 62 页**；全量 diff 48 页 / **PASS 0** / **差异 112 条**（脚本样式 48 / 属性 29 / 结构 29 / 文本 6）/ 缺 56 / 多 113

### 8.2 剩余未完成（按优先级）

| # | 任务 | 归属 | 状态 |
| --- | --- | --- | --- |
| 1 | Phase 4 收尾 7 类：config-diff 48 条（含 tags-thirdparty head 注入）、og:url 15 条、input#page-type 9 条、short-note 47 节点、console 二维码、about 2 脚本、postAI；另需 BaseLayout→Head 透传 postUpdate/postAI/postMainColor | 待续（p4-finish 已停止，未落盘） | ⬜ |
| 2 | Phase 5 收尾：组件库 55 文件 + 自检脚本已落盘，剩自检跑通、P5-1 报告、接线到 Head/BaseLayout | 待续（p5-integrations 已停止） | ◐ |
| 3 | Phase 7 文档 ✅ `docs/MIGRATION.md`、`docs/notes/P7-3-migration.md`、`.gitignore`、源站只读 sha256 三次实证（44fc1a2 / 10828b4） | migration-tool-v2 | ✅ |
| 4 | Phase 7 真实站完整构建：lenient 模式已实现但未验收（59/59 单测需复跑），真实内容 + 真实配置 build 未通过，禁止删文章/换配置换绿灯 | 待续（p7-real-build 已停止） | ◐ |
| 4 | Phase 2 退出：48 页 PASS / `.github/workflows/ci.yml` diff 去 `\|\| true` 改硬门禁 / artifact 加 `if: always()` | Lead + 待分配 | ⬜ |
| 5 | Phase 4 行为验收：暗色/右键/中控台/音乐/搜索/主色调/站内无整页刷新 | 待分配 | ⬜ |
| 6 | Phase 3 剩余：11 个 page.type 模板浏览器走查 | 待分配 | ⬜ |
| 7 | Phase 6 收尾：42 tag 视觉与 `_tags/*.styl` 命中、tags-media TOC 偏移（`#gallery`↔`#videos`）、tags-thirdparty head 节点、脚注定义段落 | 待分配 | ⬜ |
| 8 | Phase 5 接线：组件库挂到 Head / BaseLayout（Lead 统一安排） | Lead | ⬜ |
| 9 | Phase 7 剩余：PWA、性能、发布、上游同步、迁移产物可构建验证 | 待分配 | ⬜ |

### 8.3 已知待决策项

1. **资源路径策略**：diff 每页报 1 条资源路径豁免（`/css/index.css` ↔ `/_astro/*.css`），Phase 7 按 [resource-path-policy](resource-path-policy.md) 决定是否做到字节级
2. **M2 脚注差异**：我们渲染真脚注（特性），上游原样输出——diff 白名单已登记，保留我们的；剩余 1 条脚注定义段落 `node-missing` 待归一化或补渲染
3. **config-diff 根因已定位**：`Head.astro:256` 把整篇正文塞进内联 JS，`tags-thirdparty` 页正文里的 `</script>` 提前闭合脚本导致正文泄进 `<head>`。修 `getPageFillDescription()` + `postUpdate` 可同时消掉 48 条 content 与 8 个 head 异常节点（p4-finish 进行中）
4. **迁移脚本两条真实边界**：`charts` 页 type 未分发、`layout: sitetime` 页会 404，属 Phase 3/7 已知缺口，文档如实标注不假装支持

**恢复工作时的入口**：`export PATH="/c/Program Files/nodejs:$PATH"`（Astro 7 需 Node ≥22.23.4）→ `git pull` → `pnpm install --frozen-lockfile` → `pnpm --filter blog build` → `node scripts/extract-baseline-html.mjs` → `DIST_DIR=.dist-snapshot BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json` 看两条曲线（PASS 页数、diffCount）。并行构建须持 `.build.lock` 并设 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。

---

## 附录 A：30 项特性 → 阶段映射

上游 README 的功能特性，实数 30 项（03 写的 31 项有误）。这一份是最终验收清单。

### 内容与渲染（7）

| # | 特性 | 阶段 | 怎么验 |
| --- | --- | --- | --- |
| 1 | 多种代码高亮方案 | P4-2 | 三种主题切换后代码块颜色正确 |
| 2 | 脚注语法 | P2-1 | fixture 文章的脚注渲染并跳转 |
| 3 | LaTeX 数学公式 | P5-4 | 含公式文章在 MathJax/Katex 两种配置下都渲染 |
| 4 | mermaid 流程图 | P6-5 | mermaid tag 渲染成图 |
| 5 | 文章字数统计 | P2-6 | 卡片与文章页字数与上游一致 |
| 6 | 文章 AI 摘要 | P5-4 | 配置后文章顶部出现摘要块 |
| 7 | 多语言配置 | P2-11 | 切 4 种语言文案全变 |

### 导航与交互（10）

| # | 特性 | 阶段 | 怎么验 |
| --- | --- | --- | --- |
| 8 | 页面组件懒加载（pjax） | P4-3 | 站内导航无 document 请求 |
| 9 | 图片懒加载 | P4-5 | 滚动到位置才发图片请求 |
| 10 | 图片大图查看 | P4-5 | 点图开灯箱，关闭正常 |
| 11 | 暗色模式 | P4-4 | 首访跟系统 / 手动切 / 刷新保持 / 导航后保持 |
| 12 | 沉浸式状态栏 | — | 人工，移动端浏览器截图 |
| 13 | 定制化右键菜单 | P4-5 | 右键出现自定义菜单，选项可用 |
| 14 | 主色调随封面 | P4-9 | 切换文章主色变化 |
| 15 | 全局中控台 | P4-6 | 打开面板，逐个开关有反应 |
| 16 | 快捷键 | P4-5 | 各组合键触发动作 |
| 17 | 丰富标签选项 | P6-7 | 42 tag 样式全命中 |

### 评论与集成（7）

| # | 特性 | 阶段 | 怎么验 |
| --- | --- | --- | --- |
| 18 | 内置多款评论插件 | P5-1 | 5 种各发一条 |
| 19 | 访问统计 | P5-3 | 5 种各看到一次上报 |
| 20 | 搜索（本地/Algolia/DocSearch） | P4-8 / P5-2 | 三种各搜出结果 |
| 21 | 聊天系统 | P5-4 | 5 家各见一次悬浮入口 |
| 22 | 音乐球 | P5-4 | 点击展开播放器 |
| 23 | 广告挂载 | P5-4 | 配置位置出现广告位 |
| 24 | 隐私协议 | P5-4 | 首访弹窗，同意后不再弹 |

### 视觉与资源（4）

| # | 特性 | 阶段 | 怎么验 |
| --- | --- | --- | --- |
| 25 | 瀑布流即刻说说 | P3-3 | essay 页瀑布布局正确 |
| 26 | 瀑布流相册集 | P3-3 | album 页瀑布与灯箱正常 |
| 27 | 阿里图标与 Font Awesome | P4-2 | 两套图标都显示 |
| 28 | 自定义 CDN 静态资源 | P4-1 | 切 provider 后资源 URL 变化 |

### 构建与文档（2）

| # | 特性 | 阶段 | 怎么验 |
| --- | --- | --- | --- |
| 29 | PWA | P7-1 | 断网后首页仍可访问 |
| 30 | 配套用户文档 | P7-3 | 新用户按文档从零跑起来 |

---

## 附录 B：42 个 Hexo tag

上游 `scripts/tag/` 21 个文件注册的全部 tag，按 Phase 6 分组：

| 组 | tag |
| --- | --- |
| 行内语义（12） | `u` `emp` `wavy` `del` `kbd` `psw` `label` `inlineImg` `icon` `btn` `p` `span` |
| 块级容器（12） | `note` `subnote` `tabs` `subtabs` `subsubtabs` `hideInline` `hideBlock` `hideToggle` `folding` `checkbox` `radio` `timeline` |
| 媒体与卡片（11） | `image` `inlineimage` `audio` `video` `videos` `gallery` `galleryGroup` `site` `sitegroup` `btns` `cell` |
| 第三方嵌入（7） | `bilibili` `dogeplayer` `mermaid` `link` `flink` `tip` `intCard` |

## 附录 C：8 项技术验证清单

| # | 问题 | 状态 | 归属 |
| --- | --- | --- | --- |
| 1 | Stylus glob `@import '_global/*'` 在 Vite 8 + Astro 7 下工作 | ✅ 通过（全量 72 styl + 47 css 实际编译验证） | P1-5 |
| 2 | `hexo-config()` 在 `if` / `convert()` / `alpha()` 里求值 | ✅ 通过（179 处全命中，102 个唯一键） | P1-5 |
| 3 | ClientRouter 整 body 替换后 `#web_bg` 样式是否保留 | ✅ 通过（同节点 + 12 项 computed style 相等） | P1.5 |
| 4 | ClientRouter 下 `script[data-pjax]` 重执行能否等价 | ✅ 通过（`data-astro-rerun`，每次导航 +1） | P1.5 |
| 5 | 生成的 HTML 能否命中现有 Stylus 的 class | ✅ 通过（`.note`/`.recent-post-item`/`#web_bg` computed style 命中） | P1.5 |
| 6 | Astro 7 Rust 编译器对 pug 转出的 HTML 是否报错 | ✅ 通过（不闭合标签正常） | P1.5 |
| 7 | `@vite-pwa/astro` 能否表达 `sw-rules.js` 的 CDN 备用逻辑 | ⏳ | P7-1 |
| 8 | 音乐播放器在整 body 替换下能否不中断 | ✅ 通过（audio 跨 4 次导航同一节点，持续播放） | P1.5 |

## 附录 D：里程碑

| 里程碑 | 内容 | 判据 |
| --- | --- | --- |
| M1 | 样式管线可信 | ✅ P1-5 已过：全量编译 + 与基准差 +0.52% |
| M2 | 架构分叉消除 | ✅ Phase 1.5 五项全过，Phase 4 按原方案推进 |
| M3 | 静态站可看 | Phase 2 视觉 diff ≤1% |
| M4 | 全部页面可渲染 | Phase 3 退出 |
| M5 | 站点可交互 | Phase 4 退出 |
| M6 | 功能完整 | Phase 6 退出 |
| M7 | 可发布 | Phase 7 退出，真实站点迁移成功 |
