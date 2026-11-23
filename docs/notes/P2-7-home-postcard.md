# P2-7 · 首页与分页 + PostCard（含 M1 代码块对齐）

任务：首页第 1 页、`/page/2/` 分页、PostCard 复刻、`index_post_content` 摘要、M1 代码块 DOM。

> 状态：**主体完成，M1 完成；`#home_top` 未完成（被「快速收尾」指令中断，数据层已就位，组件/插槽未落）**。
> 报告写完时的构建：`pnpm --filter blog build` 40 页全绿；`pnpm verify` 通过。
> 本文件不包含 git 操作；工作区未提交部分为 `examples/blog/package.json`、`pnpm-lock.yaml`、
> `components/post/post-list.ts` 的 M1 依赖与 home_top 数据层改动。

---

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| 首页第 1 页 `/` | `#recent-posts` 子树结构**零缺口**（改动前 41 条差异/273 节点权重 → 现在 4 条纯文本差异/0 权重） |
| `/page/2/` | 改动前**没有这个路由**；现在 `#recent-posts` 子树 **0 条差异**（整页 47 条全部属于他人 scope，见 §7） |
| PostCard | 逐项复刻 `post-ui.pug`，见 §2 对照表 |
| 分页 | 复刻 `hexo-pagination` + `paginator` helper，`per_page: 6`，见 §3 |
| 摘要 `index_post_content` | method 3（自动摘要 500 字）逐篇对拍：9 张卡片里 5 张**逐字符一致**，4 张差在 Phase 6 未移植的 Hexo tag，见 §4 |
| M1 代码块 | **完成**：`figure.highlight` + hljs 类名，与 baseline 代码块子树 diff **PASS（0/0/0，255/255 节点）**，依赖 `highlight.js@^11.12.0` 已装，见 §5 |
| `#categoryBar` | 完成（分类导航条 32 节点 + 8 个分类项，name 码点升序） |
| `#home_top` | **未完成**：上游 92 节点（bannerGroup 24 + topGroup 67 + link 1）。数据层已写好，组件与 BaseLayout named slot 未落，见 §8 |
| build / verify | 40 页全绿；verify CSS PASS（字节 -0.03%、gzip -0.84%），见 §6 |

改动文件（相对仓库根）：

| 文件 | 说明 |
| --- | --- |
| `examples/blog/src/pages/index.astro` | 重写：第 1 页 = `CategoryBar` + `PostCard`×6 + `Pagination` |
| `examples/blog/src/pages/[...page].astro` | 新增：`/page/2/`（rest 参数 `page/2`），同一套组件 |
| `packages/astro-theme-anzhiyu/src/components/post/PostCard.astro` | 新增：`+postUI` 卡片 |
| `packages/astro-theme-anzhiyu/src/components/post/Pagination.astro` | 新增：`pagination.pug` + `paginator()` |
| `packages/astro-theme-anzhiyu/src/components/post/CategoryBar.astro` | 新增：`categoryGroup.pug` |
| `packages/astro-theme-anzhiyu/src/components/post/post-list.ts` | 新增：Hexo `index_generator` 排序/切页/摘要/标签分类顺序语义 |
| `examples/blog/astro.config.mjs` | M1：`syntaxHighlight: false` + 自定义处理器 + `figure.highlight` rehype 插件 |
| `examples/blog/package.json`、`pnpm-lock.yaml` | `highlight.js@^11.12.0`（devDependency，组长已批准） |

未触碰：`src/components/layout/`、`src/utils/`、`src/i18n/`、归档/分类/标签/404 页面、根 `scripts/`、
`src/layouts/`（BaseLayout 的 `#home_top` 插槽本次**没有**改，见 §8）。

---

## 1. 数据层：`post-list.ts` 把「Hexo 生成器语义」收在一处

两个首页页面共用同一份语义，避免排序/切页/摘要各写一遍：

