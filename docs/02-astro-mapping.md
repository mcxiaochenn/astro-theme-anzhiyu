# 技术映射与架构决策

本文回答：上游的每个机制在 Astro 里对应什么，以及为什么这么选。

版本基线（2026-11-23 从 npm registry 实测）：

| 包 | 版本 |
| --- | --- |
| `astro` | 7.4.13 |
| `@astrojs/mdx` | 8.1.6 |
| `@astrojs/sitemap` | 3.7.6 |
| `@astrojs/rss` | 4.0.19 |
| Vite | 8（Astro 7 内置） |
| Node | ≥ 22 |

## 1. 机制映射总表

| 上游机制 | Astro 侧方案 | 风险 |
| --- | --- | --- |
| `layout.pug` 单骨架 | `BaseLayout.astro` + `<slot />` | 低 |
| 6 个根页面 | `src/pages/` 路由文件 | 低 |
| 114 个 pug include | `.astro` 组件，目录镜像 | 中（量大，逐个体力活） |
| `hexo-config()` in Stylus | 自研 Vite 插件注入 Stylus 变量 | 中（179 处，需逐类验证） |
| `_config.yml` 200 键 | YAML 配置 + zod schema + 类型生成 | 低 |
| `GLOBAL_CONFIG` 内联对象 | 构建时序列化注入，结构不变 | 低 |
| `anzhiyu` window 命名空间 | 保留命名，Vite 打包但暴露全局 | 中 |
| pjax 0.2.8 | ClientRouter + 兼容 shim | **高** |
| `theme.asset.*` CDN 抽象 | 资源解析层，双模式 | 中 |
| 42 个 Hexo tag | remark 插件（unified 处理器） | **高** |
| 12 个 Hexo helper | TypeScript 工具函数 | 低 |
| 4 个 i18n YAML | 字典模块 + `t()` | 低 |
| `sw-rules.js` | `@vite-pwa/astro` + 规则翻译 | 中 |
| Hexo 生成器（归档/分类/标签分页） | Astro `getStaticPaths()` + 分页 | 中 |

## 2. 六个关键决策

### ADR-001：Markdown 处理器选 Unified，不用默认的 Sätteri

Astro 7 把默认 Markdown 处理器从 remark/rehype 管线换成了自研的 Sätteri（Rust 实现），`@astrojs/markdown-remark` 不再预装。

**问题**：上游 42 个 tag 需要在 Markdown 解析阶段做语法替换。Sätteri 的插件生态是零，要自己写 Rust 侧或 MDAST 插件；unified 有现成的 remark/rehype 生态与大量可参考的实现。

**决策**：显式安装 `@astrojs/markdown-remark`，在 `astro.config` 里设 `markdown.processor: unified()`。

```js
import { unified } from '@astrojs/markdown-remark'

export default defineConfig({
  markdown: { processor: unified() },
})
```

**代价**：放弃 Sätteri 的构建速度。对一个几百篇文章的博客，这个差异在秒级，可以接受。

**备选**：MDX + 组件（`<Note type="info">`）。对**新写的文章**是好选择，但不解决存量文章的 `{% note %}` 语法。计划是 remark 插件先行，MDX 组件作为并行支持的写法。

### ADR-002：样式继续用 Stylus，补一层 `hexo-config()`

**事实**：
- 302 KB Stylus 是「换引擎不换前端」的前提，手改成 CSS 或 Tailwind 的成本远高于补一层兼容。
- Vite 8 仍内置支持 `.styl` / `.stylus`，只需 `npm add -D stylus`。
- 但 Vite 明确不支持 Stylus 的 `@import` 别名解析与 `url()` 重写（"[@import alias and url rebasing are not supported for Stylus](https://vite.dev/guide/features#css-pre-processors)"）。
- 上游 `index.styl` 用 `@import '_global/*'`、`@import '_extra/**/*.css'` 这种 glob——这是 Stylus 自己的 glob 能力，与 Vite 无关，理论上可用，**但必须实测**。

**决策**：写一个 Vite 插件 `vite-plugin-stylus-hexo-config`，在 Stylus 编译时通过 `define()` 注册 `hexo-config()` 函数，读同一个 YAML 配置源。

