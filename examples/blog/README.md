# examples/blog

迁移的验证站：用上游的完整样式、配置与固定内容，逐页对齐上游 `hexo g` 产物。当前构建 **61 个页面**（49 页基线 + 12 独立 fixture，以 CI 构建实测为准），49 页基线与产物的 HTML 结构 diff 由 [scripts/diff-html.mjs](../../scripts/diff-html.mjs) 逐页比对。12 独立 fixture 全名单（dist 相对基线的差集）：`/categories/`、`/tags/`、`/album/`、`/album/demo/`、`/album/gallery/`、`/equipment/`、`/essay/`、`/fcircle/`、`/link/`、`/music/`、`/page-default/`、`/room/`。

## 里面是什么

| 文件 | 来源 |
| --- | --- |
| `theme.config.yml` | 上游 [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 1.7.1 的 `_config.yml`，未改动 |
| `theme.config.demo.yml` | 线上演示（anzhiyu.example.mcxiaochen.top）功能全开配置留档（2026-11-25）；CI / 验收构建仍用 `theme.config.yml` |
| `src/styles/**` | 上游 `source/css/` 全量 72 styl + 47 css，未改动 |
| `src/content.config.ts` | 内容集合：直接读仓库根 `fixtures/`（零复制），frontmatter 日期按 Hexo `Asia/Shanghai` 语义归一化 |
| `src/pages/**` | 首页 / 文章详情 / 归档分类标签 / 404 / 独立页面 `[...path].astro` / 分页 |
| `data/*.yml` | `site.data.*` 的 Astro 等价数据源（about / essay / album / link / equipment 等） |
| `public/{img,anzhiyu}/` + `favicon.ico` | 站点静态资源（`img/` 13 个文件、`anzhiyu/random.js`、favicon）；JS/CSS 不再落 `public/`，由主题包 `anzhiyuAssets()` integration 在构建期注入 `dist/`（见根 README「使用」） |
| `astro.config.mjs` | Unified 处理器（smartypants 关闭）+ [remark-hexo-tag](../../packages/remark-hexo-tag/) + highlight.js 重建 `figure.highlight` |

上游文件按 GPL-3.0 授权，与本仓库一致。

## 跑起来

需要 Node ≥ 22.23.4（Astro 7 要求，与包 `engines`（`>=22.23.4`）同限）：

```bash
pnpm install --frozen-lockfile
pnpm --filter blog dev
pnpm --filter blog build      # 61 页，产物在 dist/（以 CI 构建实测为准）
```

## 验收命令

```bash
# 49 页 HTML 结构 diff（与 tests/baseline-html/ 里的基线比对；extract 是前置步骤）
node scripts/extract-baseline-html.mjs
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all

# 42 个 Hexo tag 的单测
node packages/remark-hexo-tag/test/run.mjs
```

构建时控制台会打印类似：

```
[stylus-hexo-config] var.styl: 133 个配置键, 展开 N 个文件
```

少量 `在配置里不存在，按 null 处理` 的警告是正常的——它们对应上游 `_config.yml` 里被注释掉的可选项。

## 已知边界

- 与基线的 diff **49/49 PASS / 0 差异**（CI 硬门禁；C4 收紧 N21 豁免后的终值以 CI 复核为准）
- 交互层与第三方集成已接线并通过 CI 行为验收（e2e 29 passed / 9 skipped；第三方服务真实联通待人工）；`cssMinify` 暂关（上游自身有一处非法 CSS，见 PLAN 的 D7）
