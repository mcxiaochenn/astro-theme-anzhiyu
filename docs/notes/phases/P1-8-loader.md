# P1-8 配置加载层 + P1-9 第二条（CSS 变量逐值比对）

- 组员：p8-loader
- 时间：2026-11-23 18:32–18:55（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（上游参考：`D:\Git-project\_research\anzhiyu-upstream`）
- 运行环境：Node **v24.22.0**（默认类型剥离）、zod **4.6.7**、yaml **2.9.1**
- 本次改动（写范围内）：
  - 新增 `packages/astro-theme-anzhiyu/src/config/loader.ts`（167 行）
  - 修改 `packages/astro-theme-anzhiyu/src/index.ts`（导出 loader）
  - 新增 `packages/astro-theme-anzhiyu/scripts/check-loader.mjs`（278 行）
  - 新增 `scripts/compare-css-vars.mjs`（仓库根，236 行）
  - `packages/astro-theme-anzhiyu/package.json` 新增 `check:loader`；根 `package.json` 只新增 `compare-vars`
  - 本报告
- 未触碰：`scripts/verify-css.mjs`、`src/config/schema.ts`、`src/config/defaults.ts`、`docs/reference/baseline.json`

## 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| `loader.ts` | 落盘，读 YAML → 深合并 defaults → zod 校验 → 类型化返回 | §1 / §3 |
| `src/index.ts` 导出 | `loadThemeConfig`、`LoadThemeConfigOptions`；`ThemeConfig` 继续从 schema 导出 | §2 |
| 用例 a：上游 `_config.yml` 全量加载 | **PASS**：133 顶层键零错误；5 键抽查一致；全量深比较一致 | §3.1 |
| 用例 b：只写部分键 | **PASS**：`nav.enable` 生效；5 键抽查 == defaults | §3.1 |
| 用例 c：错误类型 | **PASS**：抛错，信息含 `highlight_copy` / `theme_color.main` 与期望类型 | §3.1 / §4 |
| `check-loader.mjs` 全量 | **PASS 30/30 项，exit 0**（a/b/c 三个主用例 + d–h 五个附加用例） | §3.1 |
| `check-schema.mjs` 回归 | **PASS**，unknown keys 0 | §3.2 |
| P1-9 第二条：CSS 变量逐值 | **严格一致 68 / 顺序差异 1 / 值不一致 0 / 缺失 0**；声明值集合 69/69 一致 | §5 |
| P1-8 / P1-9 第二条判定 | 见末段 | §7 |

一句话：loader 的三条验收与 5 个附加边界全部真实跑通；69 个 `--anzhiyu-*` 变量里有 1 个（`--anzhiyu-header-translateY`）在产物中**首次声明的位置**与基准不同，但两边 17 次声明值完全同集合（`160px×8, 0px×8, 0×1`），属 CSS 规则顺序差异而非值回归。

---

## 1. loader 设计与合并 / 校验流程

### 1.1 配置文件发现与行为

| 情形 | 行为 |
|---|---|
| `options.configPath` 显式给出 | 按该路径读取；相对路径按 `cwd` 解析；**文件不存在直接报错**（不静默回退默认值） |
| 未给 `configPath` | 在 `options.cwd ?? process.cwd()` 下按序探测 `anzhiyu.config.yml` → `_config.anzhiyu.yml` |
| 命中 `_config.anzhiyu.yml` | 正常加载，同时向 **stderr** 打 `DEPRECATED` 提示（`console.warn`） |
| 两个文件都存在 | 新名 `anzhiyu.config.yml` 优先，且不打印 deprecation |
| 一个都没找到 | 返回一份 `defaults` 校验后的深拷贝（默认值本身就是合法配置） |
| YAML 为空（`null`） | 视为「没写配置」，返回默认值 |
| 顶层不是 mapping（数组/标量） | 抛错，信息带文件路径与实际类型 |

### 1.2 合并与校验流程（伪代码）

```
cwd    = options.cwd ?? process.cwd()
path   = options.configPath ? resolve(cwd, configPath)
       : 依次探测 cwd/anzhiyu.config.yml、cwd/_config.anzhiyu.yml（命中旧名 → stderr 打 deprecation）
if (!path) return validate(clone(defaults))          // 零配置：默认值即合法配置
user   = parseYaml(readFile(path))                    // 解析失败 / 顶层非 mapping（null 除外）→ 抛错
merged = deepMerge(defaults, user)                    // 对象递归合并；数组、标量、null 整体替换；全程深拷贝
return validate(merged)                               // safeParse；失败逐条抛「完整键路径（期望 类型）: zod 信息」
```

