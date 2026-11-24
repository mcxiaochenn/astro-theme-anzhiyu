# P7-1 PWA：Service Worker + manifest + sw-rules 翻译 + 离线验收

> 完成日期：2026-11-24（W2-C / task-9）
> 结论先行：**@vite-pwa/astro 2.0.4 明确支持 Astro 7 + Vite 8，构建已跑通**；
> `sw-rules.js` 的 cacheName / simple / cdn / external.stable / getSpareUrls 均有对应实现，
> 其中 getSpareUrls 的「3s 超时换备用 URL」Workbox 配置表达不了，用一段追加进 `dist/sw.js`
> 的独立 fetch 监听实现（这就是 PLAN 附录 C #7 的答案：**部分可表达，需要补丁**）。
> 默认构建（不设 `ANZHIYU_PWA`）零 PWA 足迹，48/48 页基线 diff 0 差异；迁移站缺包时安静降级。

---

## 1. 开关与降级（迁移站不受影响）

| 场景 | 行为 |
| --- | --- |
| 默认验收构建（不设 env） | `astro.config.mjs` 里 `PWA_ENABLED=false`：**不加载** `@vite-pwa/astro`、不加 integration、不改 HTML → 与 Phase 2 基线逐字节一致 |
| `ANZHIYU_PWA=1` | 顶层 `await import('@vite-pwa/astro')`，挂 `AstroPWAIntegration` + 构建后补丁 integration，产出 `dist/sw.js`、`dist/workbox-*.js`、`dist/manifest.webmanifest`，62 个 HTML 注入 manifest link + 注册脚本 |
| `ANZHIYU_PWA=1` 但包缺失（迁移站） | `try/catch` 捕获 → `console.warn` → 按无 PWA 构建，**退出码 0**（实验见 §6） |
| 迁移站默认（不设 env） | 根本不执行 import，天然不受影响 |

要点：`migrate-hexo.mjs` 会整份复制 `examples/blog/astro.config.mjs`，迁移产物
`package.json` 里没有 `@vite-pwa/astro`，所以这里**不能**用静态 import，只能用
`await import()` + `catch`。

## 2. @vite-pwa/astro 对 Astro 7 的兼容性（版本证据）

registry 元数据（`registry.npmmirror.com/@vite-pwa%2Fastro/latest`，2026-11-24 抓取）：

```json
{
  "name": "@vite-pwa/astro",
  "version": "2.0.4",
  "engines": { "node": ">=22.14.0" },
  "peerDependencies": {
    "astro": "^5.0.0 || ^6.0.0 || ^7.0.0",
    "magicast": "^0.5.0",
    "rolldown": "^1.0.0-0",
    "@vite-pwa/assets-generator": "^1.0.0 || ^2.0.0"
  },
  "dependencies": {
    "@unplugin-pwa/core": "^0.0.8",
    "@unplugin-pwa/vite": "^0.0.8",
    "@unplugin-pwa/inspector": "^0.0.8",
    "@vite-pwa/workbox-build": "^8.0.15",
    "@vite-pwa/workbox-swkit": "^8.0.15",
    "@vite-pwa/workbox-window": "^8.0.15"
  }
}
```

更强的证据是它自己的 `devDependencies`：`"astro": "^7.4.12"`、`"vite": "^8.3.8"` ——
与本站实际版本（astro **7.4.13** / vite **8.3.8**）一致；`@unplugin-pwa/*` 的
peerDependencies 也写明 `vite: ^3.1.0 || … || ^8.0.0`。

实跑证据（`ANZHIYU_PWA=1` 构建日志）：

```
Vite PWA v8.0.15 [Vite 8.3.8]
strategy  generateSW
precache  84 entries (3465.28 KiB)
✓ files generated:
  dist/sw.js                6.62 kB
  dist/workbox-2abd5d8f.js 27.53 kB
```

**结论：兼容，用 `@vite-pwa/astro`，不需要退到 vite-plugin-pwa 或自研生成脚本。**

安装注意点：

- v2 是 **named export**（`import { AstroPWAIntegration } from '@vite-pwa/astro'`），
  v1 的 default export 已移除（包 README「Breaking Change」）。
