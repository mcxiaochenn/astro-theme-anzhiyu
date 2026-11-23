# P-upstream-delta · 上游差异登记与 D9 定位

- 状态：**完成**。两份文档 + 一个校验脚本已落盘并在本地跑通（脚本 PASS 28 / SKIP 0 / FAIL 0）；本轮未提交，等组长统一提交。
- 产出：
  - `docs/upstream-delta.md`（上游差异与缺陷登记表，含机器可读锚点）
  - `scripts/check-upstream-delta.mjs`（只读 CI 校验）
  - 根 `package.json` 新增 `check:upstream-delta`（只加条目，未改其他 script）
  - 本报告
- 写范围：只碰上述 4 个文件。`git status` 里其他改动（`docs/notes/P1-8-loader.md`、`examples/blog/src/layouts/`、`packages/astro-theme-anzhiyu/*`、`scripts/compare-css-vars.mjs` 等）是并行任务产物，未触碰。
- 基线：上游 1.7.1 / `72439d93936b63da59a4a1195f64de9f952f6cc1`；参考产物 CSS 683218 B（`docs/baseline.json`）。

---

## 0. 结论速览

| 问题 | 结论 |
| --- | --- |
| D9 是否定位？ | **是**。不是插件注入、不是 Vite 配置、也不是上游 styl 里藏着赋值：上游用主题脚本 `scripts/events/stylus.js` 的 `stylus:renderer` filter 以 `.define()` 注入四个变量，我们的插件没有复刻这一层；Stylus 对未定义变量在 `if` 里当**真**，于是 `if $prismjs_enable` 分支被包含 |
| 多出了多少？ | **+3782 字节 / +32 个规则块**，全部是 `_highlight/prismjs/*`；相对基线净 +3554 B（+0.52%），因为同产物里还有 −228 B 的排版差 |
| 补上 `$prismjs_enable=false` 会怎样？ | 产物 686772 → **682990 B**（相对基线 −228 B / −0.033%），prismjs 规则消失。这是 Phase 2 关闭 D9 的验收判据 |
| 上游差异清单可以冻结吗？ | **可以**。8 项（U1–U8）都有位置/原文/影响/决策/验证，其中 6 项由 CI 脚本机械守卫；剩余 2 项（U8 脚注、U4 换版本行为）属 Phase 2 口径约定，文档已写死 |
| CI 新增了什么保护？ | `check:upstream-delta`：readmode 笔误只读守卫、baseline.json ↔ 登记表一致性、9 个上游文件 SHA、上游注入变量零赋值前提、133/662 键与缺失键语义、本地 hexo 7.3.0 钉死 |

---

## 1. 必须回答 1：上游差异登记表（≥6 项）

完整版含原文引用与验证命令，见 [docs/upstream-delta.md](../upstream-delta.md) §2；这里给可直接核对的摘要。8 项全部有「位置 / 原文 / 影响 / 决策 / 验证」五项。

