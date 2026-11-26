<p align="center">
  <a title="Astro Version" target="_blank" href="https://astro.build/"><img alt="Astro Version" src="https://img.shields.io/badge/Astro-7.4%2B-BC52EE?style=flat&logo=astro&logoColor=white"></a>
  <a title="Node Version" target="_blank" href="https://nodejs.org/zh-cn/"><img alt="Node Version" src="https://img.shields.io/badge/Node-%3E%3D%2022.23.4-yellowgreen?style=flat&logo=node.js&logoColor=white"></a>
  <a title="License" target="_blank" href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/mcxiaochenn/astro-theme-anzhiyu.svg?style=flat"></a>
  <br><br>
  <a title="GitHub Watchers" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/watchers"><img alt="GitHub Watchers" src="https://img.shields.io/github/watchers/mcxiaochenn/astro-theme-anzhiyu.svg?label=Watchers&style=social"></a>
  <a title="GitHub Stars" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/mcxiaochenn/astro-theme-anzhiyu.svg?label=Stars&style=social"></a>
  <a title="GitHub Forks" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/network/members"><img alt="GitHub Forks" src="https://img.shields.io/github/forks/mcxiaochenn/astro-theme-anzhiyu.svg?label=Forks&style=social"></a>
</p>

<p align="center">🇨🇳 中文简体  |  <a title="English" href="README.en.md">🇬🇧 English</a></p>

