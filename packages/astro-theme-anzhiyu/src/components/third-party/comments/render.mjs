/**
 * comments/render.mjs — 上游 `layout/includes/third-party/comments/*.pug` 的渲染函数（P5-1）。
 *
 * 映射：
 *   renderCommentsIndex ← index.pug:1-37   （#post-comment 结构 / 双系统 switch）
 *   renderCommentsJs    ← js.pug:1-12      （按 use 分发 5 个后端脚本）
 *   renderValine        ← valine.pug:1-37
 *   renderWaline        ← waline.pug:1-45
 *   renderTwikoo        ← twikoo.pug:1-50
 *   renderArtalk        ← artalk.pug:1-72
 *   renderGiscus        ← giscus.pug:1-53
 *
 * 门控：`theme.comments.use`（null / 逗号字符串 / 数组，见 _kit.commentSystems）。
 * 子后端自身也带门控（use 不含该名字 → 返回 ''），所以单独挂 <Twikoo/> 也不会误出节点。
 * 上游 `theme.asset.*` 走 _kit.asset()；`#{}` / `!{}` 插值统一用 jsval() 保证 JS 字符串安全。
 */
import {
  asset,
  commentSystems,
  esc,
  flag,
  inlineScript,
  jsval,
  obj,
  pageOf,
  str,
  systemEnabled,
} from '../_kit.mjs'

/** 每个后端挂载的容器 id（index.pug:26-35 / 各 js 里的 el）。 */
const WRAP_ID = {
  Valine: 'vcomment',
  Twikoo: 'twikoo-wrap',
  Waline: 'waline-wrap',
  Artalk: 'artalk-wrap',
  Giscus: 'giscus-wrap',
}

/**
 * 上游 comments/index.pug:1-37。
 * 关键节点：hr / #post-comment / .comment-head / .comment-switch / #twikoo-wrap / .comment-barrage。
 */
export function renderCommentsIndex(theme, props = {}) {
  const systems = commentSystems(theme)
  if (systems.length === 0) return ''
  const page = pageOf(props)
  const defaultSystem = systems[0]
  const multi = systems.length > 1
  const visitorMail = flag(theme.visitorMail, 'enable')
  const root = str(page, 'root', '/')

  const switchHtml = multi
    ? `<div class="comment-switch"><span class="first-comment">${esc(defaultSystem)}</span><span id="switch-btn"></span><span class="second-comment">${esc(systems[1])}</span></div>`
    : ''
  const tipsHtml =
    defaultSystem === 'Twikoo'
      ? '<div class="comment-tips" id="comment-tips"><span>✅ 你无需删除空行，直接评论以获取最佳展示效果</span></div>'
      : ''

  const wraps = systems
    .map((name) => {
      const id = WRAP_ID[name]
      if (!id) return '<div></div>'
      const cls = name === 'Valine' ? ' vcomment' : ''
      return `<div><div id="${id}"${cls ? ` class="${cls.trim()}"` : ''}></div></div>`
    })
    .join('')

  return (
    '<hr>' +
    '<div id="post-comment">' +
    '<div class="comment-head">' +
    '<div class="comment-headline"><i class="anzhiyufont anzhiyu-icon-comments"></i><span> 评论</span></div>' +
    `<div class="comment-randomInfo"><a onclick="anzhiyu.addRandomCommentInfo()" href="javascript:void(0)" style="${visitorMail ? '' : 'display: none'}">匿名评论</a>` +
    `<a href="${esc(root.replace(/\/$/, '') + '/privacy')}" style="margin-left: 4px">隐私政策</a></div>` +
    switchHtml +
    tipsHtml +
    '</div>' +
    `<div class="comment-wrap">${wraps}</div>` +
    '</div>' +
    '<div class="comment-barrage"></div>'
  )
}

/* ------------------------------------------------------------------ */
/* 5 个后端脚本（上游 comments/*.pug）                                  */
/* ------------------------------------------------------------------ */

/** valine.pug:1-37 —— el:'#vcomment'、appId/appKey/serverURLs/visitor/option。 */
export function renderValine(theme, props = {}) {
  if (!systemEnabled(theme, 'Valine')) return ''
  const v = obj(theme.valine)
  const comments = obj(theme.comments)
  const systems = commentSystems(theme)
  const lazyload = flag(comments, 'lazyload')
  // 上游 valine.pug:4-6 读 Hexo 的 `site.data.valine`（主题配置里没有）；
  // 组件只接 page props，因此允许调用方通过 page.siteData.valine 注入，缺省 `""`。
  const emojiMaps = obj(pageOf(props).siteData).valine
    ? jsval(pageOf(props).siteData.valine)
    : '""'
  const body = `(() => {
    const initValine = () => {
      const valine = new Valine(Object.assign({
        el: '#vcomment',
        appId: ${jsval(v.appId)},
        appKey: ${jsval(v.appKey)},
        avatar: ${jsval(v.avatar)},
        serverURLs: ${jsval(v.serverURLs)},
        emojiMaps: ${emojiMaps},
        path: window.location.pathname,
        visitor: ${Boolean(v.visitor)}
      }, ${jsval(v.option ?? null)}))
    }

    const loadValine = async () => {
      if (typeof Valine === 'function') initValine()
      else {
        await getScript('${asset(theme, 'valine')}')
        initValine()
      }
    }

    if ('${systems[0]}' === 'Valine' || ${lazyload}) {
      if (${lazyload}) anzhiyu.loadComment(document.getElementById('vcomment'), loadValine)
      else setTimeout(loadValine, 0)
    } else {
      window.loadOtherComment = loadValine
    }
  })()`
  return inlineScript(body)
}

