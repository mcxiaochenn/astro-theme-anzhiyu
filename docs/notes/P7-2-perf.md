# P7-2 性能预算（Lighthouse CI 四项分数 + 资源预算）

> 任务：W3-C / task-12（owner: agent-21）。日期：2026-11-24。
> PLAN 对应：P7-2「首屏 JS 体积、LCP、CLS 基线」，验收「Lighthouse 四项不低于上游」。
> 产物：`.github/workflows/ci.yml` 的 `lighthouse` job、`.lighthouserc.json`、本文件。
>
> **本轮结论（一句话）**：CI 的 Lighthouse 门禁已落地（独立 job + 四项分数 + 资源预算，
> 全部 error 级）；本机拿不到迁移站实测分数（DSH 沙箱起不了浏览器，PLAN R12），
> 上游 PSI 也被 Google 429 拦住（两轮实测），且旧 Hexo 1.6.14 现网已被替换成另一个
> Astro 站——**分数对照缺失，已用「上游 Hexo 产物静态资源实测」补上位，并给 CI 首跑
> 回填模板（§6）**。分数初值是保守占位值，首跑后只允许按证据向上收紧（§7）。

---

## 1. 测量口径（先定口径，再谈分数）

| 项 | 本轮采用 | 理由 |
| --- | --- | --- |
| 被测对象 | `examples/blog` 的 CI 构建产物（62 页） | 与迁移站同主题、同 CSS/JS（W1-D 后静态资源收进主题包，两边拿的是同一份 assets）。真实站 94 页需要 Hexo 源内容 + 用户私有配置，CI 构建不出来，验收口径用「同产物性能代理」。 |
| 运行方式 | `pnpm --filter blog build` → `astro preview`（127.0.0.1:4321）→ `lhci autorun` | 与 e2e job 一样，本站 e2e 也是 build+preview 模式；preview 不需要额外依赖。 |
| Lighthouse | `@lhci/cli@0.16.1`（内置 lighthouse 13.6.0） | 固定版本，`npx --yes` 安装，**不改 root package.json / pnpm-lock.yaml**。版本证据：npm registry `dist-tags.latest=0.16.1`（2026-11-24 查）。 |
| 设备档位 | Lighthouse 默认 mobile（Moto G Power 视口、Slow 4G、4× CPU、simulate 节流） | 与 PSI mobile 同档，便于将来直接对照 PSI。 |
| 运行次数 | 每 URL 3 次，LHCI 取中位数（`numberOfRuns: 3`） | 抵消单次抖动，同时把 job 控制在 20min timeout 内。 |
| URL | `/`、`/2024/11/01/longform-hexo-astro/`、`/about/` | 首页（最重、LCP/CLS 主战场）/ 文章页（内容 + 摘要脚本）/ 单页（about，验证非列表页口径一致）。均为默认构建产物里的真实页面（本机 preview 实测 200，见 §5.2）。 |
| 第三方资源 | `.lighthouserc.json` 的 `blockedUrlPatterns` 逐条拦掉（14 条，见附录 B） | 第三方 CDN 在 CI 网络不可控（挂起/限流/地域差异），会让分数跨次抖动；拦掉后分数 = **「自有资源」性能**，可复现。代价：与 PSI 的「含第三方」分数**不可直接等价**（见 §7.2）。 |
| 压缩口径 | preview 是 Vite/Astro 7 的 preview server（`@polka/compression`），实测响应 `content-encoding: gzip` | 预算按 **gzip 传输字节**定，与 Lighthouse `transferSize` 同口径；preview 不做 brotli（真实 CDN 一般有），所以现实分数只会比 CI 好。 |

> 口径警告：CI 分数 ≠ 真实站分数。真实站还有第三方 CDN、真实网络、94 页真实内容；
> 「不低于上游」的判定必须同口径比较（§7.2），不能拿 CI 的 blocked 口径分数去对 PSI 的全现场分数。

---

## 2. 上游 PSI 实测：取不到（429），且现网已不是 Hexo

### 2.1 PSI API：429 RESOURCE_EXHAUSTED（两轮实测都失败）

查询（与 Lead 给的一致，Node 原生 https 发起；本机 curl 的 schannel 不可用）：

```
https://www.googleapis.com/pagespeedonline/v5/runPagespeed
  ?url=https%3A%2F%2Fblog.mcxiaochen.top%2F
  &strategy=mobile
  &category=performance&category=accessibility&category=best-practices&category=seo
```

实测（`.tmp-p72/psi-mobile-attempt-{1,2}.json`）：

| 时间（本机） | HTTP | 耗时 | 响应 | 关键错误字段 |
| --- | --- | --- | --- | --- |
| 2026-11-24 20:19:55 | 429 | 1043 ms | 1,346 B | `error.code=429`、`status=RESOURCE_EXHAUSTED`、`reason=rateLimitExceeded` |
| 2026-11-24 20:20:10（15s 后重试） | 429 | 686 ms | 1,346 B | 同上 |

错误体（摘要，原文见 `.tmp-p72/psi-mobile-attempt-1.json`）：

```json
{
  "error": {
    "code": 429,
    "message": "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of
                service 'pagespeedonline.googleapis.com' for consumer
                'project_number:583797351490'.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [{
      "reason": "RATE_LIMIT_EXCEEDED",
      "metadata": {
        "consumer": "projects/583797351490",
        "quota_limit_value": "0",
        "quota_metric": "pagespeedonline.googleapis.com/default",
        "quota_limit": "defaultPerDayPerProject"
      }
    }]
  }
}
```

