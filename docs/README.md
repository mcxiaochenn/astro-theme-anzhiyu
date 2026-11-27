# 文档索引

hexo-theme-anzhiyu 1.7.1 → Astro 迁移项目的全部文档，按用途分类。

| 目录 | 内容 | 入口 |
| --- | --- | --- |
| [analysis/](analysis/) | 上游调研与技术映射（背景与决策记录） | [01 上游调研](analysis/01-upstream-analysis.md) · [02 技术映射](analysis/02-astro-mapping.md) |
| [plan/](plan/) | 执行计划与修复计划 | [PLAN](plan/PLAN.md)（v2 彻底 Astro 化重构基线）· [04-legacy-port-plan](plan/04-legacy-port-plan.md)（v1 移植归档）· [FIXPLAN](plan/FIXPLAN.md) · [03 初版计划](plan/03-migration-plan.md) |
| [guides/](guides/) | 面向使用者的操作指南 | [Hexo 迁移指南](guides/MIGRATION.md) |
| [reference/](reference/) | 登记表、政策与基准数据 | [上游差异登记](reference/upstream-delta.md) · [资源路径政策](reference/resource-path-policy.md) · [baseline.json](reference/baseline.json) |
| [notes/](notes/) | 工作记录（历史归档） | 见下 |

## 速查

- **把 Hexo 站迁过来** → [guides/MIGRATION.md](guides/MIGRATION.md)（脚本怎么跑、哪些要人工收尾）
- **和上游差在哪、为什么这么处理** → [reference/upstream-delta.md](reference/upstream-delta.md)（U1…U11 + N1…N26 全量登记）
- **项目做到哪了** → [plan/PLAN.md](plan/PLAN.md)
- **审查问题修了没** → [plan/FIXPLAN.md](plan/FIXPLAN.md) + [notes/fixes/FIX-2026-11-25.md](notes/fixes/FIX-2026-11-25.md)
- **上游出新版要不要跟** → [reference/upstream-delta.md](reference/upstream-delta.md) §8（季度同步流程）

## reference/ 里的机器数据

`baseline.json` 与 `upstream-delta.md` 不只是文档：`verify-css` / `compare-vars` / `diff-html` / `check:upstream-delta` / `check:upstream-sync` 会直接读它们（基准字节数、锚点 JSON）。改这两个文件前先看 `check:upstream-delta` 的守卫规则，改完跑一遍门禁。

## notes/ 工作记录

历史归档：保留当时的实测数字与结论，过期处以文件头「历史快照」头注或勘误节为准，**不逐处改写**。现行数字口径见 [notes/fixes/FIX-2026-11-25.md](notes/fixes/FIX-2026-11-25.md)。

| 目录 | 内容 | 命名 |
| --- | --- | --- |
| [notes/phases/](notes/phases/) | PLAN 各阶段的执行报告 | `P<阶段>-<任务>.md` |
| [notes/fixes/](notes/fixes/) | FIXPLAN 批次与专项修复记录 | `fix-batch-*.md` / `FIX-*.md` / `fix-*.md` |
| [notes/topics/](notes/topics/) | 专题调查（基线 CI、日期对齐、上游差异报告、文档勘误） | `P-<专题>.md` |

## 2026-11-26 目录重组对照

重组只动目录、文件名未改，全仓引用已同步更新。手动存过旧路径的按此对照：

| 旧路径 | 新路径 |
| --- | --- |
| `docs/PLAN.md` · `docs/FIXPLAN.md` · `docs/03-migration-plan.md` | `docs/plan/` |
| `docs/01-upstream-analysis.md` · `docs/02-astro-mapping.md` | `docs/analysis/` |
| `docs/MIGRATION.md` | `docs/guides/` |
| `docs/upstream-delta.md` · `docs/resource-path-policy.md` · `docs/baseline.json` | `docs/reference/` |
| `docs/notes/P1-*` … `P7-*`（阶段报告） | `docs/notes/phases/` |
| `docs/notes/fix-*` · `docs/notes/FIX-*` | `docs/notes/fixes/` |
| `docs/notes/P-baseline-html-ci.md` 等 4 份专题 | `docs/notes/topics/` |