| 上游 | 这里 |
| --- | --- |
| `hexo-generator-index`：`locals.posts.sort(order_by)` → `posts.data.sort((a,b) => (b.sticky||0)-(a.sticky||0))` | `preparePosts()`：sticky 降序 → date 降序 → path 码点升序（同日期兜底，`.baseline-work/scripts/reproducible.js` 的口径） |
| `index_generator.per_page: 6` | `INDEX_PER_PAGE = 6` + `paginatePosts()`（第 1 页 = `posts[0..6)`） |
| `article.path` / `url_for(article.path)` | `PreparedPost.path`（`2025/02/02/sticky-top/`，无前导斜杠）/ `.href`（`/2025/02/02/sticky-top/`） |
| `article.categories.data` / `article.tags.data` 顺序 | name 码点升序（`reproducible.js` 固定），见 §2.2 |
| `date()` / `full_date()` / `date_xml()` | `PreparedPost.date/updated` 的 `display/full/xml` 三件套（`utils/date.ts`，站点时区 `Asia/Shanghai`） |
| `index_post_content` | `buildExcerpt()`，见 §4 |
| `random_cover.js` | `resolveCover()`：`cover:false` → false；缺省 → `cover.default_cover`（基准为空 → false） |
| `sort_attr_post("top_group_list")` | `selectTopGroupPosts()`（home_top 用，本次未接线，见 §8） |
| `post_lazyload.js` | `resolveImageLazyload()`（组件直接输出改写后的最终 img 属性） |
| `catalog_list("categories")` | `collectCategoryBarItems()` |

常量来源：`per_page / timezone / date_format / time_format` 都是 **Hexo 站点级 `_config.yml`** 的值
（基准站 `index_generator.per_page: 6`、`timezone: Asia/Shanghai`），不是主题配置——
`theme.config.yml` 里出现的 `per_page` 全属于 algolia/mathjax 子配置。Phase 7 站点配置层落地前
先以常量固定在 `post-list.ts`，页面只消费。

---

## 2. 必答 1：PostCard 结构与上游 `post-ui.pug` 的对应关系

### 2.1 DOM / class 对照（全部真实出现在产物里）

| 上游 `post-ui.pug` | 产物（`PostCard.astro`） | 条件 |
| --- | --- | --- |
| `div.recent-post-item` | 同；`index === 0` 追加 `lastestpost-item` | 恒 |
| `div.post_cover.left|right` | 同；`cover.position: both` 按下标左右交替 | `cover` 是字符串 && `cover.index_enable` |
| `a[href][title][style="display: flex;height: 100%;"]` | 同 | 同上 |
| `img.post_bg` | 同，含 lazyload 改写：`src=<placeholder>` + `onerror="this.onerror=null,this.src=\"/img/404.jpg\""` + `data-lazy-src=<cover>` + `style="pointer-events: none"` | 同上 |
| `div.recent-post-info` + `no-cover` | 同；`no-cover` = `cover === false \|\| !index_enable` | 恒 |
| `div.recent-post-info-top` | 同 | 恒 |
| `div.recent-post-info-top-tips` | 同 | 恒 |
| `span.article-meta.sticky-warp > i.anzhiyufont.anzhiyu-icon-thumbtack.sticky + span.sticky` | 同，文案 `置顶` | `isHome && (top \|\| sticky > 0)` |
| `div.article-categories-original` × N | 同 | `post_meta.page.categories && categories.length` |
| `span.newPost` | 同，文案 `最新` | `is_current('/') && maxDate === article.date`（`showNew && post.isNewest`） |
| `a.unvisited-post` | 同，文案 `未读` | 恒 |
| `a.article-title` | 同 | 恒 |
| `div.article-meta-wrap` | 同 | 恒 |
| `span.post-meta-date` + `i` + `span.article-meta-label` + `time` + `time.time_hidden` | 同；`date_type: created/updated` 单值分支；`both` 分支也实现（含 `.post-meta-date-created/.post-meta-date-updated/span.article-meta-separator`） | `post_meta.page.date_type` |
| `span.article-meta.tags > a.article-meta__tags[event.cancelbubble] > span > i + 名称` | 同；`event.cancelbubble` 布尔属性用 Astro 属性名直接输出（实测产物含 `event.cancelbubble`） | `post_meta.page.tags && tags.length` |
| `div.content` | 同，`set:html` 输出摘要 | `index_post_content.method !== false` |
| 评论数块 `span.article-meta > .article-meta-label 条评论` | **不输出** | `comments.card_post_count: false`（上游基准配置也是 false；评论系统属 P4/P5） |
| `.recent-post-item.ads-wrap` | **不输出** | `theme.ad.index` 在基准配置里不存在 |

