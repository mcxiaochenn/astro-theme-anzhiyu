# P7-6 · 主题静态资源打包与 Astro 自动接线（W1-D）

- 日期：2026-11-24（Asia/Shanghai）
- 任务：task-5 / W1-D —— 修「迁移站全站 `/js/*` 404」的根因：把上游主题 `source/` 下的主题自有静态资源收进主题包，并提供 Astro integration 自动接线，站点不再依赖手工拷 `public/`
- 上游参考：`D:/Git-project/_research/anzhiyu-upstream`（hexo-theme-anzhiyu **1.7.1**）
- 真实源站：`D:/Git-project/xcAnzhiyu`（hexo-theme-anzhiyu **1.6.14**，Hexo 7.3.0，`hexo-all-minifier ^0.5.7`、`all_minifier: true`，**只读**）
- 迁移演练产物：`.migration-out/xcAnzhiyu`（94 页 HTML，`pnpm build` 已跑过）
- 相关：`docs/reference/resource-path-policy.md`（资源路径豁免边界）、`docs/notes/phases/P7-3-migration.md`（迁移脚本）、`docs/notes/phases/P4-10-e2e-ci.md`、`scripts/diff-html.mjs`（P2-13）

---

## 0. 一页结论

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 根因 | 上游 Hexo 把 `themes/anzhiyu/source/` **整目录直通** `public/`；`examples/blog` 是手工把 `js/{main,utils,tw_cn}.js`、`js/{anzhiyu,search}/*`、`css/index.css`、`anzhiyu/random.js` 放进 `public/`。`scripts/migrate-hexo.mjs` 只复制**站点** `source/`，不复制主题 `source/` → 迁移站缺少主题资源 |
| 2 | 缺口 | 迁移站 94 页 × 6 个本地 URL 缺失（`/js/main.js`、`/js/utils.js`、`/js/tw_cn.js`、`/js/anzhiyu/right_click_menu.js`、`/anzhiyu/random.js`、`/css/index.css`）；`/js/flink.js` 是**假引用**（文章代码块文本），见 §2.4 |
| 3 | 主题资源归属 | 10 个主题 JS（`main/tw_cn/utils` + `anzhiyu/{ai_abstract,comment_barrage,people,random_friends_post,right_click_menu}` + `search/{algolia,local-search}`）+ `css/index.css` 占位 → 搬进 `public/`。`/anzhiyu/random.js` **不进**主题包（站点生成物）；站点 `source/js/*` 的 7 个自定义脚本 **不进**主题包（站点 `public/` 由 migrate-hexo 复制） |
| 4 | integration | `integration.mjs（已删除，由 public/ 原生接管）`，默认导出 `anzhiyuAssets(options?)`；`astro:build:done` 逐文件复制（已存在则 warn+保留站点侧），`astro:server:setup` 挂 connect 静态中间件（不命中 `next()`→Astro 404）。零第三方依赖 |
| 5 | 构建产物 | `dist` 中 7 个验收 URL 全部存在且字节数与主题包 assets 一致；`dist/js/**` 10/10 文件 SHA-256 与 assets 相同 |
| 6 | 基线 diff | `BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json` → **48 页 PASS / diffCount 0 / missingNodes 0 / unexpectedNodes 0**（迁移前同值，未回归） |
| 7 | 迁移站如何拿到资源 | 主题资源：`integrations: [anzhiyuAssets()]` 一行（migrate-hexo 复制 `astro.config.mjs` 时**自动带上**，重跑 `pnpm install` 后生效）；`/anzhiyu/random.js`：migrate-hexo 在 [6/8] 静态资源阶段按站点文章列表生成；站点自定义 js/css：migrate-hexo 现有复制逻辑已覆盖。详见 §7 |
| 8 | 可发布性 | `package.json` `files` 追加 `assets`、`integration.mjs`；`exports` 追加 `"./integration": "./integration.mjs"`。`npm pack --dry-run` 清单 172 文件 = `assets/` 11 + `src/` 159 + `integration.mjs` + `package.json` |

验收命令与数字见 §4、§5、§6；未决/风险见 §8。

---

## 1. 现状与根因

### 1.1 上游链路（Hexo）

```
themes/anzhiyu/source/{js,css,img,favicon.ico}   ← Hexo 生成时整目录复制
        ↓
public/{js,css,img}                              ← 模板 / GLOBAL_CONFIG 写死的 URL 的落点
```

模板里这些 URL 是**硬编码**的，不经过打包器（`layout/includes/additional-js.pug`）：

```pug
script(src=url_for(theme.asset.utils))          // /js/utils.js
script(src=url_for(theme.asset.main))           // /js/main.js
script(src=url_for(theme.asset.translate))      // /js/tw_cn.js
script(async src="/anzhiyu/random.js")          // 由主题 generator 生成（见 §2.3）
```

`css/index.css` 是主题 styl 的编译产物（`source/css/index.styl` → hexo-renderer-stylus）。

### 1.2 Astro 侧现状（迁移前）

- `src/config/assets.ts` 的 `INTERNAL_SRC` 已经把这 10 个主题 JS 的 URL 算对了（`/js/main.js` 等，P4-1 复刻 `scripts/events/cdn.js`），模板（`AdditionalJs.astro`）也按上游顺序输出 `<script src="/js/...">`；
- 但**文件本身**没人提供：
  - `examples/blog` 靠手工 `public/js/**`（10 个文件）+ `public/css/index.css`（297 B 占位）+ `public/anzhiyu/random.js`；
  - `scripts/migrate-hexo.mjs` 的 [6/8] 只 `walkFiles(<站点>/source)` → `public/`，主题 `source/` 不在复制来源里；
- 结果：`.migration-out/xcAnzhiyu/dist` 里 94 页 HTML 引用了 6 个不存在的本地 URL（实测 §1.3）。

### 1.3 实测缺口（迁移站，94 页）

在 `.migration-out/xcAnzhiyu/dist` 上逐页扫 `src/href="/..."`（94 个 HTML）：

