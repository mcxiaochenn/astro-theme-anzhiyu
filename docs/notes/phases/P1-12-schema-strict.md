# P1-12：配置 schema 收紧与顶层 strict

> 任务：把 schema 顶层从 `.passthrough()` 改成 `.strict()`，未知顶层键必须失败且错误里带键名；
> 按 Phase 2/3 使用顺序展开关键区块的子键类型；更新 `check-schema.mjs` / `check-loader.mjs`。
> 依据决策 **D-P1-9**：缺键回落默认值是设计选择（ADR-005），顶层键拼错必须报错。
>
> 环境：Node v24.22.0（原生跑 `.ts`）、zod 4.6.7、上游基线 `_research/anzhiyu-upstream@72439d9`。
> 日期：2026-11-23。

## 0. 一句话结论

- 顶层已 `.strict()`：未知顶层键**在加载层硬失败**，错误信息一个键一行（多键全列）。
- 上游 `_config.yml` 133 键**仍然零错误**；11 个上游 null 顶层键仍 `z.unknown()` 且被接受。
- 按 Phase 2/3 顺序展开 **17 个顶层区块**（新增 143 条递归键声明），其余 **56 个整块宽松**顶层键保持原样。
- `check:schema` / `check:loader` 两条命令全绿（42 项），三条验收用例（未知顶层键 / 类型写错 / 上游全量）全部落进脚本。

## 1. strict 怎么实现的（关键代码）

### 1.1 schema 尾部：`.strict()`（`src/config/schema.ts:877-921`）

```ts
export const themeConfigSchema = z
  .object({
    ...looseTopLevel,
    nav: navSchema,
    // … 36 个具名区块 …
    ptool: ptoolSchema,
  })
  // P1-12：顶层 strict。未知顶层键（拼错 / 上游新增）直接失败，
  // loader.ts 把 zod 的 unrecognized_keys 展开成一个键一行。
  .strict();
```

- 选了 `.strict()` 而不是自定义 `superRefine`：zod 4 原生语义、零运行时代码，并且有 `unrecognized_keys`
  错误码可依赖。zod 4.6.7 的 `schemas.d.ts` 里只把 `.passthrough()` 标了 `@deprecated`，
  `.strict()` 没有（`strict()` 的注释是「Consider z.strictObject(A.shape) instead」，不是弃用）。
- 顶层 133 键数量不变：`KNOWN_TOP_LEVEL_KEYS = Object.keys(themeConfigSchema.shape)` 仍是 133
  （`.strict()` 不改 `shape`；实测 `check-schema` 打印 `schema declared top-level keys: 133`）。

### 1.2 loader：把 `unrecognized_keys` 展开成「键名当路径」（`src/config/loader.ts:98-121`）

zod 对未知键的 issue 是 `{ code: 'unrecognized_keys', keys: [...], path: [] }`——键名只在 message 里、
path 在根。loader 里做了一层展开：

```ts
const lines = result.error.issues.flatMap((issue) => {
  // 顶层 strict 命中的未知键：zod 只在 message 里列键名、path 为空，
  // 这里拆成一个键一行，键名直接当路径输出（见 P1-12）。
  if (issue.code === 'unrecognized_keys') {
    const prefix = issue.path.length > 0 ? `${issue.path.join('.')}.` : '';
    return issue.keys.map(
      (key) =>
        `  - ${prefix}${key}: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]`,
    );
  }
  const keyPath = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  const expected =
    'expected' in issue && typeof issue.expected === 'string'
      ? `（期望 ${issue.expected}）`
      : '';
  return [`  - ${keyPath}${expected}: ${issue.message} [${issue.code}]`];
});
throw new Error(
  `[theme-config] 配置校验失败（${source}），共 ${lines.length} 处：\n${lines.join('\n')}`,
);
```

两个细节：

1. 错误头部的「共 N 处」改成 `lines.length`（展开后的行数），多键时不再只显示 1 处；
2. 顺序保证：`{...doc, some_new_key: 1}` 这种「已知键 + 未知键」混合配置，已知键不会背锅（有断言）。

## 2. 新展开了哪些区块、多少子键、为什么选它们

### 2.1 方法

