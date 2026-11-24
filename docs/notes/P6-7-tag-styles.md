# P6-7 · Hexo tag 样式命中验证

> 范围：Phase 6 退出验收项。只读 `examples/blog/dist` 与上游样式源，不参加构建，不占构建锁。
>
> 结论：**42 个 tag 全部可定位；35 个带 class 的 tag 共 186 个 class，覆盖 186/186（100%）——
> 精确命中 147、仅父级/同元素语境命中 34、上游本身无规则 5；真·未命中 0。**
> 另有 7 个 tag 不含 class（6 个行内标签用元素选择器、dogeplayer 由运行时 iframe 注入），
> 已在文末单独说明。校验脚本 `scripts/check-tag-styles.mjs` 已在干净产物上通过。

## 1. 目标与方法

上游把 tag 的样式集中写在 `_tags/*.styl`，但并非全部：`link` / `site` / `flink` 等
复用页面规则。本验证回答的是「**tag 生成的 HTML class 在上游样式里有没有规则**」，
而不是「视觉是否逐像素一致」。

做法（`scripts/check-tag-styles.mjs`）：

1. 从 4 张 tag fixture 产物页里，按 fixture 的 `## 标题` 切出分节（h2 为边界）；
2. 每个 tag 用一张声明表定位根元素（`TAG_SPECS`：页面 + 分节 + 起始标签正则 + 同根多实例的下标），
   再按同名标签配对切出该 tag 的完整片段；
3. 解析片段里的 `class` 属性，并记录每个 class 所在元素的祖先 class 集合；
4. 扫描上游样式源，按行解析选择器，抽取 `.class` token 与元素 token；
5. 逐 class 判定并分组：
   - **精确命中**：class 本身出现在某条选择器里；
   - **仅语境命中**：class 本身没有规则，但同一元素上的其它 class、或祖先元素的 class 有规则
     （如 `.btn-anzhiyu.larger` 的 `larger`、`.gallery .gallery-load-more` 的 `gallery-load-more`）；
   - **上游无规则**：上游同版本模板也输出这个 class，但整个样式树与编译产物都没有规则
     （白名单，见 §4；默认只 WARN，`--strict` 时判失败）；
   - **未命中**：以上都不成立 → 退出码 1。

### 1.1 样式源范围

默认扫 `examples/blog/src/styles/upstream/` 整棵树（119 个 `.styl`/`.css`）：
`_tags` 20、`_extra` 46、`_layout` 20、`_page` 12、`_global` 4、`_mode` 2、`_search` 3、
`_third-party` 3、`_highlight` 7、根目录 `index.styl` + `var.styl`。

只扫 `_tags/` 会误判：`link` 的规则在 `_extra/tag/link.css`，`site` 在 `_extra/tag/site.css`
与 `_page/flink.styl`，`flink` 在 `_page/flink.styl`。这些是上游「tag 复用页面类」的既有做法，
不是我们的偏差，因此按整树统计，同时单独统计命中来源目录（§3.3）。

### 1.2 Stylus 循环的补充判定

`note.styl` / `timeline.styl` / `button.styl` 用 `for $type in $color-types` 生成
`.note.info`、`.timeline.blue`、`.btn-anzhiyu.blue` 这类选择器，源文件里没有字面量。
脚本会读构建产物 `dist/_astro/*.css` 兜底：只在编译产物里出现的 class 记为「编译展开命中」，
不算精确、也不误报未命中。本次运行该兜底计数为 0（同名 class 在其它上下文已有字面量规则），
保留它是为了防止将来只有循环能解释的 class 被误判。

## 2. 逐 tag 结果

口径：`class` = 片段去重后的 class 数；`精确` / `语境` / `上游无` / `未命中` 见 §1；
覆盖率 =（精确 + 语境 + 上游无）/ class。`—` 表示该 tag 没有 class。

