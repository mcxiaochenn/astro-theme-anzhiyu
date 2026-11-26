# P-baseline HTML 归档进仓库 + CI 接线

- 执行人：p-baseline-ci（组员）
- 执行时间：2026-11-23（Asia/Shanghai）
- 任务：把上游基线 HTML 归档进仓库并接进 CI，解决「CI 里没有 `.baseline-work/`，`diff-html` 只能 skip」
- 写范围：`tests/baseline-html/`（归档 + 生成器 + manifest + README）、`scripts/extract-baseline-html.mjs`（新增）、`.github/workflows/ci.yml`、`.gitignore`、根 `package.json`（scripts）、本文件
- 相关：`scripts/diff-html.mjs`（P2-13，**本次一行未改**）、`docs/reference/baseline.json`（48 页清单 + 逐页 SHA256）、`docs/notes/phases/P2-13-diff-html.md` §10（本任务就是它的方案落地）

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| 归档 | `tests/baseline-html/baseline-html.tar.gz`：**48 个 HTML / 2,198,761 字节 → 488,029 字节**，SHA256 `b17a4f23…e979c0` |
| 归档约定 | 只含 `.html`；归档内路径 = 相对 `.baseline-work/public` 的路径；解压根目录 = `BASELINE_HTML_DIR` |
| 可复现 | 生成器确定性（排序 + 固定 mtime/uid/gid + gzip 不写 mtime），重复生成 SHA256 不变（实测） |
| extract | `node scripts/extract-baseline-html.mjs` → `.baseline-html/`，48 文件 / 2,198,761 字节；幂等；整包 + 逐文件 SHA256 校验；负向用例全部清晰报错 exit 1 |
| 与 diff 工具适配 | **没改 `diff-html.mjs`**。`BASELINE_HTML_DIR=.baseline-html` 即可；正对照（同一目录比自身）48/48 PASS |
| CI | build 之后、artifact 上传之前加 2 步；`diff-report.json` 进 artifact；Phase 2 期间 `|| true` 只出报告 |
| 自测 | 解压 48 文件；`diff --all` = **48 页 / PASS 0 / FAIL 48 / 差异共 113 条**（缺 1058 / 多 30 节点）——这是 Phase 2 起点数据，不是接线坏了（见 §5.6） |
| ⚠️ 需要你知道 | 归档**不是 ~23 KB，是 477 KB**。组长此前「粗略版本 23 KB」实测只打了顶层 2 个文件（见 §1.1）。477 KB 仍可直接进仓库，但比决策时预估大 20 倍 |

## 0.1 必须回答的 6 个问题 → 本文位置

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 归档怎么生成、文件数/原始字节/归档字节/SHA256 | §1 |
| 2 | extract 的目录约定与幂等性证据 | §2 |
| 3 | CI 改动的 diff 片段 | §4 |
| 4 | 自测完整输出（解压数、PASS/FAIL/差异数） | §5 |
| 5 | 本地开发怎么用 | §6 |
| 6 | Phase 2 结束后怎么切成硬门禁 | §7 |

---

## 1. 归档怎么生成（问题 1）

### 1.1 先纠正前提：归档是 477 KB，不是 ~23 KB

实测数据（同一份源目录）：

| 口径 | 字节 | 说明 |
| --- | --- | --- |
| 原始 HTML（48 个，含嵌套目录） | 2,198,761 | `.baseline-work/public/**/*.html` |
| tar（未压缩） | 2,235,392 | 48 个 512B 头 + 数据块对齐 + 1024B 结束块，开销 36,631 B |
| **tar.gz（本归档，gzip -9 单个 solid 流）** | **488,029** | 压缩率 4.5× |

组长说的「约 23 KB」大概率只打进了**顶层**文件。可复现这个猜测：

```powershell
# 只取 public 下的顶层 *.html（真实顶层只有 index.html 和 404.html）→ 和 23KB 对得上
tar -czf $env:TEMP\sys.tar.gz -C .baseline-work/public index.html 404.html
# 结果：23,185 字节  ← 正好是「约 23 KB」
```

