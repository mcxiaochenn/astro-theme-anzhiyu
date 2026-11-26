# Batch E · 依赖与工程门槛 — 修复报告

> 执行：agent-4（Batch E · E1–E5）｜日期：2026-11-25｜基准 HEAD `eb3f493`
> 范围：`packages/remark-hexo-tag/package.json`、`scripts/gen-defaults.mjs`、`scripts/check-schema.mjs`、根 `package.json`、`packages/astro-theme-anzhiyu/package.json`、`.gitignore`、本报告。
> 约束遵守：零 git 写操作；未跑 build/Playwright/Lighthouse/npm pack；未碰 `src/styles/upstream/**`、`theme.config.yml`、`check-loader.mjs`（D5 所有）及任何范围外文件。

## 0. 状态总览

| ID | 状态 | 摘要 |
|---|---|---|
| E1 (H6) | **done** | `remark-hexo-tag` 声明 `"yaml": "^2.9.1"`；包目录 `import('yaml')` 实测可解析。npm pack / tarball 安装两条验收 → 待 CI 验证（本地验证白名单不含 npm 命令） |
| E2 (M22) | **done** | 两处 engines 统一 `">=22.23.4"`；与 README「Node ≥ 22.23.4」口径相符 |
| E3 (L1) | **done** | gen-defaults / check-schema 增加上游配置存在性检查（明确报错 + 提示 `THEME_UPSTREAM_CONFIG`）；zod 版本解析改 Node 标准解析链，不再拼 `../../node_modules`。check-loader.mjs 同款改动归 D 批，未动 |
| E4 (L14) | **done** | `@playwright/test` 与 `playwright` 均钉精确 `1.65.1` |
| E5 (L15) | **done** | `.gitignore` 补 `playwright-pwa-report/`、`test-results-pwa/`、`.lighthouseci/` |

修改文件（`git status --porcelain` 实测，仅写范围内 6 个 + 本报告）：

```
 M .gitignore
 M package.json
 M packages/astro-theme-anzhiyu/package.json
 M scripts/check-schema.mjs
 M scripts/gen-defaults.mjs
 M packages/remark-hexo-tag/package.json
```

---

## 1. E1：package.json diff（dependencies 段）+ yaml 可解析证明

**diff（`packages/remark-hexo-tag/package.json`）**：

```diff
   "scripts": {
     "test": "node test/run.mjs"
   },
+  "dependencies": {
+    "yaml": "^2.9.1"
+  },
   "keywords": [
```

落点：`packages/remark-hexo-tag/package.json:17-19`：

```json
  "dependencies": {
    "yaml": "^2.9.1"
  },
```

依据：`src/plugins/remark-hexo-tag/tags/thirdparty/index.mjs:20` `import { parse as parseYaml } from 'yaml'`（flink tag 解析 YAML 正文），此前未声明依赖，仅靠 `vite-plugin-stylus-hexo-config` 传递 + `node-linker=hoisted` 蒙混。

**import 验证**（在 `packages/remark-hexo-tag/` 目录执行，node -e 等价形式）：

```console
> node --input-type=module -e "const m = await import('yaml'); console.log('import yaml OK; typeof m.parse =', typeof m.parse); console.log('resolved at:', import.meta.resolve('yaml'))"
import yaml OK; typeof m.parse = function
resolved at: file:///D:/Git-project/astro-theme-anzhiyu/node_modules/yaml/dist/index.js
EXIT=0
```

**manifest 断言**（等价于「npm pack 清单含 dependencies」——npm pack 原样打包 package.json，其 dependencies 段随之进 tarball）：

```console
> node -e "...读三个 package.json 断言..."
remark-hexo-tag dependencies = {"yaml":"^2.9.1"}
remark-hexo-tag yaml pin = ^2.9.1
EXIT=0
```

> 诚实标注：本机是 hoisted 布局，yaml 挂在根 `node_modules`，上述 import 证明在**改动前**同样能过——它证明的是「包目录可解析」。声明 dependencies 的真正生效点是发布后 `npm install remark-hexo-tag` 会为其装上 yaml（外网独立安装场景），该场景属「待 CI 验证」清单第 1 条。

