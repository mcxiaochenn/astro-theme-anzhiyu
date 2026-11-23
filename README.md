[English](README.en.md) · 简体中文

# astro-theme-anzhiyu

[Anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 博客主题的 Astro 移植版。

> **当前状态：规划阶段，尚无代码。** 本仓库目前只有项目文档和许可证，迁移工作尚未开始。

## 背景

Anzhiyu 是 Hexo 生态里功能最全的博客主题之一，2.5k stars，基于 [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) 二次开发。它的模板用 Pug 和 Stylus 写，路由、资源处理、渲染全部挂在 Hexo 自己的管线上——换一套构建工具，基本等于重写一遍主题。

Astro 用组件描述界面，把内容交给 content collections，构建交给 Vite，产物默认不带 JavaScript，可以丢到任意静态托管。同样的界面在这里能拆成独立组件。

这个仓库要做的事：把上游的功能一项项搬过来，不是做一个「长得像」的壳。

## 迁移目标

下面这份清单取自上游 README 的「功能特性」。**全部属于待迁移，当前完成度为零。** 代码落地后逐项更新状态。

### 内容与渲染

- [ ] 多种代码高亮方案
- [ ] 脚注语法
- [ ] LaTeX 数学公式
- [ ] mermaid 流程图
- [ ] 文章字数统计
- [ ] 文章 AI 摘要
- [ ] 多语言配置

### 导航与交互

- [ ] 页面组件懒加载（上游用 pjax）
- [ ] 图片懒加载
- [ ] 图片大图查看
- [ ] 暗色模式
- [ ] 沉浸式状态栏
- [ ] 定制化右键菜单
- [ ] 主色调随封面图片颜色变化
- [ ] 全局中控台
- [ ] 快捷键
- [ ] 丰富多样化的标签选项

### 评论、统计与第三方集成

- [ ] 内置多款评论插件
- [ ] 访问统计（Google / 百度 / 微软 / Cloudflare / CNZZ）
- [ ] 本地搜索 / Algolia / DocSearch
- [ ] 聊天系统
- [ ] 音乐球
- [ ] 广告挂载
- [ ] 隐私协议

### 视觉与资源

- [ ] 瀑布流即刻说说
- [ ] 瀑布流相册集
- [ ] 阿里图标与 Font Awesome
- [ ] 自定义 CDN 静态资源

### 构建与文档

- [ ] PWA（上游靠外部 `hexo-swpp` 插件生成 Service Worker，主题本身只提供 manifest 与图标）
- [ ] 配套用户文档

## 技术选型

已基于上游实测数据（120 个 Pug、72 个 Stylus、42 个自定义 tag、约 200 个配置键）确定：

- **框架**：Astro 7.4 + Vite 8，pnpm workspace monorepo
- **模板**：Pug → `.astro` 组件，DOM 结构与 ID 保持上游原样
- **样式**：继续用 Stylus。迁移 302 KB 样式的成本远高于补一层 `hexo-config()` 兼容插件
- **Markdown**：显式切回 Unified 处理器（不是 Astro 7 默认的 Sätteri），以便用 remark 插件承接 42 个 Hexo tag
- **交互**：ClientRouter + 兼容 shim 替代 pjax；前端 JS 保留 `anzhiyu` 命名空间，不重写
- **配置**：沿用 YAML + zod 校验，键名与上游一致，便于用户直接拷贝旧配置

完整依据与取舍见 [技术映射与架构决策](docs/02-astro-mapping.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [执行计划](docs/PLAN.md) | **当前执行基线**：任务拆解、验收命令、进度、CI 设计与风险登记册 |
| [上游调研](docs/01-upstream-analysis.md) | 上游仓库的结构、六大核心机制、耦合强度排序 |
| [技术映射](docs/02-astro-mapping.md) | 逐机制对应方案、6 个架构决策、待验证清单 |
| [迁移计划](docs/03-migration-plan.md) | 初版：7 个阶段、验收标准、34–45 天的量级估算、风险表 |

## 路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 仓库骨架、调研与计划 | 已完成 |
| Phase 1 | 构建管线与配置层（Stylus 兼容插件、配置 schema） | 进行中 |
| Phase 2 | 布局与核心页面（首页、文章、归档、404） | 未开始 |
| Phase 3 | widget 与 12 个页面模板 | 未开始 |
| Phase 4 | 交互层（ClientRouter、暗色模式、右键菜单、音乐） | 未开始 |
| Phase 5 | 第三方集成（评论 × 5、搜索 × 3、分析 × 5） | 未开始 |
| Phase 6 | 42 个 Hexo tag 的 remark 插件 | 未开始 |
| Phase 7 | PWA、性能、迁移指南 | 未开始 |

每个阶段的验收标准写在 [迁移计划](docs/03-migration-plan.md) 里，靠 HTML diff、截图对比和特性清单验收，不靠自我评价。

Phase 1 进展：Stylus 管线的两个未知项已实测通过——glob `@import` 可用，`hexo-config()` 通过 [`vite-plugin-stylus-hexo-config`](packages/vite-plugin-stylus-hexo-config/) 静态处理。上游真实的 `var.styl`（63 处 `hexo-config`）配上游 `_config.yml` 已能在 Astro 里编译出正确 CSS，验证站见 [examples/blog](examples/blog)。配置 schema 与主题包尚未开始。

## 关于上游

- 上游仓库：[anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)，仍在维护（截至 2026-11，最新 release 为 1.7.1）
- 上游文档：[docs.anheyu.com](https://docs.anheyu.com/)
- 上游预览：[hexo.anheyu.com](https://hexo.anheyu.com/)

本项目是它的衍生移植，不是 fork 后在原仓库上打补丁，也不是官方项目。上游的功能取舍以原仓库实现为准，移植过程中的差异会在文档里注明。

## 许可证

[GPL-3.0](LICENSE)。

上游以 GPL-3.0 发布，移植版沿用同一许可证——这是衍生作品必须遵守的条件，不是可选项。基于本项目搭建博客同样受 GPL-3.0 约束。

## 致谢

- 主题设计：[张洪 Heo](https://github.com/zhheo)
- 上游开发与维护：[anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- 上游文档：[xiaoran](https://github.com/xiaoran)
- 更早的源头：[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
