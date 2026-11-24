/**
 * render.mjs（third-party 顶层）— 上游 head/*.pug + third-party/*.pug + anzhiyu/ai-info.pug
 * 的渲染函数（P5-1）。每个函数对应一个 .astro，关闭时统一返回 ''（0 节点）。
 *
 * 映射表（上游文件:行号 → 函数）：
 *   head/analytics.pug:1-31              → renderAnalytics
 *   head/site_verification.pug:1-3       → renderSiteVerification
 *   head/google_adsense.pug:1-9          → renderGoogleAdsense
 *   head/pwa.pug:1-59                    → renderPwa
 *   third-party/subtitle.pug:1-129       → renderSubtitle
 *   third-party/footerBarSubtitle.pug    → renderFooterBarSubtitle
 *   third-party/pangu.pug:1-21           → renderPangu
 *   third-party/runtime/runtime-js.pug   → renderRuntime
 *   third-party/effect.pug:1-35
 *     + additional-js.pug:91-92(bubble)  → renderEffect
 *   third-party/aplayer.pug:1-3          → renderAplayer
 *   third-party/prismjs.pug:1-6          → renderPrismjs
 *   anzhiyu/ai-info.pug:1-27             → renderAiInfo
 */
import {
  asset,
  attrs,
  esc,
  flag,
  inlineScript,
  jsval,
  obj,
  pageOf,
  srcScript,
  styleLink,
} from './_kit.mjs'

/* ------------------------------------------------------------------ */
/* 统计 / 验证 / 广告 / PWA（head.pug:49-78）                            */
/* ------------------------------------------------------------------ */

/**
 * head/analytics.pug:1-31 —— 5 个分支，各自以顶层 key 的 truthy 值为门控。
 * cnzz / cloudflare 分支带 `data-pjax` 属性（验收断言锚点之一）。
 */
export function renderAnalytics(theme) {
  const out = []
  const baidu = theme.baidu_analytics
  const google = theme.google_analytics
  const cnzz = theme.cnzz_analytics
  const cloudflare = theme.cloudflare_analytics
  const clarity = theme.microsoft_clarity

  if (baidu) {
    out.push(
      inlineScript(`var _hmt = _hmt || [];
    (function() {
      var hm = document.createElement("script");
      hm.src = "https://hm.baidu.com/hm.js?${esc(baidu)}";
      var s = document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(hm, s);
    })();`),
    )
  }
  if (google) {
    out.push(
      srcScript(`https://www.googletagmanager.com/gtag/js?id=${esc(google)}`, { async: true }),
      inlineScript(`window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${esc(google)}');`),
    )
  }
  if (cnzz) {
    out.push(
      srcScript(`https://s4.cnzz.com/z_stat.php?id=${esc(cnzz)}&web_id=${esc(cnzz)}`, {
        async: true,
        'data-pjax': true,
      }),
    )
  }
  if (cloudflare) {
    out.push(
      `<script${attrs({ defer: true, 'data-pjax': true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': `{"token": "${cloudflare}"}` })}></script>`,
    )
  }
  if (clarity) {
    out.push(
      inlineScript(`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${esc(clarity)}");`),
    )
  }
  return out.join('')
}

/** head/site_verification.pug:1-3 —— 数组里的 name/content 逐条输出 meta。 */
export function renderSiteVerification(theme) {
  const list = Array.isArray(theme.site_verification) ? theme.site_verification : []
  return list
    .filter((item) => typeof item?.name === 'string' && typeof item?.content === 'string')
    .map((item) => `<meta${attrs({ name: item.name, content: item.content })}>`)
    .join('')
}

/** head/google_adsense.pug:1-9 —— enable + auto_ads 二级门控。 */
export function renderGoogleAdsense(theme) {
  if (!flag(theme.google_adsense, 'enable')) return ''
  const ad = obj(theme.google_adsense)
  let out = srcScript(ad.js ?? '', { async: true })
  if (ad.auto_ads) {
    out += inlineScript(`(adsbygoogle = window.adsbygoogle || []).push({
        google_ad_client: '${esc(ad.client)}',
        enable_page_level_ads: '${esc(ad.enable_page_level_ads)}'
      });`)
  }
  return out
}

/** head/pwa.pug:17-47 的 15 组启动图（portrait + landscape）。 */
const SPLASH_SIZES = [
  [1024, 1366, 2],
  [834, 1194, 2],
  [768, 1024, 2],
  [834, 1112, 2],
  [810, 1080, 2],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
  [320, 568, 2],
]