- 只加**结构类型**（boolean / string / number / nullable / 数组 / 对象），不造枚举值集合
  （`date_type` 这类仍 `z.string()`），避免把用户合法变体拦掉；
- 每个展开后的对象层都保留 `.passthrough()`：**只收紧已知子键的类型，未知子键继续透传**
  （用户魔改配置 / 上游小版本新增子键不会被误杀）。P1-12 只收紧「顶层键是否存在」这一层；
- 上游为 `null` 的子键统一 `nullable`，数组元素按上游模板真实读取的字段建模；
- 只给 `_config.yml` 里有的子键必填；`merge_config.js` 默认值里有、`_config.yml` 没列的键用
  `.optional()`（`aside.card_post_series` 整块 optional；`aside.card_tags.orderby/order`、
  `home_top.banner.top_group_banner_css` optional）。

递归键声明数用 zod 运行时内省统计（`_zod.def.shape` 递归数每个具名属性）：

| 指标 | 收紧前 | 收紧后 |
| --- | --- | --- |
| 顶层键 | 133 | 133 |
| 具名区块 schema（`z.object` 定义） | 31 | **36** |
| 整块 `looseObject` 顶层键 | 61 | **56** |
| 递归键声明总数 | 178 | **321（+143）** |
| 叶子类型位置数 | 196 | **325（+129）** |

### 2.2 逐块清单（17 个顶层区块，+143 条递归键声明）

| 区块 | 新增键声明 | 展开内容 | 为什么选它（Phase 2/3 / 上游模板依据） |
| --- | --- | --- | --- |
| `nav` | +5 | `nav.menu`：`looseArray` → `[{title, item:[{name,link,icon}]}]` | P2-4 Header / P2-5 Sidebar；`nav.pug`、`sidebar.pug` 都遍历 `nav.menu` |
| `post_meta` | +11 | `page` 5 键、`post` 6 键（`unread` 仅 post） | P2-7 首页卡片 / P2-8 文章页；`post-info.pug`、`post-ui.pug` 逐键读 |
| `aside` | +40 | `display` 3 键 + 8 张卡 + `card_post_series`(optional) | P2-5 Sidebar / P3-1 15 个 widget；`card_*.pug` 每张卡一个文件 |
| `home_top` | +13 | `category` 项 5 键、`swiper` 3 键、`banner` 4 键(+`top_group_banner_css` optional) | P2-7 首页；`top.pug` 直接读 |
| `footer` | +47 | `owner`/`runtime`/`bdageitem`/`socialBar`/`list`/`footerBar`（含 `cc`/`linkList`/`subTitle`）7 个嵌套块 | P2-4 Footer；`footer.pug` + `footerBarSubtitle.pug` |
| `comments` | +0（类型收紧 1 键） | `use`：`unknown` → `string \| string[] \| null`（上游 `comment.js` 会把逗号串切数组） | P5-1 五评论插件；Phase 2 `post-info.pug` 也读 `comments.count/use` |
| `valine` | +0（收紧 3 键） | `serverURLs`→字符串/数组/null；`master`/`friends`→`(string\|number)[]`（QQ 号可能是数字） | P5-1 |
| `waline` | +0（收紧 2 键） | `serverURL`→字符串/数组/null；`bg`→string/null | P5-1 |
| `twikoo` | +0（收紧 2 键） | `envId`/`region`→string/null | P5-1 |
| `artalk` | +0（收紧 2 键） | `server`/`site`→string/null | P5-1 |
| `giscus` | +6 | `theme`→`{light,dark}`；`option`→4 个 `data-*`（其余 `data-*` 透传） | P5-1；`giscus.pug` 直接 `themes.dark/light` |
| `reward` | +3 | `QR_code`→`[{img, link(nullable), text}]`（整体 nullable，`merge_config` 默认 null） | P2-8 文章页打赏；`reward.pug` |
| `index_post_content` | +2 | `method`/`length` number | P2-7 首页摘要；`post-ui.pug` switch |
| `related_post` | +3 | `enable`/`limit`/`date_type` | P2-8 相关推荐 + P2-10 404；`post.pug`、`404.pug` |
| `post_edit` | +3 | `enable`；`github`/`yuque`→`boolean \| string`（false 关、字符串是编辑 URL 模板） | P2-8 文章页；`post-info.pug` + `_config.yml` 注释 |
| `copy` | +4 | `enable` + `copyright{enable, limit_count}` | P2-8 / P4；`head/config.pug` 读 `copyright.limit_count` |
| `ptool` | +6 | `enable`/`share_mobile`/`share_weibo`/`share_copyurl`/`categories`/`mode(nullable)` | P2-8 文章页工具条；`ptool.pug`、`post-copyright.pug` |

