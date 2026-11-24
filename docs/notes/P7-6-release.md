# P7-6 发布就绪：astro-theme-anzhiyu 1.0.0（npm pack + tarball 安装冒烟 + 发布/部署文档）

> 任务：W3-D / task-13。执行时间 2026-11-24 20:18–20:30（Asia/Shanghai）。
> 环境：Windows 11 + PowerShell 7，Node v24.22.0，pnpm 10.29.3，npm 11.13.0。
> 结论：**包元数据齐、`npm pack` 结构断言通过（173 项，无泄漏）、tarball 安装到迁移站 consumer 后 `pnpm build` exit 0（94 页 + `/js/main.js` / `/css/index.css` / `/posts/pXXXX/`）**。
> 未做（待授权）：真 `npm publish`、`git push origin v1.0.0`、demo Pages 推送。本机 `npm whoami` = `ENEEDAUTH`，且默认 registry 是 `registry.npmmirror.com` 镜像（镜像不能 publish）。
> **合入前必须**：更新根 `pnpm-lock.yaml`——`yaml` 从 devDependencies 挪到 dependencies 后锁文件 importer 过期，CI 的 `pnpm install --frozen-lockfile` 会失败（写范围外，见 §7 第 0 条 / §8 #11）。
> 本笔记不含任何浏览器测量（PLAN R12：Playwright/Chromium/Lighthouse 在本机 DSH 沙箱起不来，浏览器验证只能走 CI 下一轮）。

---

## 1. 现状 → 改动

### 1.1 改动前：`packages/astro-theme-anzhiyu/package.json`（git HEAD）

```json
{
  "name": "astro-theme-anzhiyu",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./integration": "./integration.mjs", "./schema": "...", "./defaults": "...", "./components/*": "...", "./layouts/*": "..." },
  "files": ["src", "assets", "integration.mjs"],
  "dependencies": { "zod": "^4.6.7" },
  "devDependencies": { "yaml": "^2.9.1" }
}
```

缺什么（逐项）：

| 字段 | 状态 | 影响 |
| --- | --- | --- |
| `version` | `0.0.0` | 不可发布（0.0.0 只是占位） |
| `private` | `true` | npm 拒绝发布 |
| `license` | 缺 | npm 页面无许可证；与仓库 GPL-3.0 承诺脱节 |
| `repository` / `homepage` / `bugs` | 缺 | npm 页面无源码入口、无 issue 入口 |
| `keywords` | 缺 | 不可检索 |
| `engines.node` | 缺 | 与根 `package.json` 的 `>=22` 不一致 |
| `peerDependencies` | 缺 | 消费者装了不兼容 Astro 也不报错；`astro:content`/`astro:transitions` 是虚拟模块，必须由站点提供 |
| `publishConfig` | 缺 | 本机 registry 指向 npmmirror 镜像，publish 会打到镜像上 |
| `yaml` 依赖位置 | 只在 `devDependencies` | **真 bug**：`src/config/loader.ts` 运行时 `import { parse as parseYaml } from 'yaml'`，而 `loader` 从包入口 `src/index.ts` 导出 → 装到别的项目里会 `ERR_MODULE_NOT_FOUND` |
| `exports` 深路径 | 无 `./utils/*`、`./i18n/*` | 迁移产物的 15 处主题导入里有 4 处落在 `src/utils/date.ts`、`src/utils/helpers.ts`、`src/i18n/index.ts`；不补子路径导出，发布包里这些文件「存在但不可 import」 |
| 包内 README / LICENSE | 包目录没有 | tarball 里不会有 README/LICENSE（npm 页面会缺 README）——本轮未补，见 §8 |

### 1.2 改动后（只改了 `packages/astro-theme-anzhiyu/package.json`）

```json
{
  "name": "astro-theme-anzhiyu",
  "version": "1.0.0",
  "description": "Anzhiyu（Hexo hexo-theme-anzhiyu）博客主题的 Astro 移植版：组件、布局、配置层与主题静态资源 integration",
  "type": "module",
  "license": "GPL-3.0",
  "repository": { "type": "git", "url": "git+https://github.com/mcxiaochenn/astro-theme-anzhiyu.git", "directory": "packages/astro-theme-anzhiyu" },
  "homepage": "https://github.com/mcxiaochenn/astro-theme-anzhiyu#readme",
  "bugs": { "url": "https://github.com/mcxiaochenn/astro-theme-anzhiyu/issues" },
  "keywords": ["astro", "astro-component", "astro-integration", "astro-theme", "theme", "blog", "anzhiyu", "butterfly", "hexo"],
  "engines": { "node": ">=22" },
  "exports": {
    ".": "./src/index.ts",
    "./integration": "./integration.mjs",
    "./schema": "./src/config/schema.ts",
    "./defaults": "./src/config/defaults.ts",
    "./utils/*": "./src/utils/*",
    "./i18n/*": "./src/i18n/*",
    "./components/Head.astro": "./src/components/Head.astro",
    "./components/*": "./src/components/*",
    "./layouts/BaseLayout.astro": "./src/layouts/BaseLayout.astro",
    "./layouts/*": "./src/layouts/*"
  },
  "files": ["src", "assets", "integration.mjs"],
  "dependencies": { "yaml": "^2.9.1", "zod": "^4.6.7" },
  "peerDependencies": { "astro": "^7.0.0" },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }
}
```