| ID | 位置（文件:行） | 原文 | 影响 | 决策 | 验证 |
| --- | --- | --- | --- | --- | --- |
| U1 | `source/css/_mode/readmode.styl:120` | `background: var(-highlight-bg) !important`（104 行是正确的 `var(--highlight-bg)`） | 非法自定义属性：浏览器静默丢弃（上游实际不生效）；lightningcss 严格解析构建失败 | **不改**（保真；修了会改变视觉并打乱基准） | 脚本行级守卫 + 文件 SHA + `cssMinify:false` |
| U2 | `_config.yml` 全文 | 不是文档里写的「约 200 键」，实际 **133 顶层 / 662 递归 mapping key** | P1-7 schema 工作量与 passthrough 规模被低估 | 以实测为准；01/02/03 旧估算不回改，PLAN §1.4 D8 已纠正 | 脚本 YAML 计数 + `theme.config.yml` SHA（41845 B / `bd0bd629…`） |
| U3（**D9**） | `source/css/_highlight/highlight.styl:29`（守卫）、`:3`（wordWrapPrismjs）；根因 `scripts/events/stylus.js`（上游模板脚本） | `if $prismjs_enable` + `@require 'prismjs/index'`；变量由 `.define("$prismjs_enable", prismjsEnable)` 注入 | 我们没复刻 define 层 → 变量未定义 → Stylus 在 `if` 里当**真** → 多出 prismjs 分支 +3782 B | **延后 Phase 2**：配置适配层按上游 filter 逻辑注入 4 个变量（默认 `highlight.js` → `$prismjs_enable=false`） | 最小复现 + 展开源码 grep + 字节闭环（§2） |
| U4 | `.baseline-work/package.json` | `"hexo": { "version": "7.3.0" }` + `dependencies.hexo: "7.3.0"`；hexo-renderer-stylus 3.0.1 / nib 1.2.0；上游侧 stylus 0.62.0，我们侧 0.64.0 | 换 Hexo 版本会改 `syntax_highlighter` 分支取值 → 改四个 stylus 变量 → 改 CSS | **钉死 7.3.0**，迁移期不追上游/不换 Hexo | 脚本本地校验声明+CLI 块+实际安装（CI SKIP） |
| U5 | `_config.yml:618 / :626 / :627`（注释键）、`:613`（`theme_color`）、`:755`（`hr_icon`） | 3 个子键被 `#` 注释：`button_hover`、`blockquote_padding_color`、`blockquote_background_color`；`theme_color` / `hr_icon` 是对象 | 缺键 → `getProperty` 返回 `''` → falsy → 走 fallback 默认色；补键会改色值分支。对象在布尔语境恒真 | **不补键、不改上游**；对象沿用插件 `true` 降级（已核对 7 处对象取值全在布尔语境） | 脚本：键不存在 + 对象类型 + SHA |
| U6 | 插件 `cssLiteralBlock()` + Stylus `lexer.js:76-80 / 340-367` | `@css{…}` 里「逗号+换行」被词法器重写成 `,\r`（Hexo 的 literal import 不走这条路径） | 即使关掉 prismjs，产物仍差 −228 B（−0.033%）且 SHA 不同，无法逐字节对齐 | **不改**；验收用 ±5% + 字节闭环，Phase 7 再议是否换 literal 承载方式 | 最小复现 + §3 字节闭环 |
| U7 | 上游全部 `.styl` / `_config.yml` | 上游文件是 **CRLF**（如 `index.styl` 24 个、`var.styl` 185 个、`readmode.styl` 197 个、`_config.yml` 1342 个） | 镜像做格式化/换行归一化会改 SHA、破坏与 1.7.1 的逐字节对应 | **保持 CRLF**，禁止格式化 | 9 个关键文件 SHA-256 |
| U8 | `hexo-renderer-marked 7.0.1`（上游渲染链） | 上游 `hexo g` 不渲染 GFM 脚注：`[^note1]` 与 `[^note1]: …` 都按普通段落输出 | PLAN P2-1「脚注渲染」与「上游 HTML diff」口径冲突 | 不改上游；Astro 侧按 GFM 启用，HTML diff 列白名单 | P1-6 报告 §7 #3；Phase 2 diff 核对 |

> U1/U2 的旧编号对应 PLAN §1.4 的 D7/D8；U3 对应 D9。**本表是这些条目的权威版本**，PLAN 里 D9 的「未定位 / 未定义当假」措辞已被本报告推翻（见 §5 文档债）。

---

## 2. 必须回答 2：D9 定位结论（prismjs 规则是谁注入的）

### 2.1 一句话结论

`prismjs` 规则**不是任何人"注入"进 styl 的**：上游把 4 个开关变量放在 Hexo 主题脚本里，用 `stylus:renderer` filter 的 `.define()` 注入编译现场；我们的 Vite 插件只复刻了 `hexo-config()` 与 import 展开，没有复刻 define 层。变量既然未定义，Stylus 的 `if` 语义（未定义变量为**真**）就把 `$prismjs_enable` 分支放进了产物。

