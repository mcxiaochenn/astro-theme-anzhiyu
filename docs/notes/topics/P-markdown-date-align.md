# Markdown 渲染行为与日期格式化对齐 Hexo

- 执行人：p-markdown（组员）
- 执行时间：2026-11-23（Asia/Shanghai）
- 任务：把 Markdown 渲染行为（smartypants）与日期格式化（时区/格式）对齐 Hexo，
  为 Phase 2 的 HTML diff 扫清已知误报；并把资源路径豁免策略文档化
- 写范围（实际改动）：
  - `examples/blog/astro.config.mjs`（+23 行：`unified({ smartypants: false })` + 注释）
  - `packages/astro-theme-anzhiyu/src/utils/date.ts`（新增，571 行）
  - `packages/astro-theme-anzhiyu/scripts/check-date.mjs`（新增，验收，59 断言）
  - `packages/astro-theme-anzhiyu/package.json`（+1 script `check:date`）
  - `docs/reference/resource-path-policy.md`（新增）
  - 本文件
- 未改动：`examples/blog/src/pages/`、`src/components/`、`src/layouts/`（另一组员在改）；
  `scripts/diff-html.mjs`；`packages/astro-theme-anzhiyu/src/index.ts`

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| smartypants | ✅ 已关闭。处理器级 before/after + **真实构建产物** before/after 都有证据 |
| mermaid 的 `-->` | 关闭后产物里 3 条 `-->` 原样保留（关闭前是 3 条 `—>`，U+2014） |
| 日期格式化 | ✅ `date.ts` 完整移植 Hexo `date()/time()/full_date()/date_xml()` 语义，含无时区→站点时区归一化 |
| 日期验收 | ✅ `node scripts/check-date.mjs`：**59 PASS / 0 FAIL / 0 SKIP**；含 60 组 moment-timezone oracle 对拍和 3 页基准站真实产物对拍 |
| 跨天边界 | ✅ 19:45 / 23:30 / 06:00 三个边界都覆盖；错按 UTC 解释会差 1 天（有具体值） |
| 资源路径策略 | ✅ `docs/reference/resource-path-policy.md`：哪些豁免、哪些必须修、Phase 7 能否字节级一致（拆分两层回答） |
| 构建 | ✅ `pnpm build` 通过，3 页 / 2.40s |
| verify | ✅ `pnpm verify` PASS（字节 −0.03% / gzip −0.84%，SHA256 不一致仅 WARN） |
| 残留的**真实**渲染差异（不是误报） | 代码块高亮（hexo highlight.js vs Astro Shiki）、脚注（marked 不支持 vs remark-gfm 渲染）、heading id 里 `「」` 的 slug 差异——见 §6 |

### 0.1 必须回答的 5 个问题 → 本文位置

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | smartypants 关闭的配置片段 + before/after 证据 | §1.1 / §1.3 / §1.4 |
| 2 | date.ts 的签名与核心逻辑；时区归一化怎么做的 | §2 |
| 3 | check-date 原始输出；跨天用例的具体值 | §3.2 / §3.3 |
| 4 | 资源路径策略的结论 | §4（全文见 `docs/reference/resource-path-policy.md`） |
| 5 | 构建是否仍绿 + verify 是否仍 PASS | §5 |

---

## 1. smartypants 关闭

### 1.1 配置片段

`examples/blog/astro.config.mjs`（只改 `markdown.processor` 这一行，其余 56 行原样保留）：

```js
  markdown: {
    // smartypants: false —— 关掉 unified 的「智能标点」替换，与 Hexo/marked 对齐。
    //
    // @astrojs/markdown-remark 的默认值是 `smartypants: true`
    //（node_modules/@astrojs/internal-helpers/dist/markdown.js 的 markdownConfigDefaults），
    // 它会在 remark 阶段把正文文本节点做一遍排版替换：
    //   -->  →  —>      （U+2014 + '>'，`--` 被当作 em dash）
    //   --   →  —       （单段 `--` → em dash；`---` → em dash 同款）
    //   ...  →  …       （U+2026）
    //   "x"  →  “x”     （直角/弯引号成对替换）
    // 上游 Hexo 用 hexo-renderer-marked，默认 `smartypants: false`，以上一律原样输出。
    //
    // ……（完整注释见文件，说明对 Phase 6 tag 解析与 HTML diff 的两处硬后果）
    //
    // 关闭方式按 @astrojs/markdown-remark 的 processor API：`unified({ ... })` 的选项
    // 会覆盖 `markdown.smartypants` 顶层默认值（dist/processor.js:
    // `smartypants: processor.options.smartypants ?? shared.smartypants`），
    // 所以这里传 `smartypants: false` 是生效路径，不需要再写顶层 `markdown.smartypants`。
    processor: unified({ smartypants: false }),
  },
```

**为什么是这个位置，不是顶层 `markdown.smartypants`**：读的是
`node_modules/@astrojs/markdown-remark/dist/processor.js:17-47`：

