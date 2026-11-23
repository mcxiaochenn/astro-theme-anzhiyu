# P1-6 基准固化 + 内容 fixture

**任务**：用上游 `hexo-theme-anzhiyu` 1.7.1（commit `72439d93`）+ 固定内容 fixture + 固定配置，真实跑一次 `hexo g`，把参考产物的摘要固化到 `docs/baseline.json`。

**结论先行**：基准可用。上游参考站点构建成功（75 个文件，48 个 HTML），`public/css/index.css` = **683 218 字节 / gzip 79 124 字节 / SHA-256 `7c1b1ec0…a07f61`**；同一份输入连续 4 次构建（含 clean 与增量、含/不含 db.json）产物清单 SHA-256 完全一致；10 篇 fixture 覆盖附录 B 的 **42 个 Hexo tag 全部**，构建日志零 WARN / 零 ERROR。

为了「可复现」，在上游主题之外加了 3 个站点级归一化（冻结生成页时间戳、排序模型数据、关闭 fragment_cache），这三条约定在 §5.3 写清，Astro 侧实现必须按同样约定输出才能逐字节对齐。

---

## 1. 环境与版本

| 项 | 值 | 证据 |
| --- | --- | --- |
| OS | Windows 11 10.0.26300 | `hexo version` 输出 |
| Node | v24.22.0 | `node -v` |
| npm | 11.13.0 | `npm -v` |
| hexo | **7.3.0**（站点本地依赖） | `npx hexo version` → `hexo: 7.3.0` |
| hexo-cli | 4.3.2（随 hexo 7.3.0 依赖装入 node_modules） | 同上 |
| hexo-renderer-marked | 7.0.1 | `.baseline-work/package.json` |
| hexo-renderer-pug | 3.0.0 | 同上 |
| hexo-renderer-stylus | 3.0.1 | 同上 |
| hexo-generator-index / archive / category / tag | 4.0.0 / 2.0.0 / 2.0.0 / 2.0.0 | 同上 |
| 上游主题 | 1.7.1，HEAD `72439d93936b63da59a4a1195f64de9f952f6cc1` | `git -C _research/anzhiyu-upstream rev-parse HEAD` |
| 上游工作区 | 干净（未被我改动） | `git -C _research/anzhiyu-upstream status --porcelain` 输出为空 |
| 主题拷贝一致性 | 331 文件逐文件 SHA-256 与上游一致（diff=0） | 见 §5.2 校验命令 |

选 hexo 7.3.0 而不是 8.x：上游 `scripts/events/stylus.js` 里有 `if (syntaxHighlighter)` 的 Hexo >7.0 分支，7.3.0 正好命中该分支；7.x 是 1.7.1 发布时的主流版本线。版本已写死，换机器必须同版本。

---

## 2. 交付物（都在允许写范围内）

| 路径 | 内容 |
| --- | --- |
| `fixtures/*.md`（10 个） | 9 篇文章 + 1 个独立页（about 类） |
| `fixtures/about-data.yml` | `about` 模板需要的 `source/_data/about.yml` 数据（支撑文件，不计入 10 篇） |
| `docs/baseline.json` | 基准摘要（schema 见 §4） |
| `docs/notes/P1-6-baseline.md` | 本报告 |
| `.baseline-work/` | 临时 Hexo 工程（已加入 `.gitignore`，产物不进仓库） |
| `.gitignore` | 追加一行 `.baseline-work/` |

完整产物（`public/`，75 文件）留在 `.baseline-work/public/`，被 gitignore 忽略；CI 需要时按 §3 现场重建。

---

## 3. 换机器复现步骤

### 3.1 目录布局

```
D:\Git-project\astro-theme-anzhiyu\.baseline-work\
├── _config.yml                 # 站点配置（见 §3.2）
├── package.json                # 依赖锁定（见 §3.2）
├── scripts\reproducible.js     # 站点级归一化（见 §3.2）
├── tools\extract-baseline.mjs  # 生成 docs/baseline.json（见 §3.2）
├── tools\hash-manifest.mjs     # 产物 SHA-256 清单（确定性验证）
├── themes\anzhiyu\             # 上游主题整棵拷贝（不含 .git）
├── source\_posts\*.md          # fixtures 中 9 篇文章
├── source\about\index.md       # fixtures/about-page.md
├── source\_data\about.yml      # fixtures/about-data.yml
└── public\                     # hexo g 产物（不提交）
```

### 3.2 关键文件（可直接抄）

`.baseline-work/package.json`：

```json
{
  "name": "anzhiyu-baseline-work",
  "version": "1.0.0",
  "private": true,
  "description": "Temp Hexo site that generates the upstream AnZhiYu 1.7.1 reference build for P1-6",
  "scripts": { "build": "hexo generate" },
  "hexo": { "version": "7.3.0" },
  "dependencies": {
    "hexo": "7.3.0",
    "hexo-generator-archive": "2.0.0",
    "hexo-generator-category": "2.0.0",
    "hexo-generator-index": "4.0.0",
    "hexo-generator-tag": "2.0.0",
    "hexo-renderer-marked": "7.0.1",
    "hexo-renderer-pug": "3.0.0",
    "hexo-renderer-stylus": "3.0.1"
  }
}
```

> `"hexo": { "version": "7.3.0" }` 不能省：hexo-cli 4.3.2 的 `find_pkg` 只认 `package.json` 里的 `hexo` 对象，没有这个块时 CLI 会退化成「只显示 help/init/version」。

`.baseline-work/_config.yml`：

