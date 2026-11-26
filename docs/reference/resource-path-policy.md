# 资源路径策略（HTML diff 豁免边界）

- 执行人：p-markdown（组员）
- 执行时间：2026-11-23（Asia/Shanghai）
- 任务：把「上游 `/css/index.css` ↔ Astro `/_astro/BaseLayout.<HASH>.css` 这类差异」的
  豁免边界文档化，回答「哪些允许、哪些不允许、Phase 7 能不能字节级对齐」
- 相关：`scripts/diff-html.mjs`（P2-13）、`docs/notes/phases/P2-13-diff-html.md` §3/§11、
  `docs/plan/PLAN.md` §3.2、`scripts/verify-css.mjs`、`docs/notes/phases/P1-5-full-style-build.md`

## 0. 一页结论

| 问题 | 结论 |
| --- | --- |
| 上游 `/css/index.css` ↔ 我们 `/_astro/upstream.DeEHpLXK.css` 算不算差异 | **算**。`diff-html.mjs` 的 N4 只把**哈希段**换成 `<HASH>`，不归一化目录与基名，所以当前会报 1 条 `attr-changed`。本文件把它登记为「已豁免」，但**豁免的是这类差异，不是这个属性** |
| 允许豁免的资源差异 | 只有两类：① 打包目录 + 内容哈希（`/_astro/*.<HASH>.*`、`?v=<HASH>`）；② 内容哈希导致的文件名变化，且**语义路径仍可推导**（见 §2） |
| 不允许豁免的 | 文件名语义变化、`media`/`onload`/`rel` 等加载属性丢失、资源顺序变化、本地资源 404、CSS/JS 内容变化 |
| Phase 7 能否资源路径字节级一致 | **能**，但要把 CSS/JS 的产出移出 Vite 打包（实测 `assetFileNames` 可去哈希，见 §5.2） |
| 整份 HTML 能否字节级一致 | **不能，也不该追求**。PLAN §3.2 的判据是「DOM 归一化后结构一致」，字节级等于放弃 Astro 组件模型（见 §5.3） |
| 现在该做什么 | Phase 2–6 按「已登记豁免」放行，但**必须同时加一条资源可达性门禁**（§4.2），不让「路径不同」成为「CSS 根本没加载」的挡箭牌 |

---

## 1. 当前实测差异清单

对比对象：`.baseline-work/public`（上游 `hexo g` 产物）↔ `examples/blog/dist`（当前构建）。

### 1.1 本地资源

| 上游（baseline） | 我们（dist） | 差异类别 | 处置 |
| --- | --- | --- | --- |
| `<link rel="stylesheet" href="/css/index.css">`（683218 B） | `<link rel="stylesheet" href="/_astro/upstream.DeEHpLXK.css">`（682990 B） | 目录 + 基名 + 哈希 | **豁免（打包路径）**；内容由 `verify-css.mjs` 单独盯（−0.03%，PASS） |
| `/js/main.js`、`/js/utils.js`、`/js/tw_cn.js` | 尚未产出（Phase 4 P4-2） | 缺失 | **不豁免**：Phase 4 必须按原文件名输出到 `public/js/`，否则 `GLOBAL_CONFIG` 里写死的路径、自定义脚本、CDN fallback 全部失配 |
| `/img/default_cover.jpg` 等 4 个图片引用 | 尚未产出（public 只有切片探针文件） | 缺失 | **不豁免**：静态资源应逐字节拷贝到 `public/img/`，路径天然一致 |

### 1.2 第三方 CDN 资源（顺序 + 懒加载属性）

上游 `layout/includes/head.pug:63,66,69,72,82` 对 5 个 CDN 样式用了异步加载写法：

```pug
link(rel='stylesheet', href=url_for(theme.asset.fancybox_css) media="print" onload="this.media='all'")
```

产物：

```html
<link rel="stylesheet" href="https://cdn.cbd.int/@fancyapps/ui@6.1.6/dist/fancybox/fancybox.css" media="print" onload="this.media='all'">
```