要点：

- `private` 删除、`version` → `1.0.0`。
- `yaml` 从 `devDependencies` 提到 `dependencies`（`devDependencies` 随之删空并移除该字段）。
- `license` 取 `GPL-3.0` 与仓库根 `LICENSE` / README「许可证」小节一致（SPDX 严格写法应为 `GPL-3.0-only`，但那要改 README 的表述，超出本任务写范围；此处与仓库口径对齐）。
- `peerDependencies.astro` 取 `^7.0.0`：仓库实际用 `7.4.13`（[examples/blog/package.json](../../examples/blog/package.json)、迁移产物 `^7.4.13`），主题源码只碰 `astro:content` / `astro:transitions` / `astro:transitions/client` 这几个 7.x 稳定的虚拟模块，不需要锁小版本。
- `publishConfig.registry` 是为本机环境加的：`npm config get registry` = `https://registry.npmmirror.com`，镜像没有 publish 能力；钉到官方源后 `npm publish --dry-run` 实测输出 `Publishing to https://registry.npmjs.org/ ...`。
- `exports` 只**新增**两条通配子路径，未动既有条目（见 §1.5）。
- `files` 保持 `["src", "assets", "integration.mjs"]`：npm 自动附带 `package.json`，所以 tarball = `src/` + `assets/` + `integration.mjs` + `package.json`。

### 1.3 版本号为什么是 1.0.0

P7-6 的验收口径是「首个版本」（[PLAN P7-6](../../docs/PLAN.md) 第 544 行：产出「首个版本、主题包发布、示例站部署」，验收「`npm i` 后用起来」）。用 `1.0.0` 而不是 `0.1.0` 的理由：

1. **它已经能被消费**：本笔记 §3 的 tarball 冒烟证明「安装 → 接 `anzhiyuAssets()` → 构建 94 页」全链路通；48 页基线 diff 0、真实站验收在另一条线上收敛。`0.x` 在 semver 里表示「随时可能破坏」，与当前事实不符。
2. **导出面已经需要承诺**：`exports` 里的 `.`、`./integration`、`./schema`、`./defaults`、`./utils/*`、`./i18n/*`、`./components/*`、`./layouts/*` 一旦有人写进站点就构成契约；`1.0.0` 是把「破坏要跳大版本」这条规矩先立起来。
3. **首个 publish 应该干净**：0.0.0 → 1.0.0 直接首发，避免在 npm 上留一串 0.x 历史后再被 `latest` 指向。

配套：npm dist-tag 用默认 `latest`；git tag 用 `v1.0.0`（见 §5）。后续按 semver 递增：修复 `1.0.1`、新功能 `1.1.0`、破坏性 `2.0.0`。

### 1.4 运行时依赖核对（扫 `packages/astro-theme-anzhiyu/src/**` 的全部 import）

非相对导入只有 6 个来源：

| import | 文件 | 归类 |
| --- | --- | --- |
| `zod` | `src/config/schema.ts`（被包入口导出） | `dependencies` ✅ |
| `yaml` | `src/config/loader.ts`（被包入口导出） | `dependencies` ✅（本轮从 devDeps 修正） |
| `node:fs` / `node:path` | loader、data 等 | Node 内置，无需声明 |
| `astro:content` / `astro:transitions` / `astro:transitions/client` | 组件与布局 | Astro 虚拟模块 → `peerDependencies.astro` ✅ |

`integration.mjs` 只用 `node:fs` / `node:path` / `node:url`，零第三方依赖。`assets/js/**` 是浏览器脚本，不参与打包依赖图。

**不**属于主题包依赖、但站点侧必需（版本取自 [examples/blog/package.json](../../examples/blog/package.json) 与迁移产物 `.migration-out/xcAnzhiyu/package.json`，两边一致）：

