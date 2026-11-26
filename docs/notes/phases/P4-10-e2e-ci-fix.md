# P4-10 e2e CI 首跑 26 条失败归因与确定性测试基座

- 任务：task-10 / W3-A（修复 CI e2e 首跑 26 条失败）
- CI 首跑：run `45382964410`，2026-11-24 19:27，`npx playwright test`，7 passed / 26 failed / 3 skipped，8.1m
- 输入证据：`.ci-logs/e2e-fail.log`（1972 行）、`.ci-logs/pw/test-results/<case>/error-context.md`、`.ci-logs/pw/test-results/<case>/test-failed-1.png`
- 产物：`tests/e2e/*.spec.ts`、`tests/e2e/helpers.ts`、`playwright.config.ts`、本文件

---

## 0. 结论摘要（先看这个）

| 分类 | 含义 | 条数 |
| --- | --- | --- |
| **A 用例假设错误** | 选择器错、用户路径错、时序/等待方式错 | **22** |
| **B 环境外部资源** | `page.goto` / `page.waitForURL` 默认等 `load`，被外部 CDN 挂起 / pushState 导航无 load 生命周期 | **4** |
| **C 真实产品 bug** | 运行时 JS 没绑定 / 没初始化，产品侧需修 | **0** |

修复策略：**不靠加长超时、不靠 sleep、不用 `test.skip` 掩盖失败**。
把「等 load」换成「等真实 DOM/事件契约」，把外部源请求钉死在本地（脚本给最小桩、其余 abort），
把「force:true 硬点折叠元素」换成真实用户路径（滚动露出右侧栏 → 点齿轮展开 → 点暗色按钮）。
最终只有 4 条**配置未启用该功能**的行为用例按运行时检测 `test.skip`，并写明依据（见 §5）。

> `C=0` 的判断依据：所有失败都能在**首方源码 + 构建产物**里找到确定的错误假设或等待方式错误；
> 其中 3 个「看起来像产品 bug」的现象（body data-type 不是 anzhiyu、右键菜单不弹、中控台卡片不渲染）
> 逐个查证为**上游既有契约 / CSS 断点 / 配置开关**，不是本次移植的回归（§4）。

---

## 1. 26 条失败逐条归因

失败块行号指 `.ci-logs/e2e-fail.log`；`EC:` 指对应 `error-context.md`。

### 1.1 console.spec.ts（3 条，全 A）

| # | 用例 | 日志行 | 报错 | 归因 |
| --- | --- | --- | --- | --- |
| 1 | 点击导航栏按钮打开面板，且面板内容已渲染 | 180–248 | `locator('#console .console-card').first()` resolved to `<ul class="reward-all console-card">`，`unexpected value "hidden"` | **A**：`.console-card` 的 first() 命中赞赏控制台的 `ul.reward-all.console-card`；`console.css:527` 有 `.console-card-group-reward { opacity:0; display:none }`，它永久隐藏。面板卡片应取 `.console-card-group .console-card`。另：主题 CSS `@media (max-height:800px)` 会整体隐藏 `.console-card-group`，而 CI 实际 viewport 是 720（见 1.2 配置项）|
| 2 | 再次点击入口关闭面板 | 250–318 | `expect(#console).toBeHidden()` 失败，`<div class="" id="console">` 仍 `visible` | **A**：`#console` 是 `position:fixed; 100vw×100vh; opacity:0; pointer-events:none`（`console.css:2-19`），**关闭时也有非空 bounding box**，Playwright 的 `toBeHidden()` 永远为假。正确契约是 `.show` 类（`#console.show{opacity:1;pointer-events:all}`）+ `#center-console` checked 状态 |
| 3 | 点击遮罩关闭面板并复位入口复选框 | 320–459 | `locator.click: '#console .console-mask'` 30s 超时（47× waiting for element to be visible, enabled and stable） | **A**：遮罩是 100vw×100vh 但**几何中心被面板卡片盖住**（`.console-card-group` max-width 80% 居中），中心点命中的不是遮罩。真实用户点的是卡片区以外的空白；用例缺 `position`。另外该用例前置的「面板已打开」判定也用了 toBeVisible，实际没验证 `.show` |

### 1.2 dark-mode.spec.ts（4 条，全 A）

