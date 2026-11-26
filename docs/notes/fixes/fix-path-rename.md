# 2026-11-27 · 路径命名对齐 fuwari（归位 + 跨包导入收口）

> 类型：纯重命名/导入重构。铁律：HTML/DOM 零变化（diff-html 49/49 zero-diff 全程保持）。
> 对照：fuwari（saicaca/fuwari）的 `layouts/` 只放布局、`utils/*-utils.ts`、干净 import specifier 惯例。

## 变更映射

| 原路径 | 新路径 | 说明 |
|---|---|---|
| `src/layouts/site.ts` | `src/utils/url-utils.ts` + `src/types/site.ts` | URL/permalink 解析归 utils；SiteConfig/PostHrefResolver 类型归 types；url-utils re-export 类型，调用方单行导入不变 |
| `src/layouts/theme-context.ts` | `src/config/theme-context.ts` | 与 loader/schema/defaults 同居；layouts/ 只剩 BaseLayout.astro |
| `src/components/layout/` | `src/components/chrome/` | 消掉与 `src/layouts/` 撞名（fuwari 无此双重含义目录） |
| `examples/blog` 69 处 `../../packages/…/src/…` 深相对导入 | `astro-theme-anzhiyu/…` 等包名 specifier | examples/blog 补 `astro-theme-anzhiyu` / `remark-hexo-tag` workspace 依赖；走包 exports（新增 `./config/*`、`./types/*`）；**按真实用户用法写示例** |
| `theme.config.demo-delta.yml` | `theme.config.demo-delta.yml` | 名副其实：它是 deploy-demo-pages 深合并用的 delta，不是完整配置 |
| `fixtures/` | `src/content/` | 归测试目录；`content.config.ts` base、deploy-demo-pages、render-fixtures 同步 |

不动（有明确理由）：`assets/{js,css}`、`src/styles/upstream/`、`data/*.yml`（上游 `source/{js,css}` 对照轴 + Hexo `_data` 心智）；路由 `[year]/[month]/[day]/[slug]`（上游 permalink，基线锁死）；monorepo 形态（转模板仓是发布形态决策，另行拍板）。

## 计划外修复（验收暴露，均已实证）

1. **migrate-hexo.mjs 5 处 `\n` 锚定正则 → `\r?\n`**（contentConfig 头注释替换、archives/_data.ts 常量块守卫、SITE_IDENTITY 导入锚、preparePosts 删除行、插入点捕获组）。本仓库 autocrlf=true 下工作区是 CRLF，`/\d+\n/` 在 CRLF 文本上永不命中——`rewriteArchiveData` 守卫直接 fail（"基准常量块与预期结构不符"）。同文件 L2462/L2729 早有 `\r?\n` 先例，照改。
2. **accept-migration.mjs tag-residue 语义修正**：`{%`/`<%` 命中在 `pre`/`code` 内是**被示例出来的语法文本**（uitest 渲染测试页），与 links 检查的 ignoredCodeSamples 同一语义。实证：golden 466 处 vs dist 446 处 `{%` 100% 位于 pre/code 内、代码块外全站 0 处——上游（Hexo 权威产物）同样保留这些字面量。改为只判 pre/code 外真实残留，代码块内计数列样本不掩盖（ignoredCodeSamples=446）。此前 P7-4 验收时 hits=0 是因为旧渲染把代码块内容吞了；修复 fix-plan 代码块字面量后示例文本如实暴露，检查器语义未跟上。

## 验收（全绿）

remark-hexo-tag 76/76；check:schema/loader(43)/i18n(83)/helpers(272)/date(46+2skip)/slugger(49)；blog build 61 页；verify + compare-vars（68 严格一致/1 顺序差异/0 值不一致）；check:upstream-delta 28 PASS/1 SKIP；diff-html 49/49 zero-diff ×3 次（阶段 1/3/收尾）；e2e 38 pass/10 skip ×2；accept-migration 全量 gap=0 退出码 0 ×2（build/routes/links/assets/identity/page-types/tag-residue/search/feed 全 PASS）。

## 残留

- `src/content/about-page.md` 正文里 `仓库 fixtures/ 下`（第 23 行）**有意不改**：该文字渲染进 `/about/` 页、被 HTML 基线锁死，改了 diff-html 即 FAIL；性质是内容快照而非代码路径引用。