```yaml
title: AnZhiYu Baseline
subtitle: '上游 1.7.1 参考产物'
description: 'hexo-theme-anzhiyu 1.7.1 在固定内容与固定配置下的参考构建'
keywords: 'Hexo,AnZhiYu,baseline'
author: AnZhiYu Baseline
language: zh-CN
timezone: 'Asia/Shanghai'

url: https://baseline.anzhiyu.test
root: /
permalink: :year/:month/:day/:title/
permalink_defaults:
pretty_urls:
  trailing_index: true
  trailing_html: true

source_dir: source
public_dir: public
tag_dir: tags
archive_dir: archives
category_dir: categories
code_dir: downloads/code
i18n_dir: :lang
skip_render:

new_post_name: :title.md
default_layout: post
titlecase: false
external_link:
  enable: true
  field: site
  exclude: ''
filename_case: 0
render_drafts: false
post_asset_folder: false
relative_link: false
future: true
syntax_highlighter: highlight.js
highlight:
  line_number: true
  auto_detect: false
  tab_replace: ''
  wrap: true
  hljs: false
prismjs:
  preprocess: true
  line_number: true
  tab_replace: ''

index_generator:
  path: ''
  per_page: 6
  order_by: -date

default_category: uncategorized
category_map:
tag_map:

meta_generator: true

date_format: YYYY-MM-DD
time_format: HH:mm:ss
updated_option: 'date'

per_page: 6
pagination_dir: page

include:
exclude:
ignore:

theme: anzhiyu

archive_generator:
  enable: true
  per_page: 6
  yearly: true
  monthly: true
  daily: false

category_generator:
  enable: true
  per_page: 6

tag_generator:
  enable: true
  per_page: 6
```

关键取舍：

- `updated_option: 'date'`：默认 `mtime` 会让 `updated` 随文件拷贝时间漂移；
- `timezone: Asia/Shanghai`：固定日期格式化；
- `per_page: 6`：10 篇内容 → 首页/归档/分类/标签都出现第 2 页，覆盖分页分支；
- `archive_generator` 必须显式写：主题 `scripts/helpers/findArchiveLength.js:4` 直接读 `hexo.config.archive_generator`，缺这个块归档页会抛 `TypeError`。

主题配置不另写：`.baseline-work/themes/anzhiyu/_config.yml` 是上游 `_config.yml` 原样（1342 行），站点不写 `theme_config` 覆盖。主题里 `scripts/events/merge_config.js` 会补默认值。

`.baseline-work/scripts/reproducible.js`（站点级 Hexo 脚本，只在参考工程里存在）：

```js
'use strict';

// P1-6 可复现性补丁：只处理“顺序 / 时间”两类本就不稳定的字段，不动内容。
const FIXED_UPDATED = new Date('2026-01-01T00:00:00+08:00');
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Warehouse 的 Model.data 是按 _id 存的对象，重建对象即可改写遍历顺序。
function reorderModel(model, compare) {
  const next = {};
  for (const [, value] of Object.entries(model.data).sort((a, b) => compare(a[1], b[1]))) {
    next[value._id] = value;
  }
  model.data = next;
}

hexo.extend.filter.register(
  'before_generate',
  () => {
    reorderModel(
      hexo.model('Post'),
      (a, b) => b.date.valueOf() - a.date.valueOf() || byCodePoint(String(a.path), String(b.path))
    );
    reorderModel(hexo.model('Tag'), (a, b) => byCodePoint(String(a.name), String(b.name)));
    reorderModel(hexo.model('Category'), (a, b) => byCodePoint(String(a.name), String(b.name)));
    hexo.locals.invalidate();
  },
  5
);

hexo.extend.filter.register('template_locals', locals => {
  const page = locals.page;
  if (page && !page.__post && !page.__page) {
    page.updated = FIXED_UPDATED;
  }
});

// 主题大量 partial 用 {cache: true}，Hexo 的 partial 缓存按 view 路径缓存首次渲染结果；
// share partial 引用 page.cover（每页不同），先渲染谁取决于异步顺序 → 必须关掉。
hexo.extend.helper.register('fragment_cache', function (id, fn) {
  return typeof fn === 'function' ? fn() : '';
});
```

`.baseline-work/tools/extract-baseline.mjs`（摘要算法，另一路写比对脚本时照抄；完整文件随 `.baseline-work` 一起被 gitignore，逻辑如下）：

```js
// bytes          = fs.readFileSync(css).length
// gzipBytes      = zlib.gzipSync(cssBuf, { level: 9 }).length
// sha256         = createHash('sha256').update(buf).digest('hex')
// cssVars        = 按文件出现顺序扫描 /(--anzhiyu-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/，
//                  同名变量只保留第一次出现（:root 基础值），共 69 个
// pages          = walk(public/**/*.html)：
//                  public/index.html        → "/"
//                  public/foo/index.html    → "/foo/"
//                  public/404.html          → "/404.html"
//                  每项 { path, bytes, sha256 }
// fixtures       = 仓库 fixtures/ 下 *.md 文件名（按码点升序，10 个）
// baseline       = { commit: "72439d93", version: "1.7.1", generatedAt: new Date().toISOString() }
// 输出 ../docs/baseline.json（2 空格缩进 + 末尾换行）
```

`.baseline-work/tools/hash-manifest.mjs`：对 `public/` 下**全部**文件（不只 HTML）算 `{path, bytes, sha256}`，按 path 排序输出 JSON，用于确定性对比。

### 3.3 命令序列

```powershell
cd D:\Git-project\astro-theme-anzhiyu\.baseline-work

# 1. 主题整棵拷贝（不带 .git；上游 331 文件只读）
robocopy D:\Git-project\_research\anzhiyu-upstream themes\anzhiyu /E
Remove-Item -Recurse -Force themes\anzhiyu\.git

# 2. 依赖（见 §3.4 关于 --ignore-scripts 的说明）
$env:npm_config_cache = "$PWD\.npm-cache"
npm install --ignore-scripts --no-audit --no-fund

# 3. 同步 fixture 内容
New-Item -ItemType Directory -Force source\_posts, source\about, source\_data | Out-Null
Get-ChildItem ..\fixtures\*.md | Where-Object Name -ne 'about-page.md' |
  ForEach-Object { Copy-Item $_.FullName "source\_posts\$($_.Name)" -Force }
Copy-Item ..\fixtures\about-page.md source\about\index.md -Force
Copy-Item ..\fixtures\about-data.yml source\_data\about.yml -Force

# 4. 构建（权威序列）
npx hexo clean
npx hexo generate

# 5. 生成 docs/baseline.json
node tools/extract-baseline.mjs

# 6. 确定性：再跑一次 + 清单对比
npx hexo generate
node tools/hash-manifest.mjs public manifest-B.json
#   → 与上一次 manifest-A.json 对比 SHA-256
```

