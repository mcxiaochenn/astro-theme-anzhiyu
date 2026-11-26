# P4-10 · Phase 4 行为验收接入 CI（Playwright e2e job）

范围：把 `tests/e2e` 的行为用例真正在 CI（ubuntu-latest）跑起来，并补齐「站内无刷新
导航 / 12 种 `page.type` 冒烟 / 搜索 UI 检测」三组用例，作为 Phase 4 的退出验收入口。

结论（TL;DR）：

- `.github/workflows/ci.yml` 新增独立 `e2e` job（第 79–123 行），与 `build` job 并行；
  `build` job 的 11 个步骤一行未动。
- `npx playwright test --list`：**36 tests in 7 files**（原有 17 条 + 新增 19 条）。
- 本机（Windows + DSH 沙箱）跑不了浏览器，本地只验证了**用例可收集**与
  **站点可被 webServer 拉起**（13 个 URL 全 200）；真实执行只能在 CI，见 §6。
- 第一次 CI 真实结果**尚未产生**，回填占位见 §7。

---

## 1. 改前现状

| 事实 | 改前 |
| --- | --- |
| `.github/workflows/ci.yml` | 只有 `build` job：install → build → CSS baseline → CSS vars → upstream delta → baseline HTML diff → artifact |
| `tests/e2e/` | 17 条用例 / 4 个文件：`console.spec.ts`(5)、`dark-mode.spec.ts`(6)、`music.spec.ts`(2)、`right-menu.spec.ts`(4) |
| 这 17 条跑过吗 | **没有**。`playwright.config.ts` 早就写好了，但 CI 里从来没有 `playwright test` 步骤 |
| 本机为什么没跑 | DSH Windows 沙箱阻断浏览器启动：`spawn EPERM` + Chromium mojo 通道 `拒绝访问 (0x5)`，见 `docs/plan/PLAN.md` §7 风险 **R12** |
| 覆盖缺口 | 站内点击的 document 请求数、前进/后退、12 种 `page.type` 独立页面、搜索 UI 都没有用例 |

17 条已有用例的断言本轮**一条没改**（只改了 `helpers.ts`：新增 3 个工具函数，原函数不动）。

## 2. `e2e` job 设计

```yaml
e2e:                                  # ci.yml:85
  name: e2e
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - checkout
    - pnpm/action-setup@v4            # 不写 version，避免与 packageManager 冲突（沿用 build job 注释）
    - actions/setup-node@v4 (Node 24, cache: pnpm)
    - pnpm install --frozen-lockfile
    - npx playwright install --with-deps chromium
    - npx playwright test
    - upload-artifact playwright-report + test-results   (if: always())
```

设计要点：

1. **不重复构建**：站点由 `playwright.config.ts` 的 `webServer` 自己
   `pnpm --filter blog build && … astro preview`，job 里不再单独 build（否则 build 两遍）。
2. **与 `build` job 并行**：两者互不依赖；e2e 在自己的 checkout 里构建，不会踩 dist 产物。
3. **失败留证**：`playwright-report/`（HTML 报告）+ `test-results/`（trace / 截图 / 视频）
   在 `if: always()` 下上传；成功时 `test-results/` 可能不存在，用 `if-no-files-found: ignore`。
4. **不写死 pnpm 版本**：沿用 build job 的既有约定（`packageManager: pnpm@10.29.3`），
   写 `with.version` 会触发 action 的 "Multiple versions of pnpm specified"。
5. `npx` 走仓库根的 `node_modules`（`@playwright/test` 是根 devDependency），不联网拉包。

### 2.1 webServer 命令核查（为什么改 `pnpm --filter blog exec astro build`）

改前 `webServer.command` 是：

```
pnpm --filter blog exec astro build && pnpm --filter blog exec astro preview --host … --port …
```

仓库根 `.npmrc` 是 `node-linker=hoisted`，Astro 装在**仓库根** `node_modules/`，
`examples/blog/node_modules/` 只有 `vite-plugin-stylus-hexo-config` 和 `.astro/`。
担心点：hoisted 布局下 `pnpm --filter blog exec astro` 找不到 astro。

本机实测（证据）：

```
$ pnpm --filter blog exec astro --version
   astro  v7.4.13
EXIT=0

$ pnpm --filter blog exec astro preview --host 127.0.0.1 --port 4399
# 另开一个 shell 逐个 URL 请求：
HOME STATUS=200 LEN=55052
/about/ => 200      /tags/ => 200          /categories/ => 200
/link/ => 200       /essay/ => 200         /room/ => 200
/album/ => 200      /album/demo/ => 200    /album/gallery/ => 200
/music/ => 200      /equipment/ => 200     /page-default/ => 200
/fcircle/ => 200
```

