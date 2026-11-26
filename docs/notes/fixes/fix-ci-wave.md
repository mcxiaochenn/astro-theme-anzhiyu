# FIX-CI-WAVE：CI run 45530122093（head 2930fe0）两红回修

> 约束遵守：零 git 写操作；未跑 astro build / Playwright / Lighthouse（本地沙箱不允许）；
> 未碰 `examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml`；
> 未触 golden 对比层（render.mjs / global-config.ts / astro.config.mjs）。
> 两路各写自己的章节，本文件由各路 append。

---

## e2e remove 根因（agent-14：前进/后退 JS 异常）

### 1. 失败与栈（trace 精确定位）

CI 证据：`tests/e2e/navigation.spec.ts:78`「浏览器前进/后退后页面可用，且 console 无运行时错误」
首跑 + retry1 双红，断言收集到 3 条未捕获异常（每次导航 1 条）：

```
TypeError: Cannot read properties of undefined (reading 'remove')
    at cleanupPeopleCanvas (http://127.0.0.1:4321/js/anzhiyu/people.js:185:15)
    at HTMLDocument.<anonymous> (http://127.0.0.1:4321/js/anzhiyu/people.js:208:5)   ← pjax:send 监听
    at a (…/_astro/BaseLayout.astro_astro_type_script_index_0_lang.BBgDs-2V.js:1:458)  ← runtime.ts dispatch
    at HTMLDocument.<anonymous> (…/BaseLayout…js:1:1728)                              ← astro:before-swap
    at w / H (…/_astro/client.C5tmiID1.js)                                             ← Astro ClientRouter
```

来源：`.ci-logs/pwreport/test-results/…-retry1/trace.zip` → `1-trace.trace` 三条 `pageError`
（time 17673 / 17869 / 17987，与点击、后退、前进三次导航一一对应），location 均为
`js/anzhiyu/people.js:184:14`。抛点与 `packages/astro-theme-anzhiyu/assets/js/anzhiyu/people.js:185`
（修复前 `gsap.ticker.remove(render)`）逐字对应。

### 2. 机制还原

1. demo 站 `peoplecanvas.enable: true`（`GLOBAL_CONFIG.peoplecanvas.img` 为外部图床 URL），
   AdditionalJs.astro 内联引导：`typeof gsap === "object"` 不成立 → `getScript(gsap_js)`（外部
   CDN）`.then(() => getScript(people_js, {defer:true}))`。
2. **G1（2fa0bf7）** 把本 spec 换用 helpers 的扩展 test → `isolateExternalRequests` 把外部脚本
   fulfil 成 `THIRD_PARTY_STUB`。**G1 时点的 gsap 桩只有 `{ set, to, timeline }`，没有 `ticker`**。
   `typeof gsap === "object"` 成立，people.js 正常加载（首方脚本，本地资源，隔离不影响）。
3. people.js 模块级绑定 `document.addEventListener("pjax:send", cleanupPeopleCanvas)`。
   runtime.ts 在每次 ClientRouter 导航（astro:before-swap）派发 `pjax:send`。
4. `cleanupPeopleCanvas` 里 `gsap.ticker.remove(render)`：桩 gsap 的 `ticker` 是 undefined →
   对 undefined 取 `.remove` → TypeError。点击/后退/前进 3 次导航 = 3 条异常。
5. `pjax:success` 的重初始化路径（`gsap.ticker.add`）同理是同族雷，这次没炸只因
   runtime.ts 补发的是 `pjax:complete` 而非 `pjax:success`（上游脚本监听事件名的兼容差异，
   本次不动），但一并加了守卫。

**「of undefined 而非 of null」** 的线索吻合：`gsap.ticker`（属性值 undefined）上取 `.remove`，
若 gsap 整个缺失会先在 `gsap.ticker` 处报「reading 'ticker'」——所以 gsap 在（桩在）、ticker 不在。

### 3. 根因类：隔离暴露的旧问题（两者叠加）

| 维度 | 判定 |
|---|---|
| 抛点代码新旧 | **旧代码**。people.js 自 P7-6（4a81d5e）入库，eb3f493 时已存在且该行完全一致 |
| 为何 eb3f493 绿 | 当时本 spec 用裸 `@playwright/test`，**没有外部隔离**：真实 gsap CDN 加载成功则 `ticker` 存在、异常不抛；CDN 不可达则 getScript promise 不 resolve、people.js 根本不加载。两种情况都不炸 |
| 为何现在红 | G1 隔离把 gsap 换成缺 `ticker` 的最小桩，**造出「gsap 在但 ticker 不在」的第三种状态**——恰好落在 people.js 无守卫清理路径的盲区 |
| 结论 | **隔离暴露的旧问题 + 桩覆盖面缺口叠加**。不是 A 批新增脚本块的 bug（demo 配置全关、零输出，与本栈无关）；也不是「新代码抛的」。**不删断言、不放宽「无运行时错误」验收** |