### 3.4 npm 安装的特殊说明

本机首次 `npm install` 时，某个依赖的 install script 在 DSH 沙箱里 `spawn EPERM`（`npm error code EPERM / Error: spawn EPERM`），改用 `--ignore-scripts` 后安装成功：`added 205 packages in 7s`。该参考工程只用到纯 JS 依赖（hexo / pug / stylus / marked / jsdom 等），没有需要用 install script 编译的原生模块，`--ignore-scripts` 不影响产物。普通机器上直接 `npm install` 即可。

另外 npm 默认缓存目录在用户目录（沙箱只允许写工作区），本机把 `npm_config_cache` 指到了 `.baseline-work\.npm-cache`（已被 `.gitignore` 整体忽略）。

---

## 4. baseline.json 数据表

### 4.1 schema

```json
{
  "baseline": { "commit": "72439d93", "version": "1.7.1", "generatedAt": "<ISO8601>" },
  "css": { "indexCssBytes": 683218, "indexCssGzipBytes": 79124, "indexCssSha256": "…", "cssVars": { "--anzhiyu-*": "…" } },
  "pages": [ { "path": "/", "bytes": 62256, "sha256": "…" } ],
  "fixtures": [ "about-page.md", "…" ]
}
```

- `generatedAt` 是唯一每次生成都会变的字段，**比对脚本必须忽略它**；其余字段实测 4 次构建不变（§5.2 有逐字节比较）。
- `pages` 共 **48** 条；`fixtures` 共 **10** 条；`cssVars` 共 **69** 个键。
- 文件：`docs/baseline.json`（11 295 字节）。

### 4.2 CSS

| 指标 | 值 | 怎么量 |
| --- | --- | --- |
| 路径 | `.baseline-work/public/css/index.css` | 上游 `source/css/index.styl` 经 hexo-renderer-stylus 全量编译 |
| 字节数 | **683 218** | `(Get-Item public\css\index.css).Length` |
| gzip 字节数 | **79 124** | `node -e "const b=require('fs').readFileSync('public/css/index.css');console.log(require('zlib').gzipSync(b,{level:9}).length)"` |
| SHA-256 | **`7c1b1ec08779d351f146b2120cbff4311c021073c457378b39bdeef074a07f61`** | `Get-FileHash public\css\index.css -Algorithm SHA256`，与 Node `crypto` 结果一致 |
| 行数 | 26 571 | `(Get-Content … | Measure-Object -Line).Lines` |
| 选择器块数 | 4 125（`{` 计数） | `node -e "console.log((require('fs').readFileSync('public/css/index.css','utf8').match(/\{/g)||[]).length)"` |

编译完整性抽查（9 个源目录都有产物选择器命中）：`#web_bg`×11、`#recent-posts`×61、`.page-title`×14、`.note`×161、`.timeline`×48、`.highlight`×86、`.fancybox`×1、`#local-search`×9、`.gallery`×29、`[data-theme=dark]`×3。

注意：PLAN §1.3/§3.1 提到的「上游 470 KB」是当时的估算，不是实测；本次实测 683 218 字节。`public/css/var.css` 是 **0 字节**——`source/css/var.styl` 只定义变量、无任何输出，属正常现象。

### 4.3 pages（48 条，全部来自 `public/**/*.html` 的实际字节）

