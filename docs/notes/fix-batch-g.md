# Batch G · 测试与代码卫生 — 执行报告（G1–G8）

> 执行日期：2026-11-25；基准 HEAD `eb3f493`（FIXPLAN 基线）。任务清单：`docs/FIXPLAN.md` Batch G 表（:87-98）。
> 写范围遵守：只改任务卡列明的文件；`examples/blog/src/styles/upstream/**` 与 `examples/blog/theme.config.yml` 未触碰（`check-upstream-delta` 绿）；零 git 写操作。
> 文档数字口径（README/PLAN 计数）按约束本批一律未改，全部列入文末「待 F 同步清单」。

## 0. 逐 ID 状态

| ID | 状态 | 一句话结论 |
|---|---|---|
| G1 (M24) | done | `navigation.spec.ts` 改用 helpers 的扩展 `test`/`expect`，3 条导航用例自动获得 `isolateExternalRequests` |
| G2 (L16) | done（含审查修正） | precache 下界 48 → **80**（P7-1 实测 84 的组成式扣除 G4 删除项）；见 §2 审查修正 |
| G3 (L4) | done | 死卡 `CardNewestComment.astro` 已删（全仓零 import）；Console 内联结构与注释相应处理；「15 张卡片」精确口径 = 12+2+1 |
| G4 (M15) | done | 6 文件删除（2 调试页 + P1.5 布局 + 3 孤儿资产）；bgm.wav / pug-probe.svg 评估后删除；「62 页」→ 60 页算式已产出给 F |
| G5 (L7) | done | 汇总文案按 `upstreamChecked` 分叉，未复核输出含「未验证」字样 |
| G6 (L8) | done | 双引号告警去重（同键一次）+ `warnOnMissing` 统一门控；README 说明留 F（位置已列） |
| G7 (L11) | done | raw 正文对 `ends===false` 块级（checkbox/radio）已展开；测试 62 → **65/65** 全绿 |
| G8 (L5) | done | Card*/AsideContent 的 `tp()` 全部透传 `site.language`（与 Console `_p` 同型） |

---

## 1. G1 — navigation.spec.ts 走 helpers 的隔离 fixture

**改动 diff**（`git diff -- tests/e2e/navigation.spec.ts`）：

```diff
+ * G1（M24）：test/expect 取自 helpers 的扩展 test —— 其 page fixture 自动挂
+ * `isolateExternalRequests`（外部脚本打桩 / 外链样式空体 / 其余 abort），
+ * 3 条导航用例因此都获得外部资源隔离，不再裸奔。
  */
-import { expect, test, type Page } from '@playwright/test'
+import type { Page } from '@playwright/test'
 import {
   clickAndWaitForClientRoute,
   collectPageErrors,
+  expect,
   goBackAndWait,
   goForwardAndWait,
   gotoReady,
   internalLink,
   runtimeConsoleErrors,
+  test,
   trackDocumentRequests,
 } from './helpers'
```

**3 条用例如何获得 `isolateExternalRequests`**（helpers 导出名即 `isolateExternalRequests`）：

- `tests/e2e/helpers.ts:108-113` 导出**扩展 test**：
  ```ts
  export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
      await isolateExternalRequests(page)   // ← 每个用例的 page 自动挂隔离
      await use(page)
    },
  })
  export { expect }
  ```
- 3 条用例（`test('点击站内链接不产生 document 请求…')`、`test('浏览器前进/后退…')`、`test('连续两次站内导航…')`）都从这个扩展 `test` 上 `describe` 出来，page fixture 在首次 `goto` 前完成隔离（helpers.ts:67-69 注释：「必须在第一次 page.goto 之前调用；返回的扩展 test fixture 已经处理好了」）。
- 导出面：`test`（扩展）、`expect`（re-export）、`isolateExternalRequests`（具名函数，pwa.spec.ts:21 的手动用法消费同一导出）。M24 措辞修正对照：pwa.spec.ts 用基础 test + 手动调 `isolateExternalRequests`；本次只动 navigation，改完后两种形态都有隔离。

## 2. G2 — precache 下界 48 → 80（审查修正）

**下界最终值：80**（`tests/e2e/pwa.spec.ts:54`，原 48）。

**依据（P7-x 实测记录 + 构成式）**：

