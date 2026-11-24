# 从 Hexo（anzhiyu）迁移到 Astro（astro-theme-anzhiyu）

> 适用对象：`hexo-theme-anzhiyu 1.6.14` 的 Hexo 站点 → 本仓库对齐上游 `1.7.1` 的 Astro 主题。
> 迁移脚本：`scripts/migrate-hexo.mjs`。
> **源站全程只读**：脚本只读取 `_config.yml`、`_config.anzhiyu.yml`、`source/`，从不写回。

本指南按「先跑脚本 → 再按报告逐项人工收尾」的顺序组织。第 1 节是可直接复制的命令，
第 3～9 节是必须人工处理的部分（脚本只搬运，不做语义等价），第 11 节是上线前的验证清单。

---

## 0. 前置条件

| 项 | 要求 | 检查命令 |
| --- | --- | --- |
| Node | 24（仓库 `engines: >=22`，本轮实测 24.22.0） | `node -v` |
| 包管理器 | pnpm（仓库根 `packageManager: pnpm@10.29.3`，本机 9.14.4 亦可） | `pnpm -v` |
| 本仓库 | 已 clone 且 `pnpm install` 过（需要 hoisted 的 `yaml` 包） | `ls node_modules/yaml` |
| 源站 | Hexo 站根目录，含 `_config.yml` / `_config.anzhiyu.yml` / `source/_posts/` | `ls <站点目录>` |
| 备份 | 迁移前给源站打一份独立副本 | 见下方命令 |

```bash
# 0.1 切到系统 Node 24（Windows，Git Bash）
export PATH="/c/Program Files/nodejs:$PATH"
node -v

# 0.2 源站备份（迁移脚本不会动源站，但人工收尾时你可能要改内容，务必先备份）
cp -a D:/Git-project/xcAnzhiyu D:/Git-project/xcAnzhiyu.bak

# 0.3 确认源站当前是干净的，迁移后再对比一次（验证只读）
git -C D:/Git-project/xcAnzhiyu status --short
```

### 0-A 源站只读：具体保证机制

「源站只读」不是一句声明，而是下面 5 条可核查的机制（行号对应 `scripts/migrate-hexo.mjs`）：

| # | 机制 | 位置 |
| --- | --- | --- |
| 1 | 前置校验：`--out` 等于源站目录、或位于源站目录内 → 直接 `fail()` 非零退出，不产生任何写入 | `:337` |
| 2 | 目标目录已存在且非空 → 拒绝运行（不覆盖、不往已有目录里合并写入） | `:340` |
| 3 | 所有写操作收敛到 `writeOut()` / `copyOut()` 两个函数，目标路径一律 `path.join(OUT, rel)`；源站路径只出现在 `readFileSync` / `readdirSync` / `statSync` 的参数里，或 `copyFileSync(srcAbs, abs)` 的 **src** 侧 | `:146`、`:152`、`:160`、`:166`、`:168` |
| 4 | `--dry-run` 在两个写函数开头 `if (DRY) return`，完全不调用 `mkdirSync` / `writeFileSync` / `copyFileSync`；`migration-report.json` 也只 `console.log` 到 stdout，不落盘 | `:148`、`:162`、`:823` |
| 5 | 不 `chdir` 进源站、不删除/重命名源站任何文件、不回写源站 frontmatter：`layout: page` / `permalink` 只补在**目标站新建的内容文件**里 | `injectPageFrontmatter()` |

独立复核（不依赖脚本自述；`migration-report.json` 的 `sourceSiteReadOnly: true` 只是脚本声明）：

```bash
# 迁移前、迁移后各跑一次，两次输出应完全一致（本站都是空）
git -C D:/Git-project/xcAnzhiyu status --short
git -C D:/Git-project/xcAnzhiyu diff --stat

# 抽查配置文件与页面文件的 mtime，迁移前后应完全相同
stat -c '%y %n' \
  D:/Git-project/xcAnzhiyu/_config.yml \
  D:/Git-project/xcAnzhiyu/_config.anzhiyu.yml \
  D:/Git-project/xcAnzhiyu/source/about/index.md \
  D:/Git-project/xcAnzhiyu/source/_posts/2025/07/1.hello-world.md
```

---

## 1. 快速开始

**所有命令都在本仓库根目录 `D:/Git-project/astro-theme-anzhiyu` 下执行。**

```bash
# 1.1 先 dry-run：不写任何文件，完整报告打到 stdout
node scripts/migrate-hexo.mjs \
  --site D:/Git-project/xcAnzhiyu \
  --out .migration-out/xcAnzhiyu \
  --dry-run

# 1.2 确认无误后真实迁移（默认 out = .migration-out/<站点目录名>）
node scripts/migrate-hexo.mjs \
  --site D:/Git-project/xcAnzhiyu \
  --out .migration-out/xcAnzhiyu

# 1.3 可选：显式指定 1.7.1 上游参考做配置键对比
node scripts/migrate-hexo.mjs \
  --site D:/Git-project/xcAnzhiyu \
  --out .migration-out/xcAnzhiyu \
  --upstream D:/Git-project/_research/anzhiyu-upstream
```

