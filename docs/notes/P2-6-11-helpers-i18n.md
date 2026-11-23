# P2-6 + P2-11 报告：12 个 Hexo helper 移植 + i18n

- 任务：P2-6（上游 `scripts/helpers/` 12 个扩展文件的 TS 纯函数移植）与 P2-11（4 个语言字典 + `t()`）
- 上游参考：`D:\Git-project\_research\anzhiyu-upstream`（只读，v1.7.1）
- 目标包：`packages/astro-theme-anzhiyu`
- 验收脚本：`node scripts/check-i18n.mjs`（83 PASS / 0 FAIL）、`node scripts/check-helpers.mjs`（269 PASS / 0 FAIL）
- 两个脚本都用 Node 24 原生 type-stripping 直接 import `.ts`（与既有 `check-loader.mjs` 一致），不引入新依赖。

## 0. 结论与交付物

| 类别 | 文件 | 说明 |
| --- | --- | --- |
| i18n 字典（原样拷贝） | `src/i18n/locales/{default,en,zh-CN,zh-TW}.yml` | 与上游 `languages/*.yml` 逐字节一致（3109/5425/5572/5492 B） |
| i18n 数据快照（生成） | `src/i18n/locales.ts` | 由 YAML 摊平生成，`check-i18n.mjs --write` 可重建；测试校验两者逐字节同步 |
| i18n 实现 | `src/i18n/index.ts` | `t()` / `tp()` / `has()` / `createI18n()` / `interpolate()`，对齐上游 `__` / `_p`（hexo-i18n） |
| helper 移植 | `src/utils/helpers.ts` | 12 个上游文件 → 19 个 helper/generator 函数 + 9 个底层工具（hexo-util / moment 等价实现） |
| i18n 验收 | `scripts/check-i18n.mjs` | 键集合对比 / 10 键抽查 / 回退 / 插值 / 复数，83 项 |
| helper 验收 | `scripts/check-helpers.mjs` | 手造 fixtures 269 项，其中 82 项是「加载上游 JS 当 oracle 逐字节对比」 |
| 导出 | `src/index.ts` | 包根导出 i18n 与 helpers（43 个值导出 + 类型导出） |
| 脚本入口 | `package.json` | 只新增 `check:i18n`、`check:helpers` 两个 scripts 条目 |

## 1. i18n（P2-11）

### 1.1 实现要点（对齐上游 `_p()` / `__`）

上游机制（`hexo/lib/plugins/filter/template_locals/i18n.ts` + `hexo-i18n`）：

1. 主题 `languages/*.yml` 在 `hexo-i18n.set()` 里被**递归摊平成点号键**（`aside.more_button`）；
2. 渲染时按语言优先级合并字典：页面 `lang` → 主题 `config.language` → `default`；
3. `__` 返回 `data[key] || key`（**缺键回退键名本身**），再做 printf 插值；
4. `_p` 是复数版：先试 `key.zero`（number 为 0）、`key.one`（number 为 1）、`key.other`，最后试 `key`；AnZhiYu 的 pug **全部用 `_p`**，包括普通标量键（无后缀时命中 `key`）。

移植后的 API：

```ts
t(key: string, lang?: string | null, ...args: unknown[]): string  // 普通翻译
tp(key: string, lang?: string | null, ...args: unknown[]): string // 复数（第一个实参是 count）
has(key, lang?): boolean
dictionary(lang?): Readonly<Record<string,string>>   // lang 覆盖 default 后的合并字典
createI18n(dicts): I18n                              // 单测/自定义字典用
```

- **回退链**：`lang 字典 → default 字典 → 键名本身`；未知语言（如 `ja`）→ `default`；空键 → `''`。
- **嵌套键**：字典在 `createI18n()` 时摊平（`a.b.c`），生产快照 `locales.ts` 已是摊平后的点号键，调用方直接写 `t('post.copyright.author')`。
- **语言别名**：`zh_CN`/`ZH-CN` → `zh-CN`，`zh-hans` → `zh-CN`，`zh-hant` → `zh-TW`，`zh` → `zh-CN`；大小写/下划线不敏感。
- **插值**：`%s`、`%d`、`%i`、`%f`、`%%`、位置参数 `%1$s`，按实参顺序消费。
  - 与上游 `sprintf-js` 的唯一差异：**实参不足时保留占位符原文**（上游会输出 `undefined`/`NaN`）。实参传满时逐字节一致；理由见 §4。
- **复数**：`tp('cart', 'en', 0|1|3)` → `.zero/.one/.other`；AnZhiYu 现有 4 个语言文件不含 plural 后缀键，`tp('aside.more_button')` 与上游 `_p` 用法等价（已测）。

上游真实插值调用点（说明插值顺序有业务含义）：`_p('post.copyright.copyright_content', license_url, license, config.url, config.title)`（4 个 `%s`）、`_p('about.learn_more_at', 站点A, 站点B)`（中英文顺序相反）、`_p('about.total_people', '<b>N</b>')`、`_p('about.enjoy_music_with', name)`。