| 分组 | tag | class | 精确 | 语境 | 上游无 | 未命中 | 覆盖率 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 行内 | u | — | — | — | — | 0 | 元素选择器 |
| 行内 | emp | — | — | — | — | 0 | 元素选择器 |
| 行内 | wavy | — | — | — | — | 0 | 元素选择器 |
| 行内 | del | — | — | — | — | 0 | 元素选择器 |
| 行内 | kbd | — | — | — | — | 0 | 元素选择器 |
| 行内 | psw | — | — | — | — | 0 | 元素选择器 |
| 行内 | label | 4 | 4 | 0 | 0 | 0 | 100% |
| 行内 | inlineImg | 1 | 1 | 0 | 0 | 0 | 100% |
| 行内 | icon | 1 | 1 | 0 | 0 | 0 | 100% |
| 行内 | btn | 3 | 2 | 1 | 0 | 0 | 100% |
| 行内 | p | 2 | 2 | 0 | 0 | 0 | 100% |
| 行内 | span | 2 | 2 | 0 | 0 | 0 | 100% |
| 块级 | note | 10 | 9 | 1 | 0 | 0 | 100% |
| 块级 | subnote | 3 | 3 | 0 | 0 | 0 | 100% |
| 块级 | tabs | 9 | 8 | 1 | 0 | 0 | 100% |
| 块级 | subtabs | 9 | 8 | 1 | 0 | 0 | 100% |
| 块级 | subsubtabs | 7 | 6 | 1 | 0 | 0 | 100% |
| 块级 | hideInline | 3 | 3 | 0 | 0 | 0 | 100% |
| 块级 | hideBlock | 3 | 3 | 0 | 0 | 0 | 100% |
| 块级 | hideToggle | 3 | 3 | 0 | 0 | 0 | 100% |
| 块级 | folding | 2 | 2 | 0 | 0 | 0 | 100% |
| 块级 | checkbox | 2 | 1 | 1 | 0 | 0 | 100% |
| 块级 | radio | 2 | 1 | 1 | 0 | 0 | 100% |
| 块级 | timeline | 7 | 7 | 0 | 0 | 0 | 100% |
| 媒体 | image | 4 | 1 | 0 | 3 | 0 | 100% |
| 媒体 | inlineimage | 1 | 1 | 0 | 0 | 0 | 100% |
| 媒体 | audio | 1 | 0 | 0 | 1 | 0 | 100% |
| 媒体 | video | 1 | 1 | 0 | 0 | 0 | 100% |
| 媒体 | videos | 2 | 2 | 0 | 0 | 0 | 100% |
| 媒体 | gallery | 8 | 4 | 4 | 0 | 0 | 100% |
| 媒体 | galleryGroup | 4 | 2 | 2 | 0 | 0 | 100% |
| 媒体 | site | 7 | 5 | 2 | 0 | 0 | 100% |
| 媒体 | sitegroup | 10 | 8 | 2 | 0 | 0 | 100% |
| 媒体 | btns | 8 | 5 | 3 | 0 | 0 | 100% |
| 媒体 | cell | 5 | 2 | 3 | 0 | 0 | 100% |
| 第三方 | bilibili | 11 | 10 | 1 | 0 | 0 | 100% |
| 第三方 | dogeplayer | — | — | — | — | 0 | 运行时 iframe |
| 第三方 | mermaid | 2 | 1 | 1 | 0 | 0 | 100% |
| 第三方 | tip | 2 | 2 | 0 | 0 | 0 | 100% |
| 第三方 | link | 12 | 9 | 2 | 1 | 0 | 100% |
| 第三方 | intCard | 13 | 12 | 1 | 0 | 0 | 100% |
| 第三方 | flink | 22 | 16 | 6 | 0 | 0 | 100% |

### 2.1 仅语境命中的明细