上游未被本基准配置触达、本次未实现的分支：`ad` 广告位、评论数块（见上）。
`date_type` 三态全部实现（虽然基准只用 `created`）。

### 2.2 分类 / 标签顺序（容易踩的坑）

- **顺序**：Hexo 展示顺序由 `reproducible.js` 固定为 **name 码点升序**，不是 frontmatter 顺序。
  例：longform `tags: [Hexo, Astro, 迁移, 长文]` → 页面顺序 `Astro, Hexo, 迁移, 长文`；
  multi-taxonomy `categories: [[前端, Astro], 工程实践]` → `Astro, 前端, 工程实践`。
  证据：`.baseline-work/db.json` 的 Category/Tag 模型顺序 + 基线 HTML。
- **分类嵌套语义**（Hexo `Post.setCategories`）：**只要有一项是数组**，每一项各自是一条链；
  **全是字符串时整个数组是一条链**。所以 `categories: [前端, Hexo]` 会生成 `前端` 与
  `前端/Hexo` 两个节点（`Hexo` 是 `前端` 的子分类），而不是两个顶层分类——
  baseline 的 `#categoryBar` 里出现 `/categories/前端/Hexo/` 就是这个原因。
- 卡片上的分类只渲染 `.article-categories-original`（纯文本 div，无链接）；标签是 `a[href]`，
  `href = url_for('/tags/<slug>/')`，非 ASCII 走 percent-encode（`/tags/%E7%BD%AE%E9%A1%B6/`）。

### 2.3 产物片段（`dist/index.html`，视觉与 baseline 逐属性一致）

```html
<div class="recent-post-item lastestpost-item" onclick="pjax.loadUrl('/2025/02/02/sticky-top/')">
  <div class="post_cover left"><a href="/2025/02/02/sticky-top/" title="置顶与推荐位样本" style="display: flex;height: 100%;">
    <img class="post_bg" src="data:image/gif;base64,R0lGODlhAQAB…" onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;" data-lazy-src="/img/default_cover.jpg" alt="置顶与推荐位样本" style="pointer-events: none"></a></div>
  <div class="recent-post-info">
    <div class="recent-post-info-top"><div class="recent-post-info-top-tips">
      <span class="article-meta sticky-warp"><i class="anzhiyufont anzhiyu-icon-thumbtack sticky"></i><span class="sticky">置顶</span></span>
      <div class="article-categories-original">前端</div>
      <a class="unvisited-post" href="/2025/02/02/sticky-top/" title="置顶与推荐位样本">未读</a>
    </div><a class="article-title" href="/2025/02/02/sticky-top/" title="置顶与推荐位样本">置顶与推荐位样本</a></div>
    <div class="article-meta-wrap"><span class="post-meta-date">
      <i class="anzhiyufont anzhiyu-icon-calendar-days" style="font-size: 15px; display:none"></i>
      <span class="article-meta-label">发表于</span>
      <time datetime="2025-02-02T00:20:00.000Z" title="发表于 2025-02-02 08:20:00" time="2025-02-02 08:20:00">2025-02-02</time>
      <time class="time_hidden" datetime="2025-02-02T00:20:00.000Z" title="更新于 2025-02-02 08:20:00" time="2025-02-02 08:20:00">2025-02-02</time>
    </span><span class="article-meta tags"><a class="article-meta__tags" event.cancelbubble href="/tags/Hexo/" onclick="window.event.cancelBubble=true;">…</a></span></div>
    <div class="content">这篇文章同时打开了四个和「位置」有关的 frontmatter：…</div>
  </div>
</div>
```

