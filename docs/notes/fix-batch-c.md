# Batch C · 迁移工具正确性 — 修复报告

- **批次**：Batch C · C1–C5（迁移工具正确性）
- **执行**：agent-3（迁移工具组）
- **写范围**：`scripts/migrate-hexo.mjs`、`scripts/diff-html.mjs`（仅 C4 豁免逻辑区 + `--verbose` 输出）、`docs/MIGRATION.md`（仅 C1 DST 限制登记，见「审查修正」）、本报告。
- **未触碰**：`examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml`（SHA 守卫，`git diff --stat` 仅两个脚本 + MIGRATION.md 变动）；`scripts/diff-html.mjs` 的 `:1445`（USAGE 退出语义）/`:1519-1531`（`runAll` skip 退出）属 D1，本批零改动（见文末 git diff 佐证）。

---

## 0. 一句话结论

| ID | 状态 | 摘要 |
|---|---|---|
| C1 (M2) | **done**（GMT→0 全实现断言；DST=**登记限制**） | 裸 `GMT`/`UTC` 记 0，不再回落 +08；`timezoneOffsetMinutes(tz, at)` 支持按文章日期现场换算；DST 因 content.config.ts 单常量 + 模板不在写范围，登记至 MIGRATION.md §13.2 |
| C2 (M3) | **done** | `postHref` 对 `.html/.htm` 末段不加尾斜杠，收口到同一规则 `applyPermalinkTrailingSlash`；两侧同形 URL |
| C3 (M4) | **done** | `parsePostDateParts` 正则 `[-/]` 双分隔符；fallback 改告警返回 `null`，不再伪造 1970 |
| C4 (M5) | **done** | N21 豁免 `id` 收集/删除/剥离跳过 `pre/code/textarea`，删宽泛 `inlineArtifact` 收集（内联 id 仅摘要容器）；`--verbose` 输出已收集 id；新 FAIL 风险→待 CI |
| C5 (L12) | **done** | twikoo.styl 修正 warning/日志移进 `if (!DRY)`，dry-run 措辞改「将修正…」；`--dry-run` 零「已修正」 |

无 deferred 条目。C1 的 DST 半项按 FIXPLAN 明示的「或至少登记限制到 MIGRATION.md」选项落地，非延期。

---

## 1. C1（M2）时区：GMT→0 + DST

**最终实现位置**
- `scripts/migrate-hexo.mjs:243-270`（`timezoneOffsetMinutes(tz, at)`，新增 `at` 参数 + 裸 GMT 记 0）。
- `scripts/migrate-hexo.mjs:2652-2672`（消费点：写 `SITE_UTC_OFFSET_MINUTES`，新增冬/夏 DST 检测 `hasDST`）。

**关键改动（证据）**

```js
// scripts/migrate-hexo.mjs:243
function timezoneOffsetMinutes(tz, at = new Date('2024-06-01T00:00:00Z')) {
  ...
  const match = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/.exec(label)   // 偏移段整体可选
  if (!match) return null
  if (!match[1]) return 0          // 裸 GMT / GMT+0 → 0（不再回落 +08:00）
  ...
}
```

```js
// scripts/migrate-hexo.mjs:2653-2656（消费点）
const offset = timezoneOffsetMinutes(tz)
const winterOffset = timezoneOffsetMinutes(tz, '2024-01-01T00:00:00Z')   // 不再固定采 6/1
const hasDST = offset !== null && winterOffset !== null && offset !== winterOffset
```

**裸 GMT 修复**：旧正则 `/GMT([+-])(\d{1,2})(?::(\d{2}))?/` 要求 `±` 数字；某些 ICU 版本对 UTC 的 `shortOffset` 只返回裸 `GMT`，旧正则不匹配 → 返回 `null` → 消费点回落 `+08:00` → UTC 站日期被平移 8h。新正则把偏移段设为可选，裸 `GMT` → `0`。

**UTC 用例验证输出**（`node` 纯函数级，脚本 `%TEMP%\batchc-verify.mjs`，抽取 `timezoneOffsetMinutes` 真源 eval 断言）：

```
===== C1 时区 =====
PASS timezoneOffsetMinutes(UTC) = 0（不再回落 +08:00） => 0
PASS timezoneOffsetMinutes(GMT) = 0 => 0
PASS timezoneOffsetMinutes(Etc/GMT) = 0 => 0
PASS timezoneOffsetMinutes(Asia/Shanghai) = 480 => 480
PASS NY 冬 2024-01-01 = -300 => -300
PASS NY 夏 2024-07-01 = -240 => -240
裸 GMT label "GMT": 旧正则 match=null（null→旧回落 +08）; 新正则 match[1]=undefined（undefined→0）
PASS UTC fixture 日期（offset=0）不平移 => "2024-01-15T09:30:00.000Z"
  （旧 +08 兜底会平移成 2024-01-15T01:30:00.000Z，即 -8h）
```