合计 **17 个顶层区块、+143 条递归键声明**（其中 12 个区块是「已有键名 + 精确类型/子键」，
5 个区块是从整块宽松升级为具名 schema）。剩下的 56 个整块宽松键全是渲染工具类开关
（`canvas_*`/`pjax`/`mermaid`/`note`/`lazyload`/`console` 等），Phase 2/3 用不到，按「不必一次展开全部」留到后面。

### 2.3 两个必须写明的偏差：`pinned_post` 不存在、`menu` 不能展开

- **`pinned_post` 在上游配置里不存在。** `_research/anzhiyu-upstream/_config.yml`（133 键，基线 72439d9 /
  主题 1.7.1）没有 `pinned_post`，schema 也没有。置顶在上游是**文章 frontmatter**
  （`sticky: 10` / `top: true` / `swiper_index` / `top_group_index`，见 `tests/fixtures/sticky-top.md`），
  不是主题配置。所以任务建议里的 `pinned_post` 无键可展开，也不该为一个不存在的键编造 schema
  （否则 `KNOWN_TOP_LEVEL_KEYS` 会多出幻影键）。用 Phase 2 同样高频的 `footer` 和文章页 5 个小块补位。
- **顶层 `menu` 是上游 11 个 null 键之一**，按任务要求 #4 保持 `z.unknown()`。真正被 `nav.pug` /
  `sidebar.pug` 遍历的是 `nav.menu`（分组数组），已在 `nav` 区块里展开；顶层 `menu` 是
  `menu_item.pug` 的 `label → "link || icon"` 映射，用户填对象，`z.unknown()` 原样接受
  （实测见 §4.3）。

### 2.4 11 个上游 null 顶层键：保持 unknown，继续接受

`menu` / `social` / `baidu_analytics` / `google_analytics` / `cnzz_analytics` /
`cloudflare_analytics` / `microsoft_clarity` / `index_site_info_top` / `index_top_img_height` /
`category_ui` / `tag_ui` 仍是 `z.unknown()`，**没有**为了 strict 编造类型。
两个脚本都加了显式断言（`check-schema` 11 条 PASS；`check-loader` 1 条汇总断言），
另外实测「用户把它们填成对象/数组/字符串」也能通过（§4.3）。

## 3. 三条用例：原始命令与输出

命令都在 `packages/astro-theme-anzhiyu` 下执行；`$LASTEXITCODE` 为 PowerShell 的退出码。

### 3.0 先复现修复前的缺陷（为什么这是真缺陷）

```console
$ # 修复前（HEAD 98f11e3 的 schema）：配置里写 some_new_key: 1
$ node --input-type=module -e "import { loadThemeConfig } from './src/config/loader.ts'; ..."
[before-fix] 加载成功，返回对象含 some_new_key = 1
EXIT=0
```

未知键被静默透传进合并结果——和 D-P1-9 的描述一致。

### 3.1 用例 a：未知顶层键 → 必须失败且错误含键名

**schema 级（check-schema.mjs，§用例 a）**

```console
$ node scripts/check-schema.mjs
[check-schema] === 用例 a：未知顶层键 some_new_key ===
[check-schema] PASS 未知顶层键 → 必须校验失败
    - <root>: Unrecognized key: "some_new_key" [unrecognized_keys]
[check-schema] PASS 错误信息列出未知键名 some_new_key
[check-schema] PASS 错误码为 unrecognized_keys
[check-schema] PASS 同时拼错多个键 → 全部列出
```

**loader 级（check-loader.mjs，§用例 d）**