### 1.2 4 个语言的键数量与键集合差异

| 语言 | 文件字节 | 摊平后键数 | 相对并集缺失 |
| --- | --- | --- | --- |
| `default` | 3109 | **91** | 75 |
| `en` | 5425 | **165** | 1（`post.edit`） |
| `zh-CN` | 5572 | **165** | 1（`post.edit`） |
| `zh-TW` | 5492 | **165** | 1（`post.edit`） |
| 并集 | — | **166** | — |

- **`en` / `zh-CN` / `zh-TW` 三语键集完全一致**（165 键逐键一致，零差异）。
- **仅 `default` 有**：`post.edit`（标量「编辑」）。另 3 个语言把它拆成了 `post.edit.github` / `post.edit.yuque`（上游 pug 只用后者，见 `layout/includes/header/post-info.pug:29,32`）。因此 `t('post.edit', 'en')` 会走 default 回退拿到「编辑」——这正是「缺键回退 default」的真实样例，已纳入测试。
- **仅 3 个非默认语言有（default 缺）的 75 个键**，按首段分组：
  - `about` 25 个、`console` 12 个、`shortcut` 12 个、`flink` 9 个、`footer` 4 个、`nav` 4 个、`post` 4 个（`post.new`/`post.unread`/`post.edit.github`/`post.edit.yuque`）、`reward` 5 个。
  - 即 default.yml 停留在较老版本，`about/console/shortcut/flink/reward/nav/footer` 这批后期功能文案只在三语里存在。
- 值层面值得一提：`post.copyright.copyright_content` 在 `default`/`zh-CN`/`zh-TW` 有 4 个 `%s`（license url/name + site url/title），`en` 只有 2 个（license url/name）——组件调用时多传实参不会出错（多余实参被忽略），少传才会保留占位符。

## 2. helpers（P2-6）

### 2.1 12 个文件 → 移植函数逐个说明

「单测」列 = 该函数在手造 fixtures 段（B）的断言数；C 段是 12 个文件的 oracle 逐字节对比（共 82 项），全部 PASS。

| # | 上游文件 | 上游注册名 | 移植后签名（`src/utils/helpers.ts`） | 干什么 | 单测 |
| --- | --- | --- | --- | --- | --- |
| 1 | `aside_archives.js` | `aside_archives` | `asideArchives(options, input): string` | 按年/年+月聚合文章 + 计数，输出侧栏归档卡片（含 more 按钮、limit、transform、时间排序） | 18 PASS |
| 2 | `aside_categories.js` | `aside_categories` | `asideCategories(options, input): string` | 侧栏分类卡：parent 层级递归、expand 展开按钮、limit 预算、按 name 排序、length=0 过滤 | 14 PASS |
| 3 | `catalog_list.js` | `catalog_list` | `catalogList(items): string` | 分类/标签页顶部目录列表 HTML | 4 PASS |
| 4 | `findArchiveLength.js` | `getArchiveLength` | `getArchiveLength(input): number` | 归档页标题里的文章数：按 archive_generator 的年/月/日粒度聚合后查当前页 | 10 PASS |
| 5 | `get_version.js` | `get_version` | `getVersion(pkg?) : string` | 取主题 package.json 的 version | 2 PASS |
| 6 | `inject_head_js.js` | `inject_head_js` | `injectHeadJs(input): string` | 生成注入 `<head>` 的启动脚本：localStorage TTL、getScript/getCSS、暗色模式（3 种 autoChangeMode）、aside 状态、Apple 检测、theme-color | 14 PASS |
| 7 | `page.js` | `page_description` | `pageDescription(input): string \| undefined` | SEO 摘要：description/content/title/config 兜底 → stripHTML → 截 150 → trim → escape → 换行转空格 | 9 PASS |
| 8 | `page.js` | `get_page_fill_description` | `getPageFillDescription(input): string \| undefined` | 文章页填充描述：抽取 h1-h6 标题文本（去 a 标签/符号）+ 正文残留中文（排除 AI 摘要块） | 6 PASS |
| 9 | `page.js` | `cloudTags` | `cloudTags(options, input): string` | 标签云：按文章数比例线性分档字号、可选随机色/高亮、按名排序 | 11 PASS |
| 10 | `page.js` | `urlNoIndex` | `urlNoIndex(url?, fallbackUrl?): string` | canonical URL：只去掉结尾 `index.html` | 5 PASS |
| 11 | `page.js` | `md5` | `md5(path, urlFor): string` | `md5(decodeURI(url_for(path)))`（评论头像 etc.）；纯 TS MD5 实现 | 2 PASS（+ A 段 8 项向量/对拍） |
| 12 | `page.js` | `injectHtml` | `injectHtml(data?): string` | `theme.inject.head/bottom` 数组合并 | 3 PASS |
| 13 | `page.js` | `findArchivesTitle` | `findArchivesTitle(page, menu, input): string` | 归档页标题：page.year 走格式化，否则菜单里找 `/archives/` 键名，最后回退 `page.archives` | 7 PASS |
| 14 | `page.js` | `isImgOrUrl` | `isImgOrUrl(path): boolean` | 路径是否完整 URL 或图片扩展名 | 7 PASS |
| 15 | `random.js` | generator `random` | `randomGenerator(input): {path, data}` | 生成 `anzhiyu/random.js`：随机文章跳转 + 随机友链（pjax / friend 数量可配） | 9 PASS |
| 16 | `related_post.js` | `related_posts` | `relatedPosts(current, allPosts, env): string` | 按 tag 重合数加权排序取前 N 篇，输出相关文章卡片 | 11 PASS |
| 17 | `sort_attr_post.js` | `sort_attr_post` | `sortAttrPost(type, input): Array \| undefined` | 首页 swiper/top_group：按 index 降序 + 用最新文章补足/替换到目标长度（4 或 6） | 7 PASS |
| 18 | `tags_page_list.js` | `tags_page_list` | `tagsPageList(tags): string` | 标签/分类页列表：按文章数降序插入排序 + 条数徽标 | 5 PASS |
| 19 | `year.js` | `getAnimalIcon` | `getAnimalIcon(year): string \| undefined` | 年份 → 生肖图标 class（`parseInt(year)%12`） | 7 PASS |

