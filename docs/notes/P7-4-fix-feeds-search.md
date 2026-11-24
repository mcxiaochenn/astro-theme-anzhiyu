# P7-4 修复（W2-B2）：migrate-hexo 生成搜索索引与 feed/sitemap

> 任务：W2-B2（task-8）。把 Hexo 侧 **6 个站点级生成器产物**在迁移站里按插件源码语义再生，
> 全部由源站 `_config.yml` 配置驱动（路径 / 条目上限 / 是否带正文 / feed 类型等都不写死）：
>
> | 产物 | 上游来源 | 目标（本站路径） | 落点方式 |
> | --- | --- | --- | --- |
> | `search.xml` | `hexo-generator-search@2.4.3` | `/search.xml` | 构建期 Astro endpoint |
> | `atom.xml` / `rss2.xml` | `hexo-pretty-feed@1.1.0` | `/atom.xml`、`/rss2.xml` | 构建期 Astro endpoint |
> | `sitemap.xml`（可选 `sitemap.txt`） | `hexo-generator-sitemap@3.0.1` | `/sitemap.xml` | 构建期 Astro endpoint |
> | `baidusitemap.xml` | `hexo-generator-baidu-sitemap@0.1.9` | `/baidusitemap.xml` | 构建期 Astro endpoint |
> | `baidu_urls.txt` | `hexo-baidu-url-submit@0.0.6` | `/baidu_urls.txt` | 构建期 Astro endpoint |
>
> 结果：迁移站 `pnpm build` **exit 0**；6 个产物**条目数与 golden 全部一致**
> （22 entry / 20 entry / 20 item / 84 url / 22 url / 22 行），`sitemap.xml` 的 URL 集合与 golden
> **完全一致**、`baidu_urls.txt` 与 golden **逐字节一致**；
> `scripts/accept-migration.mjs` 的 **迁移缺口 6 → 0**（`sitemap 3 / feed 2 / search-index 1` 全部归零，
> `gapBreakdown` 为空），9 PASS + 1 INFO、`feed` 5/5 存在、`search` 索引存在。
> 改动文件：`scripts/migrate-hexo.mjs`（+`docs/MIGRATION.md` §7.2 / 本文件）；
> **未改**主题包 / `examples/blog` / 源站（源站全程只读）。

---

## 1. 上游口径：6 个产物分别由谁生成、配置怎么读

研究依据是源站 `node_modules/` 里安装的**同版本插件源码**（只读），不是猜的：

| 产物 | 插件源码（源站 node_modules 下） | 配置读取要点 |
| --- | --- | --- |
| `search.xml` | `hexo-generator-search/lib/xml_generator.js` + `templates/search.xml` | `search.path`（缺省 `search.xml`，无扩展名补 `.xml`）；`search.field`（缺省 `post`）；`search.content` 只有显式 `false` 才关；`entry` 顺序 = `locals.posts.sort('-date')`；`indexing: false` 的文章跳过；`<content>` 用 `noControlChars` 剥控制字符 + CDATA；link/url = `root + post.path`（`uriencode`） |
| `atom.xml` / `rss2.xml` | `hexo-pretty-feed/lib/generator.js` + `atom.xml`、`rss2.xml` | `feed.enable/type/path/limit/content/content_limit/content_limit_delim/order_by/icon/hub/pretty_atom_file/pretty_rss2_file`；type 与 path 按 index.js 规则配对（数组时补 `.xml`、裁剪到同长度）；`limit` 缺省 20；content 为 CDATA 全文；`<summary>`/`<description>` 按 `description → intro → excerpt → content.substring(0, content_limit)` 截断（有 `content_limit_delim` 时取最后一个分隔符之前） |
| `sitemap.xml` / `.txt` | `hexo-generator-sitemap/lib/generator.js` + `lib/template.js` + `sitemap.xml`、`sitemap.txt` | `sitemap.path` 缺省 `['sitemap.xml','sitemap.txt']`；`tags`/`categories` 默认 true；posts+pages 按 `updated` 降序；skipRenderList = `['**/*.js','**/*.css']` + 站点 `skip_render`；模板顺序：posts/pages → 首页 → tags → categories |
| `baidusitemap.xml` | `hexo-generator-baidu-sitemap/baidusitemap.ejs` + `lib/generator.js` | `baidusitemap.path` 缺省 `baidusitemap.xml`；可选 `baidusitemap.url` 覆盖域名；posts+pages 按 `updated` 降序；ejs 的 `if (post.categories)` 对 Hexo Query 恒为真 → **实际所有文章都进**（含无分类文章，golden 里 `/posts/p3eeb/` 可证） |
| `baidu_urls.txt` | `hexo-baidu-url-submit/lib/generator.js` | `baidu_url_submit.path` / `count`；posts 按 `date` 降序取前 `count` 条 permalink，`join('\n')`（无尾换行）；`host`/`token` 只用于插件真实提交，**生成文件不需要** |

