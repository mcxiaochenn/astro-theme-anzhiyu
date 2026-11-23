# 迁移执行计划

从 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 1.7.1 到 Astro 7 的完整移植计划。

**这份文档是唯一的执行基线。** 任务粒度、依赖、验收命令、进度都在这里；[01 上游调研](01-upstream-analysis.md)、[02 技术映射](02-astro-mapping.md)、[03 初版计划](03-migration-plan.md) 是背景与决策记录。冲突时以本文件为准。

状态标记：`✅` 已完成 · `◐` 进行中 · `⏳` 待验证 · `⬜` 未开始

**更新规则**：每完成一个任务改它的状态并写一句验收结果；进度快照（§1）跟着改。不更新进度的计划没有意义。

---

## 1. 当前状态

**快照时间：2026-11-23 18:35**

### 1.1 仓库

| 项 | 值 |
| --- | --- |
| 提交 | `ad20443` feat: P1-5 全量样式编译打通并归档报告；P1-7 配置默认值与 schema 首版 |
| 提交数 | 12 |
| 工作区 | 干净，与 `origin/main` 同步 |
| CI | 已建立（`.github/workflows/ci.yml`），首次运行已定位并修复一处真实构建错误 |
| 代码量 | 插件约 700 行 + 配置包 6 文件 + 验证站 + fixture 10 篇 |

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

### 1.3 Phase 1 的真实边界

**Phase 1 完成度：按 03 原口径约 78%（4.5 / 5.5 人日），按本文件细拆口径 60%（4.5 / 7.5）。**

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
| D9 | **未定位**：`_highlight/highlight.styl:29` 的 `if $prismjs_enable` 守卫在全部 72 个 styl 里从未赋值，本地实测 Stylus 未定义变量在 `if` 里当假，但产物多出 34 条 prismjs 规则（+3.5 KB） | +0.52% 差异的主要来源；若上游实际不输出这些规则，则我们多输出了约 3.5 KB | Phase 7 动压缩/基准前必须定位；不影响 P1-5 判定 |

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

```bash
# 归一化后比对：忽略属性顺序、空白、资源哈希、注释
node scripts/diff-html.mjs <baseline>/<page>.html <dist>/<page>/index.html
```

通过标准：差异只允许出现在资源路径哈希与注释。

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
| Phase 1 | 构建管线与配置层 | ◐ | 7.5 | 4.5 |
| Phase 1.5 | 垂直切片去风险 + 基准固化 | ⬜ | 1.8 | 0 |
| Phase 2 | 布局与核心页面 | ⬜ | 9.5 | 0 |
| Phase 3 | widget 与页面模板 | ⬜ | 10.8 | 0 |
| Phase 4 | 交互层与路由 | ⬜ | 13 | 0 |
| Phase 5 | 第三方集成 | ⬜ | 6.3 | 0 |
| Phase 6 | 42 个 Hexo tag | ⬜ | 7.5 | 0 |
| Phase 7 | PWA、性能、迁移文档 | ⬜ | 5.5 | 0 |
| **合计** | | | **≈62** | 5 |

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
| P1-8 | 配置加载层 | `loader.ts`：YAML → 深合并默认值 → 校验 → 类型导出 | 少写必填键时失败并打印键路径 | 1 | ⬜ |
| P1-9 | Phase 1 验收 | 三条验收全绿 | 见下 | 0.5 | ◐ |
| P1-10 | CI 基础流水线 | `.github/workflows/ci.yml` + `scripts/verify-css.mjs` | PR 上自动 install + build + verify | 0.5 | ◐ |

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
- [ ] `var(--anzhiyu-main)` 等 CSS 变量值与上游一致 —— 待逐值比对（baseline 已存 69 个 `--anzhiyu-*` 变量）
- [ ] 配置缺必填键时构建失败，报出键路径 —— 待 P1-8 完成后验

CI 流水线见 §6.1。已实际运行一次并修复 lightningcss 构建错误。

**退出标准**：三条验收全绿 + CI 在 PR 上跑通。

---

### Phase 1.5 — 垂直切片去风险 ⬜

**为什么插这一阶段**：8 项技术验证里还剩 6 项，其中 5 项（ClientRouter 相关）决定 Phase 4 的实现方式，而它们是整个计划里唯一「可能推翻架构」的验证。Phase 2–4 有 33 人日的工作量压在这些假设上，验证成本却不到 2 天。横向铺完再验证是本末倒置。

**目标**：一个最小真实站点（两页）+ 真实上游样式 + ClientRouter，一次验掉 P1.5-1 到 P1.5-5。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P1.5-1 | ClientRouter 最小双页站 | 两页 Astro 站 + `ClientRouter`，套上游完整样式 | 点击站内链接不触发整页刷新（Network 里无 document 请求） | 0.3 |
| P1.5-2 | 全局元素持久化验证 | 验证 8 项 #3 | 导航后 `#web_bg` 背景不闪断、不重播入场动画 | 0.3 |
| P1.5-3 | `script[data-pjax]` 重执行等价 | 验证 8 项 #4 | 导航后新页的 data-pjax 脚本执行，旧页的不重复执行 | 0.3 |
| P1.5-4 | 音乐播放器持久化实验 | 验证 8 项 #8 | 播放中导航，音频不中断（`transition:persist` 或独立持久层） | 0.3 |
| P1.5-5 | pug 风格 HTML 与样式命中 | 验证 8 项 #5、#6 | Astro 7 编译不报未闭合标签；生成的 class 能命中上游 Stylus | 0.3 |
| P1.5-6 | 结论落盘 + 方案校准 | `docs/02-astro-mapping.md` 新增一节实测记录 | 4 项状态从「待验证」变「通过/改方案」 | 0.3 |

