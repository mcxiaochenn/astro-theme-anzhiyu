# P7-4 终验：真实 Hexo 站点迁移验收报告（Phase 7 退出判定）

- 日期：2026-11-24 20:30-20:50（Asia/Shanghai）
- 验收人：Lead（agent team 实现，Lead 只做方向与验收）
- 源站：`D:\Git-project\xcAnzhiyu`（Hexo 7.3.0 + hexo-theme-anzhiyu 1.6.14，只读，未写入）
- 目标站：`scripts/migrate-hexo.mjs` 生成 → `.migration-out/lead-final/migrated`，Astro 7.4.13 构建
- 代码版本：`d6c80c3`（含 P7-6 主题包 1.0.0 / P7-2 Lighthouse / P4-4 暗色修复）

## 1. 结论

**真实站迁移验收通过（migration gap = 0，退出码 0）。** 六个验收维度全部有产物/命令证据：

| 维度 | 结果 | 证据 |
| --- | --- | --- |
| 构建 | ✅ 97 HTML（96 Astro 页 + go.html）/ 14 个根级产物 / 1.5 分钟内含安装 | `accept-migration` build 检查 PASS |
| 路由 | ✅ 22 文章 + 18 独立页 = 40/40；golden 97 ↔ dist 97，missing 0 / extra 0 | routes 检查 PASS |
| 链接/资源 | ✅ 内部目标 126 个，缺失 8 个全部为 inherited(7)/whitelisted(1)，migration-gap 0 | links/assets 检查 PASS |
| 搜索 | ✅ `/search.xml` 249,657B / 22 entry，与 golden 22/22；`GLOBAL_CONFIG.localSearch.path` 指向一致 | search 检查 PASS |
| feed/sitemap | ✅ atom 20 / rss2 20 / sitemap 84 / baidusitemap 22 / baidu_urls 22，与 golden 条目数全等 | feed 检查 PASS（5/5 产物） |
| 身份/页面类型/残留 | ✅ identity 15/15；page-types 17/17；`{%` tag 残留 0 | identity / page-types / tag-residue 全 PASS |

验收命令与原始汇总（Lead 独立跑，不引用 agent 自述）：

```
node scripts/accept-migration.mjs --out .migration-out/lead-final
...
PASS  build        exitCode=0，durationMs=16303，htmlFiles=97，rootFiles=14
PASS  routes       permalinkTemplate=posts/p:abbrlink/，postsExpected=22，pagesExpected=18，routesExpected=40
PASS  links        htmlFiles=97，distinctInternalTargets=126，distinctJSNavTargets=25，missingDistinct=8
PASS  assets       assetDirectionsChecked=5，assetGaps=1，gapTotal=0，inherited=1
PASS  identity     pagesChecked=3，assertions=15，failed=0，gapTotal=0
PASS  page-types   pagesChecked=17，passed=17，failed=0，gapTotal=0
PASS  tag-residue  htmlFiles=97，hits=0，markersChecked=6，gapTotal=0
PASS  search       localSearchEnabled=true，localSearchPath=/search.xml，goldenSearchXmlBytes=254208
PASS  feed         expectations=5，present=5，missing=0，goldenRootFiles=14
INFO  structure    samples=6，sampled=6，totalDiffs=1433
-----------------------------------------------------------
migration gap: 0 / inherited: 7 / whitelisted: 1
退出码：0
```

> `structure` 为 INFO（非门禁）：抽样 6 页 vs 1.6.14 golden 的 DOM 归一化差异（golden 经 hexo-all-minifier 压缩 +
> 1.6.14/1.7.1 模板差异），不作为迁移缺口；对应报告：`.migration-out/lead-final/acceptance-report.{json,md}`。

## 2. 迁移缺口收敛轨迹

| 阶段 | gap 总数 | 说明 |
| --- | --- | --- |
| 首跑（97 页 golden 对照） | 67 | URL 旧形态 44 / taxonomy 7 / 插件页 3 / sitemap 3 / feed 2 / identity 2 / page-type 2 / 伪协议 2 / 搜索 1 / 主题资源 1 |
| W2-A URL/taxonomy/page.type 修复后 | 10 | 仅剩 feed/sitemap/search/插件页/random.js |
| W2-B1 插件产物 + W2-C P7-6 主题资源后 | 6 | 仅剩 feed 2 / sitemap 3 / search-index 1 |
| W3-B2 站点级生成物后 | **0** | feed/sitemap/search-index 全部归零 |

## 3. HTTP 层抽查（`astro preview` 127.0.0.1:4400，迁移产物 dist）

23 个关键路由/资源全部 200，字节数符合预期：

| 路径 | 状态 | 字节 | 路径 | 状态 | 字节 |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | 124,563 | `/search.xml` | 200 | 249,657 |
| `/posts/pf21cf686/` | 200 | 99,596 | `/atom.xml` | 200 | 219,910 |
| `/archives/` | 200 | 82,418 | `/rss2.xml` | 200 | 219,880 |
| `/categories/` | 200 | 67,917 | `/sitemap.xml` | 200 | 15,393 |
| `/tags/` | 200 | 70,730 | `/baidusitemap.xml` | 200 | 2,513 |
| `/about/` | 200 | 83,503 | `/baidu_urls.txt` | 200 | 950 |
| `/bangumis/` | 200 | 204,778 | `/js/main.js` | 200 | 64,181 |
| `/comments/` | 200 | 69,984 | `/js/utils.js` | 200 | 50,562 |
| `/todolist/` | 200 | 60,983 | `/js/search/local-search.js` | 200 | 9,525 |
| `/log/` | 200 | 88,622 | `/css/index.css` | 200 | 297（占位） |
| `/404.html` | 200 | 55,463 | `/anzhiyu/random.js` | 200 | 19,523 |
| `/go.html` | 200 | 7,560 | | | |