/** waline.pug:1-45 —— el:'#waline-wrap'、serverURL/pageview/comment/imageUploader。 */
export function renderWaline(theme) {
  if (!systemEnabled(theme, 'Waline')) return ''
  const w = obj(theme.waline)
  const comments = obj(theme.comments)
  const systems = commentSystems(theme)
  const lazyload = flag(comments, 'lazyload')
  const count = flag(comments, 'count')
  const body = `(() => {
    let initFn = window.walineFn || null

    const initWaline = (Fn) => {
      const waline = Fn(Object.assign({
        el: '#waline-wrap',
        serverURL: ${jsval(w.serverURL)},
        pageview: ${lazyload ? false : Boolean(w.pageview)},
        dark: 'html[data-theme="dark"]',
        path: window.location.pathname,
        comment: ${lazyload ? false : count},
        imageUploader: ${Boolean(w.imageUploader)},
      }, ${jsval(w.option ?? null)}))

      const destroyWaline = () => {
        waline.destroy()
      }

      anzhiyu.addGlobalFn('pjax', destroyWaline, 'destroyWaline')
    }

    const loadWaline = async () => {
      if (initFn) initWaline(initFn)
      else {
        await getCSS('${asset(theme, 'waline_css')}')
        if (${Boolean(w.meta_css)}) await getCSS('${asset(theme, 'waline_meta_css')}')
        const { init } = await import('${asset(theme, 'waline_js')}')
        initFn = init || Waline.init
        initWaline(initFn)
        window.walineFn = initFn
      }
    }

    if ('${systems[0]}' === 'Waline' || ${lazyload}) {
      if (${lazyload}) anzhiyu.loadComment(document.getElementById('waline-wrap'), loadWaline)
      else setTimeout(loadWaline, 0)
    } else {
      window.loadOtherComment = loadWaline
    }
  })()`
  return inlineScript(body)
}

/** twikoo.pug:1-50 —— el:'#twikoo-wrap'、envId/region、#twikoo-count。 */
export function renderTwikoo(theme) {
  if (!systemEnabled(theme, 'Twikoo')) return ''
  const t = obj(theme.twikoo)
  const comments = obj(theme.comments)
  const systems = commentSystems(theme)
  const lazyload = flag(comments, 'lazyload')
  const count = flag(comments, 'count')
  const body = `(() => {
    const init = () => {
      twikoo.init(Object.assign({
        el: '#twikoo-wrap',
        envId: ${jsval(t.envId)},
        region: ${jsval(t.region)},
        onCommentLoaded: () => {
          anzhiyu.loadLightbox(document.querySelectorAll('#twikoo .tk-content img:not(.tk-owo-emotion)'))
        }
      }, ${jsval(t.option ?? null)}))
    }

    const loadTwikoo = () => {
      if (typeof twikoo === 'object') setTimeout(runFn, 0)
      else getScript('${asset(theme, 'twikoo')}').then(runFn)
    }

    const getCount = () => {
      const countELement = document.getElementById('twikoo-count')
      if (!countELement) return
      twikoo.getCommentsCount({
        envId: ${jsval(t.envId)},
        region: ${jsval(t.region)},
        urls: [window.location.pathname],
        includeReply: false
      }).then(res => {
        countELement.textContent = res[0].count
      }).catch(err => {
        console.error(err)
      })
    }

    const runFn = () => {
      init();
      ${count ? 'GLOBAL_CONFIG_SITE.isPost && getCount()' : ''}
    }

    if ('${systems[0]}' === 'Twikoo' || ${lazyload}) {
      if (${lazyload}) anzhiyu.loadComment(document.getElementById('twikoo-wrap'), loadTwikoo)
      else {
        loadTwikoo()
      }
    } else {
      window.loadOtherComment = loadTwikoo
    }
  })()`
  return inlineScript(body)
}