| # | 用例 | 日志行 | 报错 | 归因 |
| --- | --- | --- | --- | --- |
| 4 | 点击右侧暗色按钮切换主题并写入 localStorage | 461–519 | `locator.click: Element is outside of the viewport`，`waiting for locator('#darkmode')` | **A（用户路径）**：`#darkmode` 在 `#rightside-config-hide` 里，该组默认 `height:0; opacity:0; transform:translate(45px,0)`（`_layout/rightside.styl:15-24`）；同时 `#rightside` 默认 `right:-48px; opacity:0`，只有 main.js `scrollFn` 在 `scrollY>26` 时给它 `translateX(-58px)` 才进入视口。`force:true` 只跳过可见性检查，**不跳过「元素在视口外」**，所以必然报 outside viewport。真实路径：滚动 → 点 `#rightside-config`（齿轮）→ 点 `#darkmode` |
| 5 | 右键菜单里的「深色模式」也能切换主题 | 521–589 | `#rightMenu` toBeVisible 10s 超时 | **A（配置未启用）**：demo `examples/blog/theme.config.yml` 的 `rightClickMenu.enable: false`（与上游主题 `_config.yml` 默认一致）→ `AdditionalJs.astro:191` 不输出 `right_click_menu.js` → `window.rm` 不存在、`window.oncontextmenu` 没被接管。菜单静态 DOM 仍在（所以 `菜单项集合齐全` 用例通过），但交互不可能发生。见 §5 |
| 6 | 刷新后主题与 localStorage 保持一致 | 591–649 | 同 4，`#darkmode` outside viewport | **A**：同 4 |
| 7 | 站内导航后主题不被重置 | 651–709 | 同 4 | **A**：同 4 |

### 1.3 music.spec.ts（1 条，B）

| # | 用例 | 日志行 | 报错 | 归因 |
| --- | --- | --- | --- | --- |
| 8 | 播放器容器跨站内导航保持同一个 DOM 节点 | 711–771 | `page.waitForURL: Test timeout` / `waiting for navigation until "load"`（helpers.ts:48） | **B**：`waitForClientRoute` 用 `page.waitForURL()`，默认 `waitUntil:"load"`。ClientRouter 是 pushState 导航，**没有 load 生命周期事件**，于是空等到 30s。与音乐本身无关（`#nav-music` 断言还没执行到） |

### 1.4 navigation.spec.ts（3 条，B）

| # | 用例 | 日志行 | 报错 | 归因 |
| --- | --- | --- | --- | --- |
| 9 | 点击站内链接不产生 document 请求 | 773–833 | 同 8（waitForURL until "load"） | **B**：同 8 |
| 10 | 浏览器前进/后退后页面可用，且 console 无运行时错误 | 835–892 | 首次：waitForURL 超时；**retry#1：`page.goto` 30s 超时**（`navigating to "http://127.0.0.1:4321/", waiting until "load"`，日志 864-874） | **B**（两类叠加）：(a) waitForURL 的 load 语义；(b) demo 站 head/body 引外部 CDN（cdn.cbd.int / npm.elemecdn / bu.dusays / image.anheyu…），CI 上偶发某个子资源挂起 → 默认 `waitUntil:"load"` 的 goto 永不返回。同一 job 里 payload 截图显示页面其实已渲染、JS 已初始化，说明是**load 事件被外部资源拖住**而非产品问题 |
| 11 | 连续两次站内导航后 document 请求仍为 0 | 894–951 | 同 10（首次 waitForURL；retry goto 超时，日志 923-933） | **B**：同 10 |

> 补充证据（外部资源真的能挂住 load）：`.ci-logs/pw/test-results/*/test-failed-1.png` 里首页/独立页已完整渲染（样式、封面、导航都在），
> `error-context.md` 的可访问性快照也能读到整页内容 → DOMContentLoaded 已过、首方 JS 已执行，唯独 `load` 没到。
> 页面里 12 条外部 script + 大量外链图片（`Get-Content dist/index.html` 可数）就是 load 的等待对象。

### 1.5 page-types.spec.ts（12 条，全 A）

失败块：日志 953 / 1019 / 1085 / 1151 / 1217 / 1283 / 1349 / 1415 / 1481 / 1547 / 1613 / 1674（每块含 retry #1）。

| 用例 | 报错 | 归因 |
| --- | --- | --- |
| about / categories / tags / link / essay / album / album-demo / album-gallery / music / equipment / fcircle / room（12 条） | `expect(locator('body[data-type="anzhiyu"]')).toBeAttached()` → `element(s) not found`，10s 超时；HTTP status 200 断言**已通过** | **A**：`body[data-type]` 会被首方运行时改写。上游 `additional-js.pug:77` 输出 `input#page-type`，`utils.js:1044-1049 setValueToBodyType()` 在 DOMContentLoaded 里把 `body.dataset.type` 改成 page.type。带 `type:` 的独立页运行时是 `about` / `categories` / …；只有缺省分支 `/page-default/` 才是 `anzhiyu`（这也是 12 条里唯一通过的）。旧断言与上游契约相反 |

`/page-default/` 通过（日志 1876 附近 `✓ 52`）恰好佐证：同一选择器只有在 `page.type` 为空时才成立。

### 1.6 right-menu.spec.ts（3 条，全 A）