判断：匿名调用走的是 Google 共享的 `projects/583797351490`，该 project 的每日配额
`quota_limit_value=0`（不是「今天用完了」，是匿名池配额为 0），等 15s/重试都没意义。
**补救路径（按优先级）**：

1. 带 API key 再取（用自己 Google Cloud project 的 PSI API 配额）：
   Node 示例（curl 在本机不可用）：
   ```js
   // node --input-type=module -e '...'
   const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
   for (const k of ['performance','accessibility','best-practices','seo']) u.searchParams.append('category', k)
   u.searchParams.set('url', 'https://blog.mcxiaochen.top/')
   u.searchParams.set('strategy', 'mobile')
   u.searchParams.set('key', process.env.PSI_API_KEY)
   const r = await fetch(u); const j = await r.json()
   // 取 j.lighthouseResult.categories.*.score 与 j.lighthouseResult.audits['*.numericValue']
   ```
   回填时把 `strategy=desktop` 也跑一遍可选，但验收口径与 CI 一样用 mobile。
2. 等 Google 侧匿名池恢复（不可控，不作为依赖）。
3. 没有 PSI key 时，用本文件 §3 的**静态资源对照**代替分数对照（本轮采用）。

### 2.2 身份核查：现网 `blog.mcxiaochen.top` 已不是 Hexo 1.6.14 产物

2026-11-24 20:20:57（`upstream-identity.json`）用 Node https 探测：

| URL | HTTP | 标题 | Astro 标记 | Hexo 标记 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `https://blog.mcxiaochen.top/` | 200 | 辰渊尘の博客 | `data-astro-cid` + `/_astro/` 资源 11 处 | 0 | Server: `edgeone makers`；HTML 121,204 B（br 传输 29,473 B） |
| `https://blog.mcxiaochen.top/about/` | 200 | 关于 \| 辰渊尘の博客 | 是 | 0 | — |
| `https://blog.mcxiaochen.top/2025/08/22/1b75e3c5/`（旧 Hexo permalink） | **404** | 404 - 页面未找到 | 是 | 0 | 旧 Hexo 路由已不存在 |
| `https://blog.mcxiaochen.top/posts/p1b75e3c5/`（新 permalink） | 200 | 手把手教你在Linux系统下部署MCSManager… | 是 | 0 | 新 Astro 路由；`/posts/<hash>/` 与 P7-4 文档里的迁移后 permalink 一致 |
| `https://mcxiaochenn.github.io/blog/`（README 里的演示站） | 200 | AnZhiYu Baseline - 上游 1.7.1 参考产物 | 是 | 有（GLOBAL_CONFIG / cdn.cbd.int） | 本仓库 examples/blog 的线上部署（子路径），可作为将来 PSI 的迁移站对照 URL |

扫描首页 HTML 的字符串计数：`hexo=0`、`GLOBAL_CONFIG=0`、`cdn.cbd.int=0`，
`_astro/=11`、`<script>` 18 个（4 外链 + 14 inline）、`rel=stylesheet` 2 个。
→ 现网是**另一个 Astro 站**（带 Svelte 组件、自己的 fonts/RSS，托管在 EdgeOne Makers），
不是 hexo-theme-anzhiyu 1.6.14 的产物。

**结论**：即使 PSI 恢复，`blog.mcxiaochen.top` 的分数也不代表「上游主题实现」的水平。
「上游」基准要重新定义，可用的三路证据是：

1. 本仓库 §3 的 **Hexo 1.6.14 真实站产物**（`D:\Git-project\xcAnzhiyu\public`，只读，
   `<meta name="generator" content="Hexo 7.3.0">`，主题链接指向 cdn.cbd.int 那套 1.6.14 资源）
   —— 这是「上游主题实现」的直接产物，静态资源可量。
2. 上游 1.7.1 源码（`D:\Git-project\_research\anzhiyu-upstream`）在本机 `hexo g` 出的产物
   —— 与 examples/blog 同样是 1.7.1，是**最严格**的同版本对照；本轮未做（本机不跑浏览器，
   但静态资源可以量；后续可加）。
3. PSI 恢复后测 `https://blog.mcxiaochen.top/`（现网新站）与演示站 URL —— 这是「现网同行」
   对照，不是「上游主题」对照，报告里必须分开写。

---

## 3. 上游 vs 迁移站：可测量的静态资源对照

### 3.1 三个口径的对象

| 名称 | 路径 / URL | 说明 |
| --- | --- | --- |
| 上游 Hexo 真实站产物（golden） | `D:\Git-project\xcAnzhiyu\public`（只读） | 用户真实站 `hexo g` 产物：Hexo 7.3.0 + hexo-theme-anzhiyu 1.6.14，含用户自定义配置（echarts、字体 CDN、统计、评论插件），首页 HTML 144,847 B |
| 迁移站（CI 被测） | `examples/blog/dist` | 本仓库参考构建（1.7.1 主题，固定内容/配置），62 页，首页 HTML 59,949 B |
| 现网（已非 Hexo） | `https://blog.mcxiaochen.top/` | 另一个 Astro 站，仅作「现网资源画像」参考（§2.2） |