## 2. E2：两处 engines 最终值 + 与 README 的出入清单

改前实态（审查修正节点②）：两处 engines **都**是 `">=22"`，README 已写「≥ 22.23.4」——即 engines 一致地低于 README 口径。按 FIXPLAN 二选一取前者（engines 统一 `">=22.23.4"`）：

| 位置 | 最终值 |
|---|---|
| `package.json:7`（根） | `"node": ">=22.23.4"` |
| `packages/astro-theme-anzhiyu/package.json:28` | `"node": ">=22.23.4"` |

实测断言：

```console
root engines.node = ">=22.23.4"
theme engines.node = ">=22.23.4"
engines match: true
```

**与 README 现描述的出入清单（留给 F）**：

| 文档位置 | 现文 | 出入 |
|---|---|---|
| `README.md:149` | 「需要 Node ≥ 22.23.4（Astro 7 要求）」 | 无数字出入（与新 engines 相符）；F 复核措辞即可 |
| `README.en.md:70` | "Requires Node ≥ 22.23.4 (Astro 7):" | 同上 |
| `examples/blog/README.md:21` | 「需要 Node ≥ 22.23.4（Astro 7 要求）」 | 同上（examples 侧同句） |
| `docs/guides/MIGRATION.md:16` | 「24（仓库 `engines: >=22`，本轮实测 24.22.0）」 | **真出入**：引述的 `engines: >=22` 过时，F 改 `engines: >=22.23.4` |

## 3. E3：缺失上游配置的报错原文 + zod 解析改法

**模拟方式**（按任务卡）：`THEME_UPSTREAM_CONFIG` 指向不存在路径。

`gen-defaults.mjs`（报错原文，无 ENOENT 栈）：

```console
> $env:THEME_UPSTREAM_CONFIG='D:\nonexistent-no-research\_config.yml'; node scripts/gen-defaults.mjs
[gen-defaults] 上游配置不存在: D:\nonexistent-no-research\_config.yml
[gen-defaults] 默认读 _research/anzhiyu-upstream/_config.yml；上游副本在别处时用 THEME_UPSTREAM_CONFIG=<path>（或第一个命令行参数 [configPath]）指向真实 _config.yml。
EXIT=1
```

`check-schema.mjs`（同环境续跑，报错原文）：

```console
> $env:THEME_UPSTREAM_CONFIG='D:\nonexistent-no-research\_config.yml'; node scripts/check-schema.mjs
[check-schema] 上游配置不存在: D:\nonexistent-no-research\_config.yml
[check-schema] 默认读 _research/anzhiyu-upstream/_config.yml；上游副本在别处时用 THEME_UPSTREAM_CONFIG=<path>（或第一个命令行参数 [configPath]）指向真实 _config.yml。
EXIT=1
```

存在性检查落点：

- `scripts/gen-defaults.mjs:28-33`（`if (!existsSync(configPath))` → 两行 `console.error` → `process.exit(1)`）；`existsSync` 并入 :13 的 `node:fs` import。
- `scripts/check-schema.mjs:34-40`（同构）；`existsSync`/`createRequire` 并入 :18-19。

**zod 解析路径改法**（`check-schema.mjs:64-68`，原 :55-57 是 `resolve(PKG_ROOT, '../../node_modules/zod/package.json')` 硬拼 hoisted 布局）：

```js
// zod 版本用 Node 标准解析链定位（hoisted / symlink 布局都能解析），不拼 ../../node_modules。
const require = createRequire(import.meta.url);
const zodVersion = JSON.parse(
  readFileSync(require.resolve('zod/package.json'), 'utf8'),
).version;
```

即：`createRequire(import.meta.url).resolve('zod/package.json')` —— 从脚本自身位置走 Node 标准 `node_modules` 解析链（hoisted、pnpm symlink 布局均可），且 zod 的 exports 显式导出 `"./package.json"`（`node_modules/zod/package.json:59`），子路径解析合法。happy path 实测：`[check-schema] zod version: 4.6.7`，整脚本 PASS（输出见 §6）。

