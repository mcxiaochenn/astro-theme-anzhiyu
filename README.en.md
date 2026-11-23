English · [简体中文](README.md)

# astro-theme-anzhiyu

An Astro port of the [Anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) blog theme.

> **Status: migration in progress.** The verification site [examples/blog](examples/blog) builds **62 pages** with upstream's full styles and config; the HTML structure diff against the 48-page upstream baseline is down to **112 differences** (verified page-by-page with [scripts/diff-html.mjs](scripts/diff-html.mjs)); the remark plugin for the 42 Hexo tags is done with **59/59 tests passing**; the Hexo → Astro migration tool and guide are delivered ([docs/MIGRATION.md](docs/MIGRATION.md)). The interaction layer and third-party integrations are written but **not yet wired or verified** — progress and acceptance criteria live in the [execution plan](docs/PLAN.md).

## Background

Anzhiyu is one of the most feature-complete blog themes in the Hexo ecosystem — 2.5k stars, forked and extended from [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly). Its templates are written in Pug and Stylus, and routing, asset handling and rendering all hang off Hexo's own pipeline. Swapping the build tool essentially means rewriting the theme.

Astro describes UI with components, hands content to content collections, builds with Vite, and ships JavaScript-free output that deploys to any static host. The same UI can be split into standalone components here.

The goal of this repository: carry over the upstream features one by one — not to build a look-alike shell.

## Migration targets

The list below is taken from the upstream README's feature section. **Checked = implemented and verified against the upstream oracle / unit tests**; unchecked = not implemented, or structurally landed but not behavior-verified. Per-item criteria live in [PLAN.md appendix A](docs/PLAN.md) — no self-assessment.

### Content and rendering

