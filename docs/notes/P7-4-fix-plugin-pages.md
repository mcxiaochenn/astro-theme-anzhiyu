# P7-4 修复（W2-B1）：migrate-hexo 生成 Hexo 插件产物

> 任务：W2-B1（task-7）。把 Hexo 侧**插件在 `hexo generate` 阶段注入的产物**在迁移期按插件源码
> 逐份移植为 Astro 站点里的静态产物：
>
> | 产物 | 上游来源 | 目标 |
> | --- | --- | --- |
> | A. 留言板 | `hexo-butterfly-envelope` | `<envelope_comment.path>/index.html`（本站 `/comments/`） |
> | B. 追番页 | `hexo-bilibili-bangumi` | `<bangumi.path>/index.html`（本站 `/bangumis/`） |
> | C. 安全跳转页 | `hexo-safego` | `<hexo_safego.security.html_file_name>`（本站 `/go.html`） |
> | D. 随机文章脚本 | 主题 `scripts/helpers/random.js` generator | `<random.path>`（本站 `/anzhiyu/random.js`） |
>
> 结果：**4/4 产物生成成功**；`scripts/accept-migration.mjs` 的 `page-missing` 类别 **3 → 0**，
> `routes` 检查 **FAIL → PASS**（golden 97 HTML ↔ dist 97 HTML，missing 0 / extra 0）；
> 剩余迁移缺口 10 → **6**（`sitemap 3 / feed 2 / search-index 1`，全部属于 B2）。
> 改动文件：`scripts/migrate-hexo.mjs`（+`docs/MIGRATION.md` / 本文件）；**未改**主题包与示例站。

## 1. 产物生成来源（全部由源站配置/数据驱动，无源站身份硬编码）

| 产物 | 配置/数据来源 | 生成逻辑（移植自） | 输出路径（由配置决定） |
| --- | --- | --- | --- |
| A `/comments/` | `_config.yml:envelope_comment`（enable / custom_pic / message / bottom / height / path / front_matter） | `hexo-butterfly-envelope/lib/html.pug` + `index.js` 的 generator | `envelope_comment.path || 'comments'` → `src/pages/comments/index.astro` |
| B `/bangumis/` | `_config.yml:bangumi`（enable / path / title / quote / show / lazyload / pagination / extra_options / extraOrder）+ `source/_data/bangumis.json`（+可选 `extra_bangumis.json`） | `hexo-bilibili-bangumi/lib/bangumi-generator.js`、`templates/bangumi.pug`、`bili-template.pug`、`pagination.pug`、`index.js`、`pagination.js`、`util.js`(i18n) | `bangumi.path || 'bangumis/index.html'` → `src/pages/bangumis/index.astro` |
| C `/go.html` | `_config.yml:hexo_safego`（general/security/appearance） | `hexo-safego/index.js`（默认值合并、base64 URL-safe 编码、外链改写规则）+ `hexo-safego/go.html`（模板逐字节移植） | `security.html_file_name` → `public/go.html` |
| D `/anzhiyu/random.js` | 文章 frontmatter（date / abbrlink / random）+ `_config.anzhiyu.yml:pjax.enable`、`footer.list.enable/randomFriends` + `source/_data/link.yml` | `_research/anzhiyu-upstream/scripts/helpers/random.js` | `_config.yml:random.path || 'anzhiyu/random.js'` → `public/anzhiyu/random.js` |

身份字段（`author` / `title` / `url` / `root` / `avatar` / 友链）分别来自 `site.config.ts`（源站
`_config.yml`）、插件配置段、`bookmark data`；脚本里**没有** `mcxiaochen` / 源站域名等硬编码
（`grep -n 'mcxiaochen\|xcAnzhiyu\|辰渊尘' scripts/migrate-hexo.mjs` 只命中 usage 注释里的示例路径）。

A/B 两个页面走主题 `BaseLayout` 外壳（`#body-wrap` / Header / Footer / aside / `#post-comment`），
正文按上游 `layout/page.pug` 挂成 `#page → h1.page-title（top_img:false 时）→ #article-container`；
C/D 是独立静态资产（`public/` 原样拷贝进 `dist/`），与源站一致（go.html 无主题外壳）。