CLI 参数：

| 参数 | 说明 |
| --- | --- |
| `--site <dir>` | **必填**，Hexo 站根目录（只读） |
| `--out <dir>` | 目标 Astro 目录，默认 `.migration-out/<站点目录名>`；非空目录会直接报错退出，不会覆盖 |
| `--dry-run` | 不创建/写入任何文件（含 `migration-report.json`），把完整报告 JSON 打到 stdout |
| `--upstream <path>` | 1.7.1 上游参考目录或 `_config.yml` 文件；不传时用主题包 `src/config/defaults.ts`（AUTO-GENERATED from 1.7.1） |
| `--no-assets` | 不复制 `source/` 下静态资源到 `public/`（大图床站点可先跳过） |
| `-h` / `--help` | 帮助 |

脚本逐文件打印 `+ <目标路径> <- <源路径>`，最后打印汇总；任一步失败会以非零退出并给出可操作提示
（缺配置、YAML 解析失败、out 落在源站内等）。汇总示例：

```
  文章            : 22（abbrlink 22）
  独立页面        : 17；type: about, categories, charts, default, equipment, essay, fcircle, link, music, tags, todolist
  数据文件        : 8（.yml 7）
  静态资源        : 112
  主题配置覆盖    : 132/136 = 97.06%
  1.7.1 新增/缺失 : 1 / 4
  无法自动迁移项  : 21（page.type, layout, config-key, comment-backend-secret, cdn, inject, hexo-only, hexo-plugin）
  产物文件        : 292（写 28 / 复制 264）
```

---

## 2. 脚本产物结构

```
.migration-out/<站点名>/
├── migration-report.json          # 机器可读报告：计数 / 键差异 / 待办 / 产物清单 / plugins
├── site.config.ts                 # 站点身份（由 _config.yml 生成）
├── anzhiyu.config.yml             # 主题配置（清洗后，主题包 loader 默认读这个文件名）
├── anzhiyu.config.original.yml    # 主题配置原文备份（含注释，人工映射时用）
├── package.json                   # astro + 主题包/插件的 file: 相对引用
├── astro.config.mjs               # 复用 examples/blog 的自定义 Markdown processor + stylus 插件
├── data/                          # source/_data/* （site-data.ts 只 glob *.yml）
├── public/                        # source/ 下非页面、非 _posts/_data 的静态资源
│   ├── <hexo_safego.html_file_name>   # Hexo 插件产物 C：安全跳转页（本站 public/go.html）
│   └── <random.path>                  # Hexo 插件产物 D：随机文章脚本（本站 public/anzhiyu/random.js）
└── src/
    ├── content.config.ts          # posts 集合，glob loader base = ./src/content/posts
    ├── content/posts/             # 文章（保留子目录）+ 独立页面（<目录名>-page.md）
    ├── data/site-data.ts          # getSiteData()，对应上游 site.data.*
    ├── pages/                     # 最小路由：index / page/[...page] / [...path] / [year]/[month]/[day]/[slug]
    │   ├── comments/index.astro   # Hexo 插件产物 A：envelope 留言板（路径由 envelope_comment.path 决定）
    │   └── bangumis/index.astro   # Hexo 插件产物 B：追番页（路径由 bangumi.path 决定）
    └── styles/                    # 从 examples/blog 复制的上游 stylus + css 样式入口
```

设计约定：

- 主题本体**不复制**，`package.json` 用 `file:../../packages/astro-theme-anzhiyu` 等相对引用指向本仓库，
  页面里的 `import ... from '<N 个 ../>/packages/...'` 由脚本按**每个文件所在目录**单独计算。
- 文章与独立页面共用 `posts` 集合，靠 `layout: page` 区分（见第 5 节）。
- `site.config.ts` 被 4 个页面路由 `import`，替换掉 `examples/blog` 里硬编码的基准站身份。

---

## 3. 站点配置（`_config.yml` → `site.config.ts`）

脚本读取并输出这些字段：
`title / subtitle / description / keywords / author / email / language / url / root /
timezone / per_page / permalink / external_link`。

```ts
// site.config.ts（结构示意）
export const site = { title, subtitle, description, keywords, author, email, language, url, root }
export const siteExtras = { timezone, per_page, permalink, external_link, index_generator,
                            pagination_dir, sourceTopLevelKeys }
```

人工核对点：

1. `keywords` 保留 YAML 原类型（本站是 16 项数组）；主题包 `SiteConfig.keywords` 允许 `string | string[]`。
2. 源站没有 `root` / `email` 时，`root` 补 `'/'`，`email` 留空 —— 需要就手工补进 `site.config.ts`。
3. `siteExtras.external_link` 目前只是**记录**，没有接进渲染管线：`[slug].astro` 里仍是
   `externalLink: { enable: true, exclude: '' }`。见 FAQ「external_link」。