```js
export function unified(opts = {}) {
  const processor = {
    name: "unified",
    options: { …, gfm: opts.gfm, smartypants: opts.smartypants },
    async createRenderer(shared) {
      return createMarkdownProcessor({
        ...shared, …,
        // `unified({ gfm, smartypants })` wins; fall back to the deprecated
        // top-level `markdown.gfm` / `markdown.smartypants` while they still exist.
        gfm: processor.options.gfm ?? shared.gfm,
        smartypants: processor.options.smartypants ?? shared.smartypants
      })
    },
  }
  return processor
}
```

即 `unified({...})` 的显式值优先，`markdown.smartypants` 顶层写法已被标为 deprecated。
默认值确认：`node_modules/@astrojs/internal-helpers/dist/markdown.js` 里
`markdownConfigDefaults.smartypants === true`。

### 1.2 影响面（为什么必须关）

1. **Phase 6 的 tag 解析**：`{% mermaid %}` 块的内容是「原样取字面量」，
   `A[Hexo] --> B[fixture]` 被改成 `A[Hexo] —> B[fixture]` 后 Mermaid 语法直接失效；
   同理 `{% bilibili %}` / `{% dogeplayer %}` 的参数里如果有 `--`/引号也会被改。
2. **HTML diff 假差异**：正文里任何 `--`、`...`、英文引号都会被 smartypants 改写，
   而上游 marked 不改 → 每个这样的段落报 1 条 `text` 差异（真实误报）。
3. 附带的：`'` 在部分配置下会被改成 `’`，`--` 变 em dash 还会改变中文排版观感。

### 1.3 处理器级 before / after（原始输出）

取 `tests/fixtures/tags-thirdparty.md` 的 mermaid 片段，用**真实 `astro.config.mjs` 的
processor options** 调 `createMarkdownProcessor` 渲染（和 `astro build` 同一个函数）：

**before（`unified()`，smartypants 未设置 → 默认 true）**：

```text
=== astro.config.mjs → markdown.processor.options ===
{
  "remarkPlugins": [],
  "rehypePlugins": [],
  "remarkRehype": {},
  "recmaPlugins": []
}
smartypants 选项值 = undefined

--- mermaid 片段（tests/fixtures/tags-thirdparty.md） ---
<h2 id="mermaid">mermaid</h2>
<p>{% mermaid %}
graph TD
A[Hexo] —> B[fixture]
B —> C[baseline]
C —> D[Astro]
{% endmermaid %}</p>
含 "-->"： false
含 "—>"（U+2014）： true
含 "–>"（U+2013）： false
含 "…"（U+2026）： false
含 "“"（U+201C）： false

--- 标点探针 ---
<p>他说：“这是 — 破折号” 和 … 省略号，以及 <b>「直角引号」</b>。</p>
含 "-->"： false
含 "—>"（U+2014）： false
含 "–>"（U+2013）： false
含 "…"（U+2026）： true
含 "“"（U+201C）： true
```

**after（`unified({ smartypants: false })`）**：

```text
=== astro.config.mjs → markdown.processor.options ===
{
  "remarkPlugins": [],
  "rehypePlugins": [],
  "remarkRehype": {},
  "recmaPlugins": [],
  "smartypants": false
}
smartypants 选项值 = false

--- mermaid 片段（tests/fixtures/tags-thirdparty.md） ---
<h2 id="mermaid">mermaid</h2>
<p>{% mermaid %}
graph TD
A[Hexo] --> B[fixture]
B --> C[baseline]
C --> D[Astro]
{% endmermaid %}</p>
含 "-->"： true
含 "—>"（U+2014）： false
含 "–>"（U+2013）： false
含 "…"（U+2026）： false
含 "“"（U+201C）： false

--- 标点探针 ---
<p>他说："这是 -- 破折号" 和 ... 省略号，以及 <b>「直角引号」</b>。</p>
含 "-->"： false
含 "—>"（U+2014）： false
含 "–>"（U+2013）： false
含 "…"（U+2026）： false
含 "“"（U+201C）： false
```

### 1.4 真实构建产物 before / after

处理器级证据还不够「产物」二字，所以另做了一次 **`astro build` 级对比**。
做法（不改 `src/pages/`、不污染 `dist/`，验完临时文件全删）：

1. 临时配置 `.tmp-astro-probe.config.mjs`：`import base from './astro.config.mjs'`，
   before 分支把 `markdown.processor` 换回 `unified()`，after 分支用真实配置；
   `outDir` 分别指向 `.tmp-dist-before` / `.tmp-dist-after`；
2. 路由用 Astro integration 的 `injectRoute` 注入一个临时页
   （渲染 `tests/fixtures/tags-thirdparty.md`），**不写 `src/pages/`**；
3. 两次 `astro build --config … --force`。

产物对比（`.tmp-dist-{before,after}/__tmp-probe/index.html`）：

```text
=== before (.tmp-dist-before/__tmp-probe/index.html)
  '-->' 出现 0 次 / '—>' 出现 3 次 / 文件 1621 B
  mermaid 段落：
<p>{% mermaid %} | graph TD | A[Hexo] —> B[fixture] | B —> C[baseline] | C —> D[Astro] | {% endmermaid %}</p>

=== after (.tmp-dist-after/__tmp-probe/index.html)
  '-->' 出现 3 次 / '—>' 出现 0 次 / 文件 1618 B
  mermaid 段落：
<p>{% mermaid %} | graph TD | A[Hexo] --> B[fixture] | B --> C[baseline] | C --> D[Astro] | {% endmermaid %}</p>
```