### 4. 修法（双管齐下，各治一半）

**① 本地兜底（代码）** `packages/astro-theme-anzhiyu/assets/js/anzhiyu/people.js`：
3 处 `gsap.ticker.*` 调用（cleanup 的 `remove`、init 与 pjax:success 的 `add`）统一加
`if (gsap.ticker)` 守卫。真实 gsap（ticker 必在）行为逐字节不变，上游语义保留；gsap 残缺时
清理路径安全 no-op 而不是 TypeError。people.js 是运行时资源，**不进 golden 对比层输出**，
不影响 diff-html。

**② 桩补齐（测试）** `tests/e2e/helpers.ts` 的 `THIRD_PARTY_STUB`：gsap 桩从
`{ set, to, timeline }` 扩为覆盖 people.js 全部 API 面——`parseEase`（返回恒等缓动）、
`ticker: { add, remove }`、`timeline()` 返回可链式的 `{ timeScale, to, eventCallback, kill, progress }`。
这与 `isolateExternalRequests` 的设计意图一致（桩的意义就是「外部 CDN 不可达不伪装成产品
bug」——G1 之前的桩反而制造了产品 bug 假象）；对照先例：about 页的 `CountUp`/`gsap` 桩就是
按「主题会调到的全局」逐一补的，people.js 的 ticker/parseEase 是同类遗漏。

为什么两条都做：守卫治「代码对残缺 gsap 的脆弱性」（真实用户环境 CDN 半加载也会命中）；
补桩治「测试环境与真实 gsap 的 API 面漂移」（否则将来任何 spec 触发 peoplecanvas 初始化路径
`gsap.parseEase` 还会再炸一次）。验收断言（`errors.pageErrors` 为空）原样保留。

### 5. 验证

**node 白名单（全部 exit 0，确认没打破其它断言）**：

| 命令 | 结果 |
|---|---|
| `node packages/astro-theme-anzhiyu/scripts/check-loader.mjs` | PASS 43/43 |
| `node packages/astro-theme-anzhiyu/scripts/check-schema.mjs` | PASS（上游零错误 + 3 用例） |
| `node packages/astro-theme-anzhiyu/scripts/check-helpers.mjs` | PASS 269/269 |
| `node packages/astro-theme-anzhiyu/scripts/check-i18n.mjs` | PASS 83/83 |
| `node packages/astro-theme-anzhiyu/scripts/check-date.mjs` | 62 PASS / 0 FAIL |
| `node packages/astro-theme-anzhiyu/scripts/check-slugger.mjs` | 49 PASS / 0 FAIL |
| `node scripts/check-upstream-delta.mjs` | PASS 29/29 |

**node 级针对性验证**（`%TEMP%\verify-e2e-remove-fix.mjs`，vm 沙箱把 people.js 的
`pjax:send` / `pjax:success` 监听器在三种 gsap 形态下逐一触发）：12/12 PASS。

关键用例（复现载体用 CI 构建产物 `.ci-logs/dist/.../js/anzhiyu/people.js`，修复前无守卫代码）：

```
A1 旧桩 + 修复前 dist 代码  → TypeError: Cannot read properties of undefined (reading 'remove')  ← 逐字复现 CI
A2 新桩 / 旧桩 + 修复后代码 → 零异常（守卫与补桩各自独立兜住）
A3 完整 gsap + 修复后代码   → 零异常，且 ticker.remove(render) 仍真被调用（calls=1，上游语义不变）
A4 pjax:success 重初始化    → 新桩/完整 gsap 均零异常，完整 gsap 下 ticker.add 仍执行
B  THIRD_PARTY_STUB 提取 eval → gsap 桩 API 面齐全（ticker/parseEase/timeline 链），既有 10 个
   第三方全局桩（Fancybox/LazyLoad/Snackbar/QRCode/waterfall/APlayer/Meting/Pace/CountUp/socialShare）
   一个不少
```

`node --check` people.js 语法 exit 0。

**e2e 无法本地跑**（约束：禁跑 playwright）→ **待 CI 验证**。预期：navigation.spec.ts:78 三条
用例全绿（本修复消掉唯一红因，另两条本来就绿），其余 spec 的既有断言不受影响（helpers 桩只增不减）。