| 依赖 | 版本 | 归属 | 说明 |
| --- | --- | --- | --- |
| `astro` | `^7.4.13`（peer 声明 `^7.0.0`） | 站点 dependencies | 框架 |
| `@astrojs/markdown-remark` | `^7.3.10` | 站点 dependencies | 自定义 Unified 处理器（Hexo tag / `figure.highlight`） |
| `yaml` | `^2.9.1` | 站点 dependencies（迁站自己也会声明，用于站点侧配置；主题包自带的 yaml 不共享） | YAML |
| `highlight.js` | `^11.12.0` | 站点 devDependencies | 代码块 token 着色，缺失时降级 |
| `stylus` | `^0.64.0` | 站点 devDependencies | 编译上游 74 个 `.styl` |
| `vite-plugin-stylus-hexo-config` | `0.1.0`（workspace / `file:`） | 站点 devDependencies | Stylus 的 `hexo-config()` 替换 |
| `remark-hexo-tag` | `0.1.0`（workspace / 相对路径） | 站点侧 | 42 个 Hexo tag |

> 后三个（`vite-plugin-stylus-hexo-config`、`remark-hexo-tag`）**都还没发布到 npm**，是「仓库外 `npm i` 就能用起来」的真实缺口，见 §8。

### 1.5 为什么补 `./utils/*` 与 `./i18n/*`

迁移产物（`.migration-out/xcAnzhiyu`）里有 15 处「相对路径导入主题源码」，其中：

- 11 处落在 `src/layouts/*`、`src/components/*` → 已有 `./layouts/*`、`./components/*` 覆盖；
- 4 处落在 `src/utils/date.ts`（×2）、`src/utils/helpers.ts`、`src/i18n/index.ts` → 原 `exports` 没有对应子路径，包外消费者无法 import。

补两条通配导出后，§3 的 consumer 冒烟才能把 60 处主题导入**全部**改成包名子路径（而不是留一半相对路径假装通过），这也是「发布包能被真实站点消费」的最小 API 面。迁移脚本 `scripts/migrate-hexo.mjs` 现在仍生成相对导入（不在本任务写范围），后续要么改成包名子路径、要么继续依赖 monorepo 布局——见 §8。

---

## 2. `npm pack`：结构与字节

命令（在 `packages/astro-theme-anzhiyu/`）：

```powershell
$env:CODEBUDDY_SAFE_DELETE_ENABLED="0"
# 本机 npm 默认缓存目录在 workspace 之外（DSH 沙箱拒绝写入），必须把 cache 指到仓库内
$cache = 'D:\Git-project\astro-theme-anzhiyu\.migration-out\.npm-cache'
npm pack --dry-run --json --cache $cache
npm pack --pack-destination D:\Git-project\astro-theme-anzhiyu\.migration-out\p7-6-pack --cache $cache
```

> 操作细节：npm 默认 cache `C:\Users\...\AppData\Local\npm-cache` 在本会话的 workspace-write 沙箱下会报 `EPERM`，所以统一加 `--cache .migration-out/.npm-cache`（已在 `.migration-out/` 下，gitignored）。

### 2.1 断言结果

- `entryCount = 173`，且**只有**四类顶层条目：

| 顶层 | 文件数 |
| --- | --- |
| `src/` | 160 |
| `assets/` | 11 |
| `integration.mjs` | 1（8608 B） |
| `package.json` | 1（1906 B） |

- 泄漏检查：`node_modules` / `.astro` / `dist` / `docs` / `scripts` / `.migration-out` / `.github` 命中 **0** 条。
- 说明：包内**没有** `README.md` / `LICENSE`（包目录本身没有这两个文件，npm 只自动附带存在的 README/LICENSE）。`files` 白名单没有放 `scripts/`，`src/` 里被 `src/index.ts` 引用的文件都在包里（`src/i18n/locales/*.yml` 4 个 YAML 语言包也在，见清单）。

### 2.2 `--dry-run --json` 节选（完整 JSON 落在 `.migration-out/p7-6-pack/pack-dry-run-1.0.0.json`）

```json
{
  "name": "astro-theme-anzhiyu",
  "version": "1.0.0",
  "size": 287951,
  "unpackedSize": 974882,
  "shasum": "a171d317c21955467726663e69383ec0655b7619",
  "filename": "astro-theme-anzhiyu-1.0.0.tgz",
  "entryCount": 173
}
```

### 2.3 真实 tarball 身份

| 项 | 值 |
| --- | --- |
| 文件 | `.migration-out/p7-6-pack/astro-theme-anzhiyu-1.0.0.tgz` |
| 字节 | **287951**（287.0 kB，`size` 与 dry-run 一致） |
| 条目 | **173** |
| npm shasum (sha1) | `a171d317c21955467726663e69383ec0655b7619`（与 dry-run 的 `shasum` 一致，已用 `Get-FileHash -Algorithm SHA1` 复核） |
| SHA-256 | `D7B59BF59668558C529C2BFB887EA5B585AFE8D3A485A254E8818C070833F4FC` |
| pack 时间 | 2026-11-24 20:25:03 |
| unpacked | 974882 B |