三选一：

- ❌ 不是我们插件注入了变量——插件源码零处提及 `prismjs`，`hexo-config('prismjs...')` 这类调用在上游 styl 里也不存在；
- ❌ 不是 Vite-stylus 配置问题——`astro.config.mjs` / `preprocessorOptions` 里没有任何相关定义（而且 P1-5 已实测 Vite 8 下这些 options 到不了编译现场）；
- ✅ 是**管线缺口 + Stylus 语义**：上游 `scripts/events/stylus.js` 的 `.define()` 层没被复刻。

### 2.2 定位链路（每一步都可复现）

**① 上游变量来自模板脚本，不来自 styl 源码**（`_research/anzhiyu-upstream/scripts/events/stylus.js`）：

```js
hexo.extend.filter.register("stylus:renderer", style => {
  const { syntax_highlighter: syntaxHighlighter, highlight, prismjs } = hexo.config;
  let { enable: highlightEnable, line_number: highlightLineNumber } = highlight;
  let { enable: prismjsEnable, line_number: prismjsLineNumber } = prismjs;

  // for hexo > 7.0
  if (syntaxHighlighter) {
    highlightEnable = syntaxHighlighter === "highlight.js";
    prismjsEnable = syntaxHighlighter === "prismjs";
  }

  style
    .define("$highlight_enable", highlightEnable)
    .define("$highlight_line_number", highlightLineNumber)
    .define("$prismjs_enable", prismjsEnable)
    .define("$prismjs_line_number", prismjsLineNumber);
});
```

基线站点配置（`.baseline-work/_config.yml`）：`syntax_highlighter: highlight.js` → 实际注入 `$highlight_enable=true`、`$highlight_line_number=true`、`$prismjs_enable=**false**`、`$prismjs_line_number=true`。

上游 72 个 styl 里 grep `$prismjs_enable =` **零命中**（`_research/anzhiyu-upstream` 全树也只命中 `:3` / `:29` 两处引用），说明变量只能来自 `.define()`。

**② 最小复现：未定义变量在 `if` 里是真是假**（用 `examples/blog` 的 `stylus@0.64.0`；用例先落盘再跑，避免 shell 把 `$var` 展开——这是这类小实验最常见的失真方式）：

```js
import { createRequire } from 'node:module'
const require = createRequire('D:/Git-project/astro-theme-anzhiyu/examples/blog/package.json')
const stylus = require('stylus')

const cases = {
  A_undefined_in_if: 'if $foo_undefined\n  .yes\n    color: red\nelse\n  .no\n    color: blue\n',
  B_false_in_if: '$foo = false\nif $foo\n  .yes\n    color: red\nelse\n  .no\n    color: blue\n',
  D_undefined_in_and: '$bar = $foo_undefined && !$baz_undefined && true\n.x\n  y: $bar\n',
  E_prismjs_guard_undefined: 'if $prismjs_enable\n  .prism-rule\n    color: red\n.tail\n  color: green\n',
  F_prismjs_guard_false: '$prismjs_enable = false\nif $prismjs_enable\n  .prism-rule\n    color: red\n.tail\n  color: green\n',
}
for (const [name, src] of Object.entries(cases)) {
  try { console.log(`[${name}] OK -> ${JSON.stringify(stylus.render(src, {}))}`) }
  catch (e) { console.log(`[${name}] ERROR -> ${e.message.split('\n')[0]}`) }
}
```

原始输出：

```text
[A_undefined_in_if] OK -> ".yes {\n  color: #f00;\n}\n"
[B_false_in_if] OK -> ".no {\n  color: #00f;\n}\n"
[D_undefined_in_and] OK -> ".x {\n  y: false;\n}\n"
[E_prismjs_guard_undefined] OK -> ".prism-rule {\n  color: #f00;\n}\n.tail {\n  color: #008000;\n}\n"
[F_prismjs_guard_false] OK -> ".tail {\n  color: #008000;\n}\n"
```