- `docs/notes/P7-1-pwa.md:60`：`precache  84 entries (3465.28 KiB)`（构建日志原文，:150 同值复测）；
- `docs/notes/P7-1-pwa.md:108`：「预缓存 84 条（62 HTML + JS/CSS + manifest + 图标）」；
- `docs/notes/P7-1-pwa.md:163-164`：「预缓存清单：84 条，包含 `/`、62 个 HTML、`/_astro/*.js|css`、`manifest.webmanifest`、3 个 manifest 图标」；
- 当前 dist 枚举（G4 删除前）：**62 HTML + 16 JS + 2 CSS**（`examples/blog/dist` 清点）→ 62+16+2+1(manifest)+3(图标) = **84**，与笔记完全对上；
- G4 删除项对 precache 的影响（`globPatterns: ['**/*.{html,js,css}']`，astro.config.mjs:575）：
  - `debug-collection/index.html`、`page2/index.html` → −2 HTML；
  - `public/slice-harness.js` → −1 JS（.js 命中 glob）；
  - `examples/blog/src/layouts/BaseLayout.astro` 的 bundled `<script> import '../scripts/pjax-shim.ts'`（原 :83-85）→ 1 个 `BaseLayout.astro_astro_type_script_index_0_lang.*.js` chunk 消失 → −1 JS（dist 里 BBgDs-2V / DQr737PA 两个同名 chunk 各属一个 BaseLayout，P4-4 note:336 证实 BBgDs-2V 是主题侧）；
  - `bgm.wav` / `pug-probe.svg` 不在 glob 内（wav/svg）→ 不影响。
- **G4 后口径：60 HTML + 14 JS + 2 CSS + manifest + 3 图标 = 80 条**。

**审查修正（FIXPLAN 与代码实态冲突，按约束 5 以代码为准）**：FIXPLAN G2 验收写「下界与 P7-1 笔记口径一致」（=84），但**同批 G4** 删除 2 页 + 2 个 JS 资产后产物 precache 必然从 84 降到 80；若照抄 84 会让 PWA e2e 在 CI 必红。故下界取 G4 后的计算值 80，注释同时保留 84 的组成式出处（pwa.spec.ts:53-59 注释原文可见）。84→80 的精确值以 CI 的 `[anzhiyu-pwa-extras] … precache=N` 日志为最终复核（构建级验证本机不可跑，见「待 CI 验证清单」）。

## 3. G3 — 删死卡 CardNewestComment

**删除前引用面**（全仓 grep `CardNewestComment`）：

- **没有任何组件 import 过它**。`packages/astro-theme-anzhiyu/src/components/widget/` 下 15 个 `Card*.astro` 里，AsideContent.astro:26-37 import 12 张、Console.astro:24-25 import 2 张（CardConsoleTags/CardConsoleArchives），CardNewestComment 是第 15 个、零 import；
- 文字引用 2 处（都是注释/文档）：`Console.astro:15`（组件头注释）、`Console.astro:102-106`（解释「为什么内联而不复用」的块注释）；`docs/notes/P3-1-aside-widgets.md:37`（历史笔记，记录它「console 页用，不在 aside 挂载」）；
- 它自己的文件头就写明（原 CardNewestComment.astro:17）：「目前没有 console 挂载点，因此不会进入任何页面产物」——死卡实锤。

**Console.astro:102-104（现 :102-106）前后片段**：

改前：
```astro
      {/*
        上游 `card_newest_comment.pug` 的结构在这里内联，而不是复用
        `widget/CardNewestComment.astro`：后者调用 `_p()` 时没有传站点语言，
        缺 `lang` 会回退到 default 字典并输出键名（`console.interaction`）。
        中控台文案必须走当前站点语言，因此在此按 `_p` 直出。
      */}
```
改后（Console.astro:102-106）：
```astro
      {/*
        上游 `card_newest_comment.pug` 的结构在这里内联（G3：原
        `widget/CardNewestComment.astro` 从未被任何组件 import，是死卡，已删除）。
        文案走 `_p`（带 lang 的 tp 包装），中控台文案按当前站点语言输出。
      */}
```
同文件 `:15` 头注释同步改为「最新评论卡：`card_newest_comment.pug` 结构内联在本组件（`#card-newest-comments`，G3 已删除无人引用的死卡 `widget/CardNewestComment.astro`）」。内联卡片本体（:107-117 `<div class="console-card" id="card-newest-comments">`）不变——它就是上游 `card_newest_comment.pug` 的结构。无悬空 import（该文件从无 import 方）。