为什么全量 gzip 只有 4.5×：gzip 窗口 32 KB，48 个页面之间的重复结构（导航、
head 里几十条 meta、内联 style）**跨页重复远超 32 KB 窗口**，gzip 吃不到。
同一份 tar 用 brotli q11 实测 **33,560 字节**——反证了跨页重复有多大。

**结论（按既定决策继续「直接进仓库」）**：477 KB 单文件 + 8 KB manifest，对仓库
来说仍是一个可接受的二进制 blob；不进 Release、不加 CI cache。如果以后真的嫌大，
换成 `tar + brotli`（约 33 KB）是最省事的优化，但会破坏 `.tar.gz` 的标准可解压性
（`tar -xzf` 就不能用了），本次**不采用**。

### 1.2 归档内容约定（写死在生成器里）

```
1. 只收 .html，不收图片 / CSS / JS（diff 只解析 HTML）；
2. 归档内路径 = 相对 .baseline-work/public 的路径，POSIX "/" 分隔；
3. 解压根目录 == baseline HTML 根目录（即 diff-html 的 BASELINE_HTML_DIR）。
```

例：`index.html`、`404.html`、`about/index.html`、`categories/前端/index.html`。
为什么选「相对 public 根」而不是 `public/**.html`：`diff-html.mjs` 的
`pagePathToFile()` 是 `path.join(BASELINE_HTML_DIR, urlPath)`，多一层 `public/`
会让默认目录语义变扭；现在解压目录 = 基线根目录，与环境变量名一致。

### 1.3 生成器

| 文件 | 作用 |
| --- | --- |
| `tests/baseline-html/make-baseline-html-archive.mjs` | 生成归档 + manifest，零第三方依赖（只用 `node:fs/path/zlib/crypto`） |
| `tests/baseline-html/baseline-html.tar.gz` | 归档本体 |
| `tests/baseline-html/baseline-html.manifest.json` | 文件数 / 总字节 / 整包 SHA256 + 逐文件 SHA256（给 extract 校验） |
| `tests/baseline-html/README.md` | 目录约定与再生成说明 |

```console
$ node tests/baseline-html/make-baseline-html-archive.mjs
[baseline-archive] 源目录: D:\Git-project\astro-theme-anzhiyu\.baseline-work\public
[baseline-archive] HTML:   48 个文件 / 2198761 字节
[baseline-archive] tar:    2235392 字节  →  gzip: 488029 字节 (476.6 KB)
[baseline-archive] SHA256: b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0
[baseline-archive] 已写入: tests\baseline-html\baseline-html.tar.gz
[baseline-archive] 已写入: tests\baseline-html\baseline-html.manifest.json
```

确定性：条目按 UTF-8 字节序排序、mtime 固定 `1700000000`、uid/gid 0、mode 0644、
uname/gname 固定、gzip 不写 mtime。连跑两次 SHA256 相同（实测 `run1 == run2`）。
这意味着「归档有没有被改过 / 是否与源目录一致」可以直接看 SHA256，不用二进制 diff。

### 1.4 记录值（任务要求）

| 项 | 值 |
| --- | --- |
| 文件数 | **48** |
| 原始总字节 | **2,198,761** |
| 归档字节 | **488,029**（476.6 KiB） |
| 归档 SHA256 | **`b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0`** |
| tar（未压缩）字节 | 2,235,392 |
| manifest | `tests/baseline-html/baseline-html.manifest.json`（8,234 字节，含 48 个逐文件 SHA256） |

### 1.5 归档正确性交叉验证

1. **与 `docs/reference/baseline.json` 1:1 对得上**：把 48 个 page path 按
   `pagePathToFile()` 映射成文件，逐个比 `bytes` + `sha256`：

   ```
   baseline.json pages : 48
   mapped+verified ok  : 48
   archive html files  : 48
   uncovered by pages  : []
   mismatches          : []
   1:1 mapping         : true
   ```

