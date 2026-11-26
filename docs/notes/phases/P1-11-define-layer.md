# P1-11 · 复刻 Hexo 的 Stylus define 层（D9 修复）

- 状态：**完成**。插件已注入 4 个变量，CSS 收敛到 682990（上游样式子集），三关全绿。
- 基线：上游 1.7.1 / `72439d93936b63da59a4a1195f64de9f952f6cc1`；参考产物 CSS 683218 B（`docs/reference/baseline.json`）。
- 写范围：`packages/vite-plugin-stylus-hexo-config/`、`docs/reference/upstream-delta.md`、`scripts/check-upstream-delta.mjs`、本报告。未改 `examples/blog/**`、`docs/reference/baseline.json`、`PLAN.md`、其它 notes（并行任务产物未触碰）。
- 权威登记：`docs/reference/upstream-delta.md` U3（本报告是执行记录）。

## 0. 结论速览

| 问题 | 结论 |
| --- | --- |
| 4 个变量从哪来？ | 上游主题脚本 `scripts/events/stylus.js` 的 `stylus:renderer` filter 用 `.define()` 注入；值由站点配置 `syntax_highlighter` / `highlight.line_number` / `prismjs.line_number` 推出 |
| 插件怎么复刻？ | `hexoDefineLines()`：从传入 YAML（当前是主题配置，缺站点级键 → 回落 Hexo 7.3.0 `default_config`）算出 4 个值，在展开源码顶部生成 `$name = true/false` 赋值（与 `$cfg_*` 同级） |
| 修复前 → 修复后 | 上游样式子集 `686772 → 682990`（**−3782 B 精确**），gzip `79071 → 78457`；prismjs 规则族清零 |
| 真实构建产物 | `684087 B = 682990（上游样式）+ 1097（ClientRouter，P1.5 起就有）`，相对基线 +0.13% |
| 与 683218 的剩余差 | `−228 B`（−0.033%），可完全归因 U6 的 `@css{}` 逗号换行折叠；构建总产物另加 ClientRouter 的 +1097（非上游样式） |
| 三关 | `verify-css` PASS（+0.13% / −0.45%）、`compare-css-vars` PASS（69/69）、`check-upstream-delta` PASS 29 / SKIP 0 / FAIL 0 |

---

## 1. 必须回答 1：上游 `stylus.js` 的 4 个变量规则

### 1.1 上游源码（`_research/anzhiyu-upstream/scripts/events/stylus.js`，全 24 行）