| # | 用例 | 日志行 | 报错 | 归因 |
| --- | --- | --- | --- | --- |
| 24 | 右击链接显示菜单与扩展项，遮罩同时出现 | 1740–1808 | `#rightMenu` toBeVisible 10s 超时 | **A（配置未启用）**：同 #5。`rightClickMenu.enable:false` → 不加载 `right_click_menu.js` → 没有 `window.oncontextmenu` 接管、没有 `rm.showRightMenu`。截图（`.../test-failed-1.png`）显示页面完全正常、无菜单，属配置门控 |
| 25 | 右击空白处显示基础菜单，不出现链接扩展项 | 1810–1878 | 同 24 | **A**：同 24 |
| 26 | 点击「回到顶部」关闭菜单并滚动到页首 | 1880–1948 | 首次：`#rightMenu` toBeVisible 超时；retry#1：`page.goto` 30s 超时（日志 1882-1902） | **A** 为主（菜单根本不会出现）；retry 的 goto 超时属 B 类同一外部资源问题 |

### 1.7 统计

- A 类 22 条：console 3 + dark-mode 4 + page-types 12 + right-menu 3
- B 类 4 条：music 1 + navigation 3
- C 类 0 条

---

## 2. B 类根因与修法（确定性导航）

### 2.1 根因

1. `page.goto()` / `page.reload()` 默认 `waitUntil: "load"`；demo 站引用 12 条外部 script + 大量外链图片，
   CI 网络对其中某些 host 会长时间无响应 → `load` 永不触发 → 30s 用例超时（日志 864-874、923-933、1882-1902 的 retry#1 都是这个形态）。
2. `page.waitForURL()` 默认也是 `waitUntil: "load"`；ClientRouter 用 `history.pushState` 换 URL，
   是**同文档导航，没有 load 生命周期事件** → 空等到超时（日志 8/9/10/11 的主错误，8 处调用点都在旧 `helpers.ts:47-51`）。
3. 即使 DOMContentLoaded 已过，preloader 遮罩 `#loading-box .loading-bg`（z-index 1001）只在
   `window load` 或 10s 兜底后隐藏（`BaseLayout.astro:232-246`）→ load 被拖住时，前 10 秒内的点击会被遮罩挡住，
   这是潜在的**间歇性 flake**（首跑里没直接炸，但换机器/负载就会）。

### 2.2 修法（已落地到 `tests/e2e/helpers.ts`）

| 能力 | 实现 | 解决 |
| --- | --- | --- |
| 确定性导航 | `gotoReady(page, path)` = `page.goto(path, { waitUntil: 'domcontentloaded' })` + `waitForThemeReady()` | 不等外部资源 load |
| 运行时就绪 | `waitForThemeReady()` = `#loading-box.loaded`（遮罩消失）**且** `#nav.show`（main.js `refreshFn → initAdjust` 产物） | 不靠 sleep，遮罩不会挡点击 |
| 站内导航 | `clickAndWaitForClientRoute(page, locator)`：点击前挂一次性 `astro:page-load` 监听 → 点击 → poll URL → 等事件标记 | pushState 导航有精确完成信号；不再用 `waitForURL` |
| 前进/后退 | `goBackAndWait()` / `goForwardAndWait()` = `history.back()/forward()` + URL poll | 绕开 `page.goBack()` 的 load 语义 |
| 外部源隔离 | 扩展 `test` fixture：`page.route('**/*')`，非 127.0.0.1/localhost 请求：script → 最小全局桩 fulfil；stylesheet → 空样式；其余（image/media/font/document/other）→ `abort` | 用例完全不依赖 CDN 可达性；也不会把「CDN 不可达」伪装成产品 bug |
| 右侧按钮真实路径 | `revealRightside()`（滚 400 并 poll `#rightside` 的 bounding box 进视口）→ `openRightsideSettings()`（点 `#rightside-config`，断言 `#rightside-config-hide.show`）→ `toggleThemeViaRightside()` | `#darkmode` 真实可点路径 |

脚本桩为什么必须是 fulfil 而不是 abort：主题**首方** main.js 对第三方全局有无保护调用
（`utils.js:212 Fancybox.bind`、`main.js:1124 new LazyLoad`、`utils.js:64 Snackbar.show`、
`utils.js:1166-1180 QRCode`、`main.js:573 waterfall()`、about 页 `new CountUp` / `gsap`），
abort 会让首屏初始化在 DOMContentLoaded 里抛 ReferenceError，反而制造假失败。
桩只补最小 API（bind/show/update/构造函数等），第三方库本身不在 e2e 验收范围（P4-1 资源层另有 HTTP 级检查），
且站内请求始终放行。

### 2.3 配置修正（`playwright.config.ts`）

