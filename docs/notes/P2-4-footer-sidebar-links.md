# P2-4 · Footer / Sidebar 外链 `attr-missing` 归零

- 执行人：`links-fix`（收敛 agent）
- 时间：2026-11-23 22:33–22:40（Asia/Shanghai）
- 仓库：`D:\Git-project\astro-theme-anzhiyu`（全部为未提交改动）
- 环境：Node **v24.22.0**（系统 24，`export PATH="/c/Program Files/nodejs:$PATH"`）· pnpm · astro build
- 基线：`.baseline-html/`（48 页，只读）；改动前产物快照 `.dist-snapshot/`（只读）；本次私有快照 `.dist-snapshot-links/`
- 任务：消除全量 HTML diff 里 286 条外链 `attr-missing`（占 398 条差异的 72%），清理 Phase 2 退出的最大障碍

## 0. 结论速览

| 项 | 前 | 后 |
|---|---:|---:|
| 全量 48 页 `diffCount` | **398** | **112** |
| `attr-missing` 总数 | **286** | **0** |
| ├─ 路径含 `sidebar-menus` | 192 | **0** |
| └─ 路径含 `footer-bar` | 94 | **0** |
| 其它 `attr-missing` | 0 | 0 |
| 首页 `diffCount` | 10 | **4** |
| 加锁构建 | — | ✅ exit 0，**62 page(s)** |

`398 − 112 = 286`，与消除的 `attr-missing` 条数精确相等。其它分类前后**逐项不变**（`attr-changed` 29 / `content` 48 / `text` 6 / `node-missing` 9 / `node-unexpected` 20），本次改动零回归、未引入任何 `attr-unexpected` 或新的 `attr-changed`。

> `pass=0 / fail=48` 仍成立（剩余 112 条差异属其它层），但本任务目标「外链相关 `attr-missing` 归零」已达成，见 §5。

## 1. 改动清单（全部在写范围内）

| 文件 | 说明 |
|---|---|
| `src/utils/external-link.ts` | **新增**。`isExternalLink(href, siteUrl?)`（自 `components/home/TopGroup.astro` 抽出并参数化）+ `externalLinkAttrs(href, siteUrl?)` 返回 `{ target, rel }` 或 `{}` |
| `src/components/layout/Footer.astro` | 新增局部 `linkAttrs(path)`；5 类配置驱动 `<a>` 改为展开补属性；更新文件头注释 |
| `src/components/layout/Sidebar.astro` | 同上；`a.back-menu-item` 改展开；更新文件头注释 |
| `src/components/layout/MenuItems.astro` | 同上；叶子 / 下拉子项 `<a>` 改展开；更新文件头注释 |
| `docs/notes/P2-4-footer-sidebar-links.md` | 本报告 |

三处 `linkAttrs` 形态一致，均先 `urlFor()` 再判定（Hexo 过滤器作用于最终 HTML）：

```ts
const linkAttrs = (path: string) => {
  const href = urlFor(path)
  return { href, ...externalLinkAttrs(href, site.url) }
}
```

## 2. 改了哪些 `<a>`

**补齐（配置驱动、当前无 `target`/`rel` 的链接）**

| 组件 | `<a>` | 基准站是否渲染 | 对应差异 |
|---|---|---|---|
| Footer | `footerBar.linkList[].a.footer-bar-link` → `https://github.com/anzhiyu-c/hexo-theme-anzhiyu` | ✅ | **94 条**（`footer-bar`） |
| Sidebar | `nav.menu[].item[].a.back-menu-item` → `https://hexo.anheyu.com/`、`https://image.anheyu.com/` | ✅ | **192 条**（`sidebar-menus`） |
| Footer | `socialBar.left/right[].a.deal_link` | ❌ socialBar 关闭 | 0（口径完整性） |
| Footer | `footer.list.project[].links[].a.footer-item` | ❌ list 关闭 | 0（口径完整性） |
| Footer | `footerBar.cc.a.footer-bar-link.cc` → `/copyright` | ❌ cc 关闭（且为站内） | 0（口径完整性） |
| MenuItems | 叶子 `a.site-page`、下拉子项 `a.site-page.child` | ❌ `theme.menu: null` → 空输出 | 0（口径完整性；Header 与 Sidebar 共用） |

**刻意不动**

- Footer 作者链接 `a.footer-bar-link`：pug 自己写死 `target="_blank"`，`href="/"` 是站内 → 不补（baseline 也确实没有 `rel`）。
- Footer `a.github-badge`（bdageitem）：pug 已写 `target="_blank"`，避免重复属性。
- Footer `a.random-friends-btn`、Sidebar `a.darkmode_switchbutton`、MenuItems 下拉父 `a.site-page`：`javascript:` → 按口径不补。
- Sidebar 三个 `sidebar-site-data` 的 `<a>`：`/archives/`、`/tags/`、`/categories/` 是硬编码站内目录，不可能为外链。
- `components/home/TopGroup.astro`：**未改**（按分工保留其私有 `isExternalLink`；`a#todayCard` 原本就有 `target`/`rel`，产物复核仍正确）。