4. `index_generator.per_page`（本站 14）与 `per_page`（本站 10）是 Hexo 的两个不同分页参数；
   Astro 侧首页分页走主题包 `post-list.ts` 的常量，需要时改主题配置或组件，不要在 `site.config.ts` 里改。

---

## 4. 主题配置（`_config.anzhiyu.yml` → `anzhiyu.config.yml`）

主题包 `loadThemeConfig()` 按 `anzhiyu.config.yml` → `_config.anzhiyu.yml` 的顺序在 Astro 项目根找配置，
与 `defaults` 深合并后用 **strict schema** 校验（未知顶层键直接构建失败）。因此脚本做了两件事：

1. **剔除** 1.7.1 默认配置里不存在的顶层键，生成可直接喂给 schema 的 `anzhiyu.config.yml`；
2. **原文备份** 到 `anzhiyu.config.original.yml`（含注释），供人工把值映射回来。

`migration-report.json` 的 `configKeyDelta` 给出三种口径：

| 字段 | 含义 | 本站结果 |
| --- | --- | --- |
| `coverageRate` | 站点键在 1.7.1 键集合中的命中比例 | `132/136 = 0.9706` |
| `addedIn171` | 1.7.1 新增、站点未配置 → 由 `defaults` 深合并自动补齐 | `umami` |
| `missingIn171` / `unknownKeys` | 站点在用、1.7.1 已无 / schema 不认识 → 已剔除并备份 | `Day_night_toggle_button`, `friends_lite`, `ai_summary`, `Umami` |
| `legacyOfficialKeys` / `thirdPartyKeys` | 启发式细分：扫描 1.6.14 主题源码，看是否引用过该键 | 4 / 0（本站 4 个都是 1.6.14 官方遗留键） |
| `aliasHints` | 人工迁移建议 | 见下 |

本站这 4 个键的映射建议（**脚本不自动改值**）：

```yaml
# anzhiyu.config.original.yml 里的旧键          →  anzhiyu.config.yml / 1.7.1 等价项
Umami:                     # 大写旧键           →  umami: { enable, apiHost, websiteId, token }
  umami_url_js: ...       # 前端脚本地址        →  需改为部署层注入或 inject
  umami_id: ...           # 站点 ID            →  umami.websiteId
  umami_api: ...          # API 地址           →  umami.apiHost
  umami_url: ...          # 服务器地址         →  （1.7.1 无直接对应）
ai_summary:                # AI 摘要插件配置     →  post_head_ai_description（语义不同，需核对）
Day_night_toggle_button:   # 老深色模式按钮      →  darkmode.button
friends_lite:              # 轻量友链圈          →  friends_vue（需核对）
```

操作顺序建议：先让清洗后的 `anzhiyu.config.yml` 跑通构建，再逐个把 `original.yml` 的值搬过来，
**每搬一个就 build 一次**，避免一次改太多定位不到 strict schema 报错。

---

## 5. 内容与 frontmatter

### 5.1 文章

- `source/_posts/**/*.md` 原样复制到 `src/content/posts/`，**保留子目录结构**（本站 `2025/07/…`）。
- frontmatter 不做任何改写（`schema` 用 `.passthrough()`，自定义字段不会丢）。
- 文章路由是 `/YYYY/MM/DD/(abbrlink || id)/`：`abbrlink` 优先。本站 22/22 篇都有 `abbrlink`，
  所以子目录不会造成嵌套 URL；**没有 abbrlink 的文章**要补 `abbrlink`，或把文章扁平化到 `posts/` 根。
- `content.config.ts` 的 schema 复用 `examples/blog`，`date` / `updated` 按 Hexo 时区语义归一化（见 FAQ「时区」）。

### 5.2 独立页面

`source/<目录>/index.md` → `src/content/posts/<目录>-page.md`，frontmatter **原样保留**并在末尾补两行：

```yaml
layout: page          # 缺失时补；Astro 的 [...path].astro 靠它过滤独立页面
permalink: /<目录>/    # 缺失时按目录名补；已有 permalink 时保留原值
```

`[...path].astro` 按 `page.type` 分发，标准类型共 12 种：

```
tags / categories / link / essay / room / about / album /
album_detail / music / equipment / fcircle / default
```

不在列表里的 `type` 会落到 `DefaultPage`（只渲染正文，专属布局和数据丢失）。本站需要人工处理的页面：

| 页面 | 问题 | 处理 |
| --- | --- | --- |
| `charts/index.md` | `type: charts` 非标准 | 在 `[...path].astro` 加分支，或改造成自定义 Astro 页面 |
| `todolist/index.md` | `type: todolist` 非标准 | 同上；数据来自 `data/todolist.yml`，需自己接 |
| `log/index.md` | `layout: sitetime`（不是 `page`） | 不会命中 `[...path].astro`，URL 会 404；需专用路由或改 `layout: page` |
| `uitest/index.md` | 676 个 Hexo tag，含未闭合 `{% tabs %}` | 见 FAQ「tag 语法」 |

**两条真实缺口（Phase 3 / Phase 7 已知边界，脚本如实标注、不假装支持）：**

