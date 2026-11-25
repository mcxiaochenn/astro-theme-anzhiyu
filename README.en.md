English · [简体中文](README.md)

# astro-theme-anzhiyu

An Astro port of the [Anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) blog theme.

> **Status: Phase 7 exit (migration complete, 2026-11-24; doc numbers refreshed 2026-11-25).** A real Hexo site (`xcAnzhiyu`, Hexo 7.3.0 + theme 1.6.14) migrates via [scripts/migrate-hexo.mjs](scripts/migrate-hexo.mjs) and builds **97 pages** with `pnpm accept:migration` **migration gap = 0**; the verification site [examples/blog](examples/blog) builds **61 pages** (49-page golden baseline + 12 standalone fixtures — final count per CI build), and the HTML structure diff against the upstream baseline is **49/49 PASS / 0 differences**; CI runs the build + structure-diff hard gate + 38 Playwright behavior cases + Lighthouse budgets + PWA offline cases; all 42 Hexo tags are implemented (65/65 tests). Per-item evidence: [final acceptance report](docs/notes/P7-4-final-acceptance.md) (Chinese); progress and criteria: [execution plan](docs/PLAN.md). The Chinese [README.md](README.md) is the authoritative document.

## Background

Anzhiyu is one of the most feature-complete blog themes in the Hexo ecosystem — 2.5k stars, forked and extended from [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly). Its templates are written in Pug and Stylus, and routing, asset handling and rendering all hang off Hexo's own pipeline. Swapping the build tool essentially means rewriting the theme.

Astro describes UI with components, hands content to content collections, builds with Vite, and ships JavaScript-free output that deploys to any static host. The same UI can be split into standalone components here.

The goal of this repository: carry over the upstream features one by one — not to build a look-alike shell.

## Migration targets

The list below is taken from the upstream README's feature section. **Checked = implemented and verified against the upstream oracle / unit tests**; unchecked = not implemented, or structurally landed but not behavior-verified. Per-item criteria live in [PLAN.md appendix A](docs/PLAN.md) — no self-assessment.

### Content and rendering