度量脚本：`node .tmp-p72/static-profile.mjs <root> <html> <label>`、`.tmp-p72/dist-assets.mjs`、
`.tmp-p72/http-measure.mjs`（均为本任务临时脚本，未入库；可复跑，见附录 A）。
gzip/brotli 用 `node:zlib` 逐文件算，**不是**浏览器传输入的实测值；传输实测见 §3.3。

### 3.2 首页资源画像对照（表）

| 指标 | 上游 Hexo 1.6.14 golden | 迁移站 home | 迁移站 post | 迁移站 about |
| --- | --- | --- | --- | --- |
| HTML raw | 144,847 B | 59,949 B | 60,861 B | 53,050 B |
| HTML gzip | 30,920 B | 14,058 B | 16,121 B | 13,455 B |
| `<script>` 标签 | 39（本地 12 / 三方 17 / inline 10，inline 12,079 B） | 24（6 / 11 / 7，inline 10,726 B） | 26（7 / 12 / 7，inline 12,923 B） | 25（6 / 12 / 7，inline 17,292 B） |
| **本地 JS raw / gzip / br** | **1,253,391 / 416,775 / 335,616 B** | 140,080 / 45,341 / 35,202 B | 154,296 / 49,278 / 38,372 B | 140,080 / 45,341 / 35,202 B |
| 其中用户自定义 echarts | 1,117,938 / 362,986 / — | —（迁移站无此自定义配置） | — | — |
| **本地 JS 扣除 echarts** | **135,453 / 53,789 B** | 140,080 / 45,341 B | 154,296 / 49,278 B | 140,080 / 45,341 B |
| **本地 CSS raw / gzip / br** | **618,280 / 79,935 / 61,257 B** | 684,384 / 79,058 / 59,283 B | 684,384 / 79,058 / 59,283 B | 684,384 / 79,058 / 59,283 B |
| `<link rel=stylesheet>` | 14（本地 5 / 三方 9） | 8（2 / 6） | 8（2 / 6） | 7（2 / 5） |
| 外部 host（含正文链接，仅量级参考） | 34 | 8 | 10 | 9 |

结论（可写进验收的）：

- **JS 不重于上游**：golden 首屏本地 JS 1.25 MB 里 1.12 MB 是用户自定义 `echarts.min.js`；
  扣除后 135 KB raw / 54 KB gzip，迁移站 140 KB raw / 45 KB gzip —— raw 相近，**gzip 反而小 16%**。
  迁移站真正同步加载的只有 6–7 个本地脚本（见 §3.3 明细），没有把 `echarts` 之类带进来。
- **CSS gzip 基本持平**（79.9 KB vs 79.1 KB），raw 更大（684 KB vs 618 KB）的原因有二：
  1.7.1 样式比 1.6.14 多，且 `examples/blog/astro.config.mjs` 的 `vite.build.cssMinify: false`
  是 Phase 2 验收的硬约束（readmode 笔误 + `docs/baseline.json` 未压缩基线 ±5% 判定），
  不是性能回归。**压缩产物的体积另建预算**，是本文件 §7.1 的第一条优化路径。
- **HTML 减半**（30.9 KB gzip → 14.1 KB），三方脚本标签从 17 个降到 11 个（且都在
  blockedUrlPatterns 里，CI 不加载）。
- 口径限制：golden 含用户自定义配置（echarts/字体 CDN/统计/评论/友链），examples/blog 是
  固定 fixture —— 只能比较「同主题资源结构量级」，不是逐字节等价。等 PSI 恢复或上游 1.7.1
  产物就绪后，再补同版本对照。

### 3.3 迁移站首屏 JS/CSS 明细（可审计字节数）

# home / about 相同（post 多一个 `ai_abstract.js`）

| 资源 | raw | gzip | brotli | 加载方式 |
| --- | --- | --- | --- | --- |
| `/_astro/ClientRouter.astro_astro_type_script_index_0_lang.CARLn6B5.js` | 4,072 | 1,733 | 1,505 | module |
| `/js/utils.js` | 50,562 | 13,588 | 11,345 | 同步 |
| `/js/main.js` | 64,181 | 16,252 | 13,608 | 同步 |
| `/js/tw_cn.js` | 19,416 | 12,762 | 7,816 | 同步 |
| `/anzhiyu/random.js` | 384 | 257 | 210 | async |
| `/_astro/BaseLayout.astro_astro_type_script_index_0_lang.BX8t1Fli.js` | 1,465 | 749 | 618 | module |
| **home/about 本地 JS 合计** | **140,080** | **45,341** | **35,202** | — |
| `.../js/anzhiyu/ai_abstract.js`（仅文章页） | 14,216 | 3,937 | 3,170 | 同步 |
| **post 本地 JS 合计** | **154,296** | **49,278** | **38,372** | — |
| `/css/index.css`（P7-6 占位，非主题样式） | 297 | 290 | 208 | stylesheet |
| `/_astro/upstream.By-987Uf.css`（主题全量样式，1.7.1 未压缩） | 684,087 | 78,768 | 59,075 | stylesheet |
| **本地 CSS 合计** | **684,384** | **79,058** | **59,283** | — |

- 全站 `dist`：JS 16 个文件 / 251,496 B raw / 80,810 B gzip；CSS 2 个文件 / 684,384 B raw / 79,058 B gzip。
- 交叉校验：`docs/baseline.json` 的 `css.indexCssGzipBytes = 79,124`（1.7.1 基线 gzip），
  与迁移站主题 CSS gzip 79,058 B 一致（差 0.08%，来自打包后文件边界）。