要点：

1. **深合并语义**：两边都是普通对象才递归；数组、标量、`null`、类型不匹配一律整体替换（用户数组不拼接、不按索引合并）。
2. **深拷贝**：`defaults` 与最终返回值之间没有任何共享引用，调用方修改返回值（含嵌套数组）不会污染模块级 defaults，也不会影响下一次加载（附加用例 h 验证）。
3. **先合并后校验**：用户只写部分键时，缺失部分由 defaults 补齐后再过 schema，保证校验对象始终是完整配置。
4. **错误聚合**：zod 的每个 issue 单独一行，格式 `- <完整键路径>（期望 <类型>）: <zod 原始信息> [<code>]`，一次抛出全部问题，不做 first-error 短路。

### 1.3 错误信息格式

- 校验失败：`[theme-config] 配置校验失败（<文件路径>），共 N 处：` + 每个 issue 一行（见 §4）。
- 读取/解析失败：`[theme-config] 读取配置文件失败（<路径>）：<原因>` / `[theme-config] 解析 YAML 失败（<路径>）：<原因>`。
- 显式路径不存在：`[theme-config] 配置文件不存在：<路径>`。
- 顶层非 mapping：`[theme-config] <路径> 顶层必须是 YAML mapping（对象），实际为 <array|string|number|boolean>`。
- 旧文件名：`[theme-config] DEPRECATED: 检测到旧配置文件名 _config.anzhiyu.yml，请重命名为 anzhiyu.config.yml（旧名将在后续版本移除）：<路径>`。

## 2. 改动与导出

`packages/astro-theme-anzhiyu/src/index.ts` 现在导出：

```ts
export { defaults, type ThemeDefaults } from './config/defaults.ts';
export {
  themeConfigSchema,
  type ThemeConfig,
  type ThemeConfigInput,
  looseObject,
  KNOWN_TOP_LEVEL_KEYS,
} from './config/schema.ts';
export {
  loadThemeConfig,
  type LoadThemeConfigOptions,
} from './config/loader.ts';
```

`loader.ts` 额外提供默认导出 `loadThemeConfig`。包 `package.json` 增加脚本：

```json
"check:loader": "node scripts/check-loader.mjs"
```

根 `package.json` 只增加（其它条目未动）：

```json
"compare-vars": "node scripts/compare-css-vars.mjs"
```

> 说明：根 `package.json` 的 `devDependencies.playwright` 与 `pnpm-lock.yaml` 的变更是并行任务加的，不在本次写范围内，本任务只加了 `compare-vars` 一项。

## 3. 验收用例：命令与原始输出

### 3.1 用例 a / b / c（含 d–h 五个附加用例）

命令（仓库根）：

```powershell
cd D:\Git-project\astro-theme-anzhiyu
node packages\astro-theme-anzhiyu\scripts\check-loader.mjs
```

原始输出（exit 0，共 49 行，未删改；临时目录名每次运行随机，本次为 `theme-loader-check-gDOjsM`）：