2. **标准 tar 可解**：`tar -tzf tests/baseline-html/baseline-html.tar.gz` 列出 48 条
   （中文路径正常），说明归档是标准 USTAR + gzip，不依赖本仓库脚本也能解。
3. **git 不会改字节**：`git ls-files --eol` 显示 `i/-text w/-text`（二进制），
   staged blob size 488,029 == 工作区文件，`git hash-object` 前后一致——不会被
   `core.autocrlf` 破坏。

---

## 2. extract 脚本（问题 2）

### 2.1 用法

```bash
node scripts/extract-baseline-html.mjs                 # 默认 → .baseline-html/
node scripts/extract-baseline-html.mjs --out <dir>     # 指定目录
node scripts/extract-baseline-html.mjs --archive <tar.gz> --out <dir>
pnpm baseline:extract                                  # 等价（根 package.json 新增）
```

### 2.2 目录约定（写死）

```
归档内            解压后
index.html        .baseline-html/index.html
404.html          .baseline-html/404.html
about/index.html  .baseline-html/about/index.html
categories/前端/index.html  .baseline-html/categories/前端/index.html
```

即 `.baseline-html/` 本身就是 baseline 根目录，下面直接是 `index.html` / `404.html` /
`<url path>/index.html`。这正好对应 `diff-html.mjs` 的
`pagePathToFile(rootDir, urlPath)`：`/about/` → `<rootDir>/about/index.html`。
CI 里只需要 `BASELINE_HTML_DIR=.baseline-html`，**diff 工具不用为路径约定做任何妥协**。

### 2.3 行为与校验链

| 步骤 | 行为 | 失败表现 |
| --- | --- | --- |
| 1 | 归档存在性检查 | `错误：归档不存在：…（仓库里应有 tests/baseline-html/baseline-html.tar.gz…）` exit 1 |
| 2 | 读 manifest，比整包 SHA256 | `错误：归档与 manifest 不一致：` + 两个 SHA256 + 重生成提示，exit 1 |
| 3 | gunzip | `错误：gzip 解压失败：… 不是合法 gzip（…）` exit 1 |
| 4 | 解析 tar：每个 512B 头算 checksum；只接受普通文件；拒绝绝对路径/盘符/`\`/`..`；拒绝非 `.html` | `归档已损坏：偏移 N 的 tar 头校验和不匹配（存 X，算 Y）` / `拒绝含 .. 的归档路径` 等，exit 1 |
| 5 | 比 manifest 的 `fileCount` / `htmlBytes` / 逐文件 SHA256 | `归档与 manifest 不一致` / `逐文件 SHA256 不一致`，exit 1 |
| 6 | 逐文件 `mkdir -p` + 写出；再次做目标目录越界防护 | — |
| 7 | 打印文件数 / 字节数 / 下一步命令 | — |

之所以校验做这么重：归档是二进制进 git，又只被这一个脚本消费；如果哪天归档
被 LFS/filter 改坏、或被手工替换，最好在 CI 第一步就报「归档坏了」，而不是让
diff 报一堆假差异。

### 2.4 幂等性证据

- 第一次运行（目录不存在）：`解压完成：48 个文件 / 2198761 字节`
- 第二次运行（目录已存在，覆盖写）：同样 `48 个文件 / 2198761 字节`
- 两次运行前后对 `.baseline-html/` 全树做 SHA256 列表比对：**完全一致**
  （`same tree hash list: True`）
- 解压结果与源目录逐文件对比：**48/48 path + SHA256 完全一致**
- 解压结果与 `docs/reference/baseline.json` 的逐页 `bytes`+`sha256`：**48/48 一致**

覆盖写语义：同一份归档重复运行结果不变；如果归档更新后删掉了某个页面，本地
`.baseline-html/` 里旧文件不会自动清理（需要时手动删输出目录）。CI 每次都是干净
checkout，不受影响；本地需要严格镜像时删掉 `.baseline-html/` 重跑即可（或 `--out` 新目录），
这个限制明确写进了脚本头注释。

### 2.5 错误路径实跑（负向用例）

| 用例 | 实际输出（stderr） | 退出码 |
| --- | --- | --- |
| 归档不存在 | `错误：归档不存在：…/missing.tar.gz` + 提示 | 1 |
| gunzip 层损坏（翻转字节） | `错误：gzip 解压失败：… 不是合法 gzip（invalid literal/lengths set）` | 1 |
| tar 头 checksum 损坏（解压后改字节再压） | `错误：归档已损坏：偏移 0 的 tar 头校验和不匹配（存 8983，算 9140）` | 1 |
| manifest 整包 SHA 不符 | `错误：归档与 manifest 不一致：` + 两个 SHA256 + 重生成提示 | 1 |
| 目录穿越 `../evil.html`（伪造 tar） | `错误：拒绝含 .. / 空段 / . 的归档路径："../evil.html"` | 1 |
| `--help` | 打印用法 | 0 |

---

## 3. 与 diff 工具的适配（问题 3）：一行没改

`scripts/diff-html.mjs` 的 `--all` 模式本来就有环境变量入口：

```js
const BASELINE_HTML_DIR = process.env.BASELINE_HTML_DIR
  ? path.resolve(process.env.BASELINE_HTML_DIR)
  : path.join(REPO_ROOT, '.baseline-work', 'public')