底层工具（同文件导出，Phase 2 组件可直接复用）：

| 导出 | 对应上游 | 说明 |
| --- | --- | --- |
| `escapeHtml` | `hexo-util` `escapeHTML` | marked.js 同款转义（含 `/` `=` 与实体不二次转义） |
| `stripHtml` | `hexo-util` `stripHTML` | striptags 状态机移植（注释、引号内 `>`、裸 `<`、非字符串安全） |
| `prettyUrls` | `hexo-util` `prettyUrls` | `trailing_index` / `trailing_html` 两个开关 |
| `md5Hex` | `node:crypto` md5 | RFC1321 纯 TS，已与 node:crypto 对拍 |
| `toMomentLocale` | hexo date helper / moment | `zh_CN`→`zh-cn`、`default`→`en` |
| `getDateParts` | moment `year()/month()/date()` + `.tz()` | 默认 UTC，可传 IANA `timezone`（Intl） |
| `monthName` / `formatMomentLike` | moment `format()` | moment 语言表对齐（`zh-tw` 的 `MMMM` 是「五月」而不是 Intl 的「5月」）；token 支持 `YYYY YY MMMM MMM MM M DD D` |
| `compareValues` | warehouse `Query.sort` 比较器 | 数字按数值、其余按 `>`/`<`（见 §4 假设） |

### 2.2 依赖 Hexo 运行时对象的地方与处理（问题 4）

12 个文件**全部**依赖 Hexo 运行时（`this` / 全局 `hexo`），没有一个能原样当纯函数。处理方式是「**依赖显式注入 + 数据显式传入**」，逐项映射：

| 上游用法 | 处理 | 涉及 helper |
| --- | --- | --- |
| `this.config` / `hexo.config`（archive_dir/timezone/language/category_dir/date_format/description/archive_generator/random.path） | 拆成显式输入字段（`archiveDir`/`timezone`/`language`/`categoryDir`/`dateFormat`/`config`/`archiveGenerator`/`path`） | aside_archives、aside_categories、findArchiveLength、page_description、findArchivesTitle、related_posts、random |
| `this.theme` / `hexo.theme.config`（darkmode/aside/theme_color/related_post/home_top.swiper/aside.card_archives.format） | 传入对应配置对象或字段（`darkmode`/`aside`/`themeColor`/`relatedPost`/`swiperEnable`/`archiveFormat`） | inject_head_js、related_posts、sort_attr_post、findArchivesTitle |
| `this.site.posts` / `this.site.categories` / `hexo.locals.get()` | 直接传**普通数组**；排序/分页/过滤在函数内做 | aside_archives、aside_categories、catalog_list、findArchiveLength、sort_attr_post、tags_page_list |
| `this.page` | 显式 `page` 参数 | page_description、get_page_fill_description、findArchivesTitle、findArchiveLength |
| `this.url_for` | 注入 `urlFor(path)`（Phase 2 组件传自己的 URL 拼接器；测试用 `p => '/'+p` 等） | 除 get_version/year 外基本都用 |
| `this._p` | 注入 `t(key, ...args)`：生产用 `(k, ...a) => t(k, lang, ...a)` 绑定当前页面语言 | aside_archives、aside_categories、findArchivesTitle、related_posts |
| `this.escape_html` | 默认用本文件的 `escapeHtml`，`relatedPosts` 允许 env 覆盖 | related_posts |
| `this.date`（moment 格式化） | 注入 `formatDate(value, format)`；`relatedPosts` / `findArchivesTitle` 必须由调用方提供（Phase 2 接 `date_format` 渲染） | related_posts、findArchivesTitle |
| `post.date` 的 moment 对象（`.clone()/.year()/.month()/.date()/.format()/.locale()/.tz()`） | `DateLike` → `getDateParts()` + `formatMomentLike()`；`timezone` 用 `Intl` 实现 | aside_archives、findArchiveLength |
| `this.fragment_cache('createArchiveObj', cb)` | 去掉缓存，直接现算（构建期函数调用量小） | findArchiveLength |
| `hexo.extend.generator.register('random', ...)` | 改成返回 `{path, data}` 的纯函数 | random.js |
| `require('crypto').createHash('md5')` | 纯 TS `md5Hex`（避免把 node:crypto 带进浏览器 bundle） | page.js `md5` |
| `require('hexo-util')`（stripHTML/escapeHTML/prettyUrls） | 本文件内等价实现（源码对照 hexo-util） | page_description、get_page_fill_description、urlNoIndex |
| Hexo `Query`（`.sort(orderby, order)` / `.limit` / `.find({parent})` / `.filter` / `.reduce` / `.forEach` / `.length`） | 在普通数组上复刻语义（`prepareQuery`、`compareObjects` 等）；oracle 里用 `FakeQuery` 模拟上游 Query | aside_archives、aside_categories、findArchiveLength、cloudTags、getArchiveLength |

