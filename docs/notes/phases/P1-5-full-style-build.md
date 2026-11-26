# P1-5 全量样式编译（上游 source/css 全量 → Astro 产物）归档报告

- 复核人：p15-report（组员）
- 复核时间：2026-11-23 18:26–18:30（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（HEAD 未做任何写操作，本报告为唯一新增文件）
- 复核方式：全部数据在本机重跑一遍，命令与原始输出见下

## 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| 构建 | **绿**，exit 0，3.31s，1 page | `pnpm --filter blog build`（下文 §1） |
| 产物 CSS | `examples/blog/dist/_astro/index.DVFB5Y3m.css`，**686772 字节** | `Get-Item` / `fs.readFileSync` |
| gzip(level 9) | **79071 字节**（与 verify 同实现：`node:zlib gzipSync(cssBuffer,{level:9})`） | verify-css.mjs:127 与独立 node 测量一致 |
| SHA-256 | `1319c726c715d66ed3c7e44f400e94d84d2268a245fa0d95631c1d6001155b07` | `Get-FileHash -Algorithm SHA256` |
| verify | **PASS 字节数 +0.52% / PASS gzip -0.07% / WARN SHA 不一致（不判失败）** | `node scripts/verify-css.mjs` 原文 §2 |
| 与上游差 | **+3554 字节、+0.52%**（686772 vs 683218），gzip 反而小 53 字节 | §2 / §4 |
| 残留 `@import` | **0 处** | §3 |
| 上游 hexo-config | **179 处 / 102 个唯一键**，与插件日志 102 键完全对上 | §4 |
| 构建告警 | 11 条：插件 info 10 条（7 truthy-object + 3 缺失键）+ vite WARN 1 条（`/img/comment_bg.png`） | §5 |

**一句话**：构建可重复、体积/gzip 双 PASS、无残留 `@import`、配置键数量自证闭环；SHA 不一致的原因是产物里多出 34 条上游没有的 prismjs 样式规则（约等于 +3554 字节），属格式/内容差异而非语义回归，P1-5 可判通过（判据见末节）。

> **勘误提示（2026-11-23 追加）**：本报告 §6.4 的「Stylus 未定义变量在 `if` 里当假」结论已被实测推翻（实为**真**），§8.1 / §9 的「prismjs 来源未定位」判断也已定位；「+3554 B ≈ 34 条 prismjs 规则」的归因需精确拆分为 **prismjs +3782 B − `@css{}` 排版 228 B**。正文保留原件、过期句已加删除线，**以文末「## 勘误」为准**。

---

## 1. 构建复核

命令（仓库根）：

```powershell
cd D:\Git-project\astro-theme-anzhiyu
pnpm --filter blog build
```

末尾 10 行（原始输出）：

```
18:26:12 [vite] ✓ built in 28ms
18:26:12 [build] Rearranging server assets...

 generating static routes 
18:26:12   ├─ /index.html (+24ms) 
18:26:12 ✓ Completed in 45ms.

18:26:12 [build] ✓ Completed in 3.16s.
18:26:12 [build] 1 page(s) built in 3.31s
18:26:12 [build] Complete!
```

exit code 0。与组长实测一致（组长记录 18:2x 构建成功、产出文件名 `index.DVFB5Y3m.css`；本次重建哈希一致，说明构建可重复）。

字节/gzip/SHA 复核命令与输出：

```powershell
$css='D:\Git-project\astro-theme-anzhiyu\examples\blog\dist\_astro\index.DVFB5Y3m.css'
$bytes=[IO.File]::ReadAllBytes($css)
"BYTES: $($bytes.Length)"
"GZIP(GZipStream Optimal): ..."   # .NET 实现，见下方说明
" SHA256: $((Get-FileHash $css -Algorithm SHA256).Hash.ToLower())"
```

```text
BYTES: 686772
SHA256: 1319c726c715d66ed3c7e44f400e94d84d2268a245fa0d95631c1d6001155b07
```

gzip 口径说明（重要）：`verify-css.mjs:127` 用的是 `gzipSync(cssBuffer, { level: 9 })`。用同一实现独立测量得到 **79071 字节**（与 verify 打印值逐字节一致）。不同实现的数字不能混比：node zlib 默认等级得 80637，.NET `GZipStream(Optimal)` 得 79971 —— 这正对应 verify 脚本自己的注释「baseline 与本脚本的 zlib 版本/压缩等级可能不同，容差 ±5%」（verify-css.mjs:10）。本报告一律以 **79071 / 79124** 这对同口径数字为准。