另外两条决定 URL/页面清单的 Hexo 7 语义，也从源站 `node_modules/hexo/` 源码确认：

- `hexo/dist/hexo/load_config.js`：加载配置时会 **`config.url.replace(/\/+$/, '')` 去掉尾斜杠**、
  `root` 缺省补成 `/`。所以 hexo-generator-baidu-sitemap 的 `url = config.url + config.root` 在
  生成期得到的是**单斜杠**；迁移侧直接按「origin（去尾斜杠）+ 站内路径」拼，避免插件这种双斜杠类 bug。
- `hexo/dist/plugins/renderer/index.js`：`htm/html/css/js/json/yml/yaml/njk/j2` 有内置 renderer，
  source 下这些扩展名的文件会被 Hexo 当 **Page** 参与 sitemap（`json→json`、`yml/yaml→json`、
  `njk/j2→html`）；js/css 被 sitemap 的 skipRenderList 过滤，其余扩展名是 Asset 不进 sitemap。
  本站命中的是 **5 个 `.json`**（`flink_count.json`、`friend.json`、`json/{music,owo,owo_coolapk}.json`），
  golden sitemap 里逐条对得上。

---

## 2. 实现取舍：为什么必须是「构建期 endpoint」

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 迁移期直接生成 6 个文件 | ✗ | search/atom/rss2 的正文是**渲染后的正文 HTML**，迁移期还没跑 Markdown 渲染，拿不到 |
| 迁移期用 `astro/container` 二次渲染 | ✗ | 会把 Markdown 渲染管线复制一份到 migrate 脚本里，与站点真实渲染（自定义 processor + remark-hexo-tag + rehype 高亮）**必然漂移**，维护成本高 |
| **构建期 Astro endpoint + `entry.rendered.html`** | ✓ 采用 | Astro 7 glob loader 在 content sync 阶段 **eager 渲染**，条目上直接有渲染结果；与文章页正文同源，零二次渲染 |

因此 `migrate-hexo.mjs` 的 `[7.y/8]` 阶段只生成两类东西：

1. `src/data/site-feeds.ts` —— 6 个产物的公共实现（手写 XML 序列化、正文取法、URL/日期工具、
   sitemap 数据源），以及从源站 `_config.yml` 归一化出来的 `GENERATORS` 配置快照；
2. `src/pages/<产物路径>.ts` × 6 —— 每个 endpoint 只有「import 实现 + `export const GET`」的薄壳。

这样迁移脚本里没有任何 XML 模板字符串拼接细节，换站点时只要重新跑 migrate 就会按新配置重写快照与路径。
**没有新增任何 npm 依赖**（XML 序列化手写；不引 `@astrojs/rss` / `@astrojs/sitemap`）。

生成器配置缺失/不启用时（`feed.enable: false`、没有 `search` 段……）**不生成**对应 endpoint，
与 Hexo 插件「没装/没启用就不产出」一致；两个生成器指向同一输出路径时直接 fail。

---

## 3. 正文 HTML 探针：`entry.rendered.html` 可用（22/22）

构建期探针（临时 endpoint `probe-rendered.json.ts`，取数后已删除）打在**本次交付的迁移产物**
（`.migration-out/w2b2`）上，实测输出：

```json
{
 "collection": "posts",
 "total": 40,
 "posts": 22,
 "pages": 18,
 "postsWithRenderedHtml": 22,
 "pagesWithRenderedHtml": 11,
 "postsEmpty": [],
 "pagesEmpty": [
  "categories-page", "equipment-page", "essay-page", "fcircle-page",
  "music-page", "tags-page", "todolist-page"
 ],
 "postHtmlLengthRange": [209, 31398],
 "sample": [
  { "id": "1观鬼灭之刃无限城篇-第一章-猗窝座再袭首映有感", "rendered": true, "htmlLength": 6051, "metadataHeadings": 11 },
  { "id": "1山东泰安泰山游记煌煌泰山景谦谦君子风", "rendered": true, "htmlLength": 10107, "metadataHeadings": 16 }
 ]
}
```