结论：**移植后没有函数依赖 Hexo 运行时**；剩下的外部依赖只有两个注入点（`urlFor`、`t`/`formatDate`）和全球化对象（`Intl`、`TextEncoder`、`Math.random`）。`cloudTags` 的随机色与 `randomGenerator` 生成的脚本内随机逻辑保持上游行为；`cloudTags` 额外支持注入 `random` 以便测试/稳定 diff（上游没有这个能力，见 §4）。

### 2.3 测试策略（`scripts/check-helpers.mjs`，269 项）

- **A 段（36 项）**：hexo-util / moment 等价实现。`escapeHtml`/`stripHtml`/`prettyUrls` 手写用例；`md5Hex` 跑 RFC1321 向量（空串/abc/message digest/alphabet/80 字符跨 block/中文）并与 `node:crypto` 对拍 7 个样例；`getDateParts` 含 `Asia/Shanghai` 跨日、非法日期抛错；`monthName` 覆盖 `zh-tw` 的 moment 表。
- **B 段（151 项）**：19 个移植函数的手造 fixtures。重点覆盖任务点名的 5 个：
  - `pageDescription`：优先级、150 字符截断 + trim、转义在 strip **之后**、换行转空格、全空 undefined；
  - `cloudTags`：比例分档（length 1/3/10 → min/中间/max 字号）、`limit`、单档全 min、`unit=rem` 的 `toFixed(2)` 去尾零、highlightTags 追加样式、注入确定性 random 校验 rgb；
  - `urlNoIndex`：`index.html` 去尾、普通 `.html` 保留（上游 `trailing_html: true`）、fallback；
  - `relatedPosts`：tag 重合权重（2 个 tag 的排前面）、排除当前文章、limit、cover=false→randomcover、created/updated 图标、标题转义；
  - `findArchivesTitle`：page.year/month 分支与 format、扁平菜单命中键名、**嵌套菜单因上游忽略递归返回值而回退**（如实复刻）、无菜单回退。
- **C 段（82 项，oracle）**：见 §2.4。

### 2.4 上游 oracle：直接执行上游 JS 做逐字节对比

`check-helpers.mjs` 用 `new Function('hexo','require','module','exports', source)` 加载 `_research/anzhiyu-upstream/scripts/helpers/*.js`，构造假 Hexo 上下文：

- `hexo.extend.helper.register` / `generator.register` 捕获注册函数；
- 假 `this`：`config` / `theme` / `site` / `page` / `url_for` / `_p` / `date` / `escape_html` / `fragment_cache`；
- 假 `Query`（`FakeQuery`）：`sort/limit/find/filter/reduce/forEach/map/length`；
- 假 `moment`（`fakeMoment`）：`clone/year/month/date/locale/tz/format/valueOf`，月份表按 moment 语言数据独立硬编码；
- `require` mock：`hexo-util` → 测试内独立实现的参照版（简单正则 stripHTML 等，fixtures 不含引号内 `>`），`crypto` → 真 `node:crypto`，`../../package.json` → 读真实上游 package.json。

然后用**同一组 fixtures** 分别跑上游函数与 TS 移植，逐字节比较输出：