```ts
// 伪代码
stylus.define('hexo-config', (path: string) => resolveConfigPath(themeConfig, path))
```

**待验证**：
1. `.styl` 的 glob `@import` 在 Vite 8 + Astro 7 下是否仍按 Stylus 语义工作。
2. `convert()`、`unquote()`、`alpha()` 这些 Stylus 内置函数在 `define()` 注入函数的前提下能否如常调用。
3. `if hexo-config(...)` 条件导入（`index.styl` 里 4 处）依赖 `hexo-config` 返回布尔值。

如果 glob import 失效，退路是把 `_global/*` 展开成显式 import 列表（一次性机械改写，72 个文件的入口只有一个）。

### ADR-003：pjax 用 ClientRouter + 兼容 shim，而不是原样搬 pjax

**上游行为**（`pjax.pug`）：
- 拦截所有站内链接（`a:not([target="_blank"])`，排除 `theme.pjax.exclude` 里的 href）
- 只替换 6 个选择器的内容，不整页重载
- `pjax:send` 时销毁 aplayer、typed、移除 read-mode、解绑全局事件
- `pjax:complete` 时执行 `window.refreshFn()`、重跑 `script[data-pjax]`、`lazyLoadInstance.update()`、`panguInit()`、`Prism.highlightAll()`、上报统计
- 404 时 `pjax.loadUrl('/404.html')`

**Astro 的 ClientRouter（`astro:transitions`）差异**：
- 替换整个 `<body>`，不是 6 个片段
- 提供 `astro:before-swap` / `astro:after-swap` / `astro:page-load` 事件，没有 `pjax:complete`
- 提供 `navigate(url)` 编程式导航，没有 `pjax.loadUrl`
- 有视图过渡动画，上游没有

**决策**：用 ClientRouter，同时提供一个 shim 文件，在页面加载时补齐上游 API：

| 上游 API | shim 实现 |
| --- | --- |
| `pjax.loadUrl(url)` | `navigate(url)` |
| `document.on('pjax:send')` | 转成 `astro:before-swap` 监听 |
| `document.on('pjax:complete')` | 转成 `astro:page-load` 监听 |
| `script[data-pjax]` 重执行 | `astro:after-swap` 时手动重建 |

**为什么不用原版 pjax**：pjax 0.2.8 是 2017 年的库，依赖 `XMLHttpRequest` 与 `history.pushState` 手工管理，与 Astro 的岛屿水合、脚本打包、视图过渡全部冲突。保留它等于放弃 Astro 的路由能力。

**风险**：整 body 替换意味着 `#web_bg`、`#an_music_bg` 这类全局背景元素会被重建，上游靠 pjax 保留 DOM 来维持音乐播放不中断的行为会丢。这是必须验证的行为差异，可能需要把音乐播放器改成持久化的独立层。

### ADR-004：保留 `anzhiyu` 全局命名空间与 `GLOBAL_CONFIG`

`source/js/main.js`（64 KB）+ `utils.js`（50 KB）是手写的、无模块化的、全部挂在 window 上的代码。

**选项**：
- A. 重写成 ES 模块 + Astro 组件脚本，彻底现代化
- B. 原样保留，用 Vite 打包但对外暴露 `window.anzhiyu` 与 `window.GLOBAL_CONFIG`

**决策**：初期选 B，长期逐步拆 A。

理由：115 KB 无测试的手写 JS，在没有行为基线的情况下重写等于重做整个主题的交互层。先让它跑起来，用真实页面验证行为，再逐个模块迁移。

具体做法：
- `src/scripts/` 保留上游文件，`main.js` 顶部加 `export` 包装
- 用一个入口文件 `import` 后挂到 `window`
- `GLOBAL_CONFIG` 用一个 Astro 组件在 `<head>` 里序列化输出，结构与上游一字不差

### ADR-005：配置沿用 YAML，不改成 TS 配置对象

上游 `_config.yml` 约 200 个键，用户手里通常已经有一份魔改过的 `_config.anzhiyu.yml`。