`--dry-run` 消费点实跑（UTC fixture，`node scripts/migrate-hexo.mjs --site %TEMP%\c5fx --dry-run`）：

```
✓ timezone UTC → UTC+0.00，已写入 content.config.ts
```

即 UTC 站 `SITE_UTC_OFFSET_MINUTES = 0`，`parseHexoDate` 的 `value.getTime() - 0` 不平移日期（旧逻辑会写 480 → 平移 8h）。

**DST 处理方式（二选一）：登记限制。**

理由（审查修正，以代码实态为准）：迁移产物 `content.config.ts` 的 `parseHexoDate` 用单一 `SITE_UTC_OFFSET_MINUTES` 常量把「墙上时间」还原为 UTC 瞬时；DST 时区该偏移随日期变化，单常量无法表达。真·per-date 需改 `examples/blog/src/content.config.ts` 的 `parseHexoDate`（不在本批写范围），或由 `migrate-hexo.mjs` 对生成模板做 per-date 注入——但注入无法本地 build 验证（本地禁跑 `astro build`），且属日期管线高风险改动，按「验证后再声称完成 / 不做危险未验证改动」原则不做。故：
- `timezoneOffsetMinutes(tz, at)` 已具备 per-date 能力（断言 NY 冬 -300 / 夏 -240，见上）；
- 消费点检测 `hasDST` 并告警；
- 限制登记至 `docs/MIGRATION.md §13.2 第 7 条`（详见「审查修正」）。

> 若后续要「全实现断言」：把生成的 `content.config.ts` 的 `- SITE_UTC_OFFSET_MINUTES * 60_000` 换成 `- siteOffsetMinutesAt(wallMs) * 60_000`（`Intl.DateTimeFormat` 按该日期取 offset，两遍逼近处理 DST 边界），`timezoneOffsetMinutes(tz, at)` 已可复用。属后续项，本批登记限制。

---

## 2. C2（M3）postHref 尾斜杠收口

**是否收口成同一函数**：收口到**同一规则函数 `applyPermalinkTrailingSlash`**，因分属两个运行时无法字面共用同一函数对象（见下「审查修正」），规则逻辑逐字一致、交叉注释锚定。

**实现位置**
- `scripts/migrate-hexo.mjs:1124-1126`（迁移侧 `applyPermalinkTrailingSlash(rendered)`）。
- `scripts/migrate-hexo.mjs:1156`（`createPostPathResolver` 改调 `applyPermalinkTrailingSlash(rendered)`，删本地 `/\.html?$/i` 内联判定）。
- `scripts/migrate-hexo.mjs:3049-3051`（生成的 `post-permalink.ts` 内同名 TS helper，`postHref` 走 `/${applyPermalinkTrailingSlash(segments.join('/'))}`）。

**.html 用例两侧产出字符串对比**（纯函数级，抽取 `createPostPathResolver` + `applyPermalinkTrailingSlash` 真源 eval）：

```
===== C2 postHref / resolver 尾斜杠 =====
resolver(.html) 产出 = "2024/01/15/hello.html"
postHref(.html) 产出 = "/2024/01/15/hello.html"
resolver(dir)   产出 = "2024/01/15/hello/"
postHref(dir)   产出 = "/2024/01/15/hello/"
PASS resolver .html 无尾斜杠 => true
PASS postHref .html 无尾斜杠 => true
PASS resolver dir 有尾斜杠 => true
PASS 两侧 .html 尾斜杠形态一致（去前导 / 后同串） => true
```

说明：`postHref` 带前导 `/`（站点绝对路径，归档/分类链接用），`createPostPathResolver` 不带（`random.js` 拼 root 用，与 Hexo `post.path` 同形）——前导斜杠是既有约定差异；**尾斜杠形态两侧一致**（`.html` 均无、目录型均有），即同形 URL。`.html` permalink fixture 两侧产出 `…/hello.html`（不再出现旧 bug 的 `…/hello.html/`）。

---

## 3. C3（M4）日期正则对齐 + fallback 告警

**实现位置**：`scripts/migrate-hexo.mjs:1097-1117`（`parsePostDateParts`）；调用方 `createPostPathResolver:1148`、`timestampOf:3261` 做 `null` 兜底。