## 2. verify 原文

```powershell
cd D:\Git-project\astro-theme-anzhiyu
node scripts/verify-css.mjs
```

```text
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\index.DVFB5Y3m.css
[verify-css] PASS 字节数: 实际 686772 / baseline 683218（+0.52%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 79071 / baseline 79124（-0.07%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）：实际 1319c726c715d66ed3c7e44f400e94d84d2268a245fa0d95631c1d6001155b07 / baseline 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
[verify-css] 比对通过
```

baseline 来源可追溯：`docs/reference/baseline.json` 的 `css.indexCssBytes=683218 / indexCssGzipBytes=79124 / indexCssSha256=7c1b1ec0…`，与 `docs/notes/phases/P1-6-baseline.md:321-324` 记录的 `.baseline-work/public/css/index.css`（hexo g 产物）一致。

## 3. 产物残留 `@import`

```powershell
$m = Select-String -Path ...\dist\_astro\index.DVFB5Y3m.css -Pattern '@import' -AllMatches
```

```text
lines containing @import: 0
total @import occurrences: 0
```

判定：`examples/blog/astro.config.mjs:32-36` 的 `stylus: { 'include css': true }` 生效，上游 `source/css` 里所有 `.css` 的 `@import` 都被字面内联，产物不存在浏览器运行时才去拉取的 `@import`。与 hexo-renderer-stylus 的 `.set('include css', true)` 行为一致。另查产物中 `@css` 字面量残留也为 0，说明 Stylus 的 literal-CSS 块已被正常展开。

## 4. 根因与修法（上游 bug 证据）

上游 bug 原文，`examples/blog/src/styles/upstream/_mode/readmode.styl`：

```text
 104:         background: var(--highlight-bg) !important
 ...
 120:           background: var(-highlight-bg) !important
```

- 104 行正确 `var(--highlight-bg)`；120 行少一个横杠，写成 `var(-highlight-bg)`。
- 浏览器解析 CSS 自定义属性时遇到非法 token 会**静默丢弃该条声明**，所以上游 `hexo g` 不报错、日志零 WARN/ERROR，视觉上这条 read-mode 代码块背景从来没生效过。
- 本项目的 CSS 管线在 Vite 里走 lightningcss 严格解析，直接让整个构建失败：`[lightningcss minify] Unexpected token Ident("-highlight-bg")`。
- **不修上游**的理由：修了会让 read-mode 代码块背景真的生效，与上游实际视觉不一致；P1 验收要求对齐上游（包括上游的 bug）。故改配置，`examples/blog/astro.config.mjs:27` 关掉 CSS 压缩 `cssMinify: false`，并在 :8-26 写了完整长注释说明两个原因（上游笔误 + 基准是未压缩产物 683218 字节，压缩后差 30% 必然超 ±5% 阈值）。
- 压缩不丢：按 PLAN 挪到 Phase 7，届时比对用未压缩产物、另立「压缩后体积」独立预算。

## 5. 全量编译数据

入口：`examples/blog/src/pages/index.astro:3` → `import '../styles/upstream/index.styl'`。
插件日志（原始）：

```text
[stylus-hexo-config] index.styl: 102 个配置键, 展开 150 个文件
```

`hexo-config` 覆盖度复核（对 `examples/blog/src/styles/upstream` 下全部 72 个 `.styl` 逐行正则统计）：

```powershell
# 总计
styl files: 72
hexo-config( occurrences total: 179
# 单引号 169 + 双引号 10（pagination.styl:25/72/117、post.styl:201、homepage.styl:65/148/160/171 用双引号）
quoted occurrences: 179
unique keys: 102
```

结论：
- **179 处 `hexo-config(` 与组长给的 179 完全对上**；其中按引号分：单引号 169、双引号 10，合计 179。
- **行首注释中的 `hexo-config(` 为 0 条**（`//`、`/*` 开头的行里没有命中；因此 179 全部是有效调用，无需扣减）。未逐字符展开跨行块注释做二次确认，但统计口径为「命中行的首个非空字符是注释符」才算注释行，跨行注释内如果出现 `hexo-config(` 会有极少漏计风险；量级不足以影响 179↔102 的闭环。
- **唯一键 102 个**，与插件日志「102 个配置键」**逐一数量吻合**——这同时反向证明 179 处调用被完整解析、没有静默跳过（否则键数会少）。
- 同一批 179 处里出现 `hexo-config('theme_color')` 这类取对象再取子键的模式，因此「179 调用 → 102 键」是正常折叠。

