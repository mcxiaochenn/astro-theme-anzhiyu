# 上游差异与缺陷登记表

迁移基线：**hexo-theme-anzhiyu 1.7.1 / commit `72439d93936b63da59a4a1195f64de9f952f6cc1`（短哈希 `72439d93`）**。

这份表是「上游有什么问题、我们为什么这么处理」的唯一登记处。PLAN §1.4 的 D7 / D8 / D9 都收敛到这里；后续任何 Phase 若想「顺手修一下上游」，先看本表的决策列。

- 本地只读副本：`D:\Git-project\_research\anzhiyu-upstream`（331 文件 / 2.55 MB，与基线一致）
- 仓库内镜像：`examples/blog/src/styles/upstream/`（72 个 `.styl` + 47 个 `.css`，与上游逐字节一致）+ `examples/blog/theme.config.yml`（= 上游 `_config.yml`）
- 机械校验：`node scripts/check-upstream-delta.mjs`（根 `package.json` 的 `check:upstream-delta`）；只读、不构建、不需要 `_research` 副本
- 维护规则：**任何一条**「位置 / 原文 / 决策 / 基准数字」变化都要同步改本表 + 锚点，否则 CI 会红——这是故意的

状态标记：`已定位` · `已决策` · `部分定位` · `未定位`

---

## 1. 登记总表

| ID | 类型 | 位置 | 一句话 | 决策 | 验证 |
| --- | --- | --- | --- | --- | --- |
| U1 | 上游缺陷（CSS 笔误） | `source/css/_mode/readmode.styl:120` | `var(-highlight-bg)` 少一个横杠，属非法自定义属性 | **不改**（保真：上游实际不生效） | 行级守卫 + SHA + `cssMinify:false` |
| U2 | 上游文档与真实规模不符 | `_config.yml` 全文 | 不是「约 200 键」，实际 **133 顶层 / 662 递归 mapping key** | **以实测为准**；上游文件不改 | YAML 计数（133/662）+ SHA |
| U3 (**D9**) | 管线缺口（Hexo 注入层未复刻） | `source/css/_highlight/highlight.styl:29`（及 `:3`） | `$prismjs_enable` 由上游模板脚本 `.define()` 注入，不在 styl 里；我们没复刻 → Stylus 未定义变量在 `if` 里为真 → 多出 prismjs 分支 | **已修复（P1-11）**：插件 `hexoDefineLines()` 复刻 `.define()` 注入 4 个变量，站点级键缺失时回落 Hexo 7.3.0 默认值 | 展开源码 4 行赋值守卫 + 字节闭环 683218 − 228 = 682990 + prismjs 规则族消失 |
| U4 | 环境约定（版本钉死） | `.baseline-work/package.json`、Hexo 依赖树 | 参考产物必须 hexo **7.3.0**；`hexo-renderer-stylus` 3.0.1 / nib 1.2.0 / 上游侧 stylus 0.62.0，我们侧 0.64.0 | **钉死 7.3.0**，迁移期不追上游/不换 Hexo | 本地 `.baseline-work` 三项校验（CI SKIP） |
| U5 | 上游配置缺失（注释掉） | `_config.yml:613`（`theme_color`）/ `:755`（`hr_icon`）/ `:618`、`:626`、`:627` | 3 个子键被注释 → 配置里不存在 → `getProperty` 返回 `''` → 走 fallback；`theme_color` / `hr_icon` 本身是对象 | **不补键**（补了会改色值分支）；对象按 truthy 处理 | YAML 键存在性 + 对象类型 + SHA |
| U6 | 工具链差异（逐字节对齐约定） | `packages/vite-plugin-stylus-hexo-config/src/index.mjs` 的 `@css{}` 字面量 + Stylus `lexer.js:76-80` | `@css{}` 内「逗号 + 换行」被 Stylus 词法器重写成 `,\r`，与 Hexo 的 literal import 路径不可逐字节对齐 | **不改**（接受 −228 B / SHA 不一致） | 最小复现 + 字节记录 |
| U7 | 上游仓库约定（换行） | 上游全部 `.styl` / `_config.yml` | 上游文件是 **CRLF**；镜像必须逐字节保持，任何换行归一化都会改 SHA | **保持 CRLF**，禁止格式化 | SHA + 换行统计 |
| U8 | 上游渲染能力缺失（对照用） | hexo-renderer-marked 7.0.1 | 上游 `hexo g` 不渲染 GFM 脚注（`[^x]` 原样留段落） | 迁移期不改上游；Astro 侧按 GFM 启用，记为已知差异 | P1-6 报告 §7 #3；HTML diff 口径 |

> U3 已在 **P1-11** 修复（插件复刻 Hexo define 层），定位实验与修复前后数据见 §3；U6 是「即使 D9 修好也不能逐字节一致」的机制解释，也是当前唯一剩余差异（−228 B），详见 §4。

---

## 2. 逐项详情

### U1 · `readmode.styl:120` 非法自定义属性（上游缺陷，不改）

