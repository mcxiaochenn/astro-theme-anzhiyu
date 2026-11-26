# Batch A 执行报告 — additional-js 脚本/容器层补齐（A1–A6）

> 执行：agent-2 · 2026-11-25（Asia/Shanghai）· 基准 HEAD `eb3f493`
> 上游真值：`D:\Git-project\_research\anzhiyu-upstream`（只读，1.7.1 / `72439d93`）
> 约束遵守：无任何 git 写操作（未 commit，留给 Lead 按 Batch 汇总）；无 astro build / playwright / lighthouse；未触碰
> `examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml` 及写范围外文件。

## 0. 逐 ID 状态

| ID | 状态 | 落点 |
|---|---|---|
| A1 | done | `packages/astro-theme-anzhiyu/src/components/head/AdditionalJs.astro:198-208`（搜索三件套/local_search，上游 :44-50 位置） |
| A2 | done | 同文件 :210-211（colorthief，上游 :52-54 位置） |
| A3 | done | 同文件 :227-232（comment_barrage，`.js-pjax` 内、`input#page-type` 后，上游 :79-81 位置）+ `pageComments` prop（:64-65） |
| A4 | done | 同文件 :262-263（busuanzi，上游 :126-127）+ :267-268（`#greetingBox`，上游 :131-132）+ `isCurrentRoot` prop（:62-63） |
| A5 | done | 新建 `packages/astro-theme-anzhiyu/src/components/layout/ShortcutKey.astro`；挂载 `BaseLayout.astro:396`（Sidebar :387 与 Rightside :399 之间，上游 layout.pug:80-81） |
| A6 | done | 新建 `packages/astro-theme-anzhiyu/src/components/home/BbTimeList.astro`；挂载 `BaseLayout.astro:364`（main#blog-container 内 HomeTop :367 之前）；`types.ts:44-47` 补 `home_essay?: boolean`；`index.astro` / `page/[...page].astro` 传 `essay` |

改动面（git diff --stat，只读命令，另含未跟踪的两个新组件）：

```
 examples/blog/src/pages/index.astro                |  7 +-
 examples/blog/src/pages/page/[...page].astro       |  7 +-
 .../src/components/head/AdditionalJs.astro         | 76 ++++++++++++++++++++--
 .../src/components/page/types.ts                   |  2 +
 .../src/layouts/BaseLayout.astro                   | 30 ++++++++-
 5 files changed, 112 insertions(+), 10 deletions(-)
（新增文件：components/layout/ShortcutKey.astro、components/home/BbTimeList.astro）
```

---

## 1. A1–A4 各块插入位置是否与上游行号顺序一致？

一致。上游 `additional-js.pug` 全文 132 行已逐行核对（`%TEMP%\additional-js-numbered.txt`），插入位置：
runtime(:40-42) → **A1 search(:44-50)** → **A2 colorthief(:52-54)** → `.js-pjax`(:56) 内 input#page-type(:77) 之后
→ **A3 comment_barrage(:79-81)** → … → aplayer(:117-121) → [pjax :123-124 由 ClientRouter 取代] →
**A4a busuanzi(:126-127)** → accesskey(:128-129) → **A4b #greetingBox(:131-132)**。

改动后 `AdditionalJs.astro` 相关片段（带行号）：

```text
195:   {/* additional-js.pug:40-42 —— 页脚计时器 #runtime（footer.runtime.enable） */}
196:   <Runtime />
197:
198:   {/* additional-js.pug:44-50 —— 搜索脚本（algolia_search 三件套 > local_search；
199:       docsearch 无脚本块，不加） */}
200:   {algoliaSearchEnabled ? (
201:     <>
202:       <script is:inline src={assetUrl('algolia_search')}></script>
203:       <script is:inline src={assetUrl('instantsearch')}></script>
204:       <script is:inline src={assetUrl('algolia_js')}></script>
205:     </>
206:   ) : (
207:     localSearchEnabled && <script is:inline src={assetUrl('local_search')}></script>
208:   )}
209:
210:   {/* additional-js.pug:52-54 —— colorthief（mainTone.mode === "colorthief"） */}
211:   {colorthiefEnabled && <script is:inline src={assetUrl('colorthief')}></script>}
212:
213:   <div class="js-pjax">
...
225:     <input type="hidden" name="page-type" id="page-type" value={resolvedPageType} />
226:
227:     {/* additional-js.pug:79-81 —— 评论弹幕脚本。上游脚本自身无 data-pjax 属性、但位于
228:         .js-pjax 内（pjax 换页重执行语义）→ 本地约定用 data-pjax 属性表达：
229:         head/runtime.ts:136-143 的 shim 在 pjax:complete 时重建 script[data-pjax] 强制重执行。 */}
230:     {commentBarrageEnabled && commentsUseIsTwikoo && pageComments && (
231:       <script is:inline async data-pjax src={assetUrl('comment_barrage_js')}></script>
232:     )}
233:   </div>
...
260:   <Aplayer />
261:
262:   {/* additional-js.pug:126-127 —— busuanzi 访问统计（async data-pjax；src 不套 url_for，与上游一致） */}
263:   {busuanziEnabled && <script is:inline async data-pjax src={busuanziSrc}></script>}
264:
265:   {accesskeyEnabled && <script is:inline charset="UTF-8" src={assetUrl('accesskey_js')}></script>}
266:
267:   {/* additional-js.pug:131-132 —— 问候语容器（is_current('/') && greetingBox.enable） */}
268:   {isCurrentRoot && greetingBoxEnabled && <div id="greetingBox"></div>}
269: </div>
```

