# Batch D 报告 · 验收假绿堵死（D1–D5）

> 执行：agent-10（Batch D · D1–D5 · 验收假绿堵死）
> 范围：`scripts/diff-html.mjs`、`scripts/verify-css.mjs`、`scripts/accept-migration.mjs`、`packages/astro-theme-anzhiyu/scripts/check-loader.mjs`、`.github/workflows/ci.yml`、本报告。
> 约束遵守：零 git 写操作；未跑 astro build / Playwright / Lighthouse；未碰 `examples/blog/src/styles/upstream/**`、`examples/blog/theme.config.yml`；未动 README / PLAN / MIGRATION / 任何文档数字（待 F 清单见 §8）；`scripts/accept-migration.mjs` 未整脚本执行（不在验证白名单），D3/D4 用「%TEMP% 自测载体」跑入库代码的函数级用例（见 §4/§5）。
> 上游只读参照：`D:\Git-project\_research\anzhiyu-upstream`（未做任何写入；D5 的 doctor 试验用 %TEMP% 拷贝）。

## 0. 逐 ID 状态

| ID | 状态 | 改动落点 | 验收结论 |
|---|---|---|---|
| D1 (M6) | **done** | `scripts/diff-html.mjs:1413`（skipReport）、`:1550-1567`（runAll 三分支）、`:1661-1664`（runPair）、`:1475`/头注释（口径）；`.github/workflows/ci.yml:75-83`（skipped 断言步） | 删/缺 baseline → exit 2 ≠ 0 实测 ✓；filter 无命中 → exit 2 ✓；skipReport ok=false ✓；CI 断言行三态实测 ✓ |
| D2 (M9) | **done**（SHA 语义取「显式登记」，见 §7 审查修正 1） | `scripts/verify-css.mjs:49-58`（缺失即 FAIL + 豁免 env）、`:142-152`（SHA REGISTRY / 严格开关） | 删 baseline.json → exit 1 ✓；`VERIFY_CSS_ALLOW_MISSING=1` → exit 0 ✓；SHA 不一致默认登记不红、`VERIFY_CSS_REQUIRE_SHA_MATCH=1` → exit 1 ✓ |
| D3 (M7) | **done** | `scripts/accept-migration.mjs:1688-1765`（checkSearch 重构，前置判断 :1693-1695、:1716） | 「源站启用但产物缺 localSearch」→ gap=1、「缺索引」→ gap=1、「源站未启用」→ SKIP，8 用例自测全绿 ✓ |
| D4 (M8) | **done** | `scripts/accept-migration.mjs:1798-1816`（gap 条件加 `itemMismatch`） | feed 3≠2、sitemap 5≠3 → gap=1 且带 items/goldenItems ✓；相等不误报 ✓ |
| D5 (M1+E3) | **done** | `packages/astro-theme-anzhiyu/scripts/check-loader.mjs:36-47`（路径检查）、`:155-165`（deepEqual 直比断言）；接入 `.github/workflows/ci.yml:54-68` | 43 项全绿 ✓；doctored 单值 → 仅新断言红 exit 1 ✓；defaults 侧单值漂移 deepEqual=false ✓；缺路径清晰报错 exit 1 ✓ |

---

## 1. D1：新退出语义分支表 + 实测 + CI 断言行

### 1.1 分支表（`scripts/diff-html.mjs`，main() 返回值 = exit code）

| 模式 | 情况 | 退出码 | `--json` 输出 |
|---|---|---|---|
| `--all` | 全部 PASS | **0** | `{mode:'all', ok:true, summary, pages}` |
| `--all` | 有 FAIL | **1** | `{mode:'all', ok:false, ...}` |
| `--all` | baseline 目录缺失/非目录 | **2** | `skipReport → {ok:false, skipped:true, reason:'baseline-missing'}` |
| `--all` | baseline.json 缺失/损坏/无 pages 数组或为空 | **2** | `{ok:false, skipped:true, reason:'baseline-json-missing'}` |
| `--all` | `--filter` 无命中 | **2** | `{ok:false, skipped:true, reason:'filter-no-match'}`（原来连 JSON 都不吐，现已吐） |
| pair | baseline 文件缺失 | **2** | `{ok:false, skipped:true, reason:'baseline-missing'}` |
| pair | 全 PASS / 有 FAIL | **0** / **1** | `{mode:'pair', ok, page}` |
| 任意 | 用法错误（未知选项/缺参数/--limit 非法） | **2**（不变） | stderr USAGE |
| 任意 | 执行异常 | **1**（不变） | stderr |