```
/js/anzhiyu/right_click_menu.js                 94  exists=False
/css/index.css                                  94  exists=False
/anzhiyu/random.js                              94  exists=False
/js/utils.js                                    94  exists=False
/js/main.js                                     94  exists=False
/js/tw_cn.js                                    94  exists=False
/js/search/local-search.js                       0  （不静态引用：由运行时 getScript 加载，仍属主题资源）
/anzhiyu/random.js 之外另有 /js/flink.js 1 exists=False  ← 假引用，见 §2.4
```

`/js/search/local-search.js`、`/js/anzhiyu/ai_abstract.js` 等不写在 HTML 里（运行时按 `GLOBAL_CONFIG` 用 `getScript` 拉），但仍必须存在——`verify-assets` 类门禁与浏览器实际行为都需要；`docs/reference/resource-path-policy.md` §3.4「本地资源 404 一律 FAIL」对它们同样适用。

### 1.4 基线侧同类引用（48 页）

`.baseline-html` 48 页里 6 类本地引用（共 6 个 URL）：

```
/anzhiyu/random.js          baselineRefPages= 48
/css/index.css              baselineRefPages= 48
/js/main.js                 baselineRefPages= 48
/js/tw_cn.js                baselineRefPages= 48
/js/utils.js                baselineRefPages= 48
/js/anzhiyu/ai_abstract.js  baselineRefPages=  1
```

→ 这 6 个 URL 必须继续在 `dist` 存在，否则 diff 虽可能仍 PASS，但实际站点已 404（P2-13 §11 / 资源路径策略 §4.2 说的「不能靠 diff 兜底」）。

---

## 2. 三方资源清单比对与归属判断

### 2.0 比对的三份数据

| 代号 | 路径 | 性质 |
| --- | --- | --- |
| A | `_research/anzhiyu-upstream/source/js` | 主题 **1.7.1** 源码（本项目的对齐目标） |
| B | `public/js`（迁移前） | 本仓库 demo 站手工维护版（历史来源） |
| C | `xcAnzhiyu/themes/anzhiyu/source/js` | 真实源站主题 **1.6.14** 源码 |
| D | `xcAnzhiyu/public/js` | 真实源站 **构建产物**（1.6.14 源码经 `hexo-all-minifier` 压缩） |

### 2.1 主题 JS：10 个文件，A ≡ B（逐字节），C/D 是 1.6.14 与压缩产物

`A` vs `B`：**10/10 SHA-256 完全相同**（所以搬进 `assets/` 不会改变 demo 站今天的行为）：

```
js/main.js                     assets=4EC67D72C3 blogPublic=4EC67D72C3 upstream=4EC67D72C3  OK
js/tw_cn.js                    assets=99915C60EF blogPublic=99915C60EF upstream=99915C60EF  OK
js/utils.js                    assets=7213C31E96 blogPublic=7213C31E96 upstream=7213C31E96  OK
js/anzhiyu/ai_abstract.js      ... OK   (E8CDE4802F)
js/anzhiyu/comment_barrage.js  ... OK   (6E75324024)
js/anzhiyu/people.js           ... OK   (AE6C7458B4)
js/anzhiyu/random_friends_post.js ... OK (37E11CBAF6)
js/anzhiyu/right_click_menu.js ... OK   (CF5AF7E8B0)
js/search/algolia.js           ... OK   (C6AFE3A9C7)
js/search/local-search.js      ... OK   (C0C03FE5AF)
identical=10 mismatch=0
```

`C`（1.6.14 源码）vs `A`（1.7.1 源码）：**4/10 相同、6/10 不同**——版本差异是真实的，不能拿 1.6.14 当 1.7.1 的替代：

| 文件 | 1.6.14 源码 | 1.7.1 源码 | 结论 |
| --- | --- | --- | --- |
| `main.js` | 64666 B | 64181 B | DIFFERENT |
| `tw_cn.js` | 19416 B | 19416 B | IDENTICAL |
| `utils.js` | 50067 B | 50562 B | DIFFERENT |
| `anzhiyu/ai_abstract.js` | 14216 B | 14216 B | IDENTICAL |
| `anzhiyu/comment_barrage.js` | 6708 B | 6708 B | IDENTICAL |
| `anzhiyu/people.js` | 7230 B | 7710 B | DIFFERENT |
| `anzhiyu/random_friends_post.js` | 8999 B | 9874 B | DIFFERENT |
| `anzhiyu/right_click_menu.js` | 15845 B | 16946 B | DIFFERENT |
| `search/algolia.js` | 6307 B | 7256 B | DIFFERENT |
| `search/local-search.js` | 9525 B | 9525 B | IDENTICAL |

`D`（源站构建产物）**不能当「主题资源真身」照抄**：`xcAnzhiyu/_config.yml:309 all_minifier: true` + `package.json` 里 `hexo-all-minifier ^0.5.7`，`public/js` 全部是压缩后的产物：

```
xcAnzhiyu/themes/anzhiyu/source/js/main.js   64666 B  →  xcAnzhiyu/public/js/main.js   31406 B
xcAnzhiyu/themes/anzhiyu/source/js/utils.js  50067 B  →  xcAnzhiyu/public/js/utils.js  24848 B
xcAnzhiyu/themes/anzhiyu/source/js/tw_cn.js  19416 B  →  xcAnzhiyu/public/js/tw_cn.js  16951 B
```

结论：**主题 JS 的字节来源取 A（=B）**；`D` 只用来核对「哪些 URL 真实存在 / 哪些是站点自定义」，不取字节。

### 2.2 站点自定义 JS（7 个）：留在站点 `public/`，由 migrate-hexo 复制

`xcAnzhiyu/source/js/` 下 7 个文件不属于任何版本的主题 `source/`：