| path | bytes | sha256 |
| --- | ---: | --- |
| `/` | 62 256 | `a194942bf7e9978a470291b0f5759518e870a19c43c44eb1fcdb2d965771c837` |
| `/2024/11/01/longform-hexo-astro/` | 62 356 | `8054e3af59122ee0cab23fc23812e9e3ddcc95da926e0757d8f8e3c80ce20017` |
| `/2024/12/15/short-note/` | 41 854 | `ddf79aa3d6652871649d64eee4d6019e31e720ba0d2bd64110c9b81075f93791` |
| `/2025/01/10/multi-taxonomy/` | 54 058 | `a0176e732ada3995392dd8bfc1e8328fa06d4fc2d3128d0441408ba38aad7b14` |
| `/2025/02/02/sticky-top/` | 50 516 | `3542461ca7fdfa24251ccfb8d51c6f34a8c95d6e666177826c7e93059c81fffa` |
| `/2025/02/20/cover-variants/` | 49 899 | `b1333b2d24960ec065fad2d0ba9941f4777567ecae4977dfaef6f18f000ce9d0` |
| `/2025/03/05/tags-inline/` | 51 664 | `a2f8f798c571642e616a700dbfaef3fb82fa63ba72f9f8e17a5b5a9dfe023a11` |
| `/2025/03/18/tags-block/` | 55 923 | `e2214611973beeee2118204996742d3ea9c2a996ccbc0f048e9a5e17b832316c` |
| `/2025/04/01/tags-media/` | 56 595 | `7752bb85c4bc23d47a8778d17c1fa1e15abdfaa1eaab4c64e3d5c3c48b1b22f7` |
| `/2025/04/20/tags-thirdparty/` | 61 547 | `2ba113afea9d1b67c381aef2d54117d83bd5537510408c20324bf7788f6d039c` |
| `/404.html` | 36 836 | `a69e72cda925afccb79bd4a7afaa4706ee39312c4b8d98a4d58fb79e43069f2a` |
| `/about/` | 54 645 | `5bfd2e0e580d085846c6fb7f4cc40b07e382cd82c58025bdeb724bcffa3bc20c` |
| `/archives/` | 45 987 | `cedd070160b171b336c3ac43a97c09b7f1e7f2af9da4b1359efab2a0d84c2ef1` |
| `/archives/2024/` | 41 251 | `dd3069021bb86a45120de2815257be0e0b9b8549e4698bd81505231431210183` |
| `/archives/2024/11/` | 40 649 | `8e2abff1ff7274650223833ed09d956b75d0a85afff08d8e89b0568ec57baa2d` |
| `/archives/2024/12/` | 39 692 | `7acf4222398457e6f3e077a3c4ed9ff99927d8e46744f1536633b746ffc111a4` |
| `/archives/2025/` | 45 987 | `b8c73b94bde4a3b0d71147940948faebab6412be81f38b8154ac3a970168a66f` |
| `/archives/2025/01/` | 40 853 | `b296237f08c9c9cbe9739bb21aab04dea8db5fdaa79900ec95781c696043205e` |
| `/archives/2025/02/` | 41 086 | `3aeb2b1dbedd1d0c000a7a8b071a9d206d6190aa52641609ad0498dcba60cbec` |
| `/archives/2025/03/` | 41 473 | `7236868051c891a11a8894f8e44ac1d4d3a19bfa795395194c440fe414407117` |
| `/archives/2025/04/` | 41 172 | `d39e724b634b067b95c2e33f9e350a5d924d17b4a9fad6ebdfe6b202c6207074` |
| `/archives/2025/page/2/` | 41 070 | `d38cfb32ec938f39279abc278fabfe63f0728afdeae34ca36610c216345a49df` |
| `/archives/page/2/` | 43 460 | `e712132839afbf9fdf5dde69f3f800fdc1293e8e1d458e48d7c8d9dc78901eed` |
| `/categories/前端/` | 45 398 | `76419a63875aab5a5e35e245e685f68343ed1f3f7657944fff3caf0cf56a7614` |
| `/categories/前端/Astro/` | 42 485 | `8847764494fb5af3833895d61066b78e63674f0554592320a27e439c1edfdf0e` |
| `/categories/前端/Hexo/` | 42 249 | `9a9c114443364d57b2561f615a12cb9488d975ef87da259f474f5ef612f517d2` |
| `/categories/工程实践/` | 42 551 | `539a00662ffc6d2cf5aaddfb3f147bd0f00fa1dd91c4c8ba1ced0ff0cba623e7` |
| `/categories/标签测试/` | 45 362 | `8f13b79e32cb46d512531e21300efe280923e6af5258187ba5d22a61592c2ae3` |
| `/categories/生活/` | 41 496 | `10bc10c4c0b1f4dc45a597f6150af5a73ddc667d4cb517ee9e202a6e69029810` |
| `/categories/随笔/` | 41 294 | `51a7e055b3ffe42ae4939ef577e69f93a353e18e2e348e46303e1400e2915865` |
| `/page/2/` | 50 358 | `bbf0ad413261dba51dfa5c2d33605d98ea2f4d664d902d3d31e67374e7366e94` |
| `/tags/Astro/` | 45 570 | `ef2cfcf580c2a1bfda1f8eaab1ac2429009e8ff447734d123568570bc42a156a` |
| `/tags/Hexo/` | 44 906 | `2091214399bf236af392c18d0706a5cfff2b08cc72db6821574c05cf7a16fa42` |
| `/tags/TypeScript/` | 43 907 | `171b5bba22f9e66095b36acbe9c08a7fdfb4f51441ae64770c2cc3662fcb8236` |
| `/tags/tag插件/` | 46 734 | `6db73cab3caac0222f84099f3a51b06800fdcef6ac953037ff777a32c5f64e22` |
| `/tags/图片/` | 42 916 | `5bf911938d80586e8e5922de087a4baf46aa3a1c41e93084ef741943ad0373c3` |
| `/tags/媒体/` | 43 298 | `21baa7658adb0bb5c372357d729122107ac0fa06bd6e5c71ddf262d44d1e1c88` |
| `/tags/容器/` | 43 289 | `a70401f466b9da3ce543dbb8946e204714dbd35e8911defe6dd74bfd9eb98632` |
| `/tags/封面/` | 42 916 | `c23507f2274673315a98682b3a50f664b658bfd1ff064ef801808808b37b5852` |
| `/tags/工程化/` | 43 935 | `9e886fdfd5ee6506f55474c293a654bd621cd6337acf726f6c2d12340687ffbc` |
| `/tags/性能/` | 43 899 | `18d9e6f67f0d1d51d9610d2710995ddffe146c4c4b6b0beecd4801cfa0aa5d5e` |
| `/tags/测试/` | 43 899 | `9b4f623384f43f433bbec89946df2d30ee40f2c4dcc7f962af24c519664e4676` |
| `/tags/短讯/` | 42 714 | `0122b7a7b74ec91c6f0ddf3aafe884a0ca8a6e71226579d27de631b1c77e5159` |
| `/tags/第三方/` | 42 983 | `e4f991ff0c94ec4605ab72ca5a5c8742a279079145906edcbd3846a0e89a9b4f` |
| `/tags/置顶/` | 43 243 | `8448c1bd7d31238a8cc6f4d5ade9dbc1a7771ba3587a8ff203264d7d54da3984` |
| `/tags/行内/` | 43 257 | `efe1d49acc397e40ffa5d97bc32d348b066855c3e23ec51365e03e316050a450` |
| `/tags/迁移/` | 45 602 | `839b656b807cadbaea251802d7b8e486568a4725c26514a4bdb5cefe246905d3` |
| `/tags/长文/` | 43 671 | `f20e6bb4ed187dbce8f44be4b032479731d194816f0b9ff084bc77305b9f8adb` |

页面分组：9 篇文章 + `/` 与 `/page/2/` + `/404.html` + `/about/` + 11 个归档页 + 7 个分类页 + 17 个标签页 = 48。