```text
[check-loader] === 用例 a：上游 _config.yml 全量加载 ===
[check-loader] 配置源: D:\Git-project\_research\anzhiyu-upstream\_config.yml
[check-loader] 上游顶层 key 数: 133
[check-loader] PASS 全量加载零错误
[check-loader] PASS 抽查 theme_color.main — 实际 "#425AEF" / 上游 "#425AEF"
[check-loader] PASS 抽查 highlight_copy — 实际 true / 上游 true
[check-loader] PASS 抽查 cover.position — 实际 "left" / 上游 "left"
[check-loader] PASS 抽查 toc.post — 实际 true / 上游 true
[check-loader] PASS 抽查 post_copyright.license — 实际 "CC BY-NC-SA 4.0" / 上游 "CC BY-NC-SA 4.0"
[check-loader] PASS 全量深比较（133 个顶层键） — 合并结果与上游 YAML 完全一致
[check-loader] === 用例 b：只写部分键 → 默认值补全 ===
[check-loader] 部分配置: C:\Users\MCXIAO~1\AppData\Local\Temp\dsh-e00YEY\theme-loader-check-gDOjsM\partial\anzhiyu.config.yml
[check-loader]   内容: nav.enable = true
[check-loader] PASS 用户写的键生效 nav.enable — 实际 true
[check-loader] PASS 默认值补全 theme_color.main — 实际 "#425AEF" = defaults "#425AEF"
[check-loader] PASS 默认值补全 highlight_copy — 实际 true = defaults true
[check-loader] PASS 默认值补全 cover.position — 实际 "left" = defaults "left"
[check-loader] PASS 默认值补全 CDN.third_party_provider — 实际 "cbd" = defaults "cbd"
[check-loader] PASS 默认值补全 post_pagination — 实际 2 = defaults 2
[check-loader] === 用例 c：类型写错 → 抛错且信息含完整键路径 ===
[check-loader] PASS 顶层 boolean 写成字符串 → 抛错
[check-loader] 原始错误信息：
[theme-config] 配置校验失败（C:\Users\MCXIAO~1\AppData\Local\Temp\dsh-e00YEY\theme-loader-check-gDOjsM\bad\top.yml），共 1 处：
  - highlight_copy（期望 boolean）: Invalid input: expected boolean, received string [invalid_type]
[check-loader] PASS 错误信息含键路径 highlight_copy
[check-loader] PASS 错误信息含期望类型 boolean
[check-loader] PASS 嵌套键写错类型 → 抛错
[check-loader] 原始错误信息：
[theme-config] 配置校验失败（C:\Users\MCXIAO~1\AppData\Local\Temp\dsh-e00YEY\theme-loader-check-gDOjsM\bad\nested.yml），共 1 处：
  - theme_color.main（期望 string）: Invalid input: expected string, received number [invalid_type]
[check-loader] PASS 错误信息含完整键路径 theme_color.main
[check-loader] PASS 错误信息含期望类型 string
[check-loader] === 附加 d：旧文件名兼容与优先级 ===
[check-loader] PASS 旧文件名 _config.anzhiyu.yml 可加载 — 实际 false
[check-loader] PASS 旧文件名命中时打 deprecation 到 stderr — [theme-config] DEPRECATED: 检测到旧配置文件名 _config.anzhiyu.yml，请重命名为 anzhiyu.config.yml（旧名将在后续版本移除）：C:\Users\MCXIAO~1\AppData\Local\Temp\dsh-e00YEY\theme-loader-check-gDOjsM\legacy\_config.anzhiyu.yml
[check-loader] PASS 新文件名优先于旧文件名 — 实际 false
[check-loader] PASS 走新文件名时不打 deprecation
[check-loader] === 附加 e：深合并语义 ===
[check-loader] PASS 数组整体替换（site_verification 不拼接） — 实际 [{"name":"test-only","content":"abc"}] / defaults 长度 3
[check-loader] PASS 对象递归合并（theme_color.main 用用户值，其余保留默认） — main="#123456", dark_main="#f2b94b"
[check-loader] PASS 嵌套对象合并（nav.enable 用户值 + nav.menu 默认值仍在） — enable=true, menu.length=2
[check-loader] === 附加 f：无配置文件 → 默认配置 ===
[check-loader] PASS 无配置文件时返回 defaults
[check-loader] === 附加 g：显式路径不存在 ===
[check-loader] PASS 显式 configPath 不存在 → 抛错 — [theme-config] 配置文件不存在：C:\Users\MCXIAO~1\AppData\Local\Temp\dsh-e00YEY\theme-loader-check-gDOjsM\does-not-exist.yml
[check-loader] PASS 错误信息含「配置文件不存在」
[check-loader] === 附加 h：返回值与 defaults 隔离 ===
[check-loader] PASS 修改返回值后重新加载仍是默认值 — theme_color.main="#425AEF", nav.menu.length=2
[check-loader] 结果: PASS（通过 30 项，失败 0 项）
```

三个主用例各自的断言点：

- **a**：加载不抛错（零校验错误）；`theme_color.main` / `highlight_copy` / `cover.position` / `toc.post` / `post_copyright.license` 5 个键与**直接解析上游 YAML 得到的值**逐值相同；附加做了 133 顶层键全量深比较（比抽查更强，证明合并没有丢/改任何上游值）。
- **b**：用户只写 `nav.enable: true`，用户值生效；另抽查 `theme_color.main` / `highlight_copy` / `cover.position` / `CDN.third_party_provider` / `post_pagination` 5 个键严格等于 `defaults`。
- **c**：`highlight_copy: "yes"`（顶层 boolean 写成字符串）与 `theme_color: { main: 123 }`（嵌套 string 写成数字）都抛错，错误信息分别包含 `highlight_copy`、`theme_color.main` 及期望类型。