**改动**：日期分隔符 `-(\d{1,2})-(\d{1,2})` → `[-/](\d{1,2})[-/](\d{1,2})`（对齐 `content.config.ts` 的 `hexoDate` `[-/]`）；fallback 由 `return {year:1970,…}` 改为 `console.warn(...) + return null`（不伪造 1970）。

**三个用例解析结果**（真源 eval 断言）：

```
===== C3 parsePostDateParts =====
PASS parsePostDateParts('2024/01/15') => {"year":2024,"month":1,"day":15,"hour":0,"minute":0,"second":0}
PASS parsePostDateParts('2024-01-15') => {"year":2024,"month":1,"day":15,"hour":0,"minute":0,"second":0}
PASS parsePostDateParts('2024/01/15 09:30:45') => {"year":2024,"month":1,"day":15,"hour":9,"minute":30,"second":45}
parsePostDateParts('not-a-date') => null  (null + console.warn，不伪造 1970)
PASS parsePostDateParts('not-a-date') 返回 null（非 1970） => null
```

- `2024/01/15` → `{year:2024, month:1, day:15, …}` ✅（旧正则只认 `-` 会回落 1970）
- `2024-01-15` → `{year:2024, month:1, day:15, …}` ✅
- 非法日期 `not-a-date` → `null` + `console.warn("[migrate] 无法解析日期 …，跳过日期段（不再伪造 1970）")`，不再伪造 1970 ✅

调用方兜底（不 crash、不传 undefined）：
- `createPostPathResolver`（`scripts/migrate-hexo.mjs:1148`）：`parsePostDateParts(post.date) ?? {…迁移时刻日期段…}`，保证 URL 无 `undefined`（parsePostDateParts 已告警）。
- `timestampOf`（`scripts/migrate-hexo.mjs:3261-3266`）：`if (!parts) return 0`（仅排序键，垫底，不伪造 1970）。

---

## 4. C4（M5）N21 豁免收紧

**实现位置**：`scripts/diff-html.mjs:687-762`（`stripUnrenderedHeadingArtifacts`）；`--verbose` 输出接线 `:1327`（收集）/`:1358`（入 report）/`:1429-1437`（printDiagnostics）。

**判别条件（pre/code/textarea 跳过的实现方式）**：
```js
// scripts/diff-html.mjs:692
const isCodeLike = (tag) => tag === 'pre' || tag === 'code' || tag === 'textarea'
```
- **id 收集（visit）**：`if (isCodeLike(node.tag)) return`——整个 `pre/code/textarea` 子树不进收集；正文只收「整段字面量」`textArtifact`（`^#{1,6}\s+([A-Za-z][\w-]*)$`），内联 id 只在首页摘要容器 `isHomeExcerptText` 内收集（删掉了原先对任意文本的宽泛 `inlineArtifact` 收集）。
- **删除（drop）**：`if (child.type === 'element' && isCodeLike(child.tag)) continue`——跳过整棵 `pre/code/textarea`，其内 `## word` 文本与 `h*` 不删。
- **首页摘要剥离（stripInline）**：同样 `isCodeLike` 跳过。

净效果：代码块里的 `## word` 是字面量，不再进 id 集，两侧真实 `<h# id="word">` 不被牵连删除。

**`--verbose` 的 id 输出格式**（`printDiagnostics` 实跑捕获）：

```
  · N21 豁免收集 id（2）: sitegroup, videos
  · baseline: 节点 10，注释 1，站内 origin http://x
  · baseline 警告: w1
  · N21 豁免收集 id: （无）
```

格式：非空 → `  · N21 豁免收集 id（<个数>): <id 以", "连接>`；空 → `  · N21 豁免收集 id: （无）`。id 也进 `report.n21ExemptIds`（`--json` 可审计）。

**真源逻辑断言**（mock 树 eval）：

```
===== C4 N21 豁免收紧 =====
代码块含 ## word → 收集 id = []（不含 word）
PASS 代码块不牵连真实标题（收集 id 不含 word） => false
PASS 代码块 ## word 字面量未被删 => "## word"
PASS 两侧真实 h2#word 均保留 => true
正文整段 ## videos → 收集 id = ["videos"]
PASS 形态1 收集 videos => true
PASS 形态1 删基线 literal => 0
PASS 形态1 删两侧 h2 => 0
首页摘要内联 ## sitegroup → 收集 id = ["sitegroup"]
PASS 形态2 收集 sitegroup => true
PASS 形态2 剥 ## 前缀 => "hello sitegroup world"
```