结论：
- **22/22 篇文章**都有非空 `entry.rendered.html` → 不需要 `astro/container` 二次渲染，也不需要
  自建 unified processor；正文与文章页同源（同一个 custom Markdown processor）。
- 7 个 `layout: page` 的数据驱动页（categories/tags/music/…）正文为空——它们的内容由页面组件生成，
  Hexo 侧对应 `page.content` 也是空的；search 只取 `field: post`、sitemap 不需要正文，不影响产物。
- 正文在写入 feed/search 前只额外跑主题的 `rewriteHeadings()`（补 Hexo marked 的标题 id 与
  `<a class="headerlink">`）；**不**套文章页渲染层的 `applyLazyload`（`data-lazy-src`）与
  `applyExternalLinks`（safego 外链改写）——源站这两个都是 `after_render:html` 过滤器，生成器取
  `post.content` 时还没发生，golden 里也没有。

---

## 4. 产物 vs golden 对照

构建：`cd .migration-out/w2b2 && pnpm install --ignore-workspace && node ../../node_modules/astro/bin/astro.mjs build`
（exit 0；`96 page(s) built`；`[normalize-html-output] 平文件化 1 处 .html 目录`）。

| 产物 | dist 字节 | golden 字节 | dist 条目 | golden 条目 |
| --- | --- | --- | --- | --- |
| `search.xml` | 249657 | 254208 | **22 entry** | 22 entry |
| `atom.xml` | 219910 | 222667 | **20 entry** | 20 entry |
| `rss2.xml` | 219880 | 225431 | **20 item** | 20 item |
| `sitemap.xml` | 15393 | 16104 | **84 url** | 84 url |
| `baidusitemap.xml` | 2513 | 2513 | **22 url** | 22 url |
| `baidu_urls.txt` | 950 | 950 | **22 行** | 22 行 |

结构性断言（脚本化、可复跑）：

- **sitemap URL 集合完全一致**：dist 84 条 ↔ golden 84 条，`dist-only: []`、`golden-only: []`
  （22 文章 + 18 独立页面 + 5 个 source 静态 JSON 页面 + 首页 + 28 标签 + 10 分类）。
- **baidu_urls.txt 与 golden 逐字节一致**（`===` 为 true，按 `date` 倒序取全部 22 条）；
  `baidusitemap.xml` 与 golden **字节数完全一致**（2513），内容差异仅在 lastmod/顺序（见 §5）。
- **atom.xml 的 20 个 entry URL 与顺序和 golden 完全相同**（`==` 为 true）。
- **5 个 XML 全部 well-formed**（PowerShell `System.Xml.XmlDocument.Load` 逐个通过）：

  ```
  search.xml OK root=search nodes=22
  atom.xml OK root=feed nodes=29
  rss2.xml OK root=rss nodes=1
  sitemap.xml OK root=urlset nodes=84
  baidusitemap.xml OK root=urlset nodes=22
  ```
- **local-search.js 解析口径兼容**（`assets/js/search/local-search.js` 用 `entry > title/url/content/tags`）：

  ```
  local-search 解析器口径：entries = 22
  字段完整（title/url/content 均非空）: true
  tags 解析样本: ["日常","生活","电影"] ["教程","博客","Hexo","实战"]
  url 以 / 开头: true
  含 data-lazy-src（应 false）: false
  含 go.html?u=（应 false）: false
  ```
- **XML 转义**：CDATA 之外没有裸 `&` / 裸 `<`（对 5 个文件逐项扫描为 0）；CDATA 结束标记按 XML
  规则拆开，正文里的 `]]>` 不会截断文档。

feed 头部与 golden 对齐（节选 dist/atom.xml）：

```xml
<?xml version="1.0" encoding="utf-8"?><?xml-stylesheet type="text/xsl" href="/feed/atom.xsl" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>辰渊尘の个人博客</title>
  <icon>https://blog.mcxiaochen.top/img/favicon.ico</icon>
  <subtitle>「小尘」の个人博客</subtitle>
  <link href="https://blog.mcxiaochen.top/atom.xml" rel="self"/>
  <link href="https://blog.mcxiaochen.top/"/>
  <updated>2025-11-23T08:20:24.000Z</updated>
  <id>https://blog.mcxiaochen.top/</id>
  <author><name>mcxiaochenn</name></author>
  <generator uri="https://hexo.io/">Hexo</generator>
```