包脚本入口同样可用：

```powershell
pnpm --filter astro-theme-anzhiyu check:loader
```

```text
…（同上 49 行输出）…
[check-loader] 结果: PASS（通过 30 项，失败 0 项）
EXIT=0
```

### 3.2 schema 回归

```powershell
node packages\astro-theme-anzhiyu\scripts\check-schema.mjs
```

```text
[check-schema] upstream config: D:\Git-project\_research\anzhiyu-upstream\_config.yml
[check-schema] zod version: 4.6.7
[check-schema] yaml top-level keys: 133
[check-schema] schema declared top-level keys: 133
[check-schema] unknown keys: 0
[check-schema] result: PASS (0 errors)
```

exit 0。loader 改动没有影响原 schema 自检。

## 4. 错误信息样例原文

顶层键（`bad/top.yml` 内容为 `highlight_copy: "yes"`）：

```text
[theme-config] 配置校验失败（C:\Users\MCXIAO~1\AppData\Local\Temp\...\bad\top.yml），共 1 处：
  - highlight_copy（期望 boolean）: Invalid input: expected boolean, received string [invalid_type]
```

嵌套键（`bad/nested.yml` 内容为 `theme_color:` 下 `main: 123`）：

```text
[theme-config] 配置校验失败（C:\Users\MCXIAO~1\AppData\Local\Temp\...\bad\nested.yml），共 1 处：
  - theme_color.main（期望 string）: Invalid input: expected string, received number [invalid_type]
```

两行都同时给出**完整键路径**（`theme_color.main` 是点号连接的完整路径，不只报父区块）与期望类型（`boolean` / `string`），可直接定位到 YAML 行。

## 5. P1-9 第二条：CSS 变量逐值比对

### 5.1 命令与原始输出

```powershell
cd D:\Git-project\astro-theme-anzhiyu
node scripts\compare-css-vars.mjs
```

（或 `pnpm compare-vars`，两者输出相同）

```text
[compare-css-vars] baseline: docs\baseline.json（commit 72439d93，version 1.7.1）
[compare-css-vars] baseline cssVars: 69 个 --anzhiyu-* 变量
[compare-css-vars] CSS 源: examples\blog\dist\_astro\index.DVFB5Y3m.css
[compare-css-vars] 产物 CSS 中 --anzhiyu-* 变量: 69 个
[compare-css-vars] 上游 CSS: .baseline-work\public\css\index.css（用于声明值集合复核）
[compare-css-vars] WARN --anzhiyu-header-translateY: 基准首值 "160px" / 产物首值 "0" → 声明顺序不同（基准值仍在产物中）
[compare-css-vars]      产物声明序列（共 17 次）: 0×1, 160px×8, 0px×8
[compare-css-vars]      声明值集合与上游一致，仅出现顺序不同
[compare-css-vars] 结果: 严格一致 68 / 顺序差异 1 / 值不一致 0 / 产物缺失 0（基准共 69）
[compare-css-vars] 比对通过（1 处为声明顺序差异，取值集合一致）
```

exit 0。

比对口径（与脚本注释一致）：

1. **读取**：`docs/reference/baseline.json` 的 `css.cssVars`（P1-6 产出，69 个键）；产物 CSS 从 `examples/blog/dist/index.html` 的 `<link rel="stylesheet">` 解析，找不到产物时提示先 `pnpm --filter blog build`。
2. **扫描**：沿用 P1-6 `extract-baseline.mjs` 的同一正则 `/(--anzhiyu-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g`，同时记录每个变量的首次声明值与全部声明值。
3. **严格一致**：产物首次声明值 == baseline 首值（trim 后逐字符）。
4. **顺序差异**：首值不同，但 baseline 首值仍出现在产物后续声明中；若本机存在上游 CSS（`.baseline-work/public/css/index.css`，gitignore），再核对两边声明值集合是否相同。这类差异只 WARN。
5. **失败条件**：值不一致 / 产物缺失变量 → exit 1。

### 5.2 统计