1. `charts` 页 `type: charts` 未分发。Astro 侧 `[...path].astro` 的 `case` 只分发
   `tags / categories / link / essay / room / about / album / album_detail / music /
   equipment / fcircle / default`（12 种），其余一律落到 `DefaultPage`，只渲染正文；
   `charts` 的专属布局与数据不会迁移。脚本把 `page.type: charts`（以及 `todolist`）写进
   `migration-report.json` 的 `unsupported`，**没有**生成任何分支来假装支持。
2. `layout: sitetime` 页会 404。`[...path].astro` 的 `getStaticPaths` 用
   `entry.data.layout === 'page'` 过滤，`source/log/index.md` 声明的是 `layout: sitetime`，
   不等于 `page`，因此不会产出该 URL。脚本补 `layout: page` 时**只对缺失该字段的页面**补，
   已有的 `sitetime` 原样保留并列入 `unsupported`，避免静默改写用户语义。

这两条属于 Phase 3 页面分发与 Phase 7 迁移层的已知边界，处理方式见 §13 与
`docs/notes/P7-3-migration.md` §6.1。

### 5.3 站点数据

`source/_data/*.yml` → `data/*.yml`，由 `src/data/site-data.ts` 的 `getSiteData(name)` 读取
（对应上游 `site.data.<name>`）。注意：

- `import.meta.glob('../../data/*.yml')` **只匹配 `.yml`**；本站 `bangumis.json` 被复制过去但不会被读取，
  需要自己在页面里 `import` 或改 glob 模式。
- `examples/blog` 基准站有 `album.yml`，本站没有 → `album` 页数据为空。
- `widget.yml` / `todolist.yml` / `creativity.yml` 在现有页面组件里没有消费者，属于待接入数据。

---

## 6. 静态资源

`source/` 下除 `_posts/`、`_data/`、`.obsidian/`、所有 `index.md` 之外的文件，按原相对结构复制到 `public/`。
本站 112 个文件（约 36 MB，主要是 `img/`）。

```bash
# 上线前确认图片路径与文章里的 /img/... 引用一致
cd .migration-out/xcAnzhiyu
find public/img -type f | head
grep -rl '(/img/' src/content/posts | head
```

注意 Hexo 的 `post_asset_folder` / `relative_link` 相对路径写法在 Astro 下不生效，
文章里的图片请统一改成 `/img/...` 这类站点根绝对路径或完整 URL。

---

## 7. 评论 / 搜索 / 统计

**这些没有等价的「配置即生效」实现，脚本只把它们列进报告的 `unsupported`。** 本站命中的敏感字段：

```
valine.appId / appKey、waline.serverURL、twikoo.envId、
friends_vue.apiurl、post_head_ai_description.key、
aisummary.token、baidu_url_submit.token
```

处理原则：

1. 密钥**不要**写进 `anzhiyu.config.yml`（会进前端产物），改成部署平台的环境变量；
2. 前端组件显式读取 `import.meta.env.PUBLIC_*`，只在客户端初始化评论 SDK；
3. 确认后端服务（Twikoo/Waline/Umami/AI 摘要 API）仍可访问，CORS 允许新域名；
4. 本地搜索 `local_search` / Algolia / Docsearch 目前只有样式，没有检索逻辑，需要接 Astro 侧的搜索方案；
5. 统计（百度/Google/CNZZ/Cloudflare/Clarity/51LA/Umami）换成 `<script>` 或 `@astrojs/partytown` 之类注入。

```bash
# 部署平台配置环境变量（示意，不要提交到仓库）
#   PUBLIC_TWIKOO_ENV_ID=https://twikoo.example.com/
#   PUBLIC_WALINE_SERVER=https://waline.example.com/
#   UMAMI_API_TOKEN=...        # 仅服务端使用，不加 PUBLIC_ 前缀
```

---

### 7.1 Hexo 插件生成页（envelope 留言板 / bangumi 追番 / safego go.html / random.js）

Hexo 主题的这四类产物由**插件在 `hexo generate` 阶段生成**，不是 `source/` 里的 Markdown。
Astro 没有插件机制，`migrate-hexo.mjs` 的 `[7.x/8]` 阶段按插件源码逐份移植，**全部由源站
配置/数据驱动**（不写死站点身份）：

| 产物 | 源站配置/数据 | 迁移后落点 | 生成逻辑来源 |
| --- | --- | --- | --- |
| A. 留言板 | `_config.yml:envelope_comment`（enable / custom_pic / message / bottom / height / path / front_matter） | `<path>/index.html`（本站 `/comments/`） | `hexo-butterfly-envelope/lib/html.pug` + generator |
| B. 追番页 | `_config.yml:bangumi` + `source/_data/bangumis.json`（+可选 `extra_bangumis.json`） | `<path>/index.html`（本站 `/bangumis/`） | `hexo-bilibili-bangumi` 的 bangumi/bili-template/pagination 模板与前端脚本 |
| C. 安全跳转页 | `_config.yml:hexo_safego`（general / security / appearance） | `<security.html_file_name>`（本站 `/go.html`） | `hexo-safego/index.js` + 插件自带 `go.html` 模板 |
| D. 随机文章脚本 | 文章 frontmatter（date/abbrlink/random）+ `pjax.enable` + `footer.list.enable/randomFriends` + `_data/link.yml` | `<random.path>`（本站 `/anzhiyu/random.js`） | 主题 `scripts/helpers/random.js` generator |