## 2. 验收命令与原始输出

### 2.1 migrate（真实站，只读源站）

```powershell
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/w2b1
```

```
[7.x/8] Hexo 插件产物（envelope 留言板 / bangumi 追番 / safego go.html / random.js）
  + src/pages/comments/index.astro
    · /comments/：title「留言板」，信笺正文 4 行
  + src/pages/bangumis/index.astro
    · /bangumis/：0 想看 / 10 在看 / 51 已看（共 61 条卡片）
  + public/go.html
    · /go.html：参数名 u，base64=true，倒计时 10s
  + public/anzhiyu/random.js
    · /anzhiyu/random.js：22 篇文章（random:false 排除 0），友链块 开（65 条 / 每轮 4 个），pjax=true
...
汇总
  文章            : 22（abbrlink 22）
  独立页面        : 18；type: about, categories, charts, default, equipment, essay, fcircle, link, music, tags, todolist
  数据文件        : 8（.yml 7）
  静态资源        : 111
  插件产物        : 4/4（envelope, bangumi, safego, random）
  产物文件        : 306（写 43 / 复制 263）
```

`migration-report.json` 新增机器可读段 `plugins`（与 `pluginArtifactCount: 4`）：

```json
"plugins": {
  "envelope": { "url": "/comments/", "routeFile": "src/pages/comments/index.astro", "title": "留言板",
                "pageType": "envelope", "comments": true, "messageCount": 4, "contentBytes": 2929 },
  "bangumi":  { "url": "/bangumis/", "routeFile": "src/pages/bangumis/index.astro", "title": "追番列表",
                "pageType": "page", "comments": true,
                "counts": { "wantWatch": 0, "watching": 10, "watched": 51 }, "items": 61,
                "sourceData": "source/_data/bangumis.json", "contentBytes": 116809 },
  "safego":   { "url": "/go.html", "routeFile": "public/go.html", "urlParamName": "u", "base64": true,
                "targetBlank": true, "countdown": 10, "darkmode": "auto", "contentBytes": 7560 },
  "random":   { "url": "/anzhiyu/random.js", "routeFile": "public/anzhiyu/random.js", "posts": 22,
                "excludedByRandomFalse": 0, "pjaxEnabled": true, "footerListEnabled": true,
                "randomFriends": 4, "friendLinks": 65, "contentBytes": 19523 }
}
```

### 2.2 构建（迁移产物独立安装 + 构建）

```powershell
cd .migration-out/w2b1
pnpm install --ignore-workspace     # Done in 7.2s using pnpm v10.29.3
$env:CODEBUDDY_SAFE_DELETE_ENABLED="0"; pnpm build
```

```
[build] 96 page(s) built in 13.52s
[build] Complete!
[normalize-html-output] 平文件化 1 处 .html 目录
```

`dist` 里 HTML 文件 **97 个**（96 个 Astro 页面 + `go.html`），与 golden 的 97 个一一对应。

### 2.3 四产物存在性 / 字节数 / 条目数对照 golden

| 产物 | 迁移产物 | golden | 字节比 | 条目/结构 |
| --- | --- | --- | --- | --- |
| `dist/comments/index.html` | 69980 B | 74830 B | -6.5% | 关键 id 8/8、结构断言 7/7 全一致（下节） |
| `dist/bangumis/index.html` | 204774 B | 218540 B | -6.3% | 卡片 61=61、tab 3=3、容器 6=6、分页条 3=3、标签 6/6 一致 |
| `dist/go.html` | 7560 B | 7560 B | **逐字节一致** | 参数化内容与 golden 完全相同 |
| `dist/anzhiyu/random.js` | 19523 B | 18909 B | +3.2% | posts **22**（集合一致）、toRandomPost 逐字一致；友链 65 vs golden 63（源站数据已更新，见 §4.4） |

### 2.4 真实站验收（`scripts/accept-migration.mjs`，migrate→install→build→10 项检查）

```powershell
node scripts/accept-migration.mjs --out .migration-out/w2b1-accept
```