## 4. 浏览器走查（真实 Edge，wincu 浏览器通道；人工走查，非 CI 自动化）

环境限制：本机 Playwright/Chromium 被 DSH Windows 沙箱阻断（PLAN R12），自动化行为用例只在 CI 跑；
浏览器走查走 DSH 真实 Edge 通道（页面渲染/交互与生产浏览器一致）。

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 首页渲染 | ✅ | 标题「辰渊尘の个人博客」；home_top banner/topGroup、6 张文章卡（标题/日期/分类/tag/摘要）、aside 15 类卡片（作者/公告/tag 云/归档 5 月/文章 22/标签 28/分类 9/建站 495 天/字数 21674）、footer 4 栏 + 备案/十年之约、音乐球、右下按钮组、`#local-search` 容器全部在 |
| 2 | 暗色模式手动切换 | ✅ | 滚动 → 点齿轮展开右侧设置组 → 点暗色按钮：页面立即转深色 + snackbar「你已切换为深色模式」 |
| 3 | **暗色跨 ClientRouter 导航保持（P4-4 修复验证）** | ✅ | 首页切 dark → 点文章标题进入 `/posts/pf21cf686/`：新页仍 dark（截图确认），无白闪；右键菜单显示「浅色模式」反证当前为 dark；再导航 `/posts/p801b/`、`/posts/p1c0fbc06/` 仍保持 dark |
| 4 | 站内导航 | ✅ | 首页 → 文章页 → 再点卡片，URL 正常切换（`/posts/p<abbrlink>/`），页面内容/侧栏/TOC/评论区块完整渲染，无整页白屏 |
| 5 | 文章页 | ✅ | 标题、原创/分类/tag、发布/更新时间、更新日志 note、6 级 TOC、正文图片灯箱链接、版权卡/打赏/分享、上一篇/下一篇、相关推荐、Twikoo 评论挂载 |
| 6 | 右键菜单 | ✅ | 右击页面出现自定义菜单：前进/后退/刷新/回顶 + 随便逛逛/博客分类/文章标签/复制地址/关闭热评/浅色模式/轉為繁體 |
| 7 | 追番页（W2-B1） | ✅ | `/bangumis/`：标题「追番列表」、副标题、想看(0)/在看(10)/已看(51) 三 tab、61 张番剧卡（封面/集数/评分/播放/关注/硬币/弹幕/简介）、分页、Twikoo v1.6.44 评论区全部渲染 |
| 8 | 搜索（数据层） | ✅（UI 点击走查未做） | `/search.xml` 200/249,657B；`GLOBAL_CONFIG.localSearch={"path":"/search.xml",...}`；`/js/search/local-search.js` 200；acceptance search 检查 PASS。**诚实记录**：走查时未能点到搜索图标触发对话框（图标无 accessible name、多次误触相邻图标），搜索框交互未做人工点击验证；该能力由 `search.xml` 结构 + local-search.js 兼容性检查覆盖，UI 交互无自动化用例（demo 站搜索关闭，spec 走 skip） |
| 9 | 快捷键 | ⚠️ 默认关闭（与上游语义一致） | `GLOBAL_CONFIG.shortcutKey.enable=true`，但上游 `executeShortcutKeyFunction()` 以 `localStorage.keyboardToggle` 为准（默认 false），需先在中控台打开快捷键开关；故直接按 shift+D 不生效属上游设计，非迁移缺陷 |

已知不自动验项（PLAN §3.4）：沉浸式状态栏、第三方服务真实联通（Twikoo/音乐后端需真实网络与账号）、移动端手势。

## 5. 残留项与用户动作

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 旧 permalink 死链（44 条正文/卡片硬编码 `/2025/MM/DD/...`） | inherited（源站同样缺） | 源站 `_config.yml` 已改 `posts/p:abbrlink/`，正文里的旧链接在源站也是 404；迁移不代用户改写正文 |
| `/wordScenery/`、`/thousand/`、`/wallpaper/`、`/uitest/*` 等 7 项 | inherited | 源站 golden `public/` 同样缺失或为语法示例 |
| `/img-url` | whitelisted（一次性验收脚本） | uitest 页 galleryGroup 语法示例占位词，非真实链接 |
| npm 发布 / Pages demo 部署 / git tag push | 待授权 | P7-6 已完成 pack + tarball consumer 构建冒烟；真 publish 需 npm 登录，Pages 部署会写另一个仓库，需作者明确授权 |
| a11y 0.76-0.77 / seo 0.83（Lighthouse） | 记录为基线 | 见 docs/notes/P7-2-perf.md；提升项列入后续 backlog，不阻塞本次迁移退出 |

## 6. Phase 7 退出清单

- [x] 真实站按 `docs/MIGRATION.md` 迁移后构建通过（97 页）
- [x] 路由 / 链接 / 资源 / 搜索索引 / feed / sitemap 与源站 golden 对齐（gap 0）
- [x] 插件生成物补齐（留言板 / 追番 / safego / random.js），URL 与源站逐条一致
- [x] P7-1 PWA 落地；P7-2 性能预算门禁；P7-5 上游同步机制；P7-6 主题包 1.0.0 发布就绪
- [x] 浏览器走查关键路径（首页/文章/暗色/导航/右键/追番）
- [ ] 自动浏览器用例在 CI 全绿（PWA 离线用例修复后待最后一轮 CI；行为用例已 29 passed / 9 skipped）
- [ ] npm publish / Pages 部署 / tag push（待用户授权）
