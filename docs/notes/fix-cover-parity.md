# B4 尾巴 · 无封面文章卡片 cover 属性与 golden 对齐

- 执行 ID：B4 尾巴（任务卡「无封面文章卡片 cover 属性与 golden 对齐」）
- 日期：2026-11-25
- 结论：**静态已对齐，待 CI 复核**。Astro 侧无封面 prev/next 卡与 relatedPosts 卡的 cover 属性（`data-lazy-src`）实测渲染 `"/"`，与 golden 完全一致；**未改任何代码**，只新增本报告。
- 写范围实况：`packages/astro-theme-anzhiyu/src/components/` 下组件零改动（结论为「一致」按任务步骤 3 处理）；本文件为唯一新增。

---

## 审查修正（FIXPLAN/任务卡与代码冲突，以代码为准）

1. 任务卡步骤 5 写「node scripts/check-third-party.mjs / check-loader.mjs」，实际这两个脚本位于 `packages/astro-theme-anzhiyu/scripts/`（`scripts/` 下只有 check-upstream-delta / check-tag-styles / check-upstream-sync）。已按实际路径 + 白名单全量 check 执行（见「验证」）。
2. `docs/notes/fix-rebaseline.md` §7（L286）把「astro 侧对 coverless 文章需同样渲染 `/`，不能回落 `/img/default_cover.jpg`」列为待办风险。经静态 + 动态取证，**该风险在当前代码不成立**：cover-less 分支落 `urlFor(undefined) = "/"`，`/img/default_cover.jpg` 只会在 `cover.default_cover` 配置了非空值时由 `resolveCover` 落出，而基准站 `examples/blog/theme.config.yml:163-164` 的 `default_cover` 是注释态（值 `null`）。任务卡的「疑似渲染 /img/default_cover.jpg 或其它值」的怀疑**未被证实**，实测为 `"/"`。

---

## 1. golden 的 cover-less 卡片属性串原文

出处：`.baseline-work/public/2024/12/15/short-note/index.html:209`（prev 卡 = 新加的无封面文章 24531；next 卡 = 有封面对照 multi-taxonomy）。

**prev 卡（cover-less）img 原文**：

```html
<img class="prev-cover" src= "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;" data-lazy-src="/" onerror="onerror=null;src='/img/404.jpg'" alt="cover of previous post">
```

**next 卡（有封面 `/img/512.png`）img 原文**：

```html
<img class="next-cover" src= "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;" data-lazy-src="/img/512.png" onerror="onerror=null;src='/img/404.jpg'" alt="cover of next post">
```

**relatedPosts 卡（cover-less）img 原文**（同文件 209 行 relatedPosts-list 内）：

```html
<img class="cover" src= "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onerror="this.onerror=null,this.src=&quot;/img/404.jpg&quot;" data-lazy-src="/" alt="cover">
```

要点：cover-less 卡 `data-lazy-src="/"`（上游 `url_for('')` 回落 root 的语义）；有封面卡为原图路径。

## 2. Astro 侧渲染点 file:line + 当前属性串

渲染链（每一环都有出处）：

| 环节 | 位置 | 行为 |
| --- | --- | --- |
| cover 解析 | `packages/astro-theme-anzhiyu/src/components/post/post-list.ts:282-293`（`resolveCover`）、`:362` | frontmatter 无 cover 且 `cover.default_cover` 为空 → `cover: false` |
| 值转 URL | `packages/astro-theme-anzhiyu/src/layouts/site.ts:107-121`（`createUrlFor`） | `urlFor(undefined) → "/"`（L110 `if (!path) return base`，base=`"/"`） |
| prev/next 卡 | `packages/astro-theme-anzhiyu/src/components/post/PostPagination.astro:36-39`（`coverOf`）、`:41-50`（`coverAttrs`）、`:59/:70`（渲染点） | `post.cover === false ? undefined : post.cover` → `urlFor(undefined)` → 懒加载属性 |
| relatedPosts 卡 | `packages/astro-theme-anzhiyu/src/components/post/RelatedPosts.astro:45-46`、`:51`（渲染点） | 同一 cover 逻辑，同一 `lazyImageAttrs` |
| 懒加载属性 | `packages/astro-theme-anzhiyu/src/components/layout/lazyload.ts:45-61`（`lazyImageAttrs`） | `src=占位` + `onerror` + `data-lazy-src=src` |

**当前 Astro 侧 cover-less 卡渲染属性串**（动态取证实测，`%TEMP%\b4-cover-parity.mjs` 用真实 `createUrlFor`/`lazyImageAttrs` + 真实 `examples/blog/theme.config.yml` 执行）：

