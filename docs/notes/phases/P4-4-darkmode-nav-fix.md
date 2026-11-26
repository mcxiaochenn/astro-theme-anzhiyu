# P4-4 暗色模式跨 ClientRouter 导航被重置：根因与修复

- 任务：task-14 / W4-A（CI e2e 最后 1 条真实产品 bug）
- 失败现场：CI run `45390434679`（2026-11-24T12:07–12:08Z）`npx playwright test`，**28 passed / 1 failed / 9 skipped**
- 输入证据：`.ci-logs/e2e-fail3.log`、`tests/e2e/dark-mode.spec.ts:88`、`tests/e2e/helpers.ts`、`src/components/head/{inject-head-js.ts,runtime.ts}`、`layouts/BaseLayout.astro`、`assets/js/main.js`、`node_modules/astro` / `node_modules/@astrojs/runtime` 的 ClientRouter 实现
- 产物：`src/components/head/runtime.ts`（+74/-1）、本文件
- 浏览器级验证：本机无浏览器（PLAN R12），**等 Lead 推 CI 复跑**；本文只写本地能确定性复现/证明的部分

---

## 0. 结论摘要（先看这个）

| 问题 | 结论 |
| --- | --- |
| 根因是「head 内联 bootstrap 被 ClientRouter 重执行」吗？ | **不是**。bootstrap 内容与上一页逐字相同，首次加载就被 ClientRouter 记入 `scriptsAlreadyRan` 并打 `data-astro-exec`，换页时 `runScripts()` 直接 `continue` 跳过；而且如果它真重跑，会读到 localStorage `theme=dark` 并走 `activateDarkMode()`，结果应是 dark，与 CI 观察到的 light 矛盾（反证） |
| 根因是「refreshFn/主逻辑把 theme 重置」吗？ | **不是**。`main.js` 的 `refreshFn()`（1770–1851）全文没有 `data-theme` / `activate*Mode` 调用；`unRefreshFn` 的 matchMedia 监听（1758–1763）在「localStorage 有显式 theme」时 `return`；`handleThemeChange` 只在手动切换/系统变化时调用 |
| 真正的根因 | ClientRouter 的 `swap()` 调 `swapRootAttributes(newDocument)`：**删掉当前 `<html>` 全部属性，再挂新文档（服务端静态 HTML）的 html 属性**。静态 HTML 里 `<html data-theme={display_mode}>` 是构建期写死的兜底值（demo 站 = `light`），用户手选的 dark 只存在于首屏 bootstrap 的运行时结果里 → 换页后被静态值覆盖 |
| 修法 | `runtime.ts`：`astro:before-swap` 记下换页前 `data-theme` 快照，`astro:after-swap`（swap 之后、page-load/refreshFn 之前）重放。只重放「换页前是什么」，不重新决策、不写 localStorage、不调 `handleThemeChange` |
| 基线 diff | **48 页 PASS / 48，差异 0**（改动落在 diff 的 N16「布局级 module script」豁免范围内；内联 bootstrap 未动） |
| CI 待确认 | e2e 应从 28 passed / 1 failed / 9 skipped → **29 passed / 0 failed / 9 skipped**；复跑观察点见 §5 |

---

## 1. 失败证据

### 1.1 CI 原始日志

`.ci-logs/e2e-fail3.log`：

- L129：`✘ 11 [chromium] › tests/e2e/dark-mode.spec.ts:88:3 › 暗色模式 · 状态保持 › 站内导航（ClientRouter）后主题不被重置 (18.1s)`
- L134：`✘ 16 … (retry #1) (18.3s)`（重试同样失败，排除偶发时序）
- L162–163：`Expected: "dark"` / `Received: "light"`，`Timeout: 15000ms`
- L169–171（Call log）：

```
2 × locator resolved to <html lang="zh-CN" data-theme="light" data-astro-transition="forward">…</html>
- unexpected value "light"
31 × locator resolved to <html lang="zh-CN" data-theme="light">…</html>
- unexpected value "light"
```

- L182：`at …/tests/e2e/dark-mode.spec.ts:94:40`
- L231–234：`1 failed` / `9 skipped` / `28 passed (58.6s)`

