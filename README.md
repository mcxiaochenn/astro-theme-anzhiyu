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

文档: 📖 [架构与计划 (PLAN)](docs/plan/PLAN.md) || 🚀 [Hexo 迁移指南](docs/guides/MIGRATION.md)

**Anzhiyu 的外貌，Astro 的心** —— 一款基于 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 打造的 **Astro** 个人博客主题。**100% 像素级复原原版 AnZhiYu 的视觉设计与微交互细节**，同时彻底剥离 Stylus 运行时与旧版全局脚本，拥抱 **Astro 7 + Svelte 5 + TypeScript 配置 + Shiki 双色高亮 + Pagefind** 现代架构。

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

2. 启动本地开发预览：

```bash
pnpm dev
```

3. 构建静态产物（自动生成 Pagefind 全文搜索索引）：

```bash
pnpm build
```

构建后的纯静态文件会输出到 `dist/`，可直接部署到 GitHub Pages、Cloudflare Pages、Vercel、Netlify 或任意静态托管平台。

### 方式二：从已有 Hexo AnZhiYu 站点一键迁移

```bash
# 1. 只读预演，检查待迁移内容规模
node scripts/migrate-hexo.mjs --site <你的Hexo站点目录> --dry-run

# 2. 执行迁移并生成独立的 Astro 博客目录
node scripts/migrate-hexo.mjs --site <你的Hexo站点目录> --out <输出目录>
```

---

## ⚙ 模块化配置与内容管理

本主题采用**类型安全的模块化 TypeScript 配置**（位于 `src/config/`），自带完整 IDE 类型推导与注释：

| 配置文件 | 职责说明 |
| --- | --- |
| `src/config/site.ts` | 站点标题、副标题、URL、分页大小、页脚分组导航、徽标、运行时间与备案信息 |
| `src/config/profile.ts` | 作者头像、在线状态贴纸、点击轮换问候语池、首访时段问候胶囊、社交链接与微信翻转卡 |
| `src/config/nav.ts` | 左上角九宫格站点矩阵、顶部主导航菜单（原生内建 `anzhiyufont` 图标）、开往与随机文章按钮 |
| `src/config/theme.ts` | 明暗主题色、首屏顶图/卡片模式切换、`HomeTop`（创意流/Swiper 轮播/今日推荐/分类磁贴）、双栏/单栏切换、侧栏卡片、Mac 代码框及全局交互开关 |
| `src/config/comment.ts` | 评论系统（Twikoo / Waline / Artalk / Giscus）与热评弹幕浮窗配置 |
| `src/config/music.ts` | 左下角跨页持久化音乐胶囊（`#nav-music`）与独立音乐馆歌单配置 |

### 博客内容与数据目录

| 目录 / 文件 | 用途 |
| --- | --- |
| `src/content/posts/` | 博客文章（Markdown / MDX，完整兼容 42 个 Hexo `{% tag %}` 标签语法） |
| `src/content/spec/` | 独立说明页面正文（友链申请规范、关于页心路历程等） |
| `src/data/link.yml` | 友情链接分组数据（支持 `anzhiyu` / `telescopic` / `flexcard` 多样式） |
| `src/data/essay.yml` | 即刻短文瀑布流与首页顶部滚动条数据 |
| `src/data/album.yml` | 两级相册集与详情画廊数据（支持瀑布流与等高光影画廊双模式） |
| `src/data/equipment.yml` | 我的装备 / 好物清单数据 |
| `src/data/about.yml` | 关于页 14 张动态 Bento 卡片个人信息、MBTI、生涯、追番与赞赏数据 |
| `src/data/creativity.yml` | 首页与关于页双排斜向流动技能图标数据 |
| `public/` | 静态资源与内建本地化的 `anzhiyufont` 定制图标字体 |

---

## ✨ 核心特性

- ✅ **100% 原版 AnZhiYu 视觉与微动效**：离线提取上游 480KB 原厂编译态模块化原生 CSS + 本地内建 `anzhiyufont` 图标字体，零 Stylus 运行时依赖
- ✅ **纯正 Astro 7 + Svelte 5 现代内核**：`ClientRouter` 零刷新站内路由过渡 + 按需水合交互岛，彻底告别旧版 120KB 全局脚本
- ✅ **沉浸式文章阅读体验**：顶图主色调动态提取与四周渐变晕染遮罩、四层视差动态波浪、AI 摘要打字机、TOC 目录百分比跟随、沉底大水印版权框与赞赏弹层
- ✅ **Shiki 双主题 + 原版 Mac 代码框**：构建期 Shiki 精准语法着色，100% 还原原版 `figure.highlight` Mac 圆点顶栏、一键折叠、超长渐变展开遮罩与复制轻提示
- ✅ **42 个 Hexo 标签完整支持**：内置 `remark-hexo-tag`（76/76 测试全绿），存量 Hexo 文章一字不改直接渲染
- ✅ **全套标志性全局交互**：全屏毛玻璃中控台（`#console`）、智能上下文感知右键菜单（`#rightMenu`）、Pagefind 原版搜索弹窗（`#local-search`）、`Shift` 快捷键面板（`#keyboard-tips`）、跨页不断连悬浮音乐胶囊（`#nav-music`）、简繁实时转换与沉浸阅读模式
- ✅ **12 类特色页面全量复原**：关于本人（14 张 Bento 卡片）、友人帐、友链朋友圈、即刻短文瀑布流、两级相册集、我的装备、音乐馆、文章隧道、分类/标签云与 404 推荐页

## 📄 许可证

本项目遵循 [GPL-3.0](LICENSE) 开源协议，与上游 [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) 保持一致。

## 🙏 致谢

- 主题设计：[张洪 Heo](https://github.com/zhheo)
- 原版开发与维护：[anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- 更早的源头：[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