```
prev-cover    : {"class":"prev-cover","alt":"cover of previous post","src":"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","onerror":"this.onerror=null,this.src=\"/img/404.jpg\"","data-lazy-src":"/"}
related-cover : {"class":"cover","alt":"cover","src":"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","onerror":"this.onerror=null,this.src=\"/img/404.jpg\"","data-lazy-src":"/"}
next-cover    : {"class":"next-cover","alt":"cover of next post","src":"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","onerror":"this.onerror=null,this.src=\"/img/404.jpg\"","data-lazy-src":"/img/512.png"}
```

frontmatter 佐证：`fixtures/abbrlink-post.md`（title「abbrlink 覆盖末段样本」，`abbrlink: 24531`）**无 `cover` 键** → cover-less；`fixtures/multi-taxonomy.md:16` `cover: /img/512.png` → next 卡对照组。

## 3. 一致 / 不一致结论

**一致（静态已对齐，待 CI 复核）——不改代码，无 diff。**

逐属性对比（以 diff-html.mjs 的归一化口径，见下）：

| 属性 | golden（cover-less） | Astro（cover-less） | 结论 |
| --- | --- | --- | --- |
| `data-lazy-src` | `"/"` | `"/"` | ✅ 一致 |
| `src` | 1x1 GIF 占位（`R0lGOD…`） | 同串（lazyload.ts DEFAULT_PLACEHOLDER） | ✅ 一致 |
| `onerror`（首个） | `this.onerror=null,this.src=&quot;/img/404.jpg&quot;` | 同串（`&quot;` 为 HTML 转义后形态） | ✅ 一致 |
| `class` | `prev-cover` / `cover` | 同 | ✅ 一致 |
| `alt` | `cover of previous post` / `cover` | 同 | ✅ 一致 |
| 有封面对照（next） | `data-lazy-src="/img/512.png"` | 同 | ✅ 一致 |

字节级差异两处，均被 `scripts/diff-html.mjs` 归一化吸收，不构成 CI diff：

1. golden pagination img 带**第二个** `onerror="onerror=null;src='/img/404.jpg'"`（上游 pagination.pug 模板自带，lazyload 站点级 filter 未去重），Astro 侧只渲染 filter 风格的一个。`diff-html.mjs` 解析器对重复属性「保留第一个」（`scripts/diff-html.mjs:374-377`），比对的 onerror 恰是两者相同的 filter 风格串。
2. golden 的 `src= "…"`（等号后空格）与属性顺序差异：`parseStartTag` 对 `=` 后空白不敏感（`diff-html.mjs:354-359`），`normalizeTree` N1 属性排序（`diff-html.mjs:824`）。

**边界注记（不在本 ID 范围，不动）**：`PostPagination.astro:35-38` 的注释保留上游 `pagination_cover = post.cover === false ? post.randomcover : post.cover` 语义，实现取 `undefined` 而非 `randomcover`（`post-page.ts:292` 已记：基准站 `default_cover` 为空，`randomcover` 恒为 undefined）。仅当站点配置了 `cover.default_cover` 时与上游有差（上游随机默认封面 vs 本站 `/`），属既有已记录决策，基准站产物不受影响。`check-helpers.mjs` B16 的 helpers 字符串复刻（`relatedPosts cover=false 用 randomcover`）覆盖的是上游 helper 语义，与组件渲染层是两层，不冲突。

## 4. relatedPosts 同逻辑结论

**一致。** `RelatedPosts.astro:45-51` 与 PostPagination 共用同一 cover 语义（`post.cover === false ? undefined : post.cover` → `urlFor` → `lazyImageAttrs`）。golden short-note 页 relatedPosts 卡（24531，cover-less）为 `class="cover" … data-lazy-src="/"`，Astro 侧实测 `{"class":"cover", … "data-lazy-src":"/"}`，逐属性一致。且 golden relatedPosts img 本就只有单个 `onerror`（上游 `related_post.js` 拼接的 img 不带模板 onerror），与 Astro 侧输出形态天然相同。

## 5. 验证命令与输出尾部

全部白名单 check 全绿（本次零代码改动，确认无既有断言被打破）。附注：动态取证脚本在 `%TEMP%\b4-cover-parity.mjs`，经 `node -e "import('file:///C:/Users/mcxiaochen/AppData/Local/Temp/b4-cover-parity.mjs')"` 执行（临时脚本放 %TEMP%）。