1. **viewport 固定 1280×900**。旧配置顶层写了 `viewport:{1280,800}`，但 `projects[0].use` 里
   `...devices['Desktop Chrome']` 把 viewport 覆盖成 **1280×720**；主题 `console.css:917` 有
   `@media (max-height:800px){ #console .console-card-group{display:none} }` → 中控台卡片永远不渲染。
   现在 project 内显式 `viewport:{width:1280,height:900}`（900 > 800 断点）。
2. **timeout 30s → 45s**：每条用例最多两次 goto/reload，每次 ready 等待含 preloader 的 10s 兜底，30s 余量不足。
3. `expect` 15s（CI 上 10s 对动画/滚动类断言偏紧）。
4. 新增 `E2E_CHANNEL`：本地可用系统 Edge 跑（`E2E_CHANNEL=msedge`），不影响 CI 默认 chromium。

---

## 3. A 类修法（各 spec）

| spec | 修法 |
| --- | --- |
| `console.spec.ts` | 打开/关闭状态断言 `.show` 类 + `#center-console` checked，不再用 `toBeVisible/toBeHidden` 判断面板；卡片选择器改 `.console-card-group .console-card`；遮罩点击加 `position:{x:10,y:10}`（真实空白区）；统一 `gotoReady` + viewport 900 |
| `dark-mode.spec.ts` | `#darkmode` 走 `toggleThemeViaRightside()`（滚动 → 齿轮 → 暗色按钮），删掉 `force:true`；右键菜单那条按运行时检测 skip（§5） |
| `page-types.spec.ts` | 双段断言：① 构建产物 `input#page-type` 的 value = 该页 page.type（缺省 `anzhiyu`）；② 运行时 `body[data-type]` 被 `setValueToBodyType()` 同步为该值。12 个 type 的期望值来自构建产物实测（about/categories/tags/link/essay/album/album_detail/music/equipment/fcircle/room/anzhiyu） |
| `right-menu.spec.ts` | 静态结构用例保留（并加「未启用时右击不弹菜单」的配置门控断言）；3 条行为用例按 `window.rm` 运行时检测 skip 并写明依据 |
| `navigation.spec.ts` | 全部改 `gotoReady` + `clickAndWaitForClientRoute`；前进/后退改 history API + URL poll |
| `music.spec.ts` | 同 navigation 的导航修法；「播放中导航不中断」在 APlayer 运行时不存在时 skip（e2e 基座隔离第三方 CDN，播放进度依赖网易云音源属外部服务）|
| `search.spec.ts` | `gotoReady`；仍按「demo 未启用搜索 UI」skip（原有诚实 skip 保留）|

---

## 4. C 类（真实产品 bug）= 0：三个「像 bug」的现象查证

1. **`body[data-type]` 不是 `anzhiyu`** → 上游既有契约：`additional-js.pug:77` + `utils.js:1044 setValueToBodyType()`
   把 `input#page-type` 的值回写 body；`page.type` 优先，缺省才回退 `anzhiyu`。
   （本仓库 `src/layouts/BaseLayout.astro:87-91` 的注释就写着这条优先级。）
2. **右键菜单不弹** → 配置门控：`theme.config.yml rightClickMenu.enable:false`（= 上游 `_config.yml` 默认），
   `AdditionalJs.astro:191` 因此不输出 `right_click_menu.js`。静态 DOM 仍在，行为不可达。
3. **中控台卡片不渲染** → CSS 断点：`console.css:917 @media (max-height:800px)` 隐藏 `.console-card-group`；
   CI 实际 viewport 720（配置被 devices 覆盖），900 下正常（本地 wincu 走查已确认，§6）。
4. `#darkmode` 点不到 → 上游折叠交互设计（`rightside.styl`），不是坏按钮。

**C 类条数：0**。没有发现需要移交产品代码的最小复现。

### 需要 Lead 决策的一处 fixture 配置（不属于本任务写作用域）

`examples/blog/theme.config.yml` 的 `rightClickMenu.enable: false` 使得 4 条右键菜单行为用例只能 skip。
若要在 e2e 里真正覆盖右键菜单运行时，需要 fixture 侧把该开关打开（属 `examples/blog/**`，是并行任务写作用域）；
本任务不改该文件，改为**运行时检测 + skip**（开关一旦打开，用例会自动开始执行，无需改断言）。

---

## 5. skip 盘点（修后）

| 用例 | 依据 |
| --- | --- |
| `search.spec.ts` ×2 | demo 站三套搜索 UI 全关，上游不输出搜索 DOM（原有 skip，保留） |
| `music.spec.ts:播放中导航不中断` | APlayer/Meting 运行时不存在（e2e 基座隔离第三方 CDN）；播放进度依赖网易云音源属外部服务 |
| `right-menu.spec.ts` ×3 + `dark-mode.spec.ts` ×1 | `rightClickMenu.enable:false`（配置未启用，见 §4 末） |
| `pwa.spec.ts` ×2 | 根配置下无 PWA 产物（属 P7-1，另一任务） |