lazyload 的细节值得一提：上游是全站 `after_render:html` 正则改写，**`onerror` 会出现两次**
（pug 原属性 + 过滤器插入的），diff 工具按「保留第一个重复属性」归一化。所以组件必须按 pug 的
属性书写顺序决定哪个 `onerror` 先出现：
- 卡片封面（pug 里 `src` 在 `onerror` 前）→ 存活的是**过滤器版**
  `this.onerror=null,this.src="/img/404.jpg"`（双引号）；
- home_top 的 `.post_bg`/`.todayCard-cover`（pug 里 `onerror` 在 `src` 前，或 todayCard 是 `src` 在前）
  → 需按各自的先后顺序单独处理（见 §8 待接线）。

---

## 3. 必答 2：分页怎么实现的、`per_page` 从哪来

### 3.1 路由模型

| URL | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | 第 1 页（`current = 1`），只取 `pages[0]` |
| `/page/2/` | `src/pages/[...page].astro` | rest 参数值即路径片段：`params.page = 'page/2'`；`getStaticPaths` 只产出 `2..total`，第 1 页故意留给 `index.astro`，避免两条路由抢 `/` |

```ts
// [...page].astro
export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection('posts')
  const { total } = paginatePosts(preparePosts(entries))
  return Array.from({ length: Math.max(total - 1, 0) }, (_, offset) => {
    const current = offset + 2
    return { params: { page: `page/${current}` }, props: { current } }
  })
}
```

### 3.2 per_page 来源

Hexo 站点级 `_config.yml`：

```yaml
per_page: 6
index_generator:
  path: ''
  per_page: 6
  order_by: -date
```

不是主题配置（`theme.config.yml` 里没有首页 per_page）。Phase 7 站点配置层落地前，固定为
`post-list.ts` 的 `INDEX_PER_PAGE = 6`，两个页面共用。9 篇 fixture → 2 页（6 + 3）。

### 3.3 `Pagination.astro`：`pagination.pug` + Hexo `paginator()` 逐行复刻

- 外层：`nav#pagination > div.pagination`；首页追加 `.toPageGroup`（`input#toPageText`+`a#toPageButton`）；
- 链接：`link(i) = url_for(i === 1 ? base : base + format.replace('%d', i))`，
  首页 `base=''`、`format='page/%d/#content-inner'` →
  第 2 页链接 `/page/2/#content-inner`，第 2 页的「上一页/第 1 页」链接是 `/`（无锚点，与基线一致）；
- 页码：`paginationPartShow()` 的 `end_size: 1`、`mid_size: 1`（pug 覆盖）、`space: '&hellip;'`、
  当前页 `span.page-number.current`、其余 `a.page-number`；
- prev/next：`a.extend.prev/.extend.next` + `rel`，「上页/下页」文案在上游是**硬编码**
  （不走 i18n），图标 `anzhiyu-icon-chevron-left/right` + `fa-fw`，style 原样。

产物（`dist/index.html`）：

```html
<nav id="pagination"><div class="pagination">
  <span class="page-number current">1</span>
  <a class="page-number" href="/page/2/#content-inner">2</a>
  <a class="extend next" rel="next" href="/page/2/#content-inner"><div class="pagination_tips_next">下页</div><i class="anzhiyufont anzhiyu-icon-chevron-right fa-fw" style="font-weight: inherit; font-size: 1rem;"></i></a>
  <div class="toPageGroup"><input id="toPageText" oninput="value=value.replace(/[^0-9]/g,'')" maxlength="3" onkeyup="this.value=this.value.replace(/[^u4e00-u9fa5w]/g,'')" aria-label="toPage"><a id="toPageButton" onclick="anzhiyu.toPage()"><i class="anzhiyufont anzhiyu-icon-angles-right" style="font-weight: inherit; font-size: 1rem;"></i></a></div>
</div></nav>
```

`/page/2/` 侧：`a.extend.prev[rel=prev][href="/"]` + `a.page-number[href="/"]` + `span.current 2`，
无 next（最后一页）。两页的分页条在 diff 里 **0 条差异**。

---

## 4. 必答 3（摘要）：`index_post_content` 与「9 张卡片对拍」