结论：pnpm 会把 workspace 根的 `node_modules/.bin` 加进 PATH，hoisted 下解析正常。
但为了与 **CI 里已经绿了的** `build` job 保持同一条命令，最终改成：

```ts
// playwright.config.ts:52
command: `pnpm --filter blog build && pnpm --filter blog exec astro preview --host ${HOST} --port ${PORT}`,
```

`pnpm --filter blog build` 就是 `build` job「Build blog」那一步的原命令（本轮 CI 验证过），
`astro preview` 用上面的实测结论；CI（ubuntu）与本地跑的是同一串命令。

## 3. 用例清单（7 个文件 / 36 条）

### 3.1 既有 17 条（未改断言）

| 文件 | 条数 | test 标题 |
| --- | --- | --- |
| `console.spec.ts` | 5 | 全局中控台 › 点击导航栏按钮打开面板，且面板内容已渲染；再次点击入口关闭面板；「隐藏侧栏」开关切换 html.hide-aside 与按钮 .on 状态；面板里的暗色开关能切换 data-theme；点击遮罩关闭面板并复位入口复选框 |
| `dark-mode.spec.ts` | 6 | 首访跟随系统（dark/light）各 1；手动切换 2（右侧按钮 / 右键菜单）；状态保持 2（刷新 / ClientRouter 导航后） |
| `music.spec.ts` | 2 | 播放器容器跨站内导航保持同一个 DOM 节点；播放中导航不中断且进度继续推进（音源不可达/CDN 阻断时 skip） |
| `right-menu.spec.ts` | 4 | 右击链接显示菜单与扩展项；右击空白显示基础菜单；菜单项集合齐全；点击「回到顶部」关闭菜单并滚动到页首 |

### 3.2 新增 19 条

| 文件 | 条数 | test 标题 |
| --- | --- | --- |
| `navigation.spec.ts` | 3 | ① 点击站内链接不产生 document 请求（无整页刷新）；② 浏览器前进/后退后页面可用，且 console 无运行时错误；③ 连续两次站内导航后 document 请求仍为 0 |
| `page-types.spec.ts` | 14 | 13 条数据驱动（`<type> · <path> 返回 200 且模板根节点存在`）+ 1 条「用例数据覆盖全部 12 种 page.type」 |
| `search.spec.ts` | 2 | ① 搜索入口检测：未启用时明确 skip，不伪造通过；② 打开搜索框 → 输入关键词 → 出结果（demo 站 skip，见 §4） |

`navigation.spec.ts` 的判定方式（不靠「URL 变了」自欺）：

- 监听 `page.on('request')` 里 `resourceType === 'document'` 的请求：首访首页产生 N 条
  作为基线，站内点击后 `documents.length` 必须仍为 N（新增为 0 条）；
- `window.__e2eSameDocument` 标记：整页刷新会清空 window，导航后标记仍在才算同文档；
- console 断言：`pageerror`（未捕获 JS 异常）严格为空；`console.error` 过滤掉
  `Failed to load resource / net::ERR` 这类**资源加载失败**噪音（第三方 CDN、图片 404
  由资源与第三方集成用例负责），其余报错一律 fail。

`page-types.spec.ts` 的 13 个 URL（都是 `examples/blog/dist/<path>/index.html` 真实存在的
构建产物，12 个 `fixtures/page-*.md` + `fixtures/about-page.md`，选择器口径来自
`docs/notes/phases/P3-2-page-types.md` §6.2）：

| page.type | URL | 断言选择器 |
| --- | --- | --- |
| about | `/about/` | `#about-page` |
| categories | `/categories/` | `#tag-page-tags` |
| tags | `/tags/` | `#tag-page-tags` |
| link | `/link/` | `#article-container .flink` |
| essay | `/essay/` | `#essay_page` |
| album | `/album/` | `#album .card-album` |
| album_detail | `/album/demo/` | `#album_detail`（type=1 时间线/瀑布流） |
| album_detail | `/album/gallery/` | `#album_detail .fj-gallery`（type=2 画廊） |
| music | `/music/` | `#anMusic-page` |
| equipment | `/equipment/` | `#equipment .equipment-item`（多件设备，按 count>0 断言） |
| fcircle | `/fcircle/` | `#page > h1.page-title`（见下） |
| room | `/room/` | `#room_page` |
| default | `/page-default/` | `#article-container` |

每个 URL 断言：HTTP **200** + `body[data-type="anzhiyu"]` + `#page` 外壳（1 个）+
模板根节点 count>0 + `<title>` 非空。

`fcircle` 的特殊说明：demo 配置 `theme.config.yml` 的 `friends_vue.enable: false`，
上游 `fcircle.pug` 整体被该开关包住，因此页面**按设计不产出模板内部 DOM**（构建产物实测
`<div id="page"><h1 class="page-title">友链朋友圈</h1></div>`，无 `.fcircle_page`）。
用例只验外壳，不拿配置门控当模板 bug。

