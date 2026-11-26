<p align="center">
  <a title="Astro Version" target="_blank" href="https://astro.build/"><img alt="Astro Version" src="https://img.shields.io/badge/Astro-7.4%2B-BC52EE?style=flat&logo=astro&logoColor=white"></a>
  <a title="Node Version" target="_blank" href="https://nodejs.org/"><img alt="Node Version" src="https://img.shields.io/badge/Node-%3E%3D%2022.23.4-yellowgreen?style=flat&logo=node.js&logoColor=white"></a>
  <a title="License" target="_blank" href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/mcxiaochenn/astro-theme-anzhiyu.svg?style=flat"></a>
  <br><br>
  <a title="GitHub Watchers" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/watchers"><img alt="GitHub Watchers" src="https://img.shields.io/github/watchers/mcxiaochenn/astro-theme-anzhiyu.svg?label=Watchers&style=social"></a>
  <a title="GitHub Stars" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/mcxiaochenn/astro-theme-anzhiyu.svg?label=Stars&style=social"></a>
  <a title="GitHub Forks" target="_blank" href="https://github.com/mcxiaochenn/astro-theme-anzhiyu/network/members"><img alt="GitHub Forks" src="https://img.shields.io/github/forks/mcxiaochenn/astro-theme-anzhiyu.svg?label=Forks&style=social"></a>
</p>

<p align="center"><a title="简体中文" href="README.md">🇨🇳 中文简体</a>  |  🇬🇧 English</p>