P2-13 §7.5 实测的 `link[6]` 就是这一条：Astro 侧把 CSS 打包成 `_astro/BaseLayout.<HASH>.css` 后，
`media` / `onload` 两个属性一起丢了（3 条差异 = 1 条路径 + 2 条属性）。
**属性丢失不属于资源路径豁免**，见 §3。

> 说明：P2-13 写这份数据时 dist 还是 P1.5 切片；当前 dist 尚未接入 Head 组件（P2-3），
> 所以现在没有这几个 `<link>`。Phase 2 接入 Head 后这条会立刻出现在 diff 里。

---

## 2. 允许的差异（登记豁免）

### 2.1 打包路径 + 内容哈希

```text
上游：/css/index.css  /js/main.js
我们：/_astro/upstream.DeEHpLXK.css  /_astro/client.C5tmiID1.js
      /_astro/ClientRouter.astro_astro_type_script_index_0_lang.CARLn6B5.js
      ?v=abcdef123456
```

允许理由（必须同时成立）：

1. **内容是同一份**：CSS 由同一批 `.styl` 编译（`verify-css.mjs` 已独立校验字节数与变量值），
   不是「换了个东西」；
2. **哈希只是内容指纹**：同一份输入每次构建都会变，属于构建噪声，不是站点结构；
3. **路径可推导**：从 `_astro/<源文件名>.<HASH>.css` 能看出它对应哪个源文件；
   一旦文件名语义变了（`index` → `bundle`）就不满足这条，见 §3.1。

唯一的豁免动作是：`diff-html.mjs` 在**已登记豁免表**里把「本地资源引用的 href/src 值」
归到 `resource-path` 类别（计数上报，不静默丢）。**不要**在 N4 里直接把 `/_astro/*` 整段
删掉——那样会连同「文件名语义变化」一起吞掉，违反 §3.1。

### 2.2 框架注入元素（已在工具里实现，非本文件新增）

| 项 | 现状 |
| --- | --- |
| `data-astro-*` 属性（scoped style / transition 标记） | N7 整类删除并计数 |
| `<meta name="astro-*">`、`<meta name="generator" content="Astro …">`、`/_astro/ClientRouter*.js` | N12 整元素删除并计数 |
| 本文档 canonical origin 换成 `<SITE>`（N11） | 域名配置差异，不是资源差异 |

这些和「资源路径」不是一类，列在这里只是说明**已有豁免与本次策略的边界**：
框架元素豁免是「上游没有对应物」，资源路径豁免是「有对应物但地址不同」，两者不能混用。

---

## 3. 不允许的差异（必须真修）

### 3.1 文件名语义变化

`/js/main.js` → `/_astro/chunk-A1B2C3.js` 这种，即使内容一样也**不豁免**。原因：

- 上游 `layout/includes/head.pug` / `additional-js.pug` / `GLOBAL_CONFIG` 会**直接引用原文件名**，
  用户 `_config.yml` 的 `inject`、自定义 `theme.asset`、PWA 缓存名单（`sw-rules.js`）也可能写死；
- 文件名是上游对外契约的一部分（`P4-2` 的计划就是「保持原文件名」）。

判据：`_astro/<name>.<HASH>.css` 里的 `<name>` 必须是上游同名资源的可推导形式；
推导不出来（或对不上源文件）就报 `attr-changed`，不做豁免。

### 3.2 加载属性丢失

`media="print" onload="this.media='all'"`（异步加载）丢了 = 渲染时序变了：
上游首屏不阻塞，我们变成阻塞渲染。这类差异**不属于资源路径**，必须逐属性对齐。
同一个 `<link>` 上 `rel` / `as` / `crossorigin` / `integrity` 同理。

### 3.3 资源顺序变化

`<head>` 里 CDN CSS 的顺序决定层叠结果（`head.pug:58-82` 顺序是有意的）。
顺序变了就报差异，不豁免。

### 3.4 本地资源 404 / 空文件

任何 `href="/..."` / `src="/..."` 在本地产物里不存在或大小为 0，一律 FAIL。

### 3.5 CSS / JS 内容变化