→ **未定义变量在 `if` 里为真、不报错**；在 `&&` 二元运算里当假。P1-5 §6.4 记的「未定义当假」不成立，本轮以可复现输出为准（上轮用例没留证，不做猜测）。

按任务要求再把 D9 的守卫单独落成物理 `.styl` 文件编译一遍：

```text
// prismjs-guard-undefined.styl
if $prismjs_enable
  .prism-rule
    color: red
.tail
  color: green

// prismjs-guard-false.styl
$prismjs_enable = false
if $prismjs_enable
  .prism-rule
    color: red
.tail
  color: green
```

原始输出：

```text
prismjs-guard-undefined.styl -> ".prism-rule {\n  color: #f00;\n}\n.tail {\n  color: #008000;\n}\n"
prismjs-guard-false.styl     -> ".tail {\n  color: #008000;\n}\n"
```

**③ 用真实插件展开上游入口，确认变量没被意外赋值**（`transform()` 后落盘再 grep）：

```text
[stylus-hexo-config] index.styl: 102 个配置键, 展开 150 个文件
expanded bytes: 507855 lines: 21844
--- 展开后全文 grep "prismjs_enable =" ---
(零命中：展开后仍无任何赋值)
--- 展开后 prismjs_enable 的全部出现行 ---
2468: wordWrapPrismjs = $prismjs_enable && !$prismjs_line_number && ($cfg_code_word_wrap)
2738: if $prismjs_enable
```

插件没有、也不可能替它赋值：`hexo-config()` 只覆盖配置键（102 个 `$cfg_*`），`$prismjs_enable` 不是配置键。

**④ 字节闭环**（同一份展开源码，`stylus.render`，对照 Hexo 真实产物 `.baseline-work/public/css/index.css`）：

```text
baseline(hexo g)                        bytes: 683218  sha: 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
expanded 原样（= 当前管线等价物）        bytes: 686772  delta=+3554  sha_equal_baseline=false
expanded + $prismjs_enable=false        bytes: 682990  delta=-228   sha_equal_baseline=false
expanded + 四项 Hexo define（完整模拟） bytes: 682990  delta=-228   sha_equal_baseline=false
```

- 「原样」的字节数与 SHA 与当时 `examples/blog/dist` 产物**完全一致**（686772 / `1319c726…`），证明复现的是真实管线而不是玩具输入；
- 只补 `$prismjs_enable=false` 就精确减掉 **3782 字节**；另外三个变量补不补结果相同（未定义真值恰等于基线值，见 §2.3）；
- 逐块 diff：多出的 **32 个规则块**全部来自 `_highlight/prismjs/{index,line-number,diff}.styl`，与 P1-5 §6.1 `{` 计数 +32 完全对应。P1-5 §6.2 的「34 条」是选择器级 multiset 口径，不与之矛盾；**字节口径以 3782 为准**；
- 剩余 −228 B 是 U6 的字面量行折叠差，与 prismjs 无关。

### 2.3 四个变量的逐个对账

| 变量 | 基线（Hexo `.define()`） | 我们（未定义） | 是否同效 |
| --- | --- | --- | --- |
| `$highlight_enable` | `true` | `if` 中为真 | ✅ 巧合一致（theme.styl 配色、highlight 分支都输出） |
| `$highlight_line_number` | `true` | `&&` 中当假 → `wordWrap=false` | ✅ 与基线的 `!true` 一致 |
| `$prismjs_line_number` | `true` | `if` 中为真 | ✅ 巧合一致（line-number 规则照常） |
| `$prismjs_enable` | **`false`** | `if` 中为真 | ❌ **唯一分歧 → prismjs 分支被包含** |

---

## 3. 必须回答 3：新增校验脚本检查什么 + 原始输出

脚本：`scripts/check-upstream-delta.mjs`；入口：根 `package.json` → `"check:upstream-delta": "node scripts/check-upstream-delta.mjs"`。只读、不构建、不需要 `_research` 副本（CI checkout 也能跑）。