Preview: 👍 [AnZhiYu Astro Demo](https://anzhiyu.example.mcxiaochen.top/) || Upstream Preview: 🤞 [Hexo AnZhiYu](https://hexo.anheyu.com/)

Docs: 📖 [AnZhiYu Official Docs](https://docs.anheyu.com/) || 🚀 [Hexo Migration Guide](docs/guides/MIGRATION.md)

An **Astro** blog theme ported from [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu), preserving the original visual design, interactive experience, and YAML configuration habits while leveraging Astro's fast static build pipeline.

# astro-theme-anzhiyu

![](https://upload-bbs.miyoushe.com/upload/2025/07/04/125766904/658277d773c29a145adf0d05055ce477_909497354353121629.webp?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

## 💻 Quick Start

### Prerequisites

- **Node.js**: `>= 22.23.4`
- **pnpm**: `>= 10.x`

### Option 1: Start a New Blog from This Repository (Recommended)

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/mcxiaochenn/astro-theme-anzhiyu.git
cd astro-theme-anzhiyu
pnpm install
```

2. Start the local dev server:

```bash
pnpm dev
```

Open the URL printed in your terminal to preview the example site (`examples/blog`).

3. Build for production:

```bash
pnpm build
```

Static output is generated in `examples/blog/dist/` and can be deployed to GitHub Pages, Cloudflare Pages, Vercel, Netlify, or any static host.

### Option 2: Migrate from an Existing Hexo AnZhiYu Site

If you already run a blog with `hexo-theme-anzhiyu`, you can use the built-in migration script instead of copying posts and configs manually:

```bash
# 1. Dry-run first to inspect content and config compatibility
node scripts/migrate-hexo.mjs --site <your-hexo-site-dir> --dry-run

# 2. Generate a standalone Astro blog project
node scripts/migrate-hexo.mjs --site <your-hexo-site-dir> --out <output-dir>
```

The tool automatically converts posts, standalone pages, YAML data files (links, essays, albums, equipment, about), permalinks, and theme config. See the [Migration Guide](docs/guides/MIGRATION.md) for details.

### Option 3: Use as a Theme Package in an Astro Project

The core theme is split into three workspace packages (currently local to the monorepo and not yet published to npm; reference via `workspace:*`, tarball `.tgz`, or `file:` path):

- `astro-theme-anzhiyu`: layouts, components, config schema/loader, and static assets integration
- `remark-hexo-tag`: full remark support for all 42 Hexo `{% tag %}` shortcodes
- `vite-plugin-stylus-hexo-config`: compiles upstream Stylus stylesheets with `hexo-config()` injection

Enable the theme assets integration in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import anzhiyuAssets from 'astro-theme-anzhiyu/integration'

export default defineConfig({
  integrations: [anzhiyuAssets()],
})
```

> See [examples/blog/astro.config.mjs](examples/blog/astro.config.mjs) for the complete setup including `remark-hexo-tag` and `vite-plugin-stylus-hexo-config`.

## ⚙ Configuration & Content

### Theme Configuration

This theme **keeps the exact YAML structure and key names of `hexo-theme-anzhiyu`**. You can follow the [AnZhiYu Official Docs](https://docs.anheyu.com/) directly or reuse your existing `_config.anzhiyu.yml`:

- Default starter config: [examples/blog/theme.config.yml](examples/blog/theme.config.yml)
- Full-featured demo config: [examples/blog/theme.config.demo.yml](examples/blog/theme.config.demo.yml)

Built-in Zod validation automatically merges defaults and checks your config during dev and build.

### Content & Data Files

Under `examples/blog/`, site content is organized as follows:

| Path | Purpose |
| --- | --- |
| `src/content/posts/` | Blog posts (Markdown, compatible with Hexo frontmatter & `{% tag %}`) |
| `src/content/pages/` | Standalone pages (`link`, `essay`, `album`, `equipment`, `fcircle`, `music`, `about`, etc.) |
| `data/link.yml` | Friend links |
| `data/essay.yml` | "Moments" / short essays |
| `data/album.yml` | Photo albums |
| `data/equipment.yml` | Gear & equipment list |
| `data/about.yml` | About page profile, skills, and timeline |
| `public/` | Custom static assets (avatars, favicons, images, etc.) |

### Optional: Enable PWA Offline Support

Pass `ANZHIYU_PWA=1` when building to generate `manifest.webmanifest` and a Service Worker (`sw.js`):

```bash
ANZHIYU_PWA=1 pnpm build
```

## ✨ Features

- ✅ Compatible with upstream YAML config & [official documentation](https://docs.anheyu.com/)
- ✅ Smooth client-side navigation (Astro `ClientRouter` + PJAX compatibility shim)
- ✅ Image lazy-loading and lightbox preview (Fancybox / Medium Zoom)
- ✅ Dark mode (follows system preference or manual toggle with persistence)
- ✅ Full support for 42 Hexo `{% tag %}` shortcodes (notes, tabs, folding panels, galleries, Bilibili cards, Mermaid, etc.)
- ✅ Customizable right-click context menu
- ✅ Dynamic accent color extracted from post cover images (ColorThief)
- ✅ Immersive status bar and reading mode
- ✅ Global control console & keyboard shortcut overlay
- ✅ Persistent floating music player & dedicated music page (APlayer + MetingJS)
- ✅ Masonry moments (`/essay`), photo albums (`/album`), equipment (`/equipment`), friend links, and friend circle (`/fcircle`)
- ✅ Multiple comment backends (Twikoo, Waline, Artalk, Valine, Giscus, etc.) + comment barrage
- ✅ Local search (`/search.xml`), Algolia, and DocSearch
- ✅ LaTeX math (KaTeX / MathJax) & Mermaid diagrams
- ✅ Post word count, reading time, and AI post summaries
- ✅ Multi-language support (`zh-CN`, `zh-TW`, `en`)
- ✅ Alibaba Iconfont & Font Awesome icons
- ✅ PWA offline caching with CDN fallback
- ✅ Built-in analytics, chat widgets, ad slots, and privacy consent support
- ✅ Built-in Hexo → Astro one-click migration tool

## 📸 Showcase

**Immersive Status Bar**  
![Immersive Status Bar](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/3bc088e73d07b4dc25fc62fa4cf63261_4205905123525229755.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**Customizable Context Menu**  
![Customizable Context Menu](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/3f66e33b24a758d53717f6c2c44e50af_1884994888952376370.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**AI Summary**  
![AI Summary](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/184e089d64660f5f72390f547c864633_3266246986824356702.png)

**Clean & Modern Interface**  
![Clean Interface](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/8a16284fd36a9e986d5dbda772f697d0_1356079755877317976.png?x-oss-process=image///quality,q_100/auto-orient,0/interlace,1/format,avif)

**Comment Barrage**  
![Comment Barrage](https://upload-bbs.miyoushe.com/upload/2023/09/04/125766904/628aef1dbf52b61c0333682e8ee9954e_6905019516821534667.png)

## 🗂 Documentation

- [Hexo → Astro Migration Guide](docs/guides/MIGRATION.md)
- [Example Site Guide](examples/blog/README.md)
- [Upstream Repository (anzhiyu-c/hexo-theme-anzhiyu)](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- [Upstream Documentation (docs.anheyu.com)](https://docs.anheyu.com/)

<details>
<summary>Developer Verification & Architecture Docs</summary>

- Architecture & design: [Technical Mapping](docs/analysis/02-astro-mapping.md) · [Upstream Delta](docs/reference/upstream-delta.md) · [Execution Plan](docs/plan/PLAN.md)
- Local checks:

```bash
node packages/remark-hexo-tag/test/run.mjs
pnpm verify && pnpm compare-vars && pnpm check:upstream-delta
```

</details>

## 📄 License

Licensed under [GPL-3.0](LICENSE).

The upstream theme [hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) is released under GPL-3.0, and this port retains the same license.

## 🙏 Credits

- Theme Design: [张洪 Heo](https://github.com/zhheo)
- Upstream Author & Maintainer: [anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- Upstream Documentation: [xiaoran](https://github.com/xiaoran)
- Earlier Origin: [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
