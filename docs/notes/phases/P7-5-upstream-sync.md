# P7-5 · 上游同步机制（季度 diff）跑通记录

| 项 | 值 |
| --- | --- |
| 任务 | W1-C / `task-4`：P7-5 上游同步机制（季度 diff 脚本 + 跑一轮验证） |
| 日期 | 2026-11-24 18:51–19:00（Asia/Shanghai） |
| 环境 | Windows 11 + PowerShell 7.6.10 + Node **v24.22.0** + `git version 2.51.0.windows.2` |
| 上游只读副本 | `D:\Git-project\_research\anzhiyu-upstream`（`origin https://github.com/anzhiyu-c/hexo-theme-anzhiyu.git`） |
| 迁移基线 | hexo-theme-anzhiyu **1.7.1 / commit `72439d93936b63da59a4a1195f64de9f952f6cc1`（`72439d93`）** |
| 交付 | `scripts/check-upstream-sync.mjs`；本报告；`docs/reference/upstream-delta.md` §8 季度流程 |
| 复跑 | `node scripts/check-upstream-sync.mjs`（默认 `origin/main`）、`--ref origin/dev`、`--offline`、`--json` |

## 0. 结论摘要（TL;DR）

1. **远端 `main` 还停在基线**：`git fetch origin` 之后 `origin/main == 72439d93`，基线之后 **0 个新提交、0 个变更文件** → 脚本退出码 **0**（无必须跟进）。
2. **但远端 `dev` 分支比基线多 2 个 commit / 1 个文件**（`_config.yml`，+1/−1 行）→ 脚本 `--ref origin/dev` 退出码 **1**，被路径规则判为「必须跟进」。
3. 人工 triage 第 1 步：该改动是**注释行** `# 51a统计配置` → `# 51la统计配置`，YAML 解析结果不变（键数/语义不变），且**只存在于 `dev`、未合入 `main`** → 结论：**本轮无需同步镜像、不改 `docs/reference/upstream-delta.md` §5 锚点**，只登记「已 triage：注释级，忽略」。
4. **环境坑（重要）**：这份冻结副本原本是 **shallow clone（depth=1，只有 1 个 commit）**。shallow 状态下 `git fetch` 只会把 `origin/main` 挪成新的孤立根，`git rev-list HEAD..origin/main` 永远算不出「基线之后的新提交」——这会静默漏报。本轮用 `git fetch --unshallow` 把历史补全到 **847 个 commit**（`.git` 7.4 MB，工作树 `git status --porcelain` 仍为 0 行、331 个文件、HEAD 不变）。脚本为此内置了 shallow 检测 + `--deepen` 补救 + 失败时退出码 2，不把「不知道」说成「没变」。
5. 脚本退出码语义：`0` 无必须跟进 / `1` 有必须跟进 / `2` **无法判定**（基线解析失败、基线不是目标 ref 祖先、网络模式 fetch 失败且没有必须跟进变更等，需要人工来看）。

## 1. 机制设计：脚本怎么回答「上游到底变了什么」

### 1.1 数据源与「是否最新」

```
默认（网络）:  git -C <upstream> fetch origin --quiet  →  比对 origin/main
                 ├─ remote.<name>.fetch 覆盖目标分支 → 只 fetch 一次
                 └─ 不覆盖（本副本是单分支 refspec，如 dev）→ 再显式 fetch
                    git fetch origin +refs/heads/dev:refs/remotes/origin/dev --quiet
--offline:      不联网，只用本地已有 refs；输出标注「是否最新: 否」
--ref <本地ref>: 纯本地区间比较（分类器自检用），最新性记 null
```

「是否最新」在输出/JSON 里有三种真实取值：

| `dataSource.latest` | 含义 |
| --- | --- |
| `true` | fetch 成功，已与远端核对（核对时刻 = `fetchedAt`） |
| `false` | `--offline` 或 fetch 失败回退本地 refs，**没有资格断言远端没变** |
| `null` | 本地区间比较（`--baseline 1.6.9 --ref 1.7.1` 这种），最新性无意义 |

fetch 失败时脚本**自动回退**本地 refs（仍然给出分类），但：有必须跟进变更 → 退出码 1（该处理还是要处理，附带「数据源不是最新」警告）；没有必须跟进变更 → 退出码 **2**，因为「本地 ref 没变」≠「上游没变」。

### 1.2 分类规则（三档，路径优先，宁可多报）