门控实现（`AdditionalJs.astro:114-131`）：`algoliaSearchEnabled`/`localSearchEnabled`（flag loose 读）、
`colorthiefEnabled = str(mainTone,'mode') === 'colorthief'`（严格等值，对齐 pug `===`）、
`commentBarrageEnabled` + `commentsUseIsTwikoo = String(obj(theme.comments)['use']) === 'Twikoo'`（对齐 pug `== 'Twikoo'`
的抽象相等：string / 单元素数组 / 多元素数组逐例一致）、`busuanziEnabled`（三项任一）、
`busuanziSrc = assets.busuanzi || '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js'`（`assets.busuanzi` 只来自
`CDN.option` 覆盖（config/assets.ts:211-232），上游此处 src 不套 `url_for`，本地保持一致）、`greetingBoxEnabled`。
A3 的 `data-pjax` 重执行走 `head/runtime.ts:136-143` shim（`script[data-pjax]:not([data-astro-rerun])` 在 pjax:complete 时重建）。
`pageComments` 严格真值（undefined/false 不输出，未用 `!== false` 语义）；BaseLayout Props 与转发已就位
（`BaseLayout.astro:115-117/:145/:555-561`），路由传参按任务约定留给 Batch B。

## 2. 基线配置下 A1–A6 是否全部零输出？

**是，全部零输出（基线 diff 不变）。** 逐门控配置值（均只读引用，SHA 守卫文件未动）：

| 门控 | 基线值 | 证据 |
|---|---|---|
| `algolia_search.enable` | `false` | `examples/blog/theme.config.yml:91-92` `algolia_search:\n  enable: false` |
| `local_search.enable` | `false` | `examples/blog/theme.config.yml:111-112` `local_search:\n  enable: false` |
| `docsearch` | `enable: false`，且 A1 无 docsearch 脚本块（上游 :44-50 就没有，不加） | `examples/blog/theme.config.yml:103-104` |
| `mainTone.mode` | `api`（≠ `colorthief`） | `examples/blog/theme.config.yml:195` `mode: api # colorthief/cdn/api/both …` |
| `comment_barrage_config.enable` | `false` | `examples/blog/theme.config.yml:1125-1126` |
| `comments.use` | 空（≠ `'Twikoo'`） | `examples/blog/theme.config.yml:315` `use: # Twikoo/Waline` |
| `busuanzi.site_uv / site_pv / page_pv` | `false / false / false` | `examples/blog/theme.config.yml:852-855` |
| `greetingBox.enable` | `false` | `examples/blog/theme.config.yml:1164-1165` |
| `shortcutKey.enable` | `false` | `examples/blog/theme.config.yml:1206-1207` |
| `essay.yml` 的 `home_essay` | **无此键**（组只有 title/subTitle/tips/buttonLink/buttonText/top_background/limit/essay_list） | `examples/blog/data/essay.yml:3-10` |

补充：A3 还叠加 `pageComments` 严格真值——本批所有路由都未传（Batch B 接线），缺省 undefined 即不输出；
A4b 叠加 `isCurrentRoot`，基线首页虽然 `isCurrentRoot=true` 但 `greetingBox.enable=false`，仍零输出。
（`pjax.enable: true`（theme.config.yml:986-987）只影响 A6 的 onclick/href 形态选择，不构成输出门控。）

## 3. A5 的 11 条键位与 #keyboard-tips 子结构是否与上游逐条一致？