行为约定：

- **对没有这些插件的站点安全**：`enable` 缺失/false、`bangumis.json` 不存在 → 只打印
  「无 envelope_comment 配置，跳过留言板页」这类日志，不产出文件；`random.js` 是主题 generator，
  只要有文章就生成（`random.path` 可改路径）。生成结果摘要写进 `migration-report.json` 的 `plugins`。
- A/B 走主题 `BaseLayout` 外壳（`#page` + `h1.page-title` + `#article-container` + 评论区），
  与其它独立页面一致；C/D 是独立静态资产（C 无主题外壳，与源站一致）。
- C 的 base64 解码 / 10 秒倒计时 / 进度条 / 复制/取消/立即跳转逻辑与源站 go.html 逐字节一致；
  B 的 tab 切换 + 每页 10 条分页是插件 `index.js`/`pagination.js` 的可读移植版（内联在页面里），
  但**不再**在浏览器用 axios+pug 二次拉 `bangumis.json` 补渲染（全部条目一次性静态渲染）。
- D 的 `posts` 按 **date 倒序**生成（排除 frontmatter `random: false`），`toRandomPost()` 按
  `pjax.enable` 选 `pjax.loadUrl` / `location.href`；`footer.list.enable && randomFriends > 0` 时
  追加页脚随机友链块（数据来自迁移后 `_data/link.yml`）。
- 已知差异/未复刻：`hexo_safego` 对**整站 HTML** 的渲染后外链改写没有迁移（正文外链仍是原始地址，
  只有插件产物内的链接已改写；见 `migration-report.json` 的 `unsupported` → `hexo-plugin-page`）；
  图片 lazyload 后处理（占位图 + `data-lazy-src`）未迁移，图片直接输出真实 URL；`random.js` 的
  posts 顺序与 golden 的 Hexo 插入序不同（golden 顺序非稳定契约，集合一致）。
- 完整验证证据（产物字节数 / DOM 抽样对照 / JS 功能断言 / accept 报告）见
  `docs/notes/P7-4-fix-plugin-pages.md`。

> 改了 `packages/astro-theme-anzhiyu/**` 之后重跑迁移站：pnpm 把 `file:` 依赖快照进
> `node_modules/.pnpm/`，旧产物仍指向旧主题代码。必须先清掉再装（见 §9.1）。

---

## 8. 自定义 CDN

Hexo 主题的 `CDN.internal_provider / third_party_provider / custom_format / option` 是服务端拼 URL 的模板逻辑，
Astro 侧不存在对应机制（资源由 Vite 打包）。本站 `inject.head` 有 8 项、`inject.bottom` 有 5 项自定义脚本/样式，
也不会自动迁移。

替代方案：

```js
// astro.config.mjs（示意）
export default defineConfig({
  // 静态资源整体走 CDN 前缀
  build: { assetsPrefix: 'https://cdn.example.com/assets' },
  // 或按部署平台配 CDN 回源，把 dist/ 整个上传到对象存储
  vite: { base: '/' },
})
```

`inject.head` / `inject.bottom` 的内容手工搬到 `src/layouts/` 或 `BaseLayout` 的 `<head>` / `<body>` 插槽。
`pjax.enable` 直接删除（Astro 是静态 MPA；需要无刷新导航再评估 View Transitions）。

---

## 9. 部署

**重要：目标站位于 monorepo 内时，普通 `pnpm install` 会被上层 workspace 接管**（见 §13），
必须用 `--ignore-workspace` 让演练站拥有自己的 `node_modules`。

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd .migration-out/xcAnzhiyu