```

所以接线只用环境变量，不改逻辑、不改默认值、不改退出码语义。

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 全量模式吃解压目录 | `BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all` | 48 页全部读到，exit 1（有 FAIL），113 条差异 |
| 正对照（解压目录比自身） | `BASELINE_HTML_DIR=.baseline-html DIST_DIR=.baseline-html node scripts/diff-html.mjs --all` | **48 页 / PASS 48 / FAIL 0 / 0 条差异**，exit 0 |
| 单页 pair 模式 | `node scripts/diff-html.mjs .baseline-html dist` | 解析两侧 `index.html`，66 条差异，exit 1 |

正对照的意义：如果解压坏了（编码、目录层级、换行），同目录自比不会 48/48 PASS。
它证明「解压目录 = diff 工具能用的 baseline 根目录」，与真实迁移进度无关。

`git status` 里没有 `scripts/diff-html.mjs`——确认没改。

---

## 4. CI 改动（问题 4 的 diff 片段）

`.github/workflows/ci.yml`：在 `Guard upstream delta` 之后、`Upload dist artifact`
之前插入 2 步（build 之后、artifact 上传之前），并给 artifact 加 `diff-report.json`。

```diff
       - name: Guard upstream delta
         run: pnpm check:upstream-delta
 
+      # CI 上没有 gitignore 的 .baseline-work/，baseline HTML 以归档形式进仓库
+      # （tests/baseline-html/baseline-html.tar.gz，48 页 / 477 KB）。解压出来的
+      # .baseline-html/ 就是 diff-html 的 baseline 根目录（约定见 P-baseline-html-ci）。
+      - name: Extract baseline HTML
+        run: node scripts/extract-baseline-html.mjs
+
+      # Phase 2 期间 HTML 结构 diff 只出报告、不阻断（`|| true`）。Phase 2 结束后
+      # 改成硬门禁：删掉 `|| true`，让 FAIL 直接 exit 1（步骤见
+      # docs/notes/topics/P-baseline-html-ci.md §7）。BASELINE_HTML_DIR 不能省：
+      # diff-html 默认找 .baseline-work/public，CI 上不存在。
+      - name: Diff HTML structure against upstream baseline (report only)
+        env:
+          BASELINE_HTML_DIR: .baseline-html
+        run: node scripts/diff-html.mjs --all --json > diff-report.json || true
+
       - name: Upload dist artifact
         uses: actions/upload-artifact@v4
         with:
           name: dist
-          path: dist
+          path: |
+            dist
+            diff-report.json
           if-no-files-found: error