| 文件 | 站点 source | 站点 public（压缩后） | 归属 |
| --- | --- | --- | --- |
| `js/card-welcome.js` | 14138 B | 9735 B | 站点自定义 → 站点 public |
| `js/comments.js` | 7410 B | 5642 B | 站点自定义 → 站点 public |
| `js/countdown.js` | 6973 B | 5132 B | 站点自定义 → 站点 public |
| `js/echarts.min.js` | 1117982 B | 1117938 B | 站点 vendor（第三方库）→ 站点 public |
| `js/imgloaded.js` | 3142 B | 1772 B | 站点自定义 → 站点 public |
| `js/nomyurl.js` | 16257 B | 7496 B | 站点自定义 → 站点 public |
| `js/twikoo.all.min.js` | 1415610 B | 1389660 B | 站点 vendor（twikoo 自托管副本）→ 站点 public |

判断依据：这 7 个文件**不在**任何一版主题 `source/` 里，也不在主题模板的 `theme.asset.*` 资源表（`src/config/assets.ts` 的 `INTERNAL_SRC`）里，而是站点 `source/js/` 直接被 Hexo 复制（Hexo 站点 `source/` 的「非 `_` 前缀」目录会原样进 `public/`）。migrate-hexo [6/8] 现有逻辑（`walkFiles(<site>/source)` → `public/`）已经覆盖，且 `.migration-out/xcAnzhiyu/public/js/` 里这 7 个文件**已经在了**（不需要本次改动）。

> 注意：`link.js` / `flink_count.js` 在站点根目录，是 Hexo 的 `hexo.extend.generator` 脚本（生成 `link/` 页与 `flink_count.json`），不是资源文件；本次不涉及。

### 2.3 `/anzhiyu/random.js`：**站点生成物**，不进主题包

判断依据（三条独立证据）：

1. 上游主题 `source/` 下**没有** `anzhiyu/` 目录（`_research/anzhiyu-upstream/source/` 只有 `css/ js/ img/ favicon.ico`）；
2. 它是主题 generator 的产物：`_research/anzhiyu-upstream/scripts/helpers/random.js`
   `hexo.extend.generator.register('random', …)` → `return { path: config.path || 'anzhiyu/random.js', data: result }`，
   `data` 内容 = `var posts=<locals.posts 的 path 列表 JSON>` + `function toRandomPost(){ pjax.loadUrl('/'+posts[随机]) }`（pjax 开）或 `window.location.href=…`（pjax 关），**依赖站点文章集合**，并受 `footer.list.randomFriends` 影响；
3. 两个站的实际内容不同：`public/anzhiyu/random.js`（384 B）列的是 fixture 文章路径（`2025/04/20/tags-thirdparty/` 等 10 条）；`xcAnzhiyu/public/anzhiyu/random.js`（18909 B，压缩后）列的是源站文章路径。

结论：`/anzhiyu/random.js` 属于**站点侧生成资源**，不能塞进主题包（否则每个迁移站都会拿到 fixture 的文章列表 → 随机跳转 404）。本次处理：`public/anzhiyu/random.js` **原地保留**（demo 站自己的生成物，仍进 `dist/anzhiyu/random.js`）；迁移站的生成接线见 §7.3。

### 2.4 `/js/flink.js`：**假引用**，无资源缺口

在 `.migration-out/xcAnzhiyu/dist` 里全量搜索该路径，只命中**文章正文的代码块文本**：

```
FILE=...dist/posts/p1c0fbc06/index.html
MATCH=src="/js/flink.js"     ← 位于 <figure class="highlight yml"><pre><span class="line">… 里
CTX=…<span class="string">&#x3C;script</span> <span class="string">src="/js/flink.js">&#x3C;/script></span>…
```

即：文章在讲「用 hexo inject 注入友链状态脚本」时，把 `<script src="/js/flink.js"></script>` 当 YAML 示例贴在代码块里，浏览器不会发请求。源站 `source/js/` 里也**没有** `flink.js`（那套方案最终没落地）。→ 不需要任何归属或复制。若未来真实站真有该文件：属于**站点自定义脚本**，放 `<站点>/source/js/` → migrate-hexo [6/8] 自动复制。

（`/link/` 页里的 `href="flink-1"` 是 tabs 组件的 `data-href`，也不是资源引用。）

### 2.5 `/css/index.css`：`assets/css/index.css` 是**占位**，真实样式由 Vite 产物承担

| 事实 | 数据 |
| --- | --- |
| 上游 / 源站真实产物 | baseline `public/css/index.css` **683218 B**；`xcAnzhiyu/public/css/index.css` **614620 B**（`all_minifier` 压过，只有 4 个换行） |
| Astro 侧真实样式 | `dist/_astro/upstream.<HASH>.css` ≈ 682990–684087 B（Stylus 经 `vite-plugin-stylus-hexo-config` 编译，`verify-css.mjs` 独立校验 ±5%） |
| 结构性 `<link>` | `Head` 组件按上游输出 `<link rel="stylesheet" href="/css/index.css">`（48 页 / 94 页全有），Astro 不会把它改写成 `_astro` 路径 |
| 因此 | 该 URL 必须**有文件**（否则 404，违反策略 §3.4），但不应是真实样式（会重复加载 684 KB，且路径语义归 Vite 打包）。→ 主题包 `assets/css/index.css` 放 **297 B 占位**（内容 < 256 字符，说明「真实样式由 Vite 构建产物提供」） |

占位文件内容（从 `public/css/index.css` 原样搬入）：

```css
/*
 * 结构性占位：上游 Head 固定输出 <link rel="stylesheet" href="/css/index.css">。
 * Astro 侧的真实样式由站点 import 的 Stylus 经 Vite 打包成 /_astro/*.css 注入，
 * 这里放一个空文件避免该结构性 <link> 触发 404（样式不依赖此文件）。
 */
```

与 `docs/reference/resource-path-policy.md` 的一致性：