## 6. 与上游 683218 的差异来源分析

复核用的上游产物是 P1-6 留下的真实 `hexo g` 输出：`.baseline-work/public/css/index.css` = 683218 字节（与 baseline.json 一致），两侧可比、不是猜的。

**6.1 结构计数（同口径：两侧都用 `[IO.File]::ReadAllText`，字符数非字节数，故绝对值略小于文件字节）**

| 指标 | Astro 产物 | 上游 hexo | 差 |
|---|---|---|---|
| 字节数（真实） | 686772 | 683218 | **+3554 (+0.52%)** |
| gzip(level 9) | 79071 | 79124 | **-53 (-0.07%)** |
| `{` 数（选择器块） | 4157 | 4125 | **+32** |
| `;` 数（声明） | 17598 | 17537 | **+61** |
| `@media` | 224 | 224 | 0 |
| `!important` | 555 | 553 | +2 |
| `var(` | 1281 | 1278 | +3 |
| 物理行数（Get-Content） | 27495 | 27396 | +99 |

**6.2 选择器集合级 diff（node 解析顶层规则、归一化空白后按多重集合比）**

```text
astro top-level rules: 3255   upstream: 3223
selectors with extra count in astro: 34   in upstream: 2
```

- **Astro 独有 34 条**，全部是代码高亮的 prismjs 规则族：
  `#article-container pre[class*='language-'].line-numbers …`（5 条）+
  `pre[class*='language-'] .token.function / .token.comment / .token.punctuation / …`（29 条）。
  源码定位：`examples/blog/src/styles/upstream/_highlight/prismjs/{index,line-number,diff}.styl`。
- **上游独有 2 条**只是同一选择器的空白差异：上游写作
  `#article-container a:not([data-fancybox="gallery"]):not(.headerlink):not(.cf-friends-link):not(.btn-anzhiyu):not( .no-text-decoration )`
  （`:not(` 内多一个空格），Astro 产物里该选择器集合相同、空白归一化后即相等，不算内容差异。
- 32 条净多出的规则 × 平均约 110 字节 ≈ +3500 字节，**这是 +3554 字节的主要、可归因来源**；剩余零头是声明/排版差异（+61 条声明、+2 `!important`、+99 行）。

**6.3 为什么 raw 变大而 gzip 反而变小**

- 新增的 34 条 prismjs 规则高度同构（同一 `pre[class*='language-']` 前缀 + 少量颜色值），压缩率极高；同时两侧选择器换行/`:not( )` 空白等排版细节不同，这部分差异对 gzip 是中性或负贡献。两者叠加即「raw +3554 / gzip -53」。这正好说明差异**不属于语义级重写**：如果是内容替换，gzip 很难不涨。
- 结论：**+3554 字节 = prismjs 高亮规则被纳入产物（约 3.5 KB）+ 少量声明/排版差**；不是 `@css{}` 字面量没展开、也不是尾部/换行硬差异（产物尾部为正常的 `}` + 换行，无 sourcemap 注释、无多余 `@charset`）。（勘误：−228 B 的残差确实来自 `@css{}` 字面量内的「逗号 + 换行」折叠，属空白/排版差而非语义差，见文末「勘误」勘误 2。）

**6.4 待确认点（老实说）**

`_highlight/highlight.styl:29-30` 是 `if $prismjs_enable` → `@require 'prismjs/index'`，而 `$prismjs_enable` 在全部 72 个 styl 里**没有任何赋值**（grep `$prismjs_enable =` 零命中）。~~本地实测 Stylus 对 `if $未定义变量` 的行为是当假、不报错（`stylus.render('if $foo_enable …')` 输出里没有该分支）。~~ 但产物里 prismjs 规则确实存在，说明当前 Vite-Stylus 管线让这个守卫变成了真——~~具体注入来源（插件注入 / stylus 版本差异 / 变量来自别处）尚未定位。~~

**勘误（2026-11-23 追加）**：实测结论相反——**Stylus 未定义变量在 `if` 里当「真」**，所以 `if $prismjs_enable` 必然执行；根因是上游 Hexo 模板脚本 `scripts/events/stylus.js` 注册 `stylus:renderer` filter 后用 `.define()` 注入 4 个变量，我们的插件没复刻这一层（登记为 `docs/reference/upstream-delta.md` U3 = PLAN §1.4 D9，修复任务 P1-11）。这是 §6.2 差异的机制解释缺口，不影响「差 0.52%、verify PASS」的结论，但必须在 Phase 7 前查清（否则将来修 CSS 压缩时这 3.5 KB 会带着走）→ 已定位，详见文末「勘误」。