`skipReport` 的 `ok` 不再为 true：`scripts/diff-html.mjs:1413-1417` → `{ mode, ok: false, skipped: true, reason }`。

### 1.2 「删 baseline」实测（两种形态都堵）

**注意**：「%TEMP% 空目录」≠「目录不存在」。空目录是「目录在、文件缺」——走逐页 file-missing 全 FAIL；真删目录才走 skipReport。旧行为的假绿点在**后者**（skip → exit 0），两者现均非零：

```
=== D1a: --all + baseline 目录缺失（%TEMP% 空目录当 BASELINE_HTML_DIR）===
D1a EXITCODE=1
{ "mode": "all", "ok": false, ... "pages": 49, "pass": 0, "fail": 49,
  "categories": { "文件": 49 } }        ← 逐页 file-missing，FAIL 门禁生效

=== D1a2: --all + baseline 目录不存在（真删 .baseline-html 场景）===
D1a2 EXITCODE=2
{ "mode": "all", "ok": false, "skipped": true, "reason": "baseline-missing" }

=== D1b: --all + baseline.json 缺失 ===
D1b EXITCODE=2
{ "mode": "all", "ok": false, "skipped": true, "reason": "baseline-json-missing" }

=== D1c: --all + --filter 无命中 ===
D1c EXITCODE=2
{ "mode": "all", "ok": false, "skipped": true, "reason": "filter-no-match" }

=== D1e: pair 模式 + baseline 文件不存在 ===
D1e EXITCODE=2
{ "mode": "pair", "ok": false, "skipped": true, "reason": "baseline-missing" }

=== D1d2: 自比对照（BASELINE=DIST=.baseline-html，49 页全 PASS）===
D1d2 EXITCODE=0
d2.json: ok=true pages=49 pass=49 fail=0
```

（另：D1d 真基线 vs 本地 dist → `exit=1 / 49 页 0 PASS 367 差异`——本地 dist 是旧构建，缺 `/2024/11/20/24531/` 等重基线新增 fixture 页（`file-missing (dist)` 证据在案），属数据陈旧非退出语义问题；CI 重建后复核，见 §9。）

### 1.3 CI 断言行 diff（`.github/workflows/ci.yml`，diff 步骤之后、artifact 之前）

```diff
         run: node scripts/diff-html.mjs --all --json > diff-report.json
+
+      # D1 (M6)：diff-html 的 skip 报告也算红——「没比对」不允许被读成「全对」。
+      # diff-html 的新退出语义（skip → exit 2）已在上一步挡住；这里是 JSON 层双保险，
+      # 即使上游命令退出码被吞掉（|| true 之类），skipped 报告也过不了这行断言。
+      - name: Assert diff report not skipped
+        if: always()
+        run: |
+          node -e "const fs=require('fs');const f='diff-report.json';if(!fs.existsSync(f)){console.error('diff-report.json 不存在——diff-html 没跑成，不允许假绿');process.exit(1)}let r;try{r=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){console.error('diff-report.json 不是合法 JSON: '+e.message);process.exit(1)}if(r.skipped){console.error('diff-html 比对被跳过 (reason='+(r.reason||'?')+')，不允许假绿');process.exit(1)}if(r.ok!==true){console.error('diff-report ok!==true');process.exit(1)}console.log('diff-report 断言通过: 未跳过且 ok=true')"
```

断言三态实测（同一条 node 命令）：

```
--- 断言 × skip 报告，应红 ---
ASSERT-skip EXITCODE=1
[stderr] diff-html 比对被跳过 (reason=baseline-missing)，不允许假绿
--- 断言 × 全 PASS 报告，应绿 ---
diff-report 断言通过: 未跳过且 ok=true
ASSERT-pass EXITCODE=0
--- 断言 × 有 FAIL 报告，应红 ---
ASSERT-fail EXITCODE=1
[stderr] diff-report ok!==true
```