基准配置 `index_post_content: { method: 3, length: 500 }` → `strip_html(article.content)` 截前 500 字，
超长补 `' ...'`（method 1=description、2=both、false=不输出 的分支也都实现了）。

关键细节：`article.content` 是 **hexo-renderer-marked** 的产物，它覆写了 marked 的 `heading`
渲染器并且**没有补尾随换行**（baseline 文章页里是 `<h2 …>…</h2><p>`）。Astro 的 remark-rehype
在块级元素之间会插 `\n`，标题后多出的换行会让「按字符数截断」整体错位 1 个字符。所以
`buildExcerpt()` 先做 `html.replace(/(<\/h[1-6]>)\n/g, '$1')` 再 `stripHtml()`，然后截断。

对拍结果（把 baseline 首页/第 2 页卡片的 `.content` 归一化文本与我们的产物逐字符比较）：

| 卡片 | 文章 | 结果 |
| --- | --- | --- |
| p1-1 | sticky-top | ✅ 逐字符一致 |
| p1-2 | tags-thirdparty | ❌ Phase 6（未移植 tag，摘要里是 `{% bilibili … %}` 原文） |
| p1-3 | tags-media | ❌ 同上 |
| p1-4 | tags-block | ❌ 同上 |
| p1-5 | tags-inline | ❌ 同上 |
| p1-6 | cover-variants | ✅ 逐字符一致 |
| p2-1 | multi-taxonomy | ✅ 逐字符一致（含「分类的层级Hexo 里…」这种标题后无换行的拼接） |
| p2-2 | short-note | ✅ 逐字符一致 |
| p2-3 | longform | ✅ 逐字符一致（500 字截断点一致） |

→ `/page/2/` 的 `.content` 差异 **0 条**；首页剩 4 条文本差异，全部是 Phase 6 tag 未移植。

---

## 5. 必答 4（M1）：代码块做了什么改动 + 一致性证据

### 5.1 上游链路（为什么必须换掉 Shiki）

1. `hexo/dist/plugins/filter/before_post_render/backtick_code_block.js`：Markdown 渲染**前**把围栏换成
   `<hexoPostRenderCodeBlock>` + 高亮产物；
2. hexo-util `highlight()`（`syntax_highlighter: highlight.js`、`highlight: {line_number: true, wrap: true, hljs: false}`）：
   `hljs.configure({ classPrefix: '' })`、`ignoreIllegals: true`，再逐行闭合/重开 token span（`closeTags()`），输出

   ```html
   <figure class="highlight js"><table><tr>
     <td class="gutter"><pre><span class="line">1</span><br>…</pre></td>
     <td class="code"><pre><span class="line"><span class="comment">// …</span></span><br>…</pre></td>
   </tr></table></figure>
   ```
3. `source/css/_highlight/*.styl` 全部按 `figure.highlight` + hljs 类名写选择器；Shiki 的
   `<pre class="astro-code">` + 内联 style 永远对不上（结构与类名都不同），也没有任何 Shiki 主题配置
   能输出 hljs 类名。

### 5.2 改动（`examples/blog/astro.config.mjs`，本次只改 markdown 段 + 文件头插件块）

```js
// 关掉 Shiki；结构由自写 rehype 插件在字符串化前重建
markdown: {
  processor: hexoMarkdownProcessor,  // 自定义处理器（见下）
}
```

- `markdown.syntaxHighlight: false` → remark-rehype 产出 `<pre><code class="language-x">`；
- 自定义处理器 `hexoMarkdownProcessor.createRenderer(shared)` 内部 `createMarkdownProcessor({
  smartypants: false, syntaxHighlight: false, rehypePlugins: [rehypeHexoHighlight] })`，
  **只在 render() 外面套一层 `unwrapFigureTbody()`**；
- `rehypeHexoHighlight`：`<pre><code>` → `figure.highlight` + `table/tr/td.gutter/td.code/pre/span.line/br`，
  行内容用 highlight.js（`classPrefix:''`、`ignoreIllegals:true`）+ 与 `closeTags()` 等价的逐行闭合/重开；
  有 `strip-indent` 等价实现、`hexo 的 content 去一个行尾换行`语义；