- [ ] Multiple code highlighting schemes (the highlight.js `figure.highlight` DOM matches the baseline; engine switching not done)
- [x] Footnote syntax (real footnotes; the intentional difference from upstream's raw output is registered in the diff whitelist)
- [ ] LaTeX math (components wired; missing real-formula site verification)
- [ ] Mermaid diagrams (components wired; missing real-content verification)
- [x] Word count per post (12 helpers verified against upstream JS as oracle)
- [ ] AI post summaries (components wired; real AI service connectivity is a manual step)
- [x] Multi-language configuration (4 dictionaries: default 91 / en 165 / zh-CN 165 / zh-TW 165 entries; 83 check-i18n assertions pass)

### Navigation and interaction

- [x] Lazy-loaded page components (ClientRouter + pjax compatibility shim; CI e2e: zero document requests on in-site navigation, back/forward works, no double-init)
- [ ] Lazy-loaded images / image lightbox (wired; not spot-checked on the real site)
- [x] Dark mode (CI e2e 4 scenarios: first visit follows system / manual toggle / survives refresh / survives navigation; P4-4 fixed ClientRouter resets)
- [ ] Immersive status bar (manual item, mobile screenshots)
- [x] Global control console (CI e2e 5 cases: open/close panel, hide sidebar, panel dark toggle, overlay close)
- [x] Custom context menu (real-site browser walkthrough passed; skipped at runtime when the demo config sets `rightClickMenu.enable=false`)
- [ ] Dynamic accent color from cover (colorthief wired; not separately verified on the real site)
- [ ] Keyboard shortcuts (`#keyboard-tips` help overlay shipped by A5 — emitted when `shortcutKey.enable` is on; shortcuts auto-register when the config gate is on (main.js:1752-1757), the off state is not persisted; no automation yet)
- [x] Rich tag/shortcode options (all 42 Hexo tags implemented, 65/65 tests, 186/186 style hits)

### Comments, analytics and integrations

- [x] Twikoo comment backend (real-site walkthrough renders the comment area with v1.6.44; the other 4 backends are wired, real connectivity is a manual step)
- [x] Search index (`/search.xml` 249,657 B / 22 entries match the source-site golden, compatible with `local-search.js` parsing; search-box click-through not walked yet)
- [ ] 5 analytics, 5 chat widgets, ad slots, privacy consent (wired; real service connectivity is a manual step, keys via env vars)
- [x] Music player (CI e2e verifies the same DOM node persists across ClientRouter navigation; playback progress surviving navigation is verified in the real-browser walkthrough)

### Visuals and assets

- [x] Masonry "moments" feed / masonry photo albums (12 standard page.type templates + the todolist compat page = 13 real paths, CI smoke all pass; migrated `/essay` etc. render fine)
- [x] Alibaba iconfont and Font Awesome (icon fonts ship with theme assets; custom-CDN multi-provider resolution implemented, provider switching not deployment-verified)

### Build and docs

- [x] PWA (`@vite-pwa/astro` 2.0.4 + `sw-rules.js` translation: cacheName simplification / external-CDN allowlist / elemecdn→cbd 3s fallback; precache **81** entries — final count per the CI `precache=N` log; offline-home case in CI; zero impact on the default build)
- [x] Hexo → Astro migration tool and guide ([scripts/migrate-hexo.mjs](scripts/migrate-hexo.mjs) + [docs/MIGRATION.md](docs/MIGRATION.md), real-site migration verified with gap=0)

## Technical choices

Settled against measured upstream data (120 Pug files, 72 Stylus files, 42 custom tags, 133 top-level config keys):

- **Framework**: Astro 7.4 + Vite 8, pnpm workspace monorepo (`packages/*` + `examples/*`)
- **Templates**: Pug → `.astro` components, keeping upstream DOM structure and IDs intact
- **Styles**: Stylus stays. Porting 302 KB of styles costs far more than adding a `hexo-config()` compatibility plugin ([vite-plugin-stylus-hexo-config](packages/vite-plugin-stylus-hexo-config/))
- **Markdown**: opt back into the Unified processor (not Astro 7's default Sätteri); [remark-hexo-tag](packages/remark-hexo-tag/) (pure ESM; one runtime dep: `yaml`) handles the 42 Hexo tags, and highlight.js rebuilds the upstream `figure.highlight` DOM for code blocks
- **Navigation**: ClientRouter plus a compatibility shim instead of pjax; front-end JS keeps the `anzhiyu` namespace rather than being rewritten
- **Config**: YAML + zod validation (strict; 133 upstream keys + the `friends_lite` compat key = 134 total, per `check-schema`), same key names as upstream so users can copy their old config directly

Full rationale and trade-offs: [Technical mapping](docs/02-astro-mapping.md).

## Local verification

Requires Node ≥ 22.23.4 (Astro 7; same floor as the package `engines` `>=22.23.4`):

```bash
pnpm install --frozen-lockfile
pnpm --filter blog build                          # 61-page verification site (49 baseline + 12 fixtures)
node packages/remark-hexo-tag/test/run.mjs        # 65/65 tests
pnpm verify && pnpm compare-vars && pnpm check:upstream-delta
pnpm baseline:extract                             # prerequisite for diff: unpack the golden baseline
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all   # 49-page structure diff (hard gate)
pnpm test:e2e                                     # Playwright behavior cases (run in CI)
```

Migrating from a Hexo site:

```bash
node scripts/migrate-hexo.mjs --site <hexo-site-dir> --dry-run      # read-only preview, writes nothing
node scripts/migrate-hexo.mjs --site <hexo-site-dir> --out .migration-out/<name>
```

Usage, known boundaries, and timezone/permalink FAQs: [migration guide](docs/MIGRATION.md).

**Live demo**: <https://anzhiyu.example.mcxiaochen.top/> (GitHub Pages custom-domain root deployment via [scripts/deploy-demo-pages.mjs](scripts/deploy-demo-pages.mjs); root deployment has no runtime-path degradation).

## Documents

| Document | Contents |
| --- | --- |
| [Execution plan](docs/PLAN.md) | **The live baseline**: task breakdown, acceptance commands, progress, risk register |
| [Migration guide](docs/MIGRATION.md) | Hexo → Astro site migration: CLI, config key deltas, timezone/permalink FAQs, verification checklist |
| [Upstream analysis](docs/01-upstream-analysis.md) | Upstream structure, six core mechanisms, coupling ranking |
| [Technical mapping](docs/02-astro-mapping.md) | Mechanism-by-mechanism mapping, 6 architecture decisions, verification checklist |
| [Migration plan](docs/03-migration-plan.md) | Initial plan: 7 phases, acceptance criteria, effort estimate, risk table |
| [Upstream delta](docs/upstream-delta.md) | Intentional differences from upstream (U1–U9) |
| [Acceptance notes](docs/notes/) | Real command output and remaining diff attribution per task |

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 0 | Repository skeleton, research and plan | ✅ Done |
| Phase 1 | Build pipeline and config layer (Stylus compat plugin, schema, loader, CI) | ✅ Done |
| Phase 1.5 | De-risking vertical slice + baseline solidification | ✅ Done |
| Phase 2 | Layout and core pages (home, post, archive, 404, diff tooling) | ✅ Done (49-page structure diff 0) |
| Phase 3 | Widgets and page templates (15 widget cards: 12 aside + 2 console + 1 newest-comments; 13 templates; about) | ◐ All 12 standard page.type templates + the todolist compat page land in CI smoke; visual walkthrough remainder |
| Phase 4 | Interactivity (runtime, dark mode, console, context menu, music player, ClientRouter) | ◐ e2e 29 passed / 9 skipped (search 2 + context-menu 3 + dark-mode context-menu 1 + music 1 + pwa 2) |
| Phase 5 | Third-party integrations (head 4 + additional-js 10 wired) | ✅ Components wired; real service connectivity is a manual step |
| Phase 6 | remark plugin for the 42 Hexo tags | ✅ 65/65 tests + 186/186 style hits |
| Phase 7 | Migration tooling and guide, PWA, performance, release | ✅ Real-site migration gap=0, PWA/performance landed; only release authorization remains (npm publish / Pages deploy / git tag) |

The overall convergence target is met: all 49 pages pass the HTML structure diff and the CI diff step is a hard gate. Per-task status: [PLAN.md](docs/PLAN.md).

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
