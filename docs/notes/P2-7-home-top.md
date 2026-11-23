# P2-7 收尾 · 首页 `#home_top` 子树

对应上游：`layout/includes/top/top.pug`（1.7.1，commit 72439d93），
辅以 `layout/includes/anzhiyu/tags-group-all.pug`。
基准产物：`.baseline-html/index.html`；验证站：`examples/blog`（`home_top.swiper.enable: false`、
`peoplecanvas.enable: true`）。

## 1. 改动清单

只新增/修改 `packages/astro-theme-anzhiyu/src/components/home/`，未改 `BaseLayout.astro`、
`AsideContent.astro`、post 相关文件与 `docs/PLAN.md`。

| 文件 | 上游对应 | 内容 |
| --- | --- | --- |
| `HomeTop.astro`（改） | top.pug:1-96 | `#home_top > .swiper_container_card` 外壳 + swiper 开关分支；按 `home_top.enable` 整块开关 |
| `BannerGroup.astro`（新） | top.pug:6-32 | `#bannerGroup > #random-banner + .categoryGroup`；peoplecanvas / banners-title 二选一；分类图标 fa / icon / anzhiyu 三支 |
| `TagsGroupAll.astro`（新） | anzhiyu/tags-group-all.pug | `#skills-tags-group-all`；奇偶下标配对，同一段循环输出两遍 |
| `TopGroup.astro`（新） | top.pug:70-94 | swiper 关闭分支：6 张 `.recent-post-item` + `a#todayCard.todayCard` |
| `SwiperGroup.astro`（新） | top.pug:33-69 | swiper 开启分支：`#swiper_container_blog`（轮播 4 篇 + `#topPostGroup` 4 项） |
| `home-top-data.ts`（新） | scripts/helpers/sort_attr_post.js | 补 `sort_attr_post("swiper_list")` 的选择逻辑（`top_group_list` 复用 `post-list.ts` 的 `selectTopGroupPosts`） |

数据准备：`HomeTop` 调 `preparePosts(posts)` + `selectTopGroupPosts(..., swiperEnabled)`；
swiper 开启时另调 `selectSwiperPosts()`。两处都以「date 降序 → path 码点升序」的
`hexo.locals.get('posts').data` 顺序为入参，复刻上游 helper 用最新文章补足的行为。

## 2. 上游细节与实现口径（容易漏的点）

1. **`peoplecanvas` 优先**：`theme.peoplecanvas.enable` 为真时 `#random-banner` 只输出
   `<canvas id="peoplecanvas">`，`.banners-title` 与 tags-group-all 整块不出现（基准即此分支）。
   tags-group-all 的数据源是 `site.data.creativity`，当前站点层没有 `data`，通过可选 prop
   `creativity` 传入；无数据时不渲染。
2. **分类链接编码**：`url_for(item.path)` 在 Hexo 里会 `encodeURL`，基线为
   `/categories/%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91/`，因此组件里显式 `encodeURI(urlFor(path))`。
3. **`.topGroup` 内层 `a` 的 href 不带前导 `/`**：上游 `a(href=item.path)` 直接用 `item.path`，
   基线为 `href="2025/02/02/sticky-top/"`；而 `onclick` 用的是 `url_for(item.path)`（带 `/`）。
4. **lazyload 过滤器的 `onerror` 去重方向**（`scripts/filters/post_lazyload.js`）：
   过滤器在 `src=` 后插入 `onerror="this.onerror=null,this.src=\"...\""`。
   - `.post_bg`：top.pug 把 `onerror` 写在 `src` **前面**，产物里先出现的是模板那份
     `this.onerror=null;this.src='...'`（分号版本），逗号版本被当作重复属性丢弃；
   - `.todayCard-cover`：`src` 在前，保留过滤器的逗号版本。
   另外 `cover === false` 时上游 `src=item.cover` 被 pug 省略，过滤器也不会改写 ——
   卡片只留模板 `onerror`，无 `src` / `data-lazy-src`。
5. **`#todayCard` 的 `target` / `rel` 不来自模板**：Hexo `_config.yml` 的
   `external_link.enable: true` 会给外站链接补 `target="_blank" rel="noopener"`；
   组件按「绝对 URL 且 host ≠ `config.url`」判断后输出（基线 banner.link 指向 docs.anheyu.com）。
6. **`link[rel=stylesheet]` 的位置**：top.pug:96 与 `.topGroup` **同级**（`.swiper_container_card` 的
   直接子节点），不是 `.topGroup` 内部；未配置 `banner.top_group_banner_css` 时上游只留
   `<link rel="stylesheet">`（无 href），组件用 `href={undefined}` 复现。