- [ ] Multiple code highlighting schemes (the highlight.js `figure.highlight` DOM matches the baseline; engine switching not done)
- [x] Footnote syntax (real footnotes; the intentional difference from upstream's raw output is registered in the diff whitelist)
- [ ] LaTeX math (components written, not wired)
- [ ] Mermaid diagrams (components written, not wired)
- [x] Word count per post (12 helpers verified against upstream JS as oracle)
- [ ] AI post summaries (components written, not wired)
- [x] Multi-language configuration (4 languages, 83 dictionary entries passing)

### Navigation and interaction

- [ ] Lazy-loaded page components (ClientRouter + pjax compatibility shim written; site-wide behavior verification pending)
- [ ] Lazy-loaded images / image lightbox
- [ ] Dark mode (injection logic written, behavior verification pending)
- [ ] Immersive status bar (manual item, mobile screenshots)
- [ ] Custom context menu / dynamic accent color / global control console / keyboard shortcuts (DOM and scripts written, unverified)
- [x] Rich tag/shortcode options (all 42 Hexo tags implemented, 59/59 tests, zero leftover syntax in fixtures)

### Comments, analytics and integrations

- [ ] 5 comment systems, 5 analytics, 3 search backends, chat, ad slots, privacy consent (component library of 55 files written; not wired, not self-checked)
- [ ] Music player

### Visuals and assets

- [ ] Masonry "moments" feed / masonry photo albums (page templates DOM-aligned; browser walkthrough pending)
- [ ] Alibaba iconfont and Font Awesome / custom CDN (asset resolution layer written, unverified)

### Build and docs

- [ ] PWA (upstream relies on the external `hexo-swpp` plugin to generate a Service Worker; the theme itself only ships a manifest and icons)
- [x] Hexo → Astro migration tool and guide ([scripts/migrate-hexo.mjs](scripts/migrate-hexo.mjs) + [docs/MIGRATION.md](docs/MIGRATION.md), verified against a real site)

## Technical choices

Settled against measured upstream data (120 Pug files, 72 Stylus files, 42 custom tags, 133 top-level config keys):

- **Framework**: Astro 7.4 + Vite 8, pnpm workspace monorepo (`packages/*` + `examples/*`)
- **Templates**: Pug → `.astro` components, keeping upstream DOM structure and IDs intact
- **Styles**: Stylus stays. Porting 302 KB of styles costs far more than adding a `hexo-config()` compatibility plugin ([vite-plugin-stylus-hexo-config](packages/vite-plugin-stylus-hexo-config/))
- **Markdown**: opt back into the Unified processor (not Astro 7's default Sätteri); [remark-hexo-tag](packages/remark-hexo-tag/) (pure ESM, zero dependencies) handles the 42 Hexo tags, and highlight.js rebuilds the upstream `figure.highlight` DOM for code blocks
- **Navigation**: ClientRouter plus a compatibility shim instead of pjax; front-end JS keeps the `anzhiyu` namespace rather than being rewritten
- **Config**: YAML + zod validation (133 strict top-level keys), same key names as upstream so users can copy their old config directly

Full rationale and trade-offs: [Technical mapping](docs/02-astro-mapping.md).

## Local verification

Requires Node ≥ 22.23.4 (Astro 7):

```bash
pnpm install --frozen-lockfile
pnpm --filter blog build                          # 62-page verification site
node packages/remark-hexo-tag/test/run.mjs        # 59/59 tests
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all   # 48-page structure diff
```

Migrating from a Hexo site:

```bash
node scripts/migrate-hexo.mjs --site <hexo-site-dir> --dry-run      # read-only preview, writes nothing
node scripts/migrate-hexo.mjs --site <hexo-site-dir> --out .migration-out/<name>
```

Usage, known boundaries, and timezone/permalink FAQs: [migration guide](docs/MIGRATION.md).

**Live demo**: <https://mcxiaochenn.github.io/blog/> (GitHub Pages sub-path deployment via [scripts/deploy-demo-pages.mjs](scripts/deploy-demo-pages.mjs); runtime-path features in the upstream JS — music player, search — degrade under a sub-path; page navigation / styles / visuals are unaffected).

## Documents

| Document | Contents |
| --- | --- |
| [Execution plan](docs/PLAN.md) | **The live baseline**: task breakdown, acceptance commands, progress, risk register |
| [Migration guide](docs/MIGRATION.md) | Hexo → Astro site migration: CLI, config key deltas, timezone/permalink FAQs, verification checklist |
| [Upstream analysis](docs/01-upstream-analysis.md) | Upstream structure, six core mechanisms, coupling ranking |
| [Technical mapping](docs/02-astro-mapping.md) | Mechanism-by-mechanism mapping, 6 architecture decisions, verification checklist |
| [Migration plan](docs/03-migration-plan.md) | Initial plan: 7 phases, acceptance criteria, effort estimate, risk table |
| [Upstream delta](docs/upstream-delta.md) | Intentional differences from upstream (U1–U8) |
| [Acceptance notes](docs/notes/) | Real command output and remaining diff attribution per task |

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 0 | Repository skeleton, research and plan | ✅ Done |
| Phase 1 | Build pipeline and config layer (Stylus compat plugin, schema, loader, CI) | ~87% |
| Phase 1.5 | De-risking vertical slice + baseline solidification | ✅ Done |
| Phase 2 | Layout and core pages (home, post, archive, 404, diff tooling) | ~95% |
| Phase 3 | Widgets and page templates (15 aside cards, 12 templates, about) | ~56% |
| Phase 4 | Interactivity (runtime, dark mode, console, script layer) | ~30% (written, behavior verification not started) |
| Phase 5 | Third-party integrations (component library written) | ~8% (not wired) |
| Phase 6 | remark plugin for the 42 Hexo tags | ~87% |
| Phase 7 | Migration tooling and guide, PWA, performance, release | ~18% |

The overall convergence target is all 48 pages passing the HTML structure diff, after which the CI diff step switches from report-only to a hard gate. Per-task status: [PLAN.md](docs/PLAN.md).

## About upstream

- Upstream repository: [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu), actively maintained (as of 2026-11, latest release is 1.7.1)
- Upstream docs: [docs.anheyu.com](https://docs.anheyu.com/)
- Upstream preview: [hexo.anheyu.com](https://hexo.anheyu.com/)

This project is a derivative port — not a patched fork of the upstream repository, and not an official project. Upstream behavior is the reference for feature decisions; differences introduced by the port are documented in the [upstream delta](docs/upstream-delta.md) and other docs.

## License

[GPL-3.0](LICENSE).

Upstream is released under GPL-3.0, and this port keeps the same license. That is a requirement of derivative works, not a choice. Building a blog on top of this project is likewise bound by GPL-3.0.

## Credits

- Theme design: [张洪 Heo](https://github.com/zhheo)
- Upstream development and maintenance: [anzhiyu-c](https://github.com/anzhiyu-c/hexo-theme-anzhiyu)
- Upstream documentation: [xiaoran](https://github.com/xiaoran)
- Earlier origin: [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)