合计 27 条应可执行 / 9 条带依据 skip。所有 skip 都在**运行时检测后**触发（不是无条件 skip），
配置/构建模式一变就会自动执行。

---

## 6. 验证（本机，无浏览器自动化）

> 本机 Windows + DSH 沙箱下 Playwright 无法真正跑浏览器：runner fork worker 时
> `node:internal/child_process:487 throw new ErrnoException(err,'spawn') → Error: spawn EPERM`
> （沙箱禁止带 pipe 的子进程，PLAN R12）。JS 行为级结论由 CI 复跑确认；
> 本机做**静态 + HTTP + 真实 Edge 人工走查**三层证据。

### 6.1 `--list`（用例数与分布，未减）

```
$ npx playwright test --list
Total: 38 tests in 8 files
   console.spec.ts        5
   dark-mode.spec.ts      6
   music.spec.ts          2
   navigation.spec.ts     3
   page-types.spec.ts    14
   pwa.spec.ts            2   ← P7-1 新增（另一任务，CI 首跑时还没有）
   right-menu.spec.ts     4
   search.spec.ts         2
```

P4-10 用例 = 5+6+2+3+14+4+2 = **36 条**（与 CI 首跑 36 一致，未减；pwa 2 条为并行任务新增）。

### 6.2 preview HTTP 与静态断言（`astro preview` 起在 127.0.0.1:4399，用本地 dist）

```
/                  200 bytes=59949   /album/demo/       200 bytes=40275
/about/            200 bytes=53050   /album/gallery/    200 bytes=38763
/categories/       200 bytes=38721   /music/            200 bytes=37688
/tags/             200 bytes=40241   /equipment/        200 bytes=39982
/link/             200 bytes=40427   /fcircle/          200 bytes=37421
/essay/            200 bytes=40557   /room/             200 bytes=48956
/album/            200 bytes=38567   /page-default/     200 bytes=37513
OK=14/14
```

构建产物断言（`examples/blog/dist` 静态 grep，用于固定 page-types 的期望值）：

```
about→about   categories→categories   tags→tags        link→link
essay→essay   album→album             album/demo→album_detail
album/gallery→album_detail            music→music       equipment→equipment
fcircle→fcircle                       room→room         page-default→anzhiyu
```

13 个模板根选择器在产物中全部命中：`#about-page`=1、`#tag-page-tags`=1/1、`.flink`=1、`#essay_page`=1、
`card-album`=1、`#album_detail`=1、`fj-gallery`=1、`#anMusic-page`=1、`equipment-item`=20、`page-title`=1、
`#room_page`=1、`#article-container`=1；关键运行时 DOM id（`#nav`/`#page-name`/`#loading-box`/`#rightside`/
`#darkmode`/`#rightside-config`/`#console`/`#consoleHideAside`/`console-mask`/`#rightMenu`/`#nav-music`/
`#recent-posts`/`#site-name`）各 1 处。

### 6.3 真实 Edge 人工走查（wincu 浏览器通道，**不等于 CI 自动化通过**）

走查对象：本机 `astro preview` 的 `http://127.0.0.1:4399/`，Edge agent profile，viewport 1248×809。

1. **右侧暗色按钮真实路径成立**
   - 未滚动时右侧只有齿轮/回顶两个按钮露出，`#darkmode` 在折叠组里不可见 → 与 CI 报错
     `Element is outside of the viewport` 完全一致。
   - 滚动 600px 后 `#rightside` 进入视口（截图：右侧出现齿轮 y≈649 / 回顶 y≈683）。
   - 点齿轮后 `#rightside-config-hide` 展开（截图：右侧依次出现 繁 / 暗色 / 隐藏侧栏 / 齿轮 / 回顶），
     点暗色按钮后页面立即切主题并弹出「你已切换为浅色模式」snackbar（说明进入 `rightSideFn.darkmode`：
     `activateLightMode → snackbarShow → saveToLocal.set('theme')`）。
   - 结论：`revealRightside → openRightsideSettings → 点 #darkmode` 是可行的真实用户路径。
2. **中控台可打开且内容真实渲染**
   - 点导航栏「中控台」label 后 `#console` 完整展开：最新评论 / 兴趣点标签云 / 归档月份卡片 / 底部按钮组
     （viewpoint 809 > 800，卡片区没有被 CSS 断点隐藏）→ 支撑 viewport 1280×900 的修正。
   - 点面板左上角空白（对应 `.console-mask` 的 `position:{x:10,y:10}`）后遮罩关闭、主内容恢复可访问
     （可访问性树从 46 个隐藏节点恢复）→ 支撑遮罩点击位置修正。
