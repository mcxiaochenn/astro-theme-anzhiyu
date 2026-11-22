English · [简体中文](README.md)

# astro-theme-anzhiyu

An Astro port of the [Anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) blog theme.

> **Status: planning stage, no code yet.** This repository currently contains only project documentation and a license. The migration has not started.

## Background

Anzhiyu is one of the most feature-complete blog themes in the Hexo ecosystem — 2.5k stars, forked and extended from [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly). Its templates are written in Pug and Stylus, and routing, asset handling and rendering all hang off Hexo's own pipeline. Swapping the build tool essentially means rewriting the theme.

Astro describes UI with components, hands content to content collections, builds with Vite, and ships JavaScript-free output that deploys to any static host. The same UI can be split into standalone components here.

The goal of this repository: carry over the upstream features one by one — not to build a look-alike shell.

## Migration targets

The list below is taken from the upstream README's feature section. **Every item is still pending; current progress is zero.** Status will be updated as code lands.

### Content and rendering

- [ ] Multiple code highlighting schemes
- [ ] Footnote syntax
- [ ] LaTeX math
- [ ] Mermaid diagrams
- [ ] Word count per post
- [ ] AI post summaries
- [ ] Multi-language configuration

### Navigation and interaction

- [ ] Lazy-loaded page components (pjax upstream)
- [ ] Lazy-loaded images
- [ ] Image lightbox
- [ ] Dark mode
- [ ] Immersive status bar
- [ ] Custom context menu
- [ ] Dynamic accent color from cover image
- [ ] Global control console
- [ ] Keyboard shortcuts
- [ ] Rich tag/shortcode options

### Comments, analytics and integrations

- [ ] Multiple built-in comment systems
- [ ] Visitor analytics (Google / Baidu / Microsoft / Cloudflare / CNZZ)
- [ ] Local search / Algolia / DocSearch
- [ ] Chat system
- [ ] Music player
- [ ] Ad slots
- [ ] Privacy consent

### Visuals and assets

- [ ] Masonry "moments" feed
- [ ] Masonry photo albums
- [ ] Alibaba iconfont and Font Awesome
- [ ] Custom CDN for static assets

### Build and docs

- [ ] PWA (swpp + aggressive caching upstream)
- [ ] User documentation

## Technical direction

Working assumptions, not settled decisions:

- **Templates**: Pug → Astro components (`.astro`)
- **Styles**: upstream Stylus is large; decide during migration whether to keep Stylus or move to Tailwind CSS / plain CSS
- **pjax**: Astro's ClientRouter covers most of it, but upstream controls partial refreshes more precisely — needs page-by-page verification
- **Data**: posts via content collections; configuration keeps a structure similar to `_config.yml`
- **Integrations** (comments, search, analytics, AI summaries): exposed as configurable components rather than scattered through templates

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 0 | Repository skeleton, README, license | In progress |
| Phase 1 | Base layout, post page, list pages | Not started |
| Phase 2 | Interactive features (lazy loading, dark mode, context menu, …) | Not started |
| Phase 3 | Integrations and PWA | Not started |
| Phase 4 | Documentation site and config migration guide | Not started |

## About upstream

- Upstream repository: [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu), actively maintained, latest release 1.7.1
- Upstream docs: [docs.anheyu.com](https://docs.anheyu.com/)
- Upstream preview: [hexo.anheyu.com](https://hexo.anheyu.com/)

This project is a derivative port — not a patched fork of the upstream repository, and not an official project. Upstream behavior is the reference for feature decisions; differences introduced by the port will be documented.

## License

[GPL-3.0](LICENSE).

Upstream is released under GPL-3.0, and this port keeps the same license. That is a requirement of derivative works, not a choice. Building a blog on top of this project is likewise bound by GPL-3.0.

## Credits

- Theme design: [张洪 Heo](https://github.com/zhheo)
- Upstream development and maintenance: [anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- Upstream documentation: [xiaoran](https://github.com/xiaoran)
- Earlier origin: [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