- §1.1 把 `/css/index.css` ↔ `/_astro/upstream.<HASH>.css` 登记为「resource-path 豁免」，并明确「不豁免的是本地资源 404」；占位文件正是让 **404 不成立**；
- §3.4「本地资源 404 / 空文件一律 FAIL」：占位 297 B ≠ 空文件，且 URL 真实可达；
- §5.1 方案 1（Phase 7：把 Stylus 编译产物直接写到 `public/css/index.css`，路径/内容双稳）仍是**未完成项**——本任务不动 CSS 构建管线，占位策略延续，Phase 7 落地时删除占位、把该路径换成真实样式（报告 §8 记为遗留）。

### 2.6 归属总表（本次落地）

| URL | 归属 | 落地位置 | 迁移站来源 |
| --- | --- | --- | --- |
| `/js/{main,utils,tw_cn}.js` | 主题 | `assets/js/` | integration（build 复制 / dev 中间件） |
| `/js/anzhiyu/{ai_abstract,comment_barrage,people,random_friends_post,right_click_menu}.js` | 主题 | `assets/js/anzhiyu/` | 同上 |
| `/js/search/{algolia,local-search}.js` | 主题 | `assets/js/search/` | 同上 |
| `/css/index.css` | 主题（占位） | `assets/css/index.css` | 同上 |
| `/anzhiyu/random.js` | 站点生成 | `public/anzhiyu/random.js`（保留） | migrate-hexo [6/8] 生成（§7.3） |
| `/js/{card-welcome,comments,countdown,echarts.min,imgloaded,nomyurl,twikoo.all.min}.js` | 站点自定义 | 站点 `public/js/` | migrate-hexo [6/8] 现有复制逻辑 |
| `/js/flink.js` | 无（假引用） | — | — |
| `/img/**` | 主题但**本次不动** | `public/img/` 保留 | 后续任务（`img/` 仍由站点 public 承载，见 §8） |

---

## 3. integration 设计

文件：`integration.mjs（已删除，由 public/ 原生接管）`（226 行 / 8608 B，零第三方依赖，仅 `node:fs`、`node:path`、`node:url`）。

### 3.1 对外契约

```js
// 站点 astro.config.mjs
import anzhiyuAssets from 'astro-theme-anzhiyu/integration'
export default defineConfig({
  integrations: [anzhiyuAssets()],   // 默认即可；不依赖站点 public/
})
```

```ts
anzhiyuAssets(options?: {
  assetsDir?: string   // 默认 <主题包>/assets；相对路径按 process.cwd() 解析
  verbose?: boolean    // 默认 false（只打一行汇总）；true 时逐文件打印
}): AstroIntegration     // name = 'anzhiyu-assets'
```

资源目录用 `import.meta.url` 解析（`path.dirname(fileURLToPath(import.meta.url))`）→ 主题包被 `file:` / npm 安装到 `.migration-out/<site>/node_modules/` 或任何位置都能找到自带 `assets/`（§6.4 用「只含 files 白名单的安装副本」实测）。

### 3.2 build：`astro:build:done`

```js
'astro:build:done': ({ dir, logger }) => {
  const outDir = fileURLToPath(dir)      // dir 是 URL 对象，必须 fileURLToPath
  for (const rel of walkFiles(assetsDir)) {
    const to = path.join(outDir, rel)
    if (existsSync(to)) { conflicts.push(rel); continue }   // 站点侧文件优先
    mkdirSync(path.dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
  conflicts.length && logger.warn(`${n} 个主题资源在产物里已存在，保留站点侧文件：…`)
  logger.info(`复制 ${copied} 个主题静态资源 → ${相对 outDir}`)
}
```

- **复制策略**：逐文件复制、保持目录结构；`assets/` 里有什么就复制什么（当前 11 个文件）。
- **冲突策略**：目标已存在 → **warn + 保留站点侧文件**，不覆盖。理由：站点可能有意用自己维护的版本覆盖同名资源（例如定制过的 `main.js`）；主题包不应该把站点自定义悄悄顶掉。warn 里列出全部冲突文件名，便于排查。冒烟实测见 §6.1。
- **日志**：一行汇总 `复制 11 个主题静态资源 → dist`（Astro 的 logger 会自动加 `[anzhiyu-assets]` 前缀，代码里不再重复加）。

### 3.3 dev：`astro:server:setup`

挂一个 connect 中间件（`server.middlewares.use(fn)`），行为：

1. 仅处理 `GET`/`HEAD`，其余 `next()`；
2. 只认以 `/` 开头的 `req.url`；用 `new URL(...)`-式拆解去掉 query/hash 后 `decodeURIComponent`（非法编码 `next()`）；
3. 若配置了 `base`（如 `DEPLOY_SITE_ROOT=blog` → `/blog/`），先剥掉 base 前缀再匹配（`astro:config:done` 里取 `config.base`）；Vite 已剥 base 时也兼容；
4. `path.resolve(assetsDir, rel)` 后必须仍在 `assetsDir` 内（目录穿越防护）；
5. `statSync` 不是普通文件 / 不存在 → `next()`，交给 Astro 自己的 404（**不自己拼 404 页面**，保持与 Astro 路由一致）；
6. 命中：`200` + `Content-Type`（MIME 表：js/css/json/svg/png/jpg/gif/webp/ico/woff/woff2/ttf/map）+ `Content-Length` + `Cache-Control: no-cache`，`HEAD` 只回头，`GET` 用 `createReadStream(...).pipe(res)`（大文件不整块读内存）。

实现约 60 行（含 MIME 表），没有引 `vite-plugin-static-copy` 之类的依赖。

### 3.4 为什么不用 `public/` 或 Vite 静态拷贝

- Astro `public/` 是**站点**目录，主题包（被安装到 `node_modules`）不能往里写；npm 包也不该在 postinstall 改站点文件；
- `vite-plugin-static-copy` 属于新依赖，且它把文件拷进 Vite 产物目录（`_astro`）而非 `dist` 根，路径语义不符合「原文件名 `/js/main.js`」（`docs/reference/resource-path-policy.md` §3.1：文件名语义不允许变）；
- `astro:build:done` 是 Astro 官方给 integration 的「构建收尾」钩子，写 `dist` 根正是这个场景。