**字节数 / SHA-256 的取法**：`tools/extract-baseline.mjs` 遍历 `.baseline-work/public/**/*.html` 的**实际文件**，`bytes = statSync(f).size`，`sha256 = sha256(fileBytes)`；path 只做「文件路径 → URL 路径」的机械映射（规则见 §3.2）。比对脚本要复算同一页面，应读 Astro 产物对应路径的原始字节后按同一规则算。

### 4.4 cssVars（69 个 `--anzhiyu-*`）

完整 69 项在 `docs/baseline.json` 的 `css.cssVars`。关键值（与主题 `theme_color` 配置对应）：

| 变量 | 值 |
| --- | --- |
| `--anzhiyu-theme` | `#425aef` |
| `--anzhiyu-main` | `var(--anzhiyu-theme)` |
| `--anzhiyu-fontcolor` | `#363636` |
| `--anzhiyu-card-bg` | `#fff` |
| `--anzhiyu-theme-op` | `rgba(66,89,239,0.137)` |
| `--anzhiyu-meta-theme-color` | `#f7f9fe` |
| `--anzhiyu-scrollbar` | `rgba(60,60,67,0.4)` |

取法：按 CSS 文件出现顺序扫 `(--anzhiyu-[\w-]+)\s*:\s*([^;}]+)`，同名只保留第一次出现（即 `:root` 基础值，不取暗色/媒体查询覆盖值）。

### 4.5 fixtures

`fixtures`（按码点升序）：`about-page.md`、`cover-variants.md`、`longform-hexo-astro.md`、`multi-taxonomy.md`、`short-note.md`、`sticky-top.md`、`tags-block.md`、`tags-inline.md`、`tags-media.md`、`tags-thirdparty.md`。

站点内映射：9 篇 → `source/_posts/*.md`（文章），`about-page.md` → `source/about/index.md`（页面，路径 `/about/`）；`fixtures/about-data.yml` → `source/_data/about.yml`（about 模板数据，不属于 10 篇内容，不进 `fixtures` 数组）。

---

## 5. 确定性验证

### 5.1 方法

`tools/hash-manifest.mjs` 对 `public/` 全部 75 个文件（不只 HTML）计算 `{path, bytes, sha256}` 并按 path 排序 → `manifest-*.json`；对比清单文件的 SHA-256。共做 4 次构建：

| 构建 | 命令 | 起始状态 |
| --- | --- | --- |
| A | `hexo clean && hexo generate` | 删除 db.json 冷启动 |
| B | `hexo generate` | 保留 A 的 db.json（增量） |
| C | `hexo clean && hexo generate` | clean 会删除 db.json |
| D | `hexo clean && hexo generate` | 最终构建（baseline.json 取自 D） |

### 5.2 结果

```
manifest-A.json  aeeb4340701c8b8c8c081c1a1fb3b048209ede708546ac2ed27dd7a7be60bf51
manifest-B.json  aeeb4340701c8b8c8c081c1a1fb3b048209ede708546ac2ed27dd7a7be60bf51
manifest-C.json  aeeb4340701c8b8c8c081c1a1fb3b048209ede708546ac2ed27dd7a7be60bf51
manifest-D.json  aeeb4340701c8b8c8c081c1a1fb3b048209ede708546ac2ed27dd7a7be60bf51
```

- **字节级一致**：4 次构建的 75 个产物文件（48 HTML + CSS ×2 + JS ×11 + 图片 ×13 + favicon）SHA-256 清单完全相同。
- **摘要一致**：D 构建后重新生成 `docs/baseline.json`，与 A 构建后生成的版本逐字符比较（仅排除 `generatedAt`）：`identical(excluding generatedAt): true`，两者均 11 295 字节。
- 文件内容为 LF 换行（`public/index.html`、`public/css/index.css` 的 CR 计数均为 0），跨平台 diff 不会因换行风格产生假差异。

> 结论：**同一 fixture 重跑两次，产物与摘要都一致**。

### 5.3 为达到确定性修复的 4 个来源（必读，Astro 侧对齐约定也在这里）

未加归一化时，两次 `hexo g` 产物有 46~47 个文件哈希不同、单文件最大差 31 字节。逐差定位到 4 个来源：

1. **生成页的「当前时间」被写进 HTML**。`layout/includes/head/config_site.pug:36` 有 `postUpdate: '!{full_date(page.updated)}'`；Hexo 对首页/归档/分类/标签/404 等生成页把 `page.updated` 设成构建时刻，于是每次构建所有非文章页都不同（差例如 `postUpdate: '2026-11-23 17:12:17'` vs `'…17:12:23'`）。
   **修复**：`reproducible.js` 的 `template_locals` 过滤器把「非 `__post` 且非 `__page`」页面的 `page.updated` 固定为 `2026-01-01 00:00:00 (+08:00)`。文章页与独立页保留真实 `updated`。**Astro 侧约定：生成页的该字段输出这个固定值。**

2. **Post / Tag / Category 的加载顺序会漂移**。Hexo 异步处理源文件，Warehouse box 顺序 = 文件处理完成顺序；主题大量地方直接迭代数据顺序，例如：
   - `layout/includes/head.pug:19` 的 meta keywords 用 `page.tags.data.map(...)`（同一篇文章两次构建出现过 `Astro,迁移,Hexo,长文` 与 `Hexo,Astro,迁移,长文` 两种顺序）；
   - 文章页标签链接、`scripts/helpers/random.js:20` 生成的 `anzhiyu/random.js` 里 posts 数组顺序、标签页列表、`related_posts` 平权重排序的兜底顺序。
   **修复**：`before_generate` 里重排 Post（`date` 降序、同日期 `path` 升序）与 Tag/Category（`name` 码点升序）。
   **Astro 侧约定：文章列表 date 降序；文章内的标签、分类展示顺序按 name 码点升序；标签/分类列表页同样按 name 排序。**