| 档 | 规则（按顺序匹配，第一条命中生效） | 理由 |
| --- | --- | --- |
| **必须跟进** | `_config.yml`、`plugins.yml`、`layout/**`、`source/css/**` 或 `source/` 下 `*.styl`、`source/js/**`、`scripts/**`、`languages/zh-CN.yml` | 迁移要逐字节/逐行为复刻的东西；`zh-CN.yml` 是站点默认语言，缺键直接掉文案 |
| **可选** | 其他 `languages/**`、`package.json`、`sw-rules.js`、`docs/**`、`examples?/**`、其他 `*.md` | 看了有好处，但不阻塞迁移（`sw-rules.js` 是上游 PWA 插件用，本仓库未接入；`package.json` 只影响上游自身发布） |
| **无关** | `.github/**`（CI/issue 模板）、`README*`、`LICEN[CS]E*`、点文件、图片/字体（png / jpg / svg / ico / woff2 等）、锁文件 | 仓库维护面与二进制资源 |
| **未分类 → 必须跟进** | 兜底 | fail-safe：新目录/新资源类型先让人看一眼，默认按必须跟进处理 |

重命名（`R` / `C`）按「旧+新路径里更严格的档」算，并在 `reason` 里写明。

### 1.3 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 无变更，或只有可选/无关变更 |
| `1` | 存在必须跟进的变更，需要人工 triage |
| `2` | 无法判定（不是「上游没变」）：基线解析失败 / 基线不是目标 ref 祖先 / 网络模式 fetch 失败且无必须跟进 / git 不可用等 |

## 2. 本轮真实执行记录（原始输出）

### 2.1 副本初始状态：shallow clone

```text
$ git -C D:\Git-project\_research\anzhiyu-upstream rev-parse HEAD
72439d93936b63da59a4a1195f64de9f952f6cc1
$ git -C ... rev-parse --is-shallow-repository
true
$ git -C ... rev-list --count HEAD
1
$ git -C ... branch -a
* main
  remotes/origin/main
$ git -C ... rev-parse origin/main
72439d93936b63da59a4a1195f64de9f952f6cc1
$ git -C ... rev-list --count HEAD..origin/main
0
```

说明：`.git/shallow` 里只有基线一个边界，`origin/main` 与 HEAD 同值；此时 `HEAD..origin/main=0` **不能**理解为「上游没变」——只是「本地还没有别的提交」。`git tag` 数量 0，`FETCH_HEAD` 不存在。

### 2.2 补全历史（fetch，只动 `.git`，不动工作树）

```text
$ git -C ... fetch --unshallow --quiet
exit=0   elapsed=8s
$ git -C ... rev-parse --is-shallow-repository
false
$ git -C ... rev-list --count HEAD
847
$ git -C ... status --porcelain          # 0 行
$ git -C ... ls-files | wc -l            # 331（与补全前一致）
$ .git 体积                               # 7.4 MB
```

补全后本地有全部 41 个 tag（`--unshallow` 自动 follow 了 tag），HEAD 仍是 `72439d93`。

### 2.3 远端 ref 快照（`git ls-remote`）

```text
$ git -C ... ls-remote origin refs/heads/main
72439d93936b63da59a4a1195f64de9f952f6cc1	refs/heads/main

$ git -C ... ls-remote --heads origin
07114b6e92cdc2bc94b0274745a4db9a643db23c	refs/heads/dev
299762b73a92055fec53296c46b1154ebedacdab	refs/heads/dot/replace-blocked-issue-helper
72439d93936b63da59a4a1195f64de9f952f6cc1	refs/heads/main

$ git -C ... ls-remote --tags origin | 计数（去掉 ^{} 解引用行）
41
$ ... | grep 'refs/tags/1\.7\.'
b30357e3672fb0cdfdde5cbe226925e45e0386ac	refs/tags/1.7.0
c0595c105794a008482cc28c8f4ca0126f4ded53	refs/tags/1.7.1
```

要点：**远端最新 tag 仍是 1.7.1**；`1.7.1` tag（`c0595c10`）是基线的祖先，基线 = tag 1.7.1 + 1 个 commit：

```text
$ git -C ... log --format='%H|%ad|%s' --date=iso-strict 1.7.1..72439d93
72439d93936b63da59a4a1195f64de9f952f6cc1|2026-01-05T17:55:20+08:00|feat(artalk): 增强评论数量检索并添加暗黑模式支持以集成Artalk fix #340
$ git -C ... merge-base --is-ancestor 1.7.1 72439d93 ; echo $?
0
```

### 2.4 fetch + 基线..`origin/main`（本轮主判定）