---

## 4. 迁移前后文件清单（examples/blog）

### 4.1 迁移前 `public/`（本次改动前实测，单位 B）

```
js/main.js                                   64181
js/tw_cn.js                                  19416
js/utils.js                                  50562
js/anzhiyu/ai_abstract.js                    14216
js/anzhiyu/comment_barrage.js                 6708
js/anzhiyu/people.js                          7710
js/anzhiyu/random_friends_post.js             9874
js/anzhiyu/right_click_menu.js               16946
js/search/algolia.js                          7256
js/search/local-search.js                     9525
css/index.css                                  297   （占位）
anzhiyu/random.js                              384   （站点生成物）
bgm.wav / favicon.ico / pug-probe.svg / slice-harness.js   （站点侧，未动）
img/**（14 个 fixture 图片，未动）
```

### 4.2 迁移动作

| 动作 | 对象 | 命令 |
| --- | --- | --- |
| 复制进主题包 | 上面 10 个 `js/**` + `css/index.css` | `Copy-Item`（sha256 三方核对见 §2.1） |
| 删除 | `public/js/` 整个目录、`public/css/index.css`（空目录一并删） | `Remove-Item`（**没有** `git rm`） |
| 保留 | `public/anzhiyu/random.js`（§2.3）、`public/img/**`、`bgm.wav`、`favicon.ico`、`pug-probe.svg`、`slice-harness.js` | — |

### 4.3 迁移后 `public/`（实测）

```
bgm.wav 96044   favicon.ico 4286   pug-probe.svg 136   slice-harness.js 26186
anzhiyu/random.js 384
img/404.jpg 141552      img/512.png 4172        img/algolia.svg 4410
img/comment_bg.png 4246 img/default_cover.jpg 14808  img/favicon.ico 4286
img/friend_404.gif 604315 img/loading.gif 738187
img/siteicon/{16,32,apple-icon-180,manifest-icon-192.maskable,manifest-icon-512.maskable}.png
```

### 4.4 主题包新增 `public/`（11 文件 / 206691 B）

```
css/index.css                             297
js/main.js                              64181
js/tw_cn.js                             19416
js/utils.js                             50562
js/anzhiyu/ai_abstract.js               14216
js/anzhiyu/comment_barrage.js            6708
js/anzhiyu/people.js                     7710
js/anzhiyu/random_friends_post.js        9874
js/anzhiyu/right_click_menu.js          16946
js/search/algolia.js                     7256
js/search/local-search.js                9525
```

> `assets/anzhiyu/` 目录**故意不建**：上游主题 `source/` 里没有 `anzhiyu/`，唯一会被引用的是站点生成的 `random.js`（§2.3，内容依赖站点文章列表）。把它放进主题包会把 fixture 的文章路径发给所有迁移站。

### 4.5 `astro.config.mjs` 接线

```js
// 头部
import anzhiyuAssets from '../../integration.mjs（已删除，由 public/ 原生接管）'

export default defineConfig({
  // …（DEPLOY_SITE_ROOT base 之后）
  integrations: [anzhiyuAssets()],
})
```

**关于裸包名**：任务设计写的是 `import anzhiyuAssets from 'astro-theme-anzhiyu/integration'`，实际落地用**相对路径**，原因（可复现）：

- `examples/blog` 的 `package.json` 里**没有** `astro-theme-anzhiyu` 依赖（它历来按源码相对导入主题包：`src/pages/*.astro` 全是 `../../../../src/...`）；
- 根 `node_modules` 里也没有该包（`node_modules/astro-theme-anzhiyu` 不存在），裸包名会直接 `ERR_MODULE_NOT_FOUND`；
- 本波禁止在仓库根 `pnpm install` / 改 `pnpm-lock.yaml`，把依赖加进 `package.json` 后在本波内也无法生效（构建会红）；
- 相对路径同样是 `migrate-hexo` 已支持的写法：`scripts/migrate-hexo.mjs:681` 会把 `(?:../)+packages/` 重写成迁移产物正确的相对前缀（`packagesSpecifier()`），所以迁移站拿到的配置**自动带这条 import**（§7.1 实测解析）。

迁移站自己的 `package.json` **有** `"astro-theme-anzhiyu": "file:../../packages/astro-theme-anzhiyu"`，所以迁移站也可以写裸包名——§6.4 用「安装后只含发布文件的包副本」验证了 `astro-theme-anzhiyu/integration` 裸说明符可解析、`assets/` 可从安装位置解析。两种写法都对，`examples/blog` 选相对路径只是因为它是 monorepo 内源码引用方。

---

## 5. 构建产物验证

命令（抢 `.build.lock` 后执行；`CODEBUDDY_SAFE_DELETE_ENABLED=0` 是构建环境约定）：

```powershell
cd D:\Git-project\astro-theme-anzhiyu\examples\blog
$env:CODEBUDDY_SAFE_DELETE_ENABLED="0"
node ..\..\node_modules\astro\bin\astro.mjs build
```

构建结果（exit 0，99 行日志，关键 4 行）：

```
18:57:20 [anzhiyu-assets] 复制 11 个主题静态资源 → dist
18:57:20 [build] 62 page(s) built in 4.13s
18:57:20 [build] Complete!
```

### 5.1 验收 URL 逐项（`Get-Item` + SHA-256）

```
/js/main.js                     exists=True bytes=  64181 sha256=4EC67D72C398F2C7…
/js/utils.js                    exists=True bytes=  50562 sha256=7213C31E963F51A5…
/js/tw_cn.js                    exists=True bytes=  19416 sha256=99915C60EFFEFD13…
/js/search/local-search.js      exists=True bytes=   9525 sha256=C0C03FE5AF6E40C6…
/js/anzhiyu/right_click_menu.js exists=True bytes=  16946 sha256=CF5AF7E8B02E2918…
/anzhiyu/random.js              exists=True bytes=    384 sha256=015028E71573B870…   ← 站点 public 保留文件
/css/index.css                  exists=True bytes=    297 sha256=54CECD1534632545…   ← 占位
```