3. **fragment_cache 把「首次渲染」的 partial 结果全局缓存**。主题 `layout/includes/post/post-copyright.pug:42/63` 调用 `partial('includes/third-party/share/index.pug', {}, {cache: true})`，Hexo 的 `partial` helper 对 `cache:true` 走 `fragment_cache(view.path, …)`，按 view 路径缓存**第一页渲染出来的 HTML**；而该 partial（`layout/includes/third-party/share/share-js.pug:1`）引用 `page.cover`。于是先渲染哪一篇文章，决定了所有文章页分享图 URL：未修复时曾出现同一页 `data-image="/img/comment_bg.png"`（别的文章的封面）与 `data-image="https://bu.dusays.com/…"`（头像兜底）两种输出。
   **修复**：`reproducible.js` 重新注册 `fragment_cache` 为直接执行（关闭缓存）。这同时保证每个页面拿到自己的 `page.cover`。
   **Astro 侧约定：分享组件按当前页面 `cover` 渲染（这正是 Astro 的自然行为），不要复现上游的缓存 bug。**

4. **主题 `random_cover` 的随机 URL**（本次未触发，但换配置就会触发）：`scripts/filters/random_cover.js:22/28-45/55`，当 `cover.default_cover` 非空且文章没写 cover 时，会用 `Math.random()` + `Date.now()` 生成 `_r_=<uuid>` 查询参数。上游 1.7.1 默认 `cover.default_cover` 为空（`_config.yml:163-164` 只有注释），所以当前 fixture 没有触发；**任何人把 `default_cover` 配成列表后，这个基准工程就不再可复现**，必须先固定占位图或关掉该行为。

另外两个「配置开启才有」的隐患，当前主题默认配置未触发：

- `layout/includes/widget/card_webinfo.pug:45`：`data-lastPushDate=date_xml(Date.now())`，仅在 `aside.card_webinfo.last_push_date: true` 时输出（上游默认 `false`，见 `_config.yml:847`）。
- `layout/includes/footer.pug:28/73`：`new Date().getFullYear()` 输出版权年份，跨年重跑会变（同一年内稳定）。对「同一台机器同一年重跑」的验收无影响。

### 5.4 上游一致性校验

- 主题拷贝与上游逐文件 SHA-256 对比：`upstream files=331 copy files=331 diff count=0`。
- 上游工作区 `git status --porcelain` 为空；HEAD `72439d93936b63da59a4a1195f64de9f952f6cc1`。
- 本次所有构建读的都是这份只读副本，构建过程未写上游目录（主题在 `.baseline-work/themes/anzhiyu`，source 在 `.baseline-work/source`）。

---

## 6. 42 个 Hexo tag 实测结果

10 篇 fixture 里 `{% tag %}` 名去重后 **42 个，与附录 B 完全一致（missing: none / extra: none）**。构建日志零 WARN/ERROR，生成 HTML 里没有残留的 `{%`（逐文件 `Select-String '\{%'` 命中 0）。

### 6.1 行为异常 / 需要注意的点（逐条）