（`--json` 模式下 `log()` 走 stderr——`scripts/diff-html.mjs:42`——diff-report.json 保持纯 JSON，断言解析不受日志污染。）

---

## 2. D2：两种情况的最终语义 + env 豁免名 + 实测

| 情况 | 最终语义 | 开关 |
|---|---|---|
| baseline.json 缺失 | **默认 FAIL（exit 1）**，不再是「跳过即 0」 | 迁移期豁免：`VERIFY_CSS_ALLOW_MISSING=1`（显式设才跳过 exit 0） |
| SHA-256 不一致 | **显式登记（REGISTRY）不判失败**（默认） | 字节级硬校验：`VERIFY_CSS_REQUIRE_SHA_MATCH=1`（不一致即 FAIL exit 1） |

env 豁免名（任务给定）：`VERIFY_CSS_ALLOW_MISSING=1`。严格开关名：`VERIFY_CSS_REQUIRE_SHA_MATCH=1`。

SHA 为什么没升硬 FAIL（倾向升 FAIL vs 现状，按「先看现状决定」）：当前构建 CSS SHA `aba3d192…` vs baseline `7c1b1ec0…` **本来就不一致**——baseline 是上游 hexo `index.css` 的字节摘要，Astro/Vite 打包产物与其**结构性**不可逐字节相等（`docs/reference/upstream-delta.md:263/432` 同口径：「不追求 SHA 逐字节相等」「不能把 SHA 相等当验收门槛」，验收口径是 ±5% 字节）。升硬 FAIL = `pnpm verify`/CI 永久红。故取「显式登记」+ 严格开关（收敛完成后可开）。记 **审查修正**（§7-1）。

实测：

```
=== D2a: 正常跑（现状 SHA 不一致）→ REGISTRY 登记 + exit 0 ===
D2a EXITCODE=0
[verify-css] PASS 字节数: 实际 684087 / baseline 683218（+0.13%，阈值 ±5%）
[verify-css] PASS gzip 体积: 实际 78768 / baseline 79124（-0.45%，阈值 ±5%）
[verify-css] REGISTRY SHA256 不一致（已显式登记为已知差异，不判失败；硬校验设 VERIFY_CSS_REQUIRE_SHA_MATCH=1）：实际 aba3d192…028af / baseline 7c1b1ec0…07f61
[verify-css] 比对通过

=== D2b: baseline 缺失 → 默认 FAIL ===
D2b EXITCODE=1
[verify-css] FAIL baseline 不存在：C:\...\Temp\d2-no-such-baseline.json — 跳过即假绿，判失败；迁移期豁免需显式 VERIFY_CSS_ALLOW_MISSING=1

=== D2c: baseline 缺失 + VERIFY_CSS_ALLOW_MISSING=1 → 显式豁免跳过 ===
D2c EXITCODE=0
[verify-css] baseline 未就绪，跳过比对（VERIFY_CSS_ALLOW_MISSING=1 显式豁免）

=== D2d: SHA 不一致（doctored baseline）默认登记不红 ===
D2d EXITCODE=0
[verify-css] REGISTRY SHA256 不一致（…）：实际 aba3d192… / baseline 00000000…

=== D2e: 同上 + VERIFY_CSS_REQUIRE_SHA_MATCH=1 → FAIL ===
D2e EXITCODE=1
[verify-css] FAIL SHA256 不一致（VERIFY_CSS_REQUIRE_SHA_MATCH=1 硬校验）：实际 aba3d192… / baseline 00000000…
[verify-css] 比对失败
```

（D2 验收「删 baseline.json 后 `pnpm verify` exit ≠ 0」即 D2b：`pnpm verify` = `node scripts/verify-css.mjs`，exit 1。）

---

## 3. D3：前置判断逻辑 + gap>0 验证

### 3.1 前置判断（file:line，`scripts/accept-migration.mjs`）