**判读**：`data-astro-transition="forward"` 只出现在换页的极早期（2 次轮询），随后 31 次都是稳定的 `light` ——
说明 ClientRouter 换页**确实完成**了（URL/页面都换了），但 `data-theme` 被从 dark 改成了 light，且之后 15s 内没有任何代码把它改回来。
这不是等待时机问题，是真实的「换页把主题丢了」。

### 1.2 失败用例链路（`tests/e2e/dark-mode.spec.ts:88-96`）

```ts
test('站内导航（ClientRouter）后主题不被重置', async ({ page }) => {
  await gotoReady(page, '/')
  const next = await toggleThemeViaRightside(page)   // → dark，且 localStorage theme=dark（helpers.ts:334-343）

  await clickAndWaitForClientRoute(page, internalLink(page))  // 点首页第一张卡片的文章标题 → 真实 ClientRouter 导航

  await expect(page.locator('html')).toHaveAttribute('data-theme', next)  // L94：期望 dark
  expect(await readStoredTheme(page)).toBe(next)                          // L95：localStorage 仍应是 dark
})
```

- `toggleThemeViaRightside` 走真实用户路径：滚动露出 `#rightside` → 齿轮展开 → 点 `#darkmode` →
  `rightSideFn.darkmode()`（`main.js:846-858`）→ `activateDarkMode()` + `saveToLocal.set('theme','dark',2)` + `handleThemeChange('dark')`。
  **切换本身是正常的**（CI 里「点击右侧暗色按钮切换主题并写入 localStorage」L8 通过）。
- `clickAndWaitForClientRoute` 等的是 `astro:page-load`（helpers.ts:212-246）—— 它发生在 `astro:after-swap` **之后**（见 §2.2 顺序），
  所以断言执行时换页后的事件链已经全部跑完。
- L95 的 storage 断言没执行到（L94 先失败）；但从代码看 `saveToLocal` 只被切换写、换页不写，storage 应仍是 dark。

---

## 2. 根因（代码行级）

### 2.1 新文档的 `<html data-theme>` 是构建期静态值

`src/layouts/BaseLayout.astro:254-263`：

```ts
/**
 * 上游把 `--anzhiyu-*` 变量只定义在 `[data-theme="light"|"dark"]` 下，属性缺失时
 * `background: var(--anzhiyu-background)` 整条声明失效 → 首屏透明（P1.5 §4.1）。
 * `<html data-theme={display_mode}>` 是静态兜底；运行时修正（localStorage / 系统偏好 /
 * 时段）由 Head.astro 里的 `inject_head_js` 内联脚本完成（P4-1 接管原 P2-2 的过渡实现）。
 */
const displayMode = theme.display_mode === 'dark' ? 'dark' : 'light'
```

`BaseLayout.astro:280`：

```astro
<html lang={site.language} data-theme={displayMode} class={htmlClass || undefined}>
```

`theme.config.yml:731` 是 `display_mode: light`，所以**每一页**的服务端 HTML 都是
`<html lang="zh-CN" data-theme="light">`（构建产物实测）：

```
dist/index.html                       -> {"lang":"zh-CN","data-theme":"light"}
dist/2025/02/02/sticky-top/index.html -> {"lang":"zh-CN","data-theme":"light"}
```

### 2.2 ClientRouter 换页时会整组覆写 `<html>` 属性

`node_modules/@astrojs/runtime/dist/internal/transitions/swap-functions.js`（Astro 7.4.13 实际安装版本）：

```js
// L32-40：首屏脚本判重表
const scriptsAlreadyRan = new Set();
export function detectScriptExecuted(script) {
	const key = script.src ? new URL(script.src, location.href).href : script.textContent;
	if (scriptsAlreadyRan.has(key)) return true;
	scriptsAlreadyRan.add(key);
	return false;
}

// L42-55：换页时把「已经在旧页跑过、且内容/URL 相同」的新文档脚本标记为已执行
export function deselectScripts(doc) {
	for (const s2 of doc.scripts) {
		if (!s2.hasAttribute("data-astro-rerun") && detectScriptExecuted(s2)) {
			s2.dataset.astroExec = "";   // runScripts() 会跳过它
		}
	}
}

// L57-67：本次 bug 的根因函数
export function swapRootAttributes(newDoc) {
	const currentRoot = document.documentElement;
	const nonOverridableAstroAttributes = [...currentRoot.attributes].filter(({ name }) => (currentRoot.removeAttribute(name), NON_OVERRIDABLE_ASTRO_ATTRS.includes(name)));
	[...newDoc.documentElement.attributes, ...nonOverridableAstroAttributes].forEach(({ name, value }) => currentRoot.setAttribute(name, value));
}

// L304-312：swap 的调用顺序
export const swap = (doc) => {
	deselectScripts(doc);
	swapRootAttributes(doc);   // ← 删掉当前 html 的全部属性（含 data-theme=dark），改挂新文档静态属性（light）
	swapHeadElements(doc);
	...
	swapBodyElement(doc.body, document.body);
};
```