| 上游文件 | oracle 用例 | 结果 |
| --- | --- | --- |
| `aside_archives.js` | 7 组 options（limit/show_count/order/transform/yearly）+ en 语言 | 8/8 PASS |
| `aside_categories.js` | 6 组 options（expand 三态/show_count/limit/depth） | 6/6 PASS |
| `catalog_list.js` | categories | 1/1 PASS |
| `findArchiveLength.js` | 年/月 ×4 + daily + enable=false | 6/6 PASS |
| `get_version.js` | 真实上游 package.json | 1/1 PASS |
| `inject_head_js.js` | 4 组 darkmode/aside/theme_color 组合 | 4/4 PASS |
| `page.js`（8 个 helper） | page_description ×5、fill_description ×3、cloudTags（Math.random 打桩）×4、urlNoIndex ×6、md5 ×3、injectHtml ×4、findArchivesTitle ×9、isImgOrUrl ×5 | 39/39 PASS |
| `random.js` | 3 组 pjax/footer 组合（path + data） | 6/6 PASS |
| `related_post.js` | created+escape+权重、updated+limit、无匹配 | 3/3 PASS |
| `sort_attr_post.js` | swiper_list/top_group_list × swiper 开关 | 4/4 PASS |
| `tags_page_list.js` | tags / categories | 2/2 PASS |
| `year.js` | 1990-2030 全量年份 | 1/1 PASS |

这是「不要瞎猜，直接对照上游行为」的硬证据：oracle 段不是我自己写期望值，而是**执行上游代码**得到的输出。上游目录缺失时该段显式 SKIP（可用 `THEME_UPSTREAM_HELPERS` 指定路径）。

## 3. 两个测试脚本的原始输出

### 3.1 `node scripts/check-i18n.mjs`

```text
[check-i18n] 已生成 src\i18n\locales.ts                     ← 仅 --write 时出现；本节为校验跑
[check-i18n] PASS locales.ts 与 locales/*.yml 同步（YAML 为唯一事实源） — 逐字节一致
[check-i18n] === 1. 4 个语言字典的键数量与键集合差异 ===
[check-i18n] 键集合并集: 166 个键
[check-i18n] PASS default 键数量 = 91 — 实际 91
[check-i18n] PASS en 键数量 = 165 — 实际 165
[check-i18n] PASS zh-CN 键数量 = 165 — 实际 165
[check-i18n] PASS zh-TW 键数量 = 165 — 实际 165
[check-i18n] PASS 键集合并集 = 166（default 91 + 三语独有 75） — 实际 166
[check-i18n] PASS default 相对并集缺失 75 个 — 实际 75
[check-i18n]   default 相对并集缺失的键（按首段分组）:
[check-i18n]     about (25): about.charge_for_ta, about.data, … about.visit_stats
[check-i18n]     console (12): console.articles, … console.toggle_music
[check-i18n]     flink (9): flink.about_me, … flink.title
[check-i18n]     footer (4): footer.back_to_top, footer.cc_license, footer.friend_links, footer.refresh_friends
[check-i18n]     nav (4): nav.random_post, nav.search, nav.toggle_menu, nav.travelling
[check-i18n]     post (4): post.edit.github, post.edit.yuque, post.new, post.unread
[check-i18n]     reward (5): reward.button, reward.list, reward.list_desc, reward.thanks, reward.title
[check-i18n]     shortcut (12): shortcut.about, … shortcut.toggle_mode
[check-i18n] PASS en 相对并集缺失 1 个 — 实际 1
[check-i18n]   en 相对并集缺失: post.edit
[check-i18n] PASS zh-CN 相对并集缺失 1 个 — 实际 1
[check-i18n]   zh-CN 相对并集缺失: post.edit
[check-i18n] PASS zh-TW 相对并集缺失 1 个 — 实际 1
[check-i18n]   zh-TW 相对并集缺失: post.edit
[check-i18n] --- 相对于 default 的差异（彼此缺的键）---
[check-i18n] en vs default: 该语言独有 75 个，仅 default 有 1 个
[check-i18n]   仅 default 有: post.edit
[check-i18n]   该语言独有分组: about, console, flink, footer, nav, post, reward, shortcut
[check-i18n] zh-CN vs default: 该语言独有 75 个，仅 default 有 1 个
[check-i18n] zh-TW vs default: 该语言独有 75 个，仅 default 有 1 个
[check-i18n] PASS en / zh-CN / zh-TW 三语键集完全一致 — 165 键逐键一致
[check-i18n] === 2. 抽查 10 个键逐字翻译 ===
[check-i18n] PASS 抽查键数量 = 10 — 实际 10
[check-i18n] PASS default t('aside.card_archives') — 实际 "归档" / 期望 "归档"
[check-i18n] PASS en t('aside.card_archives') — 实际 "Archives" / 期望 "Archives"
[check-i18n] PASS zh-CN t('aside.card_archives') — 实际 "归档" / 期望 "归档"
[check-i18n] PASS zh-TW t('aside.card_archives') — 实际 "歸檔" / 期望 "歸檔"
…（10 键 × 4 语言 = 40 项，全部 PASS）…
[check-i18n] === 3. 缺键回退 / 未知语言 / 别名 ===
[check-i18n] PASS 真实回退: en 缺 'post.edit' → 回退 default('编辑') — "编辑"
[check-i18n] PASS 真实回退: zh-TW 缺 'post.edit' → 回退 default('编辑') — "编辑"
[check-i18n] PASS 嵌套键命中: post.edit.github — "Edited on GitHub"
[check-i18n] PASS 未知键 → 回退键名本身（上游 __ 语义） — "not.a.real.key"
[check-i18n] PASS 空键 → 空串（上游 `_p`/`__` 语义） — ""
[check-i18n] PASS 未知语言 'ja' → 回退 default — "查看更多"
[check-i18n] PASS 未知语言 'default' → default 字典 — "归档"
[check-i18n] PASS 别名 zh_cn → zh-CN — "标签"
[check-i18n] PASS 别名 ZH-TW → zh-TW — "標籤"
[check-i18n] PASS has() 命中
[check-i18n] PASS has() 未命中
[check-i18n] PASS resolveLanguage 未知 → default — default
[check-i18n] PASS 自定义字典：en 命中 — "default value"
[check-i18n] PASS 自定义字典：zh-CN 缺键回退 default — "兜底值"
[check-i18n] PASS 自定义字典：未知语言回退 default — "仅默认"
[check-i18n] PASS 自定义字典：嵌套原始字典被摊平 — "仅默认"
[check-i18n] PASS 自定义字典：dict 合并 lang 覆盖 default — ["a.b","onlyDefault","enOnly"]
[check-i18n] === 4. 插值（printf 风格）===
[check-i18n] PASS interpolate('%s-%s', ['a','b']) — "a-b"
[check-i18n] PASS interpolate('%%') — "%"
[check-i18n] PASS interpolate('%d/%i/%f', [3,'4','1.5']) — "3/4/1.5"
[check-i18n] PASS interpolate 位置参数 %2$s %1$s — "B A"
[check-i18n] PASS 实参不足保留占位符（与上游 undefined 输出不同，见报告） — "a-%s"
[check-i18n] PASS t('about.total_people','zh-CN','<b>3</b>') — "共 <b>3</b> 人"
[check-i18n] PASS t('about.learn_more_at','zh-CN',A,B) — "在 A 了解更多关于 B"
[check-i18n] PASS t('post.copyright.copyright_content','en',url,license) — "All articles …"
[check-i18n] PASS t('post.copyright.copyright_content','zh-CN',...) 4 个 %s — "本博客所有文章…"
[check-i18n] === 5. 复数与上游 `_p()` 用法 ===
[check-i18n] PASS 普通键经 tp(): tp('aside.more_button','zh-CN') — "查看更多"
[check-i18n] PASS tp zero — "no items"
[check-i18n] PASS tp one — "one item"
[check-i18n] PASS tp other 带 %d 插值 — "3 items"
[check-i18n] PASS tp 缺复数键 → 回退键名 — "missing"
[check-i18n] 结果: PASS（通过 83 项，失败 0 项）
```