- `:1693-1695` — `expectedPath = config?.search?.path || null`；`sourceSearchEnabled = Boolean(expectedPath)`。**源站启用 ⇔ 源站 `_config.yml`（facts.config）配了 `search.path`**（hexo-generator-search 的产物开关；与 `pluginFacts` 的 `searchPath` 口径一致）。
- `:1716-1719` — **SKIP 只留一种**：`!sourceSearchEnabled`（原「首页没有 localSearch → SKIP」假绿点已移除）。
- `:1721-1735` — 源站启用 + 产物缺 `GLOBAL_CONFIG.localSearch` → `migration-gap`（classification `search-index`，url 取源站 `search.path`）。
- `:1737-1752` — 源站启用 + localSearch 在 + 索引文件缺 → `migration-gap`（原逻辑保留）。
- `counts.sourceSearchEnabled` 入证据（`search.counts`），报告 §9 摘要行兼容旧字段。

### 3.2 「源站启用但产物缺」构造用例 → gap>0 验证

accept-migration.mjs 无导出、尾部直接 `main()`（`:2641`），且整脚本不在本地验证白名单——用 **%TEMP% 自测载体**：`node -e` 级临时脚本读入库文件、在 `main().catch(` 处截断、拼上用例壳（函数体与入库版逐字节相同），8 用例结果：

```
[d34] PASS D3-1 源站启用+产物缺 localSearch → gap>0 — gaps=1 status=FAIL detail=源站启用本地搜索（search.path=search.xml）但产物首页没有 GLOBAL_CONFIG.localSearch，配置未迁移
[d34] PASS D3-2 源站启用+localSearch+索引在 → PASS 无 gap — status=PASS gaps=0
[d34] PASS D3-3 源站未启用 → SKIP — status=SKIP note=源站 _config.yml 未启用本地搜索（无 search.path），跳过断言
[d34] PASS D3-4 localSearch 在但索引缺 → gap>0 — gaps=1 detail=localSearch.path=/search.xml 指向的索引文件不存在
[d34] 结果: PASS（通过 8 项，失败 0 项）（含 D4 4 项）
```

---

## 4. D4：条件改动 diff + 条目数不等用例

### 4.1 diff（`scripts/accept-migration.mjs:1798-1816`）

```diff
     rows.push(row)
-    if (!row.exists || row.bytes === 0 || (item.kind !== 'baidu_urls' && row.items === 0)) {
+    // D4：条目数与 golden 不一致也算缺口（golden = 源站最后一次构建参照，迁移前后
+    // feed/sitemap 条目数应一致）；golden 无文件时不比（没有参照，避免误报）。
+    const itemMismatch = row.goldenExists && row.items !== row.goldenItems
+    const emptyItems = item.kind !== 'baidu_urls' && row.items === 0
+    if (!row.exists || row.bytes === 0 || emptyItems || itemMismatch) {
+      const detail = !row.exists ? `产物不存在（…）`
+        : row.bytes === 0 ? '产物为空文件'
+        : emptyItems ? '产物存在但条目数为 0'
+        : `条目数与 golden 不一致（产物 ${row.items} / golden ${row.goldenItems}）`
       check.gaps.push({
         status: 'migration-gap',
         …
+        items: row.items,
+        detail,
```

任务字面条件是 `row.items !== row.goldenItems`；加了 `row.goldenExists` 守卫（golden 缺文件时无参照，避免「产物 5 条 vs golden 0 条」误报），mismatch 对 `baidu_urls` kind 同样生效（任务未排除；条目数=URL 数，golden 为参照）。明细报 `条目数与 golden 不一致（产物 X / golden Y）`。

### 4.2 条目数不等用例（同 §3.2 载体）

```
[d34] PASS D4-1 feed 条目数不等(3≠2) → gap>0 — gaps=1 detail=条目数与 golden 不一致（产物 2 / golden 3）
[d34] PASS D4-2 条目数相等(3=3) → 无 gap — gaps=0 status=PASS
[d34] PASS D4-3 golden 缺文件不比对 → 无 mismatch gap — gaps=0
[d34] PASS D4-4 sitemap 条目数不等(5≠3) → gap>0 — gaps=1 detail=条目数与 golden 不一致（产物 3 / golden 5）
[d34] 结果: PASS（通过 8 项，失败 0 项）
D34 EXITCODE=0
```