## 4. 搜索用例为什么是 skip（不伪造通过）

demo 站 `examples/blog/theme.config.yml` 的搜索三开关全是 false：

```yaml
algolia_search.enable: false
docsearch.enable: false
local_search.enable: false
```

上游 `layout/includes/third-party/search/index.pug` 在三个开关都关时**不输出任何搜索
DOM**，站上没有 `#search-button`；`npx playwright test --list` 能收集到 2 条搜索用例，
但真实执行时 `helpers.detectSearchUi()` 返回 `null` → `test.skip()`，skip message 为：

> demo 站未启用搜索 UI（theme.config.yml 的 local_search/algolia_search/docsearch 均为 false）；
> 搜索验收走真实站迁移验收（scripts/accept-migration.mjs + 浏览器走查）

CI 上这两条会显示 **skipped 而不是 passed**，不贡献「通过」假象。
「打开 → 输入 → 出结果」的真实交互分支已按上游 pug 的 DOM 契约写好
（`#local-search .search-dialog` / `.local-search-box--input` / `#local-search-results`、
`#algolia-search` 系列、`.docsearch-wrap` → `.DocSearch-Modal`），等有 fixture 打开某套
搜索时直接生效；当前 demo 站不可达该分支，属于未验证代码，已在文件头注明。

## 5. `npx playwright test --list` 原始输出

命令：`cd D:\Git-project\astro-theme-anzhiyu; npx playwright test --list`（EXIT=0）：

```
Listing tests:
  [chromium] › console.spec.ts:13:3 › 全局中控台 › 点击导航栏按钮打开面板，且面板内容已渲染
  [chromium] › console.spec.ts:26:3 › 全局中控台 › 再次点击入口关闭面板
  [chromium] › console.spec.ts:37:3 › 全局中控台 › 「隐藏侧栏」开关切换 html.hide-aside 与按钮 .on 状态
  [chromium] › console.spec.ts:65:3 › 全局中控台 › 面板里的暗色开关能切换 data-theme
  [chromium] › console.spec.ts:76:3 › 全局中控台 › 点击遮罩关闭面板并复位入口复选框
  [chromium] › dark-mode.spec.ts:15:3 › 暗色模式 · 首访跟随系统（dark） › 系统偏好为深色时首访使用 data-theme="dark"
  [chromium] › dark-mode.spec.ts:26:3 › 暗色模式 · 首访跟随系统（light） › 系统偏好为浅色时首访使用 data-theme="light"
  [chromium] › dark-mode.spec.ts:33:3 › 暗色模式 · 手动切换 › 点击右侧暗色按钮切换主题并写入 localStorage
  [chromium] › dark-mode.spec.ts:47:3 › 暗色模式 · 手动切换 › 右键菜单里的「深色模式」也能切换主题
  [chromium] › dark-mode.spec.ts:63:3 › 暗色模式 · 状态保持 › 刷新后主题与 localStorage 保持一致
  [chromium] › dark-mode.spec.ts:76:3 › 暗色模式 · 状态保持 › 站内导航（ClientRouter）后主题不被重置
  [chromium] › music.spec.ts:15:3 › 音乐播放器 › 播放器容器跨站内导航保持同一个 DOM 节点
  [chromium] › music.spec.ts:36:3 › 音乐播放器 › 播放中导航不中断且进度继续推进
  [chromium] › navigation.spec.ts:39:3 › 站内导航 · ClientRouter 无刷新 › 点击站内链接不产生 document 请求（无整页刷新）
  [chromium] › navigation.spec.ts:63:3 › 站内导航 · 前进/后退 › 浏览器前进/后退后页面可用，且 console 无运行时错误
  [chromium] › navigation.spec.ts:97:3 › 站内导航 · 连续导航 › 连续两次站内导航后 document 请求仍为 0
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › about · /about/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › categories · /categories/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › tags · /tags/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › link · /link/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › essay · /essay/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › album · /album/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › album_detail · /album/demo/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › album_detail · /album/gallery/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › music · /music/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › equipment · /equipment/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › fcircle · /fcircle/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › room · /room/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:44:5 › page.type 独立页面冒烟 › default · /page-default/ 返回 200 且模板根节点存在
  [chromium] › page-types.spec.ts:63:3 › page.type 独立页面冒烟 › 用例数据覆盖全部 12 种 page.type
  [chromium] › right-menu.spec.ts:13:3 › 右键菜单 › 右击链接显示菜单与扩展项，遮罩同时出现
  [chromium] › right-menu.spec.ts:29:3 › 右键菜单 › 右击空白处显示基础菜单，不出现链接扩展项
  [chromium] › right-menu.spec.ts:43:3 › 右键菜单 › 菜单项集合齐全（回到顶部 / 复制 / 搜索 / 音乐 / 随手逛逛）
  [chromium] › right-menu.spec.ts:64:3 › 右键菜单 › 点击「回到顶部」关闭菜单并滚动到页首
  [chromium] › search.spec.ts:23:3 › 搜索 UI（P4-8） › 搜索入口检测：未启用时明确 skip，不伪造通过
  [chromium] › search.spec.ts:30:3 › 搜索 UI（P4-8） › 打开搜索框 → 输入关键词 → 出结果
Total: 36 tests in 7 files
```