### 5.2 `dist/js` 全量 vs 主题包 `assets/js`

`dist/js` 10 个文件，与 `assets/js` **逐个 SHA-256 相同**（`js identical=10 diff/missing=0`），字节数：

```
main.js 64181        tw_cn.js 19416        utils.js 50562
anzhiyu/ai_abstract.js 14216   anzhiyu/comment_barrage.js 6708
anzhiyu/people.js 7710         anzhiyu/random_friends_post.js 9874
anzhiyu/right_click_menu.js 16946
search/algolia.js 7256         search/local-search.js 9525
```

### 5.3 48 页基线本地资源可达性（独立于 diff 的门禁式检查）

对 `.baseline-html` 48 页里出现的每个本地 `/js`、`/css` 引用，检查 `dist` 是否存在：

```
/anzhiyu/random.js             baselineRefPages=48 distExists=True bytes=384
/css/index.css                 baselineRefPages=48 distExists=True bytes=297
/js/anzhiyu/ai_abstract.js     baselineRefPages=1  distExists=True bytes=14216
/js/main.js                    baselineRefPages=48 distExists=True bytes=64181
/js/tw_cn.js                   baselineRefPages=48 distExists=True bytes=19416
/js/utils.js                   baselineRefPages=48 distExists=True bytes=50562
localRefs=6 missing=0
```

### 5.4 构建产物的 HTML 引用数（相对于迁移前不变）

`dist` 62 个 HTML（48 基线页 + fixture 额外页）里：

```
/js/main.js 60 页   /js/utils.js 60 页   /js/tw_cn.js 60 页
/anzhiyu/random.js 60 页   /css/index.css 60 页
/js/search/local-search.js 0 页（运行时 getScript 拉取，不静态引用）
/js/anzhiyu/right_click_menu.js 0 页（fixture 未启用右键菜单；文件仍需存在）
```

→ URL 引用与 HTML 结构都没变（否则 §6 diff 不会 0）。

---

## 6. 验收结果

### 6.1 integration 单元冒烟（不启动 Astro，直接调 hooks）

脚本 `.tmp-w1d-integration-smoke.mjs`（一次性，跑完已删）：mock `{server:{middlewares:{use}}}()` + 真实 `Writable` 承载 `pipe` 输出，预置一个「站点侧」`js/main.js` 验证不覆盖策略。

```
[smoke] integration name = anzhiyu-assets
[smoke] hooks = astro:config:done,astro:server:setup,astro:build:done
[smoke][build] 产物文件 11 个（主题复制 10 / 预置保留 1），期望复制 11-1
[smoke][build] 关键文件存在 = true；站点侧 main.js 未被覆盖 = true
[smoke][build] info: [anzhiyu-assets] 复制 10 个主题静态资源 → .tmp-w1d-out（跳过 1 个已存在文件）
[smoke][build] warn: [anzhiyu-assets] 1 个主题资源在产物里已存在，保留站点侧文件：js/main.js
[smoke][dev] middleware mounted = true
[smoke][dev] GET /js/main.js -> status=200 type=text/javascript; charset=utf-8 len=64181 sha_match=true
[smoke][dev] GET /css/index.css?dpr=2 -> status=200 type=text/css; charset=utf-8 len=297 sha_match=true
[smoke][dev] GET /blog/js/utils.js (base=/blog/) -> status=200 len=50562
[smoke][dev] GET /js/not-exist.js -> next=true（交给 Astro 404）
[smoke][dev] GET /js/../../packages/astro-theme-anzhiyu/package.json -> next=true（穿越被拦）
[smoke][dev] POST /js/main.js -> next=true（非 GET/HEAD 放行）
[smoke][dev] HEAD /js/main.js -> status=200 len=0
[smoke] RESULT = PASS
SMOKE_EXIT=0
```

### 6.2 真实 `astro dev` 冒烟（验证 `astro:server:setup` 真的挂上）

`node ..\..\node_modules\astro\bin\astro.mjs dev --port 4399`（后台起、curl 后 `taskkill /T /F`）：

```
curl http://localhost:4399/js/main.js  -> 200 text/javascript; charset=utf-8 64181
curl http://localhost:4399/js/utils.js -> 200 text/javascript; charset=utf-8 50562
curl http://localhost:4399/css/index.css -> 200 text/css; charset=utf-8 297
curl http://localhost:4399/js/nope.js   -> 404 text/html 760219        （Astro 自己的 404 页面）
curl http://localhost:4399/anzhiyu/random.js -> 200 text/javascript 384 （站点 public，由 Astro 提供）
```

注：本机 Astro dev 只监听 `localhost`（IPv6 `::1`），`127.0.0.1:4399` 连不上（curl `000`）——用 `localhost` 测即可，不是 integration 的问题。

### 6.3 基线 HTML diff（48 页）

```powershell
cd D:\Git-project\astro-theme-anzhiyu
$env:BASELINE_HTML_DIR=".baseline-html"
node scripts/diff-html.mjs --all --json
```

迁移**前**（改动前同一命令）与迁移**后**：

```json
{"pages":48,"pass":48,"fail":0,"diffCount":0,"missingNodes":0,"unexpectedNodes":0,"categories":{}}
```

`ok=true`，48 页全 PASS，`diffCount` 总和 0，`missingNodes+unexpectedNodes=0`。**HTML 结构/URL 零回归**。

### 6.4 安装场景（`file:` / npm 包到别处）解析冒烟

把主题包按 `files` 白名单复制成 `<临时站>/node_modules/astro-theme-anzhiyu`（172 个文件，等价发布内容），在临时站根执行：