---

## 5. D5：deepEqual 断言 + 变红证明 + 路径检查 + 接入点

### 5.1 断言实现（`packages/astro-theme-anzhiyu/scripts/check-loader.mjs:155-165`）

```js
  // D5 (M1)：defaults ↔ 上游直比。上面的「合并结果 vs 上游」是恒真的用户值胜出合并——
  // defaults 值漂移、上游新增键都抓不到（假绿）。这里直接比 defaults 与上游 YAML：
  // 键序无关，值漂移 / 上游新增键 / defaults 多键都会红。
  check(
    `defaults 与上游 _config.yml 直比（${upstreamTopLevelKeys} 个顶层键）`,
    deepEqual(defaults, upstreamDoc),
    'defaults.ts 与上游 YAML 完全一致（值漂移 / 键漂移在此红）',
  )
```

复用文件内已有 `deepEqual`（`:87-102`，对象键序无关）；放用例 a 的「全量深比较」旁。正常跑 43 项全绿（原 42 + 新 1）：

```
[check-loader] PASS defaults 与上游 _config.yml 直比（133 个顶层键） — defaults.ts 与上游 YAML 完全一致（值漂移 / 键漂移在此红）
[check-loader] 结果: PASS（通过 43 项，失败 0 项）
D5-1 EXITCODE=0
```

### 5.2 「故意改一个值会红」证明（两向）

**上游侧单值漂移**（%TEMP% 拷贝 `highlight_copy: true→false` 后 `THEME_UPSTREAM_CONFIG` 指过去跑真脚本——defaults 侧不动，等价于「改 defaults 一个值」的镜像）：

```
D5-3 EXITCODE=1
[check-loader] FAIL defaults 与上游 _config.yml 直比（133 个顶层键） — defaults.ts 与上游 YAML 完全一致（值漂移 / 键漂移在此红）
[check-loader] 结果: FAIL（通过 42 项，失败 1 项）
```

**只有新断言红**（其余 42 项含旧「全量深比较」全绿）——这同时就是 M1 假绿的现场证明：值漂移时旧断言照绿，新断言抓住。

**defaults 侧单值漂移**（%TEMP% 一次性 `node --input-type=module -e`：拷贝 defaults 改一值做同款 deepEqual）：

```
pristine defaults vs upstream: true
defaults 改一值(highlight_copy 取反) vs upstream: false
```

### 5.3 E3 路径检查（`check-loader.mjs:36-47`，与 gen-defaults/check-schema 同款）

报错原文（`THEME_UPSTREAM_CONFIG` 指向不存在路径实测，exit 1）：

```
[check-loader] 上游配置不存在: C:\Users\Mcxiaochen\AppData\Local\Temp\d5-no-such-config.yml
[check-loader] 默认读 _research/anzhiyu-upstream/_config.yml；上游副本在别处时用 THEME_UPSTREAM_CONFIG=<path> 指向真实 _config.yml。
```

### 5.4 接入点：CI（`.github/workflows/ci.yml:54-68`）

任务给的是「`pnpm verify` 或 CI」二选一。取 **CI**，两个原因：
1. **写范围不含根 `package.json`**——不动 `verify` 脚本链（若 Lead 要 `pnpm verify` 串联，见 §8 待 F/后续）；
2. `pnpm verify` 是 CI build job 的既有步骤，串联同样会遇到下条环境问题。

CI checkout 里没有本地那份 `_research` 只读副本（脚本默认路径在 workspace 外），E3 检查会直接报错——所以 CI 侧先按基线 commit 固定取上游真值再跑：

```yaml
      - name: Checkout upstream theme config (pinned 72439d93)
        uses: actions/checkout@v4
        with:
          repository: anzhiyu-c/hexo-theme-anzhiyu
          ref: 72439d93936b63da59a4a1195f64de9f952f6cc1
          path: _research/anzhiyu-upstream

      - name: Check config loader (defaults == upstream _config.yml)
        env:
          THEME_UPSTREAM_CONFIG: ${{ github.workspace }}/_research/anzhiyu-upstream/_config.yml
        run: node packages/astro-theme-anzhiyu/scripts/check-loader.mjs
```