事件顺序（`node_modules/astro/dist/transitions/router.js`）：

```
L250  const swapEvent = await doSwap(...)      // 内部同步执行 swap()：swapRootAttributes 已把 data-theme 改成 light
L252  triggerEvent("astro:after-swap")          // ← 唯一的「swap 之后、page-load 之前」钩子
L425  await runScripts()                        // 只重跑未标 data-astro-exec 的脚本
L426  onPageLoad()                              // ← 触发 astro:page-load（e2e 等的就是它）
L549-550 首次加载时：detectScriptExecuted(script); script.dataset.astroExec = "";   // 把所有首屏脚本登记为「已跑过」
```

`astro:before-swap` 里 `router.js:381` 已经先给 `<html>` 加了 `data-astro-transition="forward"`，
所以 CI 日志里那条带 `data-astro-transition` 的 html 正是 swap 期间的状态；`swapRootAttributes` 只保留
`NON_OVERRIDABLE_ASTRO_ATTRS = ["data-astro-transition","data-astro-transition-fallback"]`，
`data-theme` 不在豁免名单里 → 被覆盖成新文档的 `light`。

### 2.3 为什么首屏 bootstrap 不会重新执行来兜底

`inject-head-js.ts:112-174` 的 bootstrap 末尾是：

```js
const t = saveToLocal.get('theme')
// autoChangeMode === 1 时：t === undefined → 跟系统/时段；t === 'light' → activateLightMode(); else → activateDarkMode()
// autoChangeMode === 2 时：时段；t 显式时按 t
```

也就是说：**它只要重跑一次，就会读到 localStorage 的 `theme=dark` 并把 html 改回 dark**。
CI 却观察到稳定的 light → 它没有重跑。机制上：

1. 首屏加载时 router.js L549-550 把页面上所有 `<script>` 登记进 `scriptsAlreadyRan`（key = `textContent` 或绝对 src），并打 `data-astro-exec=""`；
2. 换页时 `deselectScripts(newDocument)` 用同样规则判重：bootstrap 在两页上**逐字相同** → `detectScriptExecuted` 命中 → 新文档里的同一个脚本被标 `data-astro-exec=""`；
3. `runScripts()` L115 `if (script.dataset.astroExec === "") continue;` → 不重建、不执行。

静态验证（探针 B，读 `dist/index.html` 与 `dist/2025/02/02/sticky-top/index.html` 的 head 内联脚本）：

```
[0] attrs=""             len=2247/2247 equal=true   含 saveToLocal.get('theme')=false
[1] attrs="id=config-diff" len=284/438 equal=false  含 saveToLocal.get('theme')=false
[2] attrs=""             len=4211/4211 equal=true   含 saveToLocal.get('theme')=true
首屏暗色 bootstrap 两页逐字一致: true
```

- `[0]` GLOBAL_CONFIG、`[2]` 暗色 bootstrap：两页逐字相同 → 换页被跳过；
- `[1]` `config-diff`：逐页不同 → 换页会被 `runScripts()` 重执行，但它只 `var GLOBAL_CONFIG_SITE = {...}`，
  实测不含 `data-theme`/`theme` 字样，不会碰主题。

这同时解释了「为什么这个 bug 只在导航后出现、刷新正常」：刷新是整页加载，bootstrap 正常执行。

### 2.4 为什么 `refreshFn` 也不兜底

`assets/js/main.js:1770-1851` 的 `window.refreshFn` 全文只在做 DOM/组件初始化（`initAdjust` / `themeColorMeta` /
`relativeDate` / `scrollFn` / `anzhiyu.*` 等），**没有** `data-theme`、`activateDarkMode`、`activateLightMode` 调用；
`handleThemeChange`（781-823）只由 `rightSideFn.darkmode`（857）和系统变化监听（1761）调用。
`unRefreshFn` 的系统变化监听（1758-1763）：