### 3.4 本机 preview 传输实测（gzip，真实 HTTP 响应）

`astro preview`（Astro 7.4.13，Vite preview + `@polka/compression`）在 `127.0.0.1:4310`
实测（`http-measure.json`，2026-11-24T12:23:37Z；三个 URL 全部 HTTP 200、`content-encoding: gzip`）：

| URL | HTML | 本地 JS 传输 | 本地 CSS 传输 | 本地资源合计（含可能懒加载图） |
| --- | --- | --- | --- | --- |
| `/` | 14,083 B | 45,743 B | 80,624 B | 172,248 B（含 lazy 图/图标 31,798 B） |
| `/2024/11/01/longform-hexo-astro/` | 16,169 B | 49,694 B | 80,624 B | 核心 146,487 B（同页另 31,798 B 懒加载图不计） |
| `/about/` | 13,474 B | 45,743 B | 80,624 B | 167,393 B（含 lazy 图/图标 31,798 B） |

> 首屏「必然会加载」的核心传输 = HTML + JS + CSS ≈ **140.4 KB**（home/about）/ **146.5 KB**（post）；
> 视口内若触发懒加载图，上限 +31.8 KB ≈ 172–178 KB。预算按 240 KiB 定（§4）。

### 3.5 现网（Astro 新站）资源画像（仅参考，不可与迁移站等价比较）

`https://blog.mcxiaochen.top/`（2026-11-24T12:20:20Z，`upstream-assets.json`）：
HTML 121,204 B（br 传输 29,473 B）、`<script>` 18 个（4 外链 / 14 inline，inline 36,676 B）、
外链 script 传输 9,101 B（br，其中 analytics `umami.mcxiaochen.top` 4,152 B）、
`<link rel=stylesheet>` 2 个传输 23,947 B（br）、字体预加载 `/fonts/misans/...`。
—— 这是一个**不同实现**的新站，资源结构本身就不同（CSS 只有 112,650 B 解压，是迁移站 684 KB 的 1/6），
不能拿来当「主题上游」的分数锚点；列在这里是为了说明 §2.2 的结论。

---

## 4. 预算与依据

配置在 `.lighthouserc.json`，全部 `error` 级（硬门禁）。`resource-summary:*:size` 的
`numericValue` 是 **transferSize**（Lighthouse `assertions.js` 的 detail 断言实现：resource-summary
的 item 有 `transferSize`、没有 `size`，代码回退到 transferSize），与 §3.4 的 gzip 传输同口径。

### 4.1 四项分数（初值 = 保守占位，首跑后回填）

| 断言 | 初值 | 依据 / 为什么不是 90+ |
| --- | --- | --- |
| `categories:performance` | `minScore 0.6` | **上游 PSI 取不到**（§2.1），无法按上游取整 → 保守初值。静态站 performance < 0.6 基本只可能是严重回归（渲染阻塞失控 / JS 爆炸 / 图片巨大）。PSI 恢复或首跑后按 §6 回填收紧。 |
| `categories:accessibility` | `minScore 0.8` | 主题 DOM 直接来自上游 1.7.1（未做 a11y 专项：图标锚点、`javascript:void(0)`、颜色对比度等是上游原样），不是本项目能单方面「优化掉」的；先把门槛定在「不引入新 a11y 回归」的 0.8。 |
| `categories:best-practices` | `minScore 0.8` | blockedUrlPatterns 拦掉的第三方请求会在浏览器 console 报 `net::ERR_BLOCKED_BY_CLIENT`，Lighthouse 的 `errors-in-console` 审计**必然失分**——这是测量口径伪影，不是站点缺陷，所以门槛不能按 0.9 定；0.8 仍能抓到真实 console error/已废弃 API 回归。 |
| `categories:seo` | `minScore 0.85` | 主题里大量 `href="javascript:void(0);"` 锚点会拉低 `crawlable-anchors`；canonical/title/description/lang 都齐（本机 static profile 可查），0.85 为保守下限。 |

> 为什么敢用「保守初值」：PLAN 原话是「Lighthouse 四项不低于上游」——上游分数**不可得**时，
> 先保证「不出现明显低于上游水平」的回归，再用 CI 首跑实测和 PSI（若恢复）逐步收紧到真实基线。
> 这是「先立门禁、再校准」，不是把阈值调到能过。

### 4.2 资源预算（实测 + 余量）