一致。上游 `shortcutKey.pug`（23 行，`%TEMP%\shortcutKey-numbered.txt` 逐行核对）→ `ShortcutKey.astro:41-53`：

| # | key | i18n key | 上游行 |
|---|---|---|---|
| 1 | K | `shortcut.close_shortcut` | :3 |
| 2 | A | `shortcut.toggle_console` | :4 |
| 3 | M | `shortcut.play_music` | :5 |
| 4 | D | `shortcut.toggle_mode` | :6 |
| 5 | S | `shortcut.search` | :7 |
| 6 | R | `shortcut.random` | :8 |
| 7 | H | `shortcut.home` | :9 |
| 8 | F | `shortcut.fish_pond` | :10 |
| 9 | L | `shortcut.links` | :11 |
| 10 | P | `shortcut.about` | :12 |
| 11 | I | `shortcut.context_menu` | :13 |

DOM 子结构（`ShortcutKey.astro:56-71`）逐节点复刻 shortcutKey.pug:15-23：
`#keyboard-tips(class="")` > `.keyboardTitle` + `.keybordList` > `.keybordItem` ×
（`.keyGroup` > `.key`="shift "+字母）+（`.keyContent` > `.content`=i18n 文本）。
类名拼写**原样保留上游**：`keyboardTitle`（带 a）、`keybordList` / `keybordItem`（少 a）——未做任何"修正"。
`.key` 文本 = `` `shift ${item.key}` ``（上游 :21 `"shift " + item.key`）。
i18n 走 `tp(key, lang)` 透传 `site.language`（`ShortcutKey.astro:37-38`），键在
`src/i18n/locales.ts` 的 en 组 :261-272 / zh-CN 组 :428-439 / zh-TW 组 :595-606；
**default 字典没有 shortcut.\***（上游 `languages/default.yml` 就没有，locales.ts 是逐字节拷贝，缺键回落行为与上游 `_p` 一致，未补）。
门控 self-gate：`readFlag(theme.shortcutKey, 'enable')`（`ShortcutKey.astro:56`），挂载点在
`BaseLayout.astro:396`（Sidebar :387 之后、Rightside :399 之前 = 上游 layout.pug:78/:80-81/:82）。

## 4. A6 的五项语义是否全部复刻？

全部复刻（`BbTimeList.astro`；上游 `bbTimeList.pug` 17 行逐行核对）：

1. **home_essay 门控**：外层按组 `Boolean(g.home_essay)`（`BbTimeList.astro:76`，上游 :3 `if i.home_essay`），
   每个真值组输出一份 `#bbTimeList` + 一份 swiper 脚本；无真值组整体零输出。
2. **内层遍历语义**：`const slides = groups.flatMap(...)`（`BbTimeList.astro:94`）遍历**全部组**（不是当前组——
   上游 :10 内层 `each i in site.data.essay` 遮蔽外层 i），每组 `essay_list` 取前 10 条
   （`slice(0, 10)` ≙ 上游 :12 `if index < 10`）。
3. **contentText 后缀**：`contentTextOf`（`BbTimeList.astro:86-91`）三分支与上游 :13 逐字对应：
   `item.image ? content+' [图片]' : (item.video ? content+' [视频]' : content)`；后缀分支保持 JS `+` 语义、
   裸分支按 pug `=` 的 null/undefined 出空串。
4. **swiper 脚本每组一份**：`<script is:inline src={swiperJsUrl}></script>` 在 `homeEssayGroups.map` 内
   （`BbTimeList.astro:129`），`swiperJsUrl = urlFor(theme.home_top.swiper.swiper_js)`（上游 :17
   `url_for(theme.home_top.swiper.swiper_js)`）。
5. **pjax 两种 onclick/href 形态**（`BbTimeList.astro:64-66`，上游 :4-5）：
   开 → `onclick="pjax.loadUrl(&quot;/essay/&quot;);"` + `href="javascript:void(0);"`（`pjax.loadUrl` 契约由
   `head/runtime.ts:166-173` 提供）；关 → 无 onclick + `href="/essay/"`。
   DOM（上游 :6-15）逐节点：`#bbTimeList.bbTimeList.container` > `i.anzhiyufont.anzhiyu-icon-jike.bber-logo.fontbold`
   （title="即刻短文"、aria-hidden="true"，上游在 `<i>` 上挂 href，原样保留）+ `#bbtalk.swiper-container.swiper-no-swiping.
   essay_bar_swiper_container[tabindex="-1"]` > `#bber-talk.swiper-wrapper`（onclick 同上）> `a.li-style.swiper-slide`
   × slides + `a.bber-gotobb.anzhiyufont.anzhiyu-icon-circle-arrow-right`（title="查看全文"）。
   多组同出时重复 id 与上游一致（上游同样重复，不修）。
   数据 prop `essay?: unknown`（任务卡口径），examples 侧 `getSiteData<EssayGroup[]>('essay')`
   （`index.astro` / `page/[...page].astro`，同 `[...path].astro:166` 用法）。