**位置**：`source/css/_mode/readmode.styl:120`（仓库镜像 `examples/blog/src/styles/upstream/_mode/readmode.styl:120`）

**原文**（CRLF 文件，行内内容）：

```stylus
104:        background: var(--highlight-bg) !important    // 正确写法（read-mode 的 pre/.highlight 背景）
120:          background: var(-highlight-bg) !important   // 上游笔误：少一个横杠
```

**影响**：

- `var(-highlight-bg)` 不是合法自定义属性引用，浏览器按 CSS 规范静默丢弃该声明 → 上游 read-mode 下 `.hljs` 的背景**实际从未生效**。
- lightningcss 是严格解析器，压缩阶段会直接构建失败：`[lightningcss minify] Unexpected token Ident("-highlight-bg")`（P1-5 报告 §4 记录过真实报错，`astro.config.mjs` 注释同）。
- 修好它会让 read-mode 的代码块背景真的生效，与上游线上视觉不一致——像素级还原的前提是「保持上游不生效」。

**决策：不改。** 双重措施：

1. `examples/blog/astro.config.mjs` 关闭 `vite.build.cssMinify`（注释里写明了这条原因），Phase 7 处理压缩时另立预算口径，而不是打开压缩去对未压缩基准。
2. 本题的守卫脚本把 `:120` 必须为非法写法、`:104` 必须为正确写法写死；CI 会拦住任何「顺手修复」。真要走修复路线，必须先改本表的决策 + 锚点，再动代码。

**验证**：`check-upstream-delta.mjs` 第 1 组检查（行级）+ `upstreamFiles` 里 `readmode.styl` 的 SHA-256（`ea44d8a9…`）+ `pnpm verify`（±5%）+ P1-6 的 48 页 HTML 摘要。

### U2 · `_config.yml` 真实规模：133 顶层 / 662 递归 mapping key（文档口径纠正）

**位置**：`_config.yml` 全文（仓库镜像 `examples/blog/theme.config.yml`，41845 字节，与上游逐字节一致）

**原文/事实**：Phase 0 的 `docs/01-upstream-analysis.md`、`02-astro-mapping.md`、`03-migration-plan.md` 写的是「约 200 个键」。实测 YAML 解析：

```text
_top = 133
recursive mapping keys = 662
```

**影响**：P1-7 的 schema/defaults 工作量与「passthrough 键」规模被低估；「约 200」会让人以为还剩 ~70 个键可抄。

**决策：以实测为准，不改上游文件。**

- `PLAN.md` §1.4 D8 已纠正；`packages/astro-theme-anzhiyu/src/config/{defaults,schema}.ts` 按 133 顶层 + 31 个精确类型区块落地。
- 01/02/03 是历史调研文档，**不回改**（保留当时的估算痕迹），引用时以 PLAN 与本表为准。

**验证**：`check-upstream-delta.mjs` 的 `themeConfigTopLevelKeys` / `themeConfigRecursiveMappingKeys` 校验（需要可选依赖 `yaml`，缺失时 SKIP）+ `theme.config.yml` SHA-256（`bd0bd629…`）。

### U3 · D9：prismjs 规则到底谁注入的（已定位 → 已修复，P1-11）

**位置**：`source/css/_highlight/highlight.styl:29-30`（守卫与 `@require`）、`:3`（`wordWrapPrismjs` 计算）；根因在上游模板脚本 `scripts/events/stylus.js`（该文件是 Hexo 主题脚本，不参与 CSS 编译，也不在我们仓库镜像里）。

**原文**：

```stylus
2: wordWrap = $highlight_enable && !$highlight_line_number && hexo-config('code_word_wrap')
3: wordWrapPrismjs = $prismjs_enable && !$prismjs_line_number && hexo-config('code_word_wrap')
26: if $highlight_enable
27:   @require 'highlight/index'
29: if $prismjs_enable
30:   @require 'prismjs/index'
```