```
[install] bare specifier resolved: astro-theme-anzhiyu/integration
[install] default export type = function
[install] integration name = anzhiyu-assets hooks = astro:config:done,astro:server:setup,astro:build:done
[install][build] copied 11 files, js/main.js=64181B
[install][build] files: css/index.css, js/anzhiyu/*(5), js/main.js, js/search/*(2), js/tw_cn.js, js/utils.js
[install][build] log: INFO 复制 11 个主题静态资源 → .out
[install][dev] GET /js/tw_cn.js -> next=false status=200 type=text/javascript; charset=utf-8 len=19416 sha_match=true
[install] RESULT = PASS
```

→ `exports["./integration"]` + `import.meta.url` 自解析在「安装到站点 node_modules」的布局下成立；迁移站 wiring 不会因为包不在仓库 `packages/` 相对位置而失效。

### 6.5 包发布清单（`npm pack --dry-run --json`）

```
id=astro-theme-anzhiyu@0.0.0 files=172 packed=281802B unpacked=954547B
assets=11 src=159 integration=1
非 src/assets 条目：integration.mjs、package.json
```

（沙箱下 npm 默认 cache 在用户目录不可写，用 `npm_config_cache=<仓库内临时目录>` 跑通；临时目录已清理。）

---

## 7. migrate-hexo 接线约定（留给 W2 任务）

### 7.1 主题资源：**重跑 migrate-hexo 即自动生效，但必须重新 `pnpm install`**

`scripts/migrate-hexo.mjs:679-698` 的 [7/8] 阶段是「复制 `astro.config.mjs` → 重写 `packages/` 相对前缀 → 写产物」。本次给 `astro.config.mjs` 加的 import（相对 `packages/`）+ `integrations: [anzhiyuAssets()]` **会被这段逻辑原样带进迁移产物**：

```js
// .migration-out/<site>/astro.config.mjs（migrate-hexo 自动生成的形态）
import anzhiyuAssets from '../../integration.mjs（已删除，由 public/ 原生接管）'
export default defineConfig({ /* … */ integrations: [anzhiyuAssets()] })
```

前缀重写由 `packagesSpecifier()`（`migrate-hexo.mjs:375-378`）按产物文件深度计算，CROSS_DRIVE（源站与仓库不同盘）时用 `file:///` URL —— 两种都可用。

**注意 1（必须做）**：`pnpm` 对 `"astro-theme-anzhiyu": "file:../../packages/astro-theme-anzhiyu"` 是**硬链接复制**安装，包内**新增**文件（`assets/`、`integration.mjs`）不会自动出现在旧安装里（实测旧安装副本只有 `src/` + `package.json`）。所以主题包更新后，迁移产物必须重新安装依赖：

```powershell
cd .migration-out/<site>
pnpm install --force     # 或：Remove-Item node_modules\astro-theme-anzhiyu -Recurse -Force; pnpm install
```

**注意 2（若 migrate-hexo 以后改成模板生成配置）**：站点 `astro.config.mjs` 需要这三行：

```js
import anzhiyuAssets from 'astro-theme-anzhiyu/integration'   // 迁移产物有 file: 依赖，可写裸包名；写相对 packages/ 路径同样可用
export default defineConfig({
  integrations: [anzhiyuAssets()],                             // 其余配置不变
})
```

> 关于 `getConsumers`：全仓库（`scripts/`、`docs/`、`tests/`）grep `getConsumers` **0 命中**，本项目没有这个 API。这里按「资源消费方登记」的等价物理解：迁移/验收侧如果需要在 [6/8] 阶段登记「哪个 URL 由谁提供」，建议在 `migrate-hexo.mjs` 的 [6/8] 收尾打印一张清单（本报告 §2.6 的归属总表即数据源），供 `verify-assets` 门禁比对；不需要改本次 integration。

### 7.2 站点自定义 js/css：现有逻辑已覆盖，无需改动

`migrate-hexo.mjs:599-613`（[6/8]）：

```js
for (const rel of walkFiles(sourceDir)) {
  if (rel.startsWith('_posts/') || rel.startsWith('_data/') || rel.startsWith('.obsidian/')) continue
  if (rel.endsWith('.md')) continue
  if (rel === 'index.md' || rel.endsWith('/index.md')) continue
  copyOut(path.join(sourceDir, rel), `public/${rel}`)
}
```

`source/js/*.js`、`source/css/*.css` 都在其中 → `.migration-out/xcAnzhiyu/public/js/{card-welcome,comments,countdown,echarts.min,imgloaded,nomyurl,twikoo.all.min}.js` 与 `public/css/{custom,home,imgloaded,todolist}.css` **已经存在**（实测 §1.3 同一棵目录）。这部分不需要 W2 改代码。

### 7.3 `/anzhiyu/random.js`：migrate-hexo 在 [6/8] 静态资源阶段**生成**（本次不做，登记给 W2）

上游行为（`_research/anzhiyu-upstream/scripts/helpers/random.js`）：

```js
hexo.extend.generator.register('random', function (locals) {
  const posts = locals.posts.data.filter((p) => p.random !== false).map((p) => p.path)
  let result = `var posts=${JSON.stringify(posts)};function toRandomPost(){
    ${pjaxEn ? "pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"
             : "window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];"}
  };`
  // footer.list.randomFriends > 0 时再追加 friend_link_list / friendChainRandomTransmission 等
  return { path: 'anzhiyu/random.js', data: result }
})
```

接线约定（W2 在 `migrate-hexo.mjs` [6/8] 的静态资源循环之后追加，写 `public/anzhiyu/random.js`）：

