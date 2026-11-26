# P2-13 HTML 结构 diff 工具（PLAN §3.2 第一层）

- 执行人：p213-diff（组员）
- 执行时间：2026-11-23（Asia/Shanghai）
- 任务：写 `scripts/diff-html.mjs`，把「上游 hexo 产物 vs 我们的 Astro 产物」的结构差异变成可执行的门禁
- 写范围：`scripts/diff-html.mjs`（新增 1388 行）、根 `package.json`（+1 条 script）、本文件
- 上游参考产物：`.baseline-work/public/`（48 页 HTML，2.1 MB；目录 gitignore，本机存在）
- 我们的产物：`examples/blog/dist/`（当前是 P1.5 垂直切片，只有 `index.html` + `page2/index.html`）

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| 归一化后结构 diff | 已实现，零第三方依赖（仓库没有 parse5/cheerio，不想为一个 diff 脚本加依赖） |
| 归一化清单 | 任务要求的 7 项全部覆盖（属性顺序 / 空白 / 注释 / 资源哈希 / 自闭合 / 布尔属性 / `data-astro-*`），另补 7 项（实体、class 集合、style、站内 origin、Astro 机制元素、`<pre>` 首行换行、CRLF/大小写） |
| 故意不归一化 | 标签层级与顺序、节点增删、id、class 集合、文本、script/style 内容、资源**路径**本身、第三方 host、`<pre>` 内空白 |
| 自测 | 同文件自比 0 差异；48 页全量自比 48 PASS；4 条负向用例全部报出；归一化契约（只改写法）真实页 244 注释 + 244 `data-astro-*` + 属性顺序倒置 → 0 差异 |
| 当前真实差异 | **首页 66 条 / 缺口 1058 缺 30 多**；文章页与归档页 dist 缺页（各 1 条 `file-missing`）；`--all` 48 页共 113 条 |
| 退出码 | 全 PASS → 0；有 FAIL → 1；**baseline 不存在 → 打印提示 exit 0**（CI 无参考产物不红） |
| 可用于 Phase 2 验收 | ✅ 可以，但判据不是「0 条差异」四个字，见 §11 |

一句话：**工具已具备逐页验收能力；当前 66/1058 是 Phase 2 的起点数据，不代表工具问题。**

---

## 1. 交付物与用法

### 1.1 文件

| 文件 | 改动 |
| --- | --- |
| `scripts/diff-html.mjs` | 新增。HTML 词法 + 树构建、归一化、四级 LCS 对齐、diff、CLI、JSON 输出 |
| `package.json` | 只加一条：`"diff:html": "node scripts/diff-html.mjs"` |
| `docs/notes/phases/P2-13-diff-html.md` | 本文件 |

没有新增依赖，`pnpm-lock.yaml` 未动。

### 1.2 用法

```bash
# 单页：<baselineHtmlPath> <distHtmlPath>
node scripts/diff-html.mjs .baseline-work/public/index.html examples/blog/dist/index.html

# 也接受目录（自动接 index.html）
node scripts/diff-html.mjs .baseline-work/public examples/blog/dist

# 全量：按 docs/reference/baseline.json 的 pages 列表逐页比对
node scripts/diff-html.mjs --all
pnpm diff:html --all

# CI 机器可读
node scripts/diff-html.mjs --all --json > html-diff.json

# 常用开关
node scripts/diff-html.mjs --all --filter /archives/      # 只比路径含该子串的页
node scripts/diff-html.mjs --all --limit 100 --verbose    # 每页最多打 100 条 + 归一化诊断
node scripts/diff-html.mjs <a> <b> --max-diffs 0          # 不限条数，拿精确计数
node scripts/diff-html.mjs <a> <b> --dump-normalized /tmp/d.html   # 导出归一化后的两侧树
```