/**
 * head/pwa.pug:1-59 —— 门控 `theme.pwa.enable`（上游 head.pug:52-53）。
 * manifest link / theme-color(meta) / 各 icon link / startup-image 30 条。
 */
export function renderPwa(theme) {
  if (!flag(theme.pwa, 'enable')) return ''
  const p = obj(theme.pwa)
  const root = '/'
  const url = (v) => (v ? `${root}${String(v).replace(/^\/+/, '')}` : '')
  const out = []
  out.push(`<link${attrs({ rel: 'manifest', href: url(p.manifest) })}>`)
  if (p.theme_color) out.push(`<meta${attrs({ name: 'msapplication-TileColor', content: p.theme_color })}>`)
  if (p.mask_icon) out.push(`<link${attrs({ rel: 'mask-icon', href: url(p.mask_icon), color: '#5bbad5' })}>`)
  if (p.apple_touch_icon) {
    out.push(`<link${attrs({ rel: 'apple-touch-icon', sizes: '180x180', href: url(p.apple_touch_icon) })}>`)
    out.push(`<link${attrs({ rel: 'apple-touch-icon-precomposed', sizes: '180x180', href: url(p.apple_touch_icon) })}>`)
  }
  if (p.favicon_32_32) out.push(`<link${attrs({ rel: 'icon', type: 'image/png', sizes: '32x32', href: url(p.favicon_32_32) })}>`)
  if (p.favicon_16_16) out.push(`<link${attrs({ rel: 'icon', type: 'image/png', sizes: '16x16', href: url(p.favicon_16_16) })}>`)
  if (p.bookmark_icon) out.push(`<link${attrs({ rel: 'bookmark', href: url(p.bookmark_icon) })}>`)
  if (p.startup_image_enable) {
    for (const [w, h, r] of SPLASH_SIZES) {
      for (const orientation of ['portrait', 'landscape']) {
        const pw = orientation === 'portrait' ? w : h
        const ph = orientation === 'portrait' ? h : w
        const href = `/img/siteicon/apple-splash-${pw * r}-${ph * r}.jpg`
        const media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${orientation})`
        out.push(`<link${attrs({ rel: 'apple-touch-startup-image', href, media })}>`)
      }
    }
  }
  return out.join('')
}

/* ------------------------------------------------------------------ */
/* 打字机字幕（subtitle.pug / footerBarSubtitle.pug 共用）                */
/* ------------------------------------------------------------------ */

/**
 * 生成 subtitle.pug:4-129 / footerBarSubtitle.pug:4-129 的 case source 脚本。
 * selector: '#subtitle' 或 '#footer-type-tips'。
 */
function typewriterScript(theme, cfg, selector, siteSubtitle) {
  const effect = Boolean(cfg.effect)
  const loop = Boolean(cfg.loop)
  const startDelay = Number(cfg.startDelay ?? 0)
  const typeSpeed = Number(cfg.typeSpeed ?? 0)
  const backSpeed = Number(cfg.backSpeed ?? 0)
  const source = Number(cfg.source ?? 0)
  const sub = Array.isArray(cfg.sub) ? cfg.sub : []
  const selId = selector.replace(/^#/, '')
  // 上游 subtitle.pug:19 / footerBarSubtitle.pug:19 等 source 分支用单引号字面量
  // `new Typed('#subtitle', …)`；这里保持同一引号风格（jsval 会输出双引号）。
  const selQuoted = `'${String(selector).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const typedOptions = `{
                strings: sub,
                startDelay: ${startDelay},
                typeSpeed: ${typeSpeed},
                loop: ${loop},
                backSpeed: ${backSpeed},
              }`
  const subJson = jsval(sub)
  const defaultSubJson = jsval(sub.length ? sub : [siteSubtitle])

  let body
  if (source === 1) {
    body = `function subtitleType () {
        fetch('https://v1.hitokoto.cn')
          .then(response => response.json())
          .then(data => {
            if (${effect}) {
              const from = '出自 ' + data.from
              const sub = ${subJson}
              sub.unshift(data.hitokoto, from)
              window.typed = new Typed(${selQuoted}, ${typedOptions})
            } else {
              document.getElementById('${selId}').innerHTML = data.hitokoto
            }
          })
      }`
  } else if (source === 2) {
    body = `function subtitleType () {
        getScript('https://yijuzhan.com/api/word.php?m=js').then(() => {
          const con = str[0]
          if (${effect}) {
            const from = '出自 ' + str[1]
            const sub = ${subJson}
            sub.unshift(con, from)
            window.typed = new Typed(${selQuoted}, ${typedOptions})
          } else {
            document.getElementById('${selId}').innerHTML = con
          }
        })
      }`
  } else if (source === 3) {
    body = `function subtitleType () {
        getScript('https://sdk.jinrishici.com/v2/browser/jinrishici.js').then(() => {
          jinrishici.load(result =>{
            if (${effect}) {
              const sub = ${subJson}
              const content = result.data.content
              sub.unshift(content)
              window.typed = new Typed(${selQuoted}, ${typedOptions})
            } else {
              document.getElementById('${selId}').innerHTML = result.data.content
            }
          })
        })
      }`
  } else {
    body = `function subtitleType () {
        if (${effect}) {
          window.typed = new Typed(${jsval(selector)}, {
            strings: ${defaultSubJson},
            startDelay: ${startDelay},
            typeSpeed: ${typeSpeed},
            loop: ${loop},
            backSpeed: ${backSpeed}
          })
        } else {
          document.getElementById('${selId}').innerHTML = '${esc((sub.length ? sub : [siteSubtitle])[0])}'
        }
      }`
  }

  const tail = `

      if (${effect}) {
        if (typeof Typed === 'function') {
          subtitleType()
        } else {
          getScript('${asset(theme, 'typed')}').then(subtitleType)
        }
      } else {
        subtitleType()
      }`
  return inlineScript(body + tail)
}

/** third-party/subtitle.pug:1-129 —— 门控 theme.subtitle.enable（header/index.pug:48-51）。 */
export function renderSubtitle(theme, props = {}) {
  if (!flag(theme.subtitle, 'enable')) return ''
  const page = pageOf(props)
  return typewriterScript(theme, obj(theme.subtitle), '#subtitle', String(page.siteSubtitle ?? ''))
}

/** third-party/footerBarSubtitle.pug:1-129 —— 门控 footer.footerBar.subTitle.enable（footer.pug:82）。 */
export function renderFooterBarSubtitle(theme, props = {}) {
  const footerBar = obj(obj(theme.footer).footerBar)
  if (!flag(footerBar.subTitle, 'enable')) return ''
  const page = pageOf(props)
  return typewriterScript(theme, obj(footerBar.subTitle), '#footer-type-tips', String(page.siteSubtitle ?? ''))
}

/* ------------------------------------------------------------------ */
/* 其它脚本类组件（additional-js.pug 的挂载点）                          */
/* ------------------------------------------------------------------ */

/** third-party/pangu.pug:1-21 —— 门控 theme.pangu.enable；field='post' 时按 isPost。 */
export function renderPangu(theme) {
  if (!flag(theme.pangu, 'enable')) return ''
  const isPostField = obj(theme.pangu).field === 'post'
  const body = `function panguFn () {
    if (typeof pangu === 'object') pangu.autoSpacingPage()
    else {
      getScript('${asset(theme, 'pangu')}')
        .then(() => {
          pangu.autoSpacingPage()
        })
    }
  }

  function panguInit () {
    if (${isPostField}){
      GLOBAL_CONFIG_SITE.isPost && panguFn()
    } else {
      panguFn()
    }
  }

  document.addEventListener('DOMContentLoaded', panguInit)`
  return inlineScript(body)
}

/** third-party/runtime/runtime-js.pug:1-67 —— 门控 footer.runtime.enable。 */
export function renderRuntime(theme) {
  const runtime = obj(obj(theme.footer).runtime)
  if (!flag(runtime, 'enable')) return ''
  const launchTime = esc(runtime.launch_time ?? '')
  const offdutyImg = esc(runtime.offduty_img ?? '')
  const offdutyDesc = esc(runtime.offduty_description ?? '')
  const body = `(function () {
    var grt = new Date("${launchTime}");
    var now = new Date();
    var dnum;
    var hnum;
    var mnum;
    var snum;
    var nowHour;

    function updateTime() {
      now = new Date();
      nowHour = now.getHours();
      var days = (now - grt) / 1000 / 60 / 60 / 24;
      dnum = Math.floor(days);
      var hours = (now - grt) / 1000 / 60 / 60 - 24 * dnum;
      hnum = Math.floor(hours);
      if (String(hnum).length == 1) { hnum = "0" + hnum; }
      var minutes = (now - grt) / 1000 / 60 - 24 * 60 * dnum - 60 * hnum;
      mnum = Math.floor(minutes);
      if (String(mnum).length == 1) { mnum = "0" + mnum; }
      var seconds = (now - grt) / 1000 - 24 * 60 * 60 * dnum - 60 * 60 * hnum - 60 * mnum;
      snum = Math.round(seconds);
      if (String(snum).length == 1) { snum = "0" + snum; }
    }

    function updateHtml() {
      const footer = document.getElementById("footer");
      if (!footer) return
      let currentTimeHtml = "";
      if (nowHour < 18 && nowHour >= 9) {
        currentTimeHtml = \`本站居然运行了 \${dnum} 天<span id='runtime'> \${hnum} 小时 \${mnum} 分 \${snum} 秒 </span><i class='anzhiyufont anzhiyu-icon-heartbeat' style='color:red'></i>\`;
      } else {
        let img = document.querySelector("#workboard .workSituationImg");
        if (img != null) {
          img.src = "${offdutyImg}";
          img.title = "${offdutyDesc}";
          img.alt = "${offdutyDesc}";
        }
        currentTimeHtml = \`本站居然运行了 \${dnum} 天<span id='runtime'> \${hnum} 小时 \${mnum} 分 \${snum} 秒 </span><i class='anzhiyufont anzhiyu-icon-heartbeat' style='color:red'></i>\`;
      }

      if (document.getElementById("runtimeTextTip")) {
        document.getElementById("runtimeTextTip").innerHTML = currentTimeHtml;
      }
    }

    setInterval(() => {
      updateTime();
      updateHtml();
    }, 1000);
  })();`
  return inlineScript(body, { async: true })
}

/**
 * third-party/effect.pug:1-35 + additional-js.pug:91-92（bubble）。
 * 各子项独立门控；bubble 分支带 `data-pjax`（验收断言锚点之一）。
 */
export function renderEffect(theme) {
  const out = []
  if (flag(theme.fireworks, 'enable')) {
    out.push(`<canvas${attrs({ class: 'fireworks', mobile: String(Boolean(obj(theme.fireworks).mobile)) })}></canvas>`)
    out.push(srcScript(asset(theme, 'fireworks')))
  }
  if (flag(theme.canvas_ribbon, 'enable')) {
    const c = obj(theme.canvas_ribbon)
    out.push(
      `<script${attrs({ defer: true, id: 'ribbon', src: asset(theme, 'canvas_ribbon'), size: c.size, alpha: c.alpha, zIndex: c.zIndex, mobile: String(Boolean(c.mobile)), 'data-click': String(Boolean(c.click_to_change)) })}></script>`,
    )
  }
  if (flag(theme.canvas_fluttering_ribbon, 'enable')) {
    out.push(
      `<script${attrs({ defer: true, id: 'fluttering_ribbon', mobile: String(Boolean(obj(theme.canvas_fluttering_ribbon).mobile)), src: asset(theme, 'canvas_fluttering_ribbon') })}></script>`,
    )
  }
  if (flag(theme.canvas_nest, 'enable')) {
    const c = obj(theme.canvas_nest)
    out.push(
      `<script${attrs({ id: 'canvas_nest', defer: true, color: c.color, opacity: c.opacity, zIndex: c.zIndex, count: c.count, mobile: String(Boolean(c.mobile)), src: asset(theme, 'canvas_nest') })}></script>`,
    )
  }
  if (flag(theme.activate_power_mode, 'enable')) {
    const c = obj(theme.activate_power_mode)
    out.push(srcScript(asset(theme, 'activate_power_mode')))
    out.push(inlineScript(`POWERMODE.colorful = ${Boolean(c.colorful)};
    POWERMODE.shake = ${Boolean(c.shake)};
    POWERMODE.mobile = ${Boolean(c.mobile)};
    document.body.addEventListener('input', POWERMODE);`))
  }
  if (flag(theme.click_heart, 'enable')) {
    out.push(
      `<script${attrs({ id: 'click-heart', src: asset(theme, 'click_heart'), async: true, mobile: String(Boolean(obj(theme.click_heart).mobile)) })}></script>`,
    )
  }
  if (flag(theme.ClickShowText, 'enable')) {
    const c = obj(theme.ClickShowText)
    const text = Array.isArray(c.text) ? c.text.join(',') : ''
    out.push(
      `<script${attrs({ id: 'click-show-text', src: asset(theme, 'ClickShowText'), 'data-mobile': String(Boolean(c.mobile)), 'data-text': text, 'data-fontsize': c.fontSize, 'data-random': String(Boolean(c.random)), async: true })}></script>`,
    )
  }
  // 上游 additional-js.pug:91-92：气泡效果的 data-pjax 脚本
  if (flag(theme.bubble, 'enable')) {
    out.push(
      srcScript('https://npm.elemecdn.com/anzhiyu-theme-static@1.0.1/bubble/bubble.js', {
        async: true,
        'data-pjax': true,
      }),
    )
  }
  return out.join('')
}

/**
 * third-party/aplayer.pug:1-3 —— 门控 aplayerInject.enable +
 * (pjax.enable || per_page || page.aplayer)，与 additional-js.pug:117-121 一致。
 */
export function renderAplayer(theme, props = {}) {
  if (!flag(theme.aplayerInject, 'enable')) return ''
  const page = pageOf(props)
  const enabled = Boolean(theme.pjax?.enable) || flag(theme.aplayerInject, 'per_page') || page.aplayer === true
  if (!enabled) return ''
  return (
    styleLink(asset(theme, 'aplayer_css'), { media: 'print', onload: "this.media='all'" }) +
    srcScript(asset(theme, 'aplayer_js')) +
    srcScript(asset(theme, 'meting_js'))
  )
}

/**
 * third-party/prismjs.pug:1-6 —— 上游门控是**站点 config.prismjs**，
 * 不在主题 133 个顶层键里（schema strict 不接受新键），因此由 page props 注入：
 * `page.siteConfig.prismjs = { enable, preprocess, line_number }`。
 */
export function renderPrismjs(theme, props = {}) {
  const page = pageOf(props)
  const prism = obj(obj(page.siteConfig).prismjs)
  if (prism.enable !== true || prism.preprocess === true) return ''
  let out = srcScript(asset(theme, 'prismjs_js')) + srcScript(asset(theme, 'prismjs_autoloader'))
  if (prism.line_number) out += srcScript(asset(theme, 'prismjs_lineNumber_js'))
  return out
}

/**
 * anzhiyu/ai-info.pug:1-27 —— 门控 theme.post_head_ai_description.enable
 * + pageFillDescription + page.ai（上游 get_page_fill_description()）。
 * 读 gptName / mode / switchBtn；脚本带 data-pjax。
 */
export function renderAiInfo(theme, props = {}) {
  const cfg = obj(theme.post_head_ai_description)
  if (!flag(cfg, 'enable')) return ''
  const page = pageOf(props)
  const fill = page.pageFillDescription || page.description || page.content || ''
  if (!fill || page.ai !== true) return ''
  const gptName = String(cfg.gptName ?? '')
  const tag = cfg.mode === 'tianli' ? 'Tianli GPT' : `${gptName} GPT`
  const toggle = cfg.switchBtn ? '<div id="ai-Toggle">切换</div>' : ''
  return (
    '<div class="post-ai-description">' +
    '<div class="ai-title">' +
    '<i class="anzhiyufont anzhiyu-icon-bilibili"></i>' +
    '<div class="ai-title-text">AI-摘要</div>' +
    toggle +
    '<i class="anzhiyufont anzhiyu-icon-arrow-rotate-right"></i>' +
    '<i class="anzhiyufont anzhiyu-icon-circle-dot" title="朗读摘要"></i>' +
    `<div id="ai-tag">${esc(tag)}</div>` +
    '</div>' +
    '<div class="ai-explanation">AI初始化中...</div>' +
    '<div class="ai-btn-box">' +
    '<div class="ai-btn-item">介绍自己 🙈</div>' +
    '<div class="ai-btn-item">生成本文简介 👋</div>' +
    '<div class="ai-btn-item">推荐相关文章 📖</div>' +
    '<div class="ai-btn-item">前往主页 🏠</div>' +
    '<div class="ai-btn-item" id="go-tianli-blog">前往爱发电购买</div>' +
    '</div>' +
    `<script${attrs({ 'data-pjax': true, src: asset(theme, 'ai_abstract_js') })}></script>` +
    '</div>'
  )
}

export const miscRenderers = {
  analytics: renderAnalytics,
  'site-verification': renderSiteVerification,
  'google-adsense': renderGoogleAdsense,
  pwa: renderPwa,
  subtitle: renderSubtitle,
  footerBarSubtitle: renderFooterBarSubtitle,
  pangu: renderPangu,
  runtime: renderRuntime,
  effect: renderEffect,
  aplayer: renderAplayer,
  prismjs: renderPrismjs,
  'ai-info': renderAiInfo,
}
