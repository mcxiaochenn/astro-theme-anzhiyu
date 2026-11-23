# 迁移计划

## 0. 原则

1. **以 1.7.1 为冻结基线**。迁移期间不追上游新提交，否则永远追不完。移植完成后建立季度 diff 检查。
2. **验收靠对比，不靠自我评价**。每个阶段都有可执行的对比手段（HTML diff、像素 diff、清单勾选），不写"已完成"了事。
3. **DOM 结构不动**。302 KB Stylus 与 115 KB JS 依赖现有 ID 与 class，改结构等于全部重写。
4. **先跑通再优化**。性能预算放在最后，不在迁移中途做架构优化。

## 1. 验收机制（贯穿全程）

这是整个项目可信度的基础，先定下来：

### 1.1 三层对比

**第一层：HTML 结构 diff**

用同一份内容（上游 `hexo.anheyu.com` 的示例文章）分别构建上游 Hexo 站与 Astro 站，对每个页面：

```bash
# 规范化后比对：去掉属性顺序差异、空白、哈希文件名
npx html-differ <hexo-output>/post/xxx/index.html <astro-output>/post/xxx/index.html \
  --ignore-whitespaces --ignore-attribute-order
```

目标：差异只在资源路径的哈希值与注释。

**第二层：视觉回归**

Playwright 逐页截图，固定视口（1440×900 / 768×1024 / 375×812 三档），与上游站点截图做像素 diff。允许 1% 以内的抗锯齿差异。

**第三层：特性清单**

README 里的 31 项特性做成可勾选的 checklist，每项附「怎么验」的操作步骤。例如：

> **暗色模式**：点击右下角月亮图标 → 页面变暗且刷新后保持 → 切换页面（ClientRouter 导航）后仍为暗色 → 打开 `prefers-color-scheme: dark` 的系统设置后首次访问自动为暗色。

清单不勾满，不算迁移完成。

### 1.2 行为基线

对依赖 `GLOBAL_CONFIG` 的交互，先在上游站点录制行为（浏览器 console 里操作一遍，记录 DOM 变化与网络请求），迁移后回放。没有基线的行为不算"支持"。

## 2. 阶段划分

工作量按「熟悉 Astro 与 Pug 的开发者」估算，仅供参考的量级。

### Phase 1 — 地基：构建管线与配置层

**目标**：样式能编译，配置能读，产物结构正确。这是所有后续工作的前提。

| 任务 | 说明 |
| --- | --- |
| monorepo 骨架 | pnpm workspace，`packages/*` + `examples/blog` |
| Astro 7 项目初始化 | `astro@7.4.13`，`pnpm dev` 能起 |
| Stylus 管线 | `stylus` devDep，`.styl` 能编译进产物 |
| `vite-plugin-stylus-config` | 实现 `hexo-config()`，读 YAML |
| 配置 schema | zod 定义约 200 个键，默认值与上游对齐 |
| 配置加载 | YAML → 校验 → 补默认值 → 类型导出 |
| 验证清单 1、2 项 | Stylus glob import、`hexo-config()` 求值 |

**验收**：
- `pnpm build` 产出 CSS，字节数与上游 `hexo g` 的 `source/css/index.css` 相差 5% 以内（上游该文件约 470 KB）
- 样式里 `var(--anzhiyu-main)` 等 CSS 变量值与上游一致
- 配置里少写一个必填键，构建立刻失败并指出键路径

**工作量**：M（3–4 天）

### Phase 2 — 静态骨架：布局与核心页面

**目标**：不接任何 JS 的情况下，页面结构和样式与上游一致。

| 任务 | 说明 |
| --- | --- |
| `BaseLayout.astro` | 对应 `layout.pug`：`#web_bg`、`#body-wrap`、`#content-inner` 等全部 ID |
| Head 组件 | 对应 `head.pug` + `Open_Graph` + `preconnect` + `site_verification` |
| Header / Footer / Sidebar / Rightside | 对应 `header/index.pug`、`footer.pug`、`sidebar.pug`、`rightside.pug` |
| 文章页 | `post/[...slug].astro`，含 PostInfo、版权、打赏、ptool |
| 首页 + 分页 | `index.astro` + `[...page].astro`，含 PostCard |
| 归档 / 分类 / 标签 | 三个路由 + 分页 |
| 404 | `404.astro` |
| i18n | 4 个字典 + `t()` |

**验收**：
- 三类页面（首页、文章、归档）与上游截图对比，像素差异 < 1%
- `view-source` 里能看到完整的 `head`（OG 标签、canonical、favicon）
- 分页到第 2、3 页结构正确

**工作量**：L（5–7 天）

### Phase 3 — 组件填充：widget 与 12 个页面模板

**目标**：所有页面类型都能渲染。

| 任务 | 说明 |
| --- | --- |
| 15 个 widget 卡片 | 作者、公告、最新文章、分类、标签、归档、网站信息、广告、TOC、控制台归档/标签… |
| 12 个页面模板 | `about`（上游 23 KB，最复杂）、`album`、`album_detail`、`essay`、`flink`、`room`、`music`、`equipment`、`fcircle`、`categories`、`tags`、`default` |

**验收**：
- 每个 `page.type` 都能正确分发到对应模板
- `about` 页面与上游截图一致（这一页包含技能卡、收藏夹、音乐、地图等多个区块）

**工作量**：L（6–8 天）

### Phase 4 — 交互层：JS 与路由

**目标**：站点"活"起来。