| 组 | 检查 | 为什么值得占 CI 时间 |
| --- | --- | --- |
| 1 | `readmode.styl:104` 必须正确写法、`:120` 必须保持上游笔误 `var(-highlight-bg)` | 防「顺手修复」：修了会改变视觉、打乱 P1-6 基准、lightningcss 相关决策也得重来 |
| 2 | `docs/baseline.json` 的 commit/version/bytes/gzip/SHA ↔ 登记表锚点 | baseline 被改而文档没跟 → 基准静默漂移 |
| 2b | 683218 + 3782 + (−228) = 686772 | 登记表内部数字必须自洽 |
| 2c | `docs/notes/P-upstream-delta.md` 的报告数字 ↔ 锚点 | 报告与登记表不许各说各话 |
| 3 | 9 个上游关键文件 SHA-256 | 镜像被格式化/换行归一化/手改（readmode 只是其中一例） |
| 4 | 上游 styl 树：4 个 Hexo 注入变量仍零赋值；`if $prismjs_enable` 守卫仍在 | 守住 D9 结论的事实前提；被人补了赋值就说明需要重新定位 |
| 4b | `theme.config.yml` 133 顶层 / 662 递归键；3 个注释键不存在；`theme_color`/`hr_icon` 仍是对象 | 防「好心补默认值」改色值分支（U5） |
| 5 | `.baseline-work` 的 hexo = 7.3.0（声明 + CLI 块 + 实际安装）；CI SKIP | 换机器重跑基准的版本前提（U4） |

基线锚点（脚本会与登记表比对，也是本报告数的唯一来源）：

- `baseline.css.indexCssBytes = 683218`
- `baseline.css.indexCssGzipBytes = 79124`
- `baseline.css.indexCssSha256 = 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61`

### 3.1 跑一次的原始输出（`node scripts/check-upstream-delta.mjs`，退出码 0）

```text
[check-upstream-delta] PASS 登记表锚点字段完整
[check-upstream-delta] PASS readmode.styl:104 保持正确写法 var(--highlight-bg)
[check-upstream-delta] PASS readmode.styl:120 保持上游笔误 var(-highlight-bg)（我们决策：不改）
[check-upstream-delta] PASS baseline.json commit 与登记表一致（72439d93）
[check-upstream-delta] PASS baseline.json version 与登记表一致（1.7.1）
[check-upstream-delta] PASS baseline.json css.indexCssBytes 与登记表一致（683218）
[check-upstream-delta] PASS baseline.json css.indexCssGzipBytes 与登记表一致（79124）
[check-upstream-delta] PASS baseline.json css.indexCssSha256 与登记表一致（7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61）
[check-upstream-delta] PASS P1-5 字节闭环：683218 + 3782 + (-228) = 686772
[check-upstream-delta] PASS docs/notes/P-upstream-delta.md 记录 baseline.css.indexCssBytes 与登记表一致（683218）
[check-upstream-delta] PASS docs/notes/P-upstream-delta.md 记录 baseline.css.indexCssGzipBytes 与登记表一致（79124）
[check-upstream-delta] PASS docs/notes/P-upstream-delta.md 记录 baseline.css.indexCssSha256 与登记表一致（7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61）
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/index.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/var.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/highlight.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/theme.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/index.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/line-number.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_highlight/prismjs/diff.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/src/styles/upstream/_mode/readmode.styl
[check-upstream-delta] PASS 上游文件 SHA-256 examples/blog/theme.config.yml
[check-upstream-delta] PASS 上游 72 个 styl 里 $highlight_enable / $highlight_line_number / $prismjs_enable / $prismjs_line_number 仍然零赋值（它们由 Hexo 模板脚本的 .define() 注入，D9 的前提）
[check-upstream-delta] PASS _highlight/highlight.styl 仍有 if $prismjs_enable 守卫（D9 现场保留）
[check-upstream-delta] PASS theme.config.yml 顶层键 = 133（登记表 133）
[check-upstream-delta] PASS theme.config.yml 递归 mapping key = 662（登记表 662）
[check-upstream-delta] PASS 上游注释掉的 3 个配置键仍然不存在（缺失 → falsy → 上游 fallback 默认值）
[check-upstream-delta] PASS 对象型配置键保持对象：theme_color, hr_icon（hexo-config 返回 JS 对象 → 布尔语境恒真）
[check-upstream-delta] PASS baseline 工作区 hexo 钉死 7.3.0（声明 + CLI 块 + 实际安装）

[check-upstream-delta] 校验通过：PASS 28 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
```

