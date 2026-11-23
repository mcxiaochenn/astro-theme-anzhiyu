[English](README.en.md) · 简体中文

# astro-theme-anzhiyu

[Anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 博客主题的 Astro 移植版。

> **当前状态：迁移进行中。** 验证站 [examples/blog](examples/blog) 已用上游全量样式与配置构建出 **62 个页面**；48 页与上游基线的 HTML 结构 diff 收敛到 **112 条差异**（验收工具 [scripts/diff-html.mjs](scripts/diff-html.mjs)，逐页比对）；42 个 Hexo tag 的 remark 插件完成，**59/59 单测通过**；Hexo → Astro 迁移工具与指南已交付（[docs/MIGRATION.md](docs/MIGRATION.md)）。交互层与第三方集成已落盘但**尚未接线与验收**——进度与验收口径见 [执行计划](docs/PLAN.md)。

## 背景

Anzhiyu 是 Hexo 生态里功能最全的博客主题之一，2.5k stars，基于 [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) 二次开发。它的模板用 Pug 和 Stylus 写，路由、资源处理、渲染全部挂在 Hexo 自己的管线上——换一套构建工具，基本等于重写一遍主题。

Astro 用组件描述界面，把内容交给 content collections，构建交给 Vite，产物默认不带 JavaScript，可以丢到任意静态托管。同样的界面在这里能拆成独立组件。

这个仓库要做的事：把上游的功能一项项搬过来，不是做一个「长得像」的壳。

## 迁移目标

清单取自上游 README 的「功能特性」。**勾选 = 已实现且通过对拍 / 单测验收**；未勾 = 未实现，或结构已落地但行为验收未通过。逐项口径以 [PLAN.md 附录 A](docs/PLAN.md) 为准，不靠自我评价。

### 内容与渲染

- [ ] 多种代码高亮方案（highlight.js 的 `figure.highlight` DOM 已对齐基线，引擎切换未做）
- [x] 脚注语法（真脚注渲染，与上游原样输出的差异已在 diff 白名单登记）
- [ ] LaTeX 数学公式（组件已落盘，未接线）
- [ ] mermaid 流程图（组件已落盘，未接线）
- [x] 文章字数统计（12 个 helper 以上游 JS 为 oracle 对拍）
- [ ] 文章 AI 摘要（组件已落盘，未接线）
- [x] 多语言配置（4 语言字典 83 项通过）

### 导航与交互

- [ ] 页面组件懒加载（ClientRouter + pjax 兼容 shim 已落盘，整站行为验收未做）
- [ ] 图片懒加载 / 图片大图查看
- [ ] 暗色模式（注入逻辑已落盘，行为验收未做）
- [ ] 沉浸式状态栏（人工项，移动端截图）
- [ ] 定制化右键菜单 / 主色调随封面变化 / 全局中控台 / 快捷键（DOM 与脚本已落盘，未验收）
- [x] 丰富多样化的标签选项（42 个 Hexo tag 全实现，59/59 单测，fixture 渲染零残留）

### 评论、统计与第三方集成

- [ ] 评论 × 5、统计 × 5、搜索 × 3、聊天、广告、隐私协议（组件库 55 个文件已落盘，未接线、未自检）
- [ ] 音乐球

### 视觉与资源

- [ ] 瀑布流即刻说说 / 瀑布流相册集（页面模板 DOM 已对齐，浏览器走查未做）
- [ ] 阿里图标与 Font Awesome / 自定义 CDN（资源解析层已落盘，未验收）

### 构建与文档

- [ ] PWA（上游靠外部 `hexo-swpp` 插件生成 Service Worker，主题本身只提供 manifest 与图标）
- [x] Hexo → Astro 迁移工具与指南（[scripts/migrate-hexo.mjs](scripts/migrate-hexo.mjs) + [docs/MIGRATION.md](docs/MIGRATION.md)，真实站点演练通过）

## 技术选型

已基于上游实测数据（120 个 Pug、72 个 Stylus、42 个自定义 tag、133 个配置顶层键）确定：

- **框架**：Astro 7.4 + Vite 8，pnpm workspace monorepo（`packages/*` + `examples/*`）
- **模板**：Pug → `.astro` 组件，DOM 结构与 ID 保持上游原样
- **样式**：继续用 Stylus。迁移 302 KB 样式的成本远高于补一层 `hexo-config()` 兼容插件（[vite-plugin-stylus-hexo-config](packages/vite-plugin-stylus-hexo-config/)）
- **Markdown**：显式切回 Unified 处理器（不是 Astro 7 默认的 Sätteri），用 [remark-hexo-tag](packages/remark-hexo-tag/)（纯 ESM、零依赖）承接 42 个 Hexo tag；代码块用 highlight.js 重建上游 `figure.highlight` DOM
- **交互**：ClientRouter + 兼容 shim 替代 pjax；前端 JS 保留 `anzhiyu` 命名空间，不重写
- **配置**：沿用 YAML + zod 校验（133 顶层键 strict），键名与上游一致，便于用户直接拷贝旧配置

完整依据与取舍见 [技术映射与架构决策](docs/02-astro-mapping.md)。

## 本地验证

需要 Node ≥ 22.23.4（Astro 7 要求）：

```bash
pnpm install --frozen-lockfile
pnpm --filter blog build                          # 62 页验证站
node packages/remark-hexo-tag/test/run.mjs        # 59/59 单测
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all   # 48 页结构 diff
```

从 Hexo 站点迁移：

```bash
node scripts/migrate-hexo.mjs --site <hexo站点目录> --dry-run      # 只读预览，不写文件
node scripts/migrate-hexo.mjs --site <hexo站点目录> --out .migration-out/<name>
```

用法、已知边界与时区/永久链接 FAQ 见 [迁移指南](docs/MIGRATION.md)。

**线上演示**：<https://mcxiaochenn.github.io/blog/>（GitHub Pages 子路径部署，由 [scripts/deploy-demo-pages.mjs](scripts/deploy-demo-pages.mjs) 一键构建推送；上游 JS 的运行时路径类次要功能——音乐球、搜索——在子路径下降级，页面导航 / 样式 / 视觉不受影响）。

## 文档

| 文档 | 内容 |
| --- | --- |
| [执行计划](docs/PLAN.md) | **当前执行基线**：任务拆解、验收命令、进度、风险登记册 |
| [迁移指南](docs/MIGRATION.md) | Hexo → Astro 站点迁移：CLI、配置键差异、时区 / 永久链接 FAQ、验证清单 |
| [上游调研](docs/01-upstream-analysis.md) | 上游仓库的结构、六大核心机制、耦合强度排序 |
| [技术映射](docs/02-astro-mapping.md) | 逐机制对应方案、6 个架构决策、待验证清单 |
| [迁移计划](docs/03-migration-plan.md) | 初版：7 个阶段、验收标准、量级估算、风险表 |
| [上游差异档](docs/upstream-delta.md) | 与上游的有意差异（U1–U8）登记 |
| [验收笔记](docs/notes/) | 各任务的真实命令输出与剩余差异归属 |

## 路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 仓库骨架、调研与计划 | ✅ 已完成 |
| Phase 1 | 构建管线与配置层（Stylus 兼容插件、schema、loader、CI） | ~87% |
| Phase 1.5 | 垂直切片去风险 + 基准固化 | ✅ 已完成 |
| Phase 2 | 布局与核心页面（首页、文章、归档、404、diff 工具） | ~95% |
| Phase 3 | widget 与页面模板（15 aside 卡片、12 模板、about） | ~56% |
| Phase 4 | 交互层（运行时、暗色、中控台、脚本层） | ~30%（结构落盘，行为验收未开始） |
| Phase 5 | 第三方集成（组件库已落盘） | ~8%（未接线） |
| Phase 6 | 42 个 Hexo tag 的 remark 插件 | ~87% |
| Phase 7 | 迁移工具与指南、PWA、性能、发布 | ~18% |

整体收敛目标是 48 页 HTML 结构 diff 全部 PASS，之后把 CI 的 diff 步骤从 report-only 改为硬门禁。逐任务状态见 [PLAN.md](docs/PLAN.md)。

## 关于上游

- 上游仓库：[anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)，仍在维护（截至 2026-11，最新 release 为 1.7.1）
- 上游文档：[docs.anheyu.com](https://docs.anheyu.com/)
- 上游预览：[hexo.anheyu.com](https://hexo.anheyu.com/)

本项目是它的衍生移植，不是 fork 后在原仓库上打补丁，也不是官方项目。上游的功能取舍以原仓库实现为准，移植过程中的差异会在 [上游差异档](docs/upstream-delta.md) 与文档里注明。

## 许可证

[GPL-3.0](LICENSE)。

上游以 GPL-3.0 发布，移植版沿用同一许可证——这是衍生作品必须遵守的条件，不是可选项。基于本项目搭建博客同样受 GPL-3.0 约束。

## 致谢

- 主题设计：[张洪 Heo](https://github.com/zhheo)
- 上游开发与维护：[anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- 上游文档：[xiaoran](https://github.com/xiaoran)
- 更早的源头：[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