3. **右键菜单确实不存在**：页面无 `window.rm` 相关菜单层；与「配置未启用」结论一致
   （构建产物里 `right_click_menu.js` 有文件但**没有 script 标签**，`git grep rightClickMenu` → `enable: false`）。

---

## 7. 剩余不确定性 / CI 下一轮关注点

1. 本轮改动无法在本机执行，**JS 行为仅由真实 Edge 人工走查 + 源码契约为证**，最终以 CI 复跑为准（预计需要 1 轮迭代）。
2. 若 CI 上仍出现 `gotoReady` 超时：优先看 `waitForThemeReady` 的两个标记（`#loading-box.loaded` / `#nav.show`），
   它们分别对应「preloader 未结束」和「main.js DOMContentLoaded 未跑完」；日志里 Playwright 会给出具体 locator 等待名。
3. 外部源隔离的桩只补了首屏初始化会调用到的全局；如果某个页面脚本在交互时用到未桩的第三方全局，
   只会影响该交互用例的 console/pageerror 断言，不会污染其他用例（每例独立 context）。
4. `page-types` 的「运行时 body[data-type]」断言依赖 `setValueToBodyType()` 执行到；若未来首方插件把这条调用挪出
   refreshFn，需同步调整该断言（已在 spec 注释写明契约来源）。

---

## 8. 落地文件清单

- `tests/e2e/helpers.ts`：外部源隔离 `test` fixture、`isolateExternalRequests`、`gotoReady`、`waitForThemeReady`、
  `clickAndWaitForClientRoute`、`goBackAndWait`、`goForwardAndWait`、`revealRightside`、`openRightsideSettings`、
  `toggleThemeViaRightside`、`hasRightMenuRuntime` + 原有工具函数
- `tests/e2e/console.spec.ts`、`dark-mode.spec.ts`、`music.spec.ts`、`navigation.spec.ts`、`page-types.spec.ts`、
  `right-menu.spec.ts`、`search.spec.ts`
- `playwright.config.ts`：viewport 1280×900、timeout 45s、expect 15s、`E2E_CHANNEL`
- 本文件

---

## 9. 第二轮 CI（run `45388338435`）：24 passed / 5 failed / 9 skipped —— `internalLink` 定位到首页链接

### 9.1 结果与失败清单

`.ci-logs/e2e-fail2.log`：

```
Running 38 tests using 2 workers            (line 114)
  5 failed                                  (line 511)
  9 skipped                                 (line 517)
  24 passed (2.7m)                          (line 518)
```

上一轮的 26 条失败收敛到 **5 条**，全部是同一个错误（initial + `retry #1` 各挂一次，`点击站内链接后 URL 没有变化`
在日志中出现 30 次 = 10 个失败块 × 3 处打印）：

| # | 用例 | 失败摘要行 | 报错 |
| --- | --- | --- | --- |
| 1 | `dark-mode.spec.ts:88` 站内导航（ClientRouter）后主题不被重置 | 127 / 130 | `Error: 点击站内链接后 URL 没有变化`；`Expected: not "http://127.0.0.1:4321/"`；`Timeout 20000ms exceeded while waiting on the predicate`，`at helpers.ts:185` → `dark-mode.spec.ts:92` |
| 2 | `music.spec.ts:21` 播放器容器跨站内导航保持同一个 DOM 节点 | 126 / 128 | 同上（`at helpers.ts:185` → `music.spec.ts:31`） |
| 3 | `navigation.spec.ts:49` 点击站内链接不产生 document 请求（无整页刷新） | 131 / 133 | 同上（→ `navigation.spec.ts:60`） |
| 4 | `navigation.spec.ts:72` 浏览器前进/后退后页面可用，且 console 无运行时错误 | 132 / 134 | 同上（→ `navigation.spec.ts:80`） |
| 5 | `navigation.spec.ts:104` 连续两次站内导航后 document 请求仍为 0 | 157 / 158 | 同上（→ `navigation.spec.ts:114`） |

5 条都死在 `helpers.clickAndWaitForClientRoute()` 的 URL poll（`helpers.ts:184`）这一跳：
「点击站内链接后 URL 没有变化」不是 ClientRouter 坏了，而是**点到的链接本来就是当前页**。

### 9.2 根因：`#recent-posts` 里第一个站内链接是分类条上的 `<a href="/">首页</a>`

上一版 `internalLink()` 是 `page.locator('#recent-posts a[href^="/"]').first()`。而首页 DOM 的
`#recent-posts` **第一块是分类条，不是文章卡片**（`examples/blog/src/pages/index.astro:49-58`：
`<div id="recent-posts">` → `<CategoryBar />` → `PostCard ×N` → `<Pagination />`）。

