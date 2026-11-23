#!/usr/bin/env node
/**
 * check-third-party.mjs — P5-1「第三方集成」组件库与门控验证单测。
 *
 * 运行：node packages/astro-theme-anzhiyu/scripts/check-third-party.mjs
 * 环境：Node 24（原生 type stripping，可直接 import 主题包 .ts / .mjs），零新增依赖。
 *
 * 覆盖：
 *   1) 4 套配置（全关 / 评论开 Twikoo / 搜索+统计+聊天全开 / 双系统 Twikoo+Waline），
 *      每套都走真实配置链路 loadThemeConfig()（YAML → defaults 深合并 → zod 校验）；
 *   2) 「关闭的组件输出 0 节点」：全关配置下逐个断言全部 46 个渲染函数返回空串；
 *   3) 「开启的组件产出上游关键 id/class」：#post-comment、#twikoo-wrap、#local-search、
 *      #algolia-search、#docsearch、data-pjax 脚本、CRISP_WEBSITE_ID、manifest link 等；
 *   4) 组件边界静态检查：每个 .astro 都只读 getThemeConfig()，不碰 astro:content。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { loadThemeConfig } from '../src/config/loader.ts'
import * as misc from '../src/components/third-party/render.mjs'
import * as comments from '../src/components/third-party/comments/render.mjs'
import * as cardPostCount from '../src/components/third-party/card-post-count/render.mjs'
import * as newestComments from '../src/components/third-party/newest-comments/render.mjs'
import * as search from '../src/components/third-party/search/render.mjs'
import * as chat from '../src/components/third-party/chat/render.mjs'
import * as math from '../src/components/third-party/math/render.mjs'
import * as share from '../src/components/third-party/share/render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const THIRD_PARTY_DIR = resolve(HERE, '../src/components/third-party')

/* ------------------------------------------------------------------ */
/* 断言框架                                                            */
/* ------------------------------------------------------------------ */

let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 0 节点断言：渲染结果必须为空串（或纯空白）。 */
function checkOff(name, html) {
  check(name, typeof html === 'string' && html.trim() === '', `实际输出 ${String(html).length} 字符`)
}

/** 开启断言：html 必须含全部锚点。 */
function checkOn(name, html, anchors) {
  const missing = anchors.filter((a) => !String(html).includes(a))
  check(name, missing.length === 0, missing.length ? `缺少 ${missing.join(' / ')}` : '')
}

/** 把渲染函数按组摊平成 [组.名, 函数]。 */
const GROUPS = {
  misc: misc.miscRenderers,
  comments: comments.commentsRenderers,
  'card-post-count': cardPostCount.cardPostCountRenderers,
  'newest-comments': newestComments.newestCommentsRenderers,
  search: search.searchRenderers,
  chat: chat.chatRenderers,
  math: math.mathRenderers,
  share: share.shareRenderers,
}