```console
$ node scripts/check-loader.mjs        # 节选
[check-loader] === 用例 d：未知顶层键 → 抛错且信息含键名 ===
[check-loader] PASS 未知顶层键 some_new_key → 抛错
[check-loader] 原始错误信息：
[theme-config] 配置校验失败（…\unknown\anzhiyu.config.yml），共 1 处：
  - some_new_key: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]
[check-loader] PASS 错误信息含未知键名 some_new_key
[check-loader] PASS 错误信息标记为「未知顶层键」
[check-loader] PASS 错误信息含 zod 错误码 unrecognized_keys
[check-loader] PASS 不再静默透传（错误信息不含「加载成功」）
[check-loader] PASS 同时拼错多个顶层键 → 抛错
[check-loader] PASS 错误信息一次列出全部未知键
[check-loader] PASS 已知键 highlight_copy 不背锅（不在错误行）
```

多键原始输出（`some_new_key` + `another_typo_key`）：

```console
[theme-config] 配置校验失败（…\multi.yml），共 2 处：
  - some_new_key: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]
  - another_typo_key: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]
```

### 3.2 用例 b：已知键写错类型 → 仍失败并含完整键路径

```console
$ node scripts/check-loader.mjs        # 节选（原有 + P1-12 新增的深层用例）
[check-loader] 原始错误信息：
[theme-config] 配置校验失败（…\bad\top.yml），共 1 处：
  - highlight_copy（期望 boolean）: Invalid input: expected boolean, received string [invalid_type]
[check-loader] PASS 错误信息含键路径 highlight_copy
[check-loader] PASS 错误信息含期望类型 boolean

[check-loader] 原始错误信息：
[theme-config] 配置校验失败（…\bad\nested.yml），共 1 处：
  - theme_color.main（期望 string）: Invalid input: expected string, received number [invalid_type]
[check-loader] PASS 错误信息含完整键路径 theme_color.main

[check-loader] PASS P1-12 展开区块的深层子键类型生效 → 抛错
[check-loader] 原始错误信息：
[theme-config] 配置校验失败（…\bad\expanded.yml），共 1 处：
  - post_meta.page.date_type（期望 string）: Invalid input: expected string, received number [invalid_type]
[check-loader] PASS 错误信息含完整键路径 post_meta.page.date_type
```

schema 级用例 b（`theme_color.main = 123`）：

```console
[check-schema] === 用例 b：已知键写错类型 theme_color.main = 123 ===
[check-schema] PASS 已知键写错类型 → 必须校验失败
    - theme_color.main: Invalid input: expected string, received number [invalid_type]
[check-schema] PASS 错误信息含完整键路径 theme_color.main
```

### 3.3 用例 c：上游 `_config.yml` → 仍零错误

```console
$ node scripts/check-schema.mjs
[check-schema] upstream config: D:\Git-project\_research\anzhiyu-upstream\_config.yml
[check-schema] zod version: 4.6.7
[check-schema] yaml top-level keys: 133
[check-schema] schema declared top-level keys: 133
[check-schema] unknown keys: 0
[check-schema] === 用例 c：上游 _config.yml 原样校验 ===
[check-schema] result: PASS (0 errors)
[check-schema] PASS 上游配置零错误
[check-schema] PASS 上游 null 顶层键保持 accepted: menu — 值 null
…（11 个 null 键 11 条 PASS，全部通过）
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）
EXIT=0
```

```console
$ node scripts/check-loader.mjs
[check-loader] === 用例 a：上游 _config.yml 全量加载 ===
[check-loader] 上游顶层 key 数: 133
[check-loader] PASS 全量加载零错误
[check-loader] PASS 全量深比较（133 个顶层键） — 合并结果与上游 YAML 完全一致
[check-loader] PASS 11 个上游 null 顶层键仍被接受（11 个） — menu=null, social=null, …
…
[check-loader] 结果: PASS（通过 42 项，失败 0 项）
EXIT=0
```

包脚本入口（仓库根执行，CI 可直接接）：

```console
$ pnpm --filter astro-theme-anzhiyu check:schema
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）
EXIT=0
$ pnpm --filter astro-theme-anzhiyu check:loader
[check-loader] 结果: PASS（通过 42 项，失败 0 项）
EXIT=0
```

## 4. 上游 `_config.yml` 全量校验仍通过的证据

### 4.1 schema 级

