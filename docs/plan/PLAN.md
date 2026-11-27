# Astro-Theme-Anzhiyu 彻底 Astro 化重构计划（v2）

> **核心理念：Anzhiyu 的外貌，Astro 的心。**
>
> 保留 `hexo-theme-anzhiyu` 的全部视觉设计与交互特性，彻底剥离 Hexo DOM 兼容层、Stylus 运行时编译、`public/js/` 全局脚本与迁移比对脚手架，重构为原生的 **Astro + Svelte 5 + TypeScript + Tailwind CSS v4** 现代化主题工程。

- **当前状态**：`◐` 规划完成，待启动 Phase 0
- **历史基线**：第一版 Hexo 1:1 移植计划归档于 [04-legacy-port-plan.md](04-legacy-port-plan.md)
- **架构参考**：[Dusklight](https://github.com/mcxiaochenn/Dusklight)（Astro + Svelte 交互岛、模块化 `src/config/*.ts`、Design Tokens、Expressive Code、Pagefind）
- **特性对齐参考**：`xcAnzhiyu`（真实 Hexo AnZhiYu 站点的全部功能与交互习惯）

---

## 1. 为什么要彻底重构？

第一版移植采取了“**Hexo 产物 1:1 字节/DOM 对齐**”路线，虽然跑通了功能，但带来了严重的架构包袱：

| 维度 | 现状（Hexo 套壳形态） | 重构目标（原生 Astro 形态） |
| --- | --- | --- |
| **配置体系** | 41KB `theme.config.yml` + 26KB `schema.ts` + `defaults.ts` + Vite 插件注入 Stylus | 模块化 `src/config/*.ts`（`site.ts` / `nav.ts` / `profile.ts` / `theme.ts` / `comment.ts` / `widgets.ts` 等），类型安全、IDE 友好 |
| **样式系统** | `src/styles/upstream/` 下 60+ `.styl` 文件 + `stylus` 编译 + 全局类名耦合 | 原生 CSS Design Tokens（`tokens.css`）+ Tailwind CSS v4 + 组件 Scoped CSS，1:1 还原 Anzhiyu 视觉与暗色/主色调系统，零 Stylus 依赖 |
| **客户端交互** | `public/js/main.js` (69KB) + `utils.js` (55KB) + 全局 `window.anzhiyu` / PJAX 垫片 | Astro `ClientRouter` 原生视图过渡 + **Svelte 5 交互岛**按需水合 + 干净的 TS 工具模块 |
| **Markdown 与代码高亮** | `astro.config.mjs` 803 行，内嵌手写 `figure.highlight` rehype 插件 | **Expressive Code**（定制 Anzhiyu 视觉主题）+ `src/plugins/` 独立 Remark/Rehype 插件，保持 `astro.config.mjs` 精简（< 150 行） |
| **内容集合** | 文章与独立页混在单个 `posts` 集合，夹带大量 Hexo 时区/兼容补丁 | `src/content.config.ts` 清晰拆分 `blog` / `spec`（独立页）/ `data`（YAML/JSON 数据） |
| **构建与脚本** | `scripts/` 下堆积 ~500KB+ 迁移比对脚本（`diff-html.mjs`、`accept-migration.mjs`、`verify-css.mjs` 等） | 移除基线 DOM 比对脚手架，仅保留构建检查、资源优化与可选的 Hexo 内容导入脚本 |

---

## 2. 必须完整保留的 Anzhiyu 核心特性

重构只改变底层实现方式，**以下视觉与功能特性必须 100% 保留**：

- **首页与布局**：顶部导航栏（含居中标题/返回顶部交互）、`HomeTop`（Banner 轮播 / 分类磁贴 / 即刻说说滚动条 `BbTimeList` / 热门文章组）、双栏文章卡片（`article_double_row`）、侧边栏信息卡（作者卡、公告、最新评论、归档、标签、网站统计、建站天数）。
- **文章阅读体验**：沉浸式封面顶图、主色调随封面动态提取（`mainTone` / ColorThief）、文章 AI 摘要打字机卡片、目录 TOC 滚动高亮与阅读进度、代码块语言/复制/折叠、数学公式（KaTeX）与 Mermaid 图表、版权声明与打赏弹窗、相关文章推荐、上下篇导航。
- **扩展短代码 / Markdown 能力**：支持 Anzhiyu 常用内容块（Note 提示框、Tabs 选项卡、Folding 折叠面板、按钮、图片画廊/网格、B 站/媒体卡片、时间轴、隐藏块等）。
- **全局交互系统**：
  - 全局中控台（Console：热评、标签云、归档、快捷开关）
  - 自定义右键菜单（复制、繁简切换、暗色模式、热评开关、随机文章等）
  - 快捷键面板（`Shift` 提示层）与右侧悬浮工具栏（`Rightside`：简繁转换、阅读模式、暗色切换、直达评论、回到顶部）
  - 悬浮音乐球与独立音乐页（APlayer + MetingJS，跨页导航不断连）
- **独立特色页面**：归档（`archives`）、分类（`categories`）、标签（`tags`）、友链（`link`）、朋友圈（`fcircle`）、即刻说说（`essay` 瀑布流）、相册集（`album`）、我的装备（`equipment`）、关于我（`about`：个人画像、技能、生涯、游戏/番剧/音乐喜好）、追番（`bangumis`）、404 页面。
- **评论、搜索与基础设施**：Twikoo / Artalk / Waline / Giscus 评论接入与评论弹幕、全文搜索（Pagefind 现代方案为主，兼顾本地搜索）、RSS / Atom / Sitemap、可选 PWA。

---

## 3. 目标目录结构

```text
astro-theme-anzhiyu/
├── astro.config.mjs              # 精简的 Astro 配置（集成 + Remark/Rehype 插件装配）
├── package.json
├── src/
│   ├── config/                   # 模块化 TypeScript 配置（site / theme / nav / profile / comment / widgets）
│   ├── content/                  # 默认示例文章与独立页（支持外挂内容源）
│   ├── content.config.ts         # blog / spec 集合 Zod Schema
│   ├── data/                     # 结构化站点数据（link / essay / album / equipment / about）
│   ├── styles/                   # tokens.css + tailwind.css + 按域拆分的现代 CSS
│   ├── plugins/                  # 独立 Remark / Rehype / Expressive Code 插件
│   ├── layouts/                  # BaseLayout / PostLayout / PageLayout
│   ├── components/
│   │   ├── common/               # Header / Footer / Rightside / Head / ThemeToggle
│   │   ├── home/                 # HomeTop / PostCard / BbTimeList（含 Svelte 交互）
│   │   ├── post/                 # PostHeader / TOC / AiAbstract / Copyright / Reward / RelatedPosts
│   │   ├── sidebar/              # Sidebar 与各类侧边栏卡片
│   │   ├── console/              # Console.svelte / ContextMenu.svelte / ShortcutModal.svelte
│   │   ├── music/                # MusicBall.svelte（persist 跨页不中断）
│   │   ├── search/               # SearchDialog.svelte（Pagefind）
│   │   ├── comments/             # 评论组件与弹幕岛
│   │   ├── page/                 # Link / Essay / Album / Equipment / About / Bangumi 等页面组件
│   │   └── ui/                   # 基础 UI 原语（Card / Button / Modal / Tag）
│   ├── pages/                    # 清晰的文件路由
│   └── utils/                    # 日期、分类/标签聚合、颜色提取、URL 等纯 TS 工具
├── public/                       # 静态资源（图标、默认图、字体等）
├── scripts/                      # 仅保留资产检查、可选 Hexo 导入等实用脚本
└── tests/                        # Playwright E2E 与核心单元测试
```

---

## 4. 分阶段实施路线

### Phase 0：工程瘦身与技术栈升级
- [ ] 在独立分支或打 tag 保留 v1 移植历史后，清理迁移比对脚手架（`scripts/accept-migration.mjs`、`scripts/diff-html.mjs`、`scripts/verify-css.mjs`、`scripts/compare-css-vars.mjs`、`scripts/check-upstream-*`、`.baseline-html/`、`tests/baseline-content/` 等）。
- [ ] 安装现代 Astro 生态核心依赖：`@astrojs/svelte` + `svelte`、`@tailwindcss/vite` + `tailwindcss`、`astro-expressive-code`、`astro-icon` + `@iconify-json/*`、`pagefind`、`@astrojs/rss`、`@astrojs/sitemap`。
- [ ] 移除 `stylus` 依赖与 `src/plugins/stylus-hexo-config/`。
- **验收**：`pnpm install` 与基础空骨架 `pnpm build` 正常通过。

### Phase 1：Design Tokens 与现代样式系统
- [ ] 提取 Anzhiyu 核心视觉变量至 `src/styles/tokens.css`（主题色 `--anzhiyu-theme`、卡片背景、边框、阴影、圆角、暗色模式变量与封面动态主色调变量）。
- [ ] 接入 Tailwind CSS v4（`src/styles/tailwind.css`）与基础排版/动画样式（`base.css`、`typography.css`、`animations.css`）。
- [ ] 逐步淘汰 `src/styles/upstream/*.styl`，确保所有样式均为原生 CSS / Tailwind / Scoped CSS。
- **验收**：明暗双色切换、CSS 变量覆盖与封面主色调注入工作正常。

### Phase 2：TypeScript 配置体系与 Content Collections
- [ ] 建立 `src/config/` 模块化 TS 配置（参考 `Dusklight`）：`site.ts`、`theme.ts`、`nav.ts`、`profile.ts`、`comment.ts`、`home.ts`、`widgets.ts`、`seo.ts`，通过 `src/config/index.ts` 统一导出。
- [ ] 重构 `src/content.config.ts`：分离 `blog`（文章）与 `spec`（独立页面），规范化 Frontmatter Schema。
- [ ] 保留/精简一个可选的 `scripts/import-hexo.mjs`，帮助老 Hexo 用户一次性将 `_config.anzhiyu.yml` 与 `_posts/` 转换为新版结构。
- **验收**：`astro check` 类型检查零报错。

### Phase 3：Markdown 渲染管线与 `astro.config.mjs` 瘦身
- [ ] 用 `astro-expressive-code` 替代 `astro.config.mjs` 中手写的 `figure.highlight` rehype 插件，并通过 `styleOverrides` 还原 Anzhiyu 代码块外观（Mac 圆点、语言标签、折叠、行号、复制按钮）。
- [ ] 整理 `src/plugins/`：将现有 Remark/Rehype 插件模块化（KaTeX、Mermaid、外部链接处理、图片增强），支持 Anzhiyu 常用内容块语法（兼容常用 `{% tag %}` 或提供对应指令语法）。
- [ ] 将 `astro.config.mjs` 精简至只负责集成与插件装配。
- **验收**：文章页代码块、公式、Mermaid、提示框与折叠面板渲染正常。

### Phase 4：核心布局与静态 Astro 组件重构
- [ ] 拆解 `BaseLayout.astro`（原 26.8KB），拆分为清晰的 `BaseLayout.astro`、`PostLayout.astro`、`PageLayout.astro`。
- [ ] 重构导航栏 `Header.astro`（含移动端抽屉）、`Footer.astro`、`Rightside.astro` 与 `Sidebar.astro` 及其所有侧栏卡片组件。
- [ ] 重构首页 `PostCard.astro`（双栏/单栏切换）、分页与文章详情页 `PostHeader`、`TOC`、`Copyright`、`RelatedPosts`、`PostPagination`。
- **验收**：首页、文章页、归档/分类/标签页 HTML 结构清晰，无多余兼容补丁。

### Phase 5：Svelte 5 交互岛与全局交互重构
- [ ] 彻底移除 `public/js/main.js`（69KB）与 `public/js/utils.js`（55KB）等全局 DOM 脚本。
- [ ] 用 Svelte 5 交互岛实现核心动态功能（配合 Astro `ClientRouter` 生命周期）：
  - `HomeTop` 轮播 / 即刻说说滚播 (`BbTimeList.svelte`)
  - 全局中控台 (`Console.svelte`)、自定义右键菜单 (`ContextMenu.svelte`)、快捷键面板 (`ShortcutModal.svelte`)
  - 搜索弹窗 (`SearchDialog.svelte`，基于 Pagefind）
  - 悬浮音乐球 (`MusicBall.svelte`，`transition:persist` 跨页不断连）
  - 评论与弹幕系统、AI 摘要打字机、图片灯箱与封面主色调动态提取
- **验收**：跨页面路由切换时状态保持、无事件重复绑定或内存泄漏。

### Phase 6：特色页面迁移与整站验收
- [ ] 重构所有 Anzhiyu 特色独立页面组件：`Link`（友链）、`Fcircle`（朋友圈）、`Essay`（即刻说说瀑布流）、`Album`（相册）、`Equipment`（装备）、`About`（关于页全模块）、`Bangumis`（追番）、`Music`（音乐页）、`404`。
- [ ] 完善 `rss.xml`、`atom.xml`、`sitemap`、PWA（可选）与 SEO Meta/JSON-LD。
- [ ] 更新 Playwright E2E 测试套件，覆盖核心视觉与交互路径，并执行 Lighthouse 与 `astro check` 全量验收。
- **验收**：`pnpm check && pnpm build` 全绿，E2E 测试与 Lighthouse 指标达标。