> `/feed/atom.xsl`、`/feed/rss2.xsl` 不是本任务生成：它们是源站 `source/feed/*.xsl`，由静态资源
> 复制（`[6/8]`）带到 `public/`，hexo-pretty-feed 只负责在 XML 里写 `xml-stylesheet` 指令。

---

## 5. 与 golden 的差异（逐项原因）

### 5.1 正文 HTML 的字节差（search/atom/rss2 差 1–3%）

生成器逻辑（条目、顺序、字段、CDATA 规则）与 golden 一致；差异来自**渲染层本身**，且文章页正文
同样存在（不是 feed/search 单独的问题）：

1. **Hexo 的 `hexo-pangu` 会在中英文/数字之间补空格**（golden：`就是 14 号凌晨`；Astro 渲染层：
   `就是14号凌晨`）。Astro 侧没有等价插件，所以正文只会更短，不影响搜索匹配（local-search 会把
   HTML 标签去掉后做子串匹配，空格差异不改变匹配结果）。
2. **个别 Hexo tag 在 Markdown 渲染层就落空**：源站 `pe305`（Hexo 入门教程）把
   `{% tabs %}` / `<!-- tab -->` 写在 `>` 引用块里，Hexo 能从引用块里取出 tag 展开；Astro 侧
   `remark-hexo-tag` 只识别块级写法，渲染成空的 `nav-tabs/tab-contents` 容器——**文章页正文同样为空**
   （`dist/posts/pe305/index.html` 里搜不到 tab 内的命令，与 golden 页面相比同样是 P6 渲染层已知差异）。
   对应 `search.xml` 里该篇 CDATA 长度 4625 vs golden 7911（-3286）。
3. **golden 是历史快照，源站内容在 golden 之后又被编辑过**：`/posts/pf21cf686/`（鬼灭观后感）
   源文改过（golden 正文 4428 字符 → 当前源文渲染 6494 字符），对应 CDATA +2066。
4. 其余文章逐篇 CDATA 长度差基本在 ±500 字符内（pangu 空格/渲染细节），`/posts/p3eeb/` 这种
   纯段落文章 **完全相等**（206 = 206）。

### 5.2 `lastmod` 的时间口径（sitemap/baidusitemap）

- 文章/页面：frontmatter `updated`；独立页面缺 `updated` 时用**迁移期快照的源文件 mtime**
  （Hexo `updated_option: mtime` 语义，构建期拿不到源站文件，所以 migrate 阶段 `statSync` 快照）；
- 首页/标签/分类：**构建日**（对应模板里的 `sNow`，golden 是 2025-11-23 构建的，本机是 2026-11-24）。

因此 URL 集合与条目数一致，`lastmod` 值会不同；这不是生成器差异。

### 5.3 分类/标签在 sitemap 里的顺序

Hexo 用 `locals.tags` / `locals.categories` 的 DB 插入序；迁移站按「文章 date 倒序首次出现」去重。
URL 集合一致（`dist-only/golden-only` 都为空），顺序不是 sitemap 的语义契约，故接受。

### 5.4 baidusitemap 收录无分类文章

`hexo-generator-baidu-sitemap@0.1.9` 的 ejs 里 `if (post.categories)` 对 Hexo 的 Query 对象**恒为真**，
所以实际产物包含所有文章（golden 里无分类的 `/posts/p3eeb/` 也在）。迁移侧按实际产物对齐
（`baidusitemap: false` 才排除）；实现注释里写明了这个「模板看似过滤、实际不过滤」的上游行为。

### 5.5 URL 规范化（避免插件 `url + root` 双斜杠）

Hexo 加载配置时会去掉 `config.url` 的尾斜杠；本站 `_config.yml` 当前写的是带尾斜杠的
`https://blog.mcxiaochen.top/`，如果照抄 baidu 插件的 `url + config.root` 拼接会得到 `//posts/…`。
迁移侧统一按「origin（去尾斜杠）+ 站内路径（无前导 `/`）」拼接，所有产物都是单斜杠。
（golden 的 baidusitemap 也是单斜杠，两边一致。）

### 5.6 未支持/边界

- `search.path` 以 `.json` 结尾（`hexo-generator-search` 的 json_generator 是另一套结构）→ 本轮只支持
  `.xml`，脚本打印跳过日志并在 `migration-report.json` 的 `unsupported` 登记；