```

设计说明：

| 点 | 选择 | 原因 |
| --- | --- | --- |
| extract 步**不**加 `|| true` | 归档缺失/损坏/约定漂移是硬错误 | 这是 CI 建立基线的前提，坏了必须红，不能静默 skip |
| diff 步加 `|| true` | Phase 2 期间必须允许 FAIL | 现在真实状态是 PASS 0 / FAIL 48，不加就永久红 |
| diff 步必须写 `BASELINE_HTML_DIR` | 默认目录 CI 不存在 | 不改 diff 工具默认值的前提 |
| `--json > diff-report.json` | stdout 是纯 JSON，进度走 stderr | 报告可被 `jq`/artifact 消费；失败时也是合法 JSON |
| artifact 加 `diff-report.json` | 失败信息可下载 | 报告里每页 `diffs/counts/missingNodes` 都有，Phase 2 逐页验收要用 |
| 位置放在 build 之后 | `diff` 需要 dist；extract 不依赖 build 但放一起读起来是一件事 | 任务要求 build 之后、artifact 之前 |

`ci.yml` 已用 PyYAML 解析验证语法，11 个 step，顺序
`Checkout → … → Build blog → 3 个守卫 → Extract baseline HTML → Diff HTML … → Upload`。

`package.json`：`diff:html` 已存在 → 复用；只新增 `baseline:extract`，没有新增依赖，
`pnpm-lock.yaml` 未动：

```diff
-    "diff:html": "node scripts/diff-html.mjs"
+    "diff:html": "node scripts/diff-html.mjs",
+    "baseline:extract": "node scripts/extract-baseline-html.mjs"
```

`.gitignore` 新增派生目录（归档本体照常进仓库）：

```diff
+# baseline HTML 归档解压出的参考产物（归档本体在 tests/baseline-html/，进仓库；
+# 解压目录是派生物，node scripts/extract-baseline-html.mjs 可随时重建）
+.baseline-html/
```

---

## 5. 自测完整输出（问题 4 自测）

说明：本机 `dist` 仍是 P1.5 垂直切片（只有 3 个 HTML：
`index.html` / `debug-collection/index.html` / `page2/index.html`），48 页里只有 `/`
有对照物。所以当前数字只证明「管线通了」，不证明迁移完成。

### 5.1 解压

```console
$ node scripts/extract-baseline-html.mjs
[baseline-html] 归档：tests/baseline-html/baseline-html.tar.gz（488029 字节）
[baseline-html] 整包校验通过：SHA256 b17a4f23bc02bc2129352b1140db01c8d153a1d301f9862e1b5c3f02b2e979c0（manifest tests/baseline-html/baseline-html.manifest.json）
[baseline-html] 逐文件校验：48/48 个文件 SHA256 与 manifest 一致
[baseline-html] 解压完成：48 个文件 / 2198761 字节 → .baseline-html
[baseline-html] 目录约定：解压根目录 = baseline HTML 根目录（index.html / 404.html / about/index.html …）
[baseline-html] 下一步：BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
$ echo $?
0
```

### 5.2 `diff --all --json`（CI 实际跑的那条）

```console
$ BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json > diff-report.json
$ echo $?
1                     # CI 用 || true 吸收；报告仍然完整
```

JSON 解析结果：

```
mode=all  ok=False
baselineDir=.baseline-html  distDir=examples\blog\dist
pages=48  pass=0  fail=48  diffCount=113
missingNodes=1058  unexpectedNodes=30
categories={"结构":57,"文件":47,"属性":8,"文本":1}
diff-report.json 大小 = 56,539 字节
```

### 5.3 人读版汇总（`--limit 0` 只留计数行）

```console
$ BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --limit 0
...
汇总：48 页 / PASS 0 / FAIL 48 / 差异共 113 条（结构 57 / 文件 47 / 属性 8 / 文本 1），缺口 缺 1058 / 多 30 节点
[diff-html] 有页面结构不一致，见上方明细
$ echo $?
1
```

### 5.4 正对照：解压目录比自身（证明解压目录结构被工具接受）

```console
$ BASELINE_HTML_DIR=.baseline-html DIST_DIR=.baseline-html node scripts/diff-html.mjs --all --limit 0
...
汇总：48 页 / PASS 48 / FAIL 0 / 差异共 0 条，缺口 缺 0 / 多 0 节点
[diff-html] 全部页面结构一致
$ echo $?
0
```

### 5.5 单页 pair 模式

```console
$ node scripts/diff-html.mjs .baseline-html dist --json > pair.json
$ echo $?
1
mode=pair  ok=False  status=FAIL  diffCount=66
```

### 5.6 为什么现在是 PASS 0 / FAIL 48（不是接线坏了）

| 差异来源 | 条数 | 解释 |
| --- | --- | --- |
| `file-missing`（文件） | 47 | `dist` 只有 3 个 HTML；`/` 之外 47 页在 dist 里还不存在（Phase 2 才迁） |
| 首页结构/属性/文本 | 66 | dist 首页是 P1.5 垂直切片，与上游首页差距大（与 P2-13 §7.1 记录的 66 条一致） |
| 合计 | 113 | P2-13 §7.4 当时记录的「48 页共 113 条」**完全一致**——反证解压出来的 baseline 与当时 `.baseline-work/public` 是同一份内容 |

等 Phase 2 把页面逐批迁进 `examples/blog`，PASS 数会从 0 往上走、`diffCount` /
`missingNodes` 应单调下降（P2-13 §11 判据 2）。CI 现在每个 PR 都能看到这组数字。

### 5.7 其他验证清单

| 验证 | 结果 |
| --- | --- |
| 归档确定性（连跑两次生成器） | SHA256 相同 `b17a4f23…e979c0` |
| 标准 tar 可读 | `tar -tzf` 列出 48 条，中文路径正常 |
| 解压 vs 源目录 | 48/48 路径 + SHA256 一致 |
| 解压 vs `docs/reference/baseline.json` | 48/48 页 `bytes` + `sha256` 一致，1:1 映射 |
| 幂等（第二次解压） | 文件数/字节数相同，全树 SHA256 列表相同 |
| `pnpm baseline:extract` | exit 0，输出同上 |
| `pnpm diff:html --all` 参数透传 | 正常（pnpm 会转发到 `node scripts/diff-html.mjs "--all"`） |
| `git` 二进制保真 | `ls-files --eol` = `i/-text w/-text`，staged blob == 工作区字节 |
| CI YAML | PyYAML 解析通过；step 顺序、artifact 多路径、env 均符合预期 |
| 负向用例 | 归档缺失 / gzip 损坏 / tar checksum 损坏 / manifest 不符 / 目录穿越 → 全部 exit 1 + 清晰错误 |

---

## 6. 本地开发怎么用（问题 5）

```bash
# 1) 解压基线（首次，或归档更新后）
pnpm baseline:extract
# 等价：node scripts/extract-baseline-html.mjs，产物在 .baseline-html/（gitignore）

