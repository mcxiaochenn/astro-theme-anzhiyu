# P6-2 · remark-hexo-tag 第二块：媒体/卡片 + 第三方嵌入 18 个 tag

> 承接 `P6-1-hexo-tags.md`。本批把附录 B 剩余的 18 个 tag 全部实现，删掉插件里的
> `PENDING_*` 透传表；至此 42 个 tag 全部落地。
>
> 结论：**18 个 tag 全部实现；单测 59/59 通过；4 篇 fixture 正文文本与基准一致
> （media 有一处上游 escape 缺陷按白名单处理）；清内容缓存后构建 61 页；
> tags-media / tags-thirdparty 两页 `{%` 计数均为 0；真实文章页正文结构 diff
> 只有 tags-media 的 4 条上游缺陷差异，tags-thirdparty 为 0。**

## 1. 实现清单

| 组 | tag | 上游文件 | 关键语义 |
| --- | --- | --- | --- |
| 媒体（11） | `image` | `image.js` | `split(', ')`；`alt=` / `width=` / `height=` / `bg=`；有 alt 才输出 caption |
| | `inlineimage` | `image.js` | `height=` 可选，默认 `height:1.5em`；输出 `no-lazy` |
| | `audio` | `media.js` | `args[0].trim()`，`<source type='audio/mp3'>` |
| | `video` | `media.js` | 同上，`video/mp4` |
| | `videos` | `media.js` | 容器；`class` + `col`；**正文不跑 Markdown** |
| | `gallery` | `gallery.js` | 两种参数形态（`url` / 图片列表）；JSON 数据进 `<span class="gallery-data">`；i18n `加载更多` |
| | `galleryGroup` | `gallery.js` | 4 个位置参数，`url_for` |
| | `site` | `site.js` | `split(', ')`；`url=` / `screenshot=` / `avatar=` / `description=` |
| | `sitegroup` | `site.js` | 容器；标题走 `${args}`（数组 toString）；**正文不跑 Markdown** |
| | `btns` | `btns.js` | 容器；`class` 由 args 空格拼接；**正文不跑 Markdown** |
| | `cell` | `btns.js` | 图标判定用**未 trim** 的第三参是否含 `' anzhiyufont'` |
| 第三方（7） | `bilibili` | `bilibili.js` | BV 号提取、API 默认 `https://api.320.ink/api/b`；客户端脚本里 `${data.*}` 保持字面量 |
| | `dogeplayer` | `dogeplayer.js` | `player_<vcode>` 容器 + 两段 script |
| | `mermaid` | `mermaid.js` | 正文 `escapeHTML` 后进 `<pre class="mermaid-src" hidden>`，不跑 Markdown |
| | `link` | `link.js` | 站内/站外分支、主题 favicon、`data-icon`、`onerror` 兜底 |
| | `flink` | `flink.js` | 正文是 YAML；`anzhiyu` / `flexcard` 两种卡片布局 |
| | `tip` | `tip.js` | 正文走 Markdown；无参数时 `class="tip "` |
| | `intCard` | `Introduction-card.js` | 7 个位置参数；无底部信息时 `height: 416px` |

实现上新增/调整了三个能力：

1. **`ctx.raw()`**：只展开 tag、不解析 Markdown，供 `videos` / `sitegroup` / `btns`
   还原上游「直接拼 content」的行为；
2. **「字符串块级」tag**（`site` / `cell` / `bilibili` / `intCard`）：它们上游虽注册为
   自闭合，但输出以 `<a>` 或 4 空格缩进的 `<div>` 开头。留在段落里会被 remark 包
   `<p>` 或当成代码块；标记成 `ends: false, string: true` 后由插件直接产出 html 节点；
3. **`parseArgs` 修正**：`key=value` 现在既进 `kwargs`、也原样保留在 `args` 里。
   上游 tag 是遍历 `args` 取 `alt=` / `url=` 的，之前把它们移出 `args` 会让
   `image` / `site` 全空。

`flink` 的 YAML 用工作区已安装的 `yaml`（`node-linker=hoisted`，
`vite-plugin-stylus-hexo-config` 的依赖），**没有新增依赖**。

## 2. 验收命令与输出

### 2.1 单测

```bash
$ node packages/remark-hexo-tag/test/run.mjs
remark-hexo-tag: 59/59 通过
```

新增 21 条用例（18 个 tag 全覆盖，`image` / `inlineimage` / `tip` / `link` 各多一条
分支），含 `bilibili` 客户端脚本的关键片段断言、`flink` 的两种布局、`link` 的站内/站外。

### 2.2 4 篇 fixture 正文对拍（真实 astro.config processor）