> **快照说明**：pack 时工作区里 task-14（另一个 agent）正在改 `src/components/head/runtime.ts`（mtime 20:23:02），该改动已被打进上面的 tarball，consumer 冒烟用的就是这一份。截至本笔记收尾（20:32），`packages/astro-theme-anzhiyu/src` + `assets` 的最新 mtime 仍是 20:23:02，**即本 tarball 与当前工作区一致**；但真发布前仍须在最终 release commit 上重跑 `npm pack` 并更新本表 sha256/shasum（后续任何 src 改动都会改变字节数）。结构断言（173 项 = 160 src + 11 assets + 2 顶层）不会变。

### 2.4 与改动前（0.0.0）的对比

改动前同一命令：`entryCount 173 / size 286098 / unpackedSize 970152 / shasum a705ca359c2f555459d8111b3afd7b4e33860301`。
结构完全一致（173 项），字节差 ≈ +1.8 kB 来自 `package.json` 元数据与 `src` 在两次 pack 之间的改动（task-14）。也就是说：**这次元数据改动没有让包变胖或混进新文件**。

---

## 3. tarball 安装到 consumer 并构建（关键冒烟）

### 3.1 consumer 构造

```powershell
# 1) 复制迁移产物（不带 node_modules / .astro / dist，保证 install 是全新的）
robocopy .migration-out\xcAnzhiyu .migration-out\p7-6-consumer /E /MT:16 /XJ /XD node_modules .astro dist
# 2) 改写：60 处主题相对导入 → 包名子路径；astro.config.mjs 接 anzhiyuAssets()；主题依赖换成 tarball 绝对路径
node .migration-out\prepare-p7-6-consumer.mjs
# 3) 安装（--ignore-workspace 避免被仓库 workspace 接管；--force 重新解析）
cd .migration-out\p7-6-consumer
pnpm install --ignore-workspace --force --no-frozen-lockfile
```

最终 `package.json` 里：

```json
"dependencies": {
  "@astrojs/markdown-remark": "^7.3.10",
  "astro": "^7.4.13",
  "astro-theme-anzhiyu": "file:D:/Git-project/astro-theme-anzhiyu/.migration-out/p7-6-pack/astro-theme-anzhiyu-1.0.0.tgz",
  "yaml": "^2.9.1"
}
```

`astro.config.mjs` 的接法（就是 README 里的三行）：

```js
import { defineConfig } from 'astro/config'
import anzhiyuAssets from 'astro-theme-anzhiyu/integration'
// ...
export default defineConfig({
  integrations: [anzhiyuAssets()],
```

改写结果：`src` 里 60 处主题导入 / 12 个文件全部换成包名子路径，残留相对导入 **0** 处（脚本第 4 步自检输出）。consumer 里不再有任何 `packages/astro-theme-anzhiyu` 相对路径，所以构建能通过只可能来自 tarball 安装。

> 关于任务里的「删 `node_modules/astro-theme-anzhiyu`」：这里用更严格的做法——复制 consumer 时整棵 `node_modules/` 不复制，安装从零生成，因此不存在任何旧版 `file:` 安装的残留（原 `xcAnzhiyu/node_modules/astro-theme-anzhiyu` 还是个指向旧版 `.pnpm` 快照的 junction，旧 `package.json` 里 `files: ["src"]`、`exports` 也没有 `./integration`，带着它测等于没测）。

> 为什么必须改写：迁移产物原来一律用 `../../../../packages/astro-theme-anzhiyu/src/...` 相对导入，这种写法在原仓库内能跑，但**根本不会读 node_modules**，拿它做冒烟等于没测到 tarball。改成包名子路径后，每一条导入都必须经过 `exports` + node_modules 解析。

### 3.2 安装结果（resolved 证据）

```
dependencies:
+ @astrojs/markdown-remark 7.3.10
+ astro 7.4.13
+ astro-theme-anzhiyu 1.0.0
+ yaml 2.9.1
devDependencies:
+ highlight.js 11.12.0
+ stylus 0.64.0
+ vite-plugin-stylus-hexo-config 0.1.0
Done in 9.7s using pnpm v10.29.3
```