**决策**：
- 配置源仍用 YAML，文件名 `anzhiyu.config.yml`，键名、层级、默认值与上游保持一致
- 用 zod 定义 schema，构建时校验，报错要指到具体键路径
- 从 schema 生成 TypeScript 类型，组件里 `theme.comments.use` 有补全

**为什么不做 TS 配置**：迁移用户的第一件事是把自己的 `_config.anzhiyu.yml` 拷过来。如果格式变了，每个用户都要手工转换 200 个键——这是没有意义的摩擦。

**兼容期**：构建时同时接受 `_config.anzhiyu.yml` 这个旧文件名，打一条 deprecation 提示。

### ADR-006：仓库形态用 monorepo，主题包 + 示例站

Astro 主题有两种分发形态：

| 形态 | 例子 | 优点 | 缺点 |
| --- | --- | --- | --- |
| Starter template | astro-paper | 用户心智简单，clone 即用 | 升级主题会冲突，用户改动与主题改动混在一个仓库 |
| Integration 包 | Starlight | 升级走 npm，内容与主题分离 | 需要写 Astro Integration API，路由注入复杂 |
| monorepo（两者兼有） | — | 可同时提供 | 仓库结构复杂 |

**决策**：pnpm workspace monorepo。

```
packages/
  astro-theme-anzhiyu/     可发布的主题包
  remark-hexo-tag/         42 个 tag 的 remark 插件（可单独复用）
  vite-plugin-stylus-config/  hexo-config() 兼容层
examples/
  blog/                    演示站，也是视觉回归的基准
```

用户路径：
- 想快：`npm create astro -- --template mcxiaochenn/astro-theme-anzhiyu`（把 `examples/blog` 当模板）
- 想可控：`npm i astro-theme-anzhiyu`，在自己的 `astro.config` 里注册

**理由**：42 个 tag 的 remark 插件和 Stylus 兼容层都有独立价值，埋在主题包里别人用不上，拆出来才合理。示例站则是唯一的验收手段——没有真实页面，所有"支持"都是空话。

## 3. 目录设计

```
src/
├── components/
│   ├── layout/          Head, Header, Footer, Sidebar, Rightside, Search…
│   ├── post/            PostCard, PostMeta, PostCopyright, Reward, Ptool
│   ├── widget/          AuthorCard, RecentPost, Categories, Tags, Archives, WebInfo…
│   ├── page/            About, Album, Essay, Flink, Room, Music, Equipment…
│   └── third-party/     Comments(×5), Search(×3), Analytics(×5), Chat(×5), Math…
├── layouts/
│   ├── BaseLayout.astro
│   └── PageLayout.astro
├── pages/
│   ├── index.astro
│   ├── [...page].astro          分页首页
│   ├── post/[...slug].astro
│   ├── archives/[...page].astro
│   ├── categories/[category]/[...page].astro
│   ├── tags/[tag]/[...page].astro
│   └── 404.astro
├── content.config.ts            content collections + zod schema
├── styles/                      迁移后的 Stylus（保持原目录结构）
├── scripts/                     迁移后的前端 JS（保持原文件名）
├── config/
│   ├── schema.ts                zod 定义
│   ├── defaults.ts              与上游 _config.yml 对齐的默认值
│   └── loader.ts                YAML 读取 + 校验 + 补默认值
├── i18n/
│   ├── zh-CN.yml
│   ├── zh-TW.yml
│   ├── en.yml
│   └── index.ts                 t() 函数，对齐上游 _p()
└── utils/                       url_for、date、readingTime、toc…
```

`styles/` 与 `scripts/` 保留上游的相对路径，是为了让「哪个 pug 对应哪个 styl」这种对应关系还能看出来，减少迁移期的认知负担。

## 4. 内容模型

上游用 Hexo 的 frontmatter，字段散落在各处。迁移时要固定一套 schema：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | |
| `date` / `updated` | date | |
| `tags` / `categories` | string[] | |
| `cover` | string \| false | 首页封面 |
| `top_img` | string \| false | 顶部图 |
| `description` | string | |
| `sticky` | number | 置顶权重 |
| `top` | boolean | 是否置顶 |
| `abbrlink` | string | 固定链接别名 |
| `main_color` | string | 主色调覆盖 |
| `mathjax` | boolean | 按页开启数学公式 |
| `comments` | boolean | 按页关闭评论 |
| `aside` | boolean | 按页隐藏侧栏 |
| `copyright_author` / `copyright_url` | string | 版权覆盖 |
| `aplayer` | boolean | 按页音乐 |