完整输出 115 行，可由 `node scripts/check-i18n.mjs` 逐字复现（上表只对长 PASS 明细做了 `…` 省略，未改动任何失败/计数信息）。

### 3.2 `node scripts/check-helpers.mjs`

```text
[check-helpers] === A. hexo-util 等价实现：escapeHtml / stripHtml / prettyUrls / md5 / 日期 ===
[check-helpers] === B1. aside_archives → asideArchives（按月分组 / 计数 / limit / more 按钮）===
[check-helpers] === B2. aside_categories → asideCategories（层级 / 展开 / limit / more）===
[check-helpers] === B3. catalog_list → catalogList ===
[check-helpers] === B4. findArchiveLength → getArchiveLength ===
[check-helpers] === B5. get_version → getVersion ===
[check-helpers] === B6. inject_head_js → injectHeadJs ===
[check-helpers] === B7. page_description → pageDescription ===
[check-helpers] === B8. get_page_fill_description → getPageFillDescription ===
[check-helpers] === B9. cloudTags → cloudTags（比例分档）===
[check-helpers] === B10. urlNoIndex → urlNoIndex ===
[check-helpers] === B11. md5 → md5 ===
[check-helpers] === B12. injectHtml → injectHtml ===
[check-helpers] === B13. findArchivesTitle → findArchivesTitle ===
[check-helpers] === B14. isImgOrUrl → isImgOrUrl ===
[check-helpers] === B15. random.js → randomGenerator ===
[check-helpers] === B16. related_post → relatedPosts（tag 权重排序）===
[check-helpers] === B17. sort_attr_post → sortAttrPost（补足 / 截断）===
[check-helpers] === B18. tags_page_list → tagsPageList ===
[check-helpers] === B19. year.js → getAnimalIcon ===
[check-helpers] === C. 上游 oracle：加载 _research 上游 helper 源码逐字节对比 ===
[check-helpers] PASS 上游 12 个 helper 源文件可读 — 12/12
[check-helpers] PASS oracle aside_archives({"limit":2})
[check-helpers] PASS oracle aside_archives({"type":"yearly","limit":0})
[check-helpers] PASS oracle aside_archives en 语言
[check-helpers] PASS oracle aside_categories({"limit":8,"expand":true})
[check-helpers] PASS oracle catalog_list(categories)
[check-helpers] PASS oracle getArchiveLength({"year":2024})
[check-helpers] PASS oracle get_version（真实上游 package.json） — 1.7.1
[check-helpers] PASS oracle inject_head_js(autoChangeMode=1)
[check-helpers] PASS oracle page_description({"description":"plain desc","content":"<p>content</p>"})
[check-helpers] PASS oracle get_page_fill_description({"content":"<h2>第一节</h2>…"})
[check-helpers] PASS oracle cloudTags({"minfontsize":10,"maxfontsize":20,"color":true})
[check-helpers] PASS oracle urlNoIndex(this.url=https://example.com/current/index.html)
[check-helpers] PASS oracle md5(post/1/) — 实际 8fe3d8e1957837bdc87f13ce2d3b906d / 期望 8fe3d8e1957837bdc87f13ce2d3b906d
[check-helpers] PASS oracle findArchivesTitle({"year":2024,"month":5}, menu=null)
[check-helpers] PASS oracle isImgOrUrl(a.svg?x=1) — 实际 true / 期望 true
[check-helpers] PASS oracle random data(pjax=true, footer=true)
[check-helpers] PASS oracle related_posts（created + escape + 权重排序）
[check-helpers] PASS oracle sort_attr_post(top_group_list, swiper=true) — 实际 ["p3","p4","p2","p1"] / 期望 ["p3","p4","p2","p1"]
[check-helpers] PASS oracle tags_page_list(tags)
[check-helpers] PASS oracle getAnimalIcon(1990-2030 全量)
[check-helpers] 结果: PASS（通过 269 项，失败 0 项，跳过 0 项）
```