- `yaml top-level keys: 133` = `schema declared top-level keys: 133`，`unknown keys: 0`；
- `safeParse(doc)` → `PASS (0 errors)`，`missingInYaml` 行为空（键集合完全一致）；
- 11 个 null 顶层键 11 条显式 PASS（断言 `doc[key] === null` 且整体校验通过）。

### 4.2 loader 级

- `loadThemeConfig({ configPath: 上游 _config.yml })` 零错误；
- **全量深比较**：`deepEqual(fullConfig, upstreamDoc)` 为真（133 个顶层键、所有嵌套值一一相等）
  —— 证明 `.strict()` + 新增嵌套 schema 没有 strip 掉任何上游值（每层 `.passthrough()` 是前提）；
- `check-loader` 42 项全 PASS（原 30 项 + P1-12 新增 12 项）。

### 4.3 补充：null 键被用户填值、以及区块内自定义子键仍被接受

```console
$ # 基线示例配置（examples/blog/theme.config.yml，CI 构建实际用的那份）
theme.config.yml keys: 133
unknown: []
safeParse: PASS
key-set diff vs upstream: []

$ # 11 个 null 键填成对象/数组/字符串 + 展开区块里的自定义子键
[nulls-filled] 加载成功
  social = {"Github":"https://github.com/anzhiyu-c || anzhiyu-icon-github"}
  menu   = {"Home":"/","About":"/about || anzhiyu-icon-circle"}
  index_top_img_height = "400px"
  category_ui = [{"name":"前端","path":"/categories/前端/"}]
  aside.my_custom_card = true
  nav.menu[0] = {"title":"额外分组","item":[{"name":"新菜单","link":"/new/","icon":"/img/new.ico","extra_key_of_menu_item":"透传"}]}
```

`examples/blog/theme.config.yml`（Phase 2 起 loader 要吃的同一份 133 键配置）也通过 strict，
说明后续把 loader 接进构建不会因为 strict 而炸。

## 5. 还剩多少 passthrough 区块、对 loader 行为的影响

### 5.1 剩余量

| 类别 | 收紧前 | 收紧后 |
| --- | --- | --- |
| 整块 `looseObject` 顶层键（61 个候选） | 61 | **56** |
| 具名区块 schema（内部还有 `.passthrough()`，其中 12 个已展开子键） | 31 | 36 |
| 嵌套剩余 `looseObject` | 23 处属性 | **2 处**：`sidebar.site_data`、`algolia_search.hits` |
| 剩余 `looseArray` | 6 处属性 | **1 处**：`site_verification`（顶层、上游数组） |
| 文本 `.passthrough()` 调用 | 34 | 72（新增的是展开后的嵌套对象层，刻意保留透传） |

56 个剩余整块宽松键（都是渲染工具类开关，Phase 2/3 用不到）：
`mourn, docsearch, avatar, error_img, error_404, mainTone, addtoany, chatra, tidio, daovoice,
crisp, google_adsense, canvas_ribbon, canvas_fluttering_ribbon, canvas_nest, activate_power_mode,
fireworks, click_heart, ClickShowText, beautify, blog_title_font, hr_icon, preloader, busuanzi,
runtimeshow, newest_comments, translate, centerConsole, rightside_item_order, mermaid, note, icons,
pjax, aplayerInject, snackbar, pangu, lazyload, friends_vue, universe, bubble, console, LA, umami,
diytitle, comment_barrage_config, nav_music, visitorMail, greetingBox, post_head_ai_description,
shortcutKey, accesskey, linkPageTop, agreementPopup, rightClickMenu, peoplecanvas, dynamicEffect`。

### 5.2 loader 行为影响

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| 未知顶层键 | 静默通过，合并结果带回该键（无任何提示） | **抛错**，一个键一行，错误信息含键名 |
| 缺键（用户只写一部分） | 回落 defaults | 不变（ADR-005：不报错） |
| 已知键写错类型 | 抛错含完整路径 | 不变；展开区块的深层子键现在也能报路径 |
| 区块内未知子键 | 透传 | **仍然透传**（每层 `.passthrough()`） |
| 11 个上游 null 顶层键 | 接受任意值 | 不变（`z.unknown()`） |
| 上游 `_config.yml` 新增顶层键 | 静默通过 | **失败**：`check-schema` 报 unknown 且 loader 连 defaults 都过不了 → 强制同步补 schema |