| 任务 | 说明 |
| --- | --- |
| `GLOBAL_CONFIG` 注入 | 在 `<head>` 输出，结构与上游一致 |
| `main.js` / `utils.js` 移植 | 打包但不改写逻辑，暴露 `window.anzhiyu` |
| ClientRouter + pjax shim | `pjax.loadUrl`、`pjax:complete` 兼容层 |
| 全局功能 | 暗色模式、阅读模式、lazyload、右键菜单、控制台、快捷键、回到顶部、侧栏折叠、翻译（繁简） |
| 搜索 UI | 本地搜索、Algolia、DocSearch 三套的选择与初始化 |
| 音乐播放器 | APlayer + Meting，需验证 ClientRouter 下不中断 |

**验收**：
- 站内点击不触发整页刷新（Network 面板里 document 请求为 0）
- 暗色模式在导航后保持
- 右键菜单、控制台、快捷键可用
- 前进/后退不出现重复初始化（控制台无重复监听报错）

**工作量**：XL（7–9 天）

### Phase 5 — 第三方集成

**目标**：所有外部服务接得上。

| 任务 | 说明 |
| --- | --- |
| 评论 × 5 | Valine、Waline、Twikoo、Artalk、Giscus，含评论区计数与最新评论卡片 |
| 搜索 × 3 | 本地搜索（需生成索引）、Algolia、DocSearch |
| 分析 × 5 | Google、百度、CNZZ、Cloudflare、Microsoft Clarity |
| 增强 | AI 摘要、聊天（Chatra/Tidio/Daovoice/Crisp）、音乐球、广告位、协议弹窗 |

**验收**：每个集成用真实服务各跑通一次，截图留档。

**工作量**：L（5–6 天）

### Phase 6 — 内容语法：42 个 tag

**目标**：存量文章不改一个字也能正常渲染。

| 任务 | 说明 |
| --- | --- |
| `remark-hexo-tag` 插件 | unified 处理器插件，替换 42 个 tag 语法 |
| 输出对齐 | 生成的 HTML 与上游 `{% xxx %}` 的产出逐字节一致（忽略空白） |
| 转换工具 | 可选：把 `{% note %}` 转成 MDX 组件的 codemod |

**验收**：
- 用上游文档站的示例文章（每个 tag 一篇）构建，HTML diff 为空
- 42 个 tag 的样式全部命中（`_tags/*.styl` 生效）

**工作量**：L（4–6 天）

### Phase 7 — PWA、性能、迁移文档

| 任务 | 说明 |
| --- | --- |
| PWA | `@vite-pwa/astro` + 把 `sw-rules.js` 的缓存规则翻译过去 |
| 性能 | 首屏 JS 体积、LCP、CLS 预算；图片优化 |
| 迁移指南 | Hexo 站点 → Astro 的完整步骤，含配置模板 |
| 迁移脚本 | `_config.anzhiyu.yml` → 新配置的自动转换；frontmatter 校验 |

**验收**：
- Lighthouse 四项分数不低于上游站点
- 拿一个真实的 Hexo Anzhiyu 站点，按文档走一遍能跑起来

**工作量**：M（4–5 天）

## 3. 总量

| 阶段 | 量级 |
| --- | --- |
| Phase 1 地基 | 3–4 天 |
| Phase 2 骨架 | 5–7 天 |
| Phase 3 组件 | 6–8 天 |
| Phase 4 交互 | 7–9 天 |
| Phase 5 集成 | 5–6 天 |
| Phase 6 内容语法 | 4–6 天 |
| Phase 7 收尾 | 4–5 天 |
| **合计** | **34–45 天** |

这是按人日的粗估，依据是 120 个 pug、302 KB Stylus、115 KB JS、42 个 tag 的实际体量，不含调试与反复。实际会更长。

真正的不确定性集中在 Phase 4 和 Phase 6：前者取决于 pjax 行为差异有多大，后者取决于 42 个 tag 的输出对齐有多难。

## 4. 风险

| 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- |
| pjax 行为无法等价，音乐播放、全局背景等依赖"不换 DOM"的特性失效 | 高 | 高 | 提前在 Phase 1 做最小验证；必要时把这类元素做成持久层，或对特定页面关闭 ClientRouter |
| Stylus 的 glob import 或 `hexo-config()` 在 Vite 8 下跑不通 | 中 | 高 | 退路：编译前用脚本把 `hexo-config()` 静态替换成字面值，glob 展开成显式列表 |
| Astro 7 的 Rust 编译器对 pug 产出的 HTML 报未闭合标签 | 中 | 中 | 转换时统一补闭合；建立 HTML 校验步骤 |
| 42 个 tag 的 HTML 产物难以逐字节对齐 | 中 | 中 | 接受"视觉一致但属性顺序不同"；用 DOM 归一化后再 diff |
| 上游持续更新，移植版逐渐落后 | 中 | 中 | 冻结基线 + 季度 diff；差异记录在 `docs/upstream-delta.md` |
| 第三方库版本升级（如 Waline、Twikoo）导致集成失效 | 中 | 低 | 版本锁在 `plugins.yml` 对应版本，升级单独验证 |
| `about` 等巨型模板（23 KB）迁移遗漏细节 | 中 | 低 | 逐块截图对比，按区块勾选 |

## 5. 明确不做

- 不做内容管理系统。上游生态里已有 [anheyu-app](https://github.com/anzhiyu-c/anheyu-app) 负责这件事。
- 不重设计视觉。像素级还原是验收标准。
- 不承诺支持 Hexo 的全部 tag，只支持上游文档写明的 42 个。
- 不在迁移期做性能架构改造。

## 6. 下一步

Phase 1 的第二件事是跑通 8 项待验证清单（见 [02-astro-mapping.md](02-astro-mapping.md#5-待验证清单)）。这 8 个问题的答案会决定后面几个阶段的实现方式，所以先做验证，再写业务组件。

建议的第一步任务：搭一个最小 Astro 项目，只引入上游的 `var.styl` 和 `_global/index.styl`，看能不能编译出 CSS。跑通了再往下走。