（`|` 是给行换行；产物 HTML 里就是 5 行文本节点。before 比 after 多 3 字节：
3 处 `--`(2 字节)→`—`(3 字节) 各 +1 B。）

> 备注：`--config` 指向的临时配置只用于这次取证，已删除；
> 仓库里 `git status` 不会看到 `.tmp-*` 残留（已核查）。

---

## 2. `date.ts`：Hexo 语义日期格式化

文件：`packages/astro-theme-anzhiyu/src/utils/date.ts`

### 2.1 上游语义出处

`.baseline-work/node_modules/hexo/dist/plugins/helper/date.js`（Hexo 7.3.0）：

```js
function getMoment(date, lang, timezone) {
  if (date == null) date = moment()
  if (!isMoment(date)) date = moment(isDate(date) ? date : new Date(date))
  lang = _toMomentLocale(lang);  if (lang) date = date.locale(lang)
  if (timezone) date = date.tz(timezone)
  return date
}
dateHelper(date, format)     → moment.format(format || config.date_format)
timeHelper(date, format)     → moment.format(format || config.time_format)
fullDateHelper(date, format) → format ? moment.format(format) : `${this.date(date)} ${this.time(date)}`
relativeDateHelper(date)     → moment.fromNow()
date_xml(date)               → (date ?? new Date()).toISOString()
```

主题模板实际用到的就这 4 个（`grep -r "date_xml\|full_date\|date(" layout/`）。
`date_format: relative / simple` 是**客户端**模式（`layout/includes/head/config.pug:196-199`
把开关写进 `#config-diff` 的 `relativeDate`，由主题 JS 改写文本），服务端 HTML 永远是
`date(page.date, config.date_format)` → 所以本文件**不实现 `fromNow()`**，只做服务端格式化。

### 2.2 导出签名

| 导出 | 签名 | 对应上游 |
| --- | --- | --- |
| `DEFAULT_SITE_TIMEZONE` | `'Asia/Shanghai'` | `_config.yml: timezone` |
| `DEFAULT_DATE_FORMAT` | `'YYYY-MM-DD'` | `_config.yml: date_format` |
| `DEFAULT_TIME_FORMAT` | `'HH:mm:ss'` | `_config.yml: time_format` |
| `parseHexoDate` | `(value: DateLike, timezone?: string) => Date` | `new Date(value)` + 站点时区归一化 |
| `getDateTimeParts` | `(date: Date, timezone?: string) => DateTimeParts` | 时区投影后的日历字段 |
| `formatDateParts` | `(parts, format, locale?) => string` | moment `format(fmt)` |
| `formatHexoDate` | `(value, format, config?: SiteDateConfig) => string` | `this.date(v, fmt)` |
| `hexoDate` | `(value, config?) => string` | `this.date(v)`（用 `date_format`） |
| `hexoTime` | `(value, config?) => string` | `this.time(v)`（用 `time_format`） |
| `hexoFullDate` | `(value, config?, format?) => string` | `this.full_date(v[, fmt])` |
| `hexoDateXml` | `(value, config?) => string` | `this.date_xml(v)`（UTC ISO） |
| `createSiteDateFormatter` | `(config?) => { parse, format, date, time, fullDate, xml, parts }` | 组件层接线用（一次绑定站点配置） |

`SiteDateConfig = { timezone?, language?, dateFormat?, timeFormat?, now? }`
（`now` 只给测试注入，等价 `moment()` 的「现在」）。

### 2.3 时区归一化怎么做的（三步）

**第一步：输入分类**（`parseHexoDate`）

| 输入 | 语义 | 依据 |
| --- | --- | --- |
| `Date` / `number` | 绝对时刻，原样 | moment 分支 `isDate(date)` |
| `'2024-11-01'`（纯日期、两位月日） | **UTC** 零点 | ECMAScript：date-only 形式按 UTC 解析；Hexo `new Date()` 同款（实测 `2025-04-20` → `2025-04-20T00:00:00Z` → 显示 +08 08:00） |
| `'2024-11-01 09:30:00'`、`'2024-11-01T09:30:00'`、`'2024/11/1 9:30'` | **站点时区**墙上时间 | V8 对这类写法按宿主本地时区解释；Hexo 基准站宿主 = 站点 = Asia/Shanghai，所以等价；我们显式按站点时区解释 = **换机器也得到同一时刻** |
| `'…Z'`、`'…+08:00'` | 绝对时刻，时区只决定显示 | ES 规范 |
| 其它 | 交给 `new Date()`，失败 `TypeError` | Hexo 兜底 |

**第二步：墙上时间 → 绝对时刻**（`zonedWallClockToMs`，最难点）

用 `Intl.DateTimeFormat(timeZone, { hourCycle:'h23', … }).formatToParts()` 取时区日历字段，
再用「墙上时间当成 UTC」与真实时刻的差算偏移（`zoneOffsetMinutes`）。
有夏令时的时区要处理三种情况，规则与 moment 一致：