- 落盘位置（Windows junction）：`node_modules/astro-theme-anzhiyu` → `node_modules/.pnpm/astro-theme-anzhiyu@file+.._37b1d49f37040462f324d65b2572dc9e/node_modules/astro-theme-anzhiyu`
- 装进去的内容：`assets/  integration.mjs  node_modules/  package.json  src/`，`package.json` 的 `version = 1.0.0`、`dependencies = {yaml, zod}`、`peerDependencies = {astro}`。
- `import.meta.resolve()`（在 consumer 目录执行）：

```
astro-theme-anzhiyu                               -> .../p7-6-consumer/node_modules/astro-theme-anzhiyu/src/index.ts
astro-theme-anzhiyu/integration                   -> .../p7-6-consumer/node_modules/astro-theme-anzhiyu/integration.mjs
astro-theme-anzhiyu/layouts/BaseLayout.astro      -> .../astro-theme-anzhiyu/src/layouts/BaseLayout.astro
astro-theme-anzhiyu/components/post/PostCard.astro-> .../astro-theme-anzhiyu/src/components/post/PostCard.astro
astro-theme-anzhiyu/utils/date.ts                 -> .../astro-theme-anzhiyu/src/utils/date.ts
astro-theme-anzhiyu/i18n/index.ts                 -> .../astro-theme-anzhiyu/src/i18n/index.ts
astro-theme-anzhiyu/schema                        -> .../astro-theme-anzhiyu/src/config/schema.ts
```

- 依赖是否真的由 tarball 的声明带入（从**安装后真实路径** `.pnpm/.../node_modules/astro-theme-anzhiyu/src/config/loader.ts` 起解析，避开 junction 字面路径向上逃逸到仓库根 `node_modules` 的假阳性）：

```
zod   -> .../p7-6-consumer/node_modules/.pnpm/astro-theme-anzhiyu@file+.._37b1.../node_modules/zod/index.cjs
yaml  -> .../p7-6-consumer/node_modules/.pnpm/astro-theme-anzhiyu@file+.._37b1.../node_modules/yaml/dist/index.js
astro -> .../p7-6-consumer/node_modules/.pnpm/astro-theme-anzhiyu@file+.._37b1.../node_modules/astro/dist/index.js
```

即 `dependencies: {yaml, zod}` + `peerDependencies: {astro}` 全部由安装器解析到位（`yaml` 从 devDeps 修正成 deps 这一步被这条证据覆盖）。

### 3.3 构建（持 `.build.lock`，`CODEBUDDY_SAFE_DELETE_ENABLED=0`）

```powershell
$lock = 'D:\Git-project\astro-theme-anzhiyu\.build.lock'
# mkdir 循环抢锁（最多等 ~15 分钟），build 结束 Remove-Item 释放
pnpm build   # = astro build && node scripts/normalize-html-output.mjs
```

原始输出（`.migration-out/p7-6-consumer-build.log`）：

```
> xcanzhiyu-astro@ build D:\Git-project\astro-theme-anzhiyu\.migration-out\p7-6-consumer
> astro build && node scripts/normalize-html-output.mjs
...
20:25:35 [anzhiyu-assets] 复制 11 个主题静态资源 → dist
20:25:35 [build] 94 page(s) built in 6.78s
20:25:35 [build] Complete!
[normalize-html-output] 平文件化 1 处 .html 目录
BUILD EXIT: 0
```

日志里唯一的 `[WARN]` 是站点自身的：

```
[WARN] [vite]
/img/comment_bg.png referenced in /img/comment_bg.png didn't resolve at build time, it will remain unchanged to be resolved at runtime
```

——迁移产物 `public/img/` 里本来就没有 `comment_bg.png`（源站快照如此），与主题包无关，也不阻断构建。

### 3.4 产物断言

| 断言 | 结果 |
| --- | --- |
| 构建 exit code | **0** |
| HTML 页数 | **94**（= 迁移产物原 `dist` 的 94 页，无新增/丢失） |
| `/js/main.js` | ✅ 64181 B，sha256 `4EC67D72C398F2C7…`，与主题包 `assets/js/main.js` 逐字节一致 |
| `/css/index.css` | ✅ 297 B，sha256 `54CECD1534632545…`，与主题包 `assets/css/index.css` 一致 |
| `/posts/pXXXX/` | ✅ 22 个目录（`p1b75e3c5`、`p1c0fbc06`、`p3eeb`…） |
| 其余主题资源 | ✅ `/js/utils.js`(50562B) `/js/tw_cn.js`(19416B) `/js/anzhiyu/ai_abstract.js`(14216B) `/js/search/local-search.js`(9525B) 等全部就位 |
| `dist/js` | 17 个文件 = 站点 `public/js` 7 + 主题 10 |
| `dist/css` | 5 个文件 = 站点 `public/css` 4 + 主题 `index.css` 1 |
| `[anzhiyu-assets]` | `复制 11 个主题静态资源 → dist`（无冲突 warn） |