`ci.yml` YAML 解析校验（node + yaml）：build 步骤序 `[… "Guard upstream delta","Checkout upstream theme config (pinned 72439d93)","Check config loader (defaults == upstream _config.yml)","Extract baseline HTML","Diff HTML structure against upstream baseline","Assert diff report not skipped","Upload dist artifact"]`，断言步 run 含 `r.skipped` 检查 ✓。

---

## 6. 验证命令与原始输出尾部

| # | 命令 | 结果 |
|---|---|---|
| 1 | `node scripts/diff-html.mjs --all --json`（BASELINE_HTML_DIR=%TEMP% 空目录） | `EXITCODE=1`，49 页 file-missing 全 FAIL |
| 2 | 同上（BASELINE_HTML_DIR=%TEMP% 不存在路径） | `EXITCODE=2`，`{ok:false,skipped:true,reason:"baseline-missing"}` |
| 3 | 同上（BASELINE_PATH=不存在） | `EXITCODE=2`，`reason:"baseline-json-missing"` |
| 4 | 同上（`--filter zzz-no-such-page`） | `EXITCODE=2`，`reason:"filter-no-match"` |
| 5 | `node scripts/diff-html.mjs <不存在.html> examples/blog/dist/index.html --json`（pair） | `EXITCODE=2`，`{mode:"pair",ok:false,skipped:true}` |
| 6 | 自比对照（BASELINE=DIST=.baseline-html） | `EXITCODE=0`，`ok=true pages=49 pass=49 fail=0` |
| 7 | CI 断言行 node -e × {skip,pass,fail} 报告 | `1 / 0 / 1`（报错原文见 §1.3） |
| 8 | `node scripts/verify-css.mjs` | `EXITCODE=0`，字节 +0.13% / gzip -0.45% PASS，SHA `REGISTRY …` |
| 9 | 同上（BASELINE_PATH=不存在） | `EXITCODE=1`，`FAIL baseline 不存在 …` |
| 10 | 同上 + `VERIFY_CSS_ALLOW_MISSING=1` | `EXITCODE=0`，`跳过比对（…显式豁免）` |
| 11 | 同上（doctored SHA）默认 / `VERIFY_CSS_REQUIRE_SHA_MATCH=1` | `EXITCODE=0`（REGISTRY）/ `EXITCODE=1`（FAIL） |
| 12 | `%TEMP%\d34-selftest.mjs`（D3/D4 8 用例） | `结果: PASS（通过 8 项，失败 0 项）`，`EXITCODE=0` |
| 13 | `node packages/astro-theme-anzhiyu/scripts/check-loader.mjs` | `EXITCODE=0`，`结果: PASS（通过 43 项，失败 0 项）` |
| 14 | 同上（THEME_UPSTREAM_CONFIG=不存在） | `EXITCODE=1`，E3 报错原文（§5.3） |
| 15 | 同上（doctored 上游单值） | `EXITCODE=1`，`结果: FAIL（通过 42 项，失败 1 项）` |
| 16 | `node --input-type=module -e "…deepEqual…"`（defaults 侧单值） | `pristine: true / 改一值: false` |
| 17 | `node scripts/compare-css-vars.mjs`（回归） | `EXITCODE=0`，`严格一致 68 / 顺序差异 1 / 值不一致 0` |
| 18 | `node scripts/check-upstream-delta.mjs`（回归） | `EXITCODE=0`，`校验通过：PASS 29 / SKIP 0 / FAIL 0` |
| 19 | `node -e "…require('yaml').parse(ci.yml)…"`（回归） | 14 build steps 有序、断言步就位 |

（`node scripts/check-upstream-sync.mjs` 未跑：它唯一写操作是 `git fetch`，撞「禁一切 git 写操作」约束。）

## 7. 审查修正 / 实现决策