- 正常：唯一解；
- **重叠**（秋季回拨，01:30 出现两次）：`moveAmbiguousForward` 默认 `false` → 取**较早**的一次（DST 那次）；
- **空洞**（春季跳表，02:30 不存在）：`moveInvalidForward` 默认 `true` → **向后顺延**（02:30→03:30）。

实现：墙上时间 ±24h/0 三处采样候选偏移，候选自洽（投影回墙上时间相等）者合法 →
取最早；全不合法（空洞）→ 取渲染结果最接近且晚于目标者。**实测与 moment-timezone 逐毫秒一致**
（见 §3.2 B6/B7、D1）。

**第三步：格式化**（`formatDateParts`）

按 moment token 语义替换：`YYYY/YY/MMMM/MMM/MM/M/DD/D/dddd/ddd/dd/d/HH/H/hh/h/mm/m/ss/s/SSS/A/a/Z/ZZ/X/x`
+ `[字面量]` 转义。月份名复用 `helpers.ts` 的 `monthName`（与 moment locale 表一致），
星期名内置 en/zh-cn/zh-tw 三张表，`A`/`a` 走 locale meridiem（中文是 moment 的六档
`凌晨/早上/上午/中午/下午/晚上`，不是 AM/PM——这个坑在 D1 矩阵里抓出来并修掉了）。

### 2.4 与现有代码的关系

- `content.config.ts`（P2-1）已经做了「frontmatter 无时区字面量 → +08 时刻」的归一化
  （`SITE_UTC_OFFSET_MINUTES = 480` 的平移）。**产物已经是对的**：
  基准站 `date_xml` = `2024-11-01T01:30:00.000Z`，我们集合读出来同样是
  `2024-11-01T01:30:00.000Z`（构建日志 + check-date E 段都验证）。
- `date.ts` 是**格式化层**：拿到 `Date`（绝对时刻）后按站点时区输出 `date/time/full_date/date_xml`。
  它也支持直接吃原始字符串（`parseHexoDate`），所以脚本/独立页面不依赖 content collection 也能用。
- `helpers.ts` 的 `formatMomentLike`（归档卡片用）与新 `formatDateParts` 在共同支持的 token 上
  输出一致（check-date D4 交叉断言），归档卡片可以继续用旧函数。

---

## 3. `check-date.mjs` 验收

### 3.1 结构

`packages/astro-theme-anzhiyu/scripts/check-date.mjs`，`node scripts/check-date.mjs`（或
`pnpm --filter astro-theme-anzhiyu check:date`）。五段：

| 段 | 内容 |
| --- | --- |
| A | 解析/时区归一化 13 条（含非法输入、非法时区、纯日期 UTC 语义） |
| B | **跨天边界 14 条**（真实 fixture 值 + 23:30/06:00 边界 + 纽约冬/夏/空洞/重叠） |
| C | Hexo helper 输出 17 条（date/time/full_date/date_xml、locale 月份/星期、meridiem、token） |
| D | 上游 oracle：加载 `.baseline-work/node_modules/moment-timezone`（**0.5.48**，即 Hexo 7.3.0 的依赖）做 **60 组**矩阵对拍 + 裸字面量对拍 + 非法日期 + 交叉断言；目录不存在时 SKIP |
| E | 基准站真实产物对拍：3 个文章页的 `<time datetime>` / 可见文本 / `title="发表于 …"` 与我们复算值逐字节一致 |

### 3.2 原始输出（逐字）

