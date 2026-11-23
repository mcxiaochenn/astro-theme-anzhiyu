# examples/blog

迁移的验证站：用上游的完整样式、配置与固定内容，逐页对齐上游 `hexo g` 产物。当前构建 **62 个页面**（48 页基线 + 9 篇文章 + about + 11 个 page.type fixture），48 页基线与产物的 HTML 结构 diff 由 [scripts/diff-html.mjs](../../scripts/diff-html.mjs) 逐页比对。

## 里面是什么

| 文件 | 来源 |
| --- | --- |
| `theme.config.yml` | 上游 [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 1.7.1 的 `_config.yml`，未改动 |
| `src/styles/**` | 上游 `source/css/` 全量 72 styl + 47 css，未改动 |
| `src/content.config.ts` | 内容集合：直接读仓库根 `fixtures/`（零复制），frontmatter 日期按 Hexo `Asia/Shanghai` 语义归一化 |
| `src/pages/**` | 首页 / 文章详情 / 归档分类标签 / 404 / 独立页面 `[...path].astro` / 分页 |
| `data/*.yml` | `site.data.*` 的 Astro 等价数据源（about / essay / album / link / equipment 等） |
| `public/{js,css,img,anzhiyu}/` | 上游 `source/js/*` 与静态资源复刻 |
| `astro.config.mjs` | Unified 处理器（smartypants 关闭）+ [remark-hexo-tag](../../packages/remark-hexo-tag/) + highlight.js 重建 `figure.highlight` |

上游文件按 GPL-3.0 授权，与本仓库一致。

## 跑起来

需要 Node ≥ 22.23.4（Astro 7 要求）：

```bash
pnpm install --frozen-lockfile
pnpm --filter blog dev
pnpm --filter blog build      # 62 页，产物在 dist/
```

## 验收命令

```bash
# 48 页 HTML 结构 diff（与 tests/baseline-html/ 里的基线比对）
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

- 与基线的 diff 尚未全部 PASS（当前 112 条差异，归属见 [docs/notes/](../../docs/notes/) 与 [PLAN.md §8](../../docs/PLAN.md)）
- 交互层与第三方集成的代码已落盘但未接线；`cssMinify` 暂关（上游自身有一处非法 CSS，见 PLAN 的 D7）