1. **D2 SHA 语义（审查修正）**：FIXPLAN 倾向「WARN 升 FAIL」，但现状 SHA 与上游结构性不一致（实测 `aba3d192…` vs `7c1b1ec0…`，验收口径本就是 ±5% 字节，`docs/reference/upstream-delta.md:263/432` 明文不把 SHA 相等当门槛）——升硬 FAIL 会让 `pnpm verify`/CI 永久红。按任务「先看现状决定」取「显式登记（REGISTRY）+ `VERIFY_CSS_REQUIRE_SHA_MATCH=1` 严格开关」，硬语义可随时启用。**以代码/现状为准，此处记录修正。**
2. **D1 pair 模式同改 exit 2**（超出「--all」字面）：`skipReport ok:false` 与 pair `exit 0` 自相矛盾，「跳过即通过」正是本批要堵的假绿；CI 只用 `--all`，无行为影响面。
3. **空目录 ≠ 缺目录**：任务给的「%TEMP% 空目录」构造走的是「逐页 file-missing → exit 1」路径；真正的「删 baseline」假绿点在目录不存在（旧行为 exit 0）——两种形态都补测且都非零（§1.2）。
4. **D3 detail 去掉写死页数**：原 gap 明细「（当前 94 页产物无本地搜索索引）」是特定一次运行的数字，写死在代码里换个产物就错——改为不带页数的 `localSearch.path=… 指向的索引文件不存在`（代码内字符串，非文档）。
5. **D4 加 `goldenExists` 守卫 + baidu_urls 不排除**（§4.1）。
6. **D5 接 CI 不接 `pnpm verify`**（§5.4）：写范围无根 `package.json`；且 CI 无 `_research` 副本，加了 pinned 上游 checkout 供给真值。

## 8. 待 F 同步清单（文档数字/文字，本批一律未动）

| # | 位置 | 待同步内容 |
|---|---|---|
| 1 | `README.md:156` 本地验证清单 | 补 `pnpm baseline:extract` 前置步骤（D1 任务原文指定留 F）；同处「48 页结构 diff」→ 49 页口径（golden 已重基线 49 页） |
| 2 | `examples/blog/README.md:3`、`:34` | 「48 页基线」→ 49 页；命令块是否同样补 `pnpm baseline:extract` 前置 |
| 3 | `docs/plan/PLAN.md:711` 等 | 「结构 diff 48/48 PASS 0」→ 49 页口径（全仓「48/48」表述一并盘） |
| 4 | `docs/reference/upstream-delta.md:263/432`（如需） | verify-css 新语义口径（REGISTRY 显式登记 + `VERIFY_CSS_REQUIRE_SHA_MATCH` / `VERIFY_CSS_ALLOW_MISSING`）可在登记表补一句；现文字与本决策不冲突 |
| 5 | README/PLAN（如需） | `diff-html` 新退出码口径（skip/前提缺失 → exit 2）与 `pnpm verify` 新 FAIL 语义的文字化；grep 未见「baseline 不存在 → 0」旧表述，改动面待 F 统一盘 |

## 9. 待 CI 验证清单

| # | 项 | 说明 |
|---|---|---|
| 1 | build job 全绿（含两个新步骤） | `Check config loader (defaults == upstream _config.yml)` 与 `Assert diff report not skipped` 首跑验证；`actions/checkout@v4` 拉外部公开仓库 pinned SHA 的可行性首跑确认 |
| 2 | diff-html 49 页 0 差异复核 | 本地 dist 过旧（缺 `/2024/11/20/24531/` 等重基线新增页，见 §1.2 注），CI 重建后 `diff-html --all` 应 49/49 PASS；若有真实差异按缺口修，不回退退出语义（FIXPLAN D 系列约定） |
| 3 | skip 断言行 CI 实况 | 断言本地三态已测；CI 上验证 `if: always()` 与 artifact 步骤的交互 |
| 4 | D2 新语义对 CI `pnpm verify` 零影响确认 | baseline.json 在仓库里，缺失分支不触发；SHA 登记不改变绿红 |
| 5 | accept-migration 真实站全量跑 | D3/D4 会让「源站启用但产物缺搜索」从 SKIP 变 FAIL、feed/sitemap 条目数不等计入 gap——预期暴露真实缺口（gap>0 → exit 1），按缺口修不回退；本地不跑（不在验证白名单） |
| 6 | e2e / lighthouse 两 job 不受影响确认 | 本批未动其配置，CI 整体过一遍 |