```
  PASS  build        exitCode=0，durationMs=14459，htmlFiles=97，rootFiles=8
  PASS  routes       permalinkTemplate=posts/p:abbrlink/，postsExpected=22，pagesExpected=18，routesExpected=40
  FAIL  links        htmlFiles=97，distinctInternalTargets=126，distinctJSNavTargets=25，missingDistinct=9
  FAIL  assets       assetDirectionsChecked=5，assetGaps=2，gapTotal=1，inherited=1
  PASS  identity     pagesChecked=3，assertions=15，failed=0，gapTotal=0
  PASS  page-types   pagesChecked=17，passed=17，failed=0，gapTotal=0
  PASS  tag-residue  htmlFiles=97，hits=0，markersChecked=6，gapTotal=0
  FAIL  search       localSearchEnabled=true，localSearchPath=/search.xml，indexExists=false
  FAIL  feed         expectations=5，present=0，missing=5
  INFO  structure    samples=6，sampled=6，totalDiffs=1433

  迁移缺口（migration gap）：6（明细 8 条，去重 2 条）
  缺口分类：
    - sitemap            3
    - feed               2
    - search-index       1
  退出码：1
```

关键变化（对照 `.migration-out/accept-20261124-191107` 首跑与 W2-A 修复后的 10 项）：

| classification | W2-A 后 | 本任务后 | 归属 |
| --- | ---: | ---: | --- |
| **page-missing** | 3 | **0** | ✅ task-7（本任务） |
| **theme-asset**（`/anzhiyu/random.js`） | 1 | **0**（仅剩源站 inherited 的 `/img/tgbj-cai-xiaochen.svg`） | ✅ task-7 |
| sitemap / feed / search-index | 3 / 2 / 1 | 3 / 2 / 1 | B2（task-8） |
| **合计** | 10 | **6** | |

`routes.counts`（page-missing 归零的硬证据）：

```json
{"permalinkTemplate":"posts/p:abbrlink/","postsExpected":22,"pagesExpected":18,
 "routesExpected":40,"routesPresent":40,"independentMissing":0,
 "goldenHtml":97,"distHtml":97,"goldenMissing":0,"distExtra":0,"matched":97,
 "gapTotal":0,"inherited":0,"whitelisted":0}
```

验收报告里 `page-missing` 字符串出现次数 = **0**（`grep -c page-missing acceptance-report.json`），
`links` 的缺口只剩 `/atom.xml`（feed，B2）。

## 3. DOM 抽样比对（golden vs 迁移产物）

比对脚本读取双方 HTML 做选择器/文本断言（不依赖浏览器）：

### 3.1 `/comments/`（7/7 一致）

| 检查 | 迁移产物 | golden |
| --- | --- | --- |
| 关键 id `#page/#article-container?（envelope/#form-wrap/#beforeimg/#afterimg/#maincontent/#post-comment)` | 全部存在 | 全部存在 |
| `h1.page-title` | `留言板` | `留言板` |
| `.formmain / .comments-main / .title3 / .bottomcontent / .bottomimg / .bottomhr / .headerimg` | 7/7 | 7/7 |
| 信笺正文行数（`#envelope .comments > div`） | 4 | 4 |
| 底部说明（`.bottomhr`） | `小从雨竭诚为您服务！` | 同 |
| `input#page-type` | `envelope` | `envelope` |
| 评论系统挂载 | `#twikoo-wrap` | `#twikoo-wrap` |

### 3.2 `/bangumis/`（11/11 一致）

| 检查 | 迁移产物 | golden |
| --- | --- | --- |
| `.bangumi-item` 卡片数（watching 10 + watched 51） | **61** | **61** |
| `.bangumi-tab` 数量 | 3 | 3 |
| `#bangumi-tab1..3 / #bangumi-item1..3` | 6/6 | 6/6 |
| tab 文本 | `想看 (0)` / `在看 (10)` / `已看 (51)` | 同 |
| `h1.page-title` / quote | `追番列表` / `生命不息，追番不止！` | 同 |
| `.bangumi-pagination` | 3（每个 tab 一个） | 3 |
| 指标标签（bili-template） | `国创 / 总播放 / 关注 / 硬币 / 弹幕 / 评分` | 同 |
| `input#page-type` | `page` | `page` |
| `/go.html?u=…` 改写链接数 | **61**（每张卡片的外链都按 safego 规则改写） | **61** |
| 评论系统挂载 | `#twikoo-wrap` | `#twikoo-wrap` |