| 断言 | 阈值 | 本机实测（3 URL 取最大） | 余量与依据 |
| --- | --- | --- | --- |
| `total-byte-weight` | `245,760 B`（240 KiB） | 核心 140.4–146.5 KB；含懒加载图上限 172–178 KB | +40%：首屏视口图片是否触发懒加载、CSS/JS 小幅变化都能容下；再大就是明确回归 |
| `resource-summary:total:size` | `245,760 B` | 同上 | 与 total-byte-weight 同口径（一条挂掉另一条会给更细的报错） |
| `resource-summary:script:size` | `65,536 B`（64 KiB） | 45,743 / 49,694 B（home / post，gzip 传输） | +32%：允许 1–2 个模块 chunk 或小脚本新增；`/js/main.js` 级别的爆炸会被抓住 |
| `resource-summary:script:count` | `26` | 17 / 19 / 18（本地 6–7 + 被 block 的三方 11–12；blocked 请求仍计入 requestCount、transferSize=0） | 留 Astro 动态 import chunk、modulepreload 余量；新增 5 个以上脚本才会挂 |
| `resource-summary:stylesheet:size` | `112,640 B`（110 KiB） | 80,624 B（3 URL 相同，gzip 传输） | +40%：CSS 是最容易随主题同步变大的部分；现在 684 KB raw / 79 KB gzip，压缩后预计 ~60 KB gzip，预算留出「压缩产物前后」两态 |
| `resource-summary:stylesheet:count` | `12` | 7–8（本地 2 + 被 block 的三方 5–6） | +4：主题新增 1–2 个第三方 CSS 也在额度内；再多就要显式评估 |
| `resource-summary:third-party:size` | `4,096 B` | 0（14 个 host 全部 block，transferSize=0） | 拦漏告警：>4 KiB 说明 blockedUrlPatterns 漏了某个第三方 host，或站点新增了外部资源 |

> 资源预算的「实测」全部来自本机 `astro preview` 真实 HTTP 响应（§3.4），不是估算；
> 分数预算没有实测，**明确标注为占位初值**，不冒充「上游分数」。

---

## 5. CI job 结构

### 5.1 job 定义（`.github/workflows/ci.yml` 末尾，新增独立 job）

```yaml
lighthouse:
  name: lighthouse
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - Checkout
    - Setup pnpm            # 不写 version，读根 package.json 的 packageManager=pnpm@10.29.3
    - Setup Node.js 24
    - Install dependencies  # pnpm install --frozen-lockfile
    - Build blog            # pnpm --filter blog build（默认构建，不含 PWA 产物）
    - Start preview server  # pnpm --filter blog exec astro preview --host 127.0.0.1 --port 4321 &
                            # 轮询 curl 200，最多 60s，失败打印 preview 日志并 exit 1
    - Run Lighthouse CI     # npx --yes @lhci/cli@0.16.1 autorun
    - Collect Lighthouse artifacts  # if: always()，把 $RUNNER_TEMP 的 preview 日志拷进 .lighthouseci
    - Upload Lighthouse report      # if: always()，artifact 名 lighthouse-report，路径 .lighthouseci
```

设计要点：

- **独立 job，不动 build/e2e**：三者互不依赖、并行跑；lighthouse 自己 build + preview（与 e2e 同模式），
  不会把 15min 的 build job 拖更长。
- **必须 `pnpm exec` 起 preview**：本机实测 `pnpm --filter blog preview -- --host 127.0.0.1 --port 4310`
  会把 `--` 原样传给 astro，报 `Unknown command: astro preview --host`；`pnpm --filter blog exec
  astro preview --host ... --port ...` 才是正确形式。
- **为什么不用 `lhci --collect.startServerCommand`**：任务要求先起 preview 再测；独立步骤失败时
  `preview.log` 能直接进 artifact，startServerCommand 的进程日志在 lhci 里不好取。
- **固定 `@lhci/cli@0.16.1`**：npm dist-tag latest（2026-11-24），内置 lighthouse 13.6.0；
  `npx --yes` 只在 runner 缓存里装，**root package.json / pnpm-lock.yaml 零改动**。
- **Chrome**：ubuntu-latest 预装 google-chrome，不设 `CHROME_PATH`，由 chrome-launcher 自动发现。
  runner 镜像换 base 导致找不到 Chrome 时，排障见 §8.
- **artifact**：`.lighthouseci/`（`lhr-*.json` 逐次运行报告 + `assertion-results.json` + `preview.log`），
  `if: always()`——失败也上传，才能看到「哪条断言挂了、实际值多少」。

### 5.2 本机可验证 / 不可验证清单（诚实记录）

| 项 | 本机结果 | 证据 |
| --- | --- | --- |
| `pnpm --filter blog build` 成功、62 页 | ✅ 通过 | 20:20:20 抢到 `.build.lock` → 20:20:27 `62 page(s) built in 3.75s` → `BUILD_EXIT=0`，20:20:33 释放锁（`.tmp-p72/build-p72.log`） |
| `.lighthouseci` 三个 URL 能 200 | ✅ 通过 | 20:23:37 `astro preview`（Astro 7.4.13）实测：`/`、`/2024/11/01/longform-hexo-astro/`、`/about/` 全部 200，`content-encoding: gzip`（`.tmp-p72/http-measure.json`） |
| `.lighthouserc.json` 语法 | ✅ | `JSON.parse` 通过；断言 key 按 `@lhci/utils@0.16.1/src/assertions.js` 源码核对（`categories:*`、`resource-summary:<type>:size|count` 均支持） |
| `ci.yml` YAML 语法 | ✅ | `yaml`(npm) `parse` 通过：jobs = build/e2e/lighthouse，9 个步骤（`node -e ...`） |
| `blockedUrlPatterns` 是否真的生效 | ✅ 配置路径已核对 | Lighthouse `core/gather/driver/prepare.js` 从 `settings.blockedUrlPatterns` 读，`core/config/constants.js` 的 `defaultSettings` 含该 key → LHCI `collect.settings` 经 `--cli-flags-path` 传入有效；值直接进 CDP `Network.setBlockedURLs`（CDP URL pattern，`https://host/*` 即整站拦） |
| **Lighthouse 真实执行/分数** | ❌ 本机不可测 | DSH Windows 沙箱起不了 Chromium（PLAN R12；本轮 `node` spawn `cmd.exe` 也 EPERM）。首跑在 CI，回填见 §6 |
| **上游 PSI 分数** | ❌ 429 | §2.1 |
| bash 脚本语法校验 | ⚠️ 未能本机跑 bash | 沙箱里 Git Bash 创建 signal pipe 失败（`could not create signal pipe, Win32 error 5`）；脚本为 14 行简单循环，人工审查 + CI 首跑兜底 |