资源路径豁免**不覆盖内容**：

- CSS：`verify-css.mjs` 的字节数 ±5% + `compare-css-vars.mjs` 的变量值 + 选择器集合独立门禁；
- JS：Phase 4 行为基线（PLAN §3.3）+ 交互冒烟。

---

## 4. 判据与门禁

### 4.1 判据（建议写进 PLAN §3.2 / §3.5）

1. `diff-html.mjs` 单页 PASS = `diffCount === 0`；Phase 2–6 期间允许 FAIL，但**每一条都必须落在
   已登记豁免表中**（当前只有两类：`resource-path`、`astro-machinery`）。
2. 豁免必须**带计数**：`--json` 输出里给出 `exempt: { resourcePath: n, astroMachinery: m }`；
   `n` 的期望值 = 该页本地资源引用数（例：首页 baseline 有 1 CSS + 3 JS + 4 IMG，
   Phase 2 会先从 1 涨到 5 再涨到 8）。**计数对不上就是回归**。
3. 缺口节点数（`missingNodes/unexpectedNodes`）仍按 P2-13 §11 单独趋势考核。

### 4.2 必须新增的门禁：资源可达性（`verify-assets.mjs`，Phase 4 前后）

diff 豁免的前提是「资源真的存在且被引用」，所以要有独立检查：

1. 遍历 dist 所有 HTML，收集本地资源引用（`href`/`src`/`srcset` 里以 `/` 开头且非 `//` 的值；
   非 URL 属性里 `style="background:url(...)"` 也收）；
2. 每个引用映射到 `dist` 里的文件：存在、大小 > 0、扩展名与 `<link as>`/`<script>` 类型匹配；
3. 输出「页面 × 资源 → 字节数」清单，缺一个就 exit 1；
4. 不做内容哈希比对（那是 N4 / verify-css 的事）。

> 为什么不能靠 diff：`/css/index.css` ↔ `/_astro/upstream.<HASH>.css` 被豁免后，
> 如果哪天 CSS 彻底没被引用，diff 只会少一条豁免项，看起来「更干净」——必须有独立检查兜住。

### 4.3 豁免登记表格式

```jsonc
{
  "kind": "resource-path",
  "page": "/",
  "attr": "href",
  "baseline": "/css/index.css",
  "dist": "/_astro/upstream.<HASH>.css",
  "reason": "Astro 打包路径；内容由 verify-css 校验",
  "expires": "Phase 7（资源路径对齐后删除本条）"
}
```

`expires` 必须写：豁免是**临时债务**，Phase 7 路径对齐后这条表项要删掉，
届时 diff 里出现同类差异应直接 FAIL。

---

## 5. Phase 7 能不能与上游字节级一致

分两层回答，因为「字节级」在资源路径和整页 HTML 上是两个完全不同的事。

### 5.1 资源路径（可以，实测过机制）

目标：`/css/index.css`、`/js/main.js`、`/img/*.jpg` 与上游逐字符一致。

可行方案（按推荐顺序）：

1. **CSS 移出 Vite 打包**：Stylus 编译本来就是 `vite-plugin-stylus-hexo-config` 的产物
   `_astro/upstream.<HASH>.css`（682990 B），把它改成构建期直接写 `public/css/index.css`，
   Astro 只会原样拷贝 `public/`，路径与内容都稳定。
   代价：`verify-css.mjs` 的资源定位要从 `_astro/upstream.*.css` 改成 `dist/css/index.css`（一行）。
2. **JS 按原文件名进 `public/js/`**：Phase 4 `P4-2` 的计划本来就是「保持原文件名」，
   只要不进 Vite 打包就天然一致。
3. **图片/字体/favicon 原样拷贝 `public/`**。

### 5.2 实测：Vite 打包能不能去掉哈希（能）

临时配置实验（验完已删，可复现）：

```js
vite: {
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? [assetInfo.name ?? '']
          return names.some((name) => name.endsWith('.css'))
            ? 'css/[name].css'        // 对照组：固定目录 + 无哈希
            : 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
}
```