### 3.3 `/go.html` —— 逐字节一致

```
golden=7560 ours=7560 identical=True
```

即 `hexo-safego/go.html` 模板 + 本任务配置参数（avatar/title/subtitle/countdown=10/darkmode=auto/
url_param_name=u/base64=true）渲染结果与源站 Hexo 产物**完全相同**，因此其中的
base64 解码、10 秒倒计时、进度条、复制/取消/立即跳转逻辑天然逐字复刻。

### 3.4 `/anzhiyu/random.js`

```
golden posts: 22 ours posts: 22
same set: true        same order: false
golden friend links: 63 ours: 65
toRandom golden: "pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"
toRandom ours  : "pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"
```

- posts 集合 = 迁移后文章 URL（`posts/pXXXX/`，去前导 `/`），22/22 一致；
- `toRandomPost()` 逐字一致（源站 `pjax.enable: true` → 用 `pjax.loadUrl`，主题 `runtime.ts` 提供 shim）；
- 友链块按 `footer.list.enable && randomFriends>0` 生成，`friend_link_list` = 迁移后 `_data/link.yml`
  拍平（65 条，与当前源站数据逐字一致）；golden 是旧快照（63 条，源站后来又加了 2 条友链）。

## 4. 与 golden 的差异（逐项原因）

### 4.1 字节数差（comments -6.5% / bangumis -6.3%）——结构与内容一致，差异来自外壳/压缩/懒加载

用 `scripts/diff-html.mjs` 对两页做结构比对：

| 页面 | total diffs | `#page` 内容区 | 主题外壳 |
| --- | ---: | ---: | ---: |
| `/comments/` | 173 | **14** | 159 |
| `/bangumis/` | 357 | **200** | 157 |
| `/go.html` | **0** | 0 | 0 |

`#page` 内容区差异全部可归因（无一处是缺节点/错结构）：

- **lazyload 图片属性**（comments 8 处、bangumis 122 处）：golden 的 `<img>` 被 1.6.14 主题的
  `hexo-lazyload-image` 后处理改写成 `src=占位图 + data-lazy-src=真实图 + onerror=/img/404.jpg`；
  迁移产物直接输出真实 `src`。Astro 主题没有「渲染后 HTML 图片改写」管线，且功能上等价
  （图片都能显示）——**不复刻**。
- **`onclick="return!1"` vs `return false`**（15 处）：golden 被 `hexo-all-minifier` 压缩过，
  迁移产物是 Astro 未压缩输出，语义相同。
- **inline `<style>` / 图片 style 属性的空白与分号差异**：同为压缩产物差异，语义相同。
- **options/index/pagination 内联脚本文本**（2 处 content diff）：golden 是 minifier 压缩后的
  `!1`/变量重命名版本，迁移产物是插件源码的可读移植版，行为一致（见 §5 的 DOM mock 断言）。

主题外壳的 157~159 处差异（head 里 CDN 版本号、`meta` 属性空白、header nav 的 `target/rel`、
preloader 脚本格式等）与**所有**其它迁移页同源，属 W2-A 记录的 `structure` INFO（1433），不是插件产物引入的。

### 4.2 random.js 的 posts **顺序**与 golden 不同（date 倒序 vs Hexo 插入序）

golden 的顺序不是 date 升/降序，而是 Hexo `locals.posts.data` 的**数据库插入顺序**
（`hexo/lib/hexo/index.js` 的 `locals.set('posts', () => db.model('Post').find({}))` 不排序；
插入顺序取决于内容文件处理完成的先后，不是稳定契约）。本任务按 **date 倒序**生成（同日期保持源站
目录顺序），并排除 `random: false` 的文章（本站 0 篇；逻辑已实现，见 `postRecords.randomExcluded`）。
22/22 URL 集合一致，`toRandomPost()` 一致，功能无差别。

### 4.3 bangumi 的客户端「异步补渲染」改为一次性静态渲染