---

## 6. CI 首跑回填模板（首跑后必须回来填本节）

### 6.1 取数

```bash
# 1) 下载 artifact（run-id 见 GitHub Actions 页面）
gh run download <run-id> -n lighthouse-report -D artifacts/lighthouse

# 2) 每次运行一份 lhr-*.json（文件名不含 URL，用 finalDisplayedUrl 区分）
ls artifacts/lighthouse/.lighthouseci/

# 3) 一行一 URL 提取（jq；ubuntu runner 自带）
jq -r '[ .finalDisplayedUrl,
  .categories.performance.score, .categories.accessibility.score,
  .categories["best-practices"].score, .categories.seo.score,
  .audits["first-contentful-paint"].numericValue,
  .audits["largest-contentful-paint"].numericValue,
  .audits["total-blocking-time"].numericValue,
  .audits["cumulative-layout-shift"].numericValue,
  .audits["speed-index"].numericValue,
  .audits["total-byte-weight"].numericValue
] | @tsv' artifacts/lighthouse/.lighthouseci/lhr-*.json

# 4) resource-summary 明细（script/stylesheet/total/third-party 的 requestCount + transferSize）
jq -r '.finalDisplayedUrl as $u | .audits["resource-summary"].details.items[]
  | [$u, .resourceType, .requestCount, .transferSize] | @tsv' artifacts/lighthouse/.lighthouseci/lhr-*.json
```

`assertion-results.json` 里是逐条断言的 pass/fail 与 actual/expected（阈值校准的直接依据）。

### 6.2 分数回填表（每 URL 3 次运行的中位数；`score` 为 0–1，报告里写 ×100）