实测结果（`astro build --config <临时配置> --outDir .tmp-dist-assets`）：

| 配置 | 产物 CSS | 页面里的引用 |
| --- | --- | --- |
| 默认 | `_astro/upstream.DeEHpLXK.css` | `<link rel="stylesheet" href="/_astro/upstream.DeEHpLXK.css">` |
| `css/[name].css` | `css/upstream.css`（682990 B，内容不变） | `<link rel="stylesheet" href="/css/upstream.css">` |
| `css/index.css`（字面量） | `css/index2.css`（Vite 为避免重名自己加了 `2`） | `<link rel="stylesheet" href="/css/index2.css">` |

结论：

- **去哈希、固定目录是配置级可达的**，`<link href>` 会跟着改写；
- 但「字面量固定名」会被 Vite 的重名规避规则改成 `index2.css`，
  所以不要赌文件名，**要么让资源 name 本身是 `index`，要么走 §5.1 方案 1（移出打包）**；
- 这条实验也说明：资源路径不是「Astro 做不到」，而是「现在没做」。

### 5.3 整页 HTML 字节级（不建议，判据也不该这么定）

即使资源路径全对齐，整页 HTML 仍不可能与上游逐字节相同，天然差异至少包括：

| 差异 | 例子 | 能不能消掉 |
| --- | --- | --- |
| 属性顺序 | Astro 输出 `class` 在前还是 `href` 在前不保证 | 不能（除非手写字符串模板） |
| 空白 / 换行 | Astro 产物缩进与上游压缩器不同 | 不能（N2 折叠） |
| 注释 | 我们在 Astro 组件里写说明性注释 | 能删，但没必要 |
| 框架注入 | `<meta name="astro-*">`、`data-astro-*`、`/_astro/ClientRouter*.js` | 上游没有对应物，永远不可能一致 |
| 打包后的内联脚本 | Astro 把 `<script>` 编译成 module import | 除非全部 `is:inline` |

PLAN §3.2 的验收写的是「归一化后结构一致」，这是对的判据；把目标改成「HTML 字节级」
等于放弃组件复用与构建优化，收益极低。

**所以 Phase 7 的目标建议写成两条**：

1. **资源路径与加载属性字节级一致**（可验证：`/css/index.css`、`/js/main.js` 等逐字符相等）；
2. **DOM 归一化后结构一致**（用现有 `diff-html.mjs` 判据 + §4 门禁）。

---

## 6. 与现有工具的接口

| 工具 | 现在的行为 | 本策略的改动 |
| --- | --- | --- |
| `scripts/diff-html.mjs` | N4 只归一化哈希段；路径目录/基名差异照报 `attr-changed` | 增加 `resource-path` 豁免类别 + 计数；**不**改 N4 正则 |
| `scripts/verify-css.mjs` | 自动找 `dist/_astro/upstream.*.css` | Phase 7 若 CSS 移到 `public/css/`，改成找 `dist/css/index.css` |
| `scripts/compare-css-vars.mjs` | 读 baseline CSS 变量 | 不涉及路径 |
| （新增）`scripts/verify-assets.mjs` | 不存在 | 见 §4.2 |

---

## 7. 未决点（需要组长拍板）

1. **Phase 2–6 期间要不要接受 `resource-path` 豁免**：本文件建议接受（否则每页永远红一条，
   掩盖真正的结构差异），代价是多一条 `verify-assets.mjs` 门禁。
2. **Phase 7 用哪条方案对齐 CSS 路径**：
   - A（推荐）：Stylus 编译移出 Vite → `public/css/index.css`，与上游路径/内容都稳；
   - B：`assetFileNames` 去哈希 + 重命名，实现小但依赖 Vite 内部命名规则（实测有 `index2.css` 的坑）。
3. **`<link media/onload>` 的 5 条 CDN 样式**：Phase 2 P2-3 Head 组件必须原样输出这些属性
   （属于 §3.2，不豁免）；如果 Astro 的 `<link>` 语法不支持 `onload` 字符串，就用
   `set:html` 输出原始标签——这是上游行为，不是 hack。