```text
[check-date] === A. 解析与时区归一化 ===
[check-date] PASS A1 无时区字面量按站点时区解释（= baseline date_xml） — 实际 2024-11-01T01:30:00.000Z / 期望 2024-11-01T01:30:00.000Z
[check-date] PASS A2 站点时区换成 UTC 时，同一字面量就落在 UTC 墙上时间 — 实际 2024-11-01T09:30:00.000Z / 期望 2024-11-01T09:30:00.000Z
[check-date] PASS A3 显式 +08:00 与无时区字面量同一时刻 — 实际 2024-11-01T01:30:00.000Z / 期望 2024-11-01T01:30:00.000Z
[check-date] PASS A4 显式 Z 就是绝对时刻 — 实际 2024-11-01T09:30:00.000Z / 期望 2024-11-01T09:30:00.000Z
[check-date] PASS A5 纯日期 YYYY-MM-DD 走 UTC（ECMAScript 规范 + Hexo new Date 行为） — 实际 2025-04-20T00:00:00.000Z / 期望 2025-04-20T00:00:00.000Z
[check-date] PASS A6 一位月日的宽松写法走站点时区（V8 对非 ISO 写法按本地解释） — 实际 2025-04-19T16:00:00.000Z / 期望 2025-04-19T16:00:00.000Z
[check-date] PASS A7 秒级毫秒精度保留 — 实际 2025-04-20T03:15:30.250Z / 期望 2025-04-20T03:15:30.250Z
[check-date] PASS A8 Date 输入复制一份、值不变 — getTime=1730424600000
[check-date] PASS A9 时间戳输入（毫秒） — 实际 2024-11-01 09:30:00 / 期望 2024-11-01 09:30:00
[check-date] PASS A10 非法日期字面量抛 TypeError — 抛出 TypeError: Invalid date: "不是日期"
[check-date] PASS A11 非法日期经 date() 输出 moment 同款 "Invalid date" — 实际 Invalid date / 期望 Invalid date
[check-date] PASS A12 非法时区名抛 TypeError（不是静默按 UTC） — 抛出 TypeError: Invalid timezone: "Not/AZone"
[check-date] PASS A13 date_xml 对非法日期抛 TypeError（构建期就炸，不写假 datetime） — 抛出 TypeError: Invalid date: "不是日期"
[check-date] === B. 跨天边界 ===
[check-date] PASS B1 正确语义：2025-02-20 19:45（+08）→ UTC 11:45Z，日期不变 — 实际 2025-02-20T11:45:00.000Z / 期望 2025-02-20T11:45:00.000Z
[check-date] PASS B1 正确语义：渲染回 +08 仍是 2025-02-20 19:45 — 实际 2025-02-20 19:45:00 / 期望 2025-02-20 19:45:00
[check-date] PASS B2 反向验证：Astro 旧行为（当 UTC 解析 = 19:45Z）在 +08 下跨到 02-21 — 实际 2025-02-21 03:45 / 期望 2025-02-21 03:45
[check-date] PASS B3 2025-02-20 23:30（+08）→ UTC 15:30Z — 实际 2025-02-20T15:30:00.000Z / 期望 2025-02-20T15:30:00.000Z
[check-date] PASS B3 若当 UTC 解析（23:30Z）在 +08 下变成 02-21 07:30：日期 +1 — 实际 2025-02-21 07:30 / 期望 2025-02-21 07:30
[check-date] PASS B3 两种解释的日期不同（跨天边界确实存在，差 1 天） — 2025-02-20 vs 2025-02-21
[check-date] PASS B4 2025-03-05 06:00（+08）→ UTC 前一天 22:00Z — 实际 2025-03-04T22:00:00.000Z / 期望 2025-03-04T22:00:00.000Z
[check-date] PASS B4 UTC 日历日期是 03-04，+08 日历日期是 03-05（差一天） — 实际 2025-03-04 / 2025-03-05 / 期望 2025-03-04 / 2025-03-05
[check-date] PASS B5 tests/fixtures/short-note.md：2024-12-15 21:05（+08）→ 13:05Z — 实际 2024-12-15T13:05:00.000Z / 期望 2024-12-15T13:05:00.000Z
[check-date] PASS B5 tests/fixtures/tags-thirdparty.md：2025-04-20 11:15（+08）→ 03:15Z — 实际 2025-04-20T03:15:00.000Z / 期望 2025-04-20T03:15:00.000Z
[check-date] PASS B6 America/New_York 冬季 2025-01-01 12:00 → 17:00Z（EST，-05:00） — 实际 2025-01-01T17:00:00.000Z / 期望 2025-01-01T17:00:00.000Z
[check-date] PASS B6 America/New_York 夏季 2025-07-01 12:00 → 16:00Z（EDT，-04:00） — 实际 2025-07-01T16:00:00.000Z / 期望 2025-07-01T16:00:00.000Z
[check-date] PASS B7 春季跳表空洞 2025-03-09 02:30（不存在）→ 顺延到 03:30 EDT = 07:30Z（moment moveInvalidForward） — 实际 2025-03-09T07:30:00.000Z / 期望 2025-03-09T07:30:00.000Z
[check-date] PASS B7 秋季回拨重叠 2025-11-02 01:30（出现两次）→ 取较早的 EDT = 05:30Z（moment moveAmbiguousForward=false） — 实际 2025-11-02T05:30:00.000Z / 期望 2025-11-02T05:30:00.000Z
[check-date] === C. Hexo helper 输出（date / time / full_date / date_xml） ===
[check-date] PASS C1 date() 用 config.date_format（YYYY-MM-DD） — 实际 2024-11-01 / 期望 2024-11-01
[check-date] PASS C2 time() 用 config.time_format（HH:mm:ss） — 实际 09:30:00 / 期望 09:30:00
[check-date] PASS C3 full_date() = date + " " + time — 实际 2024-11-01 09:30:00 / 期望 2024-11-01 09:30:00
[check-date] PASS C4 full_date(value, format) 直接按 format 格式化 — 实际 2024年11月01日 / 期望 2024年11月01日
[check-date] PASS C5 date_xml() = toISOString() — 实际 2024-11-01T01:30:00.000Z / 期望 2024-11-01T01:30:00.000Z
[check-date] PASS C6 归档卡片的 MMMM YYYY（zh-CN）= 十一月 2024（baseline 侧栏同款） — 实际 十一月 2024 / 期望 十一月 2024
[check-date] PASS C7 MMMM YYYY 换 en locale = November 2024 — 实际 November 2024 / 期望 November 2024
[check-date] PASS C8 MMM zh-CN / en = 11月 / Nov — 实际 11月 / Nov / 期望 11月 / Nov
[check-date] PASS C9 星期 token dddd ddd dd d（moment 的 d 是数字星期，0=周日） — 实际 星期五 周五 五 5 / 期望 星期五 周五 五 5
[check-date] PASS C10 时间 token HH:mm:ss|H:m:s|hh:mm A|h:mm a（en locale） — 实际 09:30:00|9:30:0|09:30 AM|9:30 am / 期望 09:30:00|9:30:0|09:30 AM|9:30 am
[check-date] PASS C10 中文 locale 的 meridiem 是 moment 的六档「上午/晚上」而不是 AM/PM — 实际 上午 / 上午 / 09:30 上午 / 期望 上午 / 上午 / 09:30 上午
[check-date] PASS C11 偏移量 token Z ZZ — 实际 +08:00 +0800 / 期望 +08:00 +0800
[check-date] PASS C12 时间戳 token X x — 实际 1730424600 1730424600000 / 期望 1730424600 1730424600000
[check-date] PASS C13 [字面量] 转义 — 实际 发布于 2024 年 MM 月 / 期望 发布于 2024 年 MM 月
[check-date] PASS C14 date == null 时等价 moment()（注入 config.now 保证确定性） — 实际 2026-01-02 11:04:05 / 期望 2026-01-02 11:04:05
[check-date] PASS C15 createSiteDateFormatter 绑定站点配置 — 实际 2024-11-01 | 09:30:00 | 2024-11-01 09:30:00 | 2024-11-01T01:30:00.000Z | 十一月 2024 | 2024-11-01T01:30:00.000Z / 期望 2024-11-01 | 09:30:00 | 2024-11-01 09:30:00 | 2024-11-01T01:30:00.000Z | 十一月 2024 | 2024-11-01T01:30:00.000Z
[check-date] === D. 上游 oracle（moment-timezone） ===
[check-date] oracle = moment-timezone 0.5.48（.baseline-work\node_modules）
[check-date] PASS D1 固定时刻格式化矩阵（3 时区 × 2 locale × 10 格式 = 60 组）与 moment-timezone 逐字一致
[check-date] PASS D2 10 篇 fixtures 的无时区字面量，解析结果与 Hexo 的 moment(new Date(v)) 一致（宿主 TZ=Asia/Shanghai）
[check-date] PASS D3 非法日期与 moment 同款输出 — 实际 Invalid date / 期望 Invalid date
[check-date] PASS D4 helpers.ts formatMomentLike 与 date.ts formatDateParts 在共同支持的 token 上一致
[check-date] === E. 基准站真实产物对拍（.baseline-work/public） ===
[check-date] PASS E 2024/11/01/longform-hexo-astro/index.html 的 datetime/可见文本/title 与我们一致 — datetime=2024-11-01T01:30:00.000Z 文本=2024-11-01 title=发表于 2024-11-01 09:30:00
[check-date] PASS E 2024/11/01/longform-hexo-astro/index.html 由 frontmatter 复算 date_xml — 实际 2024-11-01T01:30:00.000Z / 期望 2024-11-01T01:30:00.000Z
[check-date] PASS E 2024/11/01/longform-hexo-astro/index.html 由 frontmatter 复算可见文本（date） — 实际 2024-11-01 / 期望 2024-11-01
[check-date] PASS E 2024/11/01/longform-hexo-astro/index.html 由 frontmatter 复算 title（full_date） — 实际 2024-11-01 09:30:00 / 期望 2024-11-01 09:30:00
[check-date] PASS E 2025/02/20/cover-variants/index.html 的 datetime/可见文本/title 与我们一致 — datetime=2025-02-20T11:45:00.000Z 文本=2025-02-20 title=发表于 2025-02-20 19:45:00
[check-date] PASS E 2025/02/20/cover-variants/index.html 由 frontmatter 复算 date_xml — 实际 2025-02-20T11:45:00.000Z / 期望 2025-02-20T11:45:00.000Z
[check-date] PASS E 2025/02/20/cover-variants/index.html 由 frontmatter 复算可见文本（date） — 实际 2025-02-20 / 期望 2025-02-20
[check-date] PASS E 2025/02/20/cover-variants/index.html 由 frontmatter 复算 title（full_date） — 实际 2025-02-20 19:45:00 / 期望 2025-02-20 19:45:00
[check-date] PASS E 2024/12/15/short-note/index.html 的 datetime/可见文本/title 与我们一致 — datetime=2024-12-15T13:05:00.000Z 文本=2024-12-15 title=发表于 2024-12-15 21:05:00
[check-date] PASS E 2024/12/15/short-note/index.html 由 frontmatter 复算 date_xml — 实际 2024-12-15T13:05:00.000Z / 期望 2024-12-15T13:05:00.000Z
[check-date] PASS E 2024/12/15/short-note/index.html 由 frontmatter 复算可见文本（date） — 实际 2024-12-15 / 期望 2024-12-15
[check-date] PASS E 2024/12/15/short-note/index.html 由 frontmatter 复算 title（full_date） — 实际 2024-12-15 21:05:00 / 期望 2024-12-15 21:05:00
[check-date] 结果：59 PASS / 0 FAIL / 0 SKIP
[check-date] [check-date] 全部通过
```