- `strategies` 取值 `generateSW | buildSW | injectManifest | selfDestroySW`；
  本次用默认的 `generateSW`（Workbox 全权生成）。
- `rolldown` 是 optional peer，`autoInstallPeers: true` 下自动装到 `rolldown@1.3.3`，
  `@vite-pwa/workbox-build` 用它给 SW 做 bundling。
- 依赖声明位置：`examples/blog/package.json` 的 devDependencies
  `"@vite-pwa/astro": "^2.0.4"`（站点自己用，不进主题包；CI 的
  `pnpm install --frozen-lockfile` 从根 lockfile 装到 hoisted node_modules）。
- 本机安装环境异常（与方案无关，记录备查）：workspace 里现成的 `node_modules`
  是 pnpm **9.14.4** 创建的（`node_modules/.modules.yaml: packageManager: pnpm@9.14.4,
  virtualStoreDirMaxLength: 120`），当前 pnpm 10.29.3 直接 `pnpm add` 会报
  `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`；用
  `pnpm --filter blog add -D @vite-pwa/astro --config.virtual-store-dir-max-length=120`
  完成解析与落盘（中途对一个 `node_modules/mdn-data` 子目录报 EPERM —— Windows 沙箱
  的 Everyone(DC) deny 拦截删除；包本身已装好，`import('@vite-pwa/astro')` 实测 OK）。
  CI 是干净 `pnpm install --frozen-lockfile`，不存在这个环境问题。

Lockfile 变更：

```
before: 9DEB45A774DFF2EEE7BA4770FCF9F94ACE457CEA65028CF7104B54E76FABC7A1  (137589 B)
after : 3D14B88A7BE695A8C2E017C4D4A897525C80D4FCE921C29EAFF1AFC6A5B737B8
```

只增不删（+227 行，全部是 PWA 相关的 importer / packages / snapshots）。
自检：`pnpm install --frozen-lockfile --lockfile-only` →
`Scope: all 5 workspace projects / Done in 341ms using pnpm v10.29.3 / exit 0`。

## 3. sw-rules.js 逐条映射

上游：`_research/anzhiyu-upstream/sw-rules.js`（131 行，hexo-swpp 规则）。
新实现：`examples/blog/astro.config.mjs` 的 P7-1 段（§「P7-1 · PWA」）。
行号对当前工作副本，便于 review：