| tag | class → 依靠的父级/同元素 class |
| --- | --- |
| btn | `anzhiyu-icon-paper-plane` ← `.btn-anzhiyu` / `.larger` |
| note | `fa-bell` ← `.note` / `.info` / `.icon-padding` / `.flat` |
| checkbox / radio | `checked` ← 同元素 `.checkbox`（勾选态本身没有独立规则，视觉由 `input:checked` 承担） |
| tabs / subtabs / subsubtabs | `anzhiyu-icon-arrow-up` ← `.tabs` / `.tab-to-top` |
| gallery | `page_img_lazyload`、`data`、`gallery-load-more`、`anzhiyu-icon-arrow-down` ← `.gallery` |
| galleryGroup | `gallery-group-img`、`no-lightbox` ← `.gallery-group` |
| site / sitegroup | `flink-avatar`、`site-title` ← `.site-card` / `.info` |
| btns | `button`、两个图标 class ← `.btns` / `.rounded` / `.grid5` / `.no-text-decoration` |
| cell | `button`、两个图标 class ← `.no-text-decoration` |
| bilibili | `no-lazyload` ← 同元素 `.play_icon`（懒加载/灯箱的行为标记，无独立样式） |
| mermaid | `mermaid-src` ← `.mermaid-wrap` |
| link | `anzhiyu-icon-link`、`anzhiyu-icon-angle-right` ← `.tag-Link` / `.tag-link-*` |
| intCard | `no-lightbox` ← `.introduction-card*` / `.left` |
| flink | `flink-list`、`no-lightbox`、`cf-friends-avatar`、`flink-avatar`、`flink-sitename`、`cf-friends-name` ← `.flink` / `.flink-list-item` / `.cf-friends-link` 等 |

这些 class 在上游本来就没有独立规则（多由 JS 或图标字体承担），但所在结构有样式，
按任务口径视为「有样式」，单独计数、不混入精确命中。

### 2.2 命中来源分布

精确命中按「class × 来源文件」计数（同一 class 出现在多个目录会重复计）：

| 目录 | 计数 | 说明 |
| --- | ---: | --- |
| `_tags` | 141 | tag 自己的样式，主力 |
| `_extra` | 72 | `_extra/tag/link.css`、`site.css` 等 |
| `_layout` | 38 | 文章正文、导航等复用规则 |
| `_page` | 37 | `_page/flink.styl` 等 |
| `_mode` | 28 | 深色 / 阅读模式下的同名规则 |
| `_global` | 7 | `.anzhiyufont` 等全局类 |
| `_highlight` | 2 | 代码高亮容器内的通用类 |

按更严格的目录口径：147 个精确命中 class 里，**105 个能在 `_tags/` 找到规则**，
**113 个能在任务点名的 `_tags/ + _global/ + _layout/` 找到**；其余 34 个只出现在
`_extra` / `_page` / `_mode` / `_highlight`（典型是 `link`、`site`、`flink` 复用页面与
第三方样式）。若只看 `_tags/`，这 34 个会被误判为未命中，故本脚本按整树统计并在此单独披露。

## 3. 未命中清单

**无（0 个）。**

## 4. 上游本来就没有规则的 class（5 个）

以下 class 是我们的 tag 模板与上游同版本模板**逐字符一致**输出、但上游样式树里确实没有规则的。
不是「我们写错 class」，也不放宽判定：它们被登记在脚本 `UPSTREAM_UNSTYLED` 白名单里，
默认只 WARN，`--strict` 时同样判失败。

| tag | class | 上游出处 | 判定依据 |
| --- | --- | --- | --- |
| image | `img-wrap` | `scripts/tag/image.js` 的包裹 div | 全树 + 编译产物无该选择器 |
| image | `img-bg` | 同上（背景层 div） | 同上 |
| image | `image-caption` | 同上（alt 图注 span） | 同上 |
| audio | `audio` | `scripts/tag/media.js` 的包裹 div | 上游只样式化 `audio` 元素（`audio,video`） |
| link | `anzhiyu-tag-link` | `scripts/tag/link.js` 的外层 div | 上游只样式化内层 `.tag-Link` |