**关键技术点**（提前定方向，减少试错）：

- Astro 的 `transition:persist` 属性让元素跨导航存活。`#web_bg`、音频容器、右键菜单都可以标它——这正好对应上游「pjax 不换 DOM」的语义。
- `pjax:send` → `astro:before-swap`，`pjax:complete` → `astro:page-load`。shim 的映射表在 02 §ADR-003 里。
- 若 P1.5-4 失败（音频仍中断），退路是音乐播放器独立成 Shadow DOM 持久层，不随 ClientRouter 走。这条退路影响 Phase 4 的 P4-7。

**退出标准**：5 项技术验证（附录 C 的 #3 / #4 / #5 / #6 / #8）全有明确结论——通过或改方案，不允许「待验证」留到 Phase 4。Phase 4 的实现路径不再有未知的架构分叉。

---

### Phase 2 — 布局与核心页面 ⬜

**目标**：不接任何交互 JS 的情况下，首页 / 文章页 / 归档页的结构与样式与上游一致。

前置：Phase 1 完成（样式全量编译 + 配置层可用）。

| ID | 任务 | 产出 | 验收 | 估时 |
| --- | --- | --- | --- | --- |
| P2-1 | 内容集合与 frontmatter schema | `src/content.config.ts` + unified 处理器配置（ADR-001） | fixture 的 10 篇文章全部通过校验；脚注、GFM 正常渲染 | 0.5 |
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
      - run: node scripts/verify-css.mjs
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: examples/blog/dist
```

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
| R2 | pjax 行为无法等价，音乐播放 / 全局背景失效 | 高 | 高 | P1.5 用 `transition:persist` 先验；退路是独立持久层 | P1.5 / P4 |
| R3 | ClientRouter 整 body 替换导致初始化重复、事件泄漏 | 中 | 高 | 行为基线回放；每次导航断言无重复监听 | P4-3 |
| R4 | 42 个 tag 的 HTML 产物难以对齐 | 中 | 中 | 接受 DOM 归一化后 diff，不追求字节一致 | P6 |
| R5 | Astro 7 Rust 编译器对 pug 风格的 HTML 报未闭合标签 | 中 | 中 | P1.5-5 先验；转换时统一补闭合 | P1.5 |
| R6 | 上游持续更新，移植版落后 | 中 | 中 | 冻结基线 + 季度 diff | P7-5 |
| R7 | 第三方库升级（Waline/Twikoo 等）导致集成失效 | 中 | 低 | 版本锁在 `plugins.yml` 对应版本，升级单独验 | P5 |
| R8 | `about` 等巨型模板（23 KB）迁移遗漏 | 中 | 低 | 逐块截图勾选，不靠整页 diff | P3-6 |
| R9 | Windows 与 Linux 的路径 / 大小写差异导致 CI 与本地结果不同 | 中 | 中 | CI 从 Phase 1 就有，跨平台问题早暴露 | P1-10 |
| R10 | 插件 import 去重与 Stylus 语义差异导致产物偏差（D6） | 低 | 中 | P1-5 字节数对比时确认，超阈值改记账方式 | P1-5 |
| R11 | 配置 schema 200 键手抄出错 | 中 | 低 | defaults 从上游 YAML 脚本生成，不手抄 | P1-7 |

---

## 8. 下一步（按性价比排序）

**第一步：P1-8 配置加载层**（1 人日）—— schema 与 defaults 已落盘，补 loader + 三条验收。同时也是 Phase 1 唯一还没接上的环节。

**第二步：Phase 1.5 垂直切片**（1.8 人日）—— 样式管线已通，现在可以真实检验 ClientRouter 那 5 项架构假设。这是下一个真正的闸门。

**第三步：配置变量逐值比对 + CI 绿灯确认**（0.3 人日）—— 补齐 P1-9 第二条验收，并把 CI 跑绿作为可回归的基线。

三步之后的顺序：Phase 2 骨架（P2-1 内容集合 → P2-2 BaseLayout → P2-3 Head）。

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
| 3 | ClientRouter 整 body 替换后 `#web_bg` 样式是否保留 | ⏳ | P1.5-2 |
| 4 | ClientRouter 下 `script[data-pjax]` 重执行能否等价 | ⏳ | P1.5-3 |
| 5 | 生成的 HTML 能否命中现有 Stylus 的 class | ⏳ | P1.5-5 |
| 6 | Astro 7 Rust 编译器对 pug 转出的 HTML 是否报错 | ⏳ | P1.5-5 |
| 7 | `@vite-pwa/astro` 能否表达 `sw-rules.js` 的 CDN 备用逻辑 | ⏳ | P7-1 |
| 8 | 音乐播放器在整 body 替换下能否不中断 | ⏳ | P1.5-4 |

## 附录 D：里程碑

| 里程碑 | 内容 | 判据 |
| --- | --- | --- |
| M1 | 样式管线可信 | ✅ P1-5 已过：全量编译 + 与基准差 +0.52% |
| M2 | 架构分叉消除 | Phase 1.5 五项有结论 |
| M3 | 静态站可看 | Phase 2 视觉 diff ≤1% |
| M4 | 全部页面可渲染 | Phase 3 退出 |
| M5 | 站点可交互 | Phase 4 退出 |
| M6 | 功能完整 | Phase 6 退出 |
| M7 | 可发布 | Phase 7 退出，真实站点迁移成功 |