- `search.field` 非 `post`（`page`/自定义）→ 本轮只生成文章条目，脚本 warning 提示；
- 主题 `src/components/head/global-config.ts` 把本地搜索索引路径写死成 `${root}search.xml`
  （可用 `anzhiyu.config.yml: local_search.CDN` 覆盖）。本站 `search.path: search.xml` 正好一致；
  若改文件名，需要同步设置 `local_search.CDN`；
- 百度提交只生成 URL 清单，**不执行提交**；`host/token` 不读不写（`migration-report.json`
  只登记 `secretsOmitted: ['host','token']`），真实提交应在部署 CI 用环境变量单独实现。

---

## 6. 验收：迁移缺口 6 → 0

### 6.1 修复前（W2-B1 交接状态，`.migration-out/w2b1-accept/acceptance-report.json`）

```
checksByStatus: { PASS: 5, FAIL: 4, INFO: 1 }
gapTotal: 6
gapBreakdown: { sitemap: 3, feed: 2, "search-index": 1 }
feed:  expectations=5, present=0, missing=5（goldenRootOnly 含 atom.xml/rss2.xml/sitemap.xml/baidusitemap.xml/baidu_urls.txt/search.xml）
search: indexExists=false, indexBytes=0
```

### 6.2 修复后（`.migration-out/w2b2-accept/acceptance-report.json`，完整
`migrate → install → build → 10 项检查`）

```
$ node scripts/accept-migration.mjs --out .migration-out/w2b2-accept
  PASS  build        exitCode=0，durationMs=11847，htmlFiles=97，rootFiles=14
  PASS  routes       routesExpected=40
  PASS  links        missingDistinct=8（全部 inherited/whitelisted）
  PASS  assets       assetGaps=1（inherited），gapTotal=0
  PASS  identity     failed=0
  PASS  page-types   passed=17，failed=0
  PASS  tag-residue  hits=0
  PASS  search       localSearchEnabled=true，localSearchPath=/search.xml，indexExists=true，indexBytes=249657
  PASS  feed         expectations=5，present=5，missing=0，goldenRootOnly=[]
  INFO  structure    totalDiffs=1433
------------------------------------------------------------------------------
  迁移缺口（migration gap）：0
  源站既有（inherited）   ：7
  已知豁免（whitelisted） ：1
  退出码：0
```

feed 检查的逐行证据（acceptance-report.json → checks[feed].evidence.rows）：

| 产物 | exists | bytes | items | goldenBytes | goldenItems |
| --- | --- | --- | --- | --- | --- |
| `/atom.xml` | true | 219910 | 20 | 222667 | 20 |
| `/rss2.xml` | true | 219880 | 20 | 225431 | 20 |
| `/sitemap.xml` | true | 15393 | 84 | 16104 | 84 |
| `/baidusitemap.xml` | true | 2513 | 22 | 2513 | 22 |
| `/baidu_urls.txt` | true | 950 | 22 | 950 | 22 |

`build` 检查的 `rootFiles=14` 与 golden 根级文件 14 个完全对齐（`goldenRootOnly: []`）；
`summary.gapBreakdown` 为**空对象**，`gapByStatus: { "migration-gap": 0, inherited: 7, whitelisted: 1 }`。

### 6.3 报告层

`migration-report.json` 新增（均为配置驱动的快照，不含源站硬编码身份）：

```
generators.search        = { path: "/search.xml", field: "post", content: true }
generators.feed          = { outputs: [{atom,/atom.xml},{rss2,/rss2.xml}], limit: 20, content: true,
                             order_by: "-date", icon: "/img/favicon.ico", pretty_atom_file: "/feed/atom.xsl", ... }
generators.sitemap       = { outputs: [{sitemap.xml, xml}], tags: true, categories: true }
generators.baidusitemap  = { path: "/baidusitemap.xml", urlOverride: null }
generators.baiduUrlSubmit= { path: "/baidu_urls.txt", count: 100, secretsOmitted: ["host","token"] }
generatorEndpoints       = [6 个 src/pages/*.ts 路由壳]
generatorArtifactCount   = 6
```

`unsupported` 仍为 18 项，但 `hexo-plugin` 条目里的插件键从 17 个缩到 9 个
（`search/feed/sitemap/baidusitemap/baidu_url_submit` 已不再列为待办；`baidu_url_submit.token`
仍作为敏感字段保留在 `comment-backend-secret` 分类里，只记路径不记值）。