**「15 aside 卡片」口径的新实数与清点依据**：

- **新实数 = 15 张 = 12 aside + 2 中控台 + 1 最新评论**（FIXPLAN G3 行给定的精确口径，清点后吻合）。
- 清点依据（文件:行）：
  - `AsideContent.astro:26-37` —— 12 个 import：CardAuthor / CardAnnouncement / CardWeixin / CardTopSelf / CardCategories / CardPostToc / CardRecentPost / CardAd / CardTags / CardArchives / CardWebinfo / CardBottomSelf（= 12 aside）；
  - `Console.astro:24-25` —— 2 个 import：CardConsoleTags / CardConsoleArchives（= 2 中控台）；
  - CardNewestComment = 1（死卡，G3 删除；其功能形态即 Console.astro:107-117 内联的 `#card-newest-comments`，= 1 最新评论）。
- 删除前 `widget/` 目录恰好 15 个 `Card*.astro`（目录清点），即旧口径「15」的出处；删除后 14 个文件 + Console 内联 1 张 = 运行时仍是 15 个卡片位，故 F 批把「15 aside 卡片」改写成「15 张卡片 = 12 aside + 2 中控台 + 1 最新评论（Console 内联）」即可，总数不变。

## 4. G4 — 调试页与孤儿资产删除

**删除清单（6 个，git status 均为 `D`）**：

| 文件 | 性质 |
|---|---|
| `examples/blog/src/pages/debug-collection.astro` | P2-1 临时验证页（文件头自述「临时验证页…Phase 2 后续会被真实页面替换」） |
| `examples/blog/src/pages/page2.astro` | P1.5 垂直切片第二页 |
| `examples/blog/src/layouts/BaseLayout.astro` | P1.5 切片布局（注意：packages 主题侧同名文件未动） |
| `examples/blog/public/slice-harness.js` | P1.5 页内浏览器 harness |
| `examples/blog/public/bgm.wav` | P1.5 音频样本（96 KB） |
| `examples/blog/public/pug-probe.svg` | P1.5 pug void 探针素材 |

**逐文件无悬空引用的 grep 证据**（`grep -n 'slice-harness\|bgm\.wav\|pug-probe\|debug-collection\|layouts/BaseLayout\.astro'`，代码类后缀全仓）：

| 删除物 | grep 命中 | 判定 |
|---|---|---|
| `debug-collection` | 仅 `tests/e2e/pwa.spec.ts:55`（本次 G2 注释里的说明文字） | ✅ 零代码引用 |
| `page2.astro` / `/page2/` | 生产代码零命中（仅下方残留清单里的历史 harness） | ✅ |
| `examples/…/layouts/BaseLayout.astro` | 零命中。所有 `layouts/BaseLayout.astro` 命中均指向 `packages/astro-theme-anzhiyu/src/layouts/BaseLayout.astro`（如 `examples/blog/src/pages/index.astro:22` 的 `../../../../packages/…`、`packages/astro-theme-anzhiyu/package.json:39` 的 exports） | ✅ |
| `slice-harness.js` | 仅 `examples/blog/tests/vertical-slice.mjs:21`（**注释**提及） | ✅ 零加载方 |
| `bgm.wav` | **零命中**（`#bgm` DOM 查询在下方历史 harness 里，指向已删的 P1.5 `#music-player`） | ✅ |
| `pug-probe.svg` | 零命中（原唯一引用方 page2.astro:29 同批删除） | ✅ |

**bgm.wav / pug-probe.svg 处置结论：都删**。

- `bgm.wav`：唯一产品引用是 P1.5 布局的 `<audio id="bgm" src="/bgm.wav">`（原 examples 侧 BaseLayout.astro:59），与布局同批删除后全仓零引用；真实音乐功能走 `nav_music` + meting/APlayer（theme 配置），不消费该文件。P7-6 note:321 的「保留」是主题资产打包时「站点侧不动」的盘点决定，不构成依赖，FIXPLAN G4 覆盖之。
- `pug-probe.svg`：唯一引用方 page2.astro:29（pug void 标签探针）同批删除，孤儿成立。
- 均不在 PWA precache glob（`*.{html,js,css}`）内，删除不影响 G2 的 80 口径。