## 7. 构建期告警逐条

本次构建共 11 条提示，全部原样列出（均为 info 级插件日志或 vite WARN，无一导致失败）：

插件 `[stylus-hexo-config]`（10 条，info，非 error/warn）：
1. `hexo-config('theme_color') 的值是对象/数组，按 truthy 字面量 true 处理（仅用于条件判断时等价）`
2. `hexo-config('hr_icon')` 同上（对象/数组 → truthy）
3. `hexo-config('preloader')` 同上
4. `hexo-config('footer.footerBar')` 同上
5. `hexo-config('dynamicEffect')` 同上
6. `hexo-config('katex')` 同上
7. `hexo-config('local_search')` 同上
8. `hexo-config('theme_color.blockquote_padding_color') 在配置里不存在，按 '' 处理（与 Hexo getProperty 一致）`
9. `hexo-config('theme_color.blockquote_background_color') 在配置里不存在，按 '' 处理`
10. `hexo-config('theme_color.button_hover') 在配置里不存在，按 '' 处理`

判定：8–10 是上游 `_config.yml` 里本来就没写的子键，Hexo 的 `getProperty` 也返回空，属**行为对齐**，不是缺陷；1–7 是插件把对象/数组当布尔用的显式声明，只在条件语境等价，属可接受的降级说明（若未来有 `hexo-config('katex').xxx` 这类取子属性用法需复查）。

vite WARN（1 条）：
11. `[WARN] [vite] /img/comment_bg.png referenced in /img/comment_bg.png didn't resolve at build time, it will remain unchanged to be resolved at runtime`

来源定位：`examples/blog/theme.config.yml:335` → `bg: /img/comment_bg.png`（valine 背景），某处 styl 把它拼进 `url()`，而 `examples/blog` 下**没有 `public/` 目录**（本次实测 `Test-Path public` = false），所以构建期解析不到、按 vite 的设计保留原样交给运行时。属资源管线缺口，不属 CSS 编译缺陷。

## 8. 遗留问题

1. ~~**prismjs 3.5 KB 规则来源未定位**（§6.4）：`$prismjs_enable` 无赋值却进了产物，Phase 7 动压缩/基准前必须查清，否则任何后续 CSS 体积变化都会混进这个噪声。~~ **已定位（2026-11-23 勘误）**：上游 Hexo 用 `.define()` 注入 4 个变量、我们的插件没复刻 + 未定义变量在 `if` 里为真 → prismjs 分支被包含，`+3782 B`（`docs/reference/upstream-delta.md` U3）；修复任务 P1-11。Phase 7 动压缩/基准前仍应先做 P1-11，否则 CSS 体积里会带这个噪声。详见文末「勘误」。
2. **图片资源未 resolve**（§7 第 11 条）：`/img/comment_bg.png` 等绝对路径资源在 `examples/blog` 没有 `public/`，构建期不解析、运行时 404 风险。归资源/页面阶段（Phase 2 或对应 fixture 资源任务）处理，P1-5 不阻塞。
3. **CSS 压缩延后 Phase 7**：`cssMinify:false` 是当前的有意状态（`astro.config.mjs:27`），Phase 7 落地时应让比对基准用未压缩产物、另立压缩后体积预算，而不是回头用压缩产物对 683218。
4. **上游 bug 待记录到 upstream-delta**：`source/css/_mode/readmode.styl:120` 的 `var(-highlight-bg)` 应写进 upstream-delta 清单（不修，仅记录，含 104 行正确写法作对照），避免后续 phase 有人「顺手修好」导致视觉漂移。

## 9. P1-5 判定

**可以判定通过。**

