# 上游调研：hexo-theme-anzhiyu

调研对象：[anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 的 `main` 分支（用户安装分支），commit `72439d93`，版本 1.7.1。

调研时间：2026-11-23。所有数字来自对该 commit 的实际统计，不是估计。

## 1. 规模

| 项目 | 数值 |
| --- | --- |
| 文件总数 | 331 |
| 总体积 | 2.55 MB |
| Pug 模板 | 120 个，226.5 KB |
| Stylus 样式 | 72 个，302.3 KB |
| JavaScript | 56 个，295.5 KB（含 `scripts/` 的 45 个 Hexo 插件脚本） |
| CSS（静态） | 47 个，167.5 KB |
| 图片与动画 | 约 1.5 MB（gif/jpg/png/ico） |
| 配置文件 | `_config.yml` 41.8 KB，`plugins.yml` 5.2 KB |
| 语言文件 | 4 个（default / en / zh-CN / zh-TW），19.1 KB |
| 顶层配置键 | 约 200 个 |

`source/` 下 143 个文件占 2.1 MB，其中大部分是第三方 CSS 与演示图片；真正的自研逻辑集中在 `layout/`、`scripts/`、`source/css/*.styl`、`source/js/{main,utils}.js`。

## 2. 目录职责

```
_config.yml      主题配置（约 200 个键，20 个分区块）
plugins.yml      57 个第三方库的名称/版本/文件路径
sw-rules.js      hexo-swpp 插件的 Service Worker 规则
layout/          120 个 Pug 模板
scripts/         45 个 Hexo 扩展脚本，四个约定目录
source/css/      72 个 Stylus 源文件
source/js/       10 个前端脚本
languages/       i18n 字典
```

### layout/

6 个根页面 + 114 个 include。

| 根模板 | 职责 |
| --- | --- |
| `index.pug` | 首页文章列表 |
| `post.pug` | 文章页 |
| `page.pug` | 独立页面，按 `page.type` 分发到 12 个子模板（about / album / essay / flink / room / music / equipment / fcircle / categories / tags / album_detail / default） |
| `archive.pug` | 归档 |
| `category.pug` / `tag.pug` | 分类、标签列表 |

所有根页面都 `extends includes/layout.pug`，只覆盖 `block content`。

`includes/layout.pug` 是唯一骨架（91 行），按顺序挂载：`head`、`#web_bg`、preloader、mourn 遮罩、`#body-wrap` → header → `#blog-container` → `#content-inner` → footer、sidebar、rightside、search、右键菜单、`additional-js`、弹窗。

### scripts/

Hexo 的四个扩展点：

| 目录 | 数量 | 作用 |
| --- | --- | --- |
| `events/` | 7 | `before_generate` 钩子：CDN 资源映射、配置合并、Stylus 变量注入、版本检查 |
| `filters/` | 2 | 渲染过滤器：文章懒加载改写、随机封面 |
| `helpers/` | 12 | 模板函数：`page_description`、`cloudTags`、`urlNoIndex`、`findArchivesTitle`、`related_post` 等 |
| `tag/` | 21 个文件，42 个 tag 名 | Markdown 自定义语法 |

### source/css/

`index.styl` 是唯一入口，按顺序导入 9 组：

```
_third-party/normalize.min.css
var.styl                    ← 全部设计变量
_global/*                   全局样式
_highlight/*                代码高亮
_page/*                     页面级样式
_layout/*                   布局级样式（head 19.5KB、nav 17.6KB、aside 13.7KB、post 12.2KB）
_tags/*                     42 个 tag 的样式（20 个文件）
_mode/*                     暗色模式、阅读模式
_third-party/*              第三方组件覆写
_extra/**/*.css             零散补丁
```

## 3. 六个核心机制

### 3.1 单一骨架 + block 注入

`layout.pug` 之外的 114 个 include 通过 `!=partial('path', {}, {cache: true})` 或 `include` 组装。页面级差异只用 `block content` 表达。

**迁移含义**：Astro 侧对应一个 `BaseLayout.astro` + `<slot />`，结构可以一一对应。

### 3.2 配置在编译期注入样式

`var.styl` 用 Stylus 的 `hexo-config('xxx')` 函数读 Hexo 配置：

```stylus
$theme-color = $themeColorEnable && hexo-config('theme_color.main') ? convert(hexo-config('theme_color.main')) : $bright-blue
$index-top-img-height = hexo-config('index_top_img_height') ? convert(hexo-config('index_top_img_height')) : 100vh
$font-size = hexo-config('font.global-font-size') ? convert(hexo-config('font.global-font-size')) : 14px
```

全仓库 `hexo-config()` 共 **179 处**，分布在 27 个 styl 文件里（`var.styl` 独占 63 处）。还有 `if hexo-config('algolia_search.enable')` 这类条件编译，直接决定是否导入搜索样式（`index.styl` 4 处）。

**迁移含义**：`hexo-config()` 是 Hexo 的 `hexo-renderer-stylus` 提供的函数，Astro 里不存在。必须先补一个等效层，否则 302 KB 样式无法编译。

### 3.3 GLOBAL_CONFIG 运行时对象

`includes/head/config.pug`（223 行）在 `<head>` 里内联生成一个约 40 个键的 JS 对象：

```js
const GLOBAL_CONFIG = {
  algolia: {...}, localSearch: {...}, translate: {...},
  copy: {...}, lightbox: 'mediumZoom', islazyload: true,
  mainTone: {...}, runtime: '...', date_suffix: {...},
  autoDarkmode: true, ... 
}
```

`source/js/` 下的 `main.js`（64 KB）与 `utils.js`（50 KB）几乎全部逻辑都从这个对象取配置。前端没有任何模块化，`anzhiyu` 是一个挂在 window 上的命名空间对象。

**迁移含义**：这是主题的运行时契约。Astro 侧要么继续注入同名全局对象，要么重写 JS。重写 115 KB 手写 JS 不现实，所以**保留 `anzhiyu` 命名空间与 `GLOBAL_CONFIG` 结构是理性选择**。

### 3.4 pjax 导航

`pjax.pug` 用 [pjax 0.2.8](https://github.com/MoOx/pjax) 接管 `a:not([target="_blank"])`，只替换 6 个选择器：

```js
selectors: ['head > title', '#config-diff', '#body-wrap',
            '#rightside-config-hide', '#rightside-config-show', '.js-pjax']
```

`pjax:complete` 里逐个重建：`window.refreshFn()`、重执行 `script[data-pjax]`、`lazyLoadInstance.update()`、`panguInit()`、`Prism.highlightAll()`、GA/百度统计的 pageview 上报。

模板层也直接依赖它：文章卡片用 `onclick="pjax.loadUrl('...')"` 跳转（`post-ui.pug`、`layout.pug` 都是）。

**迁移含义**：这是最难等价的一块。Astro 的 `ClientRouter` 是整页 body 替换 + 视图过渡，不提供 `pjax.loadUrl()` 这样的编程式 API，也没有 `pjax:complete` 这种"片段贴完"的时机。

### 3.5 CDN 资源抽象层

`events/cdn.js` 在 `before_generate` 阶段把两批资源合并成 `theme.asset.*`：

- 内部资源（9 个：main.js、utils.js、tw_cn.js、local-search、algolia、random_friends_post、right_click_menu、comment_barrage、ai_abstract、people）
- `plugins.yml` 的 57 个第三方库

每个资源生成 9 种 URL：`local`、`jsdelivr`、`unpkg`、`cdnjs`、`elemecdn`、`onmicrosoft`、`cbd`、`anheyu`、`custom`。模板里统一写 `url_for(theme.asset.main)`，切换 provider 只改一行配置。

**迁移含义**：这是上游设计里最值得保留的一层。Astro 侧有两个选择——用 Vite 全量打包（失去 CDN 切换能力），或保留一个资源 URL 解析层。倾向后者，因为国内网络环境需要它。

### 3.6 Tag 插件体系

`scripts/tag/` 21 个文件注册了 **42 个 Markdown 标签**：

| 文件 | 注册的 tag |
| --- | --- |
| `note.js` | `note`, `subnote` |
| `tabs.js` | `tabs`, `subtabs`, `subsubtabs` |
| `hide.js` | `hideInline`, `hideBlock`, `hideToggle` |
| `checkbox.js` | `checkbox`, `radio` |
| `image.js` | `image`, `inlineimage` |
| `inlineImg.js` | `inlineImg` |
| `media.js` | `audio`, `video`, `videos` |
| `gallery.js` | `gallery`, `galleryGroup` |
| `site.js` | `site`, `sitegroup` |
| `btns.js` | `btns`, `cell` |
| `folding.js` | `folding` |
| `timeline.js` | `timeline` |
| `link.js` | `link` |
| `flink.js` | `flink` |
| `button.js` | `btn` |
| `iconfont.js` | `icon` |
| `label.js` | `label` |
| `span.js` | `p`, `span` |
| `inline-labels.js` | `u`, `emp`, `wavy`, `del`, `kbd`, `psw` |
| `bilibili.js` | `bilibili` |
| `dogeplayer.js` | `dogeplayer` |
| `mermaid.js` | `mermaid` |
| `tip.js` | `tip` |
| `Introduction-card.js` | `intCard` |

写法类似 `{% note info %}`、`{% tabs %}`、`{% gallery %}`。这是存量文章最大的一块迁移负担。

## 4. 第三方依赖

`plugins.yml` 列了 57 个库，按用途分：

| 类别 | 库 |
| --- | --- |
| 导航/加载 | pjax 0.2.8, instant.page 5.2, pace-js 1.2.4, vanilla-lazyload 19.1.3 |
| 搜索 | algoliasearch 4.18, instantsearch.js 4.84, @docsearch/{js,css} 4.3.2 |
| 评论 | valine 1.5.1, twikoo 1.6.44, @waline/client 3.8, artalk 2.9.1 |
| 代码高亮 | prismjs 1.30（含 line-numbers、autoloader） |
| 数学/图表 | mathjax 4.0, katex 0.16.25, mermaid 11.12.2 |
| 灯箱 | @fancyapps/ui 6.1.6, medium-zoom 1.1 |
| 音乐 | aplayer（anzhiyu 自建静态包）, Meting2 |
| 图标 | @fortawesome/fontawesome-free 7.1, 阿里 iconfont（自建包） |
| 特效 | canvas-ribbon / canvas-nest / fireworks / click-heart / ClickShowText（均来自 butterfly-extsrc） |
| 工具 | blueimp-md5 2.19, pangu 4.0.7, node-snackbar 0.1.16, colorthief 2.6, gsap |
| 自建静态包 | anzhiyu-theme-static（coin / countup / rightmenu / waterfall / ali_iconfont_css / accesskey / aplayer_css） |

其中 `anzhiyu-theme-static` 和 `anzhiyu-blog-static` 是上游自己托管的 npm 包，不是公开 CDN 上的第三方资源。

## 5. PWA 的真实情况

README 写「支持高速缓存的 swpp，pwa 特性」，实际情况需要拆开看：

- `includes/head/pwa.pug` 只输出 manifest、apple-touch-icon、32/16 favicon、以及 30 条 iOS 启动图 `<link>`。
- Service Worker 的注册代码在 `pwa.pug` 第 49–59 行，**整段被注释掉了**。
- 真正的 SW 由外部插件 `hexo-swpp` 生成，主题提供配置文件 `sw-rules.js`（缓存策略、CDN 备用 URL、`/404.html` 与 `/css/index.css` 的强制缓存）。

**结论**：主题本身不含 SW 生成能力。迁移到 Astro 时需要 `@vite-pwa/astro` 或 serwist 这类方案，并把 `sw-rules.js` 的缓存规则翻译过去。

## 6. 耦合强度排序

按「改动会引发连锁失效」的程度排：

| 耦合 | 强度 | 原因 |
| --- | --- | --- |
| DOM 结构与 ID | 极高 | 302 KB Stylus + 115 KB JS 全部按 `#web_bg`、`#body-wrap`、`#content-inner`、`#rightside` 等选择器写死 |
| pjax 生命周期 | 极高 | 导航、统计上报、组件重建都挂在 `pjax:send` / `pjax:complete` |
| `GLOBAL_CONFIG` | 高 | 前端 JS 唯一配置来源 |
| `hexo-config()` in Stylus | 高 | 179 处，缺了样式编译不过 |
| Tag 语法 | 高 | 存量文章直接不可读 |
| `theme.asset.*` | 中 | 可以整体替换，不影响逻辑 |
| Hexo helper | 中 | 12 个函数，逐个重写成本可控 |
| i18n 字典 | 低 | 4 个 YAML，可平移 |

## 7. 对迁移的直接结论

1. **不能重新设计 HTML 结构**。要复用 302 KB Stylus 和 115 KB JS，就必须保持上游的 DOM 树、ID 和 class 命名。移植的目标是「换渲染引擎」，不是「重做前端」。
2. **Stylus 是必须保住的技术债**。72 个文件手改成 CSS 或 Tailwind 的成本远高于写一个 Vite 插件补 `hexo-config()`。
3. **pjax 需要一个替代层**，不能只换成 ClientRouter 就宣布兼容。
4. **42 个 tag 是用户侧最大的迁移阻力**，必须有自动转换工具，不能只给文档让人手改。
5. **配置模型要平移**。约 200 个键、20 个分区块，直接照搬成 YAML 比重新设计更省事，也便于用户从 Hexo 版对照检查。