```text
$ git -C ... fetch origin --quiet        # exit 0，无输出
$ git -C ... rev-parse origin/main
72439d93936b63da59a4a1195f64de9f952f6cc1
$ git -C ... log --format='%H|%ad|%s' --date=iso-strict 72439d93..origin/main
（空）
$ git -C ... rev-list --count 72439d93..origin/main
0
```

**远端 main = 基线，自 2026-01-05 之后没有新提交。**

### 2.5 基线..`origin/dev`（本轮真正的上游活动）

```text
$ git -C ... fetch origin dev:refs/remotes/origin/dev --quiet   # exit 0
$ git -C ... rev-parse origin/dev
07114b6e92cdc2bc94b0274745a4db9a643db23c
$ git -C ... rev-list --count 72439d93..origin/dev
2
$ git -C ... rev-list --count origin/dev..origin/main
0
$ git -C ... merge-base --is-ancestor origin/main origin/dev ; echo $?
0
$ git -C ... log --format='%H|%ad|%s' --date=iso-strict 72439d93..origin/dev
07114b6e92cdc2bc94b0274745a4db9a643db23c|2026-05-31T10:38:04+08:00|Merge pull request #356 from bllyds999/dev
cf5628c5e5002b2aa5a4bebbcdcc1d6cc653d03e|2026-05-26T11:35:59+08:00|Update _config.yml
```

`dev` 是 main 的**直系后代**（`origin/dev..origin/main = 0`），即上游把新改动堆在 `dev` 上、还没合回 `main`。

```text
$ git -C ... diff --name-status 72439d93..origin/dev
M	_config.yml
$ git -C ... diff --shortstat 72439d93..origin/dev
 1 file changed, 1 insertion(+), 1 deletion(-)

$ git -C ... diff 72439d93..origin/dev -- _config.yml
diff --git a/_config.yml b/_config.yml
index 4685e20..7bcad19 100644
--- a/_config.yml
+++ b/_config.yml
@@ -1098,7 +1098,7 @@ bubble:
 console:
   enable: true
 
-# 51a统计配置
+# 51la统计配置
 LA:
   enable: false
   ck:
```

### 2.6 人工 triage（必须跟进的 1 个文件）

| 项 | 结论 |
| --- | --- |
| 文件 | `_config.yml`（上游 133 顶层键 / 662 递归 mapping key 的来源；仓库里镜像为 `examples/blog/theme.config.yml`，与登记表 §5 的 SHA 绑定） |
| 改动 | 仅 1 行 YAML 注释：`# 51a统计配置` → `# 51la统计配置` |
| 语义影响 | 无。YAML 里 `#` 之后是注释，解析后的键/值不变；不影响 `var.styl` fallback、不影响 133/662 计数 |
| 是否要同步镜像 | **不要**。镜像 `theme.config.yml` 与上游 `72439d93` 逐字节绑定（SHA 在锚点里），同步一个只存在于 dev 的注释改动会破坏「镜像 = 基线」的约定 |
| 分类器是否误报 | 不算误报，是**设计选择**：路径规则不看 diff 语义，命中核心文件的注释级改动也报必须跟进；人工 triage 一步即可排除 |
| 处置 | 记录为本轮「已 triage：注释级，无需同步」；若将来 dev 合入 main，季度检查会在 main 上再抓到同一文件一次，仍按注释级忽略 |

### 2.7 脚本三轮实录（原文，可复跑）

**① 默认（`origin/main`）→ 退出码 0**

```text
$ node scripts/check-upstream-sync.mjs
[check-upstream-sync] 上游副本: D:\Git-project\_research\anzhiyu-upstream
[check-upstream-sync] HEAD: 72439d93936b63da59a4a1195f64de9f952f6cc1（命中基线 72439d93）
[check-upstream-sync] 数据来源: 网络 fetch（remote=origin, branch=main）→ origin/main @ 72439d93；fetch 时间 2026-11-24T18:57:06+08:00；是否最新: 是（已与远端核对）
[check-upstream-sync] 基线: 72439d93 → 72439d93936b63da59a4a1195f64de9f952f6cc1；登记表锚点: 72439d93（1.7.1）
[check-upstream-sync] 新提交: 0 个
[check-upstream-sync] 变更文件: 0 个；必须跟进 0 / 可选 0 / 无关 0
[check-upstream-sync] 限制: 分类是路径规则驱动，不看 diff 语义：注释级改动命中核心文件时也会判「必须跟进」（宁多报不漏报，triage 由人做）。
[check-upstream-sync] 限制: 文件清单是基线..ref 的净 diff：期间「新增后又删除」的文件不会出现，需要逐 commit 细节时手工看 git log --name-status。
[check-upstream-sync] 限制: 只比对所选 ref（默认 origin/main）。上游 dev 等分支需要 --ref origin/dev 单独跑（本轮就有 dev-only 提交）。
[check-upstream-sync] 限制: fetch 只更新 remote-tracking ref 与对象库，不 checkout、不动上游工作树；脚本不写本仓库任何文件。
[check-upstream-sync] 限制: 路径分类按 `/` 分目录；含制表符等极端文件名可能解析不准（上游当前无此类路径）。
[check-upstream-sync] 结论: 基线之后上游没有新提交
[check-upstream-sync] 退出码: 0
EXIT=0
```