Astro 的 content collections 用 zod 校验，缺字段会构建失败——这比 Hexo 静默跳过要严格，是好事，但要在迁移文档里写清楚。

## 5. 待验证清单

这些是写代码前必须先用最小样例跑通的问题。**1、2 已于 2026-11-23 验证通过**，结论见下节。

| # | 待验证 | 状态 |
| --- | --- | --- |
| 1 | Vite 8 + Astro 7 下 Stylus 的 glob `@import '_global/*'` 是否工作 | ✅ 通过 |
| 2 | `hexo-config()` 能否在 `if` 条件、`convert()`、`alpha()` 里正常求值 | ✅ 通过（方案已换） |
| 3 | ClientRouter 整 body 替换后，`#web_bg` 等全局元素的样式是否保留 | 待验证 |
| 4 | ClientRouter 下 `script[data-pjax]` 重执行机制能否等价 | 待验证 |
| 5 | 生成的 HTML 能否命中现有 Stylus 的 class | 待验证 |
| 6 | Astro 7 的 Rust 编译器对 pug 转出的 HTML 是否报错 | 待验证 |
| 7 | `@vite-pwa/astro` 能否表达 `sw-rules.js` 的 CDN 备用 URL 逻辑 | 待验证 |
| 8 | 音乐播放器在 ClientRouter 整 body 替换下能否不中断 | 待验证 |

## 6. Phase 1 实测记录（2026-11-23）

验证环境：astro 7.4.13 + vite 8.3.8 + stylus 0.64.0 + Node 24.22.0 + Windows 11。

验证素材：上游 `main` 分支的 `_config.yml`（41845 B）与 `source/css/var.styl`（9472 B，63 处 `hexo-config`），不做任何改写。

### 6.1 结论一：Stylus 的 glob import 可用

`@import 'partials/*'` 在 Vite 8 的 Stylus 管线里按 Stylus 自己的语义工作，多个 partial 都被编译进产物。

但有个前提：**被 `@import` 的文件不经过 Vite 的 transform 钩子**。Stylus 编译器直接读盘，Vite 根本看不到那些文件。这一点后面变成了关键约束。

### 6.2 结论二：`define` 注入 JS 函数走不通

原本计划写个 Vite 插件，用 `stylus.define('hexo-config', fn)` 注入函数。Vite 源码里确实有这条路径：

```js
const ref = stylus(content, { paths: ["node_modules"], ...options })
if (options.define) for (const key in options.define) ref.define(key, options.define[key])
```

而且它有个 `shouldUseFake` 判断，理论上检测到函数就切到主线程执行。但实测两条路都失败：

- `vite.css.preprocessorOptions.stylus.define` → 函数在到达编译器前丢失
- 插件 `config` 钩子里注入同样的对象 → 插件内打印 `typeof` 是 `function`，但 Stylus 编译时函数不存在

现象是编译报 `TypeError: expected string, ident or literal, but got call:hexo-config(...)`，说明 `hexo-config` 被当成未知的 CSS 函数，参数没被求值。函数里的 `console.log` 一次都没触发。

结论：**Vite 8 的样式预处理在隔离环境里跑，函数跨不过去**。这条路放弃。

### 6.3 结论三：纯文本替换会在三元运算符上翻车

改走 transform 阶段的文本替换：把 `hexo-config('x')` 直接换成字面量。单文件测试全部通过，但换成上游真实 `var.styl` 后报：

```
$fireworks-zIndex = "100px" ? convert("100px") : 40px
expected "indent", got "?"
```

原因：字符串字面量后面紧跟 `?`，Stylus 解析器不认。上游能工作是因为原形态是函数调用。

### 6.4 结论四：`@import` 必须自己展开