| # | 上游规则（sw-rules.js） | 新实现（astro.config.mjs） | 状态 |
| --- | --- | --- | --- |
| 1 | `serviceWorker.cacheName: "AnZhiYuThemeCache"` | `PWA_CACHE_NAME`（:332），作为 3 条 runtimeCaching 的 `options.cacheName` 与补丁 SW 的缓存桶名 | ✅ 等价 |
| 2 | `cacheRules.simple`：同源 `/404.html`、`/css/index.css`，`clean: true` | `generateSW.globPatterns: ['**/*.{html,js,css}']`（:575）→ 预缓存 84 条（62 HTML + JS/CSS + manifest + 图标），含这 2 个路径；`clean` 由 `cleanupOutdatedCaches: true` + Workbox precache 版本化取代 | ✅ 等价（范围扩到全部静态页，为「离线首页」验收） |
| 3 | `cacheRules.cdn`：7 个 host（cdn.cbd.int / 4 个 bytecdntp / cdn.staticfile.org / npm.elemecdn.com）上的 `.js|.css|.woff2|.woff|.ttf|.cur` | `PWA_CDN_RUNTIME_PATTERN`（:342）+ `PWA_RUNTIME_CACHING[0]`（:352-361）：CacheFirst、cacheName=AnZhiYuThemeCache、maxEntries 200 / 30 天、statuses [0,200]。**npm.elemecdn.com 除外**，它的所有请求交给 #5 的补丁 SW（避免两条路由抢同一请求） | ✅ 等价（elemecdn 并入 #5） |
| 4 | `external.stable`：3 条 URL 正则（npm.elemecdn.com / cdn.cbd.int / cdn.jsdelivr.net，均要求 `pkg@ver/2 段路径`） | cdn.cbd.int、cdn.jsdelivr.net 两条 → `PWA_EXTERNAL_STABLE_PATTERNS`（:346-349）+ `PWA_RUNTIME_CACHING[1..2]`（:363-374，CacheFirst）；elemecdn 那条并入 #5 | ✅ 等价 |
| 5 | `getSpareUrls(srcUrl)`：`npm.elemecdn.com` 请求返回 `{ timeout: 3000, list: [srcUrl, 'https://cdn.cbd.int' + pathname] }`，即 3s 拿不到就换备用 URL | `PWA_SPARE_URLS_SW`（:385-435）：追加进 `dist/sw.js` 的独立 fetch 监听 —— 只接管 GET + origin=`npm.elemecdn.com`；先查 `AnZhiYuThemeCache`；原始 URL 3s 超时/失败 → `https://cdn.cbd.int` 同 path 重取；成功写回缓存。追加动作在 `anzhiyuPwaExtras()` 的 `astro:build:done`（:499-501） | ✅ 实现（Workbox 配置无法表达「超时换 URL」，这是补丁存在的唯一原因） |
| 6 | `json.merge: ["page","archives","categories","tags"]` | **未实现** | ⛔ N/A：hexo-swpp 用它合并 Hexo 的懒加载 JSON；Astro 是 SSG，page/archives/categories/tags 都是构建期生成的静态 HTML，没有同款运行时 JSON 端点可合并 |
| 7 | `dom.onsuccess`：SW 更新后 `caches.match('https://id.v3/')` 弹通知 | **未实现** | ⛔ 依赖 hexo-swpp 注入的版本缓存 key（id.v3）与运行时 `anzhiyuPopupManager`；Astro 侧没有等价物，要做需在主题组件里接 `virtual:pwa-register`（改变默认 HTML，超出 P7-1 边界）。当前用 `registerType: 'autoUpdate'`（skipWaiting+clientsClaim）静默更新 |
| 8 | `register.onerror: undefined` | 注入的注册脚本自带 `.catch(error => console.warn(...))`（:511-515） | ✅ 等价 |
| 9 | `skipRequest`：`i0.hdslb.com`、`meting.qjqq.cn` 不走 SW | **未实现（不需要）**：这两类 host 不被任何 runtimeCaching 路由匹配，请求天然直连网络，与 skipRequest 结果一致 | ✅ 等价 |
| 10 | `layout/includes/head/pwa.pug`：manifest link、`msapplication-TileColor`、mask-icon、apple-touch-icon、favicon 16/32、bookmark、startup images | 只注入 `<link rel="manifest" href="/manifest.webmanifest">`（:508-515）。其它标签：默认 head 已有 `<link rel="shortcut icon" href="/favicon.ico">` 与 theme-color meta；mask-icon/apple-touch-icon/startup-image 依赖 `theme.pwa`（1.7.1 配置层，P7-4 迁移时才落 site config），本任务不伪造 | ◐ 部分（manifest link 实现，其余有原因） |
| 11 | `pwa.pug` 里被注释掉的 SW 注册脚本（`navigator.serviceWorker.register('/service-worker.js')`） | 注入 `<script>`：`load` 后 `navigator.serviceWorker.register('/sw.js')`（:511-515） | ✅ 实现（文件名随 Workbox `filename` 默认 `sw.js`） |

上游真实站 `xcAnzhiyu` 的 `pwa.enable: false`，所以 PWA 只是**主题能力**验证，
不在真实站迁移产物验收范围内；默认构建零影响是硬约束（§5）。

## 4. 实现结构（为什么需要「构建后补丁」）

`@vite-pwa/astro` v2 的 HTML 注入只挂在 Vite 的 `transformIndexHtml` 上
（源码：`node_modules/@unplugin-pwa/vite/dist/node/plugins/build-register-sw.mjs`），
而 **Astro 的 SSG 页面由 Astro 渲染器写出、不经过 Vite 的 index.html 管道**，
这个 hook 对 Astro 路由不会执行 —— 所以本任务不用 `injectRegister`（设为 `false`），
而是在 `astro.config.mjs` 里加了一个约 60 行的 Astro integration `anzhiyuPwaExtras()`：