环境变量（与 `verify-css.mjs` 保持一致的命名习惯）：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BASELINE_HTML_DIR` | `.baseline-work/public` | `--all` 的 baseline 根目录 |
| `DIST_DIR` | `examples/blog/dist` | `--all` 的 dist 根目录 |
| `BASELINE_PATH` | `docs/reference/baseline.json` | 页面清单来源 |

### 1.3 退出码

| 情况 | 退出码 | 说明 |
| --- | --- | --- |
| 全部 PASS | 0 | |
| 任意页 FAIL | 1 | 缺 dist 文件也算 FAIL |
| baseline 目录/文件不存在 | **0** | 打印提示 + （`--json` 时）`{"skipped":true,"reason":"baseline-missing"}` |
| 参数错误 | 2 | |

---

## 2. 归一化清单

原则：**只吃掉「写法不同、渲染结果相同」的差异**；凡影响 DOM 树或渲染的，一律真比。

「实现位置」列是 `scripts/diff-html.mjs` 里的函数名，方便复核。

### 2.1 任务要求的 7 项

| # | 归一化什么 | 为什么 | 怎么实现 |
| --- | --- | --- | --- |
| N1 | **属性顺序** | Hexo/Astro/压缩器输出属性顺序不保证一致，顺序对 CSS/DOM 无语义 | 属性数组按名字排序后再比对（`normalizeTree`） |
| N2 | **空白折叠** | 上游压缩成一行，Astro 侧 `data-astro-rerun` 等开关会带出换行/缩进；普通文本里的连续空白浏览器本来就折叠 | 文本节点 `text.replace(/\s+/g,' ').trim()`，折叠后为空的文本节点直接丢弃；相邻文本先合并（`normalizeNode`） |
| N3 | **HTML 注释** | 注释不进 DOM、不影响渲染，且我们刻意在 Astro 里写注释解释假设 | 词法阶段整段丢弃，只计数（`parseHtml` + diagnostics `commentsDropped`） |
| N4 | **资源哈希文件名** | Astro 内容哈希每次构建都变，这是 PLAN 允许的差异 | 正则把 `名字.HASH.ext` / `名字-HASH.ext` / `?v=HASH` 里的哈希段换成 `<HASH>`（`normalizeUrl`） |
| N5 | **自闭合写法** | `<meta/>` / `<meta>` / `<br>` 三种写法渲染完全一致 | 词法层把空元素（void）统一按「无子节点元素」建树；非空元素上的 `/>` 当已闭合（`VOID_ELEMENTS` + `parseStartTag`） |
| N6 | **布尔属性** | `disabled` ≡ `disabled=""` ≡ `disabled="disabled"`（HTML 规范） | 已知布尔属性集合，值为空或值等于属性名时统一成 `""`（`BOOLEAN_ATTRS`） |
| N7 | **`data-astro-*` 属性** | `data-astro-cid-*`（scoped style）、`data-astro-transition-persist/scope`（View Transitions）是 Astro 框架注入的，上游没有对应物；后者还带随机 id | 属性名匹配 `/^data-astro[-:]/` 整类删除并计数（`ASTRO_ATTR_PREFIX`） |

关键代码（N1 + N7，`normalizeTree`）：

```js
const attrs = []
for (const attr of node.attrs) {
  if (ASTRO_ATTR_PREFIX.test(attr.name)) {   // N7
    ctx.droppedAstroAttrs++
    continue
  }
  attrs.push({ name: attr.name, value: normalizeAttrValue(attr.name, attr.value, ctx) })
}
attrs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))   // N1
```

关键代码（N4，`normalizeUrl`）：

```js
// 文件名里的内容哈希：`name.HASH.ext` / `name-HASH.ext` / `name_HASH.ext`
// 只认「点/横线/下划线分隔 + 6 位以上 + 紧跟扩展名」的段落，避免吃掉普通单词
out = out.replace(
  /([.\-_])([A-Za-z0-9_-]{6,})(?=\.(?:astro_[a-z0-9_]+|[a-z0-9]{1,8})(?:[?#]|$))/g,
  (_all, sep) => `${sep}<HASH>`,
)
out = out.replace(/([?&](?:v|ver|version|hash|h)=)[A-Za-z0-9._-]{6,}/gi, '$1<HASH>')
```

实测：`/css/index.css`（无哈希）不动；`/_astro/BaseLayout.By-987Uf.css` → `/_astro/BaseLayout.<HASH>.css`；
`ClientRouter.astro_astro_type_script_index_0_lang.CARLn6B5.js` → `..._lang.<HASH>.js`（只吃最后一段）。

### 2.2 补充的 7 项（任务没点名，但不做就会永远红）

| # | 归一化什么 | 为什么 | 怎么实现 |
| --- | --- | --- | --- |
| N8 | **HTML 实体** | `&amp;` ≡ `&#38;` ≡ 字面 `&`；上游压缩器会把 `"` 转成 `&quot;`，Astro 不一定 | 命名实体表（~45 个）+ 十进制/十六进制数字实体解码后比对（`decodeEntities`） |
| N9 | **class 集合** | class 顺序无意义，但集合必须一致 | 拆开、去重、排序、空格连接（`normalizeClassValue`）；集合变了照样报 `attr-changed` |
| N10 | **style 属性** | `color:red` ≡ `color: red;` | 按 `;` 拆声明、折叠 `:` 两侧空白、丢空声明、重连（`normalizeStyleValue`） |
| N11 | **站内 origin** | baseline 的 canonical 是 `https://baseline.anzhiyu.test/`，dist 的 `site` 配置不同就会全页链接不一致。**这是域名配置差异，不是结构差异** | 从本文档 `<link rel=canonical>` / `og:url` 取自身 origin → `<SITE>`；**第三方 host 不动**（见 §3） |
| N12 | **Astro 机制元素** | `<meta name="astro-view-transitions-*">`、`<meta name="generator" content="Astro …">`、`/_astro/ClientRouter*.js` 是 Astro 自带的路由机制，上游用主题自己的 pjax 脚本，**永远不可能对上** | 按精确规则整元素丢弃并计数（`isAstroMachineryElement`），diagnostics 里能看到丢了几条 |
| N13 | **`<pre>` 首行换行** | 浏览器忽略 `<pre>` 后紧跟的第一个换行（HTML 规范），编辑器和构建器有的加有的不加 | 只去掉 `pre`/`textarea` **自己的第一个文本子节点**开头的 `\n`；`<pre><code>` 里的首换行是内容，不动（`normalizeNode`） |
| N14 | **CRLF / 大小写** | Windows 下产物可能带 `\r\n`；压缩器可能大写标签名 | 换行统一 LF；tag 名、属性名统一小写（`parseStartTag`） |

N12 是唯一一处「按名字整类忽略」的规则，所以写死到最小：

```js
function isAstroMachineryElement(node) {
  if (node.tag === 'meta') {
    const name = attrValue(node, 'name') ?? ''
    if (name.startsWith('astro-')) return true
    if (name === 'generator' && /^astro\b/i.test(attrValue(node, 'content') ?? '')) return true
    return false
  }
  // Astro 自带的路由脚本，取代上游的 pjax 脚本，Phase 4 由交互层验收
  if (node.tag === 'script') {
    const src = attrValue(node, 'src') ?? ''
    return /\/_astro\/ClientRouter[./]/.test(src)
  }
  return false
}
```

实测首页：dist 侧丢弃 3 个 `data-astro-*` 属性、3 个 Astro 机制元素、6 条注释；baseline 侧 0。这些计数都在 `--json` 的 `diagnostics` 里，不是静默忽略。

---

## 3. 故意**不**归一化的差异

这一节比上一节重要：归一化做过头，工具就成了橡皮图章。

| 不归一化 | 为什么 |
| --- | --- |
| **标签层级 / 父子关系** | 这就是要验的东西。`#web_bg`、`#body-wrap`、`#content-inner`、`#rightside` 这些选择器写死在上游 CSS 里，层级错了样式必然崩 |
| **节点增删** | 同上。整棵子树只在一侧时，报 1 条差异**并且**累加子树节点数（见 §4 缺口统计） |
| **兄弟节点顺序** | 顺序影响渲染（导航、文章列表、侧栏顺序）。注意：`<meta>` 这类靠名字属性认身份的节点，换顺序会报成「1 缺 + 1 多」而不是「没差异」——这是对的，顺序确实变了 |
| **id 值** | id 是 HTML 的唯一身份，也是上游 JS/CSS 的锚点。改 id 会报 `node-missing` + `node-unexpected`（见 §6.3 4c），**不会**被悄悄当成「属性变更」 |
| **class 集合** | 顺序归一化，集合不归一化。少一个 class 就是少一条样式规则 |
| **文本内容** | 只折叠空白，字符必须一致（标题、正文、按钮文案、`alt` 之外的可见文字） |
| **script / style 内容** | 折叠「换行 + 缩进」后真比（`normalizeScriptBody`），内容不同报 `content` 一条。注释掉的代码、改一个常量都会被抓到 |
| **资源路径本身** | 只归一化哈希段。`/css/index.css`（上游单文件）vs `/_astro/BaseLayout.<HASH>.css`（Astro 打包）**仍然算差异**——否则「CSS 没加载」永远查不出来。这条对 Phase 2 判据影响最大，见 §11 |
| **非 URL 属性值** | `title` / `alt` / `content` / `data-*` / `aria-*` / `role` / `onclick` 等一律真比（只折叠空白） |
| **第三方资源 host** | 只有「本文档自己的 canonical origin」被替换成 `<SITE>`。`https://cdn.cbd.int/...` 和 `https://cdn.jsdelivr.net/...` 是不同 CDN，必须报差异 |
| **`<pre>` / `<textarea>` 内部空白** | 代码块里空白就是内容，折叠等于作弊 |
| **doctype 名称** | 只归一化大小写与空白，`html` vs `xhtml` 照样报 |
| **元素属性集合** | 多一个 `hidden`、少一个 `role` 都会报（`attr-missing` / `attr-unexpected`） |

一句话对照：**归一化清单里每一项都必须能举出「浏览器渲染结果相同」的理由**；举不出来的（比如「路径名差不多」）就不进清单。

---

## 4. 比对算法（为什么输出读得懂）

### 4.1 四级 LCS 对齐

朴素做法是「同层子节点按下标硬配」，结果是一删节点后面全错位，报出一堆假的「属性变了」。这里用四级签名，从强到弱，每级只在上一级剩下的空隙里做 LCS：

| 级别 | 签名 | 解决什么 |
| --- | --- | --- |
| 1 | `tag#id` | 有 id 的节点按身份配，插入/删除不错位 |
| 2 | `tag[key=value]`（`meta` 用 `name`/`property`/`http-equiv`/`charset`/`itemprop`，`link` 用 `rel`，`input` 用 `type`/`name`） | `<head>` 里 30 个 `<meta>` 不会因为删掉一条就整体报「属性变了」 |
| 3 | `tag.class1.class2`（仅无 id 的节点） | 带 class 的重复卡片（文章列表项）按身份配 |
| 4 | `tag`（跳过有 id 的节点） | 只剩 class 变了的情况按位置配，落成 `attr-changed` 而不是「1 缺 + 1 多」 |

关键约束：**有 id 的节点如果 id 没对上，不在第 4 级按位置强配**——id 不同就是不同元素。签名返回 `null` 表示「这一级认不出」，不会参与本级配对。

### 4.2 缺口统计（diffCount 会骗人）

整棵子树只在一侧时只报 1 条差异（可读性），但这会让「删了整个 `<main>`」看起来只差 1 条。所以额外累加 `missingNodes` / `unexpectedNodes`：

```js
if (slot.kind === 'gap') {
  for (let i = slot.aStart; i < slot.aEnd; i++) {
    const node = aNodes[i]
    const weight = countNodes(node)
    ctx.missingNodes += weight
    pushDiff(ctx, { kind: 'node-missing', path: ..., expected: `${serialize(node)}（子树 ${weight} 节点）`, actual: '（不存在）', weight })
  }
  ...
}
```

验证这个指标必要性的最直接数据（§7.6）：两个**完全不同**的真实页面（首页 vs 归档页）只报 13 条差异，但缺口是 341 缺 + 145 多。**只看 diffCount 会把「整页没做」看成「小问题」。**

### 4.3 差异类别

输出里每条差异都带 `[类别/类型]`，便于统计和归因：

| 类别 | 类型 | 含义 |
| --- | --- | --- |
| 结构 | `node-missing` / `node-unexpected` | 节点（子树）只在一侧 |
| 属性 | `attr-missing` / `attr-unexpected` / `attr-changed` | 属性增删改 |
| 文本 | `text` | 文本节点内容不同 |
| 脚本样式 | `content` | `<script>` / `<style>` 内容不同（整块一条） |
| 文档 | `doctype` | doctype 不同 |
| 文件 | `file-missing` | baseline 或 dist 缺文件（`--all` 时最常见） |

---

## 5. 输出与退出码示例

人类可读（默认，FAIL 时每页最多打印 20 条，`--limit` 可调）：

```
FAIL .baseline-work\public\index.html ↔ examples\blog\dist\index.html  66 条差异（结构 57 / 属性 8 / 文本 1），缺口 缺 1058 节点，多 30 节点
    1. [属性/attr-unexpected] /html
       期望: （不存在）
       实际: data-page-id="home"
    2. [结构/node-missing] /html/head/meta[2]
       期望: <meta content="IE=edge" http-equiv="X-UA-Compatible">（子树 1 节点）
       实际: （不存在）
  … 还有 61 条差异未显示（--limit 调整）
```

路径格式：`/html/body/div#body-wrap[4]/main#blog-container`——XPath 风格，`#id` 标身份，`[n]` 只在同 tag 兄弟多于 1 个时出现，`text()` 表示文本节点。

`--json` 输出（`--json` 模式下所有进度信息走 stderr，stdout 只有 JSON，可直接 `JSON.parse` / `jq`）：

```json
{
  "mode": "all",
  "ok": false,
  "baselineDir": ".baseline-work/public",
  "distDir": "examples/blog/dist",
  "summary": {
    "pages": 48, "pass": 0, "fail": 48,
    "diffCount": 113, "missingNodes": 1058, "unexpectedNodes": 30,
    "categories": { "结构": 57, "文件": 47, "属性": 8, "文本": 1 }
  },
  "pages": [
    { "path": "/", "status": "FAIL", "diffCount": 66, "counts": {...},
      "missingNodes": 1058, "unexpectedNodes": 30, "truncated": false,
      "diffs": [ { "kind": "node-missing", "category": "结构", "path": "...", "expected": "...", "actual": "..." } ],
      "diagnostics": { "baseline": { "nodes": 1070, "commentsDropped": 0, ... }, "dist": {...} } }
  ]
}
```

## 6. 自测（原始输出）

测试素材：`docs/reference/baseline.json` 的 48 页 baseline + 当前 `examples/blog/dist`（P1.5 垂直切片）。
负向用例的临时副本和归一化变异体都放在系统临时目录，**没有往仓库里写任何产物**。
下面贴的是真实终端输出，只把临时目录前缀缩成 `…\`（Windows 上那串 `C:\Users\…\AppData\Local\Temp\…`），其余字符未改。

### 6.1 同文件自比（必须 0 差异）

```
$ node scripts/diff-html.mjs .baseline-work/public/index.html .baseline-work/public/index.html
[diff-html] baseline: .baseline-work\public\index.html
[diff-html] dist:     .baseline-work\public\index.html
PASS .baseline-work\public\index.html ↔ .baseline-work\public\index.html  0 条差异
[diff-html] 结构一致
exit=0
```

dist 侧同文件自比（覆盖 Astro 产物 + 注释 + `data-astro-*`）：

```
$ node scripts/diff-html.mjs examples/blog/dist/index.html examples/blog/dist/index.html
PASS examples/blog/dist/index.html ↔ examples/blog/dist/index.html  0 条差异
exit=0
```

48 页全量自比（把 dist 根指向 baseline 根，验证解析器能吃下全部真实页面）：

```
$ BASELINE_HTML_DIR=.baseline-work/public DIST_DIR=.baseline-work/public node scripts/diff-html.mjs --all
…
PASS /tags/长文/  0 条差异

汇总：48 页 / PASS 48 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致
exit=0
```

### 6.2 真实对比：baseline 首页 vs dist 首页（当前应该是大差异）

```
$ node scripts/diff-html.mjs .baseline-work/public/index.html examples/blog/dist/index.html --limit 5
[diff-html] baseline: .baseline-work\public\index.html
[diff-html] dist:     examples\blog\dist\index.html
FAIL .baseline-work\public\index.html ↔ examples\blog\dist\index.html  66 条差异（结构 57 / 属性 8 / 文本 1），缺口 缺 1058 节点，多 30 节点
    1. [属性/attr-unexpected] /html
       期望: （不存在）
       实际: data-page-id="home"
    2. [结构/node-missing] /html/head/meta[2]
       期望: <meta content="IE=edge" http-equiv="X-UA-Compatible">（子树 1 节点）
       实际: （不存在）
    3. [属性/attr-changed] /html/head/meta[3]
       期望: content="width=device-width, initial-scale=1.0, user-scalable=no"
       实际: content="width=device-width, initial-scale=1"
    4. [文本/text] /html/head/title/text()
       期望: "AnZhiYu Baseline - 上游 1.7.1 参考产物"
       实际: "垂直切片 · 首页"
    5. [结构/node-missing] /html/head/meta[4]
       期望: <meta content="Hexo,AnZhiYu,baseline" name="keywords">（子树 1 节点）
       实际: （不存在）
  … 还有 61 条差异未显示（--limit 调整）
[diff-html] 结构不一致
exit=1
```

诊断（`--verbose`）：baseline 1070 节点、dist 42 节点；dist 侧丢弃 3 个 `data-astro-*` 属性、3 个 Astro 机制元素、6 条注释。

### 6.3 负向用例（必须报出来）

**4a 改一个 class**（真实首页，`class="loading-img nolazyload"` → `class="loading-img"`）：

```
FAIL .baseline-work\public\index.html ↔ …\real-neg-class.html  1 条差异（属性 1）
    1. [属性/attr-changed] /html/body/div#loading-box[3]/div/img
       期望: class="loading-img nolazyload"
       实际: class="loading-img"
exit=1
```

**4b 删一个节点**（真实首页，删 `<div class="loading-image-dot"></div>`）：

```
FAIL .baseline-work\public\index.html ↔ …\real-neg-drop.html  1 条差异（结构 1），缺口 缺 1 节点
    1. [结构/node-missing] /html/body/div#loading-box[3]/div/div
       期望: <div class="loading-image-dot">（子树 1 节点）
       实际: （不存在）
exit=1
```

**4c 改一个 id**（验证不会被当成普通属性变更）：

```
FAIL …\norm-a.html ↔ …\neg-id.html  2 条差异（结构 2），缺口 缺 6 节点，多 6 节点
    1. [结构/node-missing] /html/body/div#main
       期望: <div class="wrap" id="main"><img alt="x" …（子树 6 节点）
       实际: （不存在）
    2. [结构/node-unexpected] /html/body/div#main-renamed
       期望: （不存在）
       实际: <div class="wrap" id="main-renamed"><img alt="x" …（子树 6 节点）
exit=1
```

**4d 改一个字符的文本**：`1 条差异（文本 1）` 定位到 `/html/body/div#main/a/text()`，`"Home"` vs `"Home2"`。

### 6.4 归一化契约（正向：只改写法，必须 PASS）

合成页 A/B：B 相对 A 只做「必须被归一化」的变化——属性顺序倒置、`META`/`SCRIPT` 大写、`<!doctype HTML>`、`<br/>`/`<img />` 自闭合、`disabled="disabled"`、`&amp;` → `&#38;`、class 顺序 `b  a` → `a b`、`style="color:red;"` → ` style: red `、插 2 条注释、加 `data-astro-cid-*`、资源哈希段全换。

```
PASS …\norm-a.html ↔ …\norm-b.html  0 条差异
  · baseline: 节点 18，注释 1
  · dist: 节点 18，注释 2，data-astro-* 属性 1
[diff-html] 结构一致
exit=0
```

真实页同样测（对 62 KB 的 baseline 首页做纯写法变异：所有 `<meta>` 属性顺序倒置 + 每个 `</div>` 前插注释（244 条）+ 每个 `<div` 加 `data-astro-cid-zz9y8x7w`（244 个）+ `html/head/body/title` 标签大写）：

```
PASS .baseline-work\public\index.html ↔ …\index-mutated.html  0 条差异
  · baseline: 节点 1070，站内 origin https://baseline.anzhiyu.test
  · baseline 警告: <img> 重复属性 onerror，保留第一个 ×10
  · dist: 节点 1070，注释 244，data-astro-* 属性 244，站内 origin https://baseline.anzhiyu.test
  · dist 警告: <img> 重复属性 onerror，保留第一个 ×10
exit=0
```

反方向也测了（防过度归一化）：dist 首页把 `_astro/BaseLayout.By-987Uf.css` 的哈希换成随机串 → **PASS**；把文件名 `BaseLayout` 换成 `OtherName` → **FAIL**（`href="/_astro/BaseLayout.<HASH>.css"` vs `"/_astro/OtherName.<HASH>.css"`）。

`<pre>` 边界单独验（N13 的「只吃浏览器真的会忽略的那一个换行」）：

```
$ node scripts/diff-html.mjs pre-a.html pre-b.html
# pre-a = <pre>\ntext line</pre> + <pre><code>\nx</code></pre>
# pre-b = <pre>text line</pre>  + <pre><code>x</code></pre>
FAIL …  1 条差异（文本 1）
    1. [文本/text] /html/body/pre[2]/code/text()
       期望: "\nx"
       实际: "x"
exit=1
```

即：`<pre>` 自己的首换行被忽略（两侧 `pre` 文本一致，没报），`<code>` 内部的首换行照报——不越界。

### 6.5 边界与退出码

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| baseline 目录不存在 | `BASELINE_HTML_DIR=.baseline-work/not-here node scripts/diff-html.mjs --all` | 提示两行 + `exit=0` |
| baseline 单文件不存在 | `node scripts/diff-html.mjs /nope.html <dist>` | 提示 + `exit=0` |
| dist 文件不存在 | `node scripts/diff-html.mjs <baseline> /nope.html` | `FAIL … 1 条差异（文件 1）` + `exit=1` |
| 目录当参数 | `node scripts/diff-html.mjs .baseline-work/public examples/blog/dist` | 自动接 `index.html`，`exit=1`（首页有差异） |
| `--limit 0` | | 只打汇总行 |
| `--max-diffs 3` | | 打 3 条 + 汇总标「（已截断）」 |
| `--json` + baseline 缺失 | | stdout 是合法 JSON `{"mode":"pair","ok":true,"skipped":true,"reason":"baseline-missing"}` |

---

## 7. 当前 baseline vs dist 的真实差异

**前提**：`examples/blog/dist` 现在只有 P1.5 垂直切片的 2 个页面（`index.html` / `page2/index.html`），不是 Phase 2 产物。下面的数字是**起点基线**，不是缺陷计数。

### 7.1 首页（有对比物）

```
$ node scripts/diff-html.mjs .baseline-work/public/index.html examples/blog/dist/index.html
FAIL …  66 条差异（结构 57 / 属性 8 / 文本 1），缺口 缺 1058 节点，多 30 节点
```

| 项 | 值 |
| --- | --- |
| 差异条数 | **66** |
| 缺口 | 缺 1058 节点 / 多 30 节点 |
| baseline 节点数 | 1070 |
| dist 节点数 | 42 |

### 7.2 某篇文章页（dist 缺页）

```
$ node scripts/diff-html.mjs .baseline-work/public/2024/11/01/longform-hexo-astro/index.html \
                             examples/blog/dist/2024/11/01/longform-hexo-astro/index.html
FAIL …  1 条差异（文件 1）
    1. [文件/file-missing] (dist)
       期望: examples\blog\dist\2024\11\01\longform-hexo-astro\index.html
       实际: （不存在，先跑 pnpm --filter blog build）
exit=1
```

这条 `1` 是「dist 没这个页面」，真实含义是**整页欠着**。baseline 该页：1329 节点 / 62356 B（`docs/reference/baseline.json`）。Phase 2 的验收动作就是让这条变成 0 差异。

### 7.3 归档页（dist 缺页）

```
$ node scripts/diff-html.mjs .baseline-work/public/archives/index.html examples/blog/dist/archives/index.html
FAIL …  1 条差异（文件 1）   # (dist) 不存在
```

baseline 该页：874 节点 / 45987 B。

### 7.4 全量

```
$ node scripts/diff-html.mjs --all
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 113 条（结构 57 / 文件 47 / 属性 8 / 文本 1），缺口 缺 1058 / 多 30 节点
exit=1
```

48 页里只有 `/`（`index.html`）在 dist 有对应文件，其余 47 页报 `file-missing`；所以 113 = 66（首页）+ 47（缺页）。

### 7.5 首页的 66 条差异是什么

**结构 57 条**（52 缺 + 5 多，共缺 1058 节点）。`<head>` 缺 37 条 / 42 节点：

| 位置 | 条数 | 节点 | 对应 Phase 2/3 工作 |
| --- | --- | --- | --- |
| `/html/head/meta` | 28 | 28 | SEO/OG/twitter/apple 全套 meta（`keywords`/`author`/`og:*`/`twitter:*`/`theme-color`/`X-UA-Compatible` 等） |
| `/html/head/link` | 5 | 5 | favicon / canonical / preconnect / `index.css` / snackbar CSS |
| `/html/head/script` | 3 | 6 | `GLOBAL_CONFIG`、`#config-diff`、saveToLocal 内联脚本 |
| `/html/head/noscript` | 1 | 3 | JS 未启用时的兜底样式 |

`<body>` 缺 15 条 / 1016 节点：

| 位置 | 缺节点 | 对应 Phase 2/3 工作 |
| --- | --- | --- |
| `/html/body/div#body-wrap/main#blog-container` | **508** | 首页文章列表（`recent-post-item` 卡片、分页） |
| `/html/body/div#body-wrap/header#page-header` | **210** | 顶部导航 + 头图（`nav`、`#site-name`、菜单） |
| `/html/body/div#sidebar` | 117 | 侧栏（站点信息、最近文章、分类/标签卡片） |
| `/html/body/div#rightMenu` | 101 | 右键菜单 |
| `/html/body/div`（无 id，装全部 `<script src>` 的那层） | 29 | 主题 JS 引用层 |
| `/html/body/div#body-wrap/footer#footer` | 14 | 页脚 |
| `/html/body/div#rightside` | 13 | 右下工具按钮（简繁、深浅色、返回顶部） |
| `/html/body/div#popup-window` | 9 | 通知弹窗 |
| `/html/body/div#nav-music` | 5 | 音乐播放器入口（切片里换成了 `#music-player` 探针） |
| `/html/body/div#loading-box` | 4 | 加载动画（切片只有骨架） |
| `/html/body/script[1]`、`script[2]`、`link` | 2 + 1 + 1 | preloader 内联脚本 / pace.js / progress_bar.css |
| `/html/body/div#an_music_bg`、`div#rightmenu-mask` | 1 + 1 | 背景音层 / 右键菜单遮罩 |

dist 多出 5 条 / 30 节点（都是 P1.5 切片自造的探针结构，Phase 2 会被真实结构取代）：
`div#body-wrap/nav#nav` 7 节点、`div#body-wrap/main#content-inner` 18 节点、`div#music-player` 2 节点、2 个探针 `<script>`（2 + 1 节点）。

**属性 8 条**（6 行，`link[6]` 那行占 3 条；全部是真实问题，不是噪声）：

| 位置 | 期望（baseline） | 实际（dist） |
| --- | --- | --- |
| `/html` | — | 多出 `data-page-id="home"` |
| `/html/head/meta[3]`（viewport） | `width=device-width, initial-scale=1.0, user-scalable=no` | `width=device-width, initial-scale=1` |
| `/html/head/link[6]` | fancybox CSS，`media="print"` + `onload="this.media='all'"` 懒加载 | 换成 `/_astro/BaseLayout.<HASH>.css`，且丢了 `media`/`onload`（共 3 条） |
| `/html/body` | `data-type="anzhiyu"` | `data-type="home"` |
| `/html/body` | — | 多出 `data-page-id="home"` |
| `/html/body/div#body-wrap` | `class="page"` | 无 class |

（`link[6]` 那条是本次最典型的「资源路径策略」问题，见 §11。）

**文本 1 条**：`<title>` —— `AnZhiYu Baseline - 上游 1.7.1 参考产物` vs `垂直切片 · 首页`（站点配置差异，会随 Phase 2 配置层收敛）。

### 7.6 敏感度参考：为什么 diffCount 和缺口要一起看

同一天同一套工具，拿两个**结构完全不同**的真实 baseline 页面对比：

| 对比 | 差异条数 | 缺口 |
| --- | --- | --- |
| baseline 首页 ↔ baseline 归档页 | **13** | 缺 341 / 多 145 |
| baseline 首页 ↔ baseline 文章页 | **51** | 缺 491 / 多 750 |
| **baseline 首页 ↔ dist 首页（本次）** | **66** | **缺 1058 / 多 30** |

首页 vs 归档页只报 13 条，但缺口 341 节点——「文章列表 vs 归档列表」是两个整体不同的子树，各报 1 条。所以：

- **diffCount 适合**「定位改哪里」；
- **缺口节点数适合**「进度做到多少」；
- Phase 2 门禁建议两个都要看（§11）。

---

## 8. 已知限制

| 限制 | 影响 | 处理 |
| --- | --- | --- |
| 自带 HTML 解析器，不是完整 HTML5 树构建（没有 foster parenting / adoption agency / `<template>` 内容模板语义） | 上游产物是压缩但良构的 HTML，实测 48/48 页可用；极端畸形输入会退化成「按栈恢复」并在 diagnostics 里告警 | diagnostics 的 `warnings` 会列出所有恢复动作，不静默 |
| 隐式闭合只覆盖 `p/li/dt/dd/tr/td/th/option/optgroup/thead/tbody/tfoot` | 其他可选闭合标签（如 `html/head/body` 省略写法）不特殊处理 | 上游/Astro 产物都显式闭合，实测无触发 |
| 命名实体只解码 ~45 个 + 数字实体 | 生僻命名实体（如 `&hellip;` 之外的 `&mldr;`）两侧写法不同会误报 1 条文本差异 | 上游实际只出现 `&quot; &amp; &copy; &#x2F; &gt; &#123; &#125; &#39; &#x3D; &lt;`（已全测），够用；后续要扩就是往 `NAMED_ENTITIES` 加一行 |
| `<script>` 内容只折叠「换行 + 缩进」再比 | 格式化风格不同的同一段 JS 视为相同；但压缩器改变量名会报差异 | 这是刻意取舍：结构 diff 不该替代 JS 行为测试（PLAN §3.3 行为基线负责） |
| 兄弟顺序变化报成「1 缺 + 1 多」 | 移动节点的 diff 不够「聪明」 | 保守方向：宁多报不漏报 |
| 一个整块缺失分支只报 1 条 | 需要配合 `missingNodes` 看 | §4.2 / §7.6 |
| 站内 origin 靠 canonical 自检测 | dist 若没输出 canonical，其绝对 URL 不会被归一化 | 已支持 `og:url` 兜底；Phase 2 配置层应输出 canonical（Phase 5 本来就要） |

---

## 9. 顺手发现的问题（超出本任务写范围，未改）

1. **上游模板 bug：`<img>` 的 `onerror` 属性重复出现两次**。48 页共 152 处（首页 10 处、404 页 4 处、文章页 5–6 处），主要集中在懒加载封面/头像：无 class 76 处、`avatar-img` 47、`post_bg` 10、`prev-cover`/`next-cover` 各 8。
   两个值还不一样：`onerror="this.onerror=null;this.src='/img/404.jpg'"` + `onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;"`（分号 vs 逗号）。
   浏览器只取第一个，第二个被忽略。**不影响本工具结论**（两侧都保留第一个并告警），但 Phase 2 复刻时要按「浏览器实际行为」写一次，别照抄两遍。
2. **`about/index.html` 有 2 个未闭合 `<span>`**（上游产物，`span` 开 105 / 闭 103）。解析器按 HTML5 的祖先闭合规则恢复，`48 页自比 0 差异` 证明恢复稳定。复刻时注意别「修好」它——修好后 DOM 结构会与 baseline 不同（虽然视觉一样），届时本工具会报差异，需要在 §3 的「已知豁免」里登记。
3. **长文页的多层 TOC 暴露了本工具一个真 bug（已修）**：初版隐式闭合不带作用域，`<ol><li><ol><li>` 里内层 `<li>` 把外层 `<li>` 关掉了，整棵 TOC 错位、并报出 `忽略游离结束标签 </li>/</ol>`。修法是给 `li/dt/dd/tr/td/th/option/p` 加 `CLOSE_SCOPE` 边界（找 `li` 不越过 `ul/ol`，找 `td` 不越过 `tr/table`）。修完长文页 0 警告。**这个 bug 说明「自比 0 差异」不够，必须看 warnings**——所以工具把 warnings 打进 `--verbose` / `--json` diagnostics。

---

## 10. 遗留：CI 里没有 `.baseline-work` 时这个工具怎么用

现状：`.baseline-work/` 被 gitignore（产物 4.4 MB，其中 HTML 2.1 MB），所以 CI 上没有参考产物。工具已经按「不红」处理：

```bash
$ BASELINE_HTML_DIR=/nonexistent node scripts/diff-html.mjs --all
[diff-html] baseline 目录不存在，跳过比对：/nonexistent
[diff-html] （参考产物不进仓库，属预期情况；本地可用 BASELINE_HTML_DIR 指向 hexo g 的 public 目录）
exit=0
```

但「永远 skip」等于没有门禁。建议方案（按实现成本排序）：

**方案 A（推荐，成本最低）：把 baseline HTML 作为 CI cache / release asset 托管**

- 只缓存 HTML（2.1 MB 48 页），不缓存图片（diff 不读图片）。
- key 用 `docs/reference/baseline.json` 里已有的 `baseline.commit`（`72439d93`）+ `baseline.version`（`1.7.1`）：
  `html-baseline-72439d93-1.7.1`
- 命中 → `BASELINE_HTML_DIR=<cache>/public node scripts/diff-html.mjs --all --json`；
- 未命中 → 工具 skip（exit 0），CI 打一条 notice，不阻塞合并；
- 生成方式：`scripts/fetch-baseline.mjs`（新增任务，**不在本任务写范围**）从 GitHub Release asset 下载 `public-html.tar.zst` 并校验 sha256。
  建议届时给 `docs/reference/baseline.json` 的 `baseline` 对象加一个 `htmlArchiveSha256` 字段（现在是逐页 sha256，没有整包摘要），否则下载物无法校验。

**方案 B：CI 里现算（最真、最贵）**
在 job 里 `git checkout` 上游主题 commit → `npm i` → `hexo g` → 得到 public。一次 3–5 分钟 + 需要 hexo 依赖缓存，且上游版本升级时清单要同步。适合做「基线重建」的定时任务，不适合每个 PR。

**方案 C：PR 级只跑「有 baseline 的页」+ 本地全量**
PR 日常 skip；合并前由维护者本地跑 `pnpm diff:html --all` 贴 JSON 到 PR。门禁弱，但零基建。

三种都需要**一步**：把「哪些页必须 PASS」写进 PLAN 的验收命令集（`docs/plan/PLAN.md` §3.5 已列 `node scripts/diff-html.mjs`，但没写判定标准）。建议 §3.5 的判定写成 §11 的判据。

---

## 11. 这个工具是否已可用于 Phase 2 逐页验收

**可以，判据要写清三条，否则「0 条差异」永远达不到、或者达到了也没意义。**

### 判据（建议直接写进 PLAN §3.2 / §3.5）

**判据 1：单页 PASS = `diffCount === 0` 且 `truncated === false`。**
工具默认单页最多收集 20000 条，真实页不会触顶；`truncated` 为真时即使 diffs 少也不能算 PASS（现在实现就是这样）。

**判据 2：进度看缺口，不只看条数。**
`missingNodes + unexpectedNodes` 必须单调下降。理由见 §7.6：两个完全不同的页面只报 13 条差异。建议每完成一个页面记一行：

| 页面 | diffCount | 缺口（缺/多） | 状态 |
| --- | --- | --- | --- |
| `/` | 66 | 1058 / 30 | Phase 2 起点 |
| `…/longform-hexo-astro/` | 1（缺页） | — | 未开始 |

**判据 3：Phase 2 期间允许 FAIL，但每一条都必须归到「已登记豁免」。**
目前需要登记的只有两类，且都不是工具的锅：

| 豁免类别 | 现状 | 处理建议 |
| --- | --- | --- |
| **资源路径策略**：`/css/index.css` ↔ `/_astro/BaseLayout.<HASH>.css`；`/js/main.js` ↔ `/_astro/*.js` | 首页 1 条 `attr-changed`（`link[6]`）+ 后续脚本层都会撞上 | 二选一：① Phase 2 接受「路径必须与上游一致」→ 需要改构建产物命名（成本高但最硬）；② 接受 Astro 打包路径 → 把「资源路径类属性」列为豁免，并**另建一条检查**确认 CSS/JS 确实被引用且能加载（不能只靠本工具） |
| **Astro 机制元素/属性**（`ClientRouter` 脚本、view-transition meta、`data-astro-*`） | 工具已默认忽略并计数 | 无需额外处理；`diagnostics` 里能看到每次忽略了几条 |

**不该豁免、必须真修的：** 标签层级、id、class 集合、文本、meta 全集、`<pre>` 内代码、`<noscript>` 兜底——这些是上游 CSS/JS 的硬契约（`#web_bg`、`#body-wrap`、`#rightMenu` 之类选择器写死在 302 KB Stylus 里）。

### 我的判断

工具本体已经够用，三条自测（自比 0、真实大差异、负向必报）和归一化契约（真实页 244 处写法变异仍 PASS）都过了，48 页真实数据也验证了解析器没有崩在长文/TOC/表格/代码块这些硬结构上。**真正的验收阻力不在工具**，而在两件工程决定：

1. **baseline 产物怎么进 CI**（§10 方案 A，约半天工作量，属于 P2 前置小任务）；
2. **资源路径到底要不要与上游字节级对齐**（直接影响 PLAN §3.2「差异只允许出现在资源路径哈希与注释」这句能不能字面成立——按现在的 Astro 打包方式，它会多出「路径名不同」这一类差异；我建议把验收标准改成「差异全部可归类为已登记豁免」，而不是假装哈希归一化能覆盖路径差异）。

在这两件定下来之前，`pnpm diff:html --all` 已经可以每天跑、可以进报告、可以作为「这一页做了什么/还差多少节点」的量化依据；定下来之后加进 CI 门禁，Phase 2 每页验收就是一条命令的事。