## 5. 消费链元素存在性（静态推演，均标「待 CI 验证」）

| 消费点 | 静态推演 | 结论 |
|---|---|---|
| `main.js:1536` `getElementById("greetingBox")`（`greetingInit`，:1765 `GLOBAL_CONFIG.greetingBox &&` 注册） | 开关开（`greetingBox.enable=true`）+ 首页 → A4b 输出 `#greetingBox`，:1538 appendChild 正常；非根路径页元素不存在但 :1537 `if (!greetingBox) return` 自带守卫 | 元素由 A4b 保证（首页），无炸点。**待 CI 验证** |
| `main.js:1644` `querySelector("#keyboard-tips").classList.add("show")`（Shift 按住 200ms，无 null 守卫） | 注册前提 :1752 `GLOBAL_CONFIG.shortcutKey && getElementById("consoleKeyboard")`：`shortcutKey.enable=true` → `GLOBAL_CONFIG.shortcutKey` 真；`#consoleKeyboard` 由 Console.astro:191 输出（其构建配置缺口归 F12，另案）。前提满足时 A5 已输出 `#keyboard-tips` → 不再 TypeError | **待 CI 验证**（e2e 需真实按键序列） |
| `main.js:1686` `getElementById("keyboard-tips").classList.remove("show")`（window.onfocus，无 null 守卫） | 同 :1752 注册前提；A5 元素存在时安全 | **待 CI 验证** |
| `main.js:1693-1694` `querySelector("#keyboard-tips")` + `keyboardTips.classList.remove("show")`（Shift 释放，无 null 守卫） | 同上 | **待 CI 验证** |
| `utils.js:459` `if (!document.getElementById("bbTimeList")) return;`（`initIndexEssay`，main.js:1826 调用） | 自带守卫；A6 有 home_essay 组时进入 :461 `new Swiper(".essay_bar_swiper_container", …)`，Swiper 依赖由 A6 每组一份的 swiper_js 脚本提供 | 元素由 A6 保证（开启时）。**待 CI 验证** |
| `utils.js:472` `getElementById("bbtalk")`（:473 `!== null` 守卫） | `#bbtalk` 与 `#bbTimeList` 同时由 A6 输出 → hover 暂停 autoplay 接线成功 | **待 CI 验证** |
| `main.js:215-217` `getElementById("bbTimeList")` + `if (bbTimeList)`（scroll-down 箭头） | A6 输出后滚动目标为 `bbTimeList.offsetTop - 62`（与上游一致），否则回退 `#home_top` | **待 CI 验证** |

## 6. 跑了哪些验证命令（全白名单）？原始输出尾部

1) `node %TEMP%\verify-batch-a.mjs`（临时验证脚本，文件只写 %TEMP%；对 A1–A6 位置/门控/DOM/i18n/挂载点做 44 条静态断言）：

```
PASS A1 顺序: runtime < algolia_search < instantsearch < algolia_js
PASS A1 else 分支: local_search 在三件套之后（三元 else 支）
PASS A2 顺序: 搜索块 < colorthief < .js-pjax
PASS A3 位置: .js-pjax 内、input#page-type 之后
PASS A3 data-pjax + async: comment_barrage 脚本带 data-pjax
PASS A3 三重门: comment_barrage_config.enable && use==Twikoo && pageComments
PASS A4a 顺序: aplayer < busuanzi < accesskey
PASS A4a src: asset.busuanzi || 默认 CDN，且不套 url_for
PASS A4a 门: busuanzi 三项任一
PASS A4b 位置: 末位、accesskey 之后
PASS A4b 门: isCurrentRoot && greetingBox.enable
...
PASS BaseLayout: Sidebar < ShortcutKey < Rightside（layout.pug:78/80-81/82）
PASS BaseLayout: BbTimeList 在 main#blog-container 内、HomeTop 之前
PASS BaseLayout: AdditionalJs 转发 isCurrentRoot + pageComments
PASS types.ts: EssayGroup.home_essay?: boolean
PASS index.astro: getSiteData<EssayGroup[]>('essay') + essay={essayData}
PASS page/[...page].astro: 同样传 essay
PASS i18n en: 12 个 shortcut.* 键齐
PASS i18n zh-CN: 12 个 shortcut.* 键齐
PASS i18n zh-TW: 12 个 shortcut.* 键齐
PASS i18n default: 无 shortcut.*（与上游 languages/default.yml 一致，勿补）
ALL PASS
```