| # | tag | 现象 | 证据 | 影响与处理 |
| --- | --- | --- | --- | --- |
| 1 | `icon` | **参数必须用逗号分隔**；用空格写法会静默渲染出坏 symbol：`{% icon anzhiyu-icon-home 1.2 %}` → `<use xlink:href="#anzhiyu-icon-home 1.2">`（尺寸被吞进 id，style 仍是默认 `width:1em`）；`{% icon anzhiyu-icon-home, 2 %}` → `<use xlink:href="#anzhiyu-icon-home">`、`width: 2em` | 主题 `scripts/tag/iconfont.js:3-6`（`args.join(' ').split(',')` 后不 trim，`p1=args[1]`）。探针实测输出：`<p>space icon: <svg class="icon" style="width:1em; height:1em" aria-hidden="true"><use xlink:href="#anzhiyu-icon-home 1.2"></use></svg></p>` vs `<p>comma icon: <svg class="icon" style="width: 2em; height: 2em" aria-hidden="true"><use xlink:href="#anzhiyu-icon-home"></use></svg></p>`（探针文章构建后已删除并重建，manifest 与权威清单一致） | Phase 6 解析器按上游实际生效语义：**逗号分隔**；fixture 已改逗号 |
| 2 | `p` / `span` | `p` 生成 `<p class='p h2'>`，若写在 Markdown 段落里会产生 `<p>` 嵌套 `<p>`（HTML 非法，浏览器会隐式拆开） | 生成物 `/2025/03/05/tags-inline/`：`<p>段落标签：<p class='p h2'>…</p>。</p>`；源码 `scripts/tag/span.js:3-10` | HTML diff 会看到结构差异；迁移实现应保留上游输出，但比对时可能需要按浏览器解析后 DOM 归一化 |
| 3 | 脚注（非 tag，frontmatter/正文语法） | `[^note1]` **不会被渲染成脚注**，原样留在 `<p>` 里；定义行也按普通段落输出 | `/2024/11/01/longform-hexo-astro/` 同时含 `<p>…[^note1]…</p>` 与 `<p>[^note1]: …</p>`；hexo-renderer-marked 7.0.1 依赖里只有 `marked`/`dompurify`/`jsdom`，无 footnotes 扩展 | PLAN P2-1 要求「脚注渲染并跳转」；上游 Hexo 7.3.0 + marked 7.0.1 实测达不到，这条验收标准需要改为「Astro 侧启用 GFM 脚注」，并把上游缺脚注记录为已知差异（否则 HTML diff 一定对不上） |
| 4 | `videos` | 列数参数要求**前置逗号**：`{% videos , 3 %}` → `<div class="videos" col='3'>`；写成 `{% videos 2 %}` 则 2 被当成 class → `<div class="videos 2">`，且没有 `col` 属性 | 源码 `scripts/tag/media.js:13-27`；探针实测两条输出：`<p>videos space: <div class="videos 2">…`、`<p>videos comma: <div class="videos" col='3'>…`；正式 fixture 用 `{% videos , 2 %}`，产物为 `<div class="videos" col='2'>` | fixture 用前置逗号写法；Phase 6 parser 必须覆盖「tag 名后直接逗号」这种边界 |
| 5 | `intCard` | 参数按**空格**分隔（`args` 直接解构 7 个位置参数），用逗号会把逗号带进 URL | 源码 `scripts/tag/Introduction-card.js:11`；fixture 写法 `{% intCard /about/ /img/… 最爱 介绍卡片 /img/512.png AnZhiYu 基准站点 %}`，生成物 `/about/` 链接正确 | 文档/parser 按空格分隔实现 |
| 6 | `cell`（`btns` 内） | 图标分支判定是 `args[2].indexOf(" anzhiyufont") > -1`（要求带前导空格的完整类名），否则走默认 SVG 图片 | 源码 `scripts/tag/btns.js:19-31`；fixture 用 `{% cell 关于页, /about/, anzhiyufont anzhiyu-icon-paper-plane %}`，输出 `<i class='anzhiyufont anzhiyu-icon-paper-plane'>` | 按源码语义实现即可；注意前导空格来自 `split(',')` 的保留 |
| 7 | `note` / `subnote` | 图标参数取「倒数第二个参数」且必须以 `fa` 开头；样式参数若末位不是 `flat/modern/simple/disabled` 会自动追加主题默认样式 | 源码 `scripts/tag/note.js:10-24`；`{% note info fa-bell %}` 输出 `class="note info icon-padding flat"` | fixture 已覆盖 4 种样式 + 图标；`subnote` 输出与 `note` 同构（仅 tag 名不同） |
| 8 | `bilibili` | 生成的 `<a>` 会被 Hexo 的 `external_link` 过滤器补上 `target="_blank" rel="noopener"` | 生成物 `/2025/04/20/tags-thirdparty/`：`<a target="_blank" rel="noopener" href="https://www.bilibili.com/video/BV1xx411c7mD/" class="bilibili_box" …>` | 属站点配置 `external_link.enable: true` 的通用行为，不是 tag 缺陷；比对时注意 |
| 9 | `link` / `site` / `intCard` 等外链 | 同上，外链 URL 会带 `url_for` 与 external_link 属性 | 生成物 `/tags-thirdparty/` 的 `tag-Link` 节点 | 同上 |
| 10 | `mermaid` | 内容按 HTML 转义后放进 `<pre class="mermaid-src" hidden>`，`mermaid.enable: false` 时不加载脚本 | 生成物 `<pre class="mermaid-src" hidden>graph TD…`（`>` 已转义为 `&gt;`） | 当前基准只验证静态输出；P6-5 再验交互渲染 |
| 11 | `flink` | 依赖 Hexo 内建 `yaml` 渲染器（hexo 7.3.0 自带 `dist/plugins/renderer/yaml.js`，无需额外插件） | `node_modules/hexo/dist/plugins/renderer/yaml.js` 存在；fixture 的 YAML 友链渲染成 `anzhiyu-flink-list` 与 `flexcard-flink-list` 两个分支 | 换 hexo 版本时注意别丢 yaml renderer |
| 12 | `hideInline` / `checkbox` 等 | 参数以 `,` split，正文不能包含逗号（会被截断成多参数） | 源码 `scripts/tag/hide.js:10-25`、`scripts/tag/checkbox.js:3-25` | fixture 故意不含逗号；文档里应写明 |

### 6.2 构建报错

`hexo g` 全程 **0 条 WARN、0 条 ERROR、0 次 FATAL**（`Select-String build-D.log -Pattern 'WARN|ERROR|FATAL'` 无输出）。首次失败与 tag 无关，是构建工程的配置问题（hexo-cli 缺 `hexo` 字段、npm install script 沙箱 EPERM），已在 §3.2/§3.4 修好。

---

## 7. fixture 覆盖表

| 文件 | 类型 | frontmatter 覆盖 | 正文/tag 覆盖 |
| --- | --- | --- | --- |
| `longform-hexo-astro.md` | 文章（长文，Markdown 3.7 KB） | `categories`(2) `tags`(4) `description` `cover` `ai: true` `mathjax: true` | 多级标题、js/bash/json 代码块、表格、有序/无序列表、引用、图片、行内代码、加粗斜体删除线、脚注原文、行内公式文本、`ai` 摘要块（首页/文章页命中） |
| `short-note.md` | 文章（短讯，<200 字） | `categories`(1) `tags`(1) `copyright: false` | 短内容首页卡片、`post-copyright` 关闭分支 |
| `multi-taxonomy.md` | 文章 | `categories`：`[[前端,Astro], 工程实践]`（二级分类）；`tags`: 6 个；`description` `cover` `toc: true` | 首页/归档/分类/标签的分组与计数、TOC |
| `sticky-top.md` | 文章 | `sticky: 10` `top: true` `swiper_index: 3` `top_group_index: 2` `cover` `description` | 首页置顶排序（实测首页第一张卡片为本文）、置顶徽标、推荐位排序 |
| `cover-variants.md` | 文章 | `cover: false` `top_img` `main_color` `aside: true` | 首页卡片 `no-cover` 分支、顶部大图取 `top_img`、主色写死、懒加载重写 `<img>` |
| `tags-inline.md` | 文章 | `toc: false` | 行内 12 tag：`u` `emp` `wavy` `del` `kbd` `psw` `label` `inlineImg` `icon` `btn` `p` `span` |
| `tags-block.md` | 文章 | — | 块级 12 tag：`note`(4 种样式+图标) `subnote` `tabs`(激活第 2 页) `subtabs` `subsubtabs` `hideInline` `hideBlock` `hideToggle` `folding` `checkbox` `radio` `timeline` |
| `tags-media.md` | 文章 | — | 媒体/卡片 11 tag：`image` `inlineimage` `audio` `video` `videos`(col=2) `gallery`(3 图 data 模式) `galleryGroup` `site` `sitegroup` `btns` `cell` |
| `tags-thirdparty.md` | 文章 | `cover: false` `top_img` | 第三方 7 tag：`bilibili` `dogeplayer` `mermaid` `link` `flink`(两种 flink_style) `tip` `intCard` |
| `about-page.md` | 独立页（`layout: page` `type: about`） | `title` `date` `layout: page` `type: about` `top_img` | about 模板（23 KB pug）全块渲染：作者卡、技能、历程、地图/个人信息、人格、座右铭、游戏/追番/音乐/偏好、页面正文；数据来自 `fixtures/about-data.yml` |