```bash
$ node packages/remark-hexo-tag/test/render-fixtures.mjs
== tags-inline ==        `{%` 残留 0，正文文本一致
== tags-block ==         `{%` 残留 0，正文文本一致
== tags-media ==         `{%` 残留 0，正文文本一致（忽略块级边界空白）
== tags-thirdparty ==    `{%` 残留 0，正文文本一致
render-fixtures: 全部一致
```

`tags-media` 的 10 字符差异全部来自下面 §3 的上游 escape 缺陷：脚本把
`## videos` / `## sitegroup` 还原成正常标题文本后再比较（空白不敏感）。

### 2.3 构建

```bash
$ while ! mkdir .build.lock 2>/dev/null; do sleep 3; done
$ rm -rf examples/blog/node_modules/.astro          # 必须清内容缓存
$ pnpm --filter blog build
[build] 61 page(s) built in 2m 23s
[build] Complete!
```

页数 61（P6-1 时 40 页，随后 post-page 合入文章详情路由后增加），未减少。
构建日志无 `Unknown Hexo tag`、无插件 warning。

产物读数：

```text
dist/2025/04/01/tags-media/index.html          {% = 0
dist/2025/04/20/tags-thirdparty/index.html     {% = 0
dist/2025/03/05/tags-inline/index.html         {% = 0
dist/2025/03/18/tags-block/index.html          {% = 0
dist/index.html                                {% = 0
```

### 2.4 真实文章页正文结构 diff

用 `.baseline-html` 与 dist 的 `<article class="post-content">` 正文（去掉站点头部）
比对：

```text
tags-media:      4 条差异（结构 4），缺 2 节点，多 6 节点
tags-thirdparty: 0 条差异
```

tags-media 的 4 条全部是 §3 的上游 escape 缺陷（`## videos` / `## sitegroup` 一处
字面量 → 两个节点差异，共 4 条）。**没有任何一条来自 tag 输出 DOM。**

对比之下，P6-1 时片段级 diff 里的 headerlink / lazyload / 外部链接 target-rel /
标题 slug 差异，已由 post-page 等任务在真实页面管线里补齐；本批媒体页因此只剩上
述上游缺陷。

## 3. 上游 escape 缺陷（白名单，不复刻）

`hexo/dist/hexo/post.js` 的 `PostRenderEscape.escapeAllSwigTags`：

```js
if (swig_tag_name !== '' && str.includes(`end${swig_tag_name}`)) {
  state = STATE_SWIG_FULL_TAG
}
```

它用**子串包含**判断「这个 tag 是不是容器」。于是：

- `{% video %}` → `str.includes('endvideo')` 命中 `{% endvideos %}`；
- `{% site %}` → `str.includes('endsite')` 命中 `{% endsitegroup %}`。

Hexo 会把从 `{% video %}` 到 `{% endvideos %}`（含中间的 `## videos`）整段当成一个
Nunjucks 占位块：Markdown 先跑完，标题就变成字面量 `## videos`；`## sitegroup` 同理。
这是上游的 bug（生成的页面就是坏标题），本插件正常渲染成 `<h2>`。

验收时把基准文本里的这两处 `## x` 归一成 `x` 再比较，结构 diff 保留为白名单缺口。
证据与处理位置：`test/render-fixtures.mjs` 的 `KNOWN_BASELINE_DELTAS`。

## 4. 未覆盖 / 归属其它任务

- **`post_lazyload.js` 滤镜**：`image` / `site` / `flink` / `intCard` / `link` /
  `bilibili` 内 `<img>` 的占位 `src`、`data-lazy-src`、`onerror` 由该滤镜统一加，
  不在 tag 模板里。片段级 diff 里这类属性差异全部归此，真实页面管线已由其它任务
  补齐，故 2.4 不再出现。
- **Hexo core `after_post_render/external_link`**：`site` / `cell` / `bilibili` 的
  `<a>` 在真实产物里多出 `target="_blank" rel="noopener"`，来自 Hexo 核心滤镜
  （`external_link.enable: true`），同样不是 tag 输出；真实页面已对齐。
- **标题锚点 / slug**：属于文章页任务。

## 5. 改动文件

- `packages/remark-hexo-tag/src/tags/media/index.mjs`：11 个 tag
- `packages/remark-hexo-tag/src/tags/thirdparty/index.mjs`：7 个 tag
- `packages/remark-hexo-tag/src/index.mjs`：删除 PENDING 表；新增 `lookupBlock` /
  `blockContext` / `string` 块级支持 / `ctx.raw()`
- `packages/remark-hexo-tag/src/parser.mjs`：`key=value` 保留在 `args`
- `packages/remark-hexo-tag/src/runtime.mjs`：`escapeHtml`
- `packages/remark-hexo-tag/test/run.mjs`：+21 条用例（59 总）
- `packages/remark-hexo-tag/test/render-fixtures.mjs`：扩到 4 篇 + 上游缺陷白名单
- `packages/remark-hexo-tag/README.md`：42 tag 清单、选项、限制
- `examples/blog/astro.config.mjs`：**未改**（新增默认值都对齐基准，无需传选项）