### 3.3 跨天用例的具体值

| 场景 | 正确值（本实现） | 若按 Astro 旧行为（UTC） |
| --- | --- | --- |
| `2025-02-20 19:45:00`（`tests/fixtures/cover-variants.md`） | `2025-02-20T11:45:00.000Z` → +08 显示 `2025-02-20 19:45` | 当 `19:45Z` → +08 显示 **`2025-02-21 03:45`（日期 +1 天）** |
| `2025-02-20 23:30:00`（任务点名边界） | `2025-02-20T15:30:00.000Z` → +08 显示 `2025-02-20 23:30` | 当 `23:30Z` → +08 显示 **`2025-02-21 07:30`（日期 +1 天）** |
| `2025-03-05 06:00:00`（反方向） | `2025-03-04T22:00:00.000Z` → UTC 日期 `03-04`，+08 日期 `03-05` | 当 `06:00Z` → +08 `14:00`，日期仍 `03-05`（这类反而不跨天） |
| `2024-12-15 21:05:00`（`tests/fixtures/short-note.md`） | `2024-12-15T13:05:00.000Z` → +08 显示 `2024-12-15 21:05` | 当 `21:05Z` → +08 `2024-12-16 05:05`（+1 天） |

10 篇 fixtures 的 frontmatter 全是无时区写法，按 `+08` 解释后的 `date_xml` 与基准站
**逐页一致**（D2 段全部通过；E 段抽 3 页对拍）。

