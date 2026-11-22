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

- [ ] PWA（上游用 swpp + 高速缓存）
- [ ] 配套用户文档

## 技术方向

以下是初步判断，不是已定方案：

- **模板**：Pug → Astro 组件（.astro 文件）
- **样式**：上游 Stylus 体量很大，迁移时决定是继续用 Stylus，还是转 Tailwind CSS / 原生 CSS
- **pjax**：Astro 的 ClientRouter 能覆盖大部分场景，但上游对局部刷新的控制更细，需要逐页验证
- **数据**：博客文章走 content collections，其余配置沿用类似 `_config.yml` 的结构
- **第三方集成**（评论、搜索、统计、AI 摘要）：统一做成可配置的组件，而不是散落在模板各处

## 路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 仓库骨架、README、许可证 | 进行中 |
| Phase 1 | 基础布局、文章页、列表页 | 未开始 |
| Phase 2 | 交互特性（懒加载、暗色模式、右键菜单等） | 未开始 |
| Phase 3 | 第三方集成与 PWA | 未开始 |
| Phase 4 | 文档站与配置迁移指南 | 未开始 |

## 关于上游

- 上游仓库：[anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)，仍在维护，最新版本 1.7.1
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