1. `astro:build:done`（排在 `AstroPWAIntegration` 之后）：读 `dist/sw.js`，把
   `PWA_SPARE_URLS_SW` 追加到文件末尾（幂等：已有 `P7-1-SPARE-URLS` 标记就跳过）；
2. 递归遍历 `dist/**/*.html`（62 个），在 `</head>` 前插 manifest link、在 `</body>` 前插注册脚本；
3. 打印一组可核对的数字（sw/manifest 字节数、预缓存条数、注入页面数）。

选择「追加独立 fetch 监听」而不是 `injectManifest` 自写 SW 的原因：
- Workbox `generateSW` 已经负责预缓存 84 条 + 运行时路由（minified、版本化），自写 SW 要自己维护这套；
- getSpareUrls 是**唯一**需要自定义逻辑的规则，追加 50 行监听即可，且不与 Workbox 路由冲突
  （Workbox 不匹配 `npm.elemecdn.com`，互斥）；
- 用 `@vite-pwa/workbox-swkit` 自写 SW 需要额外依赖与打包链路，收益不抵复杂度。

## 5. 构建输出与基线零影响

### 5.1 PWA 构建（`ANZHIYU_PWA=1`）

命令（cwd `examples/blog`）：`node ../../node_modules/astro/bin/astro.mjs build`

```
Vite PWA v8.0.15 [Vite 8.3.8]
strategy  generateSW
precache  84 entries (3465.28 KiB)
✓ files generated:
  dist/sw.js                6.62 kB
  dist/workbox-2abd5d8f.js 27.53 kB
19:27:05 [anzhiyu-pwa-extras] [P7-1 PWA] sw.js=8279B manifest.webmanifest=592B
         precache=84 条 cacheName=AnZhiYuThemeCache 注入 manifest/注册脚本 62/62 个 HTML
[build] 62 page(s) built in 3.26s
```

- `dist/sw.js`：追加补丁前 6.62 kB → 最终 **8279 B**（+ 补丁）
- `dist/manifest.webmanifest`：**592 B**（name/short_name/description/lang/start_url/scope/display/
  theme_color `#425AEF`/background_color/3 个图标：192 maskable、512 maskable、apple-180）
- `dist/workbox-2abd5d8f.js`：28192 B（Workbox runtime，由 `importScripts` 引入）
- 预缓存清单：84 条，包含 `/`、62 个 HTML（clean URL 化后的 404/archives/…）、`/_astro/*.js|css`、
  `manifest.webmanifest`、3 个 manifest 图标

`astro preview` 实测（node preview @127.0.0.1:4322）：

```
GET /sw.js                  => 200  text/javascript         8279 B
GET /manifest.webmanifest   => 200  application/manifest+json 592 B
GET /workbox-2abd5d8f.js    => 200  text/javascript        28192 B
GET /                       => 200  text/html              60350 B
GET /img/siteicon/manifest-icon-192.maskable.png => 200 image/png 2329 B
```

`sw.js` 内容核对：`AnZhiYuThemeCache`、`bytecdntp` / `cdn\.staticfile\.org`（cacheRules.cdn 正则）、
`cdn\.cbd\.int` / `cdn\.jsdelivr\.net`（external.stable）、`P7-1-SPARE-URLS`（getSpareUrls 补丁）、
`TIMEOUT_MS = 3000`、`{url:` 预缓存条目 84 条，均在产物里。

### 5.2 默认构建（不设 env）

- `dist/` 里**没有** `sw.js` / `manifest.webmanifest` / `workbox-*.js`；
- HTML 里没有 manifest link / 注册脚本新增；
- 48 页基线 diff：

```json
{ "mode": "all", "ok": true,
  "summary": { "pages": 48, "pass": 48, "fail": 0, "diffCount": 0,
               "missingNodes": 0, "unexpectedNodes": 0, "categories": {} } }
```

（`BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json`，exit 0）