### 3.4 一个工具细节

`.baseline-work/` 被 gitignore，CI 上没有 moment-timezone，D/E 段会 SKIP 而不是 FAIL
（Exit 仍 0）。检测逻辑与 `check-helpers.mjs` 的「上游 oracle 缺失即 SKIP」一致，
可用 `THEME_MOMENT_ROOT` / `BASELINE_WORK_DIR` 指定路径。

---

## 4. 资源路径策略（摘要）

全文：`docs/reference/resource-path-policy.md`。结论：

| 问题 | 结论 |
| --- | --- |
| 允许豁免 | ① 打包目录 + 内容哈希（`/_astro/*.<HASH>.*`、`?v=<HASH>`），前提是内容同一份且文件名语义可推导；② 框架注入元素（`data-astro-*`、`ClientRouter`、`astro-*` meta）——这一类上游没有对应物 |
| 不允许 | 文件名语义变化（`/js/main.js` → `chunk-*.js`）、加载属性丢失（`media="print" onload="this.media='all'"`）、资源顺序变化、本地资源 404/空文件、CSS/JS 内容变化 |
| 当前 diff 工具行为 | `diff-html.mjs` 的 N4 只归一化哈希段，**不豁免**目录/基名差异 → `/css/index.css` ↔ `/_astro/upstream.<HASH>.css` 现在会报 `attr-changed`。策略要求按「已登记豁免 + 计数」处理，并要求新增 `verify-assets.mjs` 兜住「豁免后资源真的没加载」 |
| Phase 7 资源路径字节级 | **能**。实测 `vite.build.rollupOptions.output.assetFileNames = 'css/[name].css'` 可去掉哈希并把 `<link>` 改成 `css/upstream.css`；固定字面量名会被 Vite 改名成 `index2.css`（不要赌），推荐把 Stylus 产物直接写 `public/css/index.css` |
| Phase 7 整页 HTML 字节级 | **不能**（属性顺序、空白、注释、Astro 框架注入、module 包装）。PLAN §3.2 的「归一化后结构一致」才是正确的判据；建议 Phase 7 目标拆成「资源路径与加载属性字节级 + DOM 归一化后结构一致」 |

---

## 5. 构建与 verify 现状

构建（`pnpm build` → `astro build`）：

```text
[stylus-hexo-config] index.styl: 102 个配置键, 展开 150 个文件
[debug-collection] 集合 posts 条目数 = 10
19:45:39 ✓ Completed in 74ms.
19:45:39 [build] 3 page(s) built in 2.40s
19:45:39 [build] Complete!
exit=0
```

verify（`node scripts/verify-css.mjs`）：

```text
[verify-css] baseline: docs\baseline.json（commit 72439d93）
[verify-css] CSS 源: examples\blog\dist\_astro\upstream.DeEHpLXK.css
[verify-css] PASS 字节数: 实际 682990 / baseline 683218（-0.03%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78457 / baseline 79124（-0.84%，阈值 ±5%）
[verify-css] WARN SHA256 不一致（记录，不判失败）：实际 429ff06f63bbfd6852917608d3737c8654d4bfe88571ea4ef2530270c1439175 / baseline 7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61
[verify-css] 比对通过
exit=0
```

当前 `diff-html --all`（**其他组员正在改 pages/components，数据会变，仅记录时刻状态**）：

```text
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 150 条（结构 91 / 文件 47 / 属性 12），缺口 缺 857 / 多 60 节点
```

> 构建期间 `examples/blog/src/pages/` 里只有 index/page2/debug-collection 三个页面，
> 文章页/归档页仍是 `file-missing`（47 条），所以这个数字不是本次改动的回归指标。

---

## 6. 已知限制与残留

### 6.1 本任务范围内的限制

1. `date.ts` **没有**从 `src/index.ts` 导出（`index.ts` 不在本次写范围）。组件接线时加一行
   `export * from './utils/date.ts'`（或按需导出）即可；现在可以直接
   `import { hexoDate } from '../utils/date.ts'`（包内相对路径，Node 24 / Vite 都支持 `.ts` 扩展名）。
