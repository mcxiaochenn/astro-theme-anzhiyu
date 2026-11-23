/**
 * card-post-count/render.mjs — 上游 `layout/includes/third-party/card-post-count/*.pug`（P5-1）。
 *
 * 映射：
 *   renderCardPostCountIndex ← index.pug:1-9      （case use[0] 分发）
 *   renderCardPostCountTwikoo ← twikoo.pug:1-37   （#recent-posts .twikoo-count）
 *   renderCardPostCountValine ← valine.pug:1-21   （Valine.appId/appKey）
 *   renderCardPostCountWaline ← waline.pug:1-21   （.waline-comment-count）
 *   renderCardPostCountArtalk ← artalk.pug:1-31   （.artalk-count）
 *
 * 门控：`theme.comments.card_post_count`（上游 needLoadCountJs，见
 * mixins/post-ui.pug:69-78）+ 对应后端在 `theme.comments.use` 里。
 * 上游挂载点：additional-js.pug:66-67（.js-pjax 内）。
 */
import {
  asset,
  commentSystems,
  esc,
  flag,
  inlineScript,
  obj,
  systemEnabled,
} from '../_kit.mjs'

/** 主门控：card_post_count 关闭或没有评论系统时一律 0 节点。 */
function countGate(theme) {
  return flag(theme.comments, 'card_post_count') && commentSystems(theme).length > 0
}

/** twikoo.pug:1-37 */
export function renderCardPostCountTwikoo(theme) {
  if (!countGate(theme) || !systemEnabled(theme, 'Twikoo')) return ''
  const t = obj(theme.twikoo)
  const body = `(() => {
    const getCommentUrl = () => {
      const eleGroup = document.querySelectorAll('#recent-posts .article-title')
      let urlArray = []
      eleGroup.forEach(i => {
        urlArray.push(i.getAttribute('href'))
      })
      return urlArray
    }

    const getCount = () => {
      const runTwikoo = () => {
        twikoo.getCommentsCount({
          envId: ${JSON.stringify(t.envId ?? null)},
          region: ${JSON.stringify(t.region ?? null)},
          urls: getCommentUrl(),
          includeReply: false
        }).then(function (res) {
          document.querySelectorAll('#recent-posts .twikoo-count').forEach((item, index) => {
            item.textContent = res[index].count
          })
        }).catch(function (err) {
          console.log(err)
        })
      }

      if (typeof twikoo === 'object') {
        runTwikoo()
      } else {
        getScript('${asset(theme, 'twikoo')}').then(runTwikoo)
      }
    }

    window.pjax ? getCount() : window.addEventListener('load', getCount)
  })()`
  return inlineScript(body)
}

/** valine.pug:1-21 */
export function renderCardPostCountValine(theme) {
  if (!countGate(theme) || !systemEnabled(theme, 'Valine')) return ''
  const v = obj(theme.valine)
  const body = `(() => {
    function loadValine () {
      function initValine () {
        let initData = {
          el: '#vcomment',
          appId: ${JSON.stringify(v.appId ?? '')},
          appKey: ${JSON.stringify(v.appKey ?? '')},
          serverURLs: ${JSON.stringify(v.serverURLs ?? null)}
        }

        const valine = new Valine(initData)
      }

      if (typeof Valine === 'function') initValine()
      else getScript('${asset(theme, 'valine')}').then(initValine)
    }

    window.pjax ? loadValine() : window.addEventListener('load', loadValine)
  })()`
  return inlineScript(body)
}

/** waline.pug:1-21（上游第 1 行去掉 serverURL 结尾斜杠） */
export function renderCardPostCountWaline(theme) {
  if (!countGate(theme) || !systemEnabled(theme, 'Waline')) return ''
  const serverURL = String(obj(theme.waline).serverURL ?? '').replace(/\/$/, '')
  const body = `(() => {
    async function loadWaline () {
      try {
        const eleGroup = document.querySelectorAll('#recent-posts .waline-comment-count')
        const keyArray = Array.from(eleGroup).map(i => i.getAttribute('data-path'))

        const res = await fetch(\`${esc(serverURL)}/api/comment?type=count&url=\${keyArray}\`, { method: 'GET' })
        const result = await res.json()

        result.data.forEach((count, index) => {
          eleGroup[index].textContent = count
        })
      } catch (err) {
        console.error(err)
      }
    }

    window.pjax ? loadWaline() : window.addEventListener('load', loadWaline)
  })()`
  return inlineScript(body)
}

/** artalk.pug:1-31 */
export function renderCardPostCountArtalk(theme) {
  if (!countGate(theme) || !systemEnabled(theme, 'Artalk')) return ''
  const a = obj(theme.artalk)
  const body = `(() => {
    const getArtalkCount = async() => {
      try {
        const eleGroup = document.querySelectorAll('#recent-posts .artalk-count')
        const keyArray = Array.from(eleGroup).map(i => i.getAttribute('data-page-key'))

        const headerList = {
          method: 'GET',
        }

        const searchParams = new URLSearchParams({
          'site_name': ${JSON.stringify(a.site ?? '')},
          'page_keys': keyArray
        })

        const res = await fetch(\`${esc(a.server ?? '')}/api/v2/stats/page_comment?\${searchParams}\`, headerList)
        const result = await res.json()

        keyArray.forEach((key, index) => {
          eleGroup[index].textContent = result.data[key] || 0
        })
      } catch (err) {
        console.error(err)
      }
    }

    window.pjax ? getArtalkCount() : window.addEventListener('load', getArtalkCount)
  })()`
  return inlineScript(body)
}

const BACKENDS = {
  Twikoo: renderCardPostCountTwikoo,
  Valine: renderCardPostCountValine,
  Waline: renderCardPostCountWaline,
  Artalk: renderCardPostCountArtalk,
}

/** index.pug:1-9 —— 只取 use[0]（单系统），与上游 case 一致。 */
export function renderCardPostCountIndex(theme) {
  if (!countGate(theme)) return ''
  const name = commentSystems(theme)[0]
  return BACKENDS[name] ? BACKENDS[name](theme) : ''
}

export const cardPostCountRenderers = {
  index: renderCardPostCountIndex,
  ...BACKENDS,
}