```js
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
  if (saveToLocal.get("theme") !== undefined) return;   // 显式选过主题时直接 return
  e.matches ? handleThemeChange("dark") : handleThemeChange("light");
});
```

即：用户显式选过 dark 后，连系统变化都不会覆盖它，导航后更不会有任何代码把 dark 写回去。

### 2.5 本地静态复现（不启动浏览器）

探针脚本（临时文件，验证后已删除）做三件事：读真实构建产物、**原样抽取并执行 node_modules 里 Astro 的
`swapRootAttributes`**、抽取构建产物里修复后的 minify 函数跑完整顺序。关键输出：

```
=== C. 执行 Astro 自带 swapRootAttributes（源码原样抽取） ===
  抽取自 node_modules\@astrojs\runtime\dist\internal\transitions\swap-functions.js
  const NON_OVERRIDABLE_ASTRO_ATTRS = ["data-astro-transition", "data-astro-transition-fallback"];

=== D. 未修复：ClientRouter 一次站内导航后的 <html> ===
  -- 手动切到 dark 后导航 --
  换页前: {"data-theme":"dark","lang":"zh-CN"}
  swap 后: {"data-theme":"light","lang":"zh-CN"}  ← CI 失败现场（期望 dark）
  -- 首访跟随系统 dark 后导航 --
  换页前: {"data-theme":"dark","lang":"zh-CN"}
  swap 后: {"data-theme":"light","lang":"zh-CN"}  ← CI 失败现场（期望 dark）
```

这就是 CI 里 `Expected: "dark" / Received: "light"` 的确定性复现：
只要换页前 html 是 dark，swap 后必然变成新文档静态的 light。

---

## 3. 修复

### 3.1 改动（唯一代码文件：`src/components/head/runtime.ts`，+74/-1）

核心三段：

```ts
/** 换页前 `<html data-theme>` 的快照 */
let themeBeforeSwap: ThemeMode | null = null

function readTheme(): ThemeMode | null {
  const value = document.documentElement.getAttribute('data-theme')
  return value === 'dark' || value === 'light' ? value : null
}

function restoreTheme(theme: ThemeMode): void {
  if (theme === 'dark') {
    if (typeof w.activateDarkMode === 'function') w.activateDarkMode()
    else document.documentElement.setAttribute('data-theme', 'dark')
  } else if (typeof w.activateLightMode === 'function') {
    w.activateLightMode()
  } else {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

// install() 里：
document.addEventListener('astro:before-swap', (event) => {
  themeBeforeSwap = readTheme()      // ← swapRootAttributes 覆写之前记快照
  ...（原有 pjax:send 逻辑）
})

document.addEventListener('astro:after-swap', () => {
  if (themeBeforeSwap) restoreTheme(themeBeforeSwap)   // ← swap 之后、page-load/refreshFn 之前重放
})
```

要点：

- **不改内联 bootstrap、不改 `BaseLayout.astro`、不改 `main.js`**：唯一改动是 ClientRouter 适配层；
- `restoreTheme` 优先调 bootstrap 定义的 `activateDarkMode/activateLightMode`：它们除了 `data-theme`
  还会把 `<meta name="theme-color">` 改成对应颜色（head swap 同样会把这条 meta 换成静态 light 值）；
  函数不存在（`darkmode.enable=false`，主题本就不允许切）时退化为直接写属性；
- 重放时机是 `astro:after-swap`：它在 swap 之后、`runScripts()`/`astro:page-load`（`refreshFn`）之前**同步**派发（router.js L252 vs L425/426），
  新的 view-transition 快照在此之前生成，所以不会闪一下 light；
- e2e 的 `clickAndWaitForClientRoute` 等 `astro:page-load`，断言时重放必然已经发生。

### 3.2 为什么不用另外两种方案

