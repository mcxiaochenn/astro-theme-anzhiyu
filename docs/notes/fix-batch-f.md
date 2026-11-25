# Batch F 执行报告 — 文档对齐 + 执行报告收尾（F1–F18 + 各批积压）

> 执行：agent-12 · 2026-11-25（Asia/Shanghai）· 基准 HEAD `2fa0bf7`（A–G 已落盘）
> 范围：FIXPLAN F1–F18 + A–G 六份批报告「待 F 同步清单」全部积压 + `docs/notes/FIX-2026-11-25.md`（全量执行报告）+ 本报告。
> 约束遵守：**零 git 写操作**（F commit 留给 Lead）；未跑 astro build / playwright / lighthouse；未触碰
> `examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml`；`docs/upstream-delta.md` §5 锚点 JSON 未动。
> 数字口径：全仓唯一，以 `docs/notes/FIX-2026-11-25.md` §6 表为准。

---

## 0. 逐 ID 状态（F1–F18 全 done；积压全 done）

| ID | 状态 | 落点 file:line → 新文本摘要 |
|---|---|---|
| F1 (H9) | done | `docs/MIGRATION.md:663-670`：tag FAQ 从「只实现 12+12、media/thirdparty 透传、未闭合报错」改为「**42 个 tag 全实现（65/65）** + 迁移产物默认 `lenient: true`（未闭合容器自动补齐、脏 tag 原样透传并 warning，不中断构建；严格模式保留 文件:行:列 报错）」；`:740-742` §13.2 第 2 条划线 + 「**历史结论，P7-3 时点**」，指向 §12「tag 语法」 |
| F2 (H10) | done | `docs/MIGRATION.md:633-656`：permalink FAQ 从「两者不兼容 + 恒需 redirect-map」改为「**路由已按源站 permalink 落位**（URL 单一真源 postHref / resolvePostHref，W2-A 起 prev/next、侧栏、home_top、canonical/og:url 同源）；**redirect-map 仅当 permalink 使用不支持 token 时需要**」，映射脚本保留并注明适用条件 |
| F3 (H11) | done | `README.en.md` 整页按 README.md 当前态刷新：status 块（:7，Phase 7 exit / 61 页 / 49/49 / 65/65）、勾选区（:21-53，全部状态与中文版对齐）、本地验证（:72-84）、路线图（:104-117，Phase 1-7 状态全更新）、尾注声明中文 README 为权威文档 |
| F4 (M13) | done | `docs/MIGRATION.md:243-248`：补「`todolist` 兼容页（1.6.14 模板移植）…合计 **13 条分发路径**」，todolist 行移出「需人工处理」表；`:252-258`「两条真实缺口」去掉 todolist（真实边界收窄 **charts + sitetime**）；`:275` 无消费者名单收窄 `widget.yml`/`creativity.yml`（todolist.yml 已被兼容页消费）；`docs/PLAN.md:737` 同步 |
| F5 (M16) | done | `examples/blog/README.md:3`：「62 个页面（48 基线 + 9 篇文章 + about + 11 fixture）」→「**61 个页面（49 页基线 + 12 独立 fixture，以 CI 构建实测为准）**」+ 12 fixture 全名单（/categories/、/tags/、/album/、/album/demo/、/album/gallery/、/equipment/、/essay/、/fcircle/、/link/、/music/、/page-default/、/room/） |
| F6 (M17) | done | `examples/blog/README.md:50`：「112 条差异」→「**49/49 PASS / 0 差异**（CI 硬门禁；C4 收紧 N21 后终值以 CI 复核为准）」 |
| F7 (M19) | done | `README.md:204`：Phase 7「◐ …待最后一轮 CI 绿灯」→「**✅ 真实站迁移验收 gap=0，PWA/性能已落地；仅剩发布授权（npm publish / Pages 部署 / git tag）**」（与 :7 状态块「Phase 7 退出」统一） |
| F8 (M20) | done | `docs/PLAN.md`：阶段总览（:264-278）刷新——Phase 5/6 ✅（65/65 + 186/186）、Phase 4 ✅ e2e 29/9、Phase 7 ✅ 仅剩发布授权，合计 ≈62 / ≈58；§8.1（:703）「历史快照」头注（含 94/97 统一：94 页 = W2-B1 前时点值，现 97 页 = 源站 97）；`:711` 内联补时点说明；§1.1（:15-29）当前状态表全刷新（61 页 / 49/49 / 94 提交） |
| F9 (M21) | done | `docs/PLAN.md:236-244` 验收命令集：`npx playwright test # 视觉回归` → `pnpm test:e2e # 行为 e2e`；check-upstream-delta 28→**29 项**；**删** `check-features.mjs` 行（脚本不存在，自检由 check-loader/schema/tag-styles/i18n 等承担） |
| F10 (M23) | done | `docs/upstream-delta.md:28` 总表补 **U9 行**（「上游 tag 解析器行为：容器吞掉其前 Markdown 标题，基线留 `## xxx` 字面量；不改上游，diff N21 双形态豁免」）；引用三处改 **U1–U9**：`README.md:189`、`README.en.md:107`、`docs/PLAN.md:76`（8 项→9 项） |
| F11 (M25) | done | `README.md:48` 音乐拆开：「CI e2e 验证跨 ClientRouter 导航保持同一 DOM 节点持久化；播放中导航进度继续属真实浏览器走查验证」；`:201` 9 skipped 归因改「**搜索 2 + 右键 3 + 暗色右键 1 + 音乐 1 + pwa 2**」 |
| F12 (M26) | done | `README.md:40`：「与上游一致默认关闭，需中控台开启」→「**`#keyboard-tips` 帮助浮层已由 A5 补齐（shortcutKey.enable 开启即输出）；config 总闸开启即自动注册（main.js:1752-1757），中控台关闭不持久**」；`docs/notes/P7-4-final-acceptance.md:88` 归因改「**构建配置导致 `#consoleKeyboard` 未输出**」（非「上游设计」，keyboardToggle 默认 false 只是第二层）+ 补 #keyboard-tips 当时缺口 / A5 已修记录 |
| F13 (L3) | done | `README.en.md:29`：「83 dictionary entries」→「**4 dictionaries: default 91 / en 165 / zh-CN 165 / zh-TW 165 entries; 83 check-i18n assertions pass**」（实测：locales.ts 摊平块计数 + check-i18n 输出） |
| F14 (L6) | done | `README.md:52/:200`：「13 个 page.type」→「**12 种标准 page.type + todolist 兼容页共 13 条真实路径**」；`docs/MIGRATION.md:243/:656` 同口径（todolist 覆盖方式 = 1.6.14 模板移植兼容页） |
| F15 (L9) | done | `README.md:109`：anzhiyuAssets 清单后补「其中 `/css/index.css` 是**结构性空占位**（上游 HTML 固定引用该路径），真实样式走 Vite 产物 `/_astro/*.css`」 |
| F16 (L10) | done | `packages/remark-hexo-tag/src/parser.mjs:137`：「59/59 单测守护」→「**65/65 单测守护（test/run.mjs）**」；`packages/remark-hexo-tag/README.md:80` 62→65 条、`:87` 62/62→**65/65** |
| F17 (L13) | done | `examples/blog/README.md:14`：「public/{js,css,img,anzhiyu}/ 上游 source/js/* 复刻」→「**`public/{img,anzhiyu}/` + favicon.ico**（img 13 个、anzhiyu/random.js、favicon）；JS/CSS 由主题包 `anzhiyuAssets()` integration 构建期注入 dist」 |
| F18 (L17) | done | `docs/notes/P7-2-perf.md`：文件头「历史快照头注」（62/48/94 页时点数声明）；§6.2（:435-452）按 `docs/baseline.json perf.finalCiRun`（run 45398204980）回填 4 类分数（0.96/0.93/0.95 等），**seo 内联阈值 → 0.82**；§6.3 标「历史快照，未回填」（资源明细不猜数） |

## 1. 积压清单逐条落点（六批「待 F 同步清单」）

| 来源 | 项 | 落点 → 新文本摘要 |
|---|---|---|
| fix-batch-b #1 | PLAN:732 表述 | `docs/PLAN.md:739` 按「必答 2」原文照登：「page 级开关已透传（Batch B）…`per_page: false` 时按上游 `math/index.pug` 语义读 `page.mathjax`/`page.katex`。内容侧公式管线缺口见 MIGRATION.md §13.2」 |
| fix-batch-b #2 | MIGRATION §13.2 公式缺口 | `docs/MIGRATION.md:758` 新增第 8 条，fix-batch-b「必答 2」登记文本 #1 原文照登 |
| fix-batch-b #3 | 页数口径全仓 | 8 处 62 页→61 页（G4 ×8 清单）+ PLAN §1.1/§8.1 + examples README 算式（F5） |
| fix-batch-b #4 | 133 键口径 | `README.md:69/:111`、`README.en.md:67` → 「133 上游键 + friends_lite 兼容键（共 134，check-schema 实测）」 |
| fix-batch-b #5 | B3 配置必填/可选 | `README.md:111` 配置层 bullet 补清单（reward.QR_code[].link / nav.menu[].icon / footer.bdageitem.list[].message / footer.socialBar.*[].title / home_top.category[].shadow/.class **可选**；category[].icon **必填**） |
| fix-batch-b #6 | P2-2-3 note:435 | **不改**：docs/notes 历史报告（约束 5），其缺口已由 B5 的 ANZHIYU_THEME_CONFIG 收口，PLAN:11 数字口径约定覆盖 |
| fix-batch-b #7 | pwa.spec +1 | `tests/e2e/pwa.spec.ts:53-59` 下界 80→**81** + 注释改 B4 后组成式（61 HTML + 14 JS + 2 CSS + manifest + 3 图标） |
| fix-batch-b #8 | ai / page 级开关描述 | 全仓清点：PLAN:732（上表）、README/PLAN 无其它「未透传/仅布尔」残留（grep `未透传` 零命中） |
| fix-batch-c | PLAN:61 112 条 | §1.2.1 存档行保留时点数（PLAN:11 约定 + :53 头注豁免）；现行口径 PLAN:29「49 页 / PASS 49」 |
| fix-batch-c | PLAN:44 N21 描述 | 补半句「跳过 pre/code/textarea + 内联 id 仅摘要收集」——该行为已登记 upstream-delta U9/N21 段（`:28/:300-302`），PLAN:44 为存档行，豁免 |
| fix-batch-c | MIGRATION 限制计数 | 无「已知限制 N 条」显式计数句，无需对齐（§13.2 现 8 条含 B2 新增） |
| fix-batch-d #1 | README:156 前置 + 48→49 | `README.md:155-157`：补 `pnpm baseline:extract` 行 + 「49 页结构 diff（硬门禁）」 |
| fix-batch-d #2 | examples README:3/:34 | `examples/blog/README.md:3`（F5）+ `:32-34` 注释 49 页 + extract 前置 |
| fix-batch-d #3 | PLAN 48/48 表述 | PLAN:29（§1.1）改 49/49；其余散布行归 §1.2/§1.2.1/§8.1 历史快照豁免 |
| fix-batch-d #4 | upstream-delta verify-css 语义 | **不改**：报告自注「现文字与本决策不冲突」；D2 的 REGISTRY/严格开关语义已在 verify-css 输出与 FIX-2026-11-25 §3-6 登记 |
| fix-batch-d #5 | diff-html 退出码文字化 | grep 未见「baseline 不存在 → 0」旧表述，无需改 |
| fix-batch-e E1 ×4 | 「零依赖」 | `README.md:67`、`README.en.md:67`、`packages/remark-hexo-tag/README.md:64`、`src/tags/thirdparty/index.mjs:13-15` → 「唯一运行时依赖 `yaml`（^2.9.1）/ 本包声明的 yaml 依赖」 |
| fix-batch-e E2 ×3 + #7 | engines | `README.md:149`、`README.en.md:70`、`examples/blog/README.md:21` 补「与包 engines（>=22.23.4）同限」；`docs/MIGRATION.md:16` `>=22`→`>=22.23.4` |
| fix-batch-g #1-5 | 15 卡片 ×5 | `README.md:200`、`README.en.md:118`、`docs/PLAN.md:81`、`docs/PLAN.md:457`、`docs/03-migration-plan.md:97` → 「15 张卡片（12 aside + 2 中控台 + 1 最新评论）」（03 为 G 报告授权 F 仲裁项，仲裁：回改） |
| fix-batch-g #6-12 | 62 页口径 ×8 | `README.md:7/:154`、`README.en.md:7/:79`、`docs/PLAN.md:27/:718`、`examples/blog/README.md:3/:26` → 61 页（49+12）；P7-2-perf 6 处归 F18 历史快照头注 |
| fix-batch-g #13-14 | 62/62、59/59 | `packages/remark-hexo-tag/README.md:87`、`src/parser.mjs:137` → 65/65（F16） |
| fix-batch-g #15-16 | G6 README ×2 | `packages/vite-plugin-stylus-hexo-config/README.md`：限制节补「值改写三态说明」（双引号→单引号、对象/数组按 truthy、三类告警 `warnOnMissing` 统一门控同键一次）+ `warnOnMissing` 释义扩为「缺失/改写类告警总闸」 |
| fix-batch-g #17 | public 清单 | F17 |
| fix-batch-g #18 | raw 可选说明 | `packages/remark-hexo-tag/README.md:59-60` 补「raw 区域内自闭合块级（checkbox/radio）同样展开（G7）」 |
| fix-g §12 | P1.5 残留 | **已清理**（追加项 2）：vertical-slice.mjs / serve-and-collect.mjs / pjax-shim.ts / test:slice scripts 均已不存在（本次复核 `Test-Path` 全 False） |
| fix-cover-parity #1 | rebaseline cover 待办 | `docs/notes/fix-rebaseline.md:286/:380` → 「**已核实一致（fix-cover-parity）**」 |
| fix-rebaseline §9.5 #5 | baseline-html README:3 | `tests/baseline-html/README.md:3` 「48 页」→「49 页」（并入 48→49 全仓统一） |
| FIXPLAN 头注 | 执行状态 | `docs/FIXPLAN.md:6-14` 加「执行状态」头注（指向 FIX-2026-11-25.md；注明 DoD 62/62 为审查时点、实测 65/65）；条目正文零改动 |

## 2. 本批验证（输出全文见 FIX-2026-11-25.md §2.1）

| 命令 | 结果 |
|---|---|
| `node scripts/check-upstream-delta.mjs` | exit 0，**PASS 29 / SKIP 0 / FAIL 0**（U9 行加入后仍绿，锚点 JSON 未动） |
| `node packages/remark-hexo-tag/test/run.mjs` | exit 0，**65/65** |
| `node packages/astro-theme-anzhiyu/scripts/check-loader.mjs` | exit 0，**43/43** |
| `node packages/astro-theme-anzhiyu/scripts/check-schema.mjs` | exit 0，yaml 133 / schema **134**（friends_lite） |
| `node scripts/diff-html.mjs --all`（.baseline-html 自比对） | exit 0，**49 页 / PASS 49 / FAIL 0 / 0 条差异** |
| `node scripts/verify-css.mjs` | exit 0，比对通过（SHA 差异按 D2 显式登记，不判失败） |
| `node scripts/compare-css-vars.mjs` | exit 0，68 严格一致 / 1 顺序差异 / 0 不一致 |
| `node scripts/check-tag-styles.mjs` | exit 0，全命中 |
| `node packages/astro-theme-anzhiyu/scripts/check-i18n.mjs` | exit 0，83 项断言（词典 91/165/165/165） |

## 3. 写范围清单（本批实际改动）

改：`README.md`、`README.en.md`、`docs/MIGRATION.md`、`docs/PLAN.md`、`docs/upstream-delta.md`（仅 §1 总表 + U1 验证行，§5 锚点 JSON 零改动）、`docs/notes/P7-4-final-acceptance.md`（:88）、`docs/notes/P7-2-perf.md`（头注 + §6.2/6.3）、`docs/notes/P7-1-pwa.md`（头注）、`docs/notes/fix-rebaseline.md`（:286/:380 两行）、`docs/FIXPLAN.md`（仅顶部头注）、`packages/remark-hexo-tag/src/parser.mjs`（:137 注释）、`packages/remark-hexo-tag/README.md`、`packages/remark-hexo-tag/src/tags/thirdparty/index.mjs`（仅注释）、`packages/vite-plugin-stylus-hexo-config/README.md`（G6 ×2）、`examples/blog/README.md`、`docs/03-migration-plan.md`（:97 一行，G3 ×5 授权项）、`tests/baseline-html/README.md`（:3 一行）、`tests/e2e/pwa.spec.ts`（仅 precache 数字与注释）。
新增：`docs/notes/FIX-2026-11-25.md`、`docs/notes/fix-batch-f.md`（本报告）。

## 4. 待 CI 验证清单

同 `docs/notes/FIX-2026-11-25.md` §4（12 项）；本批直接相关的是：diff 49/49 复核、precache=81 终值、e2e 9 skip 归因核对、C4 收紧后新 FAIL 判定。

## 5. 审查修正（本批新增 2 条）

1. **F13 计数对象澄清**：check-i18n 的「83 项」是**断言数**不是词典条目；词典实测 91/165/165/165（default 为兜底字典故少 74 键）。README.en 与 README.md 中文处均按「词条数 + 断言数」双口径书写，杜绝歧义。
2. **F18 指向修正**：FIXPLAN 写「终值见 §8」，实际分数终值在 P7-2-perf **§10**（= baseline.json `perf.finalCiRun`）；§6.2 直接用 baseline.json 回填（优于打标），§6.3 数据不存在则标「历史快照，未回填」不猜数。