注：`yaml` 缺失时 4b 会降级 SKIP；`.baseline-work` 不存在时（CI checkout）第 5 组 SKIP。本地两者都在，所以是 28 PASS / 0 SKIP。

### 3.2 负向测试（证明守卫真的会拦）

把仓库拷到临时目录（不碰工作区），故意做两处破坏：① 把 `readmode.styl:120` 的笔误"修好"；② 把 `baseline.json` 的 `indexCssBytes` 改成 683219。脚本输出（退出码 1）：

```text
[check-upstream-delta] FAIL readmode.styl:120 保持上游笔误 var(-highlight-bg)（我们决策：不改）
  实际："background: var(--highlight-bg) !important"。把这里"修好"会让 read-mode 代码块背景真的生效（上游实际不生效），破坏像素级还原与 P1-6 字节基准；确需修复请先更新 docs/upstream-delta.md 的决策与锚点。
[check-upstream-delta] FAIL baseline.json css.indexCssBytes 与登记表一致
  baseline.json=683219 / 登记表=683218
[check-upstream-delta] FAIL 上游文件 SHA-256 examples/blog/src/styles/upstream/_mode/readmode.styl
  实际 5abed5… / 登记表 ea44d8…。上游副本必须与 1.7.1 基线逐字节一致（不许格式化/换行归一化/"顺手修复"）。
[check-upstream-delta] 校验失败：3 项不通过（PASS 17 / SKIP 3）
```

（临时目录里没有 `yaml` / `.baseline-work`，4b 与第 5 组按设计 SKIP，所以 PASS 数比正式运行少。）

### 3.3 接入 CI 的建议（不在本轮写范围）

写范围只允许改 `package.json` 的 scripts，因此 `.github/workflows/ci.yml` 未动。建议在现有 `Verify CSS baseline` 之后**追加**一步（不改现有步骤）：

```yaml
      - name: Check upstream delta registry
        run: pnpm check:upstream-delta
```

---

## 4. 必须回答 4：对 Phase 2 及之后实现的具体约束

1. **站点配置适配层必须复刻 `stylus:renderer` 的 `.define()`**：`site.syntax_highlighter`（`highlight.js` / `prismjs`）+ `highlight.line_number` / `prismjs.line_number`；有 `syntax_highlighter` 时按上游三元逻辑算 enable，否则退回 `highlight.enable` / `prismjs.enable`。默认 `highlight.js` → `$prismjs_enable=false`。关闭判据：CSS 从 686772 → 682990 B，prismjs 规则族消失。
2. **这三个键不要补进 defaults**：`theme_color.button_hover` / `blockquote_padding_color` / `blockquote_background_color`；缺失 → falsy → 上游 fallback 默认色，补键会改色值分支。
3. **`hexo-config()` 对象语义保持降级**：`theme_color` / `hr_icon` / `preloader` / `footer.footerBar` / `dynamicEffect` / `katex` / `local_search` 共 7 处对象取值全部只在 `if` / `&&` 里；当前用 `true` 字面量代替。若出现「取对象子属性再输出」的新用法，必须先改实现，否则会把 `true` 当值输出。
4. **Phase 7 之前保持 `cssMinify:false`**：U1 与「未压缩基准」双重要求；开压缩时要另立压缩后体积预算，而不是拿压缩产物对 683218。
5. **禁止修改上游镜像**：`examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml` 是基线证据，SHA 由 CI 守卫；修上游必须走登记表 + 锚点变更。
6. **换行保持 CRLF**：不要对镜像跑 formatter / "统一换行"（U7）。
7. **基准只能同版本重跑**：hexo 7.3.0 + 固定 fixture + 固定站点配置；上游 commit 冻结 `72439d93`，迁移期不追新。
8. **逐字节对齐的边界**：即使 D9 关闭，仍差 −228 B（U6）。Phase 2 的 HTML/CSS 比对不能把「SHA 相等」当门槛，按 `verify-css.mjs` ±5% + 字节闭环 + 选择器集合 diff 三层判。
9. **脚注白名单**：HTML diff 要把 GFM 脚注区块列为已知差异（U8），否则 P2-1 会被误判失败。