另有 4 处 class（3 种名字）也不在上游任何选择器里，但它们所在的元素还有别的 class 能命中规则，
按任务口径归入「仅语境命中」而非白名单：`checked`（checkbox 与 radio 各一处，靠同元素 `.checkbox`）、
`button`（cell，靠 `.no-text-decoration`）、`no-lazyload`（bilibili，靠 `.play_icon`）。
其中 `checked` 是勾选态标记、`no-lazyload` 是懒加载行为标记，上游都没有为它们单独写视觉规则
（勾选态由 `input[type="checkbox"]:checked` 承担），换样式时不要指望这两个 class 本身有样式。

## 5. 无 class 的 tag（7 个）

| tag | 情况 |
| --- | --- |
| u / emp / wavy / del / kbd / psw | 输出纯元素（`<u>`、`<emp>`…），上游 `_tags/inline-labels.styl` 用**元素选择器**样式化。按任务口径「只看 class」，不计入命中率；脚本会额外打印元素命中来源作佐证。`kbd` 另有 `_layout/post.styl`、`_mode/*`、`normalize.min.css` 的规则。 |
| dogeplayer | 输出 `<div id="player_…">` + loader 脚本，可见内容由 DogeCloud iframe 在运行时注入，上游没有对应 styl；与「无样式」不同，属第三方播放器自绘。 |

## 6. 口径与局限

1. **class 级匹配，不解析选择器语义**：只看「这个 class 是否出现在某条选择器里」，
   不校验选择器是否真的能选中该元素。例如 `.note.info` 的 `info` 也可能被
   `.site-card .info` 这类其它规则计入精确命中；不过 `note` 的类型类在编译产物里
   确实有 `.note.info/.warning/.success`（`for $type in $color-types` 展开），结论不受影响。
2. **允许父级命中**：这是任务明确的口径，但已单独统计（34 个），不与精确命中混算。
3. **bilibili 的 class 来自内联脚本模板**：片段延到分节末尾才纳入 `bilibili_info`、
   `bilibili_cover` 等运行时 DOM；它们由 `_tags/bilbili.styl` 覆盖。其余 tag 只检查静态 HTML。
4. **元素选择器不参与判定**：6 个行内语义 tag 因此显示为「无 class」，但它们确实有样式，
   见 §5。
5. 本检查证明「有规则可命中」，不证明「渲染结果与基线逐像素一致」；后者由 `diff-html`
   与样式基准（`verify-css` / `compare-css-vars`）负责。

## 7. 复现

```bash
node scripts/check-tag-styles.mjs            # 期望退出码 0，覆盖 186/186，未命中 0
node scripts/check-tag-styles.mjs --strict   # 期望退出码 1：5 个「上游无规则」判失败（收紧用）
node scripts/check-tag-styles.mjs --verbose  # 逐 tag 打印精确命中的 class 清单
node scripts/check-tag-styles.mjs --json     # 末尾追加机器可读结果（生成本文表格用）
```

产物缺失时会直接报 `构建产物不存在`，不自动构建（避免占用 `.build.lock`）。
脚本只读 `dist` 与 `src/styles/upstream`，可用 `DIST_DIR` / `STYLE_ROOT` 覆盖路径。

## 8. 结论

- 42 个 tag 全部可在产物中定位并切出片段；class 覆盖率 186/186。
- 真·未命中 0；5 个白名单「上游无规则」与 4 处「无独立规则但父级/同元素有样式」的 class
  均已逐条对照上游模板与全树 grep 确认，不是我们的 class 写错。
- 未发现需要回报给 A 批次的 tag 输出 class 错误。
- 后续若上游补充 `.img-wrap`、`.audio`、`.anzhiyu-tag-link` 等规则，可把白名单条目删掉并用
  `--strict` 常驻；若我们改动 tag 模板的 class，本脚本会直接以未命中报错。