2. `parseHexoDate` 对「显式带时区」与「无时区」的区分依赖字面量，content collection 的
   `Date` 输入已经丢失字面量信息——所以 `content.config.ts` 的 +08 平移与 `date.ts` 的
   站点时区解释是**两处独立实现**。当前两者结论一致（由 E 段对拍保证）；长期建议 P2 之后
   让 content collection 用自定义 loader 保留原字面量，统一走 `parseHexoDate`。
3. `content.config.ts` 把时区写死成 `+08`（`SITE_UTC_OFFSET_MINUTES`），而不是 IANA 名。
   Asia/Shanghai 无夏令时所以等价；换有 DST 的站点时区要改用 `date.ts` 的 `zonedWallClockToMs`。
4. moment 的本地化 longDateFormat token（`L`/`LL`）未实现（主题配置没用）；
   `Do`/`Q`/`e`/`E` 等 token 也未实现，遇到会原样输出。要扩就照 moment locale 数据补表。

### 6.2 本次**没有**处理、但 diff 里一定会遇到的真实渲染差异

这三类是上游 marked 与 remark/unified 的**渲染器差异**，不是 diff 工具的误报，
Phase 2/6 要决策是复刻还是登记豁免（已实测确认，不是猜测）：

| # | 差异 | 实测 | 影响 |
| --- | --- | --- | --- |
| 1 | **代码块高亮** | 上游 `_config.yml: syntax_highlighter: highlight.js` + `highlight.line_number: true` → `<figure class="highlight js"><pre>…`（含行号）；Astro 默认 Shiki → `<pre class="astro-code github-dark">` | 每个代码块都是结构差异。建议 `markdown.syntaxHighlight: false` + rehype 插件复刻 hexo highlight，或把 code 块列豁免（P2/P6 决策） |
| 2 | **脚注** | 上游 marked 不解析 `[^note1]` → 输出字面文本；Astro `remark-gfm` 渲染成 `<sup><a …footnote-ref>` + `<section data-footnotes>` | 长文 fixture 会多出整段脚注区块 + 正文少 2 处字面文本。要么关 footnotes（remark-gfm 里没有公开开关，需要自定义 plugin），要么登记豁免 |
| 3 | **heading id 的 slug 算法** | 实测同一标题：baseline `不能被「优化」的部分` vs Astro `不能被优化的部分`（github-slugger 去掉 `「」`） | TOC 锚点链接错位；id 在 diff 工具里是「故意不归一化」项，会报 `attr-changed`。需要复刻 hexo-util 的 slugize |

### 6.3 顺手核对过、**没有**问题的项

- `~~删除线~~`：两边都输出 `<del>`（baseline 实测有 `<del>`）。
- 纯日期 / 带时区日期的解析：A 段 13 条。
- 中文月份/星期名：D1 的 zh-cn 矩阵（`十一月`、`星期五` 与 moment 一致）。
- 上游 `<img>` 重复 `onerror` 属性（P2-13 §9 记录）：与本任务无关，工具已按「保留第一个」处理。

---

## 7. 结论：两条对齐完成了吗

**Markdown 渲染对齐：完成「smartypants 这一类」，但不是全部。**
本轮只关掉了 unified 的智能标点（配置 + 处理器级 + 真实产物级三重证据），
mermaid 的 `-->` 原样保留、正文 `--`/`...`/引号不再被改写。
但 marked ↔ remark 还有三类**真实**渲染差异（代码块高亮、脚注、heading slug，见 §6.2），
它们会稳定出现在 Phase 2 的 diff 里——**这不是误报，别当误报吞掉**。

**日期对齐：完成。**
`date.ts` 覆盖 Hexo 的 4 个日期 helper，无时区字面量按站点时区解释（含 DST 的
重叠/空洞规则），跨天边界有具体断言，59 条验收全绿，并与真实 moment-timezone、
基准站真实 HTML 双向对拍一致。剩下的只是「接线」：组件里把 `this.date` 的调用
换成 `hexoDate(value, siteConfig)`，别再直接用 `Date`/`toISOString()` 渲染。

**diff 里还能预期哪些已知误报 / 已知差异：**

1. ~~正文 `--`/`...`/英文引号被 smartypants 改写~~ → **已消除**（本轮）。
2. ~~日期差 8 小时 / 跨天~~ → **已消除**（content collection 归一化 + `date.ts` 格式化层）；
   接页面时若绕开 `date.ts` 会重新出现，属接线 bug 不是误报。
3. **资源路径差异**：`/css/index.css` ↔ `/_astro/upstream.<HASH>.css` 仍会报 1 条/页，
   按 `docs/reference/resource-path-policy.md` 登记豁免（带计数 + `verify-assets.mjs` 兜底）；
   `media`/`onload` 属性丢失**不在豁免范围**，Head 组件（P2-3）必须原样输出。
4. **代码块高亮 / 脚注 / heading slug** 三类渲染器差异（§6.2），每个代码块、每篇带脚注
   的文章、每个带中文标点的标题都会命中——需要 Phase 2/6 决策。
5. **Astro 机制元素**（`data-astro-*`、`ClientRouter`、`astro-*` meta）已被工具忽略并计数，
   不是差异；但如果计数突然变多（比如新增了 scoped style），要看一眼。
