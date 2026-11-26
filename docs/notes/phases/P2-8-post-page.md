# P2-8 · 文章页（PostInfo / 版权 / 打赏 / ptool / 上下篇 / 相关推荐 + M3 slugger）

任务：`src/pages/[year]/[month]/[day]/[slug].astro`，复刻上游
`layout/post.pug` 及其 include；M3 标题 slugger 与 headerlink。

> 状态：**完成**。49 页构建通过；长文文章页的 **header（`#post-info`）与 `#post` 子树
> 结构差异为 0**，正文只剩脚注（P2-1 已记录的「有意升级」）；剩余 50 条 diff 全部属于
> head / aside / 脚本资源 / console / footer-sidebar 等其它 scope（逐条归类见 §4）。

---

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| 构建 | `49 page(s) built`（原 40 页 + 9 篇文章） |
| M3 slugger | `check-slugger.mjs` **PASS 49 / FAIL 0**；9 篇文章共 41 个标题 id 与基线逐条一致 |
| 长文页 h1–h6 id | 正文 9 个标题 **9/9 完全一致**；dist 多一个 `h2#footnote-label`（GFM 脚注区块，见 §4） |
| 长文页 diff | 50 条，`missingNodes 223 / unexpectedNodes 18`；其中 **文章区（`#post-info` + `#post`）5 条，全部是脚注**，header/版权/工具条/分页/相关推荐 **0 条** |
| 其它 9 篇 | multi-taxonomy / sticky-top / cover-variants / tags-block **文章区 0 条**；short-note 只有 `#post-info` 缺失（Header 的 top_img 判定，P2-4）；其余为 Phase 6 未移植 tag |

改动文件（相对仓库根）：

| 文件 | 说明 |
| --- | --- |
| `src/utils/slugger.ts` | 新增：hexo-util `slugize()` + marked heading（id / 重复后缀 / headerlink） |
| `scripts/check-slugger.mjs` | 新增：M3 自检，硬编码 9 篇基线 id 作 oracle + 活体对拍 |
| `packages/astro-theme-anzhiyu/package.json` | 新增 `check:slugger` 脚本 |
| `src/components/post/post-page.ts` | 新增：文章页数据层（abbrlink、上下篇、相关推荐、TOC、lazyload/外链） |
| `src/components/post/PostInfo.astro` | 新增：`post-info.pug` + 波浪 + `#post-top-cover` |
| `src/components/post/PostContent.astro` | 新增：`article#article-container` |
| `src/components/post/PostCopyright.astro` | 新增：`post-copyright.pug`（含 `#post-tools` / `.post-tools-right`） |
| `src/components/post/PostPtool.astro` | 新增：`ptool.pug` |
| `src/components/post/PostReward.astro` | 新增：`reward.pug` |
| `src/components/post/ShareBox.astro` | 新增：share.js 分支 |
| `src/components/post/PostPagination.astro` | 新增：`pagination.pug` 文章分支 |
| `src/components/post/RelatedPosts.astro` | 新增：`related_posts()` 输出 |
| `src/components/post/PostAiDescription.astro` | 新增：`anzhiyu/ai-info.pug`（长文 `ai: true` 会命中，整棵缺失会污染 diff） |
| `src/pages/[year]/[month]/[day]/[slug].astro` | 新增：文章页路由 |

未改动：`BaseLayout.astro`、`AsideContent.astro`、`docs/plan/PLAN.md`、`HomeTop.astro`、`Header.astro`、
`post-list.ts`、`astro.config.mjs`。

---

## 1. M3 slugger：为什么不能直接用 Astro 的 github-slugger

上游 `hexo-renderer-marked/lib/renderer.js:26-60`：

```js
const anchorId = (str, transformOption) =>
  slugize(stripHTML(unescape(str)).trim(), { transform: transformOption });
...
let id = anchorId(text, this.options.modifyAnchors);   // 默认 modifyAnchors: 0
if (headingId[id]) id += `-${headingId[id]++}`; else headingId[id] = 1;
return `<h${level} id="${id}"><a href="#${id}" class="headerlink" title="${stripHTML(text)}"></a>${text}</h${level}>`;
```