分段 PASS 统计（由日志逐行统计）：

| 段 | 内容 | PASS |
| --- | --- | --- |
| A | hexo-util / moment / md5 / 日期工具 | 36 |
| B1 | aside_archives → asideArchives | 18 |
| B2 | aside_categories → asideCategories | 14 |
| B3 | catalog_list → catalogList | 4 |
| B4 | findArchiveLength → getArchiveLength | 10 |
| B5 | get_version → getVersion | 2 |
| B6 | inject_head_js → injectHeadJs | 14 |
| B7 | page_description → pageDescription | 9 |
| B8 | get_page_fill_description → getPageFillDescription | 6 |
| B9 | cloudTags → cloudTags | 11 |
| B10 | urlNoIndex → urlNoIndex | 5 |
| B11 | md5 → md5 | 2 |
| B12 | injectHtml → injectHtml | 3 |
| B13 | findArchivesTitle → findArchivesTitle | 7 |
| B14 | isImgOrUrl → isImgOrUrl | 7 |
| B15 | random.js → randomGenerator | 9 |
| B16 | related_post → relatedPosts | 11 |
| B17 | sort_attr_post → sortAttrPost | 7 |
| B18 | tags_page_list → tagsPageList | 5 |
| B19 | year.js → getAnimalIcon | 7 |
| C | 上游 oracle（12 文件逐字节对比） | 82 |
| **合计** | | **269** |

## 4. 遗留问题与已知差异

1. **`relatedPosts` / `findArchivesTitle` 的日期格式化仍需调用方注入**：上游用 `this.date(value, hexo.config.date_format)`（moment）。移植版把 `formatDate` 设为必填注入点，自身不猜 moment 语义。Phase 2 组件接文章页/归档页时需提供一个 `date_format` → 字符串的格式化器（可复用 `formatMomentLike`，但 `date_format: 'relative'`/`'date'` 这类关键字语义在 Hexo date helper 里是另一套分支，需组件层决定）。**这是 Phase 2 接线时必须补的一处**。
2. **warehouse `Query.sort` 比较器是假设**：`asideCategories`（分类按 name）、`cloudTags`（tag 按 name）在移植里用「数字按数值、其他按 `>`/`<`」比较。这是从 warehouse 源码行为推断的实现（未在本地用真实 warehouse 跑过），中文/大小写混合名的排序若与真实 Hexo 输出不同，会在 P2-13 HTML diff 里暴露。oracle 段的 `FakeQuery` 用同一比较器，因此**不**独立证明真实 warehouse 排序；列为待复核项。
3. **moment 解析/时区 quirks 未完全复刻**：`getDateParts` 默认按 **UTC** 取年月日（Astro content collection 的 `date` 语义），可选 IANA `timezone` 走 `Intl`；上游 Hexo 是「moment 本地时区（或 config.timezone）」。对 `-05:00` 这类负时区，date-only front-matter 的分档可能与 Hexo 差一天。当前不阻塞（fixtures 与默认 UTC 构建一致），但若视觉 diff 出现归档月份错位，先查这里。
4. **`asideArchives` 的 `limit` 缺省保留上游 NaN 行为**：上游 `Math.min(len, undefined)` 得 `NaN` → 渲染空列表；移植如实保留（`limit === 0` 才是「全部」）。组件调用**必须**传 limit（上游 pug 一直传 `theme.aside.card_archives.limit`）。
5. **两处上游缺陷按「安全优先」改写（已在代码 `@deviation` 标注）**：
   - `getArchiveLength`：上游找不到当前归档时 `data.find(...).count` 抛 TypeError，移植返回 `0`；
   - `urlNoIndex`：上游 url 与 `this.url` 都为空时把 `undefined` 传给 `prettyUrls` 抛 TypeError，移植回退 `''`。