| URL | performance | accessibility | best-practices | seo | FCP (ms) | LCP (ms) | TBT (ms) | CLS | SI (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `http://127.0.0.1:4321/` | <!--待回填--> | | | | | | | | |
| `http://127.0.0.1:4321/2024/11/01/longform-hexo-astro/` | <!--待回填--> | | | | | | | | |
| `http://127.0.0.1:4321/about/` | <!--待回填--> | | | | | | | | |

### 6.3 资源回填表（gh 上 artifact 里的 lhr-*.json）

| URL | total-byte-weight | total.size | script.count | script.size | stylesheet.count | stylesheet.size | third-party.size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | <!--待回填--> | | | | | | |
| `/2024/11/01/longform-hexo-astro/` | <!--待回填--> | | | | | | |
| `/about/` | <!--待回填--> | | | | | | |

### 6.4 回填规则（只许收紧，不许放宽）

1. 把首跑中位数填进 §6.2 / §6.3，并在本节顶部记录 `run id`、`lhr.fetchTime`、`lhr.lighthouseVersion`。
2. 分数阈值改成「实测取整到 0.05 的向下取整 - 0.05」？**不是**：改成「实测向下取整到 0.05」
   （例：实测 0.83 → 阈值 0.80；实测 0.92 → 阈值 0.90）。**只能 >= 原初值**，即只允许往上抬。
3. 资源阈值同上：按实测的最大值向上取整到下一个 8 KiB / 4 个请求的档位；不得低于 §4.2 的初值。
4. 若首跑某项 < 当前阈值：先按 §7 处置，**不得**直接把阈值改到实测值。
5. PSI 恢复后：测 `https://blog.mcxiaochen.top/`（现网新站）与迁移站线上 URL（GitHub Pages demo
   或将来部署 URL），同 strategy=mobile 下把上游分数记录到 §2.1；「不低于上游」按同口径比较（§7.2）。

---

## 7. 不达标处置原则（明确禁止「调低阈值掩盖」）

### 7.1 优化优先（按收益排序，全部是后续可做的真实优化）

1. **CSS（最大单项）**：现在 684 KB raw / 79 KB gzip。`cssMinify: false` 是 Phase 2 验收约束
   （上游 readmode 笔误 + 未压缩基线 ±5% 判定），不能直接改。可行路径：另建一条
   「压缩产物」构建/独立预算（`astro.config.mjs` 注释里已经写明这个方向），或把主题 CSS 拆成
   关键/非关键（critical CSS inline + 其余 defer）。
2. **首屏同步 JS**：`/js/main.js` 64 KB、`/js/utils.js` 51 KB、`/js/tw_cn.js` 19 KB 都是同步
   `<script src>`。可评估 `defer`/`type=module`/按功能懒加载（会改变行为时序，需 PLAN 允许 + e2e 覆盖）。
3. **图片**：封面/头像已 `data-lazy-src`，可进一步用 webp/avif + 明确 width/height（还能吃 CLS）。
4. **第三方**：CI 已 block；真实站应优先自托管或用 PWA 的 spare URL 逻辑，减少 CDN 抖动。
5. **LCP/CLS**：loading-box 预留高度、字体本地化（现主题字体在 CDN）。

### 7.2 什么情况下「不低于上游」才算成立

- **同口径**：CI 是「blocked 第三方 + 本地 preview + 无 brotli」；PSI 是「含第三方 + 真实 CDN + brotli」。
  两组数字不能直接比大小。
- 可行判定顺序：
  1. 资源预算（§4.2）：上游 golden 的静态资源量可测（§3.2）→ 迁移站不超过即成立；
  2. 分数：PSI 恢复后，**同一 strategy、同一 URL 家族**下比：现网 vs 迁移站线上 URL。若上游分数
     更高而迁移站更低 → 优化；若持平或迁移站更高 → 「不低于上游」成立；
  3. 上游 1.7.1 同版本对照：将来可在 CI 里 `hexo g` `_research/anzhiyu-upstream`（或本机生成后
     进仓库）再跑同一套 LHCI —— 这才是「同版本同口径」最严格证据，本轮因 PSI 429 + R12 未做。
- **只有两种阈值调整被允许**：(a) 首跑实测高于初值时**向上收紧**；(b) 有上游同口径实测证据
  证明某阈值定得比上游还高（即达不到上游水平）时为「对齐上游」而调整，且必须在 PR 里贴上游
  证据（PSI JSON / 上游同版本 LHCI 报告）。**任何无证据的向下调整都视为违规。**

### 7.3 若首跑不达标的处置步骤

1. 先确认是不是测量伪影：blocked 请求的 console error（bp 分）、preview 冷启动抖动（重跑一次）、
   懒加载图是否进视口（看 `lhr.audits['resource-summary'].details` 与 `network-requests`）。
2. 是真实回归 → 按 §7.1 优化，提交修复后再跑。
3. 优化后仍低于阈值，且能证明是「上游主题本身的水平」→ 在文档/PR 记录证据后调整；
   否则保持红，不合并。
4. 每一条失败断言都要有对应金额/字节的说明（如 `stylesheet:size 实测 121,704 > 阈值 112,640`），
   写在 PR 描述里，而不是「调阈值让它绿」。

---

## 8. 已知限制与风险

| # | 限制 | 影响 | 处置 |
| --- | --- | --- | --- |
| 1 | 本机不能跑 Lighthouse/Chromium（DSH Windows 沙箱，PLAN R12） | 本轮没有迁移站实测分数 | 首跑 CI 后按 §6 回填；本机只做静态/口径验证 |
| 2 | PSI API 429（匿名 project 配额为 0） | 拿不到上游分数 | §2.1 三条路径；有 API key 即可取 |
| 3 | 旧 Hexo 1.6.14 现网已被替换成另一个 Astro 站（旧 permalink 404） | 「上游」分数基准失真 | §2.2 身份核查 + §3 golden 静态对照；需 Lead/用户确认新的「上游」锚点 |
| 4 | examples/blog 是固定 fixture（62 页），不是真实站 94 页 | 分数口径是「同产物代理」 | 文档 §1 写明；真实站性能需部署后另测 |
| 5 | preview 不是生产 CDN（无 brotli、无 HTTP/2、无缓存头；实测只有 gzip） | CI 分数偏保守（真实站会更好） | 预算按 gzip 定；不因此放宽阈值 |
| 6 | blockedUrlPatterns 的 console error 会拉低 best-practices | bp 门槛 0.8 而非 0.9；解释见 §4.1 | 若将来能起本地 stub server 可去掉该伪影，另议 |
| 7 | 本机无可用 bash（sandbox 下 Git Bash 创建 signal pipe 失败） | CI 的 shell 片段未在本机做 `bash -n` | 片段人工审查；CI 首跑兜底 |
| 8 | `@lhci/cli@0.16.1` 需 Node >= 22.19（其 package.json engines） | CI 用 Node 24 → OK | 不要降 Node 版本 |

---

## 附录 A：复现命令（本机可复跑的部分）

```powershell
# 0) 构建（先抢 .build.lock，结束释放；本任务已实测 62 页 / 3.75s）
mkdir .build.lock; pnpm --filter blog build; Remove-Item .build.lock -Recurse -Force

# 1) dist 静态资源画像（首屏 JS/CSS 明细）
node .tmp-p72/dist-assets.mjs          # → .tmp-p72/dist-assets.json
node .tmp-p72/static-profile.mjs "examples/blog/dist" "index.html" "astro-blog-home"

# 2) 上游 Hexo 1.6.14 golden 画像（只读）
node .tmp-p72/static-profile.mjs "D:\Git-project\xcAnzhiyu\public" "index.html" "hexo-golden-home"

# 3) PSI 取数（本机 429；有 key 时加 &key=…）
node .tmp-p72/psi2.mjs mobile          # → .tmp-p72/psi-mobile-attempts.json

# 4) 现网身份核查 / 资源画像
node .tmp-p72/upstream-identity.mjs    # → .tmp-p72/upstream-identity.json
node .tmp-p72/upstream-assets.mjs      # → .tmp-p72/upstream-assets.json

# 5) 本地 preview 传输实测（起 preview → 测 gzip 传输 → 杀进程，脚本内完成）
node .tmp-p72/preview-probe.mjs        # 已可用；或按需手动起停 127.0.0.1:4310

# 6) 配置校验（无需浏览器/Chrome）
node -e "JSON.parse(require('fs').readFileSync('.lighthouserc.json','utf8'))"
node -e "const YAML=require('yaml'),fs=require('fs');const d=YAML.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log(Object.keys(d.jobs))"
```

临时测量脚本都在 `.tmp-p72/`（未纳入 git，可复跑；JSON 输出为原始证据）。
`.build.lock` 的规矩：`mkdir` 循环抢锁、构建完 `Remove-Item .build.lock`（本任务已遵守，
`build-p72.log` 里有 `LOCK_ACQUIRED` / `LOCK_RELEASED` 时间戳）。

## 附录 B：blockedUrlPatterns 逐条清单与理由

（来源：`.tmp-p72/external-hosts.json`（62 页 HTML 扫描）+ `.tmp-p72/cssjs-hosts.json`（CSS/JS 内 URL 扫描）。
`https://host/*` 是 CDP URL pattern，等价于「整站拦掉」。）

| # | pattern | 出现在哪 | 为什么拦 |
| --- | --- | --- | --- |
| 1 | `https://cdn.cbd.int/*` | HTML 60 页、917 处（三方 JS/CSS 主力：fancybox / lazyload / snackbar / APlayer / Meting / pace / iconfont / progress_bar…） | 主题里写死的第三方 CDN，CI 网络不可控 |
| 2 | `https://npm.elemecdn.com/*` | HTML 60 页、452 处（头像、静态图、深色模式 dark.js；PWA 的 spare URL 源站） | 同上；elemecdn 在国内，CI runner 可能超时 |
| 3 | `https://bu.dusays.com/*` | HTML 60 页、195 处（封面/头像/背景图图床） | 第三方图床，且是首屏图风险源 |
| 4 | `https://img02.anheyu.com/*` | 主题 CSS `url()`（loading gif / 背景图） | 首屏 CSS 背景图，不拦会占 total-byte-weight |
| 5 | `https://image.anheyu.com/*` | HTML 60 页、120 处（侧栏友链图标 `<img>`） | 第三方图片 |
| 6 | `https://hexo.anheyu.com/*` | HTML 60 页、60 处（友链项） | 第三方（多数是链接，拦了无损） |
| 7 | `https://yuanshen.site/*` | 主题 CSS `url("https://yuanshen.site/imgs/loading-bar.png")` | 首屏 loading 背景图 |
| 8 | `https://s1.hdslb.com/*` | Phase 6 fixture `tags-thirdparty` 的 B 站播放器图片 | 第三方图片（不在 3 个被测 URL，但 fixture 可能被后续 URL 用到） |
| 9 | `https://player.dogecloud.com/*` | Phase 6 `dogeplayer` tag 的 loader 脚本 | 第三方脚本 |
| 10 | `https://example.com/*` | Phase 6 media fixture 的音频占位 URL | 占位域名，避免 404 噪音 |
| 11 | `https://sdk.51.la/*` | `/js/main.js` 里的 51.LA 统计 SDK | 统计脚本，跑分不应带上第三方统计 |
| 12 | `https://summary.tianli0.top/*` | `/js/anzhiyu/ai_abstract.js` 的 AI 摘要 API（文章页可能触发） | 第三方 API |
| 13 | `https://cravatar.cn/*` | `/js/anzhiyu/comment_barrage.js` 评论头像 | 第三方图片 |
| 14 | `https://www.travellings.cn/*` | `/js/utils.js` 的 Travellings 入口 | 第三方 |

> 不在清单里的「正文超链接 host」（github.com / hexo.io / bilibili.com…）不会产生资源请求，无需拦；
> 真实站可能额外引用 `cnfont-chillroundfbold.mcxiaochen.top`（用户自定义字体）等，
> 那是迁移站部署后按 §6 规则补进本清单的对象，不属于 examples/blog 验证站。

## 附录 C：`.lighthouserc.json` 关键字段与断言映射

| 配置位置 | 值 | Lighthouse 侧语义 |
| --- | --- | --- |
| `ci.collect.numberOfRuns` | `3` | 每 URL 跑 3 次，`lhci assert` 对中位数判定 |
| `ci.collect.url[]` | 3 个 127.0.0.1:4321 URL | 都被 CI 里起好的 preview 服务 |
| `ci.collect.settings.blockedUrlPatterns[]` | 附录 B 的 14 条 | → Lighthouse `settings.blockedUrlPatterns` → CDP `Network.setBlockedURLs` |
| `ci.assert.assertions["categories:*"]` | `minScore` | 类别分数（0–1） |
| `ci.assert.assertions["resource-summary:<type>:size"]` | `maxNumericValue` | `lhr.audits['resource-summary'].details.items[type].transferSize` |
| `ci.assert.assertions["resource-summary:<type>:count"]` | `maxNumericValue` | `...items[type].requestCount` |
| `ci.assert.assertions["total-byte-weight"]` | `maxNumericValue` | `lhr.audits['total-byte-weight'].numericValue`（transferSize 总和，字节） |

断言实现依据：`@lhci/utils@0.16.1/src/assertions.js`（`getAssertionResultsForAudit` 的
`resource-summary` 分支、`categories` 分支）；Lighthouse 侧：`core/gather/driver/prepare.js`
（blockedUrlPatterns）、`core/config/constants.js#defaultSettings.blockedUrlPatterns`、
`core/audits/byte-efficiency/total-byte-weight.js`（numericValue = totalBytes）。