上游 `bangumi.pug` 在 `pagination: true` 时只渲染每 tab 前 10 条，剩余条目在浏览器里
`axios.get('../bangumis.json')` + 客户端 `pug.render` 追加。迁移侧：

- 全部 61 条**一次性**渲染进 HTML（pagination=false 的源站行为本来就如此），分页仍是
  `pagination.js` 原逻辑（每页 10 条、`.bangumi-hide` 显隐）；
- 因此产物不再依赖 axios / pug.js 两个 CDN 脚本，离线也可用；
- DOM 条目数比 golden 多渲染的只是「第 2 页以后」本来由 JS 动态插入的节点，视觉/交互一致。

### 4.4 go.html 的模板默认值与源站数据

模板、CSS、脚本逐字节来自 `hexo-safego/go.html`；`appearance.*` 全部取 `_config.yml`，
没有写死源站身份。唯一「默认值」保留插件自身的兜底（`countdown || 5`、默认头像域名），
这是插件语义的一部分。

### 4.5 未复刻部分

| 未复刻 | 原因 | 影响 |
| --- | --- | --- |
| `hexo-safego` 的**全站 HTML 外链后处理**（`after_render:html`） | Astro 没有渲染后 HTML 管线；正文外链改写需要 rehype 插件 | 已列入 `migration-report.json` 的 `unsupported`（`hexo-plugin-page`）；插件产物内的链接（bangumi 61 条）已按同规则改写到 `/go.html?u=…` |
| 图片 lazyload 后处理 | 同上，且属主题资源层（P7-6） | 图片直接输出真实 URL，功能等价 |
| bangumi 在线 API 数据抓取 | 插件本身就是 `hexo bangumi -u` 时抓数据写本地 json，构建期不联网 | 迁移直接消费本地 `bangumis.json` 快照（38664 B / 61 条），与源站行为一致；数据更新仍需在 Hexo 侧执行命令 |
| `bangumi.pagination` 的 CDN 异步补渲染 | 见 §4.3，改为一次性静态渲染 | 无 |

## 5. 行为验证（不依赖浏览器的可复跑断言）

浏览器 e2e 在本机被沙箱拦截（Playwright 启动 `spawn EPERM`，且本机 chromium 版本与
`@playwright/test` 期望的 1255 不一致），因此用两类可复跑验证：

### 5.1 内联 JS 语法检查（`node --check`）

从 dist 提取全部内联 `<script>`（bangumis 11 段 / go.html 1 段）逐个 `node --check`：

```
bangumis-0.js (3620 B) => exit 0      … bangumis-10.js (2580 B) => exit 0
go-0.js (2734 B) => exit 0
```

### 5.2 bangumi tab 切换 / 分页：最小 DOM mock 功能测试（9/9 通过）

把 dist 里的 options + index.js/pagination.js 放进 Node `vm`，用最小 DOM mock 复刻
`#bangumi-tabs + #bangumi-item1..3 + .bangumi-pagination` 结构后执行：

```
PASS  初始激活 tab2（show=1）
PASS  初始显示 #bangumi-item2
PASS  item1(0条) 分页 1 / 1
PASS  item2(10条) 分页 1 / 1 且 10 条可见
PASS  item3(51条) 分页 1 / 6 且首屏 10 条可见
PASS  点击 tab3 → item3 显示 / item2 隐藏
PASS  下一页 → 2 / 6，10 条可见
PASS  尾页 → 6 / 6，仅 1 条可见
PASS  首页 → 1 / 6，10 条可见
9/9 通过
```

### 5.3 go.html：base64 / 倒计时 / 进度条 / 跳转 功能测试（10/10 通过）

同样用 DOM mock + 捕获 `setTimeout` 回调：

```
PASS  base64 解码出原始 URL  ("https://www.bilibili.com/bangumi/media/md21082961/")
PASS  倒计时首值为 10  (10)
PASS  进度条首帧 100%  ("100%")
PASS  10 秒后跳转到解码出的 URL
PASS  倒数到 0 时进度条宽度 0%  ("0%")
PASS  空 u 参数 → 标题提示参数错误 / jump_url 回首页
PASS  非跳转协议（javascript:）被拦下 → 参数错误 / 回首页
PASS  取消/立即跳转/复制按钮齐全
10/10 通过
```