# 9.1 独立安装（file: 依赖会链接到本仓库 packages/*）
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm install --ignore-workspace
```

> **改了主题包之后必须强制重装（常见坑）**：`file:../../packages/astro-theme-anzhiyu` 这类依赖
> 被 pnpm 在安装时**快照**进 `<目标站>/node_modules/.pnpm/astro-theme-anzhiyu@file+.../`（`.pnpm`
> 里是 store 的硬链接，不是指向源码的符号链接）。改了 `packages/astro-theme-anzhiyu/**` 后，
> 目标站构建读到的仍是**旧主题代码**，表现为「明明改了主题，迁移站页面没变」。
>
> ```bash
> # 目标站里必须做（两种任选其一，推荐 ①）
> # ① 删主题链接后强制重装（最快，保留其它依赖）
> CODEBUDDY_SAFE_DELETE_ENABLED=0 rm -rf node_modules/astro-theme-anzhiyu
> CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm install --ignore-workspace --force
> # ② 彻底清掉 node_modules 重装（最稳）
> CODEBUDDY_SAFE_DELETE_ENABLED=0 rm -rf node_modules && pnpm install --ignore-workspace
> ```
>
> `scripts/accept-migration.mjs --reuse` 复用已有 `migrated/node_modules` 时**不做**这一步：
> 主题改动后要重跑 accept 前先删 `<out>/migrated/node_modules/astro-theme-anzhiyu` 并
> `pnpm install --ignore-workspace --force`，否则验收结果基于旧主题。本任务（W2-B1）只改
> 迁移脚本、不改主题包；B2 之后如果动主题，务必按本节处理。

```bash
# 9.2 构建（多 agent 并行时先抢仓库根的构建锁）
cd D:/Git-project/astro-theme-anzhiyu
while ! mkdir .build.lock 2>/dev/null; do sleep 3; done
trap 'rmdir D:/Git-project/astro-theme-anzhiyu/.build.lock' EXIT
cd .migration-out/xcAnzhiyu
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm build

# 9.3 产物 dist/ 直接托管（Vercel / Netlify / Cloudflare Pages / GitHub Pages / 对象存储）
#     构建命令: pnpm install --ignore-workspace && pnpm build
#     输出目录: dist
#     环境变量: 见第 7 节
```

若目标站要**脱离本仓库独立存在**，把 `package.json` 里的 `file:../../packages/...` 换成已发布的
npm 包名与版本，并把 `astro.config.mjs` / `src/pages/*` 里指向 `packages/` 的 import 改成包名导入。

---

## 10. 回滚

迁移是可逆的，因为源站从未被修改：

```bash
# 10.1 立即回切：把流量/DNS 指回原 Hexo 站的部署产物即可
# 10.2 需要源码时，直接用迁移前的备份
cp -a D:/Git-project/xcAnzhiyu.bak D:/Git-project/xcAnzhiyu

# 10.3 演练产物可随时重建（脚本拒绝覆盖非空目录，先清理）
CODEBUDDY_SAFE_DELETE_ENABLED=0 rm -rf .migration-out/xcAnzhiyu
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu
```

上线前保留原 Hexo 站的最后一次 `public/` 产物至少一个小版本周期，便于对比与紧急回退。

---

## 11. 验证清单

```bash
# A. 脚本层
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu --dry-run
#    ✓ 退出码 0；stdout 有完整报告 JSON；.migration-out/ 未被创建/修改
node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu
#    ✓ 退出码 0；汇总数字与 migration-report.json 一致
git -C D:/Git-project/xcAnzhiyu status --short
#    ✓ 与迁移前一致（源站只读）

# B. 报告层
cd .migration-out/xcAnzhiyu
node -e "const r=require('./migration-report.json'); console.log(r.counts, r.configKeyDelta.coverageRate)"
#    ✓ counts.posts/pages 与源站 find 的结果一致
#    ✓ generatedFiles.length === counts.outputFiles
#    ✓ 逐条过一遍 unsupported，每条都有人工结论

# C. 内容层
find src/content/posts -name '*-page.md' | wc -l      # 独立页面数
grep -rl '^layout: page' src/content/posts | wc -l    # 应等于页面数
grep -rl '^permalink:' src/content/posts | wc -l      # 应等于页面数
grep -rn '{%' src/content/posts | wc -l               # 需要人工处理的 Hexo tag

# D. 构建与页面
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm install --ignore-workspace
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm build
#    ✓ dist/ 下首页、/about/、/tags/、/link/、文章页都在
#    ✓ 抽查 <title>/<html lang>/canonical/OG 是否用了 site.config.ts 的身份
#    ✓ 浏览器抽查：图片、评论、搜索、深色模式、代码高亮、分页

# D2. Hexo 插件产物（见 §7.1；产物路径由源站配置决定，下面以本站为例）
ls -l dist/comments/index.html dist/bangumis/index.html dist/go.html dist/anzhiyu/random.js
#    ✓ 四个文件都存在且非空（本站 69980 / 204774 / 7560 / 19523 字节）
node -e "const fs=require('fs');const h=fs.readFileSync('dist/bangumis/index.html','utf8');
  console.log('cards', (h.match(/class=\"bangumi-item\"/g)||[]).length,
              'tabs', (h.match(/class=\"bangumi-tab\" /g)||[]).length)"
#    ✓ 追番卡片数 = bangumis.json 的 wantWatch+watching+watched 之和，tab 数 = 3
node -e "const fs=require('fs');const r=fs.readFileSync('dist/anzhiyu/random.js','utf8');
  console.log('posts', JSON.parse(/var posts=(\[[\s\S]*?\]);/.exec(r)[1]).length)"
#    ✓ random.js 的 posts 数 = 文章数（排除 frontmatter random:false）
#    ✓ /go.html?u=<base64> 能正确解码并倒计时跳转；/comments/ 有 #envelope/#form-wrap/#beforeimg/#afterimg

# E. 上线后
#    ✓ 老 URL（posts/p:abbrlink/）有 301 映射或自定义 404 引导
#    ✓ sitemap / RSS / 统计 / 评论后端可用
#    ✓ 证书、CDN 回源、缓存头、CSP 允许新的第三方脚本
```

---

## 12. 常见问题（FAQ）

### 时区

源站 `timezone: ''`（空）表示「跟随机器时区」，Hexo/moment 按它解释不带时区的 frontmatter 日期；
Astro 的 YAML 解析把 `2025-07-14 16:57:18` 当成 UTC，两者差 8 小时。
`src/content.config.ts` 用 `SITE_UTC_OFFSET_MINUTES` 还原 Hexo 语义：

```ts
const SITE_UTC_OFFSET_MINUTES = 8 * 60   // 站点 timezone 有效时脚本按 Intl 自动算；为空时沿用 +08
```

- 若源站 `timezone: Asia/Shanghai`，脚本会自动写入 `480`；其他 IANA 时区按 `Intl` 计算。
- 若站点混用显式时区字面量（如 `2024-11-01T09:30:00Z`），已知限制见 `content.config.ts` 的 `hexoDate` 注释：
  YAML 解析后无法区分，会被一并按站点偏移处理，需要自定义 loader 保留原字面量。
- 迁移后务必抽查几篇文章的发布时间与归档年月是否与老站一致。

### permalink

源站 `permalink: posts/p:abbrlink/`（Hexo `hexo-abbrlink` 插件）→ 老链接形如 `/posts/p3eeb/`。
Astro 侧路由固定 `/YYYY/MM/DD/(abbrlink || id)/`（如 `/2025/07/14/3eeb/`）。**两者不兼容**：

```bash
# 生成老 → 新映射，交给部署平台做 301
cd .migration-out/xcAnzhiyu
node -e "
const fs=require('fs'); const {parse}=require('yaml');
for (const f of fs.readdirSync('src/content/posts').filter(f=>f.endsWith('.md')&&!f.endsWith('-page.md'))) {
  const t=fs.readFileSync('src/content/posts/'+f,'utf8');
  const fm=/^---\n([\s\S]*?)\n---/.exec(t); if(!fm) continue;
  const d=parse(fm[1]); const a=d.abbrlink; const date=new Date(d.date);
  if(!a||isNaN(date)) continue;
  const p=n=>String(n).padStart(2,'0');
  console.log('/posts/p'+a+'/  ->  /'+date.getUTCFullYear()+'/'+p(date.getUTCMonth()+1)+'/'+p(date.getUTCDate())+'/'+a+'/');
}
" > redirect-map.txt
```

`siteExtras.permalink` 只是留档，不会改变路由。要保留老 URL，需在 `[year]/[month]/[day]/[slug].astro` 之外
再加一条 `/posts/p[abbrlink]/` 路由或部署层重写。

### page.type

见 §5.2。`type` 不在 12 种标准类型里就只会渲染正文。特别注意 `layout` 字段：只有 `layout: page`
会进 `[...path].astro`；`layout: sitetime` 之类的非标准值会让该页 404。

### tag 语法（`{% ... %}`）

真实站点大量使用 Hexo tag 插件。`astro.config.mjs` 挂了 `remark-hexo-tag`，但它只实现了
行内 12 + 块级 12 个 tag，media/thirdparty 组仍原样透传，且**对未闭合标签会直接报错**：

```
[remark-hexo-tag] Unclosed Hexo tag `{% tabs %}`: missing `{% endtabs %}`
```

本站 39 个内容文件里 21 个含 `{%`，`uitest/index.md` 一个文件就有 676 个标签，是渲染测试页。
处理顺序：

```bash
cd .migration-out/xcAnzhiyu
grep -rl '{%' src/content/posts            # 列出所有需检查的文件
# 1) 先修/删测试页（本站 uitest），再逐个 build 定位下一个失败文件
# 2) 未支持的 tag 要么改写成等价 HTML/Markdown，要么在 remark-hexo-tag 里补 handler
# 3) {% mermaid %} 块内的 --> 依赖 smartypants: false（astro.config.mjs 已配置）
```

### external_link

源站 `external_link: { enable: true, field: site, exclude: '' }` 被写进 `siteExtras`，
但 `[slug].astro` 里仍是硬编码 `externalLink: { enable: true, exclude: '' }`。
要让 `exclude` 生效，把该处改成从 `siteExtras.external_link` 读取（本轮 P7-3 未改主题/示例站文件，列为待办）。
另外 `nofollow`、`hexo_safego` 等 Hexo 插件的外链改写也没有 Astro 等价实现，需要自定义 rehype 插件。
其中 `hexo_safego` 的**插件产物**（`/go.html` 本身 + bangumi 卡片外链）已由 §7.1 按同规则生成，
缺的是它对**整站正文**外链的统一后处理（详见 §7.1「已知差异/未复刻」）。

### 其它

- **插件页产物**：`/comments/`（envelope）、`/bangumis/`（追番）、`/go.html`（safego）、
  `/anzhiyu/random.js`（随机文章）由 `migrate-hexo.mjs` 的 `[7.x/8]` 阶段按源站配置生成，
  不需要手写；产物路径与行为差异见 §7.1 与 `docs/notes/P7-4-fix-plugin-pages.md`。
- **YAML 解析失败**：源站 frontmatter 里混入了不换行空格（本站 `log/index.md` 的 `date`），
  脚本读取时对坏 YAML 有降级（只提取 `type`/`layout`/`permalink`），但 Astro 构建时仍可能报错，需人工修源内容。
- **`data/*.json` 不生效**：见 §5.3。
- **目标目录非空**：脚本拒绝覆盖，先 `rm -rf` 或换 `--out`。
- **跨盘输出**：`--out` 与本仓库不在同一磁盘时，生成的 import 会退化成 `file://` URL，报告里会有 warning，
  建议把目标站放到同盘。

---

## 13. 已知限制 / 待办（P7-3 演练结论）

完整演练记录见 `docs/notes/P7-3-migration.md`。当前脚本产出的是**可继续开发的骨架**，不是「一键可上线」：

### 13.1 `migration-report.json` → `unsupported` 21 项：分类与处理建议

> 注：本表是 **P7-3 首次演练**的 21 项快照。P7-4 系列修复后（主题层 URL/taxonomy/page.type +
> 本任务的插件产物生成），真实站当前为 **18 项**：`page.type` 与 `layout` 已修（`charts` / `todolist` /
> `sitetime` 归一）、`friends_lite` 已由主题包兼容键支持，新增 `hexo-plugin-page` 1 项
> （safego 全站外链后处理）。以 `.migration-out/<out>/migration-report.json` 的 `unsupported` 为准。

脚本不会静默吞掉无法迁移的东西，全部逐条写进报告（含 `category / item / location / reason / action`）。
本站 8 类共 21 项：

| 类别 | 项数 | 本站条目 | 处理建议 |
| --- | --- | --- | --- |
| `page.type` | 2 | `charts`、`todolist` | 在 `[...path].astro` 增加对应分支或改造成自定义 Astro 页面；否则只渲染正文 |
| `layout` | 1 | `sitetime`（`log/index.md`） | 补专用路由，或人工改 `layout: page` 并接受默认渲染；当前 URL 会 404 |
| `config-key` | 4 | `Umami`、`ai_summary`、`Day_night_toggle_button`、`friends_lite` | 按 `configKeyDelta.aliasHints` 逐个手工映射到 1.7.1 等价键，原文在 `anzhiyu.config.original.yml` |
| `comment-backend-secret` | 8 | `valine.appId/appKey`、`waline.serverURL`、`twikoo.envId`、`friends_vue.apiurl`、`post_head_ai_description.key`、`aisummary.token`、`baidu_url_submit.token` | 改为部署平台环境变量 + 前端组件显式读取；密钥不写进前端产物（见 §7） |
| `cdn` | 2 | `CDN.custom_format / option`、`internal_provider / third_party_provider` | 改 `build.assetsPrefix` 或部署层 CDN 回源（见 §8） |
| `inject` | 2 | `inject.head` 8 项、`inject.bottom` 5 项 | 搬到布局 / `BaseLayout` 插槽 |
| `hexo-only` | 1 | `pjax.enable` | 删除，或评估 Astro View Transitions |
| `hexo-plugin` | 1 | 17 个 Hexo 插件键 | RSS/sitemap 换 `@astrojs/*`，其余换 CI 脚本或自定义插件（见 §9、§11） |

逐条明细（含每个 item 的 `reason` / `action`）在 `docs/notes/P7-3-migration.md` §6.1，
机器可读原文在 `.migration-out/xcAnzhiyu/migration-report.json` 的 `unsupported` 数组。

### 13.2 其它已知限制

1. `pnpm install` 在 monorepo 子目录会被上层 workspace 接管 → 必须 `--ignore-workspace`；
2. 真实内容的 Hexo tag 语法会让内容集合渲染失败（21/39 文件含 tag，含未闭合标签）；
3. 站点主题配置（136 键）喂给 stylus 插件时，某条件分支展开出非法 CSS
   （postcss `Unknown word cursor`）；换成 `examples/blog/theme.config.yml` 基准配置后骨架可正常构建；
4. 归档 / 标签 / 分类 / 404 路由未生成（最小路由只含首页、分页、独立页、文章页）；
5. 评论 / 搜索 / 统计 / CDN / inject / pjax 仍是要人工接的项；Hexo 插件产物里
   **envelope 留言板 / bangumi 追番 / safego go.html / random.js 已由 §7.1 生成**，
   剩余 `hexo_safego` 全站外链后处理、RSS/sitemap/search 索引仍在 `unsupported`（feed/sitemap/search
   属 W2-B2 的生成器任务）；
6. 主题包目前是 `private: true` 的 workspace 源码包，只能靠 `file:` 引用，尚未发布到 npm。

以上都不属于脚本 bug，属于「Hexo 生态 → Astro 生态」需要逐项做语义迁移的部分。