## 6. 离线验收用例（tests/e2e/pwa.spec.ts + playwright.pwa.config.ts）

文件分工：

- **`playwright.pwa.config.ts`**：`testMatch: 'pwa.spec.ts'`、`workers: 1`、端口 4322
  （默认配置是 4321）、报告/结果目录独立（`playwright-pwa-report` / `test-results-pwa`，
  CI artifact 不撞）；`webServer.env = { ANZHIYU_PWA: '1' }`，命令与默认 e2e 同款
  `pnpm --filter blog build && pnpm --filter blog exec astro preview …`。
- **`tests/e2e/pwa.spec.ts`**：2 个用例
  1. 产物层：`/sw.js` 含 cacheName / cacheRules.cdn 正则 / external.stable 两条正则 /
     `P7-1-SPARE-URLS` / `TIMEOUT_MS = 3000`，预缓存条目 ≥48；`/manifest.webmanifest`
     字段齐全且每个 icon 可 200；
  2. 运行层：等 `navigator.serviceWorker.controller` 出现 → `ready().active.state === 'activated'`
     → `context.setOffline(true)` → `page.reload()` → `#body-wrap` 可见、标题匹配、
     manifest link 仍在、SW 仍控制页面。`finally` 里恢复 `setOffline(false)`。

CI 接线（`.github/workflows/ci.yml` 的 `e2e` job）：

```yaml
- name: Run Playwright e2e                 # 原有：根配置，默认构建
  run: npx playwright test

- name: Run Playwright PWA offline e2e     # 新增：PWA 配置，ANZHIYU_PWA=1 构建 + preview
  run: npx playwright test -c playwright.pwa.config.ts
```

并新增 `playwright-pwa-report` artifact 上传（`if: always()`，与原有
`playwright-report` 不共用路径）。

**本机（Windows + DSH 沙箱）没有浏览器（PLAN R12），浏览器级只能 CI 真跑。**
本地验收 = `npx playwright test --list`：

```
# 根配置（默认构建）
Total: 38 tests in 8 files        # 含 pwa.spec.ts 的 2 条（默认构建下会 skip，见下）
# PWA 配置
Total: 2 tests in 1 file
  [chromium] › pwa.spec.ts:30:3 › P7-1 PWA · 离线可访问首页 › 构建产物：…
  [chromium] › pwa.spec.ts:65:3 › P7-1 PWA · 离线可访问首页 › SW ready → 断网重载…
```

skip 口径：根配置扫到 `pwa.spec.ts` 时，`beforeEach` 先 `request.get('/sw.js')`，
非 PWA 产物（404）→ `test.skip`，理由是「构建模式不匹配」，不是掩盖失败 —— 同一批断言
在 PWA 配置下真实执行。更干净的做法是给根 `playwright.config.ts` 加一行
`testIgnore: '**/pwa.spec.ts'`，但那超出本任务写作用域（Lead 可决定后续收口）。

（W5-A 之后：测试 2 的**首次导航**也改成「先隔离外部 CDN + `domcontentloaded`」，
运行层断言不变；失败原因与修复过程见下一节 §6.1。）

### 6.1 CI 首次真实执行：离线用例失败根因与修复（W5-A，task-15）

**失败事实**（CI run 45395473424，`.ci-logs/e2e-run4.log`）：

```
674: ✓ 1 … 构建产物：sw.js 覆盖 sw-rules 规则，manifest 含图标 (62ms)
675: ✘ 2 … SW ready → 断网重载首页仍可见（标题 + #body-wrap） (1.0m)
683: Error: page.goto: Test timeout of 60000ms exceeded.
684: Call log:
685:   - navigating to "http://127.0.0.1:4322/", waiting until "load"
690: > 73 |     await page.goto('/')          ← 失败在首次导航，不是 setOffline 之后的 reload
```

**根因不是 SW / navigateFallback，而是「首次 `page.goto('/')` 等 `load` 被外部 CDN 挂住」**：