`hexo-util/slugize.js` 只把 `[\s~\`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+` 换成分隔符，
**中文标点不在集合内**；`modifyAnchors: 0` 又表示不做大小写转换。因此：

| 基线标题 | 基线 id | github-slugger | 本实现 |
| --- | --- | --- | --- |
| 不能被「优化」的部分 | `不能被「优化」的部分` | `不能被优化的部分`（丢标点） | ✅ 一致 |
| p 与 span | `p-与-span` | `p-与-span` | ✅ |
| checkbox / radio | `checkbox-radio` | `checkbox--radio`（不折叠） | ✅ |
| galleryGroup | `galleryGroup` | `gallerygroup`（小写） | ✅ |
| intCard | `intCard` | `intcard` | ✅ |
| note 系列 | `note-系列` | `note-系列` | ✅ |

`rewriteHeadings()` 在文章页拿到 `entry.rendered.html` 后做三件事：按上面的规则重算 id、
补 `<a class="headerlink">`、抽出 `HeadingInfo[]`。幂等（重复调用不会叠加锚点），
并跳过 `#footnote-label`（脚注区块的 sr-only 标题，不进 TOC）。

### 自检（硬编码 oracle + 活体对拍）

```bash
cd packages/astro-theme-anzhiyu
node scripts/check-slugger.mjs
```

真实输出（末尾）：

```
[check-slugger] §D 基线 id oracle
[check-slugger] PASS 2024/11/01/longform-hexo-astro — 8 个标题
[check-slugger] PASS 2024/12/15/short-note — 0 个标题
...
[check-slugger] PASS 2025/04/20/tags-thirdparty — 7 个标题
[check-slugger] §E 活体对拍
[check-slugger] PASS 2024/11/01/longform-hexo-astro id 列表
...
[check-slugger] 活体对拍：9 页 / 41 个标题
[check-slugger] 汇总：PASS 49 / FAIL 0 / SKIP 0
```

`BASELINE_IDS`（9 篇 h2–h6 id 列表）写死在脚本里；`.baseline-html/` 存在时再跑一段
「从基线真实标题文本回放」的活体对拍，两种口径都通过。

---

## 2. 路由与数据层

### 2.1 路由

`src/pages/[year]/[month]/[day]/[slug].astro`

- `getStaticPaths`：`getCollection('posts')` → `layout !== 'page'` → 复用
  `preparePosts()` 算出的 `YYYY/MM/DD/`（站点时区 `Asia/Shanghai`，与首页卡片同一套语义）；
- `slug = abbrlink || id`（基准站 10 篇 fixture 都没有 abbrlink，等价于 id）；
- 页面里 `getEntry('posts', id)` 取回条目，`preparePostPage()` 组装数据。

产物路由（构建日志）：

```
/2024/11/01/longform-hexo-astro/index.html
/2024/12/15/short-note/index.html
/2025/01/10/multi-taxonomy/index.html
/2025/02/02/sticky-top/index.html
/2025/02/20/cover-variants/index.html
/2025/03/05/tags-inline/index.html
/2025/03/18/tags-block/index.html
/2025/04/01/tags-media/index.html
/2025/04/20/tags-thirdparty/index.html
```

### 2.2 `post-page.ts` 负责的上游语义