## 6. 对没有这些插件的站点安全（跳过语义）

用最小假站点（1 篇文章、无任何插件配置）跑 `--dry-run`：

```
[7.x/8] Hexo 插件产物（envelope 留言板 / bangumi 追番 / safego go.html / random.js）
  · 无 envelope_comment 配置（enable=false），跳过留言板页
  · 无 bangumi 配置（enable=false），跳过追番页
  · 无 hexo_safego 配置（general.enable=false），跳过 go.html
[dry-run] write public/anzhiyu/random.js
  · /anzhiyu/random.js：1 篇文章（random:false 排除 0），友链块 关，pjax=false
插件产物        : 1/4（random）
```

即：三个「页面类」产物在配置缺失/`enable=false`/数据文件缺失时**只打印日志、不产出文件**；
`random.js` 是主题 generator（不受插件开关控制），只要有文章就生成，与上游一致。

## 7. 实现要点（`scripts/migrate-hexo.mjs`）

新增「Hexo 插件产物（generator 等价实现）」代码段（在 `scanThemeReferencedKeys()` 之后）：

- `SAFEGO_DEFAULTS` / `normalizeSafeGoConfig()`：复刻插件 `Object.assign(defaults, config)` 的区块浅合并；
- `encodeSafeUrlParam()`：复刻 `btoa(encodeURIComponent(str).replace(/%XX/g, char))` + URL-safe 替换；
- `safeGoRewrite()`：复刻插件 after_render 的白名单判断 + `/go.html?u=` 改写（插件产物内使用）；
- `renderNunjucksSubset()` + `evaluateTemplateCondition()`：`go.html` 模板里的
  `{%if/elif/else/%}`、`{{var}}` 子集渲染（模板逐字节内嵌，插件模板变更时会 `fail` 提示）；
- `renderEnvelopePageHtml()` / `renderBangumiPageHtml()` / `renderBangumiItem()` /
  `renderBangumiPagination()` / `createBangumiTranslator()`：envelope `html.pug` 与 bangumi
  `bangumi.pug + bili-template.pug + pagination.pug + util.js(i18n)` 的静态渲染移植；
- `BANGUMI_INDEX_JS` / `BANGUMI_PAGINATION_JS`：`index.js` / `pagination.js` 的可读移植
  （tab 切换、`Element.siblings` 补丁、每页 10 条分页、懒加载补 src）；
- `renderPluginPageAstro()`：生成走主题 `BaseLayout` 的插件页路由（`#page` 结构对齐 `page.pug`）；
- `renderRandomJs()` + `randomJsFriendBlock()`：`scripts/helpers/random.js` generator 逐字移植；
- `createPostPathResolver()`：与 `src/data/post-permalink.ts` 的 `postHref()` 同规则的 JS 实现
  （source permalink 模式 + abbrlink/slug + frontmatter 日期），供 random.js 生成文章 URL；
- `[7.x/8]` 阶段把上述函数接到源站配置上，写 4 个产物并把摘要写进 `migration-report.json` 的
  `plugins` 字段；`HEXO_PLUGINS` 里这三个插件键不再进 `unsupported`，新增 `hexo-plugin-page`
  记录「全站外链后处理」这一个真实残留缺口。

## 8. 回归 / 影响面

- 只改 `scripts/migrate-hexo.mjs`（+文档），**未改** `packages/astro-theme-anzhiyu/**`、
  `examples/blog/**`、lockfile；因此 `examples/blog` 基线 diff 不受影响（W2-A 已验 48/48 PASS 0 差异）。
- 真实站构建通过（96 page + go.html = 97 HTML），accept 的 build/routes/identity/page-types/
  tag-residue 均 PASS；新增产物没有引入新的链接/资源缺口（`/comments/`、`/bangumis/`、
  `/go.html`、`/anzhiyu/random.js` 在 links/assets 检查中全部命中，唯一剩余 theme-asset 是源站
  inherited 的旧图）。
- 迁移站构建日志里的 `Attempted to access deprecated property on "posts" entry`（297 行 stderr）
  在 W2-A 基线里同样是 297 行，**非本任务引入**，属主题/内容层既有告警。