---

## 7. 对没有这些配置的站点安全（跳过语义）

- 没有 `search` / `feed` / `sitemap` / `baidusitemap` / `baidu_url_submit` 段 → 打印「源站未配置…，跳过」，
  不写任何 endpoint，也不写 `src/data/site-feeds.ts`；
- `feed.enable: false` → 视为未启用，不生成 feed；
- 两个生成器指向同一输出路径 → `fail()` 并提示检查 `_config.yml` 的 `*.path`（避免静默互相覆盖）；
- `--no-assets` 时不把 source 静态页面（json/html…）列进 sitemap（否则会指向未复制的文件）；
- `search.path` 是 `.json` / `search.field` 非 `post` → 跳过并登记 `unsupported`，不会生成半成品。

---

## 8. 实现要点（`scripts/migrate-hexo.mjs`）

- 新增配置归一化函数（与插件 index.js 的默认值/配对规则逐行对齐）：
  `normalizeSearchGeneratorConfig` / `normalizeFeedGeneratorConfig` / `normalizeSitemapGeneratorConfig` /
  `normalizeBaiduSitemapGeneratorConfig` / `normalizeBaiduUrlSubmitGeneratorConfig`。
- `collectHexoStaticPageInputs(sourceDir, skip_render)`：按 Hexo 内置 renderer 表 + skipRenderList
  收集 sitemap 的「source 静态页面」，并在迁移期快照 `mtime`（构建期拿不到源站文件）。
- `renderSiteFeedsModule(...)`：生成 `src/data/site-feeds.ts`（约 550 行 TS），导出
  `renderSearchIndex / renderFeed(type,path) / renderSitemap(kind,path) / renderBaiduSitemap /
  renderBaiduUrls` 五个 endpoint 处理函数；数据源 = `getCollection` + `entry.rendered.html` +
  `postHref()` + `taxonomySlug()`，站点身份 = `site.config.ts`，生成器配置 = 迁移期快照。
- `renderGeneratorEndpoint(...)`：生成 6 个路由壳（`export const GET = ...`），文件名即产物路径，
  Astro 静态构建时执行并写到 `dist/` 根目录。
- `[7.y/8]` 阶段把这些产物摘要写进 `migration-report.json` 的 `generators` / `generatorEndpoints`，
  并在 stdout 打印每个产物的路径与关键配置；文件数计入 `generatedFiles`。
- 生成的实现模块刻意不用模板字符串（避免与 migrate 脚本的模板冲突），零新增 npm 依赖。

---

## 9. 回归 / 影响面

- 未改 `packages/astro-theme-anzhiyu/**`、`examples/blog/**`、源站任何文件；`git status` 只应出现
  `scripts/migrate-hexo.mjs` / `docs/MIGRATION.md` / 本文件（工作区里的 `.migration-out/` 为未跟踪临时产物）。
- 迁移站构建时间：acceptance 里 build 阶段 11847ms（含 6 个 endpoint 的渲染与 22 篇正文的二次
  `rewriteHeadings`），与 W2-B1 的 14459ms 同量级；端点在页面路由之后执行，不影响页面产物。
- W2-B1 的 4 个插件产物不受影响（acceptance `routes` / `assets` / `page-types` 全 PASS）。
- 构建 stderr 里仍有 297 条 `[ERROR] [content] Attempted to access deprecated property on "posts" entry`
  （`entry.slug` 弃用提示）——W2-B1 的 acceptance 日志里同样存在（60813 字节，完全一致），
  属于主题/示例站既有调用，与本任务无关。

---

## 10. 遗留（后续任务）

1. 浏览器级验证（搜索弹层真实交互、RSS 阅读器渲染）本机做不了（PLAN R12 无浏览器），等 CI；
2. `search.field: page` / 自定义 field、`search.path: *.json` 未实现（已登记 unsupported + warning）；
3. 若要用 `sitemap.txt` 或自定义 sitemap 模板（`sitemap.template`），当前只支持默认 XML/TXT 模板语义；
4. pangu 空格与「引用块里的 Hexo tag」属于渲染层已有差异（P2/P6 范围），要让 feed/search 正文与
   Hexo `post.content` 完全字节一致，需要在 Markdown 渲染层补对应插件，而不是在生成器里补。