## 3. 判定口径（与 Hexo `external_link` 一致）

上游 `_config.yml` 的 `external_link.enable: true` 是 `after_render:html` 过滤器，模板渲染完再扫 `<a>` 补 `target="_blank" rel="noopener"`；模板自己不写，所以组件输出时要补。

1. 只有「带协议 / 协议相对」的绝对 URL 形态才参与：`/^(?:[a-z][a-z0-9+.-]*:)?\/\//i`（`http(s)://`、`//`）。站内相对链接、锚点 `#`、`javascript:`、`data:`、`mailto:` 直接返回 `false`。
2. `new URL(href).hostname` 与 `new URL(siteUrl).hostname` 比较；`siteUrl = config.url = https://baseline.anzhiyu.test`。**host 相同视为站内，不补**；不同才补 `target="_blank" rel="noopener"`。
3. `siteUrl` 缺失时，只要能解析出 host 就按外链处理（与 `TopGroup.astro` 私有实现一致）。
4. 判定基于 `urlFor()` 之后的**最终 href**；`urlFor` 对绝对 URL 原样返回、对相对路径拼 `root`，不会把站内链接伪装成外链。
5. 属性顺序无关：`scripts/diff-html.mjs` 在 `normalizeNode` 里对属性按名字排序后再用 `Map` 比较，所以展开位置不影响结果。
6. 边界：`//host/path` 形态虽匹配正则，`new URL()` 无 base 时无法解析 → 保守返回 `false`（同 `TopGroup.astro`）。基准站配置里没有 `//` 开头的链接，不影响本次验收；若将来接入，可用 `siteUrl` 作 base 解析。

## 4. 验收（命令 + 真实输出）

### 4.1 加锁构建（Node 24，exit 0）

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /d/Git-project/astro-theme-anzhiyu \
  && while ! mkdir .build.lock 2>/dev/null; do sleep 3; done; trap 'rmdir .build.lock' EXIT; \
  CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm --filter blog build
```

```text
v24.22.0
22:36:04 [build] ✓ Completed in 3.08s.
22:36:04 [build] 62 page(s) built in 5.76s
22:36:04 [build] Complete!
```

### 4.2 私有快照 + 全量 diff JSON（前后数字）

```bash
# 前：只读公共快照
DIST_DIR=.dist-snapshot BASELINE_HTML_DIR=.baseline-html \
  node scripts/diff-html.mjs --all --json 2>/dev/null > .tmp-links-diff-before.json
# 后：私有快照
cp -r examples/blog/dist .dist-snapshot-links
DIST_DIR=.dist-snapshot-links BASELINE_HTML_DIR=.baseline-html \
  node scripts/diff-html.mjs --all --json 2>/dev/null > .tmp-links-diff.json
```

统计脚本（遍历 `pages[].diffs[]`，按 `kind` 与 `path` 分类）的真实输出：

```text
===== BEFORE (.dist-snapshot) =====
pages= 48 summary.diffCount= 398 counted diffs= 398 truncatedPages= 0
byKind= {"attr-changed":29,"content":48,"text":6,"attr-missing":286,"node-missing":9,"node-unexpected":20}
attr-missing sidebar-menus = 192
attr-missing footer-bar = 94
外链相关合计 = 286
其它 attr-missing = 0

===== AFTER (.dist-snapshot-links) =====
pages= 48 pass= 0 fail= 48 summary.diffCount= 112 counted= 112
byKind= {"attr-changed":29,"content":48,"text":6,"node-missing":9,"node-unexpected":20}
attr-missing sidebar-menus = 0 | footer-bar = 0 | 外链合计 = 0 | 其它 = 0

[.tmp-links-diff.json] summary.diffCount = 112 | attr-missing 总数 = 0 | 外链相关(sidebar-menus/footer-bar) = 0
```

用**同一份当前工作区脚本**重跑前后，排除并行改动脚本带来的口径漂移：

```text
BEFORE(.dist-snapshot)      : {"diff":398,"am":286,"s":192,"f":94}
AFTER (.dist-snapshot-links): {"diff":112,"am":0,"s":0,"f":0}
```

> `diff` 脚本有差异时 exit=1，属正常返回，非崩溃。

### 4.3 首页单页 diff（残留条目）

```bash
DIST_DIR=.dist-snapshot-links BASELINE_HTML_DIR=.baseline-html \
  node scripts/diff-html.mjs .baseline-html/index.html .dist-snapshot-links/index.html --limit 20