2) `node scripts/check-upstream-delta.mjs`（SHA 守卫，exit 0）：

```
[check-upstream-delta] PASS theme.config.yml 顶层键 = 133（登记表 133）
[check-upstream-delta] PASS theme.config.yml 递归 mapping key = 662（登记表 662）
[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/reference/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
```

3) `node packages/remark-hexo-tag/test/run.mjs`（exit 0）：

```
remark-hexo-tag: 65/65 通过
```

4) `node scripts/check-upstream-sync.mjs`（exit 0）：

```
[check-upstream-sync] 结论: 基线之后上游没有新提交
[check-upstream-sync] 退出码: 0
```

5) `node scripts/check-tag-styles.mjs`（exit 0）：

```
[check-tag-styles] 通过：所有带 class 的 tag 都能在上游样式里找到规则（或属上游本身未样式化的 class）
```

（另有 `git status --porcelain` / `git diff --stat` 只读命令用于核对改动面；构建/浏览器类验收一律未本地硬跑。）

## 审查修正（FIXPLAN/任务卡措辞与代码实态的差异，按代码语义实现）

1. **A6 验收措辞**：FIXPLAN A6 验收写「站点有 essay 数据时输出」是措辞简化；上游 bbTimeList.pug:3 要求
   `i.home_essay` 真值组才输出。已按代码实现（逐组 home_essay 门控），基线 essay.yml 无该键 → 零输出。
2. **A6 pjax 关形态**：任务卡写「无 onclick」；上游 pug `onclick_value = ''` 实际会渲染 `onclick=""`
   （pug 空串属性不省略）。按任务卡实现为省略属性，行为等价（空 handler vs 无 handler），此处记差异备查。
3. **shortcut i18n 语言数**：任务卡写「i18n 键 4 语言（default/en/zh-CN/zh-TW）」；实态是 shortcut.* 只存在于
   en/zh-CN/zh-TW 三个字典（`languages/default.yml` 原生就没有，locales.ts 逐字节拷贝）。未补 default（补了反而
   偏离上游），`tp()` 缺键回落与上游 `_p` 一致。
4. **busuanzi src**：上游 `src= theme.asset.busuanzi || '…'` 不套 `url_for`（其余脚本都套）；本地保持一致
   （`assets.busuanzi` 仅可能来自 `CDN.option` 覆盖，缺省官方 CDN），已在代码注释中标注。

## 待 CI 验证清单（本地沙箱无法跑构建/浏览器）

- A1：`local_search.enable=true` 构建产物含 `js/search/local-search.js` 引用；`search.spec.ts` 两条用例去 skip 可实跑。
- A2：`mainTone.mode=colorthief` 构建产物含 `color-thief.umd.min.js` 引用；`main.js:1279` 分支 `window.ColorThief` 存在。
- A3：`comment_barrage_config.enable + comments.use=Twikoo + page.comments`（Batch B 接线后）产物含
  `js/anzhiyu/comment_barrage.js`（带 data-pjax）；pjax 换页 shim 重建生效。
- A4：`busuanzi.site_uv=true` 页面含 busuanzi 脚本；`greetingBox.enable=true` 首页存在 `#greetingBox`，
  `main.js:1536` 分支不再空转。
- A5：`shortcutKey.enable=true` 构建后 DOM 含 `#keyboard-tips`；Shift 长按/释放与 window focus 无 TypeError
  （main.js:1644/1686/1693）。
- A6：essay.yml 加 `home_essay: true` 后首页输出 `#bbTimeList`/`#bbtalk`/`#bber-talk`，swiper 轮播与
  utils.js:459/472、main.js:215-217 消费链正常。
- 第 5 节全部静态推演结论的运行时复核。

## 待 F 同步清单（文档数字口径）

本批（A1–A6）**未产生任何文档数字口径变化**，无需要 F 批改的条目。附带一条非本批产生的观察供 F16 参考：
`node packages/remark-hexo-tag/test/run.mjs` 实测 **65/65 通过**（FIXPLAN DoD §3.3 写 62/62、F16 目标口径
「62/62 或指向 test/run.mjs」；系 G7 在途扩充用例所致，非本批改动）——F 批对齐时以实测或「指向 run.mjs」处理。