**与冒烟前的对照**：复制源的 `.migration-out/xcAnzhiyu/dist` 里 `dist/js/main.js`、`dist/css/index.css` 都**不存在**（它那一版没接 `anzhiyuAssets()`），页面里的 `/js/main.js` 等引用是 404。冒烟 consumer 接上 integration 后才补齐——这正是 P7-6 静态资源接线在「npm 安装」形态下的验证。

---

## 4. 发布：前置、命令、验证

### 4.1 前置（人工，逐条）

1. **登录官方源**：`npm whoami --registry https://registry.npmjs.org` 必须返回用户名。本机实测：

   ```
   npm error code ENEEDAUTH
   npm error need auth This command requires you to be logged in.
   ```

   登录方式二选一：`npm login --registry=https://registry.npmjs.org`（交互）或写 `.npmrc` 的 `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`（CI/自动化，**token 不进仓库**）。
2. **注意镜像**：本机 `npm config get registry` = `https://registry.npmmirror.com`。**npmmirror 不接受 publish**。包内 `publishConfig.registry` 已把发布目标钉到官方源，`npm publish --dry-run` 实测输出：

   ```
   npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
   + astro-theme-anzhiyu@1.0.0
   ```
3. **名称可用**：`npm view astro-theme-anzhiyu version --registry https://registry.npmjs.org` → `E404 Not Found`（官方 registry 上还没有这个包，名称未被占用）。
4. **2FA**：账号开了 two-factor 时 `npm publish --otp <6 位>`。
5. **发布物是最终代码**：先按 §2 重跑 `npm pack`，确认 173 项结构 + 记录新的 sha256（当前快照含并发改动，见 §2.3 说明）。

### 4.2 命令（`packages/astro-theme-anzhiyu/` 下）

```bash
npm pack --dry-run                     # 清单自检
npm publish --dry-run                  # 校验 registry/access/tag，不需要登录
npm publish --access public            # 真发布（2FA：追加 --otp 123456）
# 备选：npm publish --tag next（预发/灰度时用非 latest dist-tag）
```

不要用 `pnpm publish`（本仓库没有为发布场景验证过 pnpm 的 workspace 处理，npm 是实测路径）。

### 4.3 发布后验证

```bash
npm view astro-theme-anzhiyu@1.0.0 dist.tarball dist.integrity
mkdir /tmp/smoke && cd /tmp/smoke && npm init -y && npm i astro-theme-anzhiyu@1.0.0
node -e "console.log(require('astro-theme-anzhiyu/package.json').version)"
```

出问题时：72 小时内且无依赖者可用 `npm unpublish astro-theme-anzhiyu@1.0.0`（npm 策略限制），否则只能 `1.0.1` 修；**不要**改已发布版本的 tarball。

---

## 5. git tag 策略（本地打标签，**不 push**）

```bash
# 发布前后、在 release commit 上：
git tag -a v1.0.0 -m "astro-theme-anzhiyu v1.0.0"
git tag -l            # 本机当前没有任何 tag（git tag -l 实测为空）
```

- 命名：`v` + 与 `package.json` 完全一致的版本号（`v1.0.0`），与 npm `latest` 对应。
- **`git push origin v1.0.0` / `git push --tags` 不在自动化范围**，需要作者单独授权（AGENTS 规范：默认禁止任何修改远程的操作；本轮执行环境也禁止 git 写操作）。
- 顺序建议：`npm publish` 成功 → 打本地 tag → 人工 push tag。tag 只是标记，重新打不回溯 npm 版本；先 publish 后 tag 可以避免 tag 指向一个发布失败的 commit。

---

## 6. demo 站部署：命令与授权边界

脚本：`scripts/deploy-demo-pages.mjs`（**本轮未执行**）。

```bash
# 默认目标：https://mcxiaochenn.github.io/blog/ ，仓库 mcxiaochenn/mcxiaochenn.github.io @ main
node scripts/deploy-demo-pages.mjs

# 可选环境变量覆盖
# DEMO_PAGES_REPO / DEMO_PAGES_PATH / DEMO_PAGES_URL / DEMO_PAGES_BRANCH
```

它做四件事：

1. `pnpm --filter blog build`，注入 `DEPLOY_SITE_URL` / `DEPLOY_SITE_ROOT`（→ `site.url` / `site.root` / Astro `base`）；
2. 后处理 HTML：给没带子路径的站内绝对路径统一补 `/blog` 前缀；
3. `git clone --depth 1` 用户 Pages 仓库 → 删/覆盖 `blog/` → 补 `.nojekyll` → `git add` / `commit`；
4. `git push origin main`（Pages 会自动重建，1–2 分钟生效）。

