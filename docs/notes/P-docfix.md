# P-docfix 交接说明（Phase 1.5 回填 + D9 勘误）

- 执行人：p-docfix（组员）
- 执行时间：2026-11-23（Asia/Shanghai）
- 任务：文档回填与勘误，不写代码
- 写范围：`docs/02-astro-mapping.md`、`docs/notes/P1-5-full-style-build.md`、本文件

## 1. 改了哪几处

### docs/02-astro-mapping.md

| 位置 | 改动 |
| --- | --- |
| §5 待验证清单（L226–239） | 3/4/5/6/8 从「待验证」→「✅ 通过」，每行一句结论并注明「详见 §6.8」；抬头改写为 Phase 1（#1/#2）与 Phase 1.5（#3/#4/#5/#6/#8）两批验证说明；#7 标「待验证（Phase 7）」 |
| 新增 §6.8（L330–352） | 「Phase 1.5 实测记录（2026-11-23）」：五项结论表 + 附加结论（document 请求 0 / pjax.loadUrl shim / pjax:complete 每次补发）+ 三个前提（`html[data-theme]` 运行时契约、监听幂等、`data-astro-rerun`）+ 环境限制（Playwright 被沙箱阻断，wincu 真实 Edge + 页内 harness，54/54 断言） |
| 原「## 6. 不做什么」（L354） | 编号改为「## 7. 不做什么」。原文有两个 §6，不加处理会出现「6.8 → 6」自相矛盾；未改任何 ADR 原文，未动 §6.1–§6.7 |

注：Phase 1.5 按任务要求落在 **§6.8**，暂不改 §6 标题「Phase 1 实测记录（2026-11-23）」，以免破坏 `packages/vite-plugin-stylus-hexo-config/README.md` 里指向 `#6-phase-1-实测记录2026-11-23` 的锚点；若后续想把标题改成「Phase 1 / Phase 1.5 实测记录」，需同步改那条 README 链接。

### docs/notes/P1-5-full-style-build.md

| 位置 | 改动 |
| --- | --- |
| 结论速览（L24） | 加「勘误提示」blockquote：点明 §6.4/§8.1/§9 的「当假」结论被推翻、+3554 B 归因需拆分，过期句已加删除线，以文末「## 勘误」为准 |
| §6.3 结论句（L180） | 追加勘误括注：−228 B 残差来自 `@css{}` 字面量内「逗号 + 换行」折叠（原文「不是换行差异」的说法需修正） |
| §6.4（L182–186） | 两句错误原文加删除线（「当假」/「来源尚未定位」），紧随一段「勘误（2026-11-23 追加）」写明实测为**真** |
| §8.1 / §9（L213、L227、L229） | 遗留问题 1、判据 5、观察项条目加删除线 + 「已定位」更正 |
| 文末新增「## 勘误」（L280–317） | 勘误 1（当假→当真：最小复现输出、根因 = Hexo `.define()` 层未复刻、登记 U3、修复 P1-11）；勘误 2（字节闭环 `683218 + 3782 − 228 = 686772`）；勘误 3（§8.1/§9 的「未定位」已关闭） |

## 2. 依据

- Phase 1.5 结论与证据：`docs/notes/P1.5-vertical-slice.md`（54/54 PASS、五项假设、三个前提、环境限制）
- D9 定位与字节闭环：`docs/upstream-delta.md` U3 / U6、`docs/notes/P-upstream-delta.md` §2
- 任务登记：`docs/PLAN.md` §1.4 D9、§4 P1-11、附录 C

## 3. 校验

- 未动 ADR-001…006 原文；未动代码、配置、上游镜像。
- 锚点：`packages/vite-plugin-stylus-hexo-config/README.md` 指向 `#6-phase-1-实测记录2026-11-23` 仍有效（§6 标题未改）；`docs/03-migration-plan.md` 指向 `#5-待验证清单` 仍有效（§5 标题未改）。
- `git status --short` 里本任务只产生两处修改（上述两份文档，本文件为新增未跟踪）；工作区同时存在 `packages/vite-plugin-stylus-hexo-config/src/index.mjs` 的并发改动，**不是本任务产出**（疑似 P1-11 正在实施）。

## 4. 发现的超出写范围的文档不一致（未改，供后续任务处理）

1. `docs/02-astro-mapping.md` ADR-003「风险」段仍写「整 body 替换意味着 `#web_bg`、`#an_music_bg` 这类全局背景元素会被重建……可能需要把音乐播放器改成持久化的独立层」——P1.5 实测 persist 下同一 DOM 节点、音频不中断，独立持久层**不需要**。ADR 按指令冻结，但 PLAN §1.4 目前只登记了 ADR-002（D1），ADR-003 这条没有对应债务条目。
2. `docs/02-astro-mapping.md` §1 映射总表「`_config.yml` 200 键」与 U2 实测 133 顶层 / 662 递归键矛盾——`upstream-delta.md` U2 明确「01/02/03 历史调研文档不回改」，属已知保留，引用时以 PLAN / 本表为准。
3. `docs/PLAN.md` P1.5-6 验收写「**4 项**状态从『待验证』变『通过/改方案』」，但 Phase 1.5 实际验了 **5 项**（#3/#4/#5/#6/#8），PLAN §Phase 1.5 与附录 C 均是 5 项——数字应为 5。
4. `docs/03-migration-plan.md:211` 仍写「跑通 8 项待验证清单」，现在只剩 #7 待 Phase 7；属 Phase 1 时代的历史计划表述。
5. `docs/notes/P-upstream-delta.md` §5 文档债：#1（「PLAN D9 仍写未定位/当假」）已随 PLAN 更新失效；#3（「P1-5 §6.4/§8.1 过期」）已被本次勘误解决——该两行可以清掉。
6. `docs/notes/P1.5-vertical-slice.md` §6.3 第 8 条「文档同步…建议由 Lead 或下一任务执行」已完成，报告自身无需改（历史归档）。
7. P1-11 完成后产物预期从 686772 → 682990 B（−0.033%），届时 P1-5 报告的 §1/§2/§9 数值记录会再次过期；建议 P1-11 完成时同步更新 P1-5 数值或再补一次勘误（本轮写范围外，属 P1-11 任务）。注：本轮收尾时工作区已有 `packages/vite-plugin-stylus-hexo-config/src/index.mjs` 的并发改动，疑似 P1-11 正在实施。

## 5. 最后一句

两份文档已与实测一致：`02-astro-mapping.md` 的待验证清单与 §6.8 反映 Phase 1.5 五项通过 + 三个前提 + 环境限制；`P1-5-full-style-build.md` 的「未定义变量当假」错误已在原处标注并出勘误，+3554 B 归因已按 upstream-delta 的字节闭环更正为 prismjs +3782 B − `@css{}` 排版 228 B。