### 6. 改动清单（本路写范围）

| 文件 | 改动 |
|---|---|
| `packages/astro-theme-anzhiyu/assets/js/anzhiyu/people.js` | 3 处 `gsap.ticker.*` 调用加 `if (gsap.ticker)` 守卫（:185 / :200 / :217） |
| `tests/e2e/helpers.ts` | `THIRD_PARTY_STUB` 的 gsap 桩补 `ticker`/`parseEase`/`timeline` 链式 API + 注释 |
| `docs/notes/fixes/fix-ci-wave.md` | 本报告 |

未触碰：golden 对比层（render.mjs / global-config.ts / astro.config.mjs）、
`examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml`、任何 spec 的断言。

---

## golden 语义对齐（agent-13：build 红的 2 页）

### 0. 结论

两页根因各自坐实并修复：① 24531 段内软换行 `<br>` 缺失 → 自定义 Markdown 处理器补
`breaks: true` 语义（零依赖 remark 插件）；② longform 的 `postAI: 'true'` vs `''` →
序列化恢复上游同形，「'true' 不当摘要」的改进移入消费层。node 级验证 **14/14 全绿**，
24531 页 p[1]/p[2] 与 golden **逐节点严格一致**（br 数量与文本节点切分 JSON 全等）；
23 个 fixtures 全量附带影响扫描确认软换行变化只落在 abbrlink-post.md。待下一轮 CI。

### 1. ① /2024/11/20/24531/：段内软换行 → `<br>`

**根因**：上游 hexo-renderer-marked 默认 `breaks: true`
（`.baseline-work/node_modules/hexo-renderer-marked/index.js:10`，marked 的 `br(){return"<br>"}`，
段内单换行 → `<br>`）；我们的自定义处理器（`examples/blog/astro.config.mjs`
hexoMarkdownProcessor → `createMarkdownProcessor`）走 CommonMark 默认——remark 把软换行留在
mdast `text` 节点的 `\n` 里，mdast-util-to-hast 的 text handler 把 `\n` 折叠成空格。
fixtures 的段内换行此前都藏在 tag/代码块里没暴露，abbrlink-post.md 是第一篇正文带软换行的
fixture。diff 证据（`.ci-logs/dist/diff-report.json`，7 处）：p[1] 缺 `br[1]`/`br[2]` +
text()[2]/[3]、[6]/[7] 被空格合并，p[2] 缺 1 br。

**修法**（`examples/blog/astro.config.mjs`，零新依赖）：

1. `remarkHexoSoftBreaks`：remark 插件，把 mdast `text` 节点里的 `\n` 拆成
   `text + break` 节点序列（remark-rehype 渲染 `<br>`）。只动 text 节点；
   **挂在 remarkHexoTag 之后**——它的 transformer 从原文重建整棵树
   （`tree.children = ctx.md(source)`，remark-hexo-tag/src/index.mjs），先跑会被覆盖；
   换行前的行尾空格按 marked br 正则 `^( *|\\)\n` 语义吞掉。
2. `remarkRehype: { handlers: { break: hastBreakBare } }`：覆盖 mdast-util-to-hast 默认的
   `[<br>, "\n"]` 为裸 `<br>`（marked `br()` 同形），文本节点切分与 golden 严格一致
   （默认 handler 的尾随 `\n` 会并进后继文本节点，严格比对会差一个前缀）。
3. **tag 岛规则**（与 remarkHexoTag 共存的关键）：text 节点两侧兄弟都是 html/raw 时，
   该节点的 `\n` **不拆**。实证：golden `.baseline-html/2025/03/18/tags-block/index.html:228-229`
   的 hideInline 产物 `点我查看\n  </button>` **没有** `<br>`，而拿 .baseline-work 同版 marked
   对同一字符串是**会**出 `<br>` 的（探针见下）——说明上游 tag 渲染在 marked **之后**做模板
   替换（`{% %}` 先被 marked 当字面文本过掉，再 splice 模板 HTML），模板字面换行不走 breaks
   语义。remark-hexo-tag 的模型是「tag 先展开再 parse」，模板换行会落进 text 节点；不加这条
   规则 tags-block 页会被本修复引入新 FAIL（第一版插件实测多出 1 处 br，加规则后消失）。

marked 语义探针（`node` 直接调 .baseline-work 同版 marked，`breaks:true`，原始输出）：

```
IN : "foo\nbar"
OUT: "<p>foo<br>bar</p>\n"
IN : "x <button type=\"button\" class=\"hide-button\" style=\"\"> 点我查看\n  </button><span>t</span>。"
OUT: "<p>x <button type=\"button\" class=\"hide-button\" style=\"\"> 点我查看<br>  </button><span>t</span>。</p>\n"
```