| 分类 | 数量 | 说明 |
|---|---|---|
| 严格一致（首值相同） | **68** | 含 `--anzhiyu-main`、`--anzhiyu-theme` 等全部关键变量 |
| 顺序差异（值集合一致） | **1** | `--anzhiyu-header-translateY` |
| 值不一致（真回归） | **0** | — |
| 产物缺失变量 | **0** | — |
| 产物新增（基准无）变量 | **0** | — |
| 合计 | **69** | 与 baseline 一致 |

### 5.3 唯一差异明细：`--anzhiyu-header-translateY`

| 项 | 值 |
|---|---|
| baseline 首值 | `160px` |
| 产物（dist）首值 | `0` |
| 两边声明次数 | 各 17 次 |
| 两边声明值集合 | `160px×8, 0px×8, 0×1`（完全相同） |
| 上游首次声明位置 | 字节偏移 ~60924，`@-moz-keyframes header { entry 0% { --anzhiyu-header-translateY: 160px; …` |
| 产物首次声明位置 | 字节偏移 ~225512，`@media screen and (min-width: 768px) { #page-header #post-info { --anzhiyu-header-translateY: 0; …` |

结论：两边对 `--anzhiyu-header-translateY` 的 17 次声明值完全一样，只是**同一批规则的拼接顺序不同**——Hexo 把 `#page-header #post-info` 的 media query 规则排在 keyframes 之后，Astro/Vite 把该规则排到了 keyframes 之前。因此 baseline 的「首次出现值」取到了 `160px`（keyframes），产物取到了 `0`（media query）。这是一个只由打包顺序造成的提取口径差异，不是变量值回归：

- 该变量其余声明（`@-moz-keyframes` / `@-webkit-keyframes` / `@-o-keyframes` / `@keyframes` 的 entry/exit 各帧）两边逐值相同；
- 产物的 `@media … { #page-header #post-info { --anzhiyu-header-translateY: 0; … } }` 这条规则在上游 CSS 里也存在，只是位置不同（上游字节偏移 ~296983，值同为 `0`）；
- 同一 media query 规则里只有 `--anzhiyu-header-translateY` 一个 `--anzhiyu-*` 变量，所以 69 个变量里只有它有顺序差异；`--anzhiyu-header-info-scale` / `--anzhiyu-header-cover-scale` 只在 keyframes 里声明（各 16 次），首值两边都取到 keyframes 的 `0.7` / `1`，故严格一致。

### 5.4 关键变量抽查（baseline vs dist）

| 变量 | baseline | dist | 结果 |
|---|---|---|---|
| `--anzhiyu-theme` | `#425aef` | `#425aef` | 一致 |
| `--anzhiyu-main` | `var(--anzhiyu-theme)` | `var(--anzhiyu-theme)` | 一致 |
| `--anzhiyu-fontcolor` | `#363636` | `#363636` | 一致 |
| `--anzhiyu-card-bg` | `#fff` | `#fff` | 一致 |
| `--anzhiyu-theme-op` | `rgba(66,89,239,0.137)` | `rgba(66,89,239,0.137)` | 一致 |
| `--anzhiyu-meta-theme-color` | `#f7f9fe` | `#f7f9fe` | 一致 |
| `--anzhiyu-scrollbar` | `rgba(60,60,67,0.4)` | `rgba(60,60,67,0.4)` | 一致 |
| `--anzhiyu-bar-background` | `var(--anzhiyu-main)` | `var(--anzhiyu-main)` | 一致 |
| `--anzhiyu-meta-theme-post-color` | `#fff` | `#fff` | 一致 |

## 6. 遗留问题

1. **schema 仍有大量 passthrough / unknown，loader 的校验强度分区块不均**。31 个精确定义区块只校验已知子键类型，其余子键透传；`menu` / `social` 等是 `z.unknown()` 完全不校验。直接影响：
   - 子键类型写错（如 `aside.display.archive: "yes"`）**不会**被 loader 拒绝，会原样进入返回配置，错误推迟到组件消费时；
   - 子键名拼错（如把 `main` 写成 `mian`）不会报错，默认值 `main` 仍然生效，用户改动被静默忽略；
   - 顶层未知键同理（顶层 `.passthrough()`），拼错顶层键（`theme_colr`）不会失败，只是多一个无用键。
   后续按块收紧 schema 时，loader 无需改动即可自动变严。