```js
// _research/anzhiyu-upstream/scripts/events/stylus.js（上游主题脚本，Hexo 下由 hexo 加载）
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

**影响**（这就是 D9 的观测量，以下为修复前状态）：

- 基线站点配置（`.baseline-work/_config.yml`）里 `syntax_highlighter: highlight.js`、`highlight.line_number: true`、`prismjs.line_number: true`，所以 Hexo 侧实际注入：`$highlight_enable=true`、`$highlight_line_number=true`、`$prismjs_enable=false`、`$prismjs_line_number=true`。
- 修复前我们的 Vite 插件只复刻了 `hexo-config()` 与 import 展开，**没有**这个 `stylus:renderer` filter 的 `.define()` 层。四个变量在 72 个 styl 里零赋值 → 全部未定义。
- Stylus 0.64.0 对未定义标识符的求值（实测）：`if $undefined` → **真**（不是 P1-5 记录的「假」）；`$a = $undefined && …` 的二元运算 → `false`。于是（逐个对账见 §3.2）：
  - `$highlight_enable` 未定义 = 真 ≡ 基线 `true`（巧合一致）→ highlight 分支、theme.styl 的配色块都照常输出；
  - `$highlight_line_number` 未定义在 `&&` 里当假 ≡ `!true`（一致）→ `wordWrap` 仍为 false；
  - `$prismjs_line_number` 未定义在 `if` 里当真 ≡ 基线 `true`（一致）→ line-number 规则照常输出；
  - **`$prismjs_enable` 未定义当真 ≠ 基线 `false`** → prismjs 分支被错误包含，这是唯一分歧。
- 量化（修复前）：+3782 字节 / +32 个规则块（`{` 计数与 P1-5 §6.1 的 +32 完全一致）；净效应相对基线是 +3554 字节（+0.52%），因为同一份产物里还有 −228 字节的排版差（见 U6）。

**结论（三选一问题的答案）**：**既不是插件主动注入，也不是 Vite-stylus 配置问题，更不是上游 styl 里藏了赋值**，而是「上游用 Hexo 模板脚本 `.define()` 注入四个变量 + 我们的插件没复刻这一层 + Stylus 未定义变量在 `if` 里为真」三者叠加。归因：**迁移管线的已知缺口**，不是上游缺陷。

**修复（P1-11，已落地）**：`packages/vite-plugin-stylus-hexo-config/src/index.mjs` 新增 `hexoDefineLines()`，在每次 transform 的展开源码顶部（与 `$cfg_*` 变量同级）写入 4 行赋值：

```text
$highlight_enable = true
$highlight_line_number = true
$prismjs_enable = false
$prismjs_line_number = true
```

取值规则照抄上游 filter（`scripts/events/stylus.js:7-24`），推导顺序也一致：

1. `syntax_highlighter`（`hexo.config` 顶层的站点级字符串，Hexo >7.0 语义）：**非空时** enable 由它推导——`$highlight_enable = (syntax_highlighter === 'highlight.js')`、`$prismjs_enable = (syntax_highlighter === 'prismjs')`，二者互斥（`prismjs` 时 highlight 为 false）。
2. `highlight.enable` / `prismjs.enable`（boolean；Hexo ≤6 的旧开关）：仅在 `syntax_highlighter` 为空/缺失时生效。
3. `highlight.line_number` / `prismjs.line_number`（boolean）：原值直接注入，不参与上面的互斥推导。
4. **值来源**：`hexo.config` = 站点 `_config.yml` 深合并 `hexo/dist/hexo/default_config.js`。插件拿到的 YAML 目前是主题配置（`examples/blog/theme.config.yml`，不含站点级键），因此缺省回落 Hexo 7.3.0 默认值：`syntax_highlighter: 'highlight.js'`、`highlight.line_number: true`、`prismjs.line_number: true` → 恰好是基线站点注入的四个值。Phase 2 站点配置层落地后把站点 YAML 的这几个键传进来（或整体合并后传入），插件优先用配置值，推导逻辑不变。
5. **值类型/等价性**：`.define()` 走 stylus/lib/utils.js 的 `coerce`，boolean → `nodes.Boolean`、number → `nodes.Unit`、string → `nodes.String`，源码文本的 `$x = true/false` 与之一一对应；配置缺失时上游拿到 `nodes.null`（条件语境为假），插件写成 `false`——上游 styl 只在 `if` / `&&` / `!` 里消费这四个变量，二者在这些语境同真值。

**修复前后（同一份展开源码 + stylus 0.64.0 渲染；修复前对照 = 从展开源码里去掉那 4 行）**：

```text
版本                   bytes    gzip    sha256(前 8)  { 计数  .token  language-
修复前（无 define 层）  686772   79071   1319c726…     4157    36      49
修复后（有 define 层）  682990   78457   429ff06f…     4125     0       0
delta                  -3782    -614                  -32     -36     -49
```

- 修复后 `{` = 4125、`;` = 17537，与上游基准逐项相同（P1-5 §6.1：4125 / 17537）；物理行 27164 vs 基准 27396，差 −232 行全部是 U6 的 `,\r` 折叠，对应 −228 字节。
- 真实构建产物（`pnpm --filter blog build`）**总字节 684087** = `682990`（上游样式子集）+ `1097`（ClientRouter 自带样式，P1.5 垂直切片起就在产物里）。按 `/*! normalize.css` 切出 ClientRouter 前缀后，子集 SHA-256 与直接渲染**完全一致**（`429ff06f…`），且 prism / token / language- 出现次数均为 0。
- 对照基线 683218：剩余差 = `−228`（U6 排版差）+ `1097`（ClientRouter，非上游样式）= +869 字节（+0.13%）。

**决策：已修复（P1-11）**。原先「延后到 Phase 2」的三个理由已不成立：

1. 基准不需要重算：U6 的 −228 与基线摘要都不变，变的是我们自己的产物 686772 → 682990；
2. 站点级键缺失时回落 Hexo 默认值即可闭合 D9，不必等 Phase 2 的站点配置适配层；
3. `verify-css.mjs` 的 ±5% 本来就 PASS，但修复后更接近基准（+0.52% → +0.13%）。

后续约束：站点配置层传入 `syntax_highlighter` / `highlight` / `prismjs` 时必须保持上述推导（enable 互斥、line_number 独立、缺省回落 Hexo 默认），不能把 `$highlight_enable` / `$prismjs_enable` 当成两个可以同时为真的独立开关。

**验证**：`check-upstream-delta.mjs` 新增 4c 组「插件必须注入 4 个变量」（动态 import 插件、展开上游 `index.styl`、断言 4 行赋值与值）+ 字节闭环 683218 + (−228) = 682990 + 「上游 72 个 styl 零赋值」「highlight.styl 守卫保留」；`pnpm verify` / `pnpm compare-vars` / 构建产物 grep 的原始输出见 `docs/notes/P1-11-define-layer.md`。

### U4 · hexo 版本必须钉在 7.3.0（环境约定）

**位置**：`.baseline-work/package.json`（参考产物工作区，`.gitignore` 掉，不进仓库）

**原文**：

```json
{
  "hexo": { "version": "7.3.0" },
  "dependencies": {
    "hexo": "7.3.0",
    "hexo-renderer-stylus": "3.0.1",
    "hexo-renderer-marked": "7.0.1",
    "hexo-renderer-pug": "3.0.0"
  }
}
```

已安装依赖实测：`hexo 7.3.0`、`hexo-renderer-stylus 3.0.1`、`nib 1.2.0`、上游侧 `stylus 0.62.0`；我们 Astro 侧 `stylus 0.64.0`。

**影响**：

- 上游 `scripts/events/stylus.js` 的 `if (syntaxHighlighter)` 分支是 Hexo >7.0 语义；换 8.x 行为不同，换 <7 则 `syntax_highlighter`/`highlight.enable`、`prismjs.enable` 的取值来源不同，四个 stylus 变量会变，CSS 跟着变。
- 实测 0.62.0 / 0.64.0 在「同一份展开源码」上产物逐字节相同（682990 B 一致），说明 U3 的 +3782 B 与 U6 的 −228 B **都不是 stylus 版本造成的**；但这不代表换版本安全（Hexo 自己的 import/literal 路径仍可能变）。

**决策：钉死 hexo 7.3.0**。参考产物只能在 7.3.0 + 固定 fixture + 固定站点配置下重跑；迁移期不追上游新提交、不换 Hexo 大版本。`hexo` 依赖的 `package.json` 里 `hexo: { version }` 块不能省（hexo-cli 4.3.2 的 `find_pkg` 只认它，缺了 CLI 退化成 help/init/version）。

**验证**：`check-upstream-delta.mjs` 第 5 组（仅本地有 `.baseline-work` 时执行：声明版本 + CLI 块 + 实际安装三方一致；CI checkout 里 SKIP）。换机器重跑基准的步骤见 `docs/notes/P1-6-baseline.md`。

### U5 · 被上游注释掉的 3 个配置键 + 2 个对象型配置块（缺失语义）

**位置**：`_config.yml:613`（`theme_color` 对象起点）、`:755`（`hr_icon` 对象起点）、`:618`、`:626`、`:627`（三个被 `#` 注释掉的子键）

**原文**：

```yaml
613: theme_color:
614:   enable: true
...
618:   #   button_hover: "#FF7242"
...
626:   #   blockquote_padding_color: "#425AEF"
627:   #   blockquote_background_color: "#425AEF"

755: hr_icon:
756:   enable: true
757:   icon: \f0c4
758:   icon-top:
```

对应 stylus 消费点：

```stylus
// var.styl:7  —— theme_color 是对象：hexo-config() 返回 JS object，布尔语境恒真
$themeColorEnable = hexo-config('theme_color') && hexo-config('theme_color.enable')
// var.styl:25 —— hr_icon 同理
$hrEnable = hexo-config('hr_icon') && hexo-config('hr_icon.enable')
// var.styl:54-55 / :80 —— 三个被注释键：getProperty 返回 ''（falsy）→ 走 fallback 默认色
$blockquote-padding-color = $themeColorEnable && hexo-config('theme_color.blockquote_padding_color') ? convert(...) : #425AEF
$blockquote-background-color = $themeColorEnable && hexo-config('theme_color.blockquote_background_color') ? alpha(...) : alpha($blockquote-padding-color, .1)
$button-hover-color = $themeColorEnable && hexo-config('theme_color.button_hover') ? convert(...) : $light-orange
```

**影响**：

- 这三个键缺失是**上游有意/无意留下的默认状态**：Hexo 的 `getProperty` 对不存在的键返回 `''` → falsy → 用 `#425AEF` / `#FF7242` 等 fallback。如果我们的配置层「好心」把键补上并赋默认值，分支条件会变成真，产出色值/alpha 计算会变，与上游色值不再一致。
- `theme_color` / `hr_icon` 是对象：Hexo 侧 `hexo-config('theme_color')` 返回 JS 对象，Stylus `utils.coerce` 把它变成表达式，在布尔语境恒真。我们插件把它降级成字面量 `true`，**只在布尔语境等价**。已核对上游全部对象取值点（7 处：`theme_color`、`hr_icon`、`preloader`、`footer.footerBar`、`dynamicEffect`、`katex`、`local_search`），全部出现在 `if` / `&&` 条件里，没有「取对象属性再输出值」的用法，因此当前降级安全。

**决策：不补键、不改上游文件、保持对象语义。**

- `packages/astro-theme-anzhiyu/src/config/defaults.ts` 已按上游 YAML 生成，`theme_color` / `hr_icon` 仍是对象，三个注释键**不在** defaults 里（P1-7 已与上游 YAML 深比较一致）——保持。
- Phase 2 渲染侧必须保留「缺失键 → falsy → fallback」语义；如果未来 schema 想给这三个键加默认值，必须同时确认它们不出现在 CSS 分支判断里（或明确接受色值变化并更新基准）。

**验证**：`check-upstream-delta.mjs` 第 4b 组（三个键不在配置里、两个键必须是对象）+ `theme.config.yml` SHA-256 + P1-5 插件日志（`hexo-config('theme_color.blockquote_*') 在配置里不存在，按 '' 处理`）。

### U6 · 逐字节对齐的机制障碍：`@css{}` 字面量里的 `,\r`（工具链差异）

**位置**：`packages/vite-plugin-stylus-hexo-config/src/index.mjs` 的 `cssLiteralBlock()`（纯 CSS `@import` → `@css { … }`）+ Stylus 词法器 `node_modules/stylus/lib/lexer.js:76-80`（构造函数的「选择器逗号续行」重写）与 `lexer.js:340-367`（`@css` literal 原样收集）

**机制**：Stylus 在构造 Lexer 时对**整个输入**做一次前置重写，其中一条规则把「`)` / `,` / `:` 后面的注释/换行」折叠成 `val + '\r'`（`lexer.js:79`；`\r` 是 Stylus 内部的行续接标记）。Hexo 的 `include css: true` 走的是 evaluator 的 literal import 路径，CSS 文本不经过这条前置重写；我们插件把 CSS 包成源码里的 `@css{…}`，于是**字面量内部**的「逗号 + 换行」也被折叠，产物里出现 `b,\rstrong` 这类行，行数与缩进和 Hexo 产物不同。

最小复现（stylus 0.64.0）：

```js
stylus.render('@css {b,\n  strong {\n    font-weight: bolder;\n  }\n}\n')
// => "b,\rstrong {\n  font-weight: bolder;\n}\n"
```

**影响**：

- 即使把 U3 的 prismjs 分支关掉，产物仍是 682990 B vs 基准 683218 B，**差 −228 字节（−0.033%）且 SHA 不同**，不能逐字节对齐。
- 这些差异是空白/缩进被吞掉的结果，视觉无影响；对 gzip 体积也接近中性。

**决策：不改。**

- 迁移期验收口径用 `verify-css.mjs` 的 ±5% + 本表的字节闭环，不追求 SHA 逐字节相等；
- Phase 7 若想做到逐字节一致，需要换一种 literal 承载方式（例如像 Stylus evaluator 那样直接构造 `nodes.Literal`，或在插件里对 `@css{}` 内容做反向转义），属于 Phase 7 成本，**不要**在本表之外偷偷改插件行为。

**验证**：上面最小复现；以及 §5 的字节闭环锚点（683218 + (−228) = 682990，U6 是 D9 修复后唯一剩余项）。

### U7 · 上游仓库是 CRLF（镜像约定）

**位置**：上游全部 `.styl`（如 `index.styl` 24 个 CRLF、`var.styl` 185 个、`readmode.styl` 197 个）与 `_config.yml`（1342 个 CRLF）

**影响**：镜像里任何编辑器「格式化 / 统一换行」都会改文件 SHA、破坏与 1.7.1 的逐字节对应；同时插件只对被 `@import` 引入的文件做 `\r\n → \n` 归一化，**入口文件 `index.styl` 的 CR 会原样进入展开源码**（复现数据：展开 507855 字节里 24 个 CR）。实测这些 CR 不影响最终 CSS 字节（Stylus 词法器本来就先做换行归一），但会污染「展开前后文本对比」这类排查。

**决策：镜像保持 CRLF，禁止格式化；换行语义由插件按现有实现处理，不在本阶段改。**

**验证**：`check-upstream-delta.mjs` 的 SHA-256 组（9 个关键文件）；本表的换行数字。

### U8 · 上游不渲染 GFM 脚注（对照差异，非本轮修复）

**位置**：上游渲染链 `hexo-renderer-marked 7.0.1`（依赖仅 `marked` / `dompurify` / `jsdom`，无 footnotes 扩展）

**原文/事实**：P1-6 fixture `longform-hexo-astro.md` 同时含 `... [^note1] ...` 与 `[^note1]: ...`；上游产物里两者都作为普通段落输出（`<p>` 内保留 `[^note1]` 字样）。

**影响**：PLAN P2-1 的「脚注渲染并跳转」验收在「与上游 HTML diff」口径下永远对不上；必须先决定 Astro 侧启用 GFM 脚注并把上游缺失记为已知差异。

**决策：不改上游；Astro 侧按 GFM 启用**，HTML diff 时把脚注区块列为白名单差异（详见 `docs/notes/P1-6-baseline.md` §7 #3）。

**diff 口径（N22）**：`scripts/diff-html.mjs` 在 baseline 归一化阶段剔除「整段文本以 `[^label]: `
开头」的 `<p>`，且仅在 dist 侧确实存在 `section[data-footnotes]` 时生效。规则只覆盖完整的
脚注定义段落，不影响正文里正常书写的 `[^…]` 引用或其他段落。

**验证**：P1-6 报告原始记录；Phase 2 HTML diff 时按白名单核对；`longform-hexo-astro` 页的
`p[13]` node-missing 在启用 N22 后归零。

---

## 3. D9 定位实验（原始输入 / 原始输出）

### 3.1 最小复现：Stylus 未定义变量在 `if` 里到底当什么

用例在独立 `.mjs` 脚本里跑（含 `$` 的用例**不要**内联到 PowerShell 命令行：`$prismjs_enable` 会被 shell 当变量展开成空，用例直接失真）：

```js
// 依赖：examples/blog 的 stylus 0.64.0
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

结论：**未定义变量在 `if` 里为真、不报错**；在 `&&` 二元运算里当假。所以「零赋值」不等于「分支不执行」——这正是 D9 的关键，也是 P1-5 §6.4 记录错误的点。

按任务要求再把守卫单独落成两个物理 `.styl` 文件跑一遍（`%TEMP%/anzhiyu-stylus-probe/`，用 `stylus.render(fs.readFileSync(file, 'utf8'), { filename })` 编译）：

```text
// prismjs-guard-undefined.styl（不赋值）
if $prismjs_enable
  .prism-rule
    color: red
.tail
  color: green

// prismjs-guard-false.styl（赋值 false）
$prismjs_enable = false
if $prismjs_enable
  .prism-rule
    color: red
.tail
  color: green
```

```text
prismjs-guard-undefined.styl -> ".prism-rule {\n  color: #f00;\n}\n.tail {\n  color: #008000;\n}\n"
prismjs-guard-false.styl     -> ".tail {\n  color: #008000;\n}\n"
```

即：同一段守卫，变量不赋值时分支被执行（产物多出 `.prism-rule`），赋值 `false` 时分支不执行——与 §3.3 的真实管线行为完全一致。

### 3.2 用真实插件展开上游入口，再看变量到底有没有被赋值（P1-11 修复前的历史记录）

```js
// 用 packages/vite-plugin-stylus-hexo-config 的真实 transform 展开
const { stylusHexoConfig } = await import('.../packages/vite-plugin-stylus-hexo-config/src/index.mjs')
const plugin = stylusHexoConfig({ configPath: 'examples/blog/theme.config.yml' })
const expanded = plugin.transform(fs.readFileSync('.../upstream/index.styl', 'utf8'), entry).code
```

原始输出（插件日志 + grep）：

```text
[stylus-hexo-config] index.styl: 102 个配置键, 展开 150 个文件
expanded bytes: 507855 lines: 21844
--- 展开后全文 grep "prismjs_enable =" ---
(零命中：展开后仍无任何赋值)
--- 展开后 prismjs_enable 的全部出现行 ---
2468: wordWrapPrismjs = $prismjs_enable && !$prismjs_line_number && ($cfg_code_word_wrap)
2738: if $prismjs_enable
```

即：插件既没有赋值它，也没有替它生成 `$cfg_*`（`hexo-config` 只覆盖配置键，`$prismjs_enable` 不是配置键）。**变量来源只可能是 Hexo 的 `.define()` 层**（§2 U3 的上游脚本），我们的管线没有这一层。

> P1-11 修复后：同一调用会在展开源码最前面生成 4 行 define 赋值（见 §2 U3「修复」），展开源码 507855 → 507962 字节。`prismjs_enable =` 的 grep 从「零命中」变成一行 `$prismjs_enable = false`。

### 3.3 字节闭环：把 `$prismjs_enable=false` 补上会发生什么（P1-11 修复前实验 → 修复后成为真实管线）

用同一份展开源码渲染（`stylus.render`），对比 Hexo 真实产物 `.baseline-work/public/css/index.css`：

```text
baseline(hexo g)                        bytes: 683218  sha: 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
修复前 expanded 原样（无 define 层）     bytes: 686772  delta_vs_baseline=+3554  sha=1319c726…
expanded + $prismjs_enable=false        bytes: 682990  delta_vs_baseline=-228   sha=429ff06f…
expanded + 四项 Hexo define（完整模拟） bytes: 682990  delta_vs_baseline=-228   sha=429ff06f…
P1-11 修复后（插件真实注入，当前管线）  bytes: 682990  delta_vs_baseline=-228   sha=429ff06f…
```

- 「修复前原样」与当时 `examples/blog/dist` 的 CSS **字节数与 SHA 完全一致**（686772 / `1319c726…`），证明复现的就是真实管线。
- 只补 `$prismjs_enable=false` 就精确减掉 **3782 字节**，其他三个变量补不补结果相同（因为它们的未定义真值恰好等于基线值）。
- 逐块 diff：多出的 **32 个规则块**全部来自 `_highlight/prismjs/{index,line-number,diff}.styl`，与 P1-5 §6.1 的 `{` 计数 +32 对应；P1-5 §6.2 的「34 条」是选择器级统计口径，两者不矛盾。**字节口径以 3782 为准**。
- 剩余 −228 B 是 U6 的 `@css{}` 字面量行折叠差，不是 prismjs。
- **P1-11 之后**：「expanded + 四项 Hexo define」不再是手工模拟，而是插件的真实行为——当前展开源码直接渲染就是 682990 B（SHA `429ff06f63bbfd68…`）。`pnpm --filter blog build` 的真实产物是 **684087 B** = 682990（上游样式子集）+ 1097（ClientRouter 自带样式，见 §4 第 8 条）；按 `/*! normalize.css` 切掉 ClientRouter 前缀后，子集 SHA 与上表 `429ff06f…` 完全一致。

---

## 4. 对 Phase 2 及之后的具体约束

1. **~~站点配置适配层必须复刻 `stylus:renderer` filter 的 `.define()`~~ → 已由 P1-11 在插件层完成**
   - 现状：`hexoDefineLines()` 按上游 filter 的推导注入 4 个变量（`syntax_highlighter` 非空时 enable 互斥推导，否则退回 `highlight.enable` / `prismjs.enable`；`line_number` 原值注入），站点级键缺失时回落 Hexo 7.3.0 默认值。实现细节见 §2 U3「修复」。
   - Phase 2 站点配置层要做的是**把站点 YAML 的这几个键接进插件**（显式传参或合并后传入），并保持上述推导语义不变，不能把 enable 当成两个独立开关。
   - 验收（已达成）：上游样式子集 686772 → 682990 B（−3782 B），prismjs 规则族消失；真实构建产物 684087 B（682990 + ClientRouter 1097）。
2. **不要把这三个缺失键补进 defaults**：`theme_color.button_hover` / `theme_color.blockquote_padding_color` / `theme_color.blockquote_background_color`。它们缺失时上游走 fallback 默认色，补键会改色值分支。
3. **`hexo-config()` 的对象语义保持降级**：对象/数组在布尔语境恒真（当前用 `true` 字面量代替）。若未来出现「取对象子属性再输出」的新用法，必须重新评估——这是会把 `true` 当值输出的事故点。
4. **CSS 压缩在 Phase 7 之前保持关闭**：`cssMinify:false` 是 U1 与「未压缩基准」双重要求；Phase 7 开压缩时要另立「压缩后体积」预算，而不是拿压缩产物对 683218。
5. **禁止修改上游镜像**：`examples/blog/src/styles/upstream/**` 与 `theme.config.yml` 是基线证据，SHA 由 CI 守卫；任何修复都记进本表，不许直接改。
6. **换行保持 CRLF**：不要对镜像做 `prettier --write` / 编辑器「统一换行」。
7. **基准只能同版本重跑**：hexo 7.3.0 + 固定 fixture + 固定站点配置；上游 commit 冻结在 `72439d93`，迁移期不追新。
8. **逐字节对齐的边界**：D9 已修好（P1-11），上游样式子集仍差 −228 B（U6）；**真实构建产物**是 682990 + 1097（ClientRouter，来自 P1.5 垂直切片）= 684087 B，对基线 +869 B（+0.13%）。Phase 2 的 HTML/CSS 比对不能把「SHA 相等」当验收门槛；如需更严口径，按 `verify-css.mjs` ±5% + 本表字节闭环 + 选择器集合 diff 三层来判。
9. **脚注白名单**：HTML diff 要把 GFM 脚注区块列为已知差异（U8），否则 P2-1 会被误判失败。

---

## 5. 机器可读锚点（CI 依赖，改动会红）

`scripts/check-upstream-delta.mjs` 解析下面 `upstream-delta:begin/end` 之间的 JSON。**改任何数字/路径/SHA 都要同步改本表正文**；只改正文不改锚点会被 CI 判为不一致。

<!-- upstream-delta:begin -->
```json
{
  "upstreamVersion": "1.7.1",
  "upstreamCommit": "72439d93936b63da59a4a1195f64de9f952f6cc1",
  "baselineIndexCssBytes": 683218,
  "baselineIndexCssGzipBytes": 79124,
  "baselineIndexCssSha256": "7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61",
  "p111CompiledIndexCssBytes": 682990,
  "p111CompiledIndexCssGzipBytes": 78457,
  "p111CompiledIndexCssSha256": "429ff06f63bbfd6852917608d3737c8654d4bfe88571ea4ef2530270c1439175",
  "residualFormatDeltaBytes": -228,
  "hexoVersion": "7.3.0",
  "hexoInjectedStylusVars": [
    "$highlight_enable",
    "$highlight_line_number",
    "$prismjs_enable",
    "$prismjs_line_number"
  ],
  "hexoInjectedStylusVarValues": {
    "$highlight_enable": true,
    "$highlight_line_number": true,
    "$prismjs_enable": false,
    "$prismjs_line_number": true
  },
  "themeConfigTopLevelKeys": 133,
  "themeConfigRecursiveMappingKeys": 662,
  "commentedOutConfigKeys": [
    "theme_color.button_hover",
    "theme_color.blockquote_padding_color",
    "theme_color.blockquote_background_color"
  ],
  "objectValuedConfigKeys": ["theme_color", "hr_icon"],
  "upstreamFiles": {
    "examples/blog/src/styles/upstream/index.styl": "5cd84ef7be022401257a19c171d48813f604007fd02d6508128d89d9b4d141b8",
    "examples/blog/src/styles/upstream/var.styl": "bd1ff3f89e87059d594024e6c0d0e6959ce25efbc11d756bcef74bc29e8454a0",
    "examples/blog/src/styles/upstream/_highlight/highlight.styl": "e7e7dc818b42d140532c22cfa9922c0e3f6f84f5b60ecc90ceb59f0c711b943f",
    "examples/blog/src/styles/upstream/_highlight/theme.styl": "73acf393a4c211608ec57905cadde41c4b089a4478098ad9e4ae40c58d0fcb14",
    "examples/blog/src/styles/upstream/_highlight/prismjs/index.styl": "a5f0f419bbea300e43f015e3c0bca8115bb7ed067aa17c19a17ebaa8bf99569a",
    "examples/blog/src/styles/upstream/_highlight/prismjs/line-number.styl": "dfe9205a5426537f59b0b44739ffdf56eea4b0c4d61aec6b86938118945331a6",
    "examples/blog/src/styles/upstream/_highlight/prismjs/diff.styl": "0144c894e2095fabb2ad9488687145e47f47531e49a21910d97c697d5e560850",
    "examples/blog/src/styles/upstream/_mode/readmode.styl": "ea44d8a95bdd39e26d0142aab55fe15095b37f3f445202b6ffee464874bd70e1",
    "examples/blog/theme.config.yml": "bd0bd629ff6903ce036b136e0b1d058f595b56aeba6ae4c3eb9448900e1a9d2c"
  }
}
```
<!-- upstream-delta:end -->

---

## 6. CI 校验脚本

`scripts/check-upstream-delta.mjs`（根 `package.json`：`"check:upstream-delta": "node scripts/check-upstream-delta.mjs"`，CI 里建议放在 `pnpm verify` 之后作为独立步骤，只加不改现有步骤）。

检查分组：

| 组 | 检查 | 失败含义 |
| --- | --- | --- |
| 1 | `readmode.styl:104` / `:120` 行内容 | 有人改了上游笔误或对照行 → 视觉/基准会漂移 |
| 2 | `docs/baseline.json` 的 commit/version/bytes/gzip/SHA 与锚点一致 | 基准摘要被改而登记表没跟 |
| 2b | P1-11 字节闭环：683218 + (−228) = 682990 | 登记表数字自相矛盾（旧 P1-5 口径 686772 已作废） |
| 2c | `docs/notes/P-upstream-delta.md` 的报告数字与锚点一致 | 报告和登记表漂移（注：该报告是 P1-11 修复前的历史报告） |
| 3 | 9 个上游关键文件的 SHA-256 | 镜像被格式化/换行归一化/手改 |
| 4 | 上游 styl 树里四个 Hexo 注入变量仍零赋值、`if $prismjs_enable` 守卫仍在 | U3/D9 的「变量只能来自 define 层」前提被破坏 |
| 4c | **插件必须注入 4 个 define 变量**：动态 import 插件、展开上游 `index.styl`，断言 4 行赋值与值 | define 层被删/改 → D9 回归（prismjs 分支复活，+3782 B） |
| 4b | `theme.config.yml` 133/662 键、3 个注释键不存在、2 个对象键仍是对象 | 配置语义被「补全」 |
| 5 | `.baseline-work` 的 hexo 7.3.0（仅本地；CI SKIP） | 换机器重跑基准时版本漂了 |

脚本只读、不依赖构建、不需要 `_research` 副本；`yaml` 缺失时 4b 降级 SKIP（根 `node_modules` 里已 hoist，正常 CI 不会触发）。

---

## 7. 变更流程

1. 想改上游镜像/基准/决策 → 先改本表正文与 §5 锚点；
2. 跑 `node scripts/check-upstream-delta.mjs`；
3. 如果锚点必须变（例如 P1-11 关闭 D9、Phase 7 开压缩），在提交信息里写清「为什么基准数字变了」，并把 PLAN §1.4 的对应条目状态一起改。

> 上游若发新版本：另起分支重跑 P1-6 基准，出新基线前本表与整个基准体系保持 1.7.1 / `72439d93` 不动。