**授权边界（必须写清）**：

- 该脚本会**写另一个仓库**并 push 到它的 `main`。除非作者明确授权，否则不许执行；本仓库的 CI（`.github/workflows/ci.yml`）里也**没有**部署/publish job（grep `publish|deploy` 无命中）。
- 执行前提：本机对 `mcxiaochenn/mcxiaochenn.github.io` 有 push 凭据（git credential / token）；`git push`、`git push --tags`、GitHub Pages 触发都不在自动流程里。
- 影响范围：只覆盖用户站仓库的 `blog/` 子目录（可能新增根 `.nojekyll`），用户站其它内容不受影响。
- 已知降级：子路径部署下上游 JS 的运行时路径（`/json/music.json`、音乐球、搜索等）不生效；页面导航 / 样式 / 视觉不受影响。
- 本轮本机无浏览器（PLAN R12），demo 现网的浏览器验证与 P7-2 性能测量一并留到 CI / 人工，本笔记不做浏览器结论。

---

## 7. 人工步骤清单（按顺序，全部需要授权）

0. [ ] **先更新根 `pnpm-lock.yaml`（跨任务，不在本任务写范围）**：主题包 `yaml` 从 `devDependencies` 挪到 `dependencies` 后，锁文件 importer 仍写着 `dependencies: zod` / `devDependencies: yaml`，与改后的 `package.json` 不一致。CI 两个 job 都是 `pnpm install --frozen-lockfile`（`.github/workflows/ci.yml:37`、`:105`），会报 `ERR_PNPM_OUTDATED_LOCKFILE`。修法：在仓库根 `pnpm install --lockfile-only`（或完整 `pnpm install`）后提交 `pnpm-lock.yaml`。本任务写范围只有 `packages/astro-theme-anzhiyu/package.json` + `README.md` + `docs/notes/**`，锁文件留给 Lead 批量落地。
1. [ ] 在最终 commit 上重跑 `npm pack --dry-run`，确认 173 项、无 `node_modules/.astro/dist/docs` 泄漏，记录新 sha256。
2. [ ] `npm login --registry=https://registry.npmjs.org`（或配 `//registry.npmjs.org/:_authToken`），再 `npm whoami --registry https://registry.npmjs.org` 返回用户名。
3. [ ] `npm publish --dry-run` 输出 `Publishing to https://registry.npmjs.org/ ...`。
4. [ ] `npm publish --access public`（2FA 加 `--otp`）。
5. [ ] `npm view astro-theme-anzhiyu@1.0.0 dist.tarball` + 空目录 `npm i` 冒烟。
6. [ ] `git tag -a v1.0.0 -m "astro-theme-anzhiyu v1.0.0"`（本地）。
7. [ ] **单独授权后**：`git push origin v1.0.0`。
8. [ ] **单独授权后**：`node scripts/deploy-demo-pages.mjs`（会推 `mcxiaochenn/mcxiaochenn.github.io`）。
9. [ ] 提醒：发布包缺 `README.md` / `LICENSE` 文件（见 §8 #1），若在意 npm 页面展示，先补文件再发。

---

## 8. 未做事项 / 已知边界（都写清了为什么）