最后一条是收紧后的**维护契约**：以后升级上游主题，`_config.yml` 一旦新增顶层键，
`check:schema` / `check:loader` 会立即红，而不是像以前一样静默吞掉。这是预期的守卫行为。

## 6. 影响面、风险与未完成项

### 改动文件（写范围内，共 4 个现有文件 + 本报告）

| 文件 | 变更 |
| --- | --- |
| `packages/astro-theme-anzhiyu/src/config/schema.ts` | 顶层 `.strict()`；17 个区块展开；+527 / -127 行（529 → 929 行） |
| `packages/astro-theme-anzhiyu/src/config/loader.ts` | `unrecognized_keys` 展开成一个键一行；错误头部按展开行数计数；+17 / -4 |
| `packages/astro-theme-anzhiyu/scripts/check-schema.mjs` | 新增三条用例 + 11 null 键断言；+122 / -14 |
| `packages/astro-theme-anzhiyu/scripts/check-loader.mjs` | 新增用例 d、展开区块深层类型用例、11 null 键断言；30 → 42 项；+90 / -12 |
| `docs/notes/phases/P1-12-schema-strict.md` | 本报告（新增） |

### 风险 / 代价（都已评估，没扩大范围）

1. **用户配置里的展开子键类型现在是硬约束**：10 个原 `unknown` 键（`comments.use`、`valine.serverURLs/master/friends`、
   `waline.serverURL/bg`、`twikoo.envId/region`、`artalk.server/site`）与 `giscus.theme/option`
   收成了具体类型，写错类型会失败。这是「展开子键类型」任务的直接结果，与 D-P1-9 的「类型写错必须失败」一致。
2. **区块内多余子键不受影响**（`.passthrough()` 全保留），ADR-005 兼容性的主要风险面没有扩大。
3. **`post_edit.url` 未声明**：上游 `post-info.pug` 读 `theme.post_edit.url`，但 `_config.yml` 没有该键
   （疑似上游模板 bug）。按「不编造上游没有的键」原则留在 passthrough 里，用户若写了仍能透传。
4. **没有 TypeScript 编译器验证**：仓库没装 `typescript`（无 tsconfig、`node_modules` 里无 tsc），
   `pnpm tsc --noEmit` 本地跑不了；本次靠 Node 24 type-stripping 运行时加载 + zod 内省验证。
   类型推导（`z.infer`）本身未变（`.strict()` 不改 shape），但建议 P1-9 验收时在 CI 补一条 tsc。
5. **两条脚本还没进 CI**：`.github/workflows/ci.yml` 目前只跑 build / verify / compare-vars /
   check-upstream-delta，没调用 `check:schema` / `check:loader`。这两条属于 P1-10 的范围，
   本次只在包内跑绿（命令见 §3.3），没有越界改 CI。

## 7. 最后：未知顶层键现在会不会让构建/加载失败？

**加载会失败，而且已经实测。** 同一份写着 `some_new_key: 1` 的配置：修复前 `loadThemeConfig` 静默成功并返回
`some_new_key = 1`；修复后直接抛
`[theme-config] 配置校验失败（…），共 1 处：\n  - some_new_key: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]`，
函数不返回任何配置对象（§3.0 / §3.1 原始输出）。多键也一次全列。所以**任何经过 loader 的构建步骤都会在这里失败**，
`pnpm check:schema` / `pnpm check:loader` 也会立刻红（退出码 1）。

**但要诚实说清当前时点的「构建」：** 现在 `examples/blog` 的构建链路还没有调用 `loadThemeConfig`
（`astro.config.mjs` 只把 `theme.config.yml` 传给 stylus 配置插件，`grep loadThemeConfig examples` 零命中），
所以**今天的 `pnpm build` 不会因为顶层键拼错而失败**——strict 目前生效在「加载层 + 双自检脚本」，
而不是当前的 blog 构建入口。Phase 2 的 BaseLayout / 内容层一旦按 P1-8 的设计接上 loader，未知名顶层键就会
成为构建的硬错误；本次已用 `examples/blog/theme.config.yml`（133 键）实跑 strict 验证过「正常配置不会被误杀」。