| 上游 | 这里 |
| --- | --- |
| `page.prev` / `page.next` | 全部文章 date 升序 → path 升序，取相邻项（基准 `post_pagination: 2`，页面层按 1/3/4 交换） |
| `related_posts(page, site.posts)` | 按当前文章标签顺序 × 站点文章顺序累计 weight，稳定排序后 `slice(0, limit)` |
| `showToc = pageToc && toc(page.content) !== ''` | `theme.aside.enable && page.aside !== false && pageToc && headings.length > 0` |
| `toc(page.content)` | `rewriteHeadings()` 抽出的 h1–h6；交给 aside 的是 h2–h6 |
| `page.permalink` | `config.url + root + path`（`itemtype` / canonical 用） |
| `post_lazyload.js`（`field: site`） | 对正文 `<img>` 做字符串级改写（跳过 `nolazyload`） |
| 站点级 `external_link.enable` | 正文外链补 `target="_blank" rel="noopener"`（只作用于正文） |

`#post-info` 由 BaseLayout 的 `post-info` 具名插槽转发给 Header；页面用
`<Fragment slot="post-info">` 提供。aside 内容不填，只通过 BaseLayout 传
`showToc` / `headings`。

---

## 3. 组件与上游模板对照

| 上游 | 组件 | 基准配置下的实际输出 |
| --- | --- | --- |
| `header/post-info.pug:2-114` + `header/index.pug:31-42` | `PostInfo.astro` | `#post-info`（原创 + 分类 + 标签 + 标题 + 日期 + 长沙）+ 波浪 + `#post-top-cover` |
| `post.pug:10-29` | `PostContent.astro` | `article.post-content#article-container` + header + 正文 |
| `post/post-copyright.pug` | `PostCopyright.astro` | `.post-copyright` + `.post-tools-right`（两者同级） |
| `post/ptool.pug` | `PostPtool.astro` | `#post-tools` + 手机二维码 + 微博 + 复制链接脚本 |
| `post/reward.pug` | `PostReward.astro` | 微信 / 支付宝二维码 + `#quit-box` |
| `third-party/share/index.pug` | `ShareBox.astro` | `.post_share`（share.js） |
| `pagination.pug:9-31` | `PostPagination.astro` | `nav#pagination.pagination-post` |
| `helpers/related_post.js` | `RelatedPosts.astro` | `.relatedPosts` |
| `anzhiyu/ai-info.pug` | `PostAiDescription.astro` | `.post-ai-description`（长文 `ai: true`） |

关键结构细节（容易写错的几处，均已对齐）：

1. **`.post_share` 是 `.tag_share` 的兄弟**，不是子节点。`post-copyright.pug:42` 的
   `!=partial(share)` 与 `:31` 的 `.tag_share` 同缩进，属于 `.post-tools-right` 的直接子节点。
2. `#post-tools` 在 `.post-copyright` **内部**（`post-copyright.pug:25-26` include ptool）；
   `.post-tools-right` 在 `.post-copyright` **之后**。
3. 文章页 header 的分类链接是 `a.post-meta-categories`（无图标），正文 header 里的分类
   也是 `a.post-meta-categories`，但 `#post-firstinfo` 里的每个分类前有
   `i.anzhiyu-icon-inbox`，非末项后跟 `i.anzhiyu-icon-angle-right`。
4. `span.tagsPageCount` 是标签的**全站文章数**（`Tag.length`），不是当前文章的标签序号。

---

## 4. 验收命令与真实输出

### 4.1 构建

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd /d/Git-project/astro-theme-anzhiyu
while ! mkdir .build.lock 2>/dev/null; do sleep 3; done
trap 'rmdir .build.lock' EXIT
pnpm --filter blog build
```

末尾：

```
21:29:07 ✓ Completed in 525ms.
21:29:12 [build] ✓ Completed in 7.45s.
21:29:12 [build] 49 page(s) built in 55.40s
21:29:12 [build] Complete!
```

### 4.2 标题 id 对拍

```bash
node -e "..."   # 见 §1；逐条比较 .baseline-html 与 dist 的 h1–h6 id
```

真实输出（长文页）：

```
baseline: 9 个  dist: 10 个
OK h1 #CrawlerTitle  |  h1 #CrawlerTitle
OK h2 #为什么需要一份固定的参考产物  |  h2 #为什么需要一份固定的参考产物
OK h3 #三个层次  |  h3 #三个层次
OK h3 #不能被「优化」的部分  |  h3 #不能被「优化」的部分
OK h2 #代码块  |  h2 #代码块
OK h2 #表格与列表  |  h2 #表格与列表
OK h2 #图片与行内元素  |  h2 #图片与行内元素
OK h2 #数学与脚注  |  h2 #数学与脚注
OK h2 #收尾  |  h2 #收尾
XX -  |  h2 #footnote-label
```

正文 9 个标题 **9/9 一致**。多出的 `h2#footnote-label` 来自 remark-gfm 的脚注区块
（上游 marked 不支持脚注，P2-1 §7.2 已把它记为「有意升级」；同理 `p[12]` 的脚注引用
和整段 `[^note1]: …` 定义是同一处差异，共 5 条，见 §4.4）。