# 2) 构建自己的产物
pnpm build

# 3) 全量结构 diff（默认 baseline 目录是 .baseline-work/public，要指到解压目录）
BASELINE_HTML_DIR=.baseline-html pnpm diff:html --all

# 机器可读（CI 同款；有 FAIL 时 exit 1，但 JSON 仍然完整）
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all --json > diff-report.json

# 只跑某几页 / 看归一化诊断 / 导出归一化树
BASELINE_HTML_DIR=.baseline-html pnpm diff:html --all --filter /tags/
BASELINE_HTML_DIR=.baseline-html pnpm diff:html --all --verbose
BASELINE_HTML_DIR=.baseline-html pnpm diff:html --all --limit 100

# 单页（也接受目录，会自动接 index.html）
node scripts/diff-html.mjs .baseline-html dist
```

Windows PowerShell 设环境变量（只影响当前终端）：

```powershell
pnpm baseline:extract
$env:BASELINE_HTML_DIR = '.baseline-html'
pnpm diff:html --all
Remove-Item Env:\BASELINE_HTML_DIR   # 用完清理
```

如果你本机本来就有完整的 `.baseline-work/public`，不设 `BASELINE_HTML_DIR` 也能跑，
行为与 P2-13 完全一样。归档更新流程：重生成 `.baseline-work/public` →
`node tests/baseline-html/make-baseline-html-archive.mjs` → 提交归档 + manifest。

---

## 7. Phase 2 结束后怎么从「只出报告」切成「硬门禁」（问题 6）

**前提不是改 CI 写法，而是 `diff --all` 真的 48/48 PASS**（或届时明确验收判据）。
现在删 `|| true` 会立刻全红，因为 47 页还没迁、首页差 66 条——那正是 Phase 2 要做的活。

切成硬门禁的操作（改 1 个文件，1 个 step）：

1. **确认前提**：`BASELINE_HTML_DIR=.baseline-html pnpm diff:html --all` 输出
   `PASS 48 / FAIL 0 / 0 条差异`（或按 PLAN §3.2 的豁免口径达成）。
   先更新 PLAN §3.5 的判定命令与判据，再动 CI。
2. **删掉 `|| true`**，并把 step 名字里的 `(report only)` 去掉：

   ```diff
    -      - name: Diff HTML structure against upstream baseline (report only)
   +      - name: Diff HTML structure against upstream baseline
          env:
            BASELINE_HTML_DIR: .baseline-html
   -        run: node scripts/diff-html.mjs --all --json > diff-report.json || true
   +        run: node scripts/diff-html.mjs --all --json > diff-report.json
   ```

   这样 FAIL → exit 1 → job 红，门禁生效。
3. **建议顺手给 Upload 步加 `if: always()`**：diff 步红了以后默认后续 step 不再执行，
   报告就传不上去；加 `if: always()` 后失败时仍能下载 `diff-report.json` 定位是哪页哪条。
   （现在 Phase 2 期间 diff 步被 `|| true` 吸收，所以暂时不需要。）
4. **更新文档**：本文件 §0 的「Phase 2 期间允许失败」改成「已硬门禁」，
   `docs/plan/PLAN.md` §3.5 记录门禁命令与判据。
5. **可选（要改 diff 工具，超出本任务范围）**：如果到时候不是 48/48 全绿、而是「特定
   页面必须 PASS」，再给 `diff-html.mjs` 加 `--require-pass <path>` 之类参数；本次
   故意没加，避免为了以后的需求提前抽象。

---

## 8. 已知限制 / 遗留

| 项 | 说明 |
| --- | --- |
| 归档 477 KB | 比决策时预估大 20 倍（§1.1），但仍是单文件 0.47 MB，可直接进仓库；每次基线更新会新增 ~477 KB 的二进制 blob（git 不对已压缩二进制做 delta，只能整 blob 存） |
| extract 不清理旧文件 | 归档删页后本地会留旧 `.html`；CI 干净 checkout 不受影响。需要严格镜像时删目录重跑 |
| 归档来源是本机 hexo 产物 | manifest 的 SHA256 只能证明「归档 == 当初生成它的源目录」，不能证明源目录一定等于上游 commit 产物；那层由 `docs/reference/baseline.json` 的逐页 SHA256 与本文件 §1.5 的 48/48 交叉校验兜住 |
| 没有改 `.gitattributes` | 已实测 tar.gz 被 git 识别为二进制（`i/-text`），无需显式规则 |
| 没有提交 | 本任务只落盘；归档、脚本、CI 改动需要随分支提交后才对 CI 生效 |

---

## 9. 最后一句话（任务要求）

**CI 现在能自动跑 HTML 结构 diff 了**：checkout 之后 `Extract baseline HTML` 把
归档展开成 `.baseline-html/`，`Diff HTML …` 用 `BASELINE_HTML_DIR` 跑通 48 页全量比对，
结果 JSON 进 artifact——缺的只是「绿色」本身，不是管线。**要变成门禁，还缺两件事实**：
（1）Phase 2 把 47 个缺失页迁完、首页 66 条差异收敛，让 `PASS 48 / FAIL 0` 真的成立；
（2）在那之后再删掉 CI 里的 `|| true`（建议同时给 Upload 步加 `if: always()` 保留失败报告）。
在 48/48 PASS 之前删 `|| true` 只会把「迁移进度」和「门禁报警」混在一起，没有信息量。