| 方案 | 否决理由 |
| --- | --- |
| 给 bootstrap 加 `data-astro-rerun` 让它每次换页重跑 | bootstrap 除了主题还会重跑 `saveToLocal`/`getScript`/`getCSS`/aside/apple 等首屏初始化；虽然大体幂等，但它会把「首屏脚本只跑一次」的契约改成「每次换页跑一次」，与上游 Pjax（bootstrap 只在整页加载时跑）语义不一致，副作用面积远大于「只重放一个属性」 |
| 在 after-swap 里读 `localStorage` 的显式 theme 重放 | 只覆盖「用户显式选过」；首访跟随系统/时段时 localStorage 里没有记录，但用户看到的 dark 同样是运行时状态，导航后会被打回 light（同一个 bug 的另一种表现）。快照换页前 DOM 实际值覆盖全部四个场景，且不需要区分来源 |
| 直接改内联 bootstrap 的初始化内容 | 会改变 62 页共享的内联脚本 → 进入基线 diff 的比对范围（违反「改内联脚本会进 HTML diff」红线），而当前实现完全不碰 HTML |

### 3.3 四个暗色场景为什么不回归

| 场景 | 为什么不回归 | 本地证据 |
| --- | --- | --- |
| 首访跟随系统/时段 | 首访是整页加载，**没有 swap**，`astro:after-swap` 不触发；系统/时段决策仍只由 bootstrap 负责，逻辑零改动 | bootstrap 未改动（dist 内联脚本 4211B 与改前逐字相同）；CI 首访两条用例本来就通过 |
| 手动切换 | `rightSideFn.darkmode` → `activate*Mode` + `saveToLocal` + `handleThemeChange` 链路零改动；新监听只在换页时跑，不参与切换 | 修复模拟（探针 E）：初始 dark → 换页后 dark、`meta=#18171d`；初始 light → 换页后 light、`meta=#f7f9fe` |
| 刷新保持 | 刷新是整页加载，等同于首访，bootstrap 从 localStorage 恢复 | 同上，bootstrap 未动 |
| 导航保持 | before-swap 记 `dark`，after-swap 重放 `dark` | 探针 E：`before-swap: 记录当前主题: dark` → `swap 后: light` → `after-swap: 重放后: dark`；light 场景同样保持 light |

额外保证：新监听**不写 localStorage、不调 `handleThemeChange`**，只做「把换页前的显示状态放回去」，
因此不会伪造/篡改用户偏好，也不会与 `main.js` 的既有副作用链冲突。

---

## 4. 验证（本地确定性部分）

### 4.1 构建（持 `.build.lock`，`CODEBUDDY_SAFE_DELETE_ENABLED=0`）

```
cd examples/blog
node ../../node_modules/astro/bin/astro.mjs build      # exit 0
...
[build] 62 page(s) built in 4.72s
[anzhiyu-assets] 复制 11 个主题静态资源 → dist
[build] Complete!
```

### 4.2 基线 HTML diff（红线）

改前（20:20 构建产物）：

```
$env:BASELINE_HTML_DIR='.baseline-html'; node scripts/diff-html.mjs --all
汇总：48 页 / PASS 48 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致
```

改后（20:23 重新构建）：

```
汇总：48 页 / PASS 48 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致        # exit 0
```

**为什么改 runtime.ts 不会破坏基线**：它被 Astro 打进布局级 module script
`/_astro/BaseLayout.astro_astro_type_script_index_0_lang.<HASH>.js`，`scripts/diff-html.mjs` 的
N16（`:423-438`）会把 `src` 匹配 `/_astro/*(ClientRouter|pjax-shim|BaseLayout)*.js` 的 `<script>` 整节点忽略；
本次只改了 bundle 内容 → hash 变（`BX8t1Fli` → `BBgDs-2V`），HTML 结构/属性零变化。
内联 bootstrap（`inject-head-js`）**未改动**，所以也不存在「内联脚本进 diff」的问题。

### 4.3 修复代码确实进了构建产物

`dist/_astro/BaseLayout.astro_astro_type_script_index_0_lang.BBgDs-2V.js`（1911B）反混淆后：

```js
var t=window,n=null;                                   // n = themeBeforeSwap
function r(){let e=document.documentElement.getAttribute(`data-theme`);return e===`dark`||e===`light`?e:null}
function i(e){e===`dark`?typeof t.activateDarkMode==`function`?t.activateDarkMode():document.documentElement.setAttribute(`data-theme`,`dark`):
  typeof t.activateLightMode==`function`?t.activateLightMode():document.documentElement.setAttribute(`data-theme`,`light`)}
...
document.addEventListener(`astro:before-swap`,e=>{ n=r(), e.newDocument?.querySelectorAll(`meting-js`)... }),   // 先记快照
document.addEventListener(`astro:after-swap`,()=>{ n&&i(n) }),                                                    // 再重放
document.addEventListener(`astro:page-load`,()=>{ t.__anzhiyuPjaxNavigated&&(s(),a(`pjax:complete`)) })
```