1. `posts` = 迁移后文章路由列表（与迁移产物的 permalink 规则一致；上游是 `locals.posts` 的 `post.path`，Hexo 默认按日期倒序，等价于把迁移后的文章 URL 去掉前导 `/`），`random !== false` 的文章才收录；
2. `pjaxEn` 取 `anzhiyu.config.yml` 的 `pjax.enable`（默认 true → `pjax.loadUrl(...)`）；
3. `footer.list.enable && footer.list.randomFriends > 0` 时追加友链随机块（友链数据来自迁移后的 `data/link.yml`；1.7.1 的字段名/结构见 `scripts/helpers/random.js` 后半段，**逐字**复制其模板，避免行为差异）；
4. 产物固定 384 B 量级（fixture 10 篇文章时 384 B），每次迁移站构建都可以重生成；它是站点侧文件，**不要**放进主题包 `assets/`。
5. 生成后 `/anzhiyu/random.js` 由 Astro 从站点 `public/` 复制进 `dist`，与 integration 复制主题资源互不冲突（路径不重叠；即使站点把同名文件放进 `public/`，integration 也只 warn 不覆盖）。

### 7.4 迁移站验收建议（W2 落地后跑）

```powershell
cd .migration-out/<site>
pnpm install --force
$env:CODEBUDDY_SAFE_DELETE_ENABLED="0"; node ..\..\node_modules\astro\bin\astro.mjs build
# 6 个 URL 必须全部 200：
Get-Item dist/js/main.js,dist/js/utils.js,dist/js/tw_cn.js,dist/js/anzhiyu/right_click_menu.js,dist/anzhiyu/random.js,dist/css/index.css
# 94 页里以上本地引用必须 0 缺失（可复用本报告 §1.3 的扫描脚本思路）
```

---

## 8. npm 包发布视角（files / exports）

`packages/astro-theme-anzhiyu/package.json` 改动（`git diff` 原样）：

```diff
   "exports": {
     ".": "./src/index.ts",
+    "./integration": "./integration.mjs",
     "./schema": "./src/config/schema.ts",
     …
   "files": [
-    "src"
+    "src",
+    "assets",
+    "integration.mjs"
   ],
```

- `files` 白名单决定发布内容：`assets/`（11 个运行时资源）+ `integration.mjs` + `src/`；`scripts/`（check-*.mjs）等开发脚本不进包 —— `npm pack --dry-run` 清单 172 文件与之吻合（§6.5）。
- `exports` 决定 import 路径：`astro-theme-anzhiyu/integration` → `integration.mjs`；integration 内部用 `import.meta.url` 找 `assets/`，因此**发布后 assets 必须在包内同层目录**（`files` 已保证）。
- `integration` 是纯 ESM `.mjs`、零运行时依赖（只用 Node 内置），安装方不需要额外构建步骤。
- **发布前还需 Lead 决策的两点**（本任务未改）：`"private": true` 与 `"version": "0.0.0"` 会阻止 `npm publish`（`npm pack` 可以，`publish` 必须先去 private 并给版本号）；`package.json` 里没有 `main`/`types` 字段（现有 `exports` 只提供源码入口，主题本身就是源码分发模式，若要走 npm 生态需要另外决定 TS 源码直发还是预编译）。

---

## 9. 遗留与风险

| # | 项 | 说明 / 后续 |
| --- | --- | --- |
| 1 | `/css/index.css` 仍是占位（297 B） | Phase 7 按 `docs/reference/resource-path-policy.md` §5.1 方案 1 把 Stylus 编译产物直接写 `public/css/index.css`，届时删占位、`verify-css.mjs` 的资源定位改到 `dist/css/index.css`。本次**不动** CSS 构建管线（改它会影响 48 页基线里的 CSS 引用与 verify-css） |
| 2 | 迁移产物旧安装不会自动更新 | pnpm `file:` 是硬链接安装，包内新增文件要 `pnpm install --force` 才出现（§7.1 注意 1） |
| 3 | `/anzhiyu/random.js` 仍缺 | 本次保留 site 生成物的归属结论；实际生成在 W2 的 migrate-hexo [6/8]（§7.3） |
| 4 | `/img/**` 未纳入主题包 | 上游 `source/img/` 是主题资源，但本次范围只做 js/css；`public/img/**` 保留原地。迁移站的 `/img/*` 目前依赖站点 `source/img`（源站有）+ 主题兜底图（`404.jpg` 等）仍缺，属下一个资源任务 |
| 5 | `examples/blog` 裸包名写法 | 需要 Lead 决定是否把 `astro-theme-anzhiyu` 加进 `package.json` 依赖并重装（之后可把相对 import 换成 `'astro-theme-anzhiyu/integration'`）。当前用相对路径，功能完全一致，且 migrate-hexo 自动重写 |
| 6 | `npm pack` 在沙箱内需要 cache 覆盖 | 默认 npm cache 在用户目录被沙箱拒绝（EPERM），用 `npm_config_cache=<仓库内目录>` 可跑通；CI 无此限制 |
| 7 | 并发构建 | 本次所有 `examples/blog` 构建都在 `.build.lock` 内完成（改动后跑了 **2 次**：首次验证 → 清洗日志文本后重建最终产物；改动前的 diff 用已有 `dist` 直接跑，未重新构建），锁已释放 |

---

## 10. 改动清单（本任务写作用域内）

| 文件 | 变化 |
| --- | --- |
| `public/**`（11 文件 / 206691 B） | 新增 |
| `integration.mjs（已删除，由 public/ 原生接管）`（226 行 / 8608 B） | 新增 |
| `packages/astro-theme-anzhiyu/package.json` | `exports` + `files` 各加 1 项 |
| `astro.config.mjs` | +import、+`integrations: [anzhiyuAssets()]`、注释说明 |
| `public/js/**`（10 文件） | 删除（搬走） |
| `public/css/index.css` + 空 `css/` 目录 | 删除（占位搬进主题包） |
| `docs/notes/phases/P7-6-theme-assets.md` | 本报告 |

未做：任何 git 写操作（`git status`/`diff` 只读）；未改 `docs/plan/PLAN.md`；未改 `public/img/**`、`public/anzhiyu/random.js`；未动 `scripts/migrate-hexo.mjs`（接线约定留给 W2）；**本任务未碰**根 `package.json` / `pnpm-lock.yaml` / `.github/**` / `tests/**`（工作区里这些文件的改动属于并行 W1 其它任务，见 `git status`）。