对照 golden tags-block:228-229 原文：`style=""> 点我查看` ↵ `  </button><span class="hide-content">…`
（无 `<br>`）→ 上游模板换行不经过 marked 的 breaks 语义，实锤 tag 后置渲染。

**验证（原始输出；处理器 = astro.config.mjs 同款 `hexoMarkdownProcessor.createRenderer({})`）**：

(a) 软换行（4 例全 PASS）：

```
输入: "第一行\n第二行\n第三行"
输出: <p>第一行<br>第二行<br>第三行</p>
输入: "上游 abbrlink 插件会把 permalink\n的最后一段从 `:title` 换掉。"
输出: <p>上游 abbrlink 插件会把 permalink<br>的最后一段从 <code>:title</code> 换掉。</p>
输入: "收口成\n`site.ts` 的解析。"
输出: <p>收口成<br><code>site.ts</code> 的解析。</p>
输入: "尾随空格行 \n下一行"
输出: <p>尾随空格行<br>下一行</p>
```

(b) 无软换行回归：fixtures 单行段落/列表块（验证点标题 + 列表 + （完））prod 与修复前对照臂
**逐字节一致**；硬换行（行尾两空格）仅 `<br>\n` → `<br>` 收紧（golden 同形，br 语义不变）：

```
prod  : "<p>硬换行上一行<br>硬换行下一行</p>"
legacy: "<p>硬换行上一行<br>\n硬换行下一行</p>"
```

附带影响扫描（23 个 fixtures 全量 prod vs 修复前对照臂）：除 abbrlink-post.md 外全部
`identical`（tags-block.md 第一版多出的 hideInline br 已被 tag 岛规则消掉）；
abbrlink-post.md 恰好 +3 br，与 diff 报告的 br[1]/br[2]/p[2] 一一对应：

```
abbrlink-post.md: 有差异（prodBr=3 legacyBr=0）
  prod  …"de>。上游 abbrlink 插件会把 permalink<br>的最后一段从 <code>:title</code>…"
  legacy…"de>。上游 abbrlink 插件会把 permalink\n的最后一段从 <code>:title</code>…"
其余 22 个 fixtures：identical
```

(3) 24531 页 p[1]/p[2] 逐节点对照（parse5 解析 golden 与修复后渲染输出，节点签名序列 JSON
**全等**，文本节点值逐字相同）：

```
golden p[1] (2 个 br): [{"t":"text","v":"这篇文章的 front-matter 写了 "},{"t":"code",…abbrlink: 24531…},
  {"t":"text","v":"。上游 abbrlink 插件会把 permalink"},{"t":"br"},{"t":"text","v":"的最后一段从 "},
  …,{"t":"text","v":"，所以本文的"},{"t":"br"},{"t":"text","v":"真实路由是 "},…{"t":"text","v":"。"}]
ours   p[1] (2 个 br): <同上，JSON 全等>
golden p[2] (1 个 br): [{text "任一列表…」收口成"},{"t":"br"},{"code site.ts"},{"text " 的 "},…]
ours   p[2] (1 个 br): <同上，JSON 全等>
```

### 2. ② /2024/11/01/longform-hexo-astro/：postAI 序列化恢复上游同形

**根因**：golden `postAI: 'true'`（fixture `ai: true`），我们 `postAI: ''`。B1（FIXPLAN §4
同类风险）把「`ai: true` 不把 'true' 当摘要」的改进做到了**对比层**——路由层
`typeof ai === 'string' ? ai : undefined` 把布尔 true 丢了。对比层输出必须与上游逐字节同形：
上游 `config_site.pug:2,5,30` 是 `escapeQuote(page.ai)`（truthy → `String(page.ai)`，
falsy → `''`）。

**修法**：

a. 序列化恢复上游同形（产出点 = 路由传参，本路最小改动）：
   - `examples/blog/src/pages/[year]/[month]/[day]/[slug].astro:119`：
     `postAI={page.data.ai ? String(page.data.ai) : undefined}`（true→'true'、'文本'→'文本'、
     false/空/undefined→''，与上游 escapeQuote 真值语义逐形态一致）；
   - `examples/blog/src/pages/[...path].astro:159` 同步；
   - `global-config.ts` 的 `escapeQuote` 本就与上游 pug 逐字同构，模板行
     `postAI: '${escapeQuote(input.postAI)}',` 不动（核实过仍是上游形状）。