改前基线（同命令，在新增文件落地前跑过一次）：

```
Total: 17 tests in 4 files
```

新增：36 − 17 = **19 条**，覆盖全部 12 种 `page.type`（13 个真实 URL）。

## 6. 本机跑不了浏览器（诚实说明）

`docs/plan/PLAN.md` §7 风险 **R12** 原文：

> 本机 Playwright 被 DSH Windows 沙箱阻断（`spawn EPERM` + Chromium mojo 通道
> `拒绝访问 0x5`），浏览器级回归本地跑不了 | 高 | 中 | 脚本按 CI 入口写好；
> Phase 2 起浏览器测试放 CI（Ubuntu 无此限制），本地用 wincu 通道抽查

因此本轮**没有**、也**不可能**在本地执行 `npx playwright test` 的真实用例：

- 本地做了：`npx playwright test --list`（证明 36 条可收集）、
  `pnpm --filter blog exec astro --version`（证明 hoisted 下能解析 astro）、
  `pnpm --filter blog exec astro preview` + 13 个 URL HTTP 200（证明 webServer 的站点侧可用）、
  以及对 `examples/blog/dist/**.html` 的静态核对（13 个模板根选择器都存在）；
- 本地没做：浏览器进程启动、真实点击/断言。第一次真实执行只能等 CI。
- 不把 `--list` 通过当作行为验收通过；`search.spec.ts` 在 demo 上 skip 也不当通过。

## 7. 第一次 CI 实际执行结果（待 Lead 回填）

> 本节占位，等第一次带 `e2e` job 的 CI 跑完后回填。

| 项目 | 值 |
| --- | --- |
| 日期 | 待回填 |
| commit | 待回填 |
| Actions run URL | 待回填 |
| e2e job 总耗时 | 待回填（timeout 20 min） |
| `36` 条结果 | passed ? / failed ? / skipped ? |
| 失败用例与原因 | 待回填 |
| artifact `playwright-report` | 待回填（有/无） |
| 结论 | 待回填 |

回填时提醒：

1. `search.spec.ts` 的 2 条预计是 **skipped**（demo 配置未开搜索），不算失败；
2. `music.spec.ts` 的「播放中导航」在 CI 可能因音源/网络 skip，也不算失败；
3. 若失败，先看 `playwright-report/` 的 trace 与 `test-results/` 截图，
   再对照 `docs/plan/PLAN.md` Phase 4 的验收项定位是主题交互缺口还是用例选择器问题
   （17 条行为基线**首次实跑**，暴露 Phase 4 未完成的交互属于预期内情况）。

## 8. 复跑方式

```powershell
cd D:\Git-project\astro-theme-anzhiyu
npx playwright test --list      # 只收集，不启动浏览器（本机可跑）

# CI 等价命令（会自己 build + preview，本机因 R12 起不了浏览器）：
npx playwright test

# 指向已部署实例时跳过 webServer：
$env:E2E_BASE_URL="https://example.com"; npx playwright test
```

`package.json` 新增 `"test:e2e": "playwright test"`（只加这一条脚本）。

## 9. 变更文件

| 文件 | 动作 |
| --- | --- |
| `.github/workflows/ci.yml` | 新增 `e2e` job（第 79–123 行）；`build` job 未改动 |
| `playwright.config.ts` | webServer 命令改为 `pnpm --filter blog build && pnpm --filter blog exec astro preview …`，补注释记录验证证据 |
| `tests/e2e/navigation.spec.ts` | 新增 3 条（无刷新导航 / 前进后退 / 连续导航） |
| `tests/e2e/page-types.spec.ts` | 新增 14 条（12 种 page.type / 13 个真实 URL + 覆盖自检） |
| `tests/e2e/search.spec.ts` | 新增 2 条（检测 + 真实交互分支；demo 站 skip） |
| `tests/e2e/helpers.ts` | 新增 `trackDocumentRequests` / `collectPageErrors` / `runtimeConsoleErrors`，原函数未改 |
| `package.json` | 新增 `test:e2e` 脚本 |
| `docs/notes/phases/P4-10-e2e-ci.md` | 本文件 |