function allRenderers() {
  const out = []
  for (const [group, fns] of Object.entries(GROUPS)) {
    for (const [name, fn] of Object.entries(fns)) out.push([`${group}.${name}`, fn])
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 4 套配置（写临时 YAML，走 loader 真实链路）                           */
/* ------------------------------------------------------------------ */

const OFF_BASE = `
comments:
  use: null
  card_post_count: false
newest_comments:
  enable: false
local_search:
  enable: false
algolia_search:
  enable: false
docsearch:
  enable: false
site_verification: []
google_adsense:
  enable: false
pwa:
  enable: false
subtitle:
  enable: false
footer:
  footerBar:
    subTitle:
      enable: false
  runtime:
    enable: false
pangu:
  enable: false
bubble:
  enable: false
fireworks:
  enable: false
canvas_ribbon:
  enable: false
canvas_fluttering_ribbon:
  enable: false
canvas_nest:
  enable: false
activate_power_mode:
  enable: false
click_heart:
  enable: false
ClickShowText:
  enable: false
aplayerInject:
  enable: false
chatra:
  enable: false
tidio:
  enable: false
daovoice:
  enable: false
crisp:
  enable: false
mathjax:
  enable: false
katex:
  enable: false
mermaid:
  enable: false
sharejs:
  enable: false
addtoany:
  enable: false
baidu_analytics: null
google_analytics: null
cnzz_analytics: null
cloudflare_analytics: null
microsoft_clarity: null
post_head_ai_description:
  enable: false
`

/**
 * 4 套配置 = 全关基线 + 顶层覆盖片段。
 * 覆盖片段只写要改的顶层键，缺的子键由 loader 与 defaults 深合并补齐
 * （正是 ADR-005 的「用户能直接拷改过的配置」语义）。
 */
const CONFIGS = {
  '全关': {},
  '评论开 Twikoo': {
    comments: { use: ['Twikoo'], card_post_count: true, count: true },
    newest_comments: { enable: true },
    twikoo: { envId: 'p5-test-env-id', region: 'ap-shanghai' },
  },
  '搜索+统计+聊天全开': {
    local_search: { enable: true },
    algolia_search: { enable: true, tags: ['前端', 'Astro'] },
    docsearch: { enable: true, appId: 'p5-app-id', apiKey: 'p5-api-key', indexName: 'p5-index' },
    baidu_analytics: 'p5-baidu',
    google_analytics: 'G-P5TEST',
    cnzz_analytics: 'p5-cnzz',
    cloudflare_analytics: 'p5-cf-token',
    microsoft_clarity: 'p5-clarity',
    google_adsense: { enable: true, auto_ads: true, client: 'ca-pub-p5' },
    site_verification: [{ name: 'google-site-verification', content: 'p5-verify' }],
    pwa: { enable: true },
    chatra: { enable: true, id: 'p5-chatra' },
    tidio: { enable: true, public_key: 'p5-tidio' },
    daovoice: { enable: true, app_id: 'p5-dao' },
    crisp: { enable: true, website_id: 'p5-crisp' },
    bubble: { enable: true },
    fireworks: { enable: true },
    canvas_ribbon: { enable: true },
    canvas_fluttering_ribbon: { enable: true },
    canvas_nest: { enable: true },
    activate_power_mode: { enable: true },
    click_heart: { enable: true },
    ClickShowText: { enable: true, text: ['A', 'B'] },
    subtitle: { enable: true, source: 1 },
    footer: {
      footerBar: { subTitle: { enable: true, source: 3 } },
      runtime: { enable: true },
    },
    pangu: { enable: true },
    aplayerInject: { enable: true },
    sharejs: { enable: true },
    addtoany: { enable: true },
    mathjax: { enable: true, per_page: true },
    katex: { enable: true, per_page: true },
    mermaid: { enable: true },
    post_head_ai_description: { enable: true, switchBtn: true },
  },
  '双系统 Twikoo+Waline': {
    comments: { use: ['Twikoo', 'Waline'], lazyload: false, count: true },
    twikoo: { envId: 'p5-dual-env' },
    waline: { serverURL: 'https://waline.p5.test' },
  },
}

const tmpDir = mkdtempSync(join(tmpdir(), 'p5-third-party-'))
const themes = {}
try {
  const baseOff = parseYaml(OFF_BASE)
  for (const [name, override] of Object.entries(CONFIGS)) {
    // 顶层浅覆盖：被覆盖的区块只写改动项，loader 会与 defaults 深合并补齐其余子键。
    const yaml = stringifyYaml({ ...baseOff, ...override })
    const configPath = join(tmpDir, `${name.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}_anzhiyu.config.yml`)
    writeFileSync(configPath, yaml, 'utf8')
    themes[name] = loadThemeConfig({ configPath })
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}

const off = themes['全关']
const twikoo = themes['评论开 Twikoo']
const allOn = themes['搜索+统计+聊天全开']
const dual = themes['双系统 Twikoo+Waline']

/* ------------------------------------------------------------------ */
/* 用例 1：全关 —— 每个渲染函数都必须 0 节点                            */
/* ------------------------------------------------------------------ */

console.log('\n[1] 全关配置：全部渲染函数 0 节点')
const renderers = allRenderers()
for (const [name, fn] of renderers) {
  let html = ''
  let error = null
  try {
    html = fn(off, {})
  } catch (e) {
    error = e
  }
  check(`关闭：${name}`, error === null && html.trim() === '', error ? error.message : `实际 ${html.length} 字符`)
}
check('渲染函数总数 = 46', renderers.length === 46, `实际 ${renderers.length}`)

/* ------------------------------------------------------------------ */
/* 用例 2：评论开 Twikoo                                               */
/* ------------------------------------------------------------------ */

console.log('\n[2] 评论开 Twikoo：DOM 锚点 / 后端门控')
checkOn(
  'comments.index 产出 #post-comment / #twikoo-wrap / .comment-barrage / #comment-tips',
  comments.renderCommentsIndex(twikoo, {}),
  ['id="post-comment"', 'id="twikoo-wrap"', 'class="comment-barrage"', 'id="comment-tips"'],
)
checkOn(
  'comments.js 产出 twikoo.init / #twikoo / envId',
  comments.renderCommentsJs(twikoo),
  ['twikoo.init', "'#twikoo-wrap'", 'p5-test-env-id', "'#twikoo "],
)
check('Twikoo 后端开启', comments.renderTwikoo(twikoo).length > 0)
for (const name of ['Valine', 'Waline', 'Artalk', 'Giscus']) {
  checkOff(`关闭的后端：comments.${name}`, comments.commentsRenderers[name](twikoo))
}
checkOn(
  'card-post-count.index 产出 .twikoo-count / envId',
  cardPostCount.renderCardPostCountIndex(twikoo),
  ['.twikoo-count', 'p5-test-env-id'],
)
for (const name of ['Valine', 'Waline', 'Artalk']) {
  checkOff(`关闭的计数后端：card-post-count.${name}`, cardPostCount.cardPostCountRenderers[name](twikoo))
}
checkOn(
  'newest-comments.common 产出 window.newestComments / #card-newest-comments',
  newestComments.renderNewestCommentsCommon(twikoo),
  ['window.newestComments', '#card-newest-comments .aside-list'],
)
checkOn(
  'newest-comments.index 产出 twikoo-newest-comments',
  newestComments.renderNewestCommentsIndex(twikoo, { pageType: 'page' }),
  ['twikoo-newest-comments', 'getRecentComments'],
)
// 未开启的组件仍必须 0 节点
for (const [path, expected] of [
  ['misc.analytics', misc.renderAnalytics(twikoo)],
  ['misc.site-verification', misc.renderSiteVerification(twikoo)],
  ['misc.google-adsense', misc.renderGoogleAdsense(twikoo)],
  ['misc.pwa', misc.renderPwa(twikoo)],
  ['misc.subtitle', misc.renderSubtitle(twikoo)],
  ['misc.footerBarSubtitle', misc.renderFooterBarSubtitle(twikoo)],
  ['misc.pangu', misc.renderPangu(twikoo)],
  ['misc.runtime', misc.renderRuntime(twikoo)],
  ['misc.effect', misc.renderEffect(twikoo)],
  ['misc.aplayer', misc.renderAplayer(twikoo)],
  ['misc.prismjs', misc.renderPrismjs(twikoo, { siteConfig: { prismjs: { enable: false } } })],
  ['misc.ai-info', misc.renderAiInfo(twikoo, { ai: true, pageFillDescription: 'x' })],
  ['search.index', search.renderSearchIndex(twikoo)],
  ['chat.index', chat.renderChatIndex(twikoo)],
  ['math.index', math.renderMathIndex(twikoo, {})],
  ['share.index', share.renderShareIndex(twikoo, {})],
]) {
  checkOff(`Twikoo 配置下仍关闭：${path}`, expected)
}

/* ------------------------------------------------------------------ */
/* 用例 3：搜索 + 统计 + 聊天全开                                       */
/* ------------------------------------------------------------------ */

console.log('\n[3] 搜索+统计+聊天全开：弹层 DOM / data-pjax / 各分支')
checkOn(
  'search.local-search 产出 #local-search / #local-search-input / #search-mask',
  search.renderLocalSearch(allOn),
  ['id="local-search"', 'id="local-search-input"', 'id="local-search-results"', 'id="search-mask"'],
)
checkOn(
  'search.algolia 产出 #algolia-search / #algolia-hits / .tag-list',
  search.renderAlgolia(allOn),
  ['id="algolia-search"', 'id="algolia-hits"', 'class="tag-list"', '/tags/前端'],
)
checkOn(
  'search.docsearch 产出 #docsearch / appId / indexName',
  search.renderDocsearch(allOn),
  ['id="docsearch"', 'p5-app-id', 'p5-index', 'class="docsearch-wrap"'],
)
checkOn(
  'search.index 三选一：algolia 优先（且不含 #local-search）',
  search.renderSearchIndex(allOn),
  ['id="algolia-search"'],
)
check('search.index 不重复输出 local-search', !search.renderSearchIndex(allOn).includes('id="local-search"'))

checkOn(
  'analytics 五个分支 + data-pjax 脚本',
  misc.renderAnalytics(allOn),
  ['hm.baidu.com/hm.js?p5-baidu', 'googletagmanager.com/gtag/js?id=G-P5TEST', 's4.cnzz.com', 'data-pjax', 'clarity.ms/tag/', 'beacon.min.js'],
)
checkOn(
  'site-verification 产出 meta',
  misc.renderSiteVerification(allOn),
  ['google-site-verification', 'p5-verify'],
)
checkOn(
  'google-adsense 产出 adsbygoogle / client',
  misc.renderGoogleAdsense(allOn),
  ['adsbygoogle', 'ca-pub-p5'],
)
checkOn(
  'pwa 产出 manifest link / theme-color / startup-image',
  misc.renderPwa(allOn),
  ['rel="manifest"', 'msapplication-TileColor', 'apple-touch-startup-image', 'apple-touch-icon'],
)
checkOn('chat.chatra 开启', chat.renderChatra(allOn), ['ChatraID', 'p5-chatra'])
checkOn('chat.tidio 开启', chat.renderTidio(allOn), ['code.tidio.co/p5-tidio.js'])
checkOn('chat.daovoice 开启', chat.renderDaovoice(allOn), ['p5-dao', 'daovoice'])
checkOn('chat.crisp 开启', chat.renderCrisp(allOn), ['CRISP_WEBSITE_ID', 'p5-crisp'])
checkOn(
  'chat.index 按优先级只出 chatra',
  chat.renderChatIndex(allOn),
  ['ChatraID'],
)
check('chat.index 不含 crisp', !chat.renderChatIndex(allOn).includes('CRISP_WEBSITE_ID'))
checkOn('effect 产出 bubble 的 data-pjax 脚本', misc.renderEffect(allOn), ['data-pjax', 'bubble.js'])
checkOn('effect 产出 canvas.fireworks / #ribbon / #canvas_nest', misc.renderEffect(allOn), ['class="fireworks"', 'id="ribbon"', 'id="canvas_nest"', 'id="click-heart"', 'id="click-show-text"'])
checkOn('subtitle 产出 #subtitle 打字脚本', misc.renderSubtitle(allOn, { siteSubtitle: '站点副标题' }), ["'#subtitle'", 'Typed', 'hitokoto'])
checkOn('footerBarSubtitle 产出 #footer-type-tips', misc.renderFooterBarSubtitle(allOn, {}), ["'#footer-type-tips'", 'jinrishici'])
checkOn('pangu 产出 panguFn / panguInit', misc.renderPangu(allOn), ['panguFn', 'panguInit', 'autoSpacingPage'])
checkOn('runtime 产出 #runtime 计时脚本', misc.renderRuntime(allOn), ["id='runtime'", 'launch_time' in allOn.footer.runtime ? allOn.footer.runtime.launch_time : '04/01/2021 00:00:00'])
checkOn('aplayer 产出 aplayer/meting 资源', misc.renderAplayer(allOn), ['aplayer', 'meting'])
checkOn(
  'prismjs 由站点 config 门控并产出 line-numbers',
  misc.renderPrismjs(allOn, { siteConfig: { prismjs: { enable: true, line_number: true } } }),
  ['prism', 'line-numbers'],
)
checkOff('prismjs 关闭时 0 节点', misc.renderPrismjs(allOn, { siteConfig: { prismjs: { enable: false } } }))
checkOn('math.index 产出 MathJax / katex / mermaid', math.renderMathIndex(allOn, {}), ['MathJax-script', 'katex-wrap', 'mermaid-wrap'])
checkOn('share.index 产出 .post_share / .social-share', share.renderShareIndex(allOn, { cover: '/cover.png' }), ['class="post_share"', 'class="social-share"', '/cover.png'])
check('share.index 不与 addtoany 同时输出', share.renderAddtoany(allOn) === '')
checkOn(
  'ai-info 产出 .post-ai-description / #ai-Toggle / data-pjax',
  misc.renderAiInfo(allOn, { ai: true, pageFillDescription: '正文摘要' }),
  ['class="post-ai-description"', 'id="ai-Toggle"', 'data-pjax', 'id="ai-tag"', 'AnZhiYu GPT'],
)
checkOff('ai-info：page.ai 未开时 0 节点', misc.renderAiInfo(allOn, { pageFillDescription: '正文摘要' }))

/* ------------------------------------------------------------------ */
/* 用例 4：双系统（use 为数组）                                         */
/* ------------------------------------------------------------------ */

console.log('\n[4] 双系统 use: [Twikoo, Waline]：switch + 两套 wrap/js')
checkOn(
  'comments.index 产出 .comment-switch / 两个 wrap',
  comments.renderCommentsIndex(dual, {}),
  ['class="comment-switch"', 'id="switch-btn"', 'id="twikoo-wrap"', 'id="waline-wrap"', 'second-comment'],
)
checkOn(
  'comments.js 同时产出 Twikoo 与 Waline 初始化',
  comments.renderCommentsJs(dual),
  ['twikoo.init', 'initWaline', 'p5-dual-env', 'https://waline.p5.test'],
)
check('comments.js 未输出 Valine', !comments.renderCommentsJs(dual).includes('new Valine('))

/* ------------------------------------------------------------------ */
/* 用例 5：组件边界静态检查                                             */
/* ------------------------------------------------------------------ */

console.log('\n[5] 组件边界：.astro 清单 / 只读 getThemeConfig() / 不碰 astro:content')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.astro')) out.push(full)
  }
  return out
}

const astroFiles = walk(THIRD_PARTY_DIR)
check('.astro 组件数量 = 45', astroFiles.length === 45, `实际 ${astroFiles.length}`)

let boundaryOk = true
const boundaryBad = []
for (const file of astroFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(THIRD_PARTY_DIR, file).replace(/\\/g, '/')
  if (!src.includes('getThemeConfig')) {
    boundaryOk = false
    boundaryBad.push(`${rel}: 缺 getThemeConfig`)
  }
  if (/astro:content|getCollection|import\.meta\.env/.test(src)) {
    boundaryOk = false
    boundaryBad.push(`${rel}: 触碰了禁止的数据源`)
  }
  if (!src.includes('set:html')) {
    boundaryOk = false
    boundaryBad.push(`${rel}: 缺 Fragment set:html 出口`)
  }
  if (!/上游 `layout\//.test(src) && !/上游 `.*\.pug/.test(src)) {
    boundaryOk = false
    boundaryBad.push(`${rel}: 缺上游文件:行号注释`)
  }
}
check('全部组件通过边界检查', boundaryOk, boundaryBad.join('; '))

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

console.log('\n────────────────────────────────────────────')
console.log(`通过 ${passed} 条，失败 ${failed} 条`)
if (failed) {
  console.log('失败明细：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('P5-1 第三方集成组件门控与 DOM 验证通过 ✓')