- 为什么要自定义处理器：Astro 的 `unified()` helper 只能把 rehype 插件插在 **rehype-raw 之前**，
  而 rehype-raw（Astro 固定的最后一步）会让 parse5 把 `<table><tr>` 补成 `<table><tbody><tr>`，
  但上游 `figure.highlight` **没有 tbody**。自定义处理器给了「rehype-raw 之后」的字符串时机，
  `unwrapFigureTbody()` 只摘 `<figure class="highlight…"><table>` 里的那一层 tbody
  （Markdown 表格的 tbody 是上游 marked 也有的，不动）。
- Phase 6 的 42 个 tag 插件请挂进 `hexoMarkdownProcessor` 的 `remarkPlugins`（已留注释）；
  顶层 `markdown.remarkPlugins` 对自定义处理器不生效（Astro 会警告并忽略）。

依赖：`highlight.js@^11.12.0`（`examples/blog` devDependency）。上游 hexo-util 3.3.0 依赖
`highlight.js ^11.6.0`；基准产物由 11.12.0 生成，类名形如 `title function_`/`title class_`/`punctuation`。
`pnpm-lock.yaml` 的 diff 只有 highlight.js 三处（importer / packages / snapshots），无其它包变化。

### 5.3 一致性证据（产物 vs baseline）

用 `diff-html.mjs` 直接比「baseline 长文文章页里的 3 个 `<figure class="highlight">`」与
「我们渲染出的同一份 markdown 的 3 个 figure」（从 `dist/debug-collection` 的渲染探针抽取）：

```
M1 figures: status PASS diffCount 0 missing 0 unexpected 0 nodes 255/255
```

即 3 个代码块（js / bash / json）的 **figure 子树逐节点、逐属性、逐文本一致**，包括
`title function_`、`params`、`title class_`、`property`、`punctuation`、`attr`、`string` 等 token 类名，
以及 `figure.highlight js|bash|json`、`td.gutter`、`span.line`、`br` 的层级。
（源串里 `<`/`>`/`{`/`}`/`"` 的实体写法不同——上游 `escapeSwigTag` 把 `{}` 转成 `&#123;/&#125;`、
hljs 把 `"` 转成 `&quot;`——但 diff 工具按解码后文本比较，归一化后完全相等。）

降级路径（未装 highlight.js 时）也验证过：结构节点一致、只少 token span——
baseline 255 vs 降级 130 节点、128 个 missing、bash 块字节完全一致（365B=365B）。
现在依赖已装，主路径生效，构建不会走降级；如依赖被移除只会打一条 `[hexo-highlight]` 警告而不会编译失败。

### 5.4 保留的既有配置（未被本次改动影响）

- `processor` 里仍传 `smartypants: false`（同一生效路径，`hexo-renderer-marked` 的默认）；
- `vite.build.cssMinify: false`、`vite.css.preprocessorOptions.stylus['include css']`、
  `stylusHexoConfig` 插件配置**一行未动**；
- 证据：`pnpm verify` 的 CSS 字节数与改前同值（682990 B / 78457 B gzip），见 §6。

---

## 6. 必答 5：build / verify 输出

```powershell
$ pnpm --filter blog build
20:26:14 ✓ Completed in 3.16s.Build
20:26:14 [build] ✓ Completed in 3.16s
20:26:14 [build] 40 page(s) built in 5.07s
20:26:14 [build] Complete!
```

```powershell
$ pnpm verify
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\upstream.DeEHpLXK.css
[verify-css] PASS 字节数: 实际 682990 / baseline 683218（-0.03%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78457 / baseline 79124（-0.84%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）
[verify-css] 比对通过
```

（40 页含并行任务产出的归档/分类/标签/404；`dist` 里还没有文章页 `/2025/…`，P2-8 尚未产出。）

---

## 7. 必答 6：diff 前后数字与遗留差异归类

命令：

```powershell
node scripts/diff-html.mjs .baseline-html/index.html examples/blog/dist/index.html --json
node scripts/diff-html.mjs .baseline-html/page/2/index.html examples/blog/dist/page/2/index.html --json
```