**「62 页」新口径算式（给 F）**：

- 旧：**62 = 48 基线 + 12 独立 fixture + 2 调试页**（对 `docs/baseline.json` 48 页清单与 dist 62 个 HTML 做集合差得到的 14 个增量页即 12 fixture + 2 调试页）；
- 新（G4 后）：**60 = 48 基线 + 12 独立 fixture**；
- 12 独立 fixture 全名单（dist 相对 baseline 的差集）：`/categories/`、`/tags/`、`/album/`、`/album/demo/`、`/album/gallery/`、`/equipment/`、`/essay/`、`/fcircle/`、`/link/`、`/music/`、`/page-default/`、`/room/`；
- 2 调试页：`/debug-collection/`、`/page2/`（本次删除）。

**残留（写范围外，已核实不进 CI）**：`examples/blog/tests/vertical-slice.mjs`、`tests/serve-and-collect.mjs` 与 `examples/blog/package.json:9-10` 的 `test:slice` / `test:slice:serve` 脚本仍引用 `/page2/`、`#pug-probe`、`#bgm`、slice-harness.js（vertical-slice.mjs:21/211/248/268/402-463 等）。该 harness 是 P1.5 历史证据，**在本次删除前就已失效**（P2-2-3 note:433：首页重写后 `tests/vertical-slice.mjs` 按原断言跑首页会失败），且 `.github/` 零引用（grep 无命中）——CI 不受影响。建议后续批次（非 G）连 npm script 一起清掉，已列入「待 F/后续处理清单」。

## 5. G5 — compare-css-vars 未复核环境输出含「未验证」

`scripts/compare-css-vars.mjs:221-229` 改为按 `upstreamChecked` 分叉：复核过才写「取值集合一致」，否则明示未验证。

**未复核环境输出样例**（构造验证：%TEMP%\g5-fixture，`BASELINE_PATH`/`DIST_DIR` 指向 fixture、`UPSTREAM_CSS` 指向不存在的文件，触发 orderOnly 分支）：

```
[compare-css-vars] WARN --anzhiyu-a: 基准首值 "red" / 产物首值 "green" → 声明顺序不同（基准值仍在产物中）
[compare-css-vars]      产物声明序列（共 2 次）: green×1, red×1
[compare-css-vars]      上游 CSS 不在本机，跳过声明值集合复核
[compare-css-vars] 结果: 严格一致 1 / 顺序差异 1 / 值不一致 0 / 产物缺失 0（基准共 2）
[compare-css-vars] 比对通过（1 处为声明顺序差异；声明值集合一致性未验证——上游 CSS 不在本机，未做集合复核）
```

**对照（上游在场）**：同样 fixture 配上 `UPSTREAM_CSS` → `比对通过（1 处为声明顺序差异，取值集合一致）`（原文见 §9 命令 4）。**仓库真跑**（本机 `.baseline-work` 在场）：`比对通过（1 处为声明顺序差异，取值集合一致）`，68 严格一致 / 1 顺序差异 / 69 基准——既有语义不变。

## 6. G6 — 双引号告警去重 + warnOnMissing 统一门控

`packages/vite-plugin-stylus-hexo-config/src/index.mjs:205-218`（原 :205-213）：

```js
      const hasDouble = value.includes('"')
      if (!hasDouble) return `"${value}"`
      // 同键告警只打一次，且与 missing/object 告警共用 warnOnMissing 总闸（G6）。
      if (warnOnMissing && !warnedKeys.has(`quote:${key}`)) {
        warnedKeys.add(`quote:${key}`)
        console.warn(
          `[stylus-hexo-config] hexo-config('${key}') 的值同时含单双引号，双引号已替换为单引号：${value}`,
        )
      }
      return `"${value.replace(/"/g, "'")}"`