文本替换只对经过 transform 的入口文件生效。上游 `index.styl` 里只有 9 行 `@import`，真正的 63 处 `hexo-config` 全在 `var.styl` 等被导入文件里。

所以插件必须自己实现 import 展开：读 `@import` 的目标，递归内联，`.css` 的 import 保持原样（交给 Stylus 输出成 CSS 的 `@import`）。glob 只支持 `dir/*` 与 `dir/**/*` 两种，够上游用。

### 6.5 最终方案：变量注入 + 调用点替换

把 `hexo-config('x.y')` 替换成 `($cfg_x_y)`，并在文件顶部生成 `$cfg_x_y = <值>`。

三个细节都是踩出来的：

1. **必须加括号**。上游有 `hexo-config('note.light_bg_offset') is a 'unit' ? ...` 这种行首表达式，替换成裸变量后 Stylus 把行首标识符当属性名，报 `expected "indent", got "is a"`。
2. **变量形态能过三元**。`($cfg_x) ? ($cfg_x) : 40px` 与上游函数调用形态一致，解析正常。
3. **字符串引号要按内容选**。Stylus 不支持字符串内的引号转义，`"a\"b"` 和 `'a\'b'` 都会解析乱。规则：含双引号用单引号包裹，含单引号用双引号包裹，都没有用双引号。

### 6.6 验证结果

上游 `var.styl` + `_config.yml` 在 Astro 里编译出的产物：

```css
:root{--anzhiyu-main:#425aef;--anzhiyu-dark:#f2b94b;--global-font-size:16px}
.hero{color:#1f2d3d;background:#fff;border-color:#425aef;min-height:100vh;
      font-family:-apple-system,BlinkMacSystemFont,Segoe UI,...,sans-serif;font-size:16px}
.code-block{font-family:consolas,Menlo,PingFang SC,...,sans-serif;
            font-size:var(--global-font-size);color:#f47466;background:#1b1f230d}
.beautify-on,.hr-off{display:block}
```

逐项核对：

| 检查点 | 结果 |
| --- | --- |
| 颜色值无引号 | ✅ `#425aef` |
| `convert()` 生效 | ✅ `16px`、`100vh` |
| `unquote()` 生效 | ✅ font-family 无引号 |
| `alpha()` 生效 | ✅ `#1b1f230d` |
| 布尔条件分支 | ✅ `beautify-on` / `hr-off` 按配置出现 |
| 缺失键回退 | ✅ 5 个可选键警告后按 null 处理 |
| glob import | ✅ 引用的两个文件都被展开 |

有 5 个键在上游默认配置里不存在（`theme_color`、`hr_icon`、`theme_color.blockquote_padding_color`、`theme_color.blockquote_background_color`、`theme_color.button_hover`），它们是上游 `_config.yml` 里被注释掉的可选项。插件按 null 处理并告警，行为正确。

### 6.7 顺带踩到的环境问题

- **pnpm 默认 symlink 布局在 Windows 上会坏**。`pnpm add` 报 `ERR_PNPM_SYMLINK_FAILED Maximum call stack size exceeded` 之后，生成的 junction Node 解析不了（`fs.realpathSync` 不展开），stylus 内部 `require('glob')` 报 `MODULE_NOT_FOUND`。仓库根加了 `.npmrc` 设 `node-linker=hoisted` 解决。
- 本机 pnpm 走 `registry.npmmirror.com`，装老包（`glob@7`、`path-is-absolute`）时出现过 `ECONNRESET` 导致依赖树损坏。切 `https://registry.npmjs.org` 正常。

## 6. 不做什么

明确划出去，避免范围膨胀：

- **不做后台/CMS**。上游另有一个 [安和鱼](https://github.com/anzhiyu-c/anheyu-app) 项目负责这件事。
- **不重写视觉**。像素级还原是验收标准，不是"参考"。
- **不引入 UI 框架**。React/Vue 只在评论、搜索这类必须用现成库的地方按需引入，且必须 `client:only` 或 `client:visible`。
- **不支持 Hexo 的全部语法**。只支持上游主题文档里写明的 42 个 tag，Hexo 自身的其他 tag（`{% codeblock %}` 之外的）不承诺。