```js
 7: hexo.extend.filter.register("stylus:renderer", style => {
 8:   const { syntax_highlighter: syntaxHighlighter, highlight, prismjs } = hexo.config;
 9:   let { enable: highlightEnable, line_number: highlightLineNumber } = highlight;
10:   let { enable: prismjsEnable, line_number: prismjsLineNumber } = prismjs;
11:
12:   // for hexo > 7.0
13:   if (syntaxHighlighter) {
14:     highlightEnable = syntaxHighlighter === "highlight.js";
15:     prismjsEnable = syntaxHighlighter === "prismjs";
16:   }
17:
18:   style
19:     .define("$highlight_enable", highlightEnable)
20:     .define("$highlight_line_number", highlightLineNumber)
21:     .define("$prismjs_enable", prismjsEnable)
22:     .define("$prismjs_line_number", prismjsLineNumber);
23:   // .import(`${this.source_dir.replace(/\\/g, '/')}_data/css/*`)
24: });
```

逻辑就三步：**解构 →（有 `syntax_highlighter` 时）互斥推导两个 enable → `.define()` 四个变量**。没有其它归一化/取反。

### 1.2 逐变量规则

| 变量 | 取值规则（行号） | 依赖配置键 | 值类型 | 基线值 |
| --- | --- | --- | --- | --- |
| `$highlight_enable` | `:13-15` 有 `syntax_highlighter` 时 = `syntax_highlighter === 'highlight.js'`；否则（`:9`）= `highlight.enable` | 站点级 `syntax_highlighter`（string）/ `highlight.enable`（boolean，Hexo ≤6 旧键） | boolean | **true** |
| `$highlight_line_number` | `:9` 原值直取，不参与互斥推导 | `highlight.line_number`（boolean） | boolean | **true** |
| `$prismjs_enable` | `:13-15` 有 `syntax_highlighter` 时 = `syntax_highlighter === 'prismjs'`；否则（`:10`）= `prismjs.enable` | 站点级 `syntax_highlighter` / `prismjs.enable`（Hexo ≤6 旧键） | boolean | **false** |
| `$prismjs_line_number` | `:10` 原值直取，不参与互斥推导 | `prismjs.line_number`（boolean） | boolean | **true** |

**关键点 1：两个 enable 是互斥的。** `syntax_highlighter: 'prismjs'` 时 `$highlight_enable=false` / `$prismjs_enable=true`，不存在同时为真的分支。`line_number` 则各自独立。

**关键点 2：`hexo.config` 是「站点 `_config.yml` 深合并默认值」后的结果，不是用户 YAML 原样。** 依据 `.baseline-work/node_modules/hexo/dist/hexo/default_config.js:42-61`（Hexo 7.3.0）：

```js
syntax_highlighter: 'highlight.js',
highlight: {
  auto_detect: false,
  line_number: true,
  ...
},
prismjs: {
  preprocess: true,
  line_number: true,
  ...
}
```

也就是说：**用户在站点配置里不写这几个键时，上游拿到的是默认值**（`highlight.js` + 两个 `line_number: true`），而不是 undefined。Hexo 7 默认配置里没有 `highlight.enable` / `prismjs.enable`（那是 Hexo ≤6 的开关），所以 `if (syntaxHighlighter)` 分支才是常态；fallback 分支只在有人把 `syntax_highlighter` 显式设成空/false 时才走。

**关键点 3：值经 Stylus `.define()` → `utils.coerce`。** `renderer.js:204-216` 对值做 `utils.coerce`；`utils.js:302-318` 里 boolean → `nodes.Boolean`、number → `nodes.Unit`、string → `nodes.String`、null/undefined → `nodes.null`、object/array → 恒真表达式。因此 boolean 变量在源码层写 `$name = true/false` 与 `.define()` **完全等价**；缺失值（`nodes.null`）在 `if`/`&&`/`!` 语境为假，写成 `false` 等价。

**关键点 4：这就是 D9 的杀伤点。** 四个变量在上游 72 个 `.styl` 里**零赋值**，只被 `_highlight/highlight.styl`（`:2`/`:3`/`:26`/`:29`）与 `_highlight/theme.styl`（4 处 `if $highlight_enable`）消费。插件漏掉 define 层时它们未定义，而 Stylus 0.64 对 `if $undefined` 判**真** → `if $prismjs_enable` 分支被错误包含。

---

## 2. 必须回答 2：插件怎么实现注入

文件：`packages/vite-plugin-stylus-hexo-config/src/index.mjs`（`enforce: 'pre'` 的 `transform` 钩子）。

### 2.1 新增常量：Hexo 7.3.0 站点级默认值

```js
// Hexo 7.3.0 的站点级默认值（hexo/dist/hexo/default_config.js）。上游主题脚本
// scripts/events/stylus.js 读的是 `hexo.config`，而 hexo.config 是站点 _config.yml
// 深合并这份默认值之后的完整配置，所以「配置里没写」不等于「值不存在」。
const HEXO_SITE_DEFAULT = {
  syntax_highlighter: 'highlight.js',
  highlight: { line_number: true },
  prismjs: { line_number: true },
}
```

### 2.2 新增 `hexoDefineLines()`：照抄上游推导

```js
function hexoDefineLines(config) {
  const site = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const syntaxHighlighter =
    lookupRaw(site, 'syntax_highlighter') ?? HEXO_SITE_DEFAULT.syntax_highlighter
  const highlight = siteSection(site, 'highlight', HEXO_SITE_DEFAULT.highlight)
  const prismjs = siteSection(site, 'prismjs', HEXO_SITE_DEFAULT.prismjs)

  let highlightEnable = highlight.enable
  let highlightLineNumber = highlight.line_number
  let prismjsEnable = prismjs.enable
  let prismjsLineNumber = prismjs.line_number

  if (syntaxHighlighter) {                                  // ← 上游 :13
    highlightEnable = syntaxHighlighter === 'highlight.js'  // ← 上游 :14
    prismjsEnable = syntaxHighlighter === 'prismjs'         // ← 上游 :15
  }

  return [
    `$highlight_enable = ${defineLiteral(highlightEnable)}`,
    `$highlight_line_number = ${defineLiteral(highlightLineNumber)}`,
    `$prismjs_enable = ${defineLiteral(prismjsEnable)}`,
    `$prismjs_line_number = ${defineLiteral(prismjsLineNumber)}`,
  ]
}
```

`siteSection()` 做「配置区块是对象就与默认值浅合并」，`lookupRaw()` 用「缺失 → undefined」语义（区别于 `getProperty()` 的「缺失 → `''`」）。`defineLiteral()` 对应 `utils.coerce`：boolean/number/string 原样，null/undefined → `false`（条件语境等价）。

**配置来源**：目前 `examples/blog/astro.config.mjs` 传的是 `theme.config.yml`（主题配置，没有站点级键）→ `syntax_highlighter` 回落 `'highlight.js'`，两个 `line_number` 回落 `true` → 得到基线四个值 `true / true / false / true`。未来 Phase 2 站点配置层把站点 YAML 的 `syntax_highlighter` / `highlight` / `prismjs` 传进同一个 config 对象即可，插件优先用配置值。

### 2.3 `transform()`：放在展开源码顶部、且不再早退

```js
      // 注意：不能像以前那样「没有 hexo-config()/import 就早退」——上游的
      // stylus:renderer filter 对每次样式渲染都会注入 4 个 define 变量，
      // 与源文件内容无关。
      ...
      // Hexo define 层与 hexo-config 变量同级：都放在展开源码顶部
      const defineLines = hexoDefineLines(loadConfig())
      const { prelude, body: rewritten, count } = rewriteConfigCalls(body)
      const preludeParts = [defineLines.join('\n')]
      if (prelude) preludeParts.push(prelude)
      const out = `${preludeParts.join('\n')}\n${rewritten}`
```

展开后的源码头部实测：

```text
$highlight_enable = true
$highlight_line_number = true
$prismjs_enable = false
$prismjs_line_number = true
$cfg_css_prefix = true
$cfg_theme_color = true
...
```

插件 debug 日志同时打印推导结果（`pnpm --filter blog build` 原始日志）：

```text
[stylus-hexo-config] index.styl: 102 个配置键, 展开 150 个文件
[stylus-hexo-config] index.styl: Hexo define → highlight_enable=true highlight_line_number=true prismjs_enable=false prismjs_line_number=true
```

### 2.4 推导规则自测（覆盖上游三条分支）

用同一插件对 5 组配置做单元级探针（只看注入的 4 行）：

```text
defaults            -> $highlight_enable = true  | $highlight_line_number = true  | $prismjs_enable = false | $prismjs_line_number = true
syntax=prismjs      -> $highlight_enable = false | $highlight_line_number = true  | $prismjs_enable = true  | $prismjs_line_number = true
syntax=highlight.js -> $highlight_enable = true  | $highlight_line_number = true  | $prismjs_enable = false | $prismjs_line_number = true
hexo6 fallback      -> $highlight_enable = true  | $highlight_line_number = false | $prismjs_enable = true  | $prismjs_line_number = false
line_number=false   -> $highlight_enable = true  | $highlight_line_number = false | $prismjs_enable = false | $prismjs_line_number = false
```

对应上游语义：`syntax_highlighter` 非空时两个 enable 互斥、`line_number` 独立；为空时退回 `highlight.enable` / `prismjs.enable`（Hexo ≤6 形态），与上游 `if (syntaxHighlighter)` 完全一致。

---

## 3. 必须回答 3：修复前/后数据 + verify / compare-vars 原始输出

### 3.1 测量口径（为什么是「展开源码直接渲染」）

`pnpm --filter blog build` 的产物从 P1.5 垂直切片起就混入了 **ClientRouter 自带的 1097 B 样式**（`astro-route-announcer` / `@keyframes astroFadeOut` 等），所以构建总字节不能直接和「上游样式 683218」比。本报告用两个口径：

1. **上游样式子集**：插件 `transform()` 展开 `examples/blog/src/styles/upstream/index.styl` → `stylus.render()`（与 P1-5 同一方法）。修复前对照 = 从展开源码里去掉那 4 行 define（与修复前管线等价，P-upstream-delta §2.2 ④ 已验证该口径与真实 dist 逐字节一致）。
2. **真实构建产物**：`pnpm --filter blog build` → 从 `/*! normalize.css` 处切开，前缀 = ClientRouter 1097 B，剩余 = 上游样式子集，可直接对 SHA。

### 3.2 修复前后渲染数据（同机同 stylus 0.64.0）

```text
{"label":"BEFORE(无 define 层)","bytes":686772,"gzip":79071,"sha":"1319c726c715d66ed3c7e44f400e94d84d2268a245fa0d95631c1d6001155b07","braceOpen":4157,"semi":17598,"lines":27305,"tokenOccurrences":36,"languageOccurrences":49,"prismOccurrences":0}
{"label":"AFTER(有 define 层)","bytes":682990,"gzip":78457,"sha":"429ff06f63bbfd6852917608d3737c8654d4bfe88571ea4ef2530270c1439175","braceOpen":4125,"semi":17537,"lines":27164,"tokenOccurrences":0,"languageOccurrences":0,"prismOccurrences":0}
DELTA bytes: -3782
```

| 指标 | 修复前 | 修复后 | 差 | 上游基准 |
| --- | --- | --- | --- | --- |
| 字节 | 686772 | **682990** | **−3782** | 683218 |
| gzip(level 9) | 79071 | 78457 | −614 | 79124 |
| SHA-256 | `1319c726…`（与 P1-5 记录一致） | `429ff06f…` | — | `7c1b1ec0…` |
| `{`（规则块） | 4157 | **4125** | −32 | 4125 |
| `;`（声明） | 17598 | **17537** | −61 | 17537 |
| 物理行 | 27305 | 27164 | −141 | 27396 |

修复前的 686772 / `1319c726…` 与 P1-5 产物记录逐字节一致，证明对照口径就是旧管线；修复后只剩 U6 的排版差（见 §4）。

### 3.3 真实构建产物：684087 = 682990 + 1097

```text
=== dist css ===
684087 bytes  sha256=aba3d19240053ee3c28d9f8d71df6952fc1252214e02fff31e9dba24cc3028af  BaseLayout.By-987Uf.css

=== split ===
TOTAL_BYTES: 684087
CLIENTROUTER_PREFIX_BYTES: 1097 PREFIX_SHA: 5291969c0b641465258c55bb70d05ce34f1dfe6db4d5094cef4ca0185378f168
UPSTREAM_SUBSET_BYTES: 682990 SUBSET_SHA: 429ff06f63bbfd6852917608d3737c8654d4bfe88571ea4ef2530270c1439175
SUBSET_BRACES: 4125
SUBSET_SEMI: 17537
SUBSET_LINES: 27164
PRISM_COUNT: 0 TOKEN_COUNT: 0 LANGUAGE_COUNT: 0
```

切出的子集 SHA `429ff06f…` 与 §3.2 直接渲染**完全一致**，即：真实构建产物里的上游样式就是 682990，没有中间层再改字节。修复前对应 `687869 = 686772 + 1097`（P1.5 报告已记录 687869 与 +1097 的来源），差 3782。

### 3.4 prismjs 规则数

- 顶层规则块：4157 → **4125**（−32 个规则块，全部来自 `_highlight/prismjs/{index,line-number,diff}.styl`；与 P1-5 §6.1 的 `{` 计数 +32 一致）。
- 选择器级复算（P1-5 §6.2 同口径，对比 `.baseline-work/public/css/index.css`）：两边顶层选择器数均 **3223**；「Astro 侧独有」从 **34 条 → 2 条**，且这 2 条是同一选择器在 `@css{}` 里被空白折叠后的形态差异（U6 机制，上游侧同样出现 2 条对称差异），与 prismjs 无关。
- 文本特征：`.token` 出现 **36 → 0**、`language-` 出现 **49 → 0**、`prism`（不区分大小写）**0 → 0**；真实构建产物同样全 0。

### 3.5 `node scripts/verify-css.mjs` 原始输出

```text
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\BaseLayout.By-987Uf.css
[verify-css] PASS 字节数: 实际 684087 / baseline 683218（+0.13%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78768 / baseline 79124（-0.45%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）：实际 aba3d19240053ee3c28d9f8d71df6952fc1252214e02fff31e9dba24cc3028af / baseline 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
[verify-css] 比对通过
```

注：684087 = 682990（上游样式）+ 1097（ClientRouter），所以 verify 的 +0.13% 里 1097 B 不是样式回归。

### 3.6 `node scripts/compare-css-vars.mjs` 原始输出

```text
[compare-css-vars] baseline: docs\baseline.json（commit 72439d93，version 1.7.1）
[compare-css-vars] baseline cssVars: 69 个 --anzhiyu-* 变量
[compare-css-vars] CSS 源: examples\blog\dist\_astro\BaseLayout.By-987Uf.css
[compare-css-vars] 产物 CSS 中 --anzhiyu-* 变量: 69 个
[compare-css-vars] 上游 CSS: .baseline-work\public\css\index.css（用于声明值集合复核）
[compare-css-vars] WARN --anzhiyu-header-translateY: 基准首值 "160px" / 产物首值 "0" → 声明顺序不同（基准值仍在产物中）
[compare-css-vars]      产物声明序列（共 17 次）: 0×1, 160px×8, 0px×8
[compare-css-vars]      声明值集合与上游一致，仅出现顺序不同
[compare-css-vars] 结果: 严格一致 68 / 顺序差异 1 / 值不一致 0 / 产物缺失 0（基准共 69）
[compare-css-vars] 比对通过（1 处为声明顺序差异，取值集合一致）
```

`--anzhiyu-header-translateY` 的顺序差异是历史既有（修复前输出完全相同），与本次改动无关；69/69 变量值集合一致。

---

## 4. 必须回答 4：与基线 683218 的剩余差异与归因

### 4.1 两个数字分开看

| 口径 | 字节 | 对基线 | 构成 |
| --- | --- | --- | --- |
| 上游样式子集（P1-5 口径 / dist 切相） | **682990** | **−228 B（−0.033%）**，SHA 不同 | 682990 = 683218 − 228（U6） |
| 真实构建产物（含 ClientRouter） | 684087 | +869 B（+0.13%） | 682990 + 1097（ClientRouter） |

### 4.2 −228 B 的归因（U6，不是本轮引入）

1. **结构计数已与上游完全对齐**：修复后 `{` = 4125、`;` = 17537，与上游基准 P1-5 §6.1 记录的 4125 / 17537 逐项相等；prismjs 族清零。也就是说「规则/声明集合」层面已经没有差异。
2. **只差物理行/空白**：物理行 27164 vs 基线 27396 = **−232 行**，与 −228 B 同量级。这正是 U6 描述的机制——插件把纯 CSS `@import` 包成 Stylus `@css{…}` 字面量后，Stylus 词法器（`lexer.js:76-80`）把字面量里的「逗号 + 换行」折叠成 `,\r`；Hexo 的 literal import 路径不经过这条重写。`@css{}` 内容 = 47 个纯 CSS 文件（约 168 KB），其中逗号换行的行被折叠就产生这个差。
3. **可复算**：修复前 686772 = 683218 + 3782（prismjs）− 228（U6）；修复后 682990 = 683218 − 228。−228 在两次测量中恒定，说明它就是 U6、且没有被本次改动掩盖或放大。
4. **决策不变**：U6 登记为「不改」（Phase 7 若换 literal 承载方式再议）；验收用 ±5% + 字节闭环，不追求 SHA 逐字节相等。

结论：**−228 B 可完全归因，是当前唯一剩余的机制性差异；+1097 B 是 ClientRouter 的固有增量，不是上游样式偏差。**

---

## 5. 必须回答 5：`check-upstream-delta` 原始输出（退出码 0）

```text
[check-upstream-delta] PASS 登记表锚点字段完整
[check-upstream-delta] PASS readmode.styl:104 保持正确写法 var(--highlight-bg)
[check-upstream-delta] PASS readmode.styl:120 保持上游笔误 var(-highlight-bg)（我们决策：不改）
[check-upstream-delta] PASS baseline.json commit 与登记表一致（72439d93）
[check-upstream-delta] PASS baseline.json version 与登记表一致（1.7.1）
[check-upstream-delta] PASS baseline.json css.indexCssBytes 与登记表一致（683218）
[check-upstream-delta] PASS baseline.json css.indexCssGzipBytes 与登记表一致（79124）
[check-upstream-delta] PASS baseline.json css.indexCssSha256 与登记表一致（7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61）
[check-upstream-delta] PASS P1-11 字节闭环：683218 + (-228) = 682990
[check-upstream-delta] PASS docs/notes/topics/P-upstream-delta.md 记录 baseline.css.indexCssBytes 与登记表一致（683218）
[check-upstream-delta] PASS docs/notes/topics/P-upstream-delta.md 记录 baseline.css.indexCssGzipBytes 与登记表一致（79124）
[check-upstream-delta] PASS docs/notes/topics/P-upstream-delta.md 记录 baseline.css.indexCssSha256 与登记表一致（7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61）
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/index.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/var.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/highlight.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/theme.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/index.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/line-number.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/diff.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_mode/readmode.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/theme.config.yml
[check-upstream-delta] PASS 上游 72 个 styl 里 $highlight_enable / $highlight_line_number / $prismjs_enable / $prismjs_line_number 仍然零赋值（它们由 Hexo 模板脚本的 .define() 注入，插件侧的复刻见 4c 守卫）
[check-upstream-delta] PASS _highlight/highlight.styl 仍有 if $prismjs_enable 守卫（D9 现场保留）
[check-upstream-delta] PASS 插件展开上游 index.styl 后注入了 4 个 define 变量（$highlight_enable=true / $highlight_line_number=true / $prismjs_enable=false / $prismjs_line_number=true），D9 的 prismjs 分支已被关闭
[check-upstream-delta] PASS theme.config.yml 顶层键 = 133（登记表 133）
[check-upstream-delta] PASS theme.config.yml 递归 mapping key = 662（登记表 662）
[check-upstream-delta] PASS 上游注释掉的 3 个配置键仍然不存在（缺失 → falsy → 上游 fallback 默认值）
[check-upstream-delta] PASS 对象型配置键保持对象：theme_color, hr_icon（hexo-config 返回 JS 对象 → 布尔语境恒真）
[check-upstream-delta] PASS baseline 工作区 hexo 钉死 7.3.0（声明 + CLI 块 + 实际安装）

[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/reference/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
```

**项数说明**：修复前脚本是 **28 项全 PASS**；本次 (a) 2b 字节闭环换口径（仍是 1 项）→ 无损，(b) 新增 4c「插件必须注入 4 个变量」守卫 +1 项，所以现在是 **29 项**。原 28 项逐条保持 PASS，无回归。

本次脚本/锚点变更：

1. `docs/reference/upstream-delta.md` §5 锚点：
   - 删除旧口径字段 `p15CompiledIndexCssBytes: 686772` / `p15PrismjsDeltaBytes: 3782` / `p15PrismjsExtraRuleBlocks: 32`；
   - 新增 `p111CompiledIndexCssBytes: 682990`、`p111CompiledIndexCssGzipBytes: 78457`、`p111CompiledIndexCssSha256: 429ff06f…`；
   - `p15ResidualFormatDeltaBytes` 更名 `residualFormatDeltaBytes: -228`（U6，仍有效）；
   - 新增 `hexoInjectedStylusVarValues`（4 个变量的期望值，是 4c 守卫的数据源）。
2. `scripts/check-upstream-delta.mjs`：
   - `REQUIRED_ANCHOR_FIELDS` 同步；
   - 2b 闭环改为 `baseline + residual = p111Compiled`（683218 − 228 = 682990）；
   - 新增 4c 组：动态 `import()` 插件（`pathToFileURL`，只读、不构建），用 `theme.config.yml` 展开上游 `index.styl`，断言展开源码里有 `$highlight_enable = true` / `$highlight_line_number = true` / `$prismjs_enable = false` / `$prismjs_line_number = true` 四行。插件 import 失败（如缺 `yaml`）时降级 SKIP（与 4b 同策略），但 transform 抛错/值不符一律 FAIL。

---

## 6. 改动清单

| 文件 | 改动 |
| --- | --- |
| `packages/vite-plugin-stylus-hexo-config/src/index.mjs` | 新增 `HEXO_SITE_DEFAULT` / `lookupRaw()` / `siteSection()` / `defineLiteral()` / `hexoDefineLines()`；`transform()` 顶部注入 define 层、取消「无 hexo-config/import 早退」、debug 日志增打 4 个值 |
| `packages/vite-plugin-stylus-hexo-config/README.md` | 「它做了什么」增第 4 条（define 层 + 互斥规则 + 默认回落）；限制条目同步 |
| `docs/reference/upstream-delta.md` | U3 标题/决策/修复规则/修复前后数据；§1 总表 U3 行；§3.2 标注历史；§3.3 补修复后行与 dist 切相；§4 第 1/8 条；§5 锚点；§6 检查组（2b/2c/4c） |
| `scripts/check-upstream-delta.mjs` | 文档头、锚点字段、2b 闭环、4c 守卫、4 组提示文案 |
| `docs/notes/phases/P1-11-define-layer.md` | 本报告（新增） |

未改：`examples/blog/**`（含 `astro.config.mjs`、`theme.config.yml`、上游镜像）、`docs/reference/baseline.json`、`PLAN.md`、其它 notes/脚本。构建产物 `examples/blog/dist/**` 是被 gitignore 的生成物。

---

## 7. 遗留与风险

1. **站点级配置尚未真正接入**：当前插件拿到的 YAML 是主题 `theme.config.yml`，靠 Hexo 7.3.0 默认值恰好命中基线。Phase 2 站点配置层必须把 `syntax_highlighter` / `highlight` / `prismjs` 传进插件；若站点改用 `prismjs`，CSS 会变成 highlight 分支关闭、prismjs 分支打开——这是**上游语义**，不是回归。
2. **互斥语义别写坏**：两个 `enable` 是由 `syntax_highlighter` 单值推导的互斥值，不能当成两个独立开关（例如同时读 `highlight.enable`/`prismjs.enable` 可能得到 `true/true`）。
3. **4c 守卫的运行依赖**：需要插件可 `import`（`yaml` 已装）；CI 在 `pnpm install` 之后跑没问题，本地缺依赖时 SKIP 而非误红（与 4b 一致）。
4. **历史报告保留旧结论**：`docs/notes/topics/P-upstream-delta.md` 是 P1-11 之前的历史报告（含「延后 Phase 2」的决策与 686772 闭环），不改写；权威以 `docs/reference/upstream-delta.md` 为准。脚本对它的 3 项校验只针对不随修复变化的 baseline 数字。
5. **PLAN.md 的 P1-11 状态仍是 ⬜**（不在本次写范围）；建议组长同步为 ✅ 并写验收数据 682990 / 684087。
6. **P1.5 的 1097 B ClientRouter 增量**：若未来移除 ClientRouter，构建产物会回到 682990；字节闭环锚点用的是「上游样式子集」而不是构建总字节，因此不会因此变红。

---

## 8. 一句话结论

**CSS 已收敛到 682990**（上游样式子集精确值，dist 切相 SHA `429ff06f…` 与直接渲染一致；真实构建 684087 = 682990 + 1097 ClientRouter），prismjs 规则族清零；`verify-css` PASS（+0.13% / −0.45%）、`compare-css-vars` PASS（69/69）、`check-upstream-delta` PASS 29 / SKIP 0 / FAIL 0 —— **三关全绿**。