1. **包级 README / LICENSE 未进 tarball**：`packages/astro-theme-anzhiyu/` 目录里没有 `README.md` / `LICENSE`（根目录才有），npm 不会把它们塞进包。结果：npm 包页面没有 README，GPL-3.0 只靠 `package.json` 的 `license` 字段声明。补法是把根 `LICENSE` 拷进包目录（或 `files` 加白名单），再决定是否写一份包级 README——超出本轮写范围（包目录只允许改 `package.json`），留作发布前 checklist 第 9 条。
2. **真 `npm publish` 未执行**：`npm whoami` = `ENEEDAUTH`，且任务明确禁止真发布。只做了 `npm publish --dry-run`（本地校验，不联网发布）。
3. **`git tag` / `git push` 未执行**：本会话禁止 git 写操作；tag 策略写在 §5，命令留给人工。
4. **demo Pages 未推送**：会写另一个仓库，未获授权（§6）。
5. **两个配套 workspace 包未发布**：`vite-plugin-stylus-hexo-config@0.1.0`、`remark-hexo-tag@0.1.0` 仍是 workspace/`file:` 依赖。仓库外「装主题包 + 接 Hexo tag + 编上游样式」还需要它们先发 npm（或 git/tarball 引用）。这是「`npm i` 直接用起来」的最后一公里，建议 P7-6 收尾时一起发（各自 package.json 已有 `license`/`repository`，缺 `version 1.0.0`/`private` 清理/`publishConfig` 等同类元数据，可以照本笔记 §1.2 的做法照抄）。
6. **迁移脚本仍生成相对导入**：`scripts/migrate-hexo.mjs` 生成的都是 `../../packages/astro-theme-anzhiyu/src/...`，对「在 monorepo 内构建」没问题，对「只装 npm 包的独立项目」不可用。本任务只补了 `exports` 子路径，没有改迁移脚本（写范围外）。后续应把生成模板改成包名子路径，本笔记 §3.1 的改写脚本（`.migration-out/prepare-p7-6-consumer.mjs`）可以直接作为映射表参考。
7. **`types` 条件导出未加**：`exports` 目前是纯字符串形式，TS 用户靠 `bundler` 解析能拿到 `.ts` 源码类型，但没有显式 `types` condition。加它需要把每个导出写成对象形态，风险大于收益，留作后续。
8. **包内 `scripts/` 字段指向没进包的文件**：`package.json` 里 7 个 `check:*` / `gen:defaults` 脚本引用 `./scripts/*`，而 `scripts/` 不在 `files` 里。消费者不会执行这些脚本，无实际影响；若在意可把 `scripts` 从发布清单语义里摘掉（本任务保持原样，避免改开发工作流）。
9. **浏览器 / 性能验证**：本机 DSH 沙箱起不了 Playwright/Chromium/Lighthouse（PLAN R12），demo 页与性能预算（P7-2）只能走 CI。
10. **快照与并发**：本笔记所有字节数/哈希对应 20:25:03 的 pack 快照；task-14 同时在改 `src/components/head/runtime.ts`，该改动已包含在快照里。真发布前重跑 pack 并按 §4.1 第 5 条更新记录。
11. **`pnpm-lock.yaml` 未同步（跨任务，唯一会让 CI 变红的副作用）**：`yaml` 从 `devDependencies` 挪到 `dependencies` 后锁文件 importer（`packages/astro-theme-anzhiyu: {dependencies: {zod}, devDependencies: {yaml}}`）与 `package.json` 不再一致；CI 两个 job 的 `pnpm install --frozen-lockfile` 会报 `ERR_PNPM_OUTDATED_LOCKFILE`。根 `pnpm-lock.yaml` 不在本任务写范围，需 Lead 在仓库根执行 `pnpm install --lockfile-only` 后提交。**不影响**本笔记的 pack / tarball 安装 / consumer 构建结论——那三步都不经过 workspace 锁文件。

---

## 9. 复跑指引（scratch 文件都在 gitignored 的 `.migration-out/` 下）

| 路径 | 内容 |
| --- | --- |
| `.migration-out/p7-6-pack/astro-theme-anzhiyu-1.0.0.tgz` | 本轮 pack 产物（287951 B / 173 项） |
| `.migration-out/p7-6-pack/pack-dry-run-1.0.0.json` | `npm pack --dry-run --json` 完整输出 |
| `.migration-out/p7-6-pack-backup/` | 20:21 第一版 tarball 备份（结构相同、src 较早，仅作对照） |
| `.migration-out/p7-6-consumer/` | 迁移站 consumer（tarball 安装后的 node_modules + dist） |
| `.migration-out/p7-6-consumer-build.log` | consumer 构建完整日志（exit 0 / 94 页） |
| `.migration-out/prepare-p7-6-consumer.mjs` | consumer 改造脚本（60 处导入改写 / integration 接线 / 依赖替换），可复用 |
| `.migration-out/.npm-cache/` | workspace 内的 npm 缓存（本机沙箱要求） |

复跑顺序：

```powershell
$env:CODEBUDDY_SAFE_DELETE_ENABLED="0"
cd D:\Git-project\astro-theme-anzhiyu\packages\astro-theme-anzhiyu
npm pack --pack-destination ..\..\.migration-out\p7-6-pack --cache ..\..\.migration-out\.npm-cache
cd ..\..\.migration-out
# 若 p7-6-consumer 已存在，先确认路径后删除再复制
robocopy xcAnzhiyu p7-6-consumer /E /MT:16 /XJ /XD node_modules .astro dist
node prepare-p7-6-consumer.mjs
cd p7-6-consumer; pnpm install --ignore-workspace --force --no-frozen-lockfile
# 抢 .build.lock 后：
pnpm build
```

**改动文件（本任务写范围内共 3 个）**：
`packages/astro-theme-anzhiyu/package.json`、`README.md`（新增「安装 / 使用 / 发布」一章）、`docs/notes/P7-6-release.md`（本文件）。