### 4.3 长文页 diff

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/2024/11/01/longform-hexo-astro/index.html \
  dist/2024/11/01/longform-hexo-astro/index.html --limit 80
```

```
FAIL ...  50 条差异（结构 39 / 属性 10 / 文本 1），缺口 缺 223 节点，多 18 节点
```

50 条全部归类（按出现顺序）：

| 条数 | 归属 | 说明 |
| --- | --- | --- |
| 13 | P2-3 Head / P4-1 资源 | `#config-diff`、`GLOBAL_CONFIG`、`main_css`、fancybox/snackbar CSS、`generator` meta、`og:url`（基线带 `index.html`，Head 统一去尾） |
| 2 | P4-1 资源 | `<body>` 里的 pace 进度条 link/script |
| 1 | P4-6 | `#console` 中控台（180 节点） |
| 5 | P2-1 已知差异 | 脚注：`p[12]` 的 `sup` + 文本、`p[13]` 定义段、`section.footnotes` |
| 1 | P3-1 | aside 作者卡 description 文本（aside-widgets 正在填） |
| 6 | P2-4 / P2-5 | footer / sidebar 外链缺 `target` / `rel`（`external_link` 站点级过滤器的其它挂载点） |
| 22 | Phase 4 | `additional-js.pug` 的脚本 / `#universe` / `link` 等 |

**文章区（`#post-info` + `#post`）只有 5 条脚注差异；header、正文容器、版权、ptool、
分页、相关推荐、分享按钮均为 0 条。**

### 4.4 其余 8 篇文章

对每篇跑同一 diff，只统计路径含 `#post[1]` / `#post-info` / `article-container` 的条目：

| 页面 | 总 diff | 文章区 diff | 文章区差异原因 |
| --- | --- | --- | --- |
| 2024/11/01 longform | 50 | 5 | 脚注（P2-1 已知） |
| 2024/12/15 short-note | 49 | 1 | 缺 `#post-info`：Header 把 `top_img === undefined` 当 false，上游此时仍渲染 post-info（P2-4，见 §6） |
| 2025/01/10 multi-taxonomy | 45 | 0 | — |
| 2025/02/02 sticky-top | 45 | 0 | — |
| 2025/02/20 cover-variants | 45 | 0 | — |
| 2025/03/05 tags-inline | 49 | 4 | `{% p h2, … %}` 段落标签的产物边界（hexo-tags/Phase 6） |
| 2025/03/18 tags-block | 45 | 0 | — |
| 2025/04/01 tags-media | 83 | 28 | `{% image/audio/video/gallery/site/btns %}` 未移植（Phase 6） |
| 2025/04/20 tags-thirdparty | 66 | 21 | `{% bilibili/dogeplayer/mermaid/tip/link/intCard/flink %}` 未移植（Phase 6） |

---

## 5. 实现中确认过的上游细节

- **`post_meta.post.date_type: both`**：`#post-info` 与 `article > header` 都输出两个
  `<time>`（created / updated），`title` 分别是「发表于 …」「更新于 …」。
- **`post_copyright.location: 长沙`**：`.meta-secondline` 里先有
  `span.post-meta-separator`，再有 `span.post-meta-position[title="作者IP属地为长沙"]`。