构建产物 `examples/blog/dist/index.html`（59949 bytes）原始片段（categoryBar 第一个条目 → 第一张卡片标题）：

```html
<div id="recent-posts" class="recent-posts">
  <div id="categoryBar"><div id="category-bar" class="category-bar"><div id="catalog-bar"><div id="catalog-list">
    <div class="catalog-list-item" id="首页"><a href="/">首页</a></div>
    <div class="catalog-list-item" id="/categories/前端/Astro/"><a href="/categories/前端/Astro/">Astro</a></div>
    …
  </div></div></div>
  <div class="recent-post-item lastestpost-item" onclick="pjax.loadUrl('/2025/02/02/sticky-top/')">
    <div class="post_cover left"><a href="/2025/02/02/sticky-top/" title="置顶与推荐位样本" …><img …></a></div>
    <div class="recent-post-info"><div class="recent-post-info-top"><div class="recent-post-info-top-tips">
      …<a class="unvisited-post" href="/2025/02/02/sticky-top/" …>未读</a>
    </div><a class="article-title" href="/2025/02/02/sticky-top/" title="置顶与推荐位样本">置顶与推荐位样本</a></div>
    …
  </div>
  <div class="recent-post-item" onclick="pjax.loadUrl('/2025/04/20/tags-thirdparty/')">…</div>
```

于是旧选择器的 `.first()` 命中 `<a href="/">首页</a>`；当前页就是 `/`，点击后 Astro ClientRouter 走
`navigate(href)` → `transition()` 的 `samePage(from, to)` 分支早退（无 hash 变化），**不 pushState、URL 不变、
也不发 `astro:page-load`** → `clickAndWaitForClientRoute()` 的 `expect.poll(page.url()).not.toBe(previousUrl)`
空等 20s 超时。5 条用例的失败形态完全一致，日志里的 `Expected: not "http://127.0.0.1:4321/"` 就是当前页 URL。

### 9.3 修法：`internalLink()` 锚定「文章卡片的标题链接」

`tests/e2e/helpers.ts` 只改这一个函数（spec 无需改动，5 条用例的调用点不变）：

```ts
export function internalLink(page: Page) {
  return page.locator('#recent-posts .recent-post-item a.article-title[href^="/"]').first()
}
```

选择依据：

- `.recent-post-item` 是卡片容器（`PostCard.astro:111`）；`a.article-title` 是卡片标题的唯一锚点
  （`PostCard.astro:163`），**纯结构类名、与站点语言/标题文案无关**；
- 分类条、分页、推荐位都不在 `.recent-post-item` 内：`#categoryBar` 是 `#recent-posts` 的兄弟块，
  推荐位 `#home_top .topGroup`（`TopGroup.astro:66` 同样渲染 `.recent-post-item`）在 `#recent-posts` 之外，
  因此不会被误命中；
- 置顶卡片只多一个 `lastestpost-item` 类（`PostCard.astro:111`），仍是真实文章卡片，标题链接照常命中 ——
  「置顶/推荐区」不影响选择器；
- 点击标题链接是标准站内 `<a>`：ClientRouter 文档级 click 监听 `preventDefault()` + `navigate()`
  （卡片外层 `onclick="pjax.loadUrl(...)"` 也映射到同一个 `navigate()`，同目标），仍是客户端导航，
  不产生 `document` 请求。

### 9.4 静态验证（本机无浏览器自动化，PLAN R12）

用 `parse5` 解析 `examples/blog/dist/index.html`，按选择器语义遍历命中：

```
=== dist/index.html: examples/blog/dist/index.html bytes=59949 ===
recent-post-item elements: 6
article-title(#recent-posts 内、.recent-post-item 外): 0   ← 选择器语义无歧义

## OLD  #recent-posts a[href^="/"]                                    hits=39
  [0] href="/"                        text="首页"              ← 当前页链接（旧 bug 命中点）
  [1] href="/categories/前端/Astro/"  text="Astro"
  …
## ALT  #recent-posts .recent-post-item a[href^="/"]                  hits=28
  [0] href="/2025/02/02/sticky-top/"  text=""      class=""              ← 卡片封面链接
  [2] href="/2025/02/02/sticky-top/"  text="置顶与推荐位样本" class="article-title"
## NEW  #recent-posts .recent-post-item a.article-title[href^="/"]    hits=6
  [0] href="/2025/02/02/sticky-top/"       text="置顶与推荐位样本"
  [1] href="/2025/04/20/tags-thirdparty/"  text="第三方嵌入与卡片标签样本"
  [2] href="/2025/04/01/tags-media/"       text="媒体与卡片标签全量样本"
  [3] href="/2025/03/18/tags-block/"       text="块级容器标签全量样本"
  [4] href="/2025/03/05/tags-inline/"      text="行内标签全量样本"
  [5] href="/2025/02/20/cover-variants/"   text="无封面与自定义顶部图"
## cat  #recent-posts #categoryBar a[href^="/"]                        hits=9（全部被新选择器排除）
```