```

逻辑：旧行为只 `warnedKeys.add('quote:'+key)` 从不查表，同键每次求值都告警（跨 .styl 文件 / watch 重建必重复）；且不走 `warnOnMissing`，与 missing（:352）/ object（:219）两处告警的门控不一致。改后三类告警统一为 `warnOnMissing && !warnedKeys.has(...)`。

**验证方式（node 实跑，非纸面推演）**：`%TEMP%\g6-verify.mjs` 直接 import 插件工厂，同一含单双引号的键在 3 个 .styl 文件各 transform 一次 + object 对照 + `warnOnMissing:false` 反例：

```
WARN_COUNT_AFTER_3_FILES = 1
WARN_SAMPLE = [stylus-hexo-config] hexo-config('dup') 的值同时含单双引号，双引号已替换为单引号：it's a "both-quotes" value
OBJ_WARN_TOTAL = 1
WARN_ADDED_WHEN_GATED_OFF = 0
RESULT = PASS
```

（修复前同场景为 3 次告警；`warnOnMissing:false` 时 0 条。）

## 7. G7 — raw 正文展开 ends===false 块级（checkbox/radio）

**实现方式**（`packages/remark-hexo-tag/src/index.mjs`，renderRaw 段）：

- 判定条件从 `entry && entry.ends === false && entry.string` 放宽为 `entry && entry.ends === false`：自闭合块级一律展开，checkbox / radio（`tags/block/index.mjs:322-323`，`ends: false`、render 返回 **mdast 节点**）不再落 `{% %}` 字面量；
- 字符串块级（site/cell/bilibili/intCard，`entry.string`）仍走原路径直接拼字符串；checkbox/radio 的 mdast 返回值经新增的 `nodesToRawHtml()` 序列化成 HTML（html 节点直出、paragraph 包 `<p>`、text 转义、emphasis/strong/inlineCode/delete/link/image/break 映射到同名标签、未知节点回退转义不抛错——checkbox 参数是单行文本，只会产出这些形态）；
- 与顶层渲染同构：`renderCheckable`（block/index.mjs:236-261）的 `[html开, ...ctx.content(text), html闭]` 在 raw 区域序列化后与全管道产物逐字节同形（例：`<div class='checkbox'><input type="checkbox" /><p>文字</p></div>`）；
- 已知限制注释同步改写（:212-215）：容器型 tag（`ends !== false`）在 raw 区域仍保持原文不变，限制面收窄到容器嵌容器。

**test/run.mjs 输出**（新增 3 个用例：videos 内嵌 checkbox / btns 内嵌 radio / videos 内嵌 checkbox 含行内 Markdown）：

```
$ node packages/remark-hexo-tag/test/run.mjs
remark-hexo-tag: 65/65 通过        （exit=0）
```

**计数：62/62 → 65/65**（+3 用例）。F16 的目标口径按 65/65 同步（见待 F 清单）。

## 8. G8 — tp() 透传 site.language（与 Console `_p` 同型）

照 Console 的写法（`Console.astro:28-29/39`：`lang?: string` prop + `const _p = (key: string) => tp(key, lang)`），与 Header/Footer/Sidebar 既有 `_p` 模式一致。diff 摘要（文件:行）：

| 文件:行 | 改动 |
|---|---|
| `widget/AsideContent.astro:56` | 新增 `const lang = site.language`（来自 `resolveSite(siteInput)`，上游 `config.language`） |
| `widget/AsideContent.astro:74/83/97` | `<CardPostToc … lang={lang}>`（3 处挂载点） |
| `widget/AsideContent.astro:79/92` | `<CardAnnouncement lang={lang}>` |
| `widget/AsideContent.astro:84` | `<CardRecentPost … lang={lang}>` |
| `widget/AsideContent.astro:95` | `<CardCategories … lang={lang}>` |
| `widget/AsideContent.astro:101` | `<CardArchives … lang={lang}>` |
| `widget/AsideContent.astro:105` | `<CardWebinfo … lang={lang}>` |
| `console/Console.astro:141` | `<CardConsoleArchives … lang={lang}>`（Console 自身 lang prop 透传） |
| `widget/CardAnnouncement.astro:22-23,33` | `lang?: string` prop + `_p` 包装，`tp('aside.card_announcement')` → `_p(…)` |
| `widget/CardPostToc.astro:24-30,43` | 同型，`tp('aside.card_toc')` → `_p(…)` |
| `widget/CardRecentPost.astro:34-39,56,73` | 同型，`dateLabel` 与 `aside.card_recent_post` 两处走 `_p` |
| `widget/CardWebinfo.astro:29-34` + 7 个调用点 | 同型，`aside.card_webinfo.*` 7 处全走 `_p` |
| `widget/CardArchives.astro:25-27,47` | `t: (key) => tp(key)` → `t: (key) => tp(key, lang)` |
| `widget/CardCategories.astro:22-25,40` | 同上 |
| `widget/CardConsoleArchives.astro:16-18,46` | 同上 |

改后 widget 目录 grep 复核：所有 `tp(` 调用均带 `lang` 参数（8 条命中全部是 `_p`/`t:` 定义行）。en 站点下侧栏标题走 en 字典而非 default（zh）字典；缺省（不传 lang）行为不变。

## 9. 验证命令与原始输出

| # | 命令 | 结果 | 输出尾部 |
|---|---|---|---|
| 1 | `node packages/remark-hexo-tag/test/run.mjs` | exit 0 | `remark-hexo-tag: 65/65 通过` |
| 2 | `node scripts/check-upstream-delta.mjs` | exit 0 | `[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0` |
| 3 | `node scripts/compare-css-vars.mjs`（仓库真跑） | exit 0 | `结果: 严格一致 68 / 顺序差异 1 / 值不一致 0 / 产物缺失 0（基准共 69）` / `比对通过（1 处为声明顺序差异，取值集合一致）` |
| 4 | `node scripts/compare-css-vars.mjs`（%TEMP% fixture，无上游） | exit 0 | `比对通过（1 处为声明顺序差异；声明值集合一致性未验证——上游 CSS 不在本机，未做集合复核）` |
| 5 | `node scripts/compare-css-vars.mjs`（%TEMP% fixture，有上游对照） | exit 0 | `比对通过（1 处为声明顺序差异，取值集合一致）` |
| 6 | `node %TEMP%\g6-verify.mjs`（G6 去重模拟） | exit 0 | `WARN_COUNT_AFTER_3_FILES = 1` / `WARN_ADDED_WHEN_GATED_OFF = 0` / `RESULT = PASS` |
| 7 | `node scripts/verify-css.mjs` | exit 0 | `[verify-css] PASS 字节数: 实际 684087 / baseline 683218（+0.13%，阈值 ±5%）` / `[verify-css] 比对通过` |
| 8 | `node scripts/check-tag-styles.mjs` | exit 0 | `[check-tag-styles] 通过：所有带 class 的 tag 都能在上游样式里找到规则…` |
| 9 | `node scripts/check-upstream-sync.mjs` | exit 0 | `结论: 基线之后上游没有新提交` / `退出码: 0` |
| 10 | `node -e "import('…/tests/e2e/navigation.spec.ts')"` | 见注 | `IMPORT FAIL: Cannot find module '…/tests/e2e/helpers'`——**非语法错误**：裸 node 不做 `./helpers` → `helpers.ts` 的扩展名解析（Playwright 才做）；未改动的 `pwa.spec.ts` 以同样方式 import `./helpers`，报错逐字相同，证明两文件自身语法可解析。类型/运行验证归 CI |

注：本机 pwsh stdout 偶发不回传，以上命令输出均先落 `%TEMP%` 再读取，文内为原文摘录。`.astro` frontmatter 无本地编译器可跑（约束 2 禁 astro build），语法级验证归 CI 构建。

## 10. 待 CI 验证清单

1. **PWA e2e（pwa.spec.ts）**：precache 下界 80 是否与 CI 实测一致——看 `[anzhiyu-pwa-extras] … precache=N` 日志；若 N≠80（±0 内均应过 `≥80`），按实测微调下界（G2 审查修正的复核点）。
2. **构建产物无 `/debug-collection/`、`/page2/`**：CI build 后 dist 页数应为 60（`62 page(s) built` → `60 page(s) built`）。
3. **navigation.spec.ts 3 条用例**：helpers 扩展 test 下全绿（行为应与手动挂隔离等价，理论零风险，仍归 e2e job 证实）。
4. **Astro 编译**：7 个 Card + AsideContent + Console 的 frontmatter 改动（lang prop 透传）过 `astro build`；CardWebinfo 多行 JSX 属性（:103-107）编译无误。
5. **PWA 默认构建零足迹**：G4 删资产后 48 页基线 diff 仍 48/48 PASS / 0 差异（删除项均不在基线 48 页内）。

## 11. 待 F 同步清单（文档数字口径，本批一律未改）

| # | 原文位置 文件:行 | 现文 | 目标口径 |
|---|---|---|---|
| 1 | `README.md:199` | 「15 aside 卡片、13 模板…」 | 「15 张卡片（12 aside + 2 中控台 + 1 最新评论）、13 模板…」 |
| 2 | `README.en.md:110` | 「15 aside cards」 | 「15 widget cards (12 aside + 2 console + 1 newest-comments)」 |
| 3 | `docs/PLAN.md:75` | 「✅ 15 张卡片」 | 「✅ 15 张卡片（12 aside + 2 中控台 + 1 最新评论）」 |
| 4 | `docs/PLAN.md:452` | 「P3-1 \| 15 个 widget 卡片」 | 同上精确化（总数不变） |
| 5 | `docs/03-migration-plan.md:97` | 「15 个 widget 卡片」 | 同上精确化（历史规划文档，F 仲裁是否回改） |
| 6 | `examples/blog/README.md:3` | 「62 个页面（48 页基线 + 9 篇文章 + about + 11 个 page.type fixture）」（算式本身不成立） | 「60 个页面（48 页基线 + 12 独立 fixture）」+ fixture 名单（§4 算式） |
| 7 | `examples/blog/README.md:26` | 「# 62 页」 | 「# 60 页」 |
| 8 | `README.md:7` | 「验证站 examples/blog 构建 62 页」 | 「60 页」 |
| 9 | `README.md:153` | 「# 62 页验证站」 | 「# 60 页验证站」 |
| 10 | `docs/PLAN.md:25` | 「62 页验证站」 | 「60 页验证站」 |
| 11 | `docs/PLAN.md:711` | 「验证站 62 页」 | 「验证站 60 页」 |
| 12 | `docs/notes/P7-2-perf.md:27/162/370/531/653/684` | 「62 页」 | 历史快照，F18 范式处理（加「历史快照」注或不动） |
| 13 | `packages/remark-hexo-tag/README.md:87` | 「# 62/62」 | 「# 65/65」 |
| 14 | `packages/remark-hexo-tag/src/parser.mjs:137`（F16 原目标） | 「59/59 单测守护」 | 「65/65 单测守护」或指向 test/run.mjs |
| 15 | `packages/vite-plugin-stylus-hexo-config/README.md:98`（G6 遗留） | 「## 限制」无值改写说明 | 补：①值同时含单双引号时 `"` 改写为 `'`（Stylus 字符串无转义）；②对象/数组值按 truthy `true` 输出；③缺失键/对象值/双引号改写三类告警由 `warnOnMissing` 统一门控且同键只告警一次 |
| 16 | `packages/vite-plugin-stylus-hexo-config/README.md:95` | 「`warnOnMissing` … 引用不存在的键时告警」 | 扩义为「缺失/改写类告警总闸（缺失键、对象值、双引号改写）」 |
| 17 | `examples/blog/README.md:14`（F17 原目标） | public/ 目录清单 | G4 后为 `public/{img,anzhiyu}/ + favicon.ico`（bgm.wav / pug-probe.svg / slice-harness.js 已删） |
| 18 | `packages/remark-hexo-tag/README.md:58-59`（可选） | raw 行为描述 | 可补一句「raw 区域内自闭合块级（checkbox/radio）同样展开」（G7 已实现，非限制项） |

## 12. 待 F/后续处理清单（非数字口径）

1. `examples/blog/package.json:9-10` 的 `test:slice` / `test:slice:serve` 与 `examples/blog/tests/vertical-slice.mjs`、`tests/serve-and-collect.mjs`：P1.5 历史 harness，本次删除其被测物（page2/slice-harness/bgm/pug-probe）后彻底悬空（此前已因首页重写失效）。零 CI 引用，建议随 F 或独立小批次整体删除。
2. `examples/blog/src/scripts/pjax-shim.ts`：唯一引用方（P1.5 布局 `<script> import '../scripts/pjax-shim.ts'`）已删，成为孤儿文件；写范围外未动，建议同批清理。