站点里由生成器额外产出的页面（不在 fixture 里，但 baseline 收录）：首页分页 `page/2`、归档（年/月/分页）、7 个分类页、17 个标签页、404。共 48 个 HTML。

---

## 8. 覆盖不足与遗留问题

1. **`/tags/`、`/categories/` 索引页未覆盖**（`page.type: tags/categories` 模板）。它们需要额外的 `source/tags/index.md`、`source/categories/index.md`，不属于 10 篇 fixture 范围；`/tags/` 的 `tags_page_list` 与 `/categories/` 的 `catalog_list` 逻辑目前只有侧栏/导航入口在用，索引页本身待 P3 补 fixture 后再进 baseline。
2. **`about` 模板的完整数据**：about.pug 依赖 `site.data.about` 的 40+ 字段，已用 `fixtures/about-data.yml` 提供最小可用数据（覆盖 all-blocks 渲染），但不是上游 demo 的真实内容；如果 P3-6 需要逐块视觉比对，建议后续把该 YAML 扩充为真实 demo 数据。
3. **其余 11 种 `page.type` 模板**（`essay` `album` `album_detail` `flink` `music` `fcircle` `room` `equipment` `default` `tags` `categories`）没有 fixture，baseline 不含这些页面，P3 需要补。
4. **依赖真实后端的特性**（评论 5 种、分析 5 种、搜索 3 种、音乐、AI 摘要远端模式）在本次构建里全部是关闭/静态配置，HTML 里只有占位；它们的「行为基线」属于 §3.3 运行时录制，不在 P1-6 范围。
5. **`gallery` 的 url 模式**、`audio/video` 的真实资源、`bilibili` 的远端 API 只在静态 HTML 层面验证，没有真实资源/网络行为。
6. **gzip 口径**：`indexCssGzipBytes` 用的是 Node `zlib.gzipSync(buf, { level: 9 })`。若用系统 `gzip -9` 或别的 zlib 实现，压缩字节数可能与 79 124 有细微差异；Astro 侧比对必须用同一算法（写进 `scripts/verify-css.mjs`），或只比字节数与 SHA-256，把 gzip 作为参考值。
7. **跨平台**：本次基准在 Windows 生成；产物为 LF、路径均为 URL 形式（`/`），理论上 Linux 一致，但未在 Linux 上复跑过（CI 建立后 P1-10 需要跑一次并对比 manifest）。
8. **PLAN §1.3/§3.1 的「上游 470 KB CSS」是旧估算**，实测 683 218 字节。PLAN.md 是禁改文件，本条留待组长更新计划时修正（或确认以 baseline 为准）。
9. **上游主题自身的确定性缺陷已在本工程绕过**（§5.3）。若以后要「原样复现上游 demo 的行为」（比如对照 theme 作者站），需要接受其产物含构建时间戳与顺序漂移，不能作为验收基准。

---

## 附录 A：`hexo g` 完整命令与输出末尾

命令：

```powershell
cd D:\Git-project\astro-theme-anzhiyu\.baseline-work
npx hexo clean
npx hexo generate
```

`build-D.log` 末尾 20 行：

```
INFO  Generated: js/anzhiyu/ai_abstract.js
INFO  Generated: js/anzhiyu/right_click_menu.js
INFO  Generated: js/anzhiyu/people.js
INFO  Generated: img/404.jpg
INFO  Generated: css/index.css
INFO  Generated: 2025/03/05/tags-inline/index.html
INFO  Generated: 2025/02/20/cover-variants/index.html
INFO  Generated: 2025/01/10/multi-taxonomy/index.html
INFO  Generated: 2025/04/20/tags-thirdparty/index.html
INFO  Generated: 2025/02/02/sticky-top/index.html
INFO  Generated: categories/前端/Astro/index.html
INFO  Generated: categories/前端/Hexo/index.html
INFO  Generated: 2024/12/15/short-note/index.html
INFO  Generated: js/anzhiyu/comment_barrage.js
INFO  Generated: 2025/04/01/tags-media/index.html
INFO  Generated: 2024/11/01/longform-hexo-astro/index.html
INFO  Generated: 2025/03/18/tags-block/index.html
INFO  Generated: img/friend_404.gif
INFO  Generated: img/loading.gif
INFO  75 files generated in 2 s
```

## 附录 B：证据文件位置（都在 `.baseline-work/`，gitignored）

| 文件 | 内容 |
| --- | --- |
| `build-A.log` ~ `build-D.log` | 4 次构建完整输出 |
| `manifest-A.json` ~ `manifest-D.json` | 4 次构建的 75 文件 SHA-256 清单（4 份内容相同） |
| `baseline-run1.json` / `baseline-run2.json` | 两次摘要，比对时仅 `generatedAt` 不同 |
| `npm-install.log` | 依赖安装日志（含首次 EPERM 失败与 `--ignore-scripts` 成功） |
| `package-lock.json` | 依赖锁（npm 生成） |
| `tools/extract-baseline.mjs` | baseline 摘要生成脚本 |
| `tools/hash-manifest.mjs` | 产物清单脚本 |