1. `pwa.spec.ts` 只 `import { test } from '@playwright/test'`，**没走**主 e2e 的
   `tests/e2e/helpers.ts` 基座；首访用的是 `page.goto('/')` 默认 `waitUntil: 'load'`。
   主 e2e 早在 P4-10 就踩过同一个坑并写下结论（`helpers.ts` 文件头第 1 条）：
   「demo 站 head/body 里引了 cdn.cbd.int / npm.elemecdn / bu.dusays 等外部资源，
   CI 上偶发挂起会让 `page.goto()` 默认的 `waitUntil: "load"` 一直等不到」。
2. PWA 构建的首页实测有 **22 个外部子资源**：11 个 `<script>`（cdn.cbd.int ×10、
   npm.elemecdn.com ×1）、5 个外部样式表、6 张外部图（npm.elemecdn ×3、
   bu.dusays ×2、image.anheyu ×1）。`load` 要等它们全部结束，CI runner 上这些
   中国 CDN 偶发不可达 → 整条用例 60s 超时。
3. 同一次 run 里默认 e2e 29 passed（`.ci-logs/e2e-run4.log:544`），因为它们走了
   `gotoReady()`（domcontentloaded + 外部请求隔离）；产物用例用 APIRequestContext
   62ms 通过，说明 preview server 和 PWA 产物本身正常。
4. SW 侧本来就是对的（所以「加 navigateFallback」并不是修法）：`ANZHIYU_PWA=1`
   产物的 `dist/sw.js` 里，
   - precache 84 条包含首页 `{url:`/`,revision:`7da2a1d0…`}`；
   - generateSW 生成了
     `registerRoute(new NavigationRoute(createHandlerBoundToURL('/')))`
     （minified 形态 `…{directoryIndex:`index.html`,cleanURLs:!0,…}),e(),t(new n(a(`/`)))`）。
   来源：`@vite-pwa/astro` 2.0.4 在 `generateSW.navigateFallback` 未显式配置时自动填
   `base ?? vite.base ?? "/"`（`node_modules/@vite-pwa/astro/dist/prepare-build-context-*.mjs:16`），
   并把 precache 里的 `index.html` 改写成站点 scope（同文件 `createManifestTransform`：
   `index.html` → `/`）；`@vite-pwa/workbox-build` 再按
   `createHandlerBoundToURL(navigateFallback)` 生成 NavigationRoute
   （`dist/internal-generate-sw-*.mjs:94-102`）。

**修法**（3 个文件，浏览器级行为零未知项）：

| 文件 | 改动 |
| --- | --- |
| `tests/e2e/pwa.spec.ts` | 测试 2 首访前调用主 e2e 的 `isolateExternalRequests(page)`（外部脚本打桩 / 外链样式空体 / 其余 abort），`page.goto('/', { waitUntil: 'domcontentloaded' })`；SW 注册脚本挂在 `load` 上，所以 `waitForFunction(controller)` 仍隐含等 load 完成。断网 reload 保持 `domcontentloaded`。测试 1 追加「首页以 `/` 进 precache」的产物断言（`{url:`/`,revision:`），防止 future 改动静默破坏离线导航前提。 |
| `playwright.pwa.config.ts` | 显式 `serviceWorkers: 'allow'` + 注释：SW 是验收对象；Playwright 的 route 不拦截 SW 接管的请求，所以「隔离外部 CDN」和「允许 SW」可以共存，改成 `block` 会让离线断言永久失败。 |
| `examples/blog/astro.config.mjs` | **只加注释、不改配置**：说明 `navigateFallback` 不能写死 `'/'`（它是 base-aware 的，写死会破坏 `DEPLOY_SITE_ROOT` 子路径部署），自动默认值 + manifest transform 才能让离线 `/` 命中预缓存；证据指向本节。 |

**产物级证据**（本机 `ANZHIYU_PWA=1` 构建，`.build.lock` 内执行，
`CODEBUDDY_SAFE_DELETE_ENABLED=0`；日志 `.tmp-pwa-fix/build-pwa2.log`、
sw.js 副本 `.tmp-pwa-fix/sw.pwa2.js`）：