**新 FAIL 风险评估**：收紧豁免会缩小 N21 的「吃差异」范围——原先被宽泛 `inlineArtifact` 误收进 id 的正文 `## word`，不再牵连删除两侧真实标题；`pre/code/textarea` 内字面量不再触发豁免。这使**代码块/正文里本不该被豁免的真实差异重新暴露为 FAIL**，属预期口径收紧，但净增/净减 FAIL 数依赖真实基线，本地无法跑 `astro build` 比对。**→ 待 CI 重跑 `diff-html --all`，若有新 FAIL，按 `docs/upstream-delta.md` §7 流程判定是真回归还是口径调整，不许直接洗白**（FIXPLAN C4 注意项）。风险点：原靠宽泛收集「碰巧」豁免掉的页面可能转 FAIL；形态 1/形态 2 的既有豁免已保留（断言见上），理论影响面限于「代码块 + 跨形态误收集」。

---

## 5. C5（L12）twikoo.styl dry-run 措辞

**实现位置**：`scripts/migrate-hexo.mjs:2728-2750`。warning/日志移进 `if (!DRY)`，dry-run 分支改「将修正…」。

**改动**：`warnings.push('…已按等价语义删除…')` 与 `console.log('✓ 修正…')` 移入 `if (!DRY)`；新增 `else { console.log('· [dry-run] 将修正上游 twikoo.styl …') }`。

**`--dry-run` 输出全文（相关段）+ 零「已修正」验证**（`node scripts/migrate-hexo.mjs --site %TEMP%\c5fx --dry-run`，exit 0）：

```
[dry-run] copy  src/styles/upstream/_third-party/twikoo.styl  <- examples/blog/src/styles/upstream/_third-party/twikoo.styl
· [dry-run] 将修正上游 twikoo.styl 的 CSS 缩进笔误（仅 Twikoo 站会展开）
```

精确计数（对该 dry-run 全量输出 `Select-String`）：

```
已修正 count = 0
将修正 count = 1
✓ 修正 count = 0
已按等价 count = 0
```

`--dry-run` 输出**零「已修正」字样**、零「✓ 修正」、零「已按等价语义删除」，仅出现 1 处「将修正」措辞。✅

---

## 6. 跑了哪些验证命令（原样输出尾部）

> 本地验证遵守硬约束：未跑 `astro build` / playwright / lighthouse / 任何构建或浏览器验证。命令输出先写 `%TEMP%` 再 `read`（约束 4）。

**① 纯函数级断言**（`node %TEMP%\batchc-verify.mjs`，抽取两脚本真源 eval）——exit 0，全部 PASS：

```
PASS 代码块不牵连真实标题（收集 id 不含 word） => false
PASS 代码块 ## word 字面量未被删 => "## word"
PASS 两侧真实 h2#word 均保留 => true
...
  |   · N21 豁免收集 id（2）: sitegroup, videos
  |   · N21 豁免收集 id: （无）
EXIT=0
```
（完整 45 行见 `%TEMP%\batchc-verify-out.txt`；C1/C2/C3/C4 各断言均 PASS，关键行已在上文各 ID 贴出。）

**② migrate-hexo --dry-run smoke**（UTC fixture `%TEMP%\c5fx`）——exit 0：

```
EXITCODE=0
✓ timezone UTC → UTC+0.00，已写入 content.config.ts
· [dry-run] 将修正上游 twikoo.styl 的 CSS 缩进笔误（仅 Twikoo 站会展开）
```

**③ diff-html CLI smoke**（语法/CLI 解析）——exit 0：

```
用法：
  node scripts/diff-html.mjs <baselineHtmlPath> <distHtmlPath> [选项]
  ...
HELPEXIT=0
```

**④ git diff（只读，确认改动范围 / 未碰 D1 与 SHA 守卫文件）**：

```
 scripts/diff-html.mjs    | 38 +++++++++++++++++---
 scripts/migrate-hexo.mjs | 91 +++++++++++++++++++++++++++++++++++++++---------
 2 files changed, 108 insertions(+), 21 deletions(-)
```
（`docs/MIGRATION.md` 另有 C1 限制登记改动；`git diff scripts/diff-html.mjs` 显示改动仅落在 `stripUnrenderedHeadingArtifacts`/`comparePages`/`printDiagnostics`，**未触及 `:1445` USAGE 与 `:1519-1531` runAll**。）

---

## 7. 「待 F 同步清单」+ 「待 CI 验证清单」

### 待 F 同步清单（文档数字口径，本批一律未改，留 Batch F 统一对齐）