预览: 👍 [AnZhiYu Astro Demo](https://anzhiyu.example.mcxiaochen.top/) || 原版预览: 🤞 [Hexo AnZhiYu](https://hexo.anheyu.com/)

文档: 📖 [AnZhiYu 官方配置文档](https://docs.anheyu.com/) || 🚀 [Hexo 一键迁移指南](docs/guides/MIGRATION.md)

一款基于 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 完整移植到 **Astro** 的个人博客主题，保留原版视觉设计、交互体验与配置习惯，同时享受 Astro 的极速构建与静态部署能力。

# astro-theme-anzhiyu

![](https://upload-bbs.miyoushe.com/upload/2025/07/04/125766904/658277d773c29a145adf0d05055ce477_909497354353121629.webp?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

## 💻 快速开始

### 环境要求

- **Node.js**：`>= 22.23.4`
- **pnpm**：`>= 10.x`

### 方式一：直接基于本仓库搭建新博客【推荐】

1. 克隆仓库并安装依赖：

```bash
git clone https://github.com/mcxiaochenn/astro-theme-anzhiyu.git
cd astro-theme-anzhiyu
pnpm install
```

2. 启动本地预览：

```bash
pnpm dev
```

打开终端输出的地址即可实时预览示例站点（位于 `examples/blog`）。

3. 构建静态产物：

```bash
pnpm build
```

构建后的纯静态文件会输出到 `examples/blog/dist/`，可直接部署到 GitHub Pages、Cloudflare Pages、Vercel、Netlify 或任意静态托管服务。

### 方式二：从已有 Hexo AnZhiYu 站点一键迁移

如果你已经有一个使用 `hexo-theme-anzhiyu` 的旧博客，无需手动搬运文章和配置，仓库内置了自动化迁移工具：

```bash
# 1. 先做只读预演，检查源站内容与配置兼容性
node scripts/migrate-hexo.mjs --site <你的Hexo站点目录> --dry-run

# 2. 执行迁移并生成独立的 Astro 博客目录
node scripts/migrate-hexo.mjs --site <你的Hexo站点目录> --out <输出目录>
```

迁移工具会自动转换文章、独立页面、YAML 数据文件（友链 / 说说 / 相册 / 装备 / 关于）、永久链接格式与主题配置。详细步骤与注意事项请阅读 [Hexo 迁移指南](docs/guides/MIGRATION.md)。

### 方式三：作为主题包接入现有 Astro 项目

主题核心由工作区内的三个包组成（目前处于 monorepo 本地开发阶段，尚未发布到 npm，可通过 `workspace:*` 或本地 `.tgz` / `file:` 路径引入）：

- `astro-theme-anzhiyu`：布局、页面组件、配置校验与静态资源 integration
- `remark-hexo-tag`：在 Markdown 中完整解析 Hexo `{% tag %}` 语法
- `vite-plugin-stylus-hexo-config`：编译原版 Stylus 样式并注入 `hexo-config()`

在 `astro.config.mjs` 中启用主题静态资源集成：

```js
import { defineConfig } from 'astro/config'
import anzhiyuAssets from 'astro-theme-anzhiyu/integration'

export default defineConfig({
  integrations: [anzhiyuAssets()],
})
```

> 完整配置示例（含 Markdown `remark-hexo-tag` 与 Vite Stylus 插件接线）可参考 [examples/blog/astro.config.mjs](examples/blog/astro.config.mjs)。

## ⚙ 配置与内容管理

### 主题配置

本主题**沿用与原版 `hexo-theme-anzhiyu` 一致的 YAML 配置结构与键名**。你可以直接参考 [AnZhiYu 官方配置文档](https://docs.anheyu.com/) 进行个性化配置，或将原 Hexo 站点的 `_config.anzhiyu.yml` 内容直接迁移过来：

- 示例站点配置文件：[examples/blog/theme.config.yml](examples/blog/theme.config.yml)
- 功能全开参考配置：[examples/blog/theme.config.demo.yml](examples/blog/theme.config.demo.yml)

主题内置了基于 Zod 的配置校验，修改配置后在开发或构建时会自动合并默认值并校验结构。

### 博客内容与数据文件

在 `examples/blog/` 目录下，你可以按如下位置管理站点内容：

| 目录 / 文件 | 用途 |
| --- | --- |
| `src/content/posts/` | 博客文章（Markdown，兼容 Hexo Frontmatter 与 `{% tag %}`） |
| `src/content/pages/` | 独立页面（如关于、友链、说说、相册、装备、音乐、友链朋友圈等） |
| `data/link.yml` | 友情链接数据 |
| `data/essay.yml` | 即刻说说 / 短动态数据 |
| `data/album.yml` | 相册集与照片数据 |
| `data/equipment.yml` | 好物 / 装备清单数据 |
| `data/about.yml` | 关于页面个人信息、技能与生涯数据 |
| `public/` | 站点自定义静态资源（头像、图标、背景图等） |

### 可选：开启 PWA 离线缓存

构建时传入环境变量 `ANZHIYU_PWA=1` 即可自动生成 `manifest.webmanifest` 与 Service Worker（`sw.js`）：

```bash
ANZHIYU_PWA=1 pnpm build
```

## ✨ 功能特性

- ✅ 沿用原版配置体系，详实的[官方配置文档](https://docs.anheyu.com/)直接适用
- ✅ 无刷新站内导航体验（Astro `ClientRouter` + PJAX 兼容层）
- ✅ 图片懒加载与大图灯箱查看（Fancybox / Medium Zoom）
- ✅ 完整适配明暗双色主题（暗色模式自动跟随系统 / 手动切换持久化）
- ✅ 丰富多样的 Hexo 标签语法（完整支持 42 个 `{% tag %}`，含按钮、提示框、折叠面板、相册、B 站卡片、Mermaid 等）
- ✅ 定制化右键菜单（支持复制、繁简切换、夜间模式、热评开关等）
- ✅ 主色调随文章封面图片颜色动态变化（ColorThief）
- ✅ 沉浸式状态栏与阅读模式
- ✅ 全局中控台与快捷键面板（`Shift` 快捷键提示）
- ✅ 悬浮音乐球与独立音乐页（APlayer + MetingJS，跨页面导航不断连）
- ✅ 瀑布流即刻说说、瀑布流相册集、我的装备、友链与朋友圈页面
- ✅ 多评论后端支持（Twikoo / Waline / Artalk / Valine / Giscus 等）与评论弹幕
- ✅ 本地搜索（`/search.xml`）与 Algolia / DocSearch 搜索
- ✅ LaTeX 数学公式（KaTeX / MathJax）与 Mermaid 流程图
- ✅ 文章字数统计、阅读时长与文章 AI 摘要
- ✅ 多语言支持（简体中文 / 繁體中文 / English）
- ✅ 阿里图标（Iconfont）与 Font Awesome 图标支持
- ✅ PWA 离线缓存与外部 CDN 容灾回退
- ✅ 内置多种网页统计、在线聊天、广告位与隐私协议支持
- ✅ 附带 Hexo → Astro 一键迁移工具

## 📸 部分功能展示

**沉浸式状态栏**  
沉浸阅读。  
![沉浸式状态栏](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/3bc088e73d07b4dc25fc62fa4cf63261_4205905123525229755.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**高度自定义的右键菜单**  
高度定制。  
![高度自定义的右键菜单](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/3f66e33b24a758d53717f6c2c44e50af_1884994888952376370.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**AI 摘要**  
迅速读取文章内容。  
![AI摘要](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/184e089d64660f5f72390f547c864633_3266246986824356702.png)

**让人眼前一亮的清爽界面**  

![让人眼前一亮的清爽界面](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/8a16284fd36a9e986d5dbda772f697d0_1356079755877317976.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**评论弹幕**  

![评论弹幕](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/628aef1dbf52b61c0333682e8ee9954e_6905019516821534667.png)

## 🗂 相关文档

- [Hexo → Astro 迁移指南](docs/guides/MIGRATION.md)
- [示例站点说明](examples/blog/README.md)
- [原版主题仓库（anzhiyu-c/hexo-theme-anzhiyu）](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- [原版主题文档（docs.anheyu.com）](https://docs.anheyu.com/)

<details>
<summary>开发者自检与工程文档（点击展开）</summary>

- 架构与设计文档：[技术映射](docs/analysis/02-astro-mapping.md) · [上游差异记录](docs/reference/upstream-delta.md) · [执行计划](docs/plan/PLAN.md)
- 本地测试与基线校验：

```bash
node packages/remark-hexo-tag/test/run.mjs
pnpm verify && pnpm compare-vars && pnpm check:upstream-delta
```

</details>

## 📄 许可证

本项目遵循 [GPL-3.0](LICENSE) 开源协议。

上游主题 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 以 GPL-3.0 发布，本移植版沿用同一协议。

## 🙏 致谢

- 主题设计：[张洪 Heo](https://github.com/zhheo)
- 原版开发与维护：[anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- 原版文档编写：[xiaoran](https://github.com/xiaoran)
- 更早的源头：[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