---

## 5. 交接与文档债（不在本任务写范围）

| # | 事项 | 建议 |
| --- | --- | --- |
| 1 | `PLAN.md` §1.4 D9 行仍写「未定位 / 未定义当假」 | 改为「已定位：Hexo 模板脚本 `.define()` 注入层未复刻；未定义在 `if` 里当**真**；延后 Phase 2」，并指向 `docs/upstream-delta.md` U3 |
| 2 | `PLAN.md` §1.4 D7/D8 与本表 U1/U2 重复 | D7/D8 保持摘要 + 链接即可，本表为权威 |
| 3 | `docs/notes/P1-5-full-style-build.md` §6.4 / §8.1 的「未定义当假」「来源未定位」已过期 | 追加一条勘误指向本报告 §2（P1-5 是历史归档，不改原文，加勘误行） |
| 4 | `PLAN.md` §2.1 写「迁移完成后建立季度 diff 检查，差异写入 docs/upstream-delta.md（Phase 7）」 | 本表已提前落地；Phase 7 只需补充上游版本 diff 流程 |
| 5 | `.github/workflows/ci.yml` 尚未调用 `check:upstream-delta` | 按 §3.3 追加一步（只加不改） |

---

## 6. 证据与复现命令清单

| 用途 | 命令/位置 |
| --- | --- |
| 上游提交 | `git -C D:\Git-project\_research\anzhiyu-upstream rev-parse HEAD` → `72439d93936b63da59a4a1195f64de9f952f6cc1` |
| 上游版本 | `_research/anzhiyu-upstream/package.json` → `hexo-theme-anzhiyu` 1.7.1 |
| 上游变量注入 | `_research/anzhiyu-upstream/scripts/events/stylus.js`（`.define()` 4 个变量） |
| 上游变量零赋值 | 仓库镜像 72 个 styl grep `$prismjs_enable =` 零命中（脚本第 4 组常驻守卫） |
| 基线 CSS | `.baseline-work/public/css/index.css` 683218 B / SHA `7c1b1ec0…`（`.baseline-work` 已 gitignore，摘要固化在 `docs/baseline.json`） |
| P1-5 产物 | 686772 B / SHA `1319c726…`（P1-5 报告；本轮展开源码重渲染复现一致） |
| D9 最小复现 | 本报告 §2.2（stylus 0.64.0，用例落盘后执行） |
| D9 字节闭环 | 本报告 §2.2 ④（展开源码 + `stylus.render`，两次渲染差 3782 B） |
| U6 机制复现 | `stylus.render('@css {b,\n  strong {\n    font-weight: bolder;\n  }\n}\n')` → `b,\rstrong { … }` |
| 校验脚本 | `node scripts/check-upstream-delta.mjs`（本报告 §3.1 原始输出） |

**本轮改动文件清单**（写范围内）：

- `docs/upstream-delta.md`（新增）
- `docs/notes/P-upstream-delta.md`（新增，本文件）
- `scripts/check-upstream-delta.mjs`（新增）
- `package.json`（仅 scripts 增加 `check:upstream-delta` 一条）