| 原文位置 | 现状 | 目标口径 |
|---|---|---|
| `docs/PLAN.md:61` | 「48 页全量比对，当前 **112 条差异**」 | C4 收紧 N21 豁免后实际差异条数可能变化；Batch F 重跑 `diff-html --all` 后按当前 diff-count 对齐此数 |
| `docs/PLAN.md:44` | 「N21 双形态（正文整段 + 摘要内联）」 | 形态未变，但口径新增「跳过 `pre/code/textarea` + 内联 id 仅摘要收集」；若 F 要求口径数字/描述精确化，补此半句（本批只改代码不改 PLAN 数字） |
| `docs/MIGRATION.md §13.2` | 已知限制由 6 条增至 **7 条**（本批新增 DST 限制） | 若 README/PLAN 有「已知限制 N 条」计数，F 对齐为含 DST 的当前条数（本批未发现显式计数句） |

> 本批未改 README/PLAN 的任何计数/页数/差异条数/skip 数（约束 7 遵守）；上表仅供 F 复核时定位受影响数字。

### 待 CI 验证清单（需构建/浏览器才能确认，本地禁跑）

| 项 | 验收点 | 本地已做 | 待 CI |
|---|---|---|---|
| C1 UTC | UTC 站迁移后文章日期/归档年月不平移 8h | 断言 `offset=0`、`parseHexoDate` 不平移、dry-run 消费点 `UTC+0.00` | 构建后抽查 UTC 站文章发布时间/归档年月与源站一致 |
| C1 DST | 跨夏令时日期不偏移 | 函数层断言 NY 冬夏 offset + 登记限制 | 属**已知限制**（非自动化验收）；DST 站需人工抽查跨季日期，若要自动化需后续 per-date 注入 |
| C2 | `.html` permalink 两侧同 URL、链接不 404 | 断言两侧尾斜杠形态同形（`.html` 无 `/`） | 构建后确认 postHref 链接命中实际路由、不 404 |
| C3 | `date: 2024/01/15` 的 random.js posts 列表链接年月日正确 | 断言 `parsePostDateParts('2024/01/15')=2024/1/15` | 端到端：生成的 random.js 链接 y/m/d 与实际路由一致 |
| C4 | 代码块含 `## word` 页面不牵连两侧真实标题；评估新 FAIL | mock 树断言代码块不收集/不删 + 形态1/2 保留 | 重跑 `diff-html --all`，评估新 FAIL；按 `upstream-delta §7` 判真回归/口径调整；真实基线代码块页验证 |

---

## 「审查修正」节点（FIXPLAN 结论 vs 代码实态，按代码语义实现）

1. **C1「按文章日期现场换算」的可达边界**：FIXPLAN 同时给「现场换算」与「或至少登记限制到 MIGRATION.md」两选项。代码实态是 `content.config.ts` 的 `parseHexoDate` 用**单一 `SITE_UTC_OFFSET_MINUTES` 常量**，且该模板不在本批写范围；真 per-date 只能改模板或注入生成物，均无法本地 build 验证。按「验证后再声称完成 / 不做未验证高风险改动」取**登记限制**，`timezoneOffsetMinutes(tz, at)` 仍做成 per-date 可用并断言，供后续全实现复用。
2. **C2「最好抽同一函数复用」的运行时边界**：`postHref` 是**生成物 TS**（`post-permalink.ts`，站点运行时），`createPostPathResolver` 是**迁移脚本 JS**（`migrate-hexo.mjs`，生成期）。二者分属不同运行时，无法字面 `import` 同一函数对象。实现为**同一规则函数 `applyPermalinkTrailingSlash`**：迁移侧直接调用，生成侧内联同名 TS helper（逻辑逐字一致 + 交叉注释锚定）。尾斜杠判定收口为单一规则源，达成「对齐」硬要求；「字面同一函数」受运行时边界限制，属「最好」档位的合理折中，已在两侧留注释说明。
3. **FIXPLAN 行号漂移**：C1/C3/C5 标注行号与当前脚本略有偏移（如 C5 标 `:2693-2696`，实为 twikoo 块 `:2728-2750`），但各条语义与代码实态一致，按语义实现，无语义冲突。

---

## 改动文件清单

- `scripts/migrate-hexo.mjs`：C1(`timezoneOffsetMinutes` + 消费点 DST 检测)、C2(`applyPermalinkTrailingSlash` + `createPostPathResolver` + 生成 `postHref`)、C3(`parsePostDateParts` + 两调用方兜底)、C5(twikoo dry-run 措辞)。
- `scripts/diff-html.mjs`：C4(`stripUnrenderedHeadingArtifacts` 收紧 + `--verbose` id 输出)。未碰 D1 退出语义区。
- `docs/MIGRATION.md`：C1 DST 限制登记（§13.2 第 7 条 + 时区 FAQ 两条 bullet）。
- `docs/notes/fix-batch-c.md`：本报告。
