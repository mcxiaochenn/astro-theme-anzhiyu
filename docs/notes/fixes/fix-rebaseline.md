# fix-rebaseline：golden 重基线（abbrlink fixture 并入）——已收尾（Lead 拍板后完成）

- 任务：把 `fixtures/abbrlink-post.md` 并入 `.baseline-work/` 重建 hexo golden（48 页旧 golden → 49 页），重打 `tests/baseline-html/baseline-html.tar.gz` 并同步数字
- 执行日：2026-01-25（Asia/Shanghai，会话时间戳 2026-11-25 07:07–07:3x）；收尾续跑同日（§9）
- **状态：✅ 已收尾。首跑按「预期外 FAIL 就停」停在 3b（§0-§8 为停机时的历史快照）；Lead 拍板 ①-⑤ 后由 agent-9 续跑完成步骤 4-5 与全部验证（§9）。**
- 写过的文件：首跑 `.baseline-work/source/_posts/abbrlink-post.md`（新增 fixture 副本）+ 本报告；收尾追加 `tests/baseline-html/baseline-html.tar.gz` / `baseline-html.manifest.json` / `README.md`、`.github/workflows/ci.yml`（仅注释）、`docs/reference/baseline.json`（仅 pages）。`docs/reference/upstream-delta.md` 原样未动。禁改项（examples/blog/**、packages/**、scripts/**、fixtures/**、docs/reference/upstream-delta.md、baseline.json 的 CSS 字段）零改动。

---

## 0. TL;DR（停机原因与两处前提修正）

1. **前提修正 A（slug 建模）**：任务给的「front-matter 加 `slug: 24531` → `:title=24531`」在 hexo 7.3.0 **不成立**——post processor 无条件用文件名覆盖 front-matter 的 slug。已改用 hexo 官方的 front-matter `permalink:` 覆盖达成同一终态（`/2024/11/20/24531/`），3a 验证通过。详见 §4。
2. **前提修正 B（FAIL 范围）**：任务预期「FAIL 只在含文章列表的页」，实测 **48/48 全 FAIL**。差异爆炸半径 = 全局侧栏/导航计数器（文章数 9→10、标签「短讯」计数 1→2，每页都有）+ 标签云重排（17 个 tag 页）+ 相邻文章 prev/next（2 页）+ relatedPosts（1 页）+ 列表新条目（7 页）。**逐条归因后没有「加第 10 篇」解释不了的差异**（§3.2），但与任务的预期清单直接冲突 → 按「出现预期外 FAIL 就停：把页名与 diff 摘要写进报告，别硬改」停机，打包与数字同步等拍板后执行（§6 给了恢复命令）。

需要拍板的三件事（§7 汇总）：
- ① 爆炸半径（计数器/标签云/prev-next 全页变化）是否接受为「预期」，接受则继续步骤 4-5；
- ② `permalink:` 补丁（同名文件 + URL 硬定）vs 备选（文件改名 `24531.md`，`:title` 真走规则）二选一确认；
- ③ `docs/reference/baseline.json`（48 页清单 + 逐页 SHA256）本次禁改，重打后它与归档的「1:1 对应」不变量会被打破（49 文件 vs 48 行），需另开任务处理（其 CSS 数字照旧不动）。

---

## 1. 命令原始输出

### 1.1 步骤 1：fixture 副本 + front-matter（回读确认）

`fixtures/abbrlink-post.md` → `.baseline-work/source/_posts/abbrlink-post.md`，front-matter 回读（read 工具，行 1–11）：

```yaml
---
title: abbrlink 覆盖末段样本
date: 2024-11-20 10:30:00
categories:
  - 随笔
tags:
  - 短讯
abbrlink: 24531
slug: 24531
permalink: /2024/11/20/24531/
description: 带数字 abbrlink 的 fixture：文章 URL 末段应为 abbrlink 而不是文件 id，验证归档、分类、标签与 404 页的链接解析和实际路由一致。
---
```

正文与 `fixtures/abbrlink-post.md` 逐字一致（26→27 行仅因 front-matter 多两行）。`slug: 24531` 按任务要求加在 `abbrlink: 24531` 后；`permalink: /2024/11/20/24531/` 是本次补丁（§4）。

### 1.2 步骤 2：hexo generate

> 授权范围：仅本任务的 hexo generate。未跑 astro build / playwright / lighthouse。未跑 hexo clean。

**第 1 跑（失败，FATAL，日志 %TEMP%\hexo-generate.log 尾部）**：

```
INFO  Validating config
INFO  Start processing
FATAL Something's wrong. Maybe you can find the solution here: https://hexo.io/docs/troubleshooting.html
TypeError: Cannot read properties of null (reading 'date')
    at D:\Git-project\astro-theme-anzhiyu\.baseline-work\scripts\reproducible.js:39:38
    at D:\Git-project\astro-theme-anzhiyu\.baseline-work\scripts\reproducible.js:28:69
    at Array.sort (<anonymous>)
    at reorderModel (D:\Git-project\astro-theme-anzhiyu\.baseline-work\scripts\reproducible.js:28:54)
    at Hexo.<anonymous> (D:\Git-project\astro-theme-anzhiyu\.baseline-work\scripts\reproducible.js:37:5)
    ...
```

（banner 显示的 1.7.1 是主题 AnZhiYu 1.7.1 的版本串；`node_modules/hexo/package.json` 实测 **hexo 7.3.0**，`check-upstream-delta` 亦断言钉死 7.3.0。）

- 定位：崩在 `reproducible.js` 的 `before_generate` Post 排序里，`Object.entries(model.data)` 出现 **null 值条目**（`b[1]` 为 null → `b.date` 抛 TypeError）。
- 复现条件：当时 `db.json` 是 golden 时代 9 篇的旧缓存 + 新增第 10 篇的**过渡态**。用一次性 debug 脚本（%TEMP%，未进仓库）`hexo.load()` 后 dump：10 条 Post 全部正常（无 null），`hexo.call('generate')` 直接 OK——即该崩溃只在「旧 db.json + 新文件」首跑出现一次，其后连跑均不再复现（第 2、3 跑稳定）。
- 处置：**未改 `reproducible.js`（勿改）**。疑为 Warehouse db.json 过渡态竞态。CI 干净 checkout 无 db.json 理论不受影响；建议重打归档流程固定为「先删 db.json 再 generate」（见 §7 待拍板附注，本次未执行删除）。

**第 2 跑（成功，日志 %TEMP%\hexo-generate-run2.log 尾部）**：

```
INFO  Generated: categories/随笔/index.html
INFO  Generated: tags/Hexo/index.html
INFO  Generated: tags/TypeScript/index.html
INFO  Generated: tags/容器/index.html
INFO  Generated: tags/第三方/index.html
INFO  Generated: tags/工程化/index.html
INFO  Generated: tags/性能/index.html
INFO  Generated: tags/封面/index.html
INFO  Generated: tags/测试/index.html
INFO  Generated: tags/短讯/index.html
INFO  Generated: tags/置顶/index.html
INFO  Generated: tags/长文/index.html
INFO  Generated: tags/迁移/index.html
INFO  Generated: tags/行内/index.html
INFO  50 files generated in 195 ms
```

（50 条生成路由含 49 个 HTML + 1 个非 HTML 产物；HTML 清单见 §2。）

### 1.3 步骤 3a：URL 形态验证

```
24531/index.html exists: True
abbrlink-post dir exists: False
```

（首版产物曾落 `public/2024/11/20/abbrlink-post/`（slug 未生效时的 debug 跑产物，7:10 生成的陈旧文件），已确认为本次调试产生的孤立输出后删除；当前 `public/2024/11/20/` 下只有 `24531/`。）

### 1.4 步骤 3b：解压旧 golden + 48 页 diff

`node scripts/extract-baseline-html.mjs`：

```
[baseline-html] 归档：tests/baseline-html/baseline-html.tar.gz（488029 字节）
[baseline-html] 整包校验通过：SHA256 b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0（manifest tests/baseline-html/baseline-html.manifest.json）
[baseline-html] 逐文件校验：48/48 个文件 SHA256 与 manifest 一致
[baseline-html] 解压完成：48 个文件 / 2198761 字节 → .baseline-html
```

48 页逐页对比（`node scripts/diff-html.mjs --all`，`BASELINE_HTML_DIR=.baseline-html`、`DIST_DIR=.baseline-work\public`，即「旧 golden vs 新 public」；--all 与逐页 pair 模式同一比较器，页面清单 = `docs/reference/baseline.json` 的 48 页）：

```
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 366 条（文本 315 / 结构 46 / 属性 5），缺口 缺 143 / 多 264 节点
```

文件清单对照（旧 golden vs 新 public）：旧 48 HTML / 新 49 HTML，**只增 `2024/11/20/24531/index.html`，无删无改名**。

### 1.5 步骤 3c：check-upstream-delta

```
[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/reference/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
```

（exit 0，仍绿。）

---

## 2. 48 页 PASS/FAIL 清单

**PASS 0 / FAIL 48**。分类键：
- **G（全局计数器，48/48 页都有）**：导航 console 标签计数 `sup` 与 `ul/li[6]/span` "1"→"2"（标签「短讯」篇数 1→2）、`#sidebar-menus` 文章数 "9"→"10"、侧栏标签计数 "1"→"2"；部分页另有 `#aside-content` 侧栏副本 3 条同款。纯文本差异。
- **T（标签云重排，17 个 /tags/* 页）**：`#tag-page-tags` 里「短讯」链接位次 [13]→[4]（云按篇数降序，短讯 1→2 后上浮），结构 缺 6 / 多 6 节点。
- **P（prev/next 翻转，2 页）**：新文按日期插在 2024-11-01 与 2024-12-15 之间，上下篇指针换向。
- **R（relatedPosts，1 页）**：新文（标签短讯/分类随笔）进入相关推荐，+15 节点。
- **L（列表新条目/换页，7 页）**：列表出现新文卡片/条目或分页重排。
- **C（归档计数文本）**：`#archive` 头部篇数/月计数文本。

| # | 页面 | 结果 | 差异摘要（原文 N 条差异 / 缺口） | 归类 | 在任务预期清单 |
|---|------|------|--------------------------------|------|----------------|
| 1 | `/`（index.html） | FAIL | 7 条（文本 7） | G×7 | ✅ 是（但原因不是列表：新文日期较旧未进首页 recent 5 条，列表未变） |
| 2 | `/2024/11/01/longform-hexo-astro/` | FAIL | 6 条（文本 5 / 属性 1） | G×4 + P（next `/2024/12/15/short-note/`→`/2024/11/20/24531/`，标题→「abbrlink 覆盖末段样本」） | ❌ 否 |
| 3 | `/2024/12/15/short-note/` | FAIL | 8 条（文本 5 / 属性 2 / 结构 1），多 15 节点 | G×4 + P（prev→`/2024/11/20/24531/`；卡片 `data-lazy-src` `/img/default_cover.jpg`→`/`，新文无 cover）+ R | ❌ 否 |
| 4 | `/2025/01/10/multi-taxonomy/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 5 | `/2025/02/02/sticky-top/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 6 | `/2025/02/20/cover-variants/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 7 | `/2025/03/05/tags-inline/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 8 | `/2025/03/18/tags-block/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 9 | `/2025/04/01/tags-media/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 10 | `/2025/04/20/tags-thirdparty/` | FAIL | 4 条（文本 4） | G×4 | ❌ 否 |
| 11 | `/404.html` | FAIL | 4 条（文本 4） | G×4 | ✅ 是（但原因不是列表：404 的「最近文章」未变，同 index） |
| 12 | `/about/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 13 | `/archives/` | FAIL | 8 条（文本 8） | G×5 + C（归档头计数）+ aside 副本 | ✅ 是 |
| 14 | `/archives/2024/` | FAIL | 10 条（文本 9 / 结构 1），多 16 节点 | G + C + L（2024 组新条目 `div[3]`） | ❌ 否 |
| 15 | `/archives/2024/11/` | FAIL | 10 条（文本 9 / 结构 1），多 16 节点 | G + C + L（11 月组新条目 `div[2]`） | ❌ 否 |
| 16 | `/archives/2024/12/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 17 | `/archives/2025/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 18 | `/archives/2025/01/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 19 | `/archives/2025/02/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 20 | `/archives/2025/03/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 21 | `/archives/2025/04/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 22 | `/archives/2025/page/2/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 23 | `/archives/page/2/` | FAIL | 10 条（文本 9 / 结构 1），多 16 节点 | G + C + L（新条目 `div[5]`） | ◐ 「可能的 page/2/...」语义边缘 |
| 24 | `/categories/前端/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 25 | `/categories/前端/Astro/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 26 | `/categories/前端/Hexo/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 27 | `/categories/工程实践/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 28 | `/categories/标签测试/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 29 | `/categories/生活/` | FAIL | 7 条（文本 7） | G×7 | ❌ 否 |
| 30 | `/categories/随笔/` | FAIL | 8 条（文本 7 / 结构 1），多 16 节点 | G + L（新文卡片 `div[3]`） | ✅ 是 |
| 31 | `/page/2/` | FAIL | 15 条（文本 7 / 结构 6 / 属性 2），缺 41 / 多 67 节点 | G + L（recent-posts 第 2 页整体换页：新文挤入，6 条卡片重排） | ◐ 「可能的 page/2/...」 |
| 32 | `/tags/Astro/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 33 | `/tags/Hexo/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 34 | `/tags/TypeScript/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 35 | `/tags/tag插件/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 36 | `/tags/图片/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 37 | `/tags/媒体/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 38 | `/tags/容器/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 39 | `/tags/封面/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 40 | `/tags/工程化/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 41 | `/tags/性能/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 42 | `/tags/测试/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 43 | `/tags/短讯/` | FAIL | 10 条（文本 7 / 结构 3），缺 6 / 多 22 | G + T + L（新文卡片 `div[3]`） | ✅ 是 |
| 44 | `/tags/第三方/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 45 | `/tags/置顶/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 46 | `/tags/行内/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 47 | `/tags/迁移/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |
| 48 | `/tags/长文/` | FAIL | 9 条（文本 7 / 结构 2），缺 6 / 多 6 | G×7 + T | ❌ 否 |

（原始 diff 输出：%TEMP%\diff-all.log；紧凑清单：%TEMP%\diff-compact.log。`--limit 8` 截断只影响打印条数，页头「N 条差异」是全量计数。）

### 2.1 归因结论

366 条差异逐条归类后，**每一条都能由「新增第 10 篇（date 2024-11-20、标签短讯、分类随笔、无 cover、URL 末段 24531）」直接解释**，没有异常漂移（无主题/构建环境噪声、无内容渲染错位、无与 permalink 补丁相关的副作用——主题模板全文不引用 `slug`/`abbrlink`，URL 是唯一进入 HTML 的建模面）。

与任务预期清单的偏差本质：预期清单只列了「列表里出现新文条目」的页面，漏算了三个全局/半全局效应——
1. 侧栏与导航 console 的**计数器**（文章数 9→10、短讯计数 1→2）在**每一页**；
2. 标签页的**标签云按篇数排序**，短讯 1→2 后位次 13→4，17 个 tag 页全动；
3. 日期夹在中间的新文让 **2 个相邻文章页的 prev/next** 翻转、**1 页的 relatedPosts** 增块。

这三条都属于「加一篇 fixture 的物理必然」，但按任务停机规则（「出现预期外 FAIL 就停」）仍停机报批，未做任何「让它变绿」的硬改。

---

## 3. 新旧数字对照

| 指标 | 旧（现 manifest / 归档） | 新（本次产物） |
|------|--------------------------|----------------|
| HTML 文件数 | 48 | **49**（+`2024/11/20/24531/index.html`） |
| HTML 总字节 | 2,198,761 | **2,254,657**（停机时预览值，收尾打包实测同值） |
| 归档字节 | 488,029（476.6 KiB，gzip -9） | 停机时未打包 → 最终值见 §9.3 |
| 归档 SHA256 | `b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0` | 停机时未打包 → 最终值见 §9.3 |
| manifest | `tests/baseline-html/baseline-html.manifest.json`（8,234 字节，48 条逐文件 SHA256） | 停机时未刷新 → 最终值见 §9.3 |

数字同步（步骤 5，**未执行**）的目标位置已核对好：`tests/baseline-html/README.md`「当前归档」表（文件 48 / 2,198,761 / 488,029 / SHA 行）与 `.github/workflows/ci.yml` 的「48 页 / 477 KB」注释（只动注释）。`docs/reference/baseline.json` 的 CSS 数字按硬约束未动、也不会动。

---

## 4. slug 建模说明（前提修正 A 详情）

**任务模型**：golden 无 abbrlink 插件，用 slug 建模——同名文件 front-matter 加 `slug: 24531` → permalink `:title` = 24531 → 同形 URL `/2024/11/20/24531/`。

**实测该模型在 hexo 7.3.0 不成立**：
- `node_modules/hexo/dist/plugins/processor/post.js:44-49`：`const data = parse(content); … data.slug = info.title;` —— **无条件**用 `parseFilename(new_post_name, path)`（即文件名 slugize 结果）覆盖 front-matter 的 slug；`:title` 生成取 `post.slug`（`models/post.js` 的 `post_permalink` 链）。
- 证据：① 首版产物落 `public/2024/11/20/abbrlink-post/`（= 文件名主干）；② `hexo.load()` 后 Post 模型 dump：`slug= abbrlink-post`（front-matter 的 24531 已被覆盖）。

**采用的修正（保留任务指定的文件名与 slug 行）**：front-matter 额外加一行

```yaml
permalink: /2024/11/20/24531/
```

- 这是 hexo 官方的「单篇 permalink 覆盖」：`post.js:115-118` 把它存为 `data.__permalink`，`dist/plugins/filter/post_permalink.js:8-16` 直接返回它作为 `post.path`，文章页、列表 href、og:url、版权块全部随之 = `/2024/11/20/24531/`。
- `slug: 24531` 行按任务原文保留，但**在 hexo 7.3.0 里是惰性的**（被 post.js:49 覆盖），仅存档建模意图。
- 验证：3a 通过（`2024/11/20/24531/index.html` 在、`2024/11/20/abbrlink-post/` 不在）。

**备选（未采用）**：把副本文件名改成 `24531.md`——`slug` 真由文件名走 `:title` 规则得出 24531，URL 同形；代价是破坏任务指定的「同名文件」（golden 文件名不再镜像 astro 侧 id `abbrlink-post`）。两条路线产物 HTML 等价（主题模板全文不渲染 slug，`themes/anzhiyu` grep `\.slug|post\.source|abbrlink` 零命中；astro 侧 `postSlugOf()` 也只用于拼 URL）。若拍板选它，把文件改名、删掉 permalink 行重跑 generate 即可。

**与 astro 侧对照**：`site.ts postSlugOf = abbrlink ?? id` → `String(24531)` → `/2024/11/20/24531/`，与 golden 同形 ✓。golden 侧 slug 值（abbrlink-post，被覆盖后）与 astro 侧 id 一致；URL 末段两边都是 24531。

---

## 5. 本次实际改动清单

| 路径 | 动作 |
|------|------|
| `.baseline-work/source/_posts/abbrlink-post.md` | 新增（fixture 副本 + `slug: 24531` + `permalink: /2024/11/20/24531/`） |
| `.baseline-work/public/**` | hexo generate 产物（49 HTML） |
| `.baseline-work/db.json` | hexo 缓存自动重写 |
| `docs/notes/fixes/fix-rebaseline.md` | 本报告 |
| 其余（README / ci.yml / 归档 / manifest / docs/reference/baseline.json / docs/reference/upstream-delta.md / fixtures / packages / scripts / examples） | **零改动** |

---

## 6. 恢复步骤（拍板后执行，命令已备好）

```powershell
# 1) 步骤 4：重打包（确定性归档，连跑两次 SHA 不变）
node tests/baseline-html/make-baseline-html-archive.mjs
#    回读 tests/baseline-html/baseline-html.manifest.json：
#    文件数（预期 49）/ htmlBytes（预期 2254657 量级）/ 归档字节 / SHA256

# 2) 步骤 5：数字同步（只动这两处）
#    tests/baseline-html/README.md「当前归档」表：文件 48→49、2,198,761→新值、488,029→新值、SHA 换新
#    .github/workflows/ci.yml「48 页 / 477 KB」注释：→「49 页 / <新 KiB>」（只动注释）
#    docs/reference/baseline.json 的 CSS 数字照旧不动
```

---

## 7. 待拍板 / 待 CI 验证清单

**待拍板（阻塞步骤 4-5）**：
1. §2 爆炸半径（48/48 FAIL，计数器/标签云/prev-next/relatedPosts）是否接受为「加第 10 篇的预期」？接受 → 执行 §6。
2. slug 建模用「同名文件 + `permalink:` 补丁」（已实施）还是「文件改名 `24531.md`」（§4 备选）？
3. `docs/reference/baseline.json` 与新归档的「pages ↔ 归档文件 1:1」不变量（P-baseline-html-ci.md §1.5）在 49 文件后被打破：需要补 `/2024/11/20/24531/` 行 + 刷新 48 页逐页 bytes/sha256（其 CSS 数字仍不动）。本次文件白名单不含它，需另开任务。
4. 「48 页」口径全仓统一改「49 页」（README/PLAN/MIGRATION 等，fix-batch-b.md 已列过同类问题）——同样超出本次白名单。
5. 附注：重打流程是否固定「先删 `.baseline-work/db.json` 再 generate」，规避 §1.2 的首跑竞态。

**待 CI（本地禁跑 astro build/playwright/lighthouse，留 CI 冒烟）**：
1. B4 链路冒烟（fix-batch-b.md 清单）：astro 构建后 `/2024/11/20/24531/` 路由存在、`/2024/11/20/abbrlink-post/` 404；`/archives/`、`/categories/随笔/`、`/tags/短讯/`、`/404.html` 列表内该文 href 末段 = `24531`；文章页 `og:url`/版权 URL 同。
2. golden vs astro 逐页 cross-check 的两处口径：
   - 计数器（文章 10、短讯 2）与标签云排序（短讯上浮到位次 4）astro 侧同渲染；
   - **无封面文章的 prev/next 卡片**：golden 侧实测 `data-lazy-src="/"`（`url_for('')` 回落；对照组 longform 显式 `cover: /img/default_cover.jpg`）。astro 侧 post-page.ts 上下篇卡片对 coverless 文章渲染 `"/"`、不回落 `/img/default_cover.jpg`——**已核实一致（fix-cover-parity）**，静态对拍完成，CI 构建后逐页复核。
3. `diff-html --all` 分母换成 49 页后（baseline.json 补页后）与归档文件数保持 1:1。
4. CI 干净 checkout 首跑 hexo generate 是否会触发 §1.2 竞态（理论不会——无旧 db.json）；若触发则按拍板 5 固定删缓存流程。

---

## 8. 遗留证据位置

| 内容 | 位置 |
|------|------|
| hexo 第 1 跑（FATAL）日志 | `%TEMP%\hexo-generate.log` |
| hexo 第 2 跑（成功）日志 | `%TEMP%\hexo-generate-run2.log` |
| 48 页 diff 原始输出 | `%TEMP%\diff-all.log` |
| 48 页 diff 紧凑清单 | `%TEMP%\diff-compact.log` |
| Post/Tag/Category 模型 dump（slug 被覆盖证据） | `%TEMP%\debug-hexo-posts.log`、`%TEMP%\debug-hexo-generate.log` |
| upstream-delta 校验输出 | `%TEMP%\upstream-delta.log` |

---

## 9. Lead 拍板与收尾执行（2026-11-25，agent-9 续跑）

### 9.1 拍板结果（①-⑤，对应 §7 待拍板 1/2/3/5 与授权边界）

1. **① 爆炸半径接受为预期**：48/48 FAIL 全部为「新增第 10 篇」的正当连锁（全局计数器 9→10 与短讯 1→2、标签云重排、prev/next 翻转、relatedPosts、列表新条目），是旧 golden↔新 golden 的差异，不是回归。不再停机，继续步骤 4-5。
2. **② URL 建模保留 `permalink: /2024/11/20/24531/` 方案**（§4 保留：hexo 7.3.0 `post.js:49` 无条件用文件名覆盖 front-matter slug 的实测发现以本报告为准）；同时**删掉 `.baseline-work/source/_posts/abbrlink-post.md` front-matter 里死掉的 `slug: 24531` 行**（保留 `abbrlink: 24531` 与 `permalink:` 两行），删后重跑 hexo generate 确认产物不变。
3. **③ 新文章页加入对比集**：`docs/reference/baseline.json` 的 `pages` 补 `/2024/11/20/24531/`（共 49 页），并刷新逐页 bytes/sha256；**CSS 基线字段（commit/version/indexCss bytes/gzip/sha256 等）一个不动**；`check-upstream-delta` 保持绿。
4. **④ 数字同步授权仅限**：`tests/baseline-html/README.md`「内容约定」「当前归档」两处 + `.github/workflows/ci.yml`「48 页 / 477 KB」注释（只动注释）。
5. **⑤ 流程备注**：README「生成」节补一行——增量构建若遇 FATAL（`reproducible.js` 排序 null date），先删 `.baseline-work/db.json` 再 generate。

### 9.2 执行记录

1. **slug 死行删除 + 产物不变**（回答项 1）：
   - 删行前：`public/2024/11/20/24531/index.html` SHA256 `b81af742a4858f087dabd641fafa5e6969388ddb183643dfc48152b4b7322782`（49,589 字节）。
   - 删 `slug: 24531` 一行后 `hexo generate` exit 0，输出 `INFO 0 files generated in 182 ms`（逐路由渲染后与磁盘产物零差异，即全部 50 条路由输出不变；本次未触发 §1.2 竞态，未删 db.json）。
   - 删行后：同文件 SHA256 `b81af742…2782` / 49,589 字节**不变**；`htmlCount 49 / htmlTotalBytes 2254657` 与停机预览值一致。
2. **重打包**（回答项 2）：`node tests/baseline-html/make-baseline-html-archive.mjs` exit 0；manifest 回读 `fileCount 49 / htmlBytes 2254657 / archiveBytes 501268 / archiveSha256 7e1449d2e2df328cf028b8014e32cfdffe15fff3655dfce7d36d0348bd5908aa`，`2024/11/20/24531/index.html` 条目（49589 字节 / b81af742…）在列。
3. **baseline.json**（回答项 3）：pages 48→49——`ADD /2024/11/20/24531/` + 48 页 bytes/sha256 全量刷新；`git diff --no-index` 单 hunk `@@ -83,243 +83,248 @@` 起点即 `"pages": [`，+/- 行的 JSON key 去重后**只有 `path` / `bytes` / `sha256`** 三个字段名，`css`/`baseline`/`fixtures`/`perf` 块零触碰（脚本自检 + diff 双证）。`check-upstream-delta` PASS 29 / SKIP 0 / FAIL 0。
4. **数字同步**（回答项 4）：README「内容约定」「当前归档」48→49 / 2,198,761→2,254,657 / 488,029→501,268（476.6→489.5 KiB）/ SHA 换 `7e1449d2…`；ci.yml 注释「48 页 / 477 KB」→「49 页 / 490 KB」（501,268 B ≈ 489.5 KiB，沿旧口径取整）。⑤ 的流程备注已入 README「生成」节。
5. **验证 5a/5b/5c**（回答项 5，原始输出见 §9.4）：全部绿。

### 9.3 新旧数字对照表（最终值）

| 指标 | 旧 golden（48 页时代） | 新 golden（49 页，本次） |
|------|------------------------|--------------------------|
| HTML 文件数 | 48 | **49**（+ `2024/11/20/24531/index.html`） |
| HTML 总字节 | 2,198,761 | **2,254,657** |
| 归档字节 | 488,029（476.6 KiB，gzip 9） | **501,268（489.5 KiB，gzip 9）** |
| 归档 SHA256 | `b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0` | **`7e1449d2e2df328cf028b8014e32cfdffe15fff3655dfce7d36d0348bd5908aa`** |
| manifest 逐文件条目 | 48 | 49 |
| `docs/reference/baseline.json` pages | 48 行 | 49 行（新增 `/2024/11/20/24531/`，48 页统计全刷新） |
| `diff-html --all` 分母 | 48 | 49 |
| 新页自身 | — | 49,589 字节 / SHA256 `b81af742a4858f087dabd641fafa5e6969388ddb183643dfc48152b4b7322782` |

### 9.4 验证原始输出（收尾后一整套）

**5a `node scripts/extract-baseline-html.mjs`**（exit 0）：

```
[baseline-html] 归档：tests/baseline-html/baseline-html.tar.gz（501268 字节）
[baseline-html] 整包校验通过：SHA256 7e1449d2e2df328cf028b8014e32cfdffe15fff3655dfce7d36d0348bd5908aa（manifest tests/baseline-html/baseline-html.manifest.json）
[baseline-html] 逐文件校验：49/49 个文件 SHA256 与 manifest 一致
[baseline-html] 解压完成：49 个文件 / 2254657 字节 → .baseline-html
[baseline-html] 目录约定：解压根目录 = baseline HTML 根目录（index.html / 404.html / about/index.html …）
[baseline-html] 下一步：BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
```

**5b `BASELINE_HTML_DIR=.baseline-html DIST_DIR=.baseline-work\public node scripts/diff-html.mjs --all`**（exit 0，自比对管线自洽；49 页逐页 PASS，含新页）：

```
[diff-html] baseline: .baseline-html（49 页）
[diff-html] dist:     .baseline-work\public

PASS /  0 条差异
…
PASS /2024/11/20/24531/  0 条差异
…
汇总：49 页 / PASS 49 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致
```

（中间 47 页 PASS 行省略记账，完整清单 49 行全 PASS，逐页 0 条差异。）

**5c `node scripts/check-upstream-delta.mjs`**（exit 0）：

```
[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/reference/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
```

（含 `baseline.json commit/version/css.indexCssBytes/GzipBytes/Sha256 与登记表一致` 五连 PASS——CSS 锚点未动的机器旁证。）

### 9.5 待 CI 验证清单（最终 CI = **新 golden ↔ astro dist** 的比对；本地禁跑 astro build/playwright/lighthouse）

1. **B4 链路冒烟**（清单合并自 `docs/notes/fixes/fix-batch-b.md` 必答 4 / B4 行 278，与本报告 §7 待 CI-1 同源）：`astro build` 后 `/2024/11/20/24531/` 路由存在、`/2024/11/20/abbrlink-post/` 404；`/archives/`、`/categories/随笔/`、`/tags/短讯/`、`/404.html` 列表内该文 href 末段 = `24531`（期望断言）；文章页 `og:url`/版权 URL 同。
2. **golden vs astro 逐页 cross-check 两处口径**（承 §7 待 CI-2）：计数器（文章 10、短讯 2）与标签云排序（短讯上浮到位次 4）astro 侧同渲染；**无封面文章的 prev/next 卡片** coverless 渲染 `"/"`（golden 实测 `data-lazy-src="/"`），不回落 `/img/default_cover.jpg`——**已核实一致（fix-cover-parity）**。
3. **49 页分母 CI 闭环**：`diff-html --all` 以 49 页为分母跑 新 golden ↔ astro dist（BASELINE_HTML_DIR=.baseline-html），全 PASS 才算过；本地 5a/5b 已证「归档 ↔ baseline.json pages ↔ 解压」1:1 自洽。
4. **CI 干净 checkout 首跑 hexo generate** 是否触发 §1.2 竞态（理论不会——无旧 db.json；若触发按拍板 ⑤ 先删 `.baseline-work/db.json` 再 generate）。
5. **遗留数字口径（非回归，另行收口）**：`tests/baseline-html/README.md` 引言第 3 行「`docs/reference/baseline.json` 里的 48 页」与 `.github/workflows/ci.yml:60` 历史注释「48 页全 PASS」均不在拍板 ④ 授权清单内，未改；前者并入「48 页→49 页全仓口径统一」（§7 待拍板-4，fix-batch-b.md 同类项）一并处理，后者是 2026-11-24 历史陈述保持原样。