b. 改进移到**消费层**（不参与 HTML 逐字节对比的 JS）：
   `packages/astro-theme-anzhiyu/assets/js/anzhiyu/ai_abstract.js` 的 `aiAbstractLocal()`
   （local 模式 `postAI.split(',')` 摘要候选）对字面 `"true"` 候选做守卫——视为开关剔除；
   候选耗尽回退 fill 描述（`pageFillDescription`）；`postAI: ''` 空候选保持原空摘要动画行为；
   `ai: "摘要文本"` 单候选、`"a,b"` 多候选随机语义不变。`node --check` 语法 exit 0。
c. B1 验收语义不回退：`ai: true` 时用户可见摘要 = fill 描述（无字面「true」）；
   `ai: "摘要文本"` 正常显示。另核实 `renderAiInfo`（render.mjs）只做门控
   （`fill && page.ai` 真值），**不**把 ai 值当摘要文本，无需改；`PostAiDescription.astro`
   注释里「postAI 不得落成 "true"」的旧契约已更正为「序列化同形 + 消费层守卫」。

**验证（(c) postAI 序列化断言；抽真实代码 eval：global-config.ts 的 escapeQuote +
两处路由层真实表达式）**：

```
undefined → postAI: ''
true      → postAI: 'true'
"文本"    → postAI: '文本'
false     → postAI: ''     （上游 escapeQuote falsy 语义，附加断言）
```

### 3. 白名单 / 回归（原始输出）

```
node scripts/check-upstream-delta.mjs      → [check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0（exit 0）
node packages/remark-hexo-tag/test/run.mjs → remark-hexo-tag: 65/65 通过（exit 0；本路未动该包，链路相邻防回归）
node --check …/ai_abstract.js              → exit 0
```

### 4. 改动清单（本路写范围）

| 文件 | 改动 |
|---|---|
| `examples/blog/astro.config.mjs` | 新增 `remarkHexoSoftBreaks` + `hastBreakBare`（remarkRehype handlers.break）并挂进 hexoMarkdownProcessor；具名导出处理器与纯函数供验证脚本复用 |
| `examples/blog/src/pages/[year]/[month]/[day]/[slug].astro` | :119 postAI 改 `String(page.data.ai)` 真值形态 |
| `examples/blog/src/pages/[...path].astro` | :158-159 同上 + 注释更正 |
| `packages/astro-theme-anzhiyu/assets/js/anzhiyu/ai_abstract.js` | aiAbstractLocal 加 `"true"` 候选守卫 + fill 描述回退 |
| `packages/astro-theme-anzhiyu/src/components/post/PostAiDescription.astro` | 仅注释：postAI 契约说明更正（旧文与新序列化矛盾，属 postAI 传参链） |
| `docs/notes/fixes/fix-ci-wave.md` | 本章节 |

未动：`tests/e2e/**`、`packages/remark-hexo-tag/**`、`third-party/render.mjs`、
`head/global-config.ts`、fixtures 正文、`examples/blog/src/styles/upstream/**`、
`examples/blog/theme.config.yml`。

### 5. 已知残留 / 待 CI 清单

- **残留语义缝**（已文档化，golden 与 fixtures 均不涉及）：正文里「两个行内 HTML 标签之间
  夹的文本」含 `\n` 时（如 `<span>a</span>\nx <em>b</em>`），tag 岛规则保留字面换行，而 marked
  探针会给 `<br>`。这是 remark-hexo-tag「tag 先展开」模型与上游「marked 先跑」模型的固有缝
  （同类还有 tag 参数里的 markdown 语法处理时序）。踩到时 N2 空白归一大概率仍 PASS，但
  建议后续给 remark-hexo-tag 的展开产物记 provenance、按来源精确豁免，而不是按兄弟节点猜。
- **待 CI（build / diff-html）**：`/2024/11/20/24531/` 的 7 处 diff 归零（3 个 br + 文本切分
  已 node 级严格对齐）；`/2024/11/01/longform-hexo-astro/` 的 `script#config-diff` postAI
  恢复 `'true'`；其余 47 页 diffCount 维持 0（附带影响扫描 + 白名单本地已绿）。
- **待 CI（e2e 路，agent-14）**：navigation.spec.ts:78 由 people.js 守卫修复负责。本路只改
  AI 摘要页（longform）的运行时文案（ai:true → 显示 fill 描述而非空动画），现有 e2e spec
  无 AI 摘要断言（navigation/dark-mode/music/console/right-menu/page-types），预期无交互。
- 本地沙箱禁跑 astro build / playwright / lighthouse，页面级最终确认以 CI 产物 diff-report 为准。