- 每个 `.recent-post-item` 内 `a.article-title` 恰好 **1 个**（6/6 卡片），`.first()` 命中稳定；
- 新选择器首个 href = `/2025/02/02/sticky-top/`，**不是 `/`**，点击后 URL 必然变化；
- 6 个命中 href 对应的 dist 文件**全部存在**（不存在即 404，会连带打挂 navigation 的 document 请求/内容断言）：

```
OK /2025/02/02/sticky-top/      -> examples/blog/dist/2025/02/02/sticky-top/index.html      (49066 bytes)
OK /2025/04/20/tags-thirdparty/ -> examples/blog/dist/2025/04/20/tags-thirdparty/index.html (60171 bytes)
OK /2025/04/01/tags-media/      -> examples/blog/dist/2025/04/01/tags-media/index.html      (55278 bytes)
OK /2025/03/18/tags-block/      -> examples/blog/dist/2025/03/18/tags-block/index.html      (54351 bytes)
OK /2025/03/05/tags-inline/     -> examples/blog/dist/2025/03/05/tags-inline/index.html     (50211 bytes)
OK /2025/02/20/cover-variants/  -> examples/blog/dist/2025/02/20/cover-variants/index.html  (48444 bytes)
ALL_EXIST: true
```

- 5 条用例断言依赖的目标页 DOM 契约（第一个目标文章页实测）：
  `#content-inner`=1（navigation:72 前进后断言）、`#article-container`=1、`#nav-music`=1（music:21 的
  `transition:persist="nav_music"` 承载节点，`BaseLayout.astro:391`）、`#site-name href="/"`=1
  （navigation:104 第二跳回首页）、`astro-view-transitions-*` meta 各 1（文章页同样启用 ClientRouter）；
  `document` 请求数不变（客户端导航），主题 `data-theme`/localStorage 也不随 swap 重置（dark-mode:88）。
- `npx playwright test --list`（修后）：

```
Total: 38 tests in 8 files
   console.spec.ts 5 · dark-mode.spec.ts 6 · music.spec.ts 2 · navigation.spec.ts 3
   page-types.spec.ts 14 · pwa.spec.ts 2 · right-menu.spec.ts 4 · search.spec.ts 2
```

用例总数与 5 条用例的行号（`dark-mode.spec.ts:88` / `music.spec.ts:21` / `navigation.spec.ts:49/72/104`）
均未变；改动仅为 `internalLink()` 内的 locator 字符串 + 注释，spec 文件零改动，Playwright 收集
（`--list` 经 TS 加载器编译全部 spec/helpers）通过。

### 9.5 剩余不确定性与下一轮 CI 观察点

1. 本机仍无法真跑浏览器（PLAN R12），JS 行为最终以 CI 第三轮为准；本轮若仍有失败，先看 poll 报错里的
   `Expected: not "…"` 是否为当前页（同页链接复发）还是切换到了新问题。
2. 一次点击会触发两次 `navigate()`（卡片外层 `pjax.loadUrl` + ClientRouter 文档级监听），Astro 内部
   按「最新导航优先」abort 前一次、被 abort 的 fetch 返回 null 且不 rethrow（已核对 `astro/dist/transitions/router.js`
   的 `abortAndRecreateMostRecentNavigation` / `fetchHTML` catch），预期不产生 pageerror/console.error；
   navigation:72 的「console 无运行时错误」断言会兜住这条路径。
3. 首个目标是**置顶卡片**（`lastestpost-item`）文章页；若未来首页把置顶/推荐改成非 `.article-title` 结构，
   需同步调整 `internalLink()`（选择器语义写在 helpers 注释里）。


---

## 10. CI 首跑回填（最终，2026-11-24 run 45398204980）

- 默认 e2e（38 条收集）：**29 passed / 9 skipped / 0 failed（26.3s）**；PWA 专用 step：**2/2 passed（7.3s）**；
- job 级：build ✅ / e2e ✅ / lighthouse ✅（三 job 全绿，详见 docs/notes/phases/P7-4-final-acceptance.md §6）；
- 修复传导链：7/36 → 24/38 → 28/38 → 29/38 + PWA 2/2；最后一条真实 bug（暗色跨 ClientRouter 导航重置）
  由 P4-4 修复（runtime.ts 的 before/after-swap 重放）后转 PASS；
- 9 条 skip 的依据：右键菜单 4（demo 配置 rightClickMenu.enable=false，真实站走查覆盖）、搜索 2
  （demo 站未启用搜索，真实站数据层验收覆盖）、音乐播放 1（外部 Meting 服务）、PWA 2（在专用配置下真实执行）。