> gen-defaults.mjs 本身不用 zod（只用 yaml），zod 改法只涉及 check-schema.mjs。check-loader.mjs:32-34 的同款路径模式按任务卡留给 D 批（D5），本批未动。

## 4. E4：改后两行版本字符串

`package.json:23-24`（根）：

```json
    "@playwright/test": "1.65.1",
    "playwright": "1.65.1"
```

（原 `"playwright": "^1.65.1"` → 精确 `1.65.1`，与 `@playwright/test` 同串。断言 `playwright pin match: true`，见 §6。）

## 5. E5：.gitignore diff

```diff
 # Playwright e2e（CI 上传 artifact；本地产物不进仓库）
 playwright-report/
 test-results/
 blob-report/
+playwright-pwa-report/
+test-results-pwa/
+.lighthouseci/
```

落点：`.gitignore:62-64`。

## 6. 验证命令与原始输出

| # | 命令 | 结果 |
|---|---|---|
| 1 | `node tests/remark-hexo-tag/run.mjs` | 62/62，EXIT=0 |
| 2 | `node --input-type=module -e "import('yaml')…"`（包目录） | 可解析，EXIT=0 |
| 3 | `node -e` manifest/engines/pin 断言 | 全部相符，EXIT=0 |
| 4 | `THEME_UPSTREAM_CONFIG=<不存在> node …/gen-defaults.mjs` | 清晰报错，EXIT=1 |
| 5 | `THEME_UPSTREAM_CONFIG=<不存在> node …/check-schema.mjs` | 清晰报错，EXIT=1 |
| 6 | `node scripts/check-schema.mjs`（真上游配置 happy path） | PASS，EXIT=0 |
| 7 | `node scripts/check-upstream-delta.mjs` | PASS 29 / SKIP 0 / FAIL 0，EXIT=0 |
| 8 | `git diff` / `git status --porcelain`（只读） | 仅 6 个范围内文件被改 |

输出尾部（原样）：

```console
# 1) 单测（尾部；前面的 Error 栈是负例用例的预期输出）
remark-hexo-tag: 62/62 通过
EXIT=0

# 3) node -e 断言
root engines.node = ">=22.23.4"
theme engines.node = ">=22.23.4"
engines match: true
root @playwright/test = "1.65.1"
root playwright = "1.65.1"
playwright pin match: true
remark-hexo-tag dependencies = {"yaml":"^2.9.1"}
remark-hexo-tag yaml pin = ^2.9.1
EXIT=0

# 6) check-schema happy path（尾部）
[check-schema] zod version: 4.6.7
[check-schema] yaml top-level keys: 133
[check-schema] schema declared top-level keys: 134
[check-schema] unknown keys: 0
[check-schema] declared but absent in yaml: friends_lite
...
[check-schema] PASS 错误信息含完整键路径 theme_color.main
[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）
EXIT=0

# 7) upstream-delta 守卫（尾部）
[check-upstream-delta] PASS baseline 工作区 hexo 钉死 7.3.0（声明 + CLI 块 + 实际安装）

[check-upstream-delta] 校验通过：PASS 29 / SKIP 0 / FAIL 0
[check-upstream-delta] 登记表：docs/reference/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）
EXIT=0
```

（§1/§3 的完整输出已贴在对应条目下。gen-defaults 的 happy path **有意不跑**：成功路径会重写 `src/config/defaults.ts`，该文件不在本批写范围；其解析逻辑本次仅加了前置存在性守卫，未改动。）

## 7. 「待 F 同步清单」（README 的 E1/E2 文案位置）

文档数字口径本批一律未动（约束 7）。以下文案位置给 F 批收口（格式：原文位置 → 目标口径）：

**E1（remark-hexo-tag 依赖如实描述）**