7. **`default_descr` / `timemode`**：`default_descr` 在 top.pug:2 被解构但全文件未使用，故不落地；
   `timemode` 只影响 swiper 分支的 `span.blog-slider__code`（`updated` → updated，否则 date）。
   `swiper_css` 由 `head.pug:72` 输出，不属于本子树；`initBlogSlider()`（top.pug:98-135）是客户端脚本，归 P4。

## 3. 验收命令与真实输出

构建（Node 24 + 构建锁）：

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd /d/Git-project/astro-theme-anzhiyu
while ! mkdir .build.lock 2>/dev/null; do sleep 3; done; trap 'rmdir .build.lock' EXIT
pnpm --filter blog build
```

```
[build] 40 page(s) built in 45.37s
[build] Complete!
```

首页 diff：

```bash
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs \
  .baseline-html/index.html examples/blog/dist/index.html --limit 120
```

改造前（仅 `#home_top` 外壳占位）：

```
FAIL ... 54 条差异（结构 40 / 属性 10 / 文本 4），缺口 缺 480 节点，多 5 节点
    17. [结构/node-missing] .../div#home_top[1]/div/div#bannerGroup[1]（子树 24 节点）
    18. [结构/node-missing] .../div#home_top[1]/div/div[2]（.topGroup，子树 67 节点）
    19. [结构/node-missing] .../div#home_top[1]/div/link（子树 1 节点）
```

改造后（本次改动落地、aside 组件尚未并行的时刻）：

```
FAIL ... 51 条差异（结构 37 / 属性 10 / 文本 4），缺口 缺 388 节点，多 5 节点
```

同批 aside 组件也落地后，在最新 `dist` 上复测：

```
FAIL ... 50 条差异（结构 35 / 属性 11 / 文本 4），缺口 缺 223 节点，多 5 节点
```

再刷新内容缓存（`examples/blog/node_modules/.astro`，P6-1 的 remark 插件需要）后复测：

```
FAIL ... 48 条差异（结构 35 / 属性 10 / 文本 3），缺口 缺 223 节点，多 5 节点
```

剩余 3 条文本差异都在 `PostCard` 的 `.content` 摘要（不属 home_top）：
tags-thirdparty 与 tags-media 是 P6-2/P6-3 未实现的 tag 原样透传；
tags-block 是 `note` 系列标签消费后多/少一个空格的空白差异（P6-1 收尾项）。

`home_top` 相关差异条目：**0**（`... | grep -c home_top` → `0`）。
`#bannerGroup`（24）、`.topGroup`（67）、`a#todayCard`、`link[rel=stylesheet]` 全部结构/属性/文本对齐。

### 关于「`missingNodes` 降到 ≤ 270」

本子树只有 92 个节点（24 + 67 + 1）。改造前 480 → 改造后 388（480 − 92），此时剩余缺口：

| 归属 | 节点数 |
| --- | --- |
| `#console` 中控台（P4-6） | 180 |
| `#aside-content`（作者卡 6 + 微信卡 5 + sticky_layout 155） | 166 |
| `<head>` 缺失资源/内联脚本（css/script/noscript/meta） | 12 |
| body 末尾脚本与资源（`div[10]` 的 js/css、`canvas#universe` 等） | 30 |
| 合计 | 388 |

即：单靠 home_top 无法到 270（console 180 + aside 166 已 346）。等 aside 落地后复测为 **223**：

| 归属 | 节点数 |
| --- | --- |
| `#console` 中控台（P4-6） | 180 |
| `<head>` 缺失资源/内联脚本 | 12 |
| body 末尾脚本与资源（`div[10]`） | 28 |
| body 直接子节点（progress_bar css / pace 脚本） | 2 |
| `#aside-content` 作者卡内 1 个文本节点（aside 任务收尾项） | 1 |
| 合计 | 223 |

因此 ≤ 270 的验收目标已达成；剩余 223 不属于 home_top，主要归 console（P4-6）与
「脚本/资源注入」阶段。

## 4. 未覆盖/未验证

- swiper 开启分支（`home_top.swiper.enable: true`）按 top.pug 实现并有配置开关，
  但基准配置关闭，未在浏览器/产物中实测；开启后还需 P4 的 `initBlogSlider()` 与
  `swiper_css`（head.pug）才可见轮播效果。
- `tags-group-all` 分支需要 `site.data.creativity`，当前站点层未提供该数据，同样未被基线触发。