判据（按验收优先级）：
1. **构建必须绿**：`pnpm --filter blog build` exit 0，1 page，产物 CSS 落在 `dist/_astro/` → 满足（§1）。
2. **体积与 gzip 在 ±5% 内**：`verify-css.mjs` 两项 PASS，+0.52% / -0.07% → 满足（§2）。
3. **无残留运行时 `@import`**：产物 0 处 `@import`、0 处 `@css` 字面量残留 → 满足（§3）。
4. **配置覆盖闭环**：上游 179 处 `hexo-config(` 全部有效（0 条在注释行）→ 102 个唯一键，与插件日志 102 键逐一吻合 → 满足（§5）。
5. **差异可解释**：+3554 字节 ≈ 34 条上游没有的 prismjs 规则（≈3.5 KB）+ 少量声明/排版差，SHA 不一致是**预期内**且 verify 明确不判失败（verify-css.mjs:12 注释）→ 满足（§6）。（勘误：精确口径为 prismjs **+3782 B** − `@css{}` 排版 **228 B**，见文末「勘误」；判据本身不变。）

不构成通过阻碍的观察项：~~prismjs 注入机制未定位（§6.4/§8.1）~~（2026-11-23 勘误：已定位为上游 `.define()` 层未复刻，见文末「勘误」）、`/img/comment_bg.png` 构建期未 resolve（§7/§8.2）——两者都有明确归属和后续 phase 承接，不属于 P1-5 的验收面。若后续 Phase 7 引入 CSS 压缩，基准口径必须同步调整（§8.3），否则本条 PASS 会退化成假阴性。

## 10. 实现与提交证据（只读 git 查询，无写操作）

复核时 HEAD = `dcbd4a86b47c724879f63d99fc49e0b24f0e790e`，工作树相对 HEAD 无任何源码改动（`git diff HEAD --stat` 输出为空）；`git status --short` 仅有本报告与既有的未跟踪目录 `packages/astro-theme-anzhiyu/`（后者非 P1-5 产物）。

P1-5 相关提交（`git log --oneline`）：

```text
dcbd4a8 fix: 关闭 CSS 压缩以匹配上游未压缩基准，记录上游 readmode 非法自定义属性
d355201 feat: 全量编译上游 302KB Stylus 并补齐 nib/纯 CSS import 兼容
```

`git show --stat dcbd4a8`（本次修复，仅配置 + 忽略项）：

```text
 .gitignore                     |  3 +++
 examples/blog/astro.config.mjs | 19 +++++++++++++++++++
 2 files changed, 22 insertions(+)
```

`git show --stat d355201`（插件/依赖补齐，尾部摘要）：

```text
 .../vendor/nib/lib/nib/vendor.styl                 |  516 ++++
 .../vendor/nib/lib/nodes/vendor-helpers.js         |   79 ++
 158 files changed, 22583 insertions(+), 93 deletions(-)
```

插件实现位置：`packages/vite-plugin-stylus-hexo-config/src/index.mjs`，nib 以 vendor 方式内置于 `packages/vite-plugin-stylus-hexo-config/vendor/nib/`（含 `lib/nodes/vendor-helpers.js`，供 nib 的 `@import 'nib'` 与 `add-property` 使用）。

源体积（`examples/blog/src/styles/upstream` 实测）：

```text
styl files=72 bytes=309549  css files=47 bytes=171566
```

即 72 个 Stylus（约 302 KB）+ 47 个纯 CSS（约 168 KB）全量参与编译，产物 686772 字节（约为源码合计 481115 字节的 1.43 倍，符合「纯 CSS 字面内联 + Stylus 展开」的体积关系，无异常膨胀）。

过程中解决的三类报错（归类存档；本报告复核的是最终态，前两类依据 d355201 提交内容与插件结构确认，第三类有构建期原始报错文本为证）：

| # | 报错族 | 修法 | 落点 |
|---|---|---|---|
| 1 | `@import 'nib'` 无法解析（缺 nib 依赖） | vendored nib 随插件发布 | `packages/vite-plugin-stylus-hexo-config/vendor/nib/`（d355201） |
| 2 | 上游 `_third-party/*.css`、`_extra/**/*.css` 纯 CSS `@import` 不内联 | Stylus 选项 `'include css': true`（插件注入 + 配置显式声明） | `astro.config.mjs:32-36`；产物 `@import` 残留 0（§3） |
| 3 | `[lightningcss minify] Unexpected token Ident("-highlight-bg")`（上游 readmode.styl:120 笔误） | 关 CSS 压缩 | `astro.config.mjs:27` `cssMinify: false`（dcbd4a8） |

复现性：在 HEAD 上重跑构建，产物文件名与 SHA-256 与组长实测逐字节一致（`index.DVFB5Y3m.css` / `1319c726…5b07`），说明该结论不依赖本地缓存。

---

## 勘误（2026-11-23 追加）