```

```text
[diff-html] baseline: .baseline-html\index.html
[diff-html] dist:     .dist-snapshot-links\index.html
FAIL .baseline-html\index.html ↔ .dist-snapshot-links\index.html  4 条差异（文本 2 / 属性 1 / 脚本样式 1）
    1. [属性/attr-changed] /html/head/meta[17]
       期望: content="<SITE>/index.html"
       实际: content="<SITE>/"
    2. [脚本样式/content] /html/head/script#config-diff[2]
       期望: 「var GLOBAL_CONFIG_SITE = { configTitle: 'AnZhiYu Baseline', title: 'AnZhiYu Baseline', postAI: '', pageFillDescription: …」（264 字符）
       实际: 「var GLOBAL_CONFIG_SITE = { configTitle: 'AnZhiYu Baseline', title: 'AnZhiYu Baseline', postAI: '', pageFillDescription: …」（270 字符）
    3. [文本/text] /html/body/div#body-wrap[4]/main#blog-container/div#content-inner[2]/div#recent-posts[1]/div[4]/div[2]/div[3]/text()
       期望: "本页覆盖媒体与卡片类 tag。媒体地址使用占位 URL 或主题自带图片，只关心生成的 HTML 结构。 image图片示例 inlineimage行内图片：。 audio / videoYour browser does not suppo…"
       实际: "本页覆盖媒体与卡片类 tag。媒体地址使用占位 URL 或主题自带图片，只关心生成的 HTML 结构。 image图片示例 inlineimage行内图片：。 audio / videoYour browser does not suppo…"
    4. [文本/text] /html/body/div#body-wrap[4]/main#blog-container/div#content-inner[2]/div#recent-posts[1]/div[5]/div[2]/div[3]/text()
       期望: "本页覆盖块级容器类 tag。每个 tag 都带了会触发不同渲染分支的参数。 note 系列默认 flat 风格的 note。 modern 风格的 warning note。 simple 风格的 success note。 带图标的 no…"
       实际: "本页覆盖块级容器类 tag。每个 tag 都带了会触发不同渲染分支的参数。 note 系列 默认 flat 风格的 note。 modern 风格的 warning note。 simple 风格的 success note。 带图标的 n…"
[diff-html] 结构不一致
```

残留 4 条**没有一条是外链属性**（改动前首页 10 条 → 后 4 条，减少的 6 条正是 footer 1 个 + sidebar 2 个外链 a × 2 属性）。

### 4.4 产物复核（首页所有 `rel="noopener"` 的 `<a>`）

```text
  <a id="todayCard" class="todayCard" href="https://docs.anheyu.com/" style="z-index: 1;" target="_blank" rel="noopener">
  <a class="footer-bar-link" href="https://github.com/anzhiyu-c/hexo-theme-anzhiyu" target="_blank" rel="noopener" title="主题">
  <a class="back-menu-item" href="https://hexo.anheyu.com/" target="_blank" rel="noopener" title="博客">
  <a class="back-menu-item" href="https://image.anheyu.com/" target="_blank" rel="noopener" title="安知鱼图床">
```

3 个目标外链全部补齐；`todayCard` 是 `TopGroup.astro` 原有产物，未改动且仍正确。站内 `/archives/`、`/tags/`、`/categories/`、`javascript:void(0);` 与作者链接 `href="/"`（仅原有 `target="_blank"`）均**未**被误加 `rel`。

## 5. 剩余差异归属（112 条，均不在本次写范围）

| 分类 | 条数 | 归属 | 前后变化 |
|---|---:|---|---|
| `attr-changed` | 29 | head 元数据，典型如首页 `/html/head/meta[17]` 的 og:url `<SITE>/index.html` ↔ `<SITE>/` → Head / 站点配置层 | 0 |
| `content` | 48 | 48 页各 1 条 `/html/head/script#config-diff` 的 `GLOBAL_CONFIG_SITE` 脚本 → Head / console 配置脚本层 | 0 |
| `text` | 6 | 正文渲染文本（note 系列空格 / 断句等）→ 内容渲染层 | 0 |
| `node-missing` | 9 | 结构缺口 → P3-1 widget / P4-1 资源 / P4-2 脚本层 | 0 |
| `node-unexpected` | 20 | 同上 | 0 |
| `attr-missing` | **0** | 外链属性（本次任务） | **−286** |

首页 4 条残留逐条归属：① head meta（Head 层）；② `config-diff` 脚本（Head/console 层）；③ `recent-posts[4]` 的 tags-media 正文（内容渲染层）；④ `recent-posts[5]` 的 tags-block 正文（内容渲染层）。

结论：本次改动只消除了外链 `attr-missing`，其余 112 条计数与内容前后完全一致，属于其它 agent / 其它 Phase 的范围；48 页 PASS 的剩余障碍需由这些层继续收敛。

## 6. 范围与约束自查

- ✅ 只改了分工内 4 个源文件 + 本报告；`TopGroup.astro` 未改。
- ✅ 未碰 `BaseLayout.astro` / `Head.astro` / `Header.astro` / `head/` / `console/` / 其它 agent 文件 / `docs/PLAN.md` / `scripts/diff-html.mjs`（工作区里这些文件的 `M`/`??` 来自并行 agent，与本次无关）。
- ✅ 未新增 npm 依赖；未 commit / push / 改分支。
- ✅ 构建全程持 `.build.lock`，`trap` 已释放。
- 本地临时证据（未提交、未改 `.gitignore`）：`.dist-snapshot-links/`、`.tmp-links-diff.json`、`.tmp-links-diff-before.json`、`.tmp-links-diff-after.json`。复核可直接用 `.dist-snapshot-links` 重跑 §4.2/§4.3 命令。