```
Vite PWA v8.0.15 [Vite 8.3.8]
strategy  generateSW
precache  84 entries (3465.71 KiB)
  dist/sw.js                6.62 kB
  dist/workbox-2abd5d8f.js 27.53 kB
[anzhiyu-pwa-extras] [P7-1 PWA] sw.js=8279B manifest.webmanifest=592B
                     precache=84 条 cacheName=AnZhiYuThemeCache 注入 manifest/注册脚本 62/62 个 HTML
```

- `dist/sw.js` 最终 **8279 B**，SHA-256 `37BA394C7EB9B9C3C098094E129DDD2258D4A85B76811828E972987796B3B4D1`
  —— 与「只加注释」改动前**完全一致**（配置语义零变化，改的是测试与注释）。
- `navigateFallbackDenylist` 不需要：demo 站没有 `/go.html` 之类需要绕开的导航页
  （`go.html` 只出现在 `packages/astro-theme-anzhiyu/assets/js/utils.js` 指向的
  外部 travellings.cn 链接里）。

**默认构建零影响**（同一把 `.build.lock` 内紧接着重建）：

- `pnpm --filter blog build`（不设 env）→ exit 0、62 页；`dist/sw.js` /
  `manifest.webmanifest` / `workbox-*.js` 全部不存在；
- `BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json`
  → exit 0、`{ pages: 48, pass: 48, fail: 0, diffCount: 0 }`（`.tmp-pwa-fix/diff-default.json`）。

**本机可做的浏览器级替代验证**：`npx playwright test -c playwright.pwa.config.ts --list`
→ `Total: 2 tests`（`pwa.spec.ts:35` / `:77`）。真实执行仍只能 CI：
本机 Playwright 自身 launch 是 `spawn EPERM`（PLAN R12）；本次还试了绕道——
直接拉起系统 Edge headless + `--remote-debugging-port` 再用 `connectOverCDP` 驱动，
Edge 在 DSH 沙箱里启动数秒即退出（`crashpad … OpenProcess: 拒绝访问 (0x5)`），
**无法在本机复现离线流程**。故 CI 复跑的 2/2 PASS 是最终验收口径；
若仍失败，最可能的位置是 `waitForFunction(controller)`（30s）而不是导航。

## 7. 迁移兼容实验（缺 @vite-pwa/astro 时安静降级）

用 Node 24 module customization hook 模拟「包不存在」：
`.tmp-pwa-migr/resolve-hook.mjs` 对 `@vite-pwa/astro` 抛 `ERR_MODULE_NOT_FOUND`，
其余解析不变（迁移站的真实差别只是这个裸包名解析不到）。

**实验 A：设 `ANZHIYU_PWA=1` 导入真实 config**

```
$ node --import ./.tmp-pwa-migr/register.mjs --input-type=module \
    -e "const m = await import('./examples/blog/astro.config.mjs'); …"
config loaded OK; integrations = [ 'anzhiyu-assets' ]
[P7-1 PWA] 设置了 ANZHIYU_PWA=1，但加载 @vite-pwa/astro 失败，本次构建降级为无 PWA
（迁移站没装这个包时属预期）：Cannot find package '@vite-pwa/astro' (simulated…)
exit code: 0
```

→ 缺包时只 warn，config 仍正常导出，integrations 只剩 `anzhiyu-assets`。

**实验 B：同样条件下完整 build（迁移站相当于「设了开关但没装包」的最坏情况）**

```
$ cd examples/blog
$ ANZHIYU_PWA=1 node --import ../../.tmp-pwa-migr/register.mjs \
    ../../node_modules/astro/bin/astro.mjs build
[P7-1 PWA] 设置了 ANZHIYU_PWA=1，但加载 @vite-pwa/astro 失败，本次构建降级为无 PWA
（迁移站没装这个包时属预期）：Cannot find package '@vite-pwa/astro' (simulated…)
[build] 62 page(s) built in 2.83s
[build] Complete!
exit code: 0        # dist/sw.js 不存在、HTML 无 manifest link 注入（62/62 未注入）
```

→ 即使迁移站读者误设了 `ANZHIYU_PWA=1`，缺包也只 warn + 走普通构建，**exit 0**。
默认（不设 env）路径根本不执行 import。实验用的
`.tmp-pwa-migr/{resolve-hook,register}.mjs` 是临时文件，验收后已删除。