**② `--ref origin/dev` → 退出码 1**

```text
$ node scripts/check-upstream-sync.mjs --ref origin/dev
[check-upstream-sync] 上游副本: D:\Git-project\_research\anzhiyu-upstream
[check-upstream-sync] HEAD: 72439d93936b63da59a4a1195f64de9f952f6cc1（命中基线 72439d93）
[check-upstream-sync] 数据来源: 网络 fetch（remote=origin, branch=dev）→ origin/dev @ 07114b6e；fetch 时间 2026-11-24T18:57:10+08:00；是否最新: 是（已与远端核对）
[check-upstream-sync] 基线: 72439d93 → 72439d93936b63da59a4a1195f64de9f952f6cc1；登记表锚点: 72439d93（1.7.1）
[check-upstream-sync] 新提交: 2 个
[check-upstream-sync]   - 07114b6e  2026-05-31T10:38:04+08:00  减肥鱼  Merge pull request #356 from bllyds999/dev
[check-upstream-sync]   - cf5628c5  2026-05-26T11:35:59+08:00  摆烂领域大蛇  Update _config.yml
[check-upstream-sync] 变更文件: 1 个（+1 / −1 行）；必须跟进 1 / 可选 0 / 无关 0
[check-upstream-sync] 分类明细:
[check-upstream-sync]   必须跟进（1）
[check-upstream-sync]     M    _config.yml                                          主题配置 _config.yml
[check-upstream-sync] 按目录（必须/可选/无关）: _config.yml 1/0/0
[check-upstream-sync] 限制: （同上 5 条，略）
[check-upstream-sync] 结论: 发现 1 个必须跟进变更，需要人工处理
[check-upstream-sync] 退出码: 1
EXIT=1
```

**③ `--offline` → 退出码 0，但明确标注「是否最新: 否」**

```text
$ node scripts/check-upstream-sync.mjs --offline
[check-upstream-sync] 数据来源: --offline（只用本地 refs，未联网）→ origin/main @ 72439d93；是否最新: 否（本地 ref 最新提交日期 2026-01-05T17:55:20+08:00，需要联网复跑才能断言）
[check-upstream-sync] 新提交: 0 个
[check-upstream-sync] 变更文件: 0 个；必须跟进 0 / 可选 0 / 无关 0
[check-upstream-sync] 结论: 基线之后上游没有新提交（离线判定：只用本地 refs，未与远端核对）
[check-upstream-sync] 退出码: 0
EXIT=0
```

> 本轮网络可用（`fetch` exit 0），所以**不是**靠 offline 兜底；offline 是单独验证过的降级路径：断网时脚本仍能分类，但不会把「本地没变」冒充成「上游没变」。有网络环境复跑直接用 `node scripts/check-upstream-sync.mjs`（见 §7）。

**④ `--json` 关键字段（三轮 + 自检汇总）**

```text
[main]                exit=0 mode=network      latest=true  ref=origin/main tip=72439d93 commits=0  files=0  must=0  opt=0 ign=0 unclass=0 verdict=clean
[dev]                 exit=1 mode=network      latest=true  ref=origin/dev  tip=07114b6e commits=2  files=1  must=1  opt=0 ign=0 unclass=0 verdict=must-follow
[offline]             exit=0 mode=offline      latest=false ref=origin/main tip=72439d93 commits=0  files=0  must=0  opt=0 ign=0 unclass=0 verdict=clean
[1.6.9..1.7.1 自检]   exit=1 mode=local-ref    latest=null  ref=1.7.1       tip=c0595c10 commits=91 files=67 must=60 opt=4 ign=3 unclass=0
[1.7.0..1.7.1 自检]   exit=1 mode=local-ref    latest=null  ref=1.7.1       tip=c0595c10 commits=11 files=26 must=22 opt=4 ign=0 unclass=0
[36b0ce0^..36b0ce0]   exit=0 mode=local-ref    latest=null  ref=36b0ce0     tip=36b0ce0  commits=1  files=2  must=0  opt=0 ign=2 unclass=0
```

