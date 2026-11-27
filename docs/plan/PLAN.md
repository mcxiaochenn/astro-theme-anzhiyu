# Astro-Theme-Anzhiyu 架构与全量视觉复原基线（v2 Final）

> **核心理念：Anzhiyu 的外貌，Astro 的心。**
>
> **视觉层 100% 原厂像素真源**（离线提取上游 480KB 原厂编译态模块化原生 CSS + 本地内建 `anzhiyufont` 图标库 + 严格对齐原版 DOM 选择器契约），**工程层 100% 纯正现代 Astro 架构**（Astro 7 + Svelte 5 交互岛 + 模块化 `src/config/*.ts` + Shiki 双色高亮 + Pagefind 全文搜索，零 Stylus 运行时依赖、零旧版全局面条脚本）。

- **当前状态**：`✅` 全量视觉 1:1 复原与原生 Astro 化重构已完成
- **历史基线**：第一版 Hexo 兼容移植归档于 [04-legacy-port-plan.md](04-legacy-port-plan.md)

---

## 1. 架构解耦设计

| 维度 | 实现方案 |
| --- | --- |
| **样式与图标真源** | `scripts/extract-upstream-css.mjs` 从冻结上游 1.7.1 单次完整编译并切分为 `src/styles/anzhiyu/*.css`（8 个标准原生 CSS 模块）+ `astro-bridge.css`（双栏/单栏、Swiper、侧栏方向运行时 `data-*` 切换），`public/fonts/anzhiyufont.*` 本地化内建，零 Stylus 运行时依赖 |
| **配置体系** | 模块化 `src/config/*.ts`（`site.ts` / `profile.ts` / `nav.ts` / `theme.ts` / `comment.ts` / `music.ts`），IDE 完整类型推导 |
| **Markdown 与代码框** | `@astrojs/markdown-remark` Unified 管线 + `remark-hexo-tag`（42 标签）+ `rehype-anzhiyu-code.mjs`（Shiki 双主题着色输出原版 `figure.highlight[data-mac="true"]` 顶栏、行号与折叠结构） |
| **客户端交互** | Astro `ClientRouter` + Svelte 5 交互岛（`Console.svelte`、`ContextMenu.svelte`、`SearchDialog.svelte`、`ShortcutModal.svelte`、`MusicBall.svelte`、`CommentBarrage.svelte`、`BbTimeList.svelte`）+ `src/scripts/anzhiyu-client.ts` |
| **全文检索** | 原版 `#local-search` 视觉弹窗 + **Pagefind** 静态索引（开发模式自动回退内存检索） |

---

## 2. 常用命令

```bash
pnpm dev           # 启动开发服务器
pnpm check         # Astro + TypeScript + Svelte 全量类型检查
pnpm build         # 静态构建 + Pagefind 中文全文索引生成
pnpm test:remark   # 运行 42 个 Hexo 标签单元测试（76/76）
pnpm test:e2e      # 运行 Playwright E2E 与原版 DOM 契约验收
pnpm extract:css   # （可选维护）从本地上游源码重新编译提取原生 CSS 模块
```