/** artalk.pug:1-72 —— el:'#artalk-wrap'、server/site、page_comment 计数。 */
export function renderArtalk(theme) {
  if (!systemEnabled(theme, 'Artalk')) return ''
  const a = obj(theme.artalk)
  const comments = obj(theme.comments)
  const systems = commentSystems(theme)
  const lazyload = flag(comments, 'lazyload')
  const count = flag(comments, 'count')
  const body = `(() => {
    const getArtalkDark = () => document.documentElement.getAttribute('data-theme') === 'dark'

    const init = () => {
      window.artalkItem = Artalk.init(Object.assign({
        el: '#artalk-wrap',
        pageKey: window.location.pathname,
        pageTitle: document.title,
        server: ${jsval(a.server)},
        site: ${jsval(a.site)},
        darkMode: getArtalkDark(),
      }, ${jsval(a.option ?? {})}))

      window.artalkItem.on('list-loaded', () => {
        anzhiyu.loadLightbox(document.querySelectorAll('#artalk-wrap .atk-content img:not(.atk-emoticon)'))
      })
    }

    const loadArtalk = () => {
      if (typeof Artalk === 'function') setTimeout(init, 0)
      else {
        getCSS('${asset(theme, 'artalk_css')}')
        getScript('${asset(theme, 'artalk_js')}').then(init)
      }
    }

    const changeArtalkTheme = (theme) => {
      if (window.artalkItem) {
        window.artalkItem.setDarkMode(theme === 'dark')
      }
    }

    anzhiyu.addGlobalFn('themeChange', changeArtalkTheme, 'artalk')

    const getCommentCount = async () => {
      const countElement = document.querySelector('.post-meta-commentcount .artalk-count')
      if (!countElement) return

      try {
        const pageKey = countElement.getAttribute('data-page-key') || window.location.pathname
        const searchParams = new URLSearchParams({
          'site_name': ${jsval(a.site)},
          'page_keys': pageKey
        })
        const res = await fetch(\`${a.server || ''}/api/v2/stats/page_comment?\${searchParams}\`)
        const result = await res.json()
        if (result && result.data) {
          countElement.textContent = result.data[pageKey] || 0
        }
      } catch (err) {
        console.error('Artalk comment count fetch error:', err)
      }
    }

    if ('${systems[0]}' === 'Artalk' || ${lazyload}) {
      if (${lazyload}) anzhiyu.loadComment(document.getElementById('artalk-wrap'), loadArtalk)
      else setTimeout(loadArtalk, 0)
    } else {
      window.loadOtherComment = loadArtalk
    }

    if (${Boolean(count)} && GLOBAL_CONFIG_SITE.isPost) {
      getCommentCount()
    }
  })()`
  return inlineScript(body)
}

/** giscus.pug:1-53 —— #giscus-wrap、repo/repo_id/category_id、theme 切换。 */
export function renderGiscus(theme) {
  if (!systemEnabled(theme, 'Giscus')) return ''
  const g = obj(theme.giscus)
  const themes = obj(g.theme)
  const comments = obj(theme.comments)
  const systems = commentSystems(theme)
  const lazyload = flag(comments, 'lazyload')
  const giscusUrl = 'https://giscus.app/client.js'
  const body = `(()=>{
    const getGiscusTheme = theme => {
      return theme === 'dark' ? ${jsval(themes.dark)} : ${jsval(themes.light)}
    }

    const loadGiscus = () => {
      const config = Object.assign({
        src: '${giscusUrl}',
        'data-repo': ${jsval(g.repo)},
        'data-repo-id': ${jsval(g.repo_id)},
        'data-category-id': ${jsval(g.category_id)},
        'data-theme': getGiscusTheme(document.documentElement.getAttribute('data-theme')),
        'data-reactions-enabled': '1',
        crossorigin: 'anonymous',
        async: true
      }, ${jsval(g.option ?? null)})

      const ele = document.createElement('script')
      for (let key in config) {
        ele.setAttribute(key, config[key])
      }
      document.getElementById('giscus-wrap').appendChild(ele)
    }

    const changeGiscusTheme = theme => {
      const sendMessage = message => {
        const iframe = document.querySelector('iframe.giscus-frame')
        if (!iframe) return
        iframe.contentWindow.postMessage({ giscus: message }, 'https://giscus.app')
      }

      sendMessage({
        setConfig: {
          theme: getGiscusTheme(theme)
        }
      });
    }

    anzhiyu.addGlobalFn('themeChange', changeGiscusTheme, 'giscus')

    if ('${systems[0]}' === 'Giscus' || ${lazyload}) {
      if (${lazyload}) anzhiyu.loadComment(document.getElementById('giscus-wrap'), loadGiscus)
      else loadGiscus()
    } else {
      window.loadOtherComment = loadGiscus
    }
  })()`
  return inlineScript(body)
}

const BACKENDS = {
  Valine: renderValine,
  Waline: renderWaline,
  Twikoo: renderTwikoo,
  Artalk: renderArtalk,
  Giscus: renderGiscus,
}

/** 上游 comments/js.pug:1-12 —— 按 use 顺序把后端脚本拼起来。 */
export function renderCommentsJs(theme) {
  return commentSystems(theme)
    .map((name) => (BACKENDS[name] ? BACKENDS[name](theme) : ''))
    .join('')
}

/** 单测/接线用：一次拿到全部 comments 渲染函数。 */
export const commentsRenderers = {
  index: renderCommentsIndex,
  js: renderCommentsJs,
  ...BACKENDS,
}