```
node -e "import('file:///C:/Users/mcxiaochen/AppData/Local/Temp/b4-cover-parity.mjs')"
== 真实配置（examples/blog/theme.config.yml） ==
theme.cover.default_cover = null
theme.lazyload = {"enable":true,"field":"site","placeholder":null,"blur":true,"progressive":true}
theme.error_img.post_page = "/img/404.jpg"
== 值链 ==
urlFor(undefined) = "/" <- cover-less 卡片的 data-lazy-src 值
prev-cover    : {"class":"prev-cover",…,"data-lazy-src":"/"}
related-cover : {"class":"cover",…,"data-lazy-src":"/"}
next-cover    : {"class":"next-cover",…,"data-lazy-src":"/img/512.png"}
ASSERT PASS: cover-less -> "/"，有封面 -> 原图路径，与 golden 一致
[exit 0]
```

```
node scripts/check-upstream-delta.mjs
[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
exit=0

node scripts/check-tag-styles.mjs
[check-tag-styles] 汇总: class 186 个，覆盖 186/186（100.0%）= 精确 147 + 编译展开 0 + 仅语境 34 + 上游无规则 5；未命中 0；无 class 的 tag 7 个
[check-tag-styles] 通过：所有带 class 的 tag 都能在上游样式里找到规则（或属上游本身未样式化的 class）
exit=0

node scripts/check-upstream-sync.mjs
[check-upstream-sync] 结论: 基线之后上游没有新提交
[check-upstream-sync] 退出码: 0
exit=0

node scripts/verify-css.mjs
[verify-css] PASS 字节数: 实际 684087 / baseline 683218（+0.13%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78768 / baseline 79124（-0.45%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）…
[verify-css] 比对通过
exit=0

node scripts/compare-css-vars.mjs
[compare-css-vars] 结果: 严格一致 68 / 顺序差异 1 / 值不一致 0 / 产物缺失 0（基准共 69）
[compare-css-vars] 比对通过（1 处为声明顺序差异，取值集合一致）
exit=0

node packages/astro-theme-anzhiyu/scripts/check-third-party.mjs
通过 110 条，失败 0 条
P5-1 第三方集成组件门控与 DOM 验证通过 ✓
exit=0

node packages/astro-theme-anzhiyu/scripts/check-loader.mjs
[check-loader] 结果: PASS（通过 42 项，失败 0 项）
exit=0

node packages/astro-theme-anzhiyu/scripts/check-schema.mjs
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）
exit=0

node packages/astro-theme-anzhiyu/scripts/check-date.mjs
[check-date] 结果：62 PASS / 0 FAIL / 0 SKIP
[check-date] [check-date] 全部通过
exit=0

node packages/astro-theme-anzhiyu/scripts/check-i18n.mjs
[check-i18n] 结果: PASS（通过 83 项，失败 0 项）
exit=0

node packages/astro-theme-anzhiyu/scripts/check-helpers.mjs
[check-helpers] 结果: PASS（通过 269 项，失败 0 项，跳过 0 项）
exit=0

node packages/astro-theme-anzhiyu/scripts/check-slugger.mjs
[check-slugger] 活体对拍：9 页 / 41 个标题
[check-slugger] 汇总：PASS 49 / FAIL 0 / SKIP 0
exit=0

node packages/remark-hexo-tag/test/run.mjs
remark-hexo-tag: 65/65 通过
exit=0
```

（remark-hexo-tag 的 stderr 是负例用例故意触发的解析错误日志，断言 65/65 全过、exit 0。）

## 6. 待 CI 验证清单

1. **本 ID 主验收**：`astro build` 后 `node scripts/diff-html.mjs` 对 `/2024/12/15/short-note/`（prev=24531 cover-less、next=multi-taxonomy 有封面，且含 relatedPosts 块）跑 golden↔dist 比对，`prev-cover`/`cover` 的 `data-lazy-src` 属性 diff 为 0（期望值 `"/"`，不能出 `/img/default_cover.jpg` 或其它值）。
2. **同逻辑旁证页**：带 prev/next 且相邻文章无封面的其余页（新 golden 中 `/2024/11/01/longform-hexo-astro/` 的 next 指向 24531 的页面）同样 0 diff。
3. **全量回归**：新 golden（48+1 页）↔ astro dist 全页 cross-check 不因 cover 卡片属性出 FAIL（对应 fix-rebaseline §9 待 CI-2「无封面 prev/next 卡片渲染 `/`」条目的收口证据）。
4. （合并自既有清单，非本 ID 新增）B4 链路冒烟：`/2024/11/20/24531/` 路由存在、`/2024/11/20/abbrlink-post/` 404 —— 见 fix-rebaseline §9 待 CI-1。

## 待 F 同步清单

1. `docs/notes/fix-rebaseline.md` §7 L286 / §9 L380 的「astro 侧需同样渲染 `/`」待办表述：本次已证实静态对齐，文字收口（改为「已对齐，CI 复核通过」）留 Batch F 统一处理（本轮禁改该文档）。
2. 无 README / PLAN / MIGRATION / 数字口径涉及本 ID，无需同步项。
