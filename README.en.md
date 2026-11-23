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

- [ ] PWA (upstream relies on the external `hexo-swpp` plugin to generate a Service Worker; the theme itself only ships a manifest and icons)
- [ ] User documentation

## Technical choices

Settled against measured upstream data (120 Pug files, 72 Stylus files, 42 custom tags, about 200 config keys):

- **Framework**: Astro 7.4 + Vite 8, pnpm workspace monorepo
- **Templates**: Pug → `.astro` components, keeping upstream DOM structure and IDs intact
- **Styles**: Stylus stays. Porting 302 KB of styles costs far more than adding a `hexo-config()` compatibility plugin
- **Markdown**: opt back into the Unified processor (not Astro 7's default Sätteri) so remark plugins can handle the 42 Hexo tags
- **Navigation**: ClientRouter plus a compatibility shim instead of pjax; front-end JS keeps the `anzhiyu` namespace rather than being rewritten
- **Config**: YAML + zod validation, same key names as upstream so users can copy their old config directly

Full rationale and trade-offs: [Technical mapping](docs/02-astro-mapping.md).

## Documents

| Document | Contents |
| --- | --- |
| [Upstream analysis](docs/01-upstream-analysis.md) | Upstream structure, six core mechanisms, coupling ranking |
| [Technical mapping](docs/02-astro-mapping.md) | Mechanism-by-mechanism mapping, 6 architecture decisions, verification checklist |
| [Migration plan](docs/03-migration-plan.md) | 7 phases, acceptance criteria, 34–45 day estimate, risk table |

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 0 | Repository skeleton, research and plan | Done |
| Phase 1 | Build pipeline and config layer (Stylus compat plugin, config schema) | Not started |
| Phase 2 | Layout and core pages (home, post, archive, 404) | Not started |
| Phase 3 | Widgets and 12 page templates | Not started |
| Phase 4 | Interactivity (ClientRouter, dark mode, context menu, music) | Not started |
| Phase 5 | Integrations (5 comment systems, 3 search backends, 5 analytics) | Not started |
| Phase 6 | remark plugin for the 42 Hexo tags | Not started |
| Phase 7 | PWA, performance, migration guide | Not started |

Acceptance criteria for each phase live in the [migration plan](docs/03-migration-plan.md), verified by HTML diff, screenshot comparison and a feature checklist — not self-assessment.

## About upstream

- Upstream repository: [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu), actively maintained (as of 2026-11, latest release is 1.7.1)
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