- **`wordcount.enable: false` / `comments.use: null` / `busuanzi.page_pv: false`**：
  字数、阅读时长、PV、评论数四块均不输出；`.meta-secondline` 只剩上面那两项。
- **版权 notice**：`_p('post.copyright.copyright_content', license_url, license, config.url, config.title)`
  在中文语言包里是一段带 4 个 `%s` 的 HTML，按顺序插值后 `set:html` 输出。
- **图片 lazyload**：正文 `<img>` 由 `post_lazyload.js` 改写成
  `src=<占位图> onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;" data-lazy-src=<原 src>`；
  版权头像、打赏二维码、上下篇封面、相关推荐封面走同一个 helper。
  上下篇模板本来还有一个 `onerror=...`，与 lazyload 的属性重复；diff 工具按「重复属性保留第一个」
  处理，输出一份即可。
- **`page.prev` 是更旧的一篇**：基准 `post_pagination: 2`，长文（最旧）只有 `.next-post`
  （→ short-note，更新的一篇），符合基线。

---

## 6. 已知限制 / 留给后续阶段

1. **脚注**（P2-1 决策）：remark-gfm 会把 `[^note1]` 渲染成可跳转脚注区块，上游 marked
   当普通文本。这是 PLAN 附录 A #2 的有意升级，不是回归；Phase 2 的 diff 会在长文页
   稳定出现这 5 条。若最终要求与上游逐字节一致，应在 markdown 处理器里关掉 GFM 脚注，
   而不是在文章页删 DOM。
2. **short-note 的 `#post-info`**：`header/index.pug:1-13` 里 `top_img = page.top_img || page.cover || page.randomcover`
   在三者都为空时是 `undefined`（不是 `false`），所以 `top_img !== false` 成立、仍渲染
   post-info；`Header.astro:76-79` 的 `asTopImg()` 把 `undefined` 收窄成 `false`，整块不渲染。
   修在 Header（P2-4）最合适；本任务未改 Header。
3. **`og:url` 的 `index.html`**（P2-3）：基线 `og:url` 带 `index.html`、canonical 不带；
   Head 用同一个 `pageUrl` 生成两者，只是 canonical 再过 `urlNoIndex`。本页传的是
   目录 URL，所以 `og:url` 少了 `index.html`。属 Head 的 URL 生成口径，不在文章页修。
4. **`external_link` 只作用于正文**：站点级过滤器本来也作用于 nav/footer/sidebar；
   本任务只把正文里的外链补齐（`post-page.ts` 的 `applyExternalLinks`），其余挂载点
   仍由 P2-4/P2-5 处理。
5. **Phase 6 tag 插件**：tags-inline / tags-media / tags-thirdparty 的文章区差异全部是
   Hexo tag 的产物边界（p / image / audio / video / gallery / site / bilibili 等），
   与本任务的容器和 header 无关。tags-inline 的 `{% label %}` 等 11 个 tag 已消费，
   只剩 `{% p %}` 一处（`.p` 标签被渲染成空 `<p></p>` 后接一段，属 hexo-tags 的插件实现）。
6. **`permalink` 规则**：只实现基准站的 `:year/:month/:day/:slug/`；自定义 permalink
   （Phase 7 站点配置层）需要扩展 `preparePostPage()`。

---

## 7. 复验命令清单

```bash
export PATH="/c/Program Files/nodejs:$PATH"

# M3 slugger
cd packages/astro-theme-anzhiyu && node scripts/check-slugger.mjs

# 构建
cd /d/Git-project/astro-theme-anzhiyu
while ! mkdir .build.lock 2>/dev/null; do sleep 3; done
trap 'rmdir .build.lock' EXIT
pnpm --filter blog build

# 单页 diff
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/2024/11/01/longform-hexo-astro/index.html \
  dist/2024/11/01/longform-hexo-astro/index.html --limit 80
```