### 4.4 用真实产物 + 真实 Astro swap 实现跑完整顺序（探针 E）

```
=== E. 已修复：执行构建产物里的 readTheme / restoreTheme + 真实 swap ===
  抽取自 dist/_astro/BaseLayout.astro_astro_type_script_index_0_lang.BBgDs-2V.js（minify 产物）
  -- 初始主题 dark --
   before-swap: 记录当前主题: dark
   swap 后: light
   after-swap: 重放后: dark
   meta[name=theme-color]: #0d0d0d
  -- 初始主题 light --
   before-swap: 记录当前主题: light
   swap 后: light
   after-swap: 重放后: light
   meta[name=theme-color]: #f7f9fe

  导航后主题保持: dark=true / light=true
  构建产物里存在 astro:after-swap 监听: true
  构建产物里存在 astro:before-swap 监听: true
```

### 4.5 用例收集数不变

```
npx playwright test --list
Total: 38 tests in 8 files
```

### 4.6 本地能证明 / 不能证明什么（诚实记录）

- **能证明**：换页前后 `<html>` 属性的变化由 Astro 换页实现逐行决定（源码抽取后实跑）；修复代码已进产物且
  执行顺序正确（before-swap 记录 → swap 覆写 → after-swap 重放 dark）；基线 HTML 零差异；用例数不变。
- **不能证明**：真实 Chromium 里 ClientRouter 换页完成后 `data-theme` 的最终值、以及 view-transition 是否闪 ——
  本机 Playwright 被 DSH Windows 沙箱阻断（PLAN R12：`spawn EPERM` + Chromium mojo `拒绝访问 0x5`），
  只能由 CI（Ubuntu runner）复跑 `npx playwright test` 验证。

---

## 5. CI 复跑待确认项与残余风险

### 5.1 期望结果

- `tests/e2e/dark-mode.spec.ts:88` 由 `Expected "dark" / Received "light"` → **PASS**；
- 总账：**29 passed / 0 failed / 9 skipped**（38 收集）。
- 复跑后请回填本节：run id、Playwright 汇总行。

### 5.2 若仍失败的排查顺序

1. 看失败时的 call log：`data-astro-transition="forward"` 阶段之后是否出现过 dark；
2. `page.evaluate(() => document.documentElement.getAttribute('data-theme'))` 在 `astro:page-load` 后的值；
3. 确认加载的是新 bundle（`/_astro/BaseLayout…BBgDs-2V.js` 里应能搜到 `astro:after-swap`）；
4. 确认 `window.activateDarkMode` 在换页后仍是 function（bootstrap 是否被 `darkmode.enable` 关闭）。

### 5.3 残余风险（同机制、本次不修，明确记录）

`swapRootAttributes` 删掉的是 `<html>` 的**全部**属性，受同一机制影响的还有：

- `html.hide-aside`（右侧栏折叠状态，`saveToLocal('aside-status')` + class）——换页后 class 被清掉，
  折叠状态不跨页保持（上游 Pjax 不碰 html 属性，理论上应保持）；
- `html.apple`（`inject-head-js` 的检测产物）；
- `handleThemeChange` 写在 `html.style` 上的 `--anzhiyu-*` 内联覆盖（换页后回落到 CSS 默认值）。

这三项**不在 P4-4 的验收范围**、也不在 e2e 断言范围内（`console.spec.ts` 的「隐藏侧栏」只验证本次切换，不跨页）。
如需修，可在同一 `astro:after-swap` 监听里按同样思路扩展（记录/重放对应状态），但需要单独的行为验收，
不要顺手塞进本次修复。

### 5.4 浏览器手测建议（CI 之外，可选）

1. 系统深色偏好首访 → 点文章 → 仍为 dark；
2. 点右侧暗色按钮切到 dark → 点文章/返回 → 仍为 dark，`localStorage.theme` 不变；
3. light 下重复 2 → 仍为 light（不反向污染）；
4. 显式 dark 后刷新 → dark（bootstrap 路径未变）。