JSON 顶层字段：`options` / `upstream`（HEAD、shallow、基线、登记表锚点比对）/ `dataSource`（mode、latest、latestReason、fetchedAt、fetchCommands）/ `history`（range、commits[]）/ `files`（byTier、byBucket、insertions/deletions）/ `summary` / `verdict` / `warnings` / `limitations` / `gitCommands`（每次 git 调用的 cmd/ok/code/durationMs，便于报告引用）。

### 2.8 异常路径（退出码 2）

```text
$ node scripts/check-upstream-sync.mjs --baseline deadbeef
[check-upstream-sync]   fatal: Needed a single revision
[check-upstream-sync] 无法判定：无法解析基线 deadbeef
[check-upstream-sync] 退出码: 2                     # EXIT=2

$ node scripts/check-upstream-sync.mjs --ref origin/nope
[check-upstream-sync] 无法判定：无法解析比较目标 ref：origin/nope
[check-upstream-sync] 退出码: 2                     # EXIT=2

$ node scripts/check-upstream-sync.mjs --upstream D:/tmp/not-exist
[check-upstream-sync] 无法判定：上游副本不存在：D:\tmp\not-exist
[check-upstream-sync] 退出码: 2                     # EXIT=2

$ node scripts/check-upstream-sync.mjs --bogus
[check-upstream-sync] 参数错误：未知参数：--bogus（--help 看用法）   # EXIT=2
```

## 3. 分类器自检（用真实历史区间，不是造数据）

用上游真实历史区间把三档规则全部打中：

| 区间 | commit | 文件 | 必须/可选/无关 | 说明 |
| --- | --- | --- | --- | --- |
| `1.6.9..1.7.1` | 91 | 67（+2043/−587） | **60 / 4 / 3** | 三档全覆盖：`layout/30`、`source/22`、`scripts/5`、`_config.yml`、`plugins.yml`、`languages/zh-CN` = 60 必须；`languages/en,zh-TW`、`package.json`、`sw-rules.js` = 4 可选；`README.md`、`README_EN.md`、`.github/ISSUE_TEMPLATE/config.yml` = 3 无关 |
| `1.7.0..1.7.1` | 11 | 26（+784/−257） | **22 / 4 / 0** | 1.7.0→1.7.1 发布区间：12 个 `layout/` + `source/` 6 + `scripts/` 2 + `_config.yml` + `languages/zh-CN` = 22 |
| `36b0ce0^..36b0ce0` | 1 | 2（favicon.ico，0/0 行） | 0 / 0 / **2** | 纯图片提交 → 无关、退出码 0（证明图片规则与 0 退出路径） |

三档命中的路径样例（`1.6.9..1.7.1` 的 `byBucket` 输出）：

```text
按目录（必须/可选/无关）: _config.yml 1/0/0 | .github/ 0/0/1 | languages/ 1/2/0 | layout/ 30/0/0 |
package.json 0/1/0 | plugins.yml 1/0/0 | README_EN.md 0/0/1 | README.md 0/0/1 | scripts/ 5/0/0 |
source/ 22/0/0 | sw-rules.js 0/1/0
```

## 4. 环境坑与设计对策

| 坑 | 现象 | 对策 |
| --- | --- | --- |
| **shallow clone** | 本副本 depth=1，`HEAD..origin/main` 恒为 0，会静默漏报新提交 | 脚本检测 `--is-shallow-repository` → 警告；历史不连通时自动 `fetch --deepen=100/1000`；仍不连通 → 退出码 2 并提示 `fetch --unshallow`。本轮已把副本补全到 847 commits（只动 `.git`，工作树 0 改动） |
| **单分支 refspec** | 本副本 `remote.origin.fetch` 只覆盖 `main`，`fetch origin` 不刷新 `origin/dev` | 脚本读 `remote.<name>.fetch`；未覆盖目标分支时追加显式 refspec fetch（`+refs/heads/dev:refs/remotes/origin/dev`），JSON 里两条 fetch 命令都留痕 |
| **DSH/Windows 沙箱禁止管道捕获** | 在沙箱里 Node `spawn(git, …, {stdio:'pipe'})` 直接 `EPERM`（实测 `spawnSync git EPERM`），一开始脚本完全跑不起来 | `runGit()` 改为**文件描述符重定向**（`stdio:['ignore', fdOut, fdErr]` + 读临时文件），沙箱内外都能用；临时目录在进程退出（含 `process.exit`）时清理，实测运行后 `%TEMP%` 无 `dsh-upstream-sync-*` 残留 |
| **分类只看路径** | 注释级改动命中 `_config.yml` 也报必须跟进 | 明确是设计选择（宁可多报），triage 成本一条命令；`reason` 里写清命中的是哪条规则 |