本报告是 2026-11-23 归档的历史记录，正文保留原样；以下条目已被后续实测推翻或修正，过期句子在正文里用 ~~删除线~~ 标出并指向本节。**结论以本节为准**，完整证据见 `docs/reference/upstream-delta.md` §3 与 `docs/notes/topics/P-upstream-delta.md` §2。

### 勘误 1：§6.4 的「Stylus 未定义变量在 `if` 里当假」——结论反了（这是 D9 的根因）

- **原文（错误）**：§6.4 写「本地实测 Stylus 对 `if $未定义变量` 的行为是当假、不报错」。
- **实测（正确）**：**Stylus 0.64.0 的未定义变量在 `if` 里为「真」、不报错**；只有在 `&&` 二元运算里才当假。最小复现原文：

  ```text
  if $foo_undefined …           → ".yes { color: #f00; }"         ← 未定义在 if 里为真
  $bar = $foo && !$baz && true  → ".x { y: false; }"               ← 在 && 里为假
  if $prismjs_enable（不赋值）   → ".prism-rule { … } .tail { … }"  ← 守卫被执行
  if $prismjs_enable（= false）  → ".tail { … }"                    ← 赋值 false 才不进
  ```

- **影响**：这条错误正好掩盖了 D9 的根因。既然未定义在 `if` 里为真，`if $prismjs_enable` 分支就必然被包含——产物里多出 prismjs 规则既不需要「谁注入」，也不是「未定义却进了产物」的异常。
- **根因（已定位）**：上游 Hexo 主题脚本 `scripts/events/stylus.js` 注册 `stylus:renderer` filter，用 `.define()` 注入 4 个变量（`$highlight_enable` / `$highlight_line_number` / `$prismjs_enable` / `$prismjs_line_number`；Hexo 7 下由 `syntax_highlighter` 决定取值）。我们的 Vite 插件只复刻了 `hexo-config()` 和 import 展开，**没有复刻 define 层** → 4 个变量在 72 个 styl 里零赋值 = 全部未定义 = 在 `if` 里全为真。基线站点是 `syntax_highlighter: highlight.js`（上游 `$prismjs_enable=false`），我们这边为真 → prismjs 分支被错误包含。
- **登记与修正**：`docs/reference/upstream-delta.md` U3（= PLAN §1.4 D9）；修复任务 **P1-11「复刻 Hexo define 层」**，按上游 filter 原始逻辑注入 4 个变量（默认 `highlight.js` → `$prismjs_enable=false`）。本阶段不修（会重算基准），关闭判据：CSS 686772 → 682990 B、prismjs 规则族消失。

### 勘误 2：§6.1–§6.3 / §9 的 +3554 B 归因——精确拆分与字节闭环

- **原文（不精确）**：结论速览「一句话」与 §6.3 把 +3554 B 主要归给「34 条 prismjs 规则 ≈ +3554 字节」；§6.4 说注入来源未定位。
- **修正后的字节闭环**（用真实插件展开上游 `index.styl` 后 `stylus.render` 复现，与当日 dist 产物字节数 + SHA 逐字节一致）：

  ```text
  baseline (hexo g)                   683218
  expanded 原样（= 当前管线）          686772   （+3554）
  expanded + $prismjs_enable = false  682990   （−228）
  ```

  即 **+3554 B = prismjs 分支 +3782 B − `@css{}` 排版差 228 B**。其中 +3782 B 对应 32 个规则块（与 §6.1 的 `{` 计数 +32 完全对上）；§6.2 的「34 条」是选择器级 multiset 口径，两者不矛盾——**字节口径以 3782 / 228 为准**。
- **−228 B 的机制**：`docs/reference/upstream-delta.md` U6——插件把纯 CSS 包进 `@css{}` 字面量后，Stylus 词法器把「逗号 + 换行」折叠成 `,\r`，与 Hexo 的 literal import 路径无法逐字节对齐；视觉无影响，Phase 7 才处理。
- **对验收的影响**：「构建可重复 / verify 双 PASS（+0.52% / −0.07%）/ P1-5 通过」的结论**不变**；受影响的是 SHA 不一致的归因与 Phase 2/7 的基准口径——不能再用「≈34 条规则」当解释。

### 勘误 3：§8.1 与 §9 的「prismjs 来源未定位」——已关闭

`$prismjs_enable` 的来源已定位（见勘误 1），后续动作从「查来源」变为「P1-11 复刻 define 层」；§9 的 P1-5 判定与 verify PASS 结论维持不变。