2. **「删掉必填键」不会触发失败——与 PLAN P1-8 / P1-9 验收的字面表述有偏差**。因为 defaults 覆盖全部 133 个顶层键（含全部嵌套子键），深合并后缺失键一律被默认值补齐，所以「用户删掉 `theme_color.main`」的结果是静默回落到默认值，而不是构建失败。本次交付能演示的路径报错场景是「键存在但类型错误」或「显式 `null`」（用例 c）。若 P1-9 第三条验收必须字面成立（缺键即失败），需要额外策略，例如：
   - 合并前先对**用户输入**做一次 required 检查（父区块出现时其必填子键必须存在）；
   - 或对用户输入使用严格/必填版本的 schema，再对合并结果用现有完整 schema 校验。
   这是 schema 层/验收口径的决定，不在本任务写范围内，建议组长拍板。
3. **loader 尚未接入 blog 构建**：P1-8 只交付库层；`examples/blog` 目前由 `vite-plugin-stylus-hexo-config` 直接读 `theme.config.yml`（文件名也不在 loader 的默认候选里）。后续组件消费配置时需要显式 `loadThemeConfig({ configPath: 'theme.config.yml' })` 或把文件改成新名。
4. **没有 tsconfig / tsc 校验**：仓库还没配 `tsc --noEmit`，PLAN P1-8 验收里的「`pnpm tsc --noEmit` 通过、组件里 `theme.comments.use` 有类型补全」无法在本阶段验证。loader 只经 Node 类型剥离实际加载运行（与 `check-schema.mjs` 同一机制），类型推导链路是 `z.infer` → `ThemeConfig`，语法保持可擦除（无 enum / namespace / 参数属性）。
5. **CSS 变量比对未接入 CI**：根 `package.json` 只加了 `compare-vars` 入口，`.github/workflows/ci.yml` 未改（不在写范围）。若要作为回归门禁，需要在 CI 里加 `pnpm build && pnpm compare-vars` 步骤。
6. **`compare-css-vars` 的「顺序差异」判定依赖两件事**：baseline 只存首值（无法单独证明顺序差异）、本机 `.baseline-work` 上游 CSS 可读（被 gitignore，CI 上不存在）。脚本已做降级：CI 上只用「baseline 首值是否仍出现在产物声明中」判定；本机这次用上游 CSS 复核了声明值集合，结论见 §5.3。
7. **并行任务对根 `package.json` / `pnpm-lock.yaml` 也有改动**（playwright devDependency、`examples/blog` 新目录），与本任务无关；本任务只新增了 `compare-vars` 一项，未动其它字段。
8. **`yaml` 目前在包 `devDependencies` 里，而 loader 已让它成为运行期依赖**。包当前是 `private` 且还没有被 blog 依赖，所以不影响现状与本次验证；一旦这个包要被真正消费/发布，需要把 `yaml` 移到 `dependencies` 并同步更新 `pnpm-lock.yaml`（本次按任务要求没有执行 install、也不改依赖分类，避免 lockfile 失配）。

## 7. 判定

- **P1-8 配置加载层：可判定完成。** `loader.ts` 实现「YAML → 深合并 defaults（对象递归、数组整体替换、全程深拷贝）→ zod 安全校验 → 类型化返回」，旧文件名兼容与新名优先、deprecation 落 stderr、错误信息带完整键路径与期望类型均已落盘并被 `check-loader.mjs` 真实覆盖（30/30 通过，exit 0）；三条主用例 a/b/c 与 check-schema 回归全绿。附两条口径说明：PLAN 里的 `pnpm tsc --noEmit` 验收因仓库无 tsconfig 暂未建立；「删掉必填键即失败」在默认值全覆盖的合并策略下不成立，目前能保证的是「类型错误 / 显式 null 时报完整键路径」。
- **P1-9 第二条验收（CSS 变量值与上游一致）：通过。** 69 个 `--anzhiyu-*` 变量中 68 个首值逐字符一致，1 个（`--anzhiyu-header-translateY`）仅首次声明位置不同、两边 17 次声明值集合完全相同（`160px×8, 0px×8, 0×1`），值不一致与缺失均为 0；`var(--anzhiyu-main)` 等 PLAN 点名的关键变量全部严格一致。若验收要求按 baseline 的「首次出现」口径严格 69/69，则该 1 处需等 P1-5 的 CSS 规则顺序与 Hexo 对齐后才会消失，但按「变量取值一致」的验收本义已可判通过。