## 5. 已知局限（脚本 `limitations` 字段同源）

1. 路径规则不读 diff 语义：注释级/空行级改动命中核心文件也会判必须跟进（宁多报不漏报）。
2. 文件清单是「基线..ref」的**净 diff**：期间新增后又删除的文件不会出现；要逐 commit 细节需手工 `git log --name-status`。
3. 只比对所选 ref（默认 `origin/main`）。`dev` 需要 `--ref origin/dev` 单独跑——本轮就靠这一步发现了 dev-only 提交。
4. `fetch` 只更新 remote-tracking ref 与对象库，不 checkout、不动上游工作树；脚本不写本仓库任何文件。
5. 极端路径（含制表符）可能解析不准；上游当前无此类路径。
6. 「是否最新」的判定粒度是 fetch 时刻；两次运行之间上游再动，需重跑。
7. **fetch 失败的自动回退分支本轮没有被真实触发**（网络正常，实测 `fetch` exit 0）。该分支与 `--offline` 共用「本地 refs + `latest=false`」路径，触发时会在 `warnings` 与 `dataSource.latestReason` 里写明失败命令与退出码；没有网络的环境下若要验证这条路径，可断开网络后跑默认命令（预期退出码 2，若同时有必须跟进则退出码 1 并附警告）。

## 6. 与 `check-upstream-delta.mjs` 的分工

| 脚本 | 回答的问题 | 失败含义 |
| --- | --- | --- |
| `scripts/check-upstream-delta.mjs`（已有，CI 常驻） | 「我们**已经登记**的上游差异（U1–U9）与基准数字**有没有被破坏**」 | 镜像被手改/格式化/换行归一化、基准字节/SHA 漂移 |
| `scripts/check-upstream-sync.mjs`（本任务） | 「上游**又发了什么**、要不要跟进」 | 出的是「待 triage 清单」，不是回归失败 |

两者都只读；季度流程以 `check-upstream-sync` 出清单、人工 triage 后更新 `docs/reference/upstream-delta.md`，CI 继续由 `check-upstream-delta` 守门。

## 7. 复跑命令

```powershell
# 0) 前置：上游只读副本存在；首次/被 shallow 化过时补全历史（只动 .git）
git -C D:\Git-project\_research\anzhiyu-upstream fetch --unshallow

# 1) 主判定：基线(72439d93) 之后 origin/main 有没有必须跟进的东西
node scripts/check-upstream-sync.mjs

# 2) 看图上游 dev 分支（main 冻结时新改动可能只在这里）
node scripts/check-upstream-sync.mjs --ref origin/dev

# 3) 机器可读（CI/报告流水线）
node scripts/check-upstream-sync.mjs --json

# 4) 断网/沙箱无网络时
node scripts/check-upstream-sync.mjs --offline

# 5) 分类器自检（任意历史区间，真实数据）
node scripts/check-upstream-sync.mjs --baseline 1.6.9 --ref 1.7.1
```

**建议加到根 `package.json` 的 script 名（由 Lead 统一加，本任务不改 `package.json`）：**

```json
"check:upstream-sync": "node scripts/check-upstream-sync.mjs"
```

## 8. 后续动作

1. 本轮**没有**需要同步的上游改动（main 无新提交；dev 的 `_config.yml` 是注释级且未合入 main），`docs/reference/upstream-delta.md` §5 锚点与镜像 SHA 一律不动。
2. 季度流程已写入 `docs/reference/upstream-delta.md` §8；下季度先跑 §7 的命令 1+2，再按 §8 的 triage 流程处理。
3. 若以后确实需要跟进某次上游变更：先在本报告同目录新开 `docs/notes/phases/P7-x-upstream-sync-<日期>.md` 记录清单，再按 `docs/reference/upstream-delta.md` §7 变更流程更新登记表/镜像/基准。
4. 建议把 `check:upstream-sync` 加进「发布前手动核对清单」而不是 CI（它有网络依赖、且输出需要人 triage）。