6. **i18n 插值在实参不足时的行为与上游不同**：上游 `sprintf-js` 会输出 `undefined`/`NaN`，移植保留占位符原文。实参传满时逐字节一致；若 P2-13 的 HTML diff 出现「异常文案」，优先怀疑组件漏传参数而不是移植。
7. **`cloudTags` 的随机色会让 SSG 输出不稳定**：上游浏览器/服务端渲染也随机，但 Astro 每次构建都会变；移植支持注入 `random`（上游没有），Phase 2 组件若要做稳定 HTML diff，应注入确定性 random 或在 diff 配置里关掉 `color`。`random.js` 生成的脚本里保留 `Math.random` 是正确行为（运行时随机），不影响构建 diff。
8. **`locales.ts` 是生成快照**：YAML 是唯一事实源，改了 YAML 必须跑 `node scripts/check-i18n.mjs --write`；忘记重跑时 `check-i18n` 会 FAIL（同步校验）。
9. **未覆盖**：pug 调用点尚未迁移（属 Phase 2/3 组件任务）；视觉 diff（P2-13）未对 helper 输出做页面级验证；`stripHtml` 是 striptags 状态机重写，复杂「引号内含 `>` + 嵌套注释」边界只用简单 fixtures 验证（oracle 的 hexo-util 参照实现也是简单正则版）。`sortAttrPost` 的「超出目标长度」分支如实复刻上游的「替换尾部但**不缩短长度**」行为（已用测试固化）。
10. **`default.yml` 版本滞后**：上游 default 只有 91 键，缺 about/console/shortcut 等 75 个新功能键。运行时 `lang=default` 的站点这些文案会显示键名。是否需要用 zh-CN 补齐 default 属于上游数据问题，不在本任务改动范围（未改上游 YAML 任何字节）。

## 5. 12 个 helper 与 i18n 是否可被 Phase 2 组件直接使用

**可以直接用，但有两处接线必须由组件层完成。**

- helper 侧：19 个函数 + 9 个底层工具全部是纯函数，已从包根导出（`import { asideArchives, cloudTags, relatedPosts, t, tp } from 'astro-theme-anzhiyu'`），无 Hexo 依赖、无新 npm 依赖；`asideArchives` / `asideCategories` / `catalogList` / `tagsPageList` / `injectHeadJs` / `randomGenerator` 这类「数据/配置进 → HTML/脚本文本出」的函数可以直接喂 Astro content collection 数据；82 项上游 oracle 逐字节对比保证了输出形态与上游一致。
- i18n 侧：`t(key, lang)` / `tp(key, lang, ...)` 可直接替代 pug 里的 `_p('...')`（把页面 `lang` 显式传进去即可）；`root` 包导出含 `LANGUAGES`、`has`、`dictionary`，组件可据此做语言切换与缺键检查；4 个语言字典键集三语一致、default 兜底已用真实缺键样例（`post.edit`）验证。
- **必须补的两处接线**：① `relatedPosts` / `findArchivesTitle` 需要组件注入 `formatDate(date, format)`（`date_format` 渲染）；② `asideArchives` 必须传 `limit`（上游 NaN 行为），`cloudTags` 若要稳定 HTML diff 需注入确定性 `random`。这两点不阻塞 Phase 2 开工，但 P2-8（文章页相关文章）/P2-9（归档页标题）接线时不做会直接表现为空白/异常日期。

---

## 附录：本次使用的上游参考（外部资料）

- Hexo i18n 机制（`__` / `_p` 语义、语言文件 printf 格式）：<https://hexo.io/zh-cn/docs/internationalization>
- `hexo-i18n`（字典摊平、`__`/`_p` 实现）：<https://github.com/hexojs/hexo-i18n/blob/master/lib/i18n.ts>
- `hexo` i18n 模板 locals 注入（语言优先级）：<https://github.com/hexojs/hexo/blob/master/lib/plugins/filter/template_locals/i18n.ts>
- `hexo-util`（`escapeHTML` / `stripHTML` / `prettyUrls` 源码）：<https://github.com/hexojs/hexo-util/tree/master/lib>
- `hexo` `date` helper 源码（moment 语义）：<https://github.com/hexojs/hexo/blob/master/lib/plugins/helper/date.ts>
- `warehouse` Query（`sort` / `limit` / `find` 语义）：<https://github.com/hexojs/warehouse/blob/master/src/query.ts>
- `sprintf-js`（插值行为对照）：<https://github.com/alexei/sprintf.js/blob/master/src/sprintf.js>