## 8. 未实现项与原因

| 项 | 原因 |
| --- | --- |
| `json.merge` | Astro SSG 无运行时 JSON 端点（Hexo 懒加载 JSON 的对应物不存在） |
| `dom.onsuccess` 更新通知 | 依赖 hexo-swpp 的 `id.v3` 缓存标记与运行时 popup manager；Astro 侧无等价物，接 `virtual:pwa-register` 会改默认 HTML，超出 P7-1 边界 |
| `skipRequest`（hdslb/meting） | 不需要：两类 host 不被任何缓存路由匹配，天然直连 |
| `mask-icon` / `apple-touch-icon` / `bookmark_icon` / startup images | 依赖 `theme.pwa` 配置层（1.7.1 的 `_config.anzhiyu.yml` → site config 在 P7-4 才落）；本任务不伪造配置来源。默认 head 已有 favicon 与 theme-color |
| PWA 图标的自动生成（pwa-assets generator） | 不上 `@vite-pwa/assets-generator`（另一个 optional peer）：需求是「不新画图标」，直接用 repo 里已有的 `public/img/siteicon/*` |
| `dev` 模式 SW | 只做 build 产物验收；`astro dev` 的 PWA dev middleware 未接（不在验收口径） |
| 子路径部署（`DEPLOY_SITE_ROOT`）下的 PWA | 注入与 manifest 已按 `config.base` 拼 URL，但 PWA 只在显式开关下启用（demo 部署不设），未在真实子路径站点验证 |
| 真实站 xcAnzhiyu | `pwa.enable=false`，PWA 不在真实站验收范围；迁移产物默认构建零影响已隔离验证 |

## 9. 修改文件清单

| 文件 | 改动 |
| --- | --- |
| `examples/blog/astro.config.mjs` | P7-1 PWA 段（env 门控、Workbox 配置、getSpareUrls 补丁、manifest、构建后注入 integration） |
| `examples/blog/package.json` | devDependencies + `"@vite-pwa/astro": "^2.0.4"` |
| `pnpm-lock.yaml` | 新增 PWA 依赖树（+227 行，只增不删） |
| `tests/e2e/pwa.spec.ts` | 新增 2 条离线/产物用例 |
| `playwright.pwa.config.ts` | 新增独立 PWA 配置（4322、ANZHIYU_PWA=1 webServer、独立报告目录） |
| `.github/workflows/ci.yml` | e2e job 追加 PWA 一步 + 独立 artifact |
| `docs/notes/P7-1-pwa.md` | 本文件 |

## 10. PLAN 附录 C #7 结论

> 「`@vite-pwa/astro` 能否表达 `sw-rules.js` 的 CDN 备用逻辑」

**能表达 80%，但 getSpareUrls 需要补丁。** 具体：
- cacheRules.cdn / external.stable 的「URL 正则 + CacheFirst + cacheName + 过期」→
  `generateSW.runtimeCaching` 原生表达（已序列化进 SW，见 §5.1 产物核对）；
- getSpareUrls 的「同一路径多 URL、3s 超时后换下一个」→ Workbox runtimeCaching 的
  `handler` 在 generateSW 里只能是字符串策略，无法表达「超时换 URL」。两条路：
  (a) `injectManifest`/`buildSW` 用 `@vite-pwa/workbox-swkit` 自写 SW（可行但重）；
  (b) 本文方案：追加 50 行独立 fetch 监听（本文选 b，产物已验证）。
- 结论：**@vite-pwa/astro 作为生成/预缓存底座成立，sw-rules 的备用 URL 语义需一段
  自定义 SW 代码承载**；附录 C #7 可标「◐ 部分通过（需补丁，已实现）」。

- **CI 实测（run 45398204980）**：PWA 专用 step **2/2 passed（7.3s）**，其中「SW ready → 断网 reload 首页」
  868ms PASS；默认 e2e 中 pwa.spec.ts 两条按环境 skip（非 PWA 构建无 sw.js）。