| 页面 | 改动前（P2-7 前纯基线产物，19:50 快照） | 改动后（本次，20:26 快照） |
| --- | --- | --- |
| `/` | FAIL，diffCount **103**，missingNodes **857**，unexpectedNodes **60**，baseline/dist 节点 1070/**273** | FAIL，diffCount **54**，missingNodes **480**，unexpectedNodes **5**，节点 1070/**595** |
| `/page/2/` | **路由不存在**（dist 无此文件，无法比对） | FAIL，diffCount **47**，missingNodes **388**，unexpectedNodes **5**，节点 900/**517** |

> 注意：改动后 dist 里同时并入了并行任务的 Header/Footer/Sidebar/Rightside 真实组件，
> 所以整页数字的改善不能全算 P2-7。**P2-7 的净效果看 `#recent-posts` 子树**：

| 子树 `#recent-posts`（分类条 + 6 张卡片 + 分页） | 改动前 | 改动后 |
| --- | --- | --- |
| `/` | 41 条差异（categoryBar 缺 32 节点、pagination 缺 14 节点、卡片内部缺 cover/sticky/date/tags、3 张多渲染的卡片）**权重合计 273** | **4 条**，全部 `文本`，权重合计 **0** |
| `/page/2/` | — | **0 条** |

### 剩余 54 条（首页）归属拆分

| 归属 | 条数 | 典型内容 |
| --- | --- | --- |
| head（P2-3 / P4-1 / P4-2 / Astro 路由模型） | 13 | `og:url` `/index.html` vs `/`；`/css/index.css` vs `/_astro/*.css`；GLOBAL_CONFIG/`config-diff`/`saveToLocal` 三段脚本；`noscript` 注入位置；fancybox/snackbar CSS；Hexo generator meta |
| `additional-js` 挂载点（P4-1/P4-2） | 24 | `div[10]` 内 18 个脚本 + `canvas#universe` + `js-pjax` 块 + body 的 pace/progress_bar 资源 |
| header `#console`（P4-6） | 1（180 节点） | 中控台面板 |
| `#home_top`（**P2-7 未完成**，见 §8） | 3（92 节点） | `#bannerGroup` 24 + `.topGroup` 67 + banner css `<link>` 1 |
| `#recent-posts`（**P2-7 剩 4 条**，Phase 6） | 4 | 4 张 tag-* 卡片的 `.content` 文本（tag 未移植） |
| `#aside-content`（P3-1） | 3（166 节点） | 三张 widget 卡片 |
| footer（P2-4 并行 WIP 残留） | 2 | 外链 `target/rel` |
| sidebar（P2-5 并行 WIP 残留） | 4 | 外链 `target/rel` |

`/page/2/` 的 47 条 = 上表去掉 `#home_top` 与 `#recent-posts`（13+24+1+3+2+4=47），
即该页 P2-7 子树**全对**。

---

## 8. 未完成 / 阻塞点（按「快速收尾」指令记录，未回退）

### 8.1 `#home_top`（P2-7 剩余主体，未完成）

组长已确认 `#home_top` 归 P2-7 并授予 BaseLayout 临时写权限，实现方案（named slot）已定，
但收尾指令要求停止扩展，**组件/插槽/接线三者都未落**：

- 现状：`dist/index.html` 的 `#home_top` 里只有占位
  `<div class="swiper_container_card" style="height:auto;width:100%"></div>`，
  基线有 92 个节点的真实内容；
- **已就位的数据层**（本次已写进 `post-list.ts`，构建通过，暂未被引用）：
  - `PreparedPost` 新增 `path`（Hexo `article.path`，无前导斜杠）、`swiperIndex`、`topGroupIndex`；
  - `selectTopGroupPosts(posts, swiperEnable)`：复刻 `sort_attr_post("top_group_list")`，
    包含「按 date 降序补足到 6 个」的语义（基准结果：sticky-top, tags-thirdparty, tags-media,
    tags-block, tags-inline, cover-variants，与基线顺序一致）；
  - `resolveImageLazyload()`：统一解析 lazyload 配置（PostCard 目前仍内联同一份逻辑，可后续合并）；
- **待做**：
  1. `packages/astro-theme-anzhiyu/src/components/post/HomeTop.astro`：复刻 `top/top.pug`
     （`#home_top > .swiper_container_card[style] > #bannerGroup > #random-banner(canvas#peoplecanvas + a#random-hover)
     + .categoryGroup(3× categoryItem/categoryButton/categoryButtonText/icon) + .topGroup(6× recent-post-item
     + a#todayCard + `<link rel="stylesheet">`)`）；文案/图标/链接全部来自 `theme.home_top` 默认值
     （已核对与 `theme.config.yml` 一致）；`swiper.enable: true` 分支（blog-slider）本次不做（基准不可达）；
  2. `BaseLayout.astro`：把 `#home_top` 占位 div 换成 `<slot name="home_top" />`（本次**未改**）；
  3. `index.astro`：`<Fragment slot="home_top"><HomeTop posts={posts} /></Fragment>`；
  4. 细节坑（已确认）：topGroup 的 `onclick` 用**双引号** `pjax.loadUrl("/…")`；`a[href]` 用
     **不带前导斜杠的相对路径**（`item.path`）；`.post_bg` 的 `alt` 是字面量 `cover`；
     lazyload 后存活的 `onerror` 是 pug 原版（单引号、分号），todayCard 封面存活的则是过滤器版
     （双引号、逗号）；`banner.top_group_banner_css` 未配置 → 输出无 `href` 的 `<link rel="stylesheet">`；
     `peoplecanvas.enable:false` 的 else 分支是 `.banners-title`（`site.data.creativity` 不存在，
     tags-group-all 输出为空）。

### 8.2 其它已知限制

1. **Phase 6 tag 未移植**：4 张 tag-* 卡片摘要仍是 `{% … %}` 原文，是首页 `#recent-posts` 最后 4 条差异。
2. **站点配置层缺失**：`site` 常量在 `index.astro` / `[...page].astro` 各一份，
   `per_page/timezone/date_format` 固定在 `post-list.ts`；Phase 7 落地 `_config.yml` 后收敛。
3. **摘要对拍的隐含依赖**：remark-rehype 的块间换行恰好与 marked 一致（标题除外），
   所以用了「标题后换行剔除 + stripHtml」；若后续换渲染器/改 markdown 插件，需要重跑 §4 的 9 卡片对拍。
4. 分页只被 2 页 fixture 覆盖；`mid_size/space` 的中间页与省略号分支未由 baseline 实际触发（算法按上游源码复刻）。
5. `slugize()` 是 hexo-util 的近似实现：NFKD 去变音 + 特殊字符替换，缺上游 `escape_diacritic`
   的大表（`Æ/Ø/Ł/ß` 类）；fixture 的标签/分类名全部逐字一致。完整移植可并入 M3。
6. `resolveImageLazyload()` 与 PostCard 内联的 lazyload 逻辑重复（收尾时未合并）。
7. M1 的 `remarkPlugins` 入口在自定义处理器内：Phase 6 若沿用 Astro 顶层 `markdown.remarkPlugins`
   会被 Astro 警告并忽略，需挂进 `hexoMarkdownProcessor`（config 里已注释）。

---

## 9. 最后一段（判定）

**首页与分页在结构上已经对上上游了（P2-7 自己的子树 `#recent-posts`：首页 41→4 条、且缺口节点 273→0；
`/page/2/` 47 条里 0 条属于它）**，差的只有两块：`#home_top` 那 92 个节点还没接（数据层已就位，
组件/slot/接线是纯增量工作），以及 4 张 tag-* 卡片摘要要等 Phase 6 的 Hexo tag 插件——它们不是
P2-7 的模板问题。M1 已经真正做到「figure.highlight + hljs 类名」，用 baseline 长文的 3 个代码块
逐节点对拍 PASS（255/255 节点、0 差异），highlight.js 依赖也已按批准落进 `examples/blog`
（lockfile 只有预期三处变更）。整页 54/480 的剩余差异里，P2-7 只占 4 条文本 + 92 个待做节点，
其余全部是 head/脚本资源、中控台、widget 与两个并行组件任务的 WIP。