1. `README.md:67` 「…用 [remark-hexo-tag](../../../packages/remark-hexo-tag/)（纯 ESM、零依赖）承接…」→ 「纯 ESM，唯一运行时依赖 `yaml`（^2.9.1）」（去「零依赖」）
2. `README.en.md:62` "(pure ESM, zero dependencies)" → "(pure ESM; one runtime dep: yaml)" （同款英文改写）
3. 附带过时文本（同根因，建议 F 顺带）：`packages/remark-hexo-tag/README.md:63-65` 「用工作区已有的 `yaml` 包解析…**不是本插件新增的依赖**」→ 改「本包已声明 `yaml` 依赖」；`src/plugins/remark-hexo-tag/tags/thirdparty/index.mjs:13-15` 注释同款表述（代码注释，超本批写范围）

**E2（engines / Node 版本描述）**

4. `README.md:149` 「需要 Node ≥ 22.23.4（Astro 7 要求）」→ 数字不用改（与新 engines 相符）；可注明「与包 `engines`（>=22.23.4）同限」
5. `README.en.md:70` "Requires Node ≥ 22.23.4 (Astro 7):" → 同上
6. `examples/blog/README.md:21` 「需要 Node ≥ 22.23.4（Astro 7 要求）」→ 同上
7. `docs/guides/MIGRATION.md:16` 「仓库 `engines: >=22`」→ 「仓库 `engines: >=22.23.4`」（唯一数字真出入）

## 8. 待 CI 验证清单

| # | 验收点 | 为什么本地不做 |
|---|---|---|
| 1 | E1：独立目录安装 tarball 后 `import('yaml')` 成功（`npm pack` + `npm i *.tgz`） | npm 命令不在本地验证白名单（约束 2）；发布流程 / CI 可实跑 |
| 2 | E1：`npm pack` 清单含 `package.json` dependencies | 同上（已用 manifest 断言等价证明：npm pack 原样打包 package.json） |
| 3 | E5：本地跑 PWA e2e / lhci 后 `git status` 干净 | 需 Playwright / Lighthouse，本地禁跑；条目已在 .gitignore:62-64 |
| 4 | CI 三 job（build / e2e / lighthouse）全绿 | 本批改了 engines 与依赖声明，须由 CI 整体过一遍 |

## 9. 审查修正节点（FIXPLAN 与代码实态的差异，按代码语义执行）

1. **E3 位置范围**：FIXPLAN E3 列了 `check-loader.mjs`，任务卡明确其同款改动归 D 批（D5）——本批只动 gen-defaults.mjs 与 check-schema.mjs，check-loader.mjs 一行未碰（其 :32-34 路径模式保持原样）。
2. **E2 改前实态**：不是「两处 engines 互相不一致」，而是两处一致地写 `">=22"`、低于 README 的「≥ 22.23.4」口径（astro@7.4.13 自身 engines 为 `>=22.23.4`，见 `docs/notes/phases/P1-10-ci.md:324`）。按任务卡把两处统一为 `">=22.23.4"` 后与 README 相符，README 侧无需改数字。
3. **E1 连锁文本**：`src/tags/thirdparty/index.mjs:13-15` 与 `packages/remark-hexo-tag/README.md:63-65` 的「yaml 不是本插件新增依赖」在 E1 后过时；两者均在本批写范围之外，已登记进 §7 待 F 清单。

## 10. 遗留事项（需要 Lead 决策/接力）

1. **pnpm-lock.yaml 未同步（重要）**：E1 给 `remark-hexo-tag` 新增依赖、E4 把 `playwright` spec 从 `^1.65.1` 收成 `1.65.1`，两者都会让根 `pnpm-lock.yaml` 与 package.json 失配；CI 三处 `pnpm install --frozen-lockfile`（`.github/workflows/ci.yml:37/105/185`）在 lockfile 刷新前会报 `ERR_PNPM_OUTDATED_LOCKFILE`。`pnpm-lock.yaml` 不在本批写范围（约束 3）**未动**——请 Lead 在合并前跑一次 `pnpm install` 刷新 lockfile 一并提交（B6 给 examples/blog 加 yaml 后同理）。
2. gen-defaults happy path 未本地复跑（避免写范围外的 `defaults.ts`）；如需字节级回归确认，可在 CI 或授权后本地跑 `node scripts/gen-defaults.mjs` 比对 git diff 应为空。
