/**
 * newest-comments/render.mjs — 上游 `layout/includes/third-party/newest-comments/*.pug`（P5-1）。
 *
 * 映射：
 *   renderNewestCommentsCommon  ← common.pug:1-75   （window.newestComments 共享工具）
 *   renderNewestCommentsIndex   ← index.pug:1-13    （case use[0] 分发）
 *   renderNewestCommentsTwikoo  ← twikoo-comment.pug:1-91
 *   renderNewestCommentsValine  ← valine.pug:1-99
 *   renderNewestCommentsWaline  ← waline.pug:1-81
 *   renderNewestCommentsArtalk  ← artalk.pug:1-118
 *
 * 门控：`theme.newest_comments.enable` + `theme.aside.enable` + `theme.comments.use`
 * （上游 additional-js.pug:85-89；pjax.enable=false 时还要求非文章页，见 index 注释）。
 *
 * 与上游的差异（功能等价、非逐字）：4 个后端各自重复的 `changeContent` 局部副本
 * 改为调用 common.pug 的 `window.newestComments.changeContent`；文案用 zh-CN 默认字面量
 * （上游 `_p('aside.card_newest_comments.*')`）。DOM 层面这些都是纯脚本，无节点差异。
 */
import {
  asset,
  commentSystems,
  esc,
  flag,
  inlineScript,
  jsval,
  obj,
  srcScript,
  systemEnabled,
} from '../_kit.mjs'

/** 上游 additional-js.pug:85 的 `theme.aside.enable && theme.newest_comments.enable`。 */
function newestGate(theme) {
  return (
    flag(theme.newest_comments, 'enable') &&
    flag(theme.aside, 'enable') &&
    commentSystems(theme).length > 0
  )
}

const IMG_LABEL = '图片'
const LINK_LABEL = '链接'
const CODE_LABEL = '代码'
const ZERO_LABEL = '没有评论'
const ERROR_LABEL = '无法获取评论，请确认相关配置是否正确'

/** common.pug:1-75 —— window.newestComments（changeContent/generateHtml/run）。 */
export function renderNewestCommentsCommon(theme) {
  // common 不要求 aside.enable（它是工具，可被其它页面复用），但必须开启评论才输出。
  if (!flag(theme.newest_comments, 'enable') || commentSystems(theme).length === 0) return ''
  const avatar = Boolean(obj(theme.newest_comments).avatar)
  const lazyName = flag(theme.lazyload, 'enable') ? 'data-lazy-src' : 'src'
  const body = `window.newestComments = {
    changeContent: (content) => {
      if (content === '') return content

      content = content.replace(/<img.*?src="(.*?)"?[^\\>]+>/ig, '[${IMG_LABEL}]')
      content = content.replace(/<a[^>]+?href=["']?([^"']+)["']?[^>]*>([^<]+)<\\/a>/gi, '[${LINK_LABEL}]')
      content = content.replace(/<pre><code>.*?<\\/pre>/gi, '[${CODE_LABEL}]')
      content = content.replace(/<[^>]+>/g, "")

      if (content.length > 150) {
        content = content.substring(0, 150) + '...'
      }
      return content
    },

    generateHtml: (array, ele) => {
      let result = ''

      if (array.length) {
        for (let i = 0; i < array.length; i++) {
          result += '<div class=\\'aside-list-item\\'>'

          if (${avatar}) {
            const name = '${lazyName}'
            result += \`<a href='\${array[i].url}' class='thumbnail'><img \${name}='\${array[i].avatar}' alt='\${array[i].nick}'></a>\`
          }

          result += \`<div class='content'>
          <a class='comment' href='\${array[i].url}' title='\${array[i].content}'>\${array[i].content}</a>
          <div class='name'><span>\${array[i].nick} / </span><time datetime="\${array[i].date}">\${anzhiyu.diffDate(array[i].date, true)}</time></div>
          </div></div>\`
        }
      } else {
        result += '${ZERO_LABEL}'
      }

      if (ele) {
        ele.innerHTML = result
        window.lazyLoadInstance && window.lazyLoadInstance.update()
        window.pjax && window.pjax.refresh(ele)
      } else {
        let $dom = document.querySelector('#card-newest-comments .aside-list')
        $dom && ($dom.innerHTML = result)
        window.lazyLoadInstance && window.lazyLoadInstance.update()
        window.pjax && window.pjax.refresh($dom)
      }
    },

    run: (keyName, getComment) => {
      const ele = document.querySelector('#card-newest-comments .aside-list')
      if (!ele) return

      const data = saveToLocal.get(keyName)
      if (data) {
        window.newestComments.generateHtml(JSON.parse(data), ele)
      } else {
        getComment(ele)
      }

      document.addEventListener('pjax:complete', () => {
        const ele = document.querySelector('#card-newest-comments .aside-list')
        if (ele) {
          const data = saveToLocal.get(keyName)
          if (data) {
            window.newestComments.generateHtml(JSON.parse(data), ele)
          } else {
            getComment(ele)
          }
        }
      })
    }
  }`
  return inlineScript(body)
}

/** 4 个后端共用的 generateHtml 主体（上游各文件 50-75 / 27-52 / 19-44 / 23-48 行）。 */
function generateHtmlFn() {
  return `const generateHtml = array => {
      let result = ''

      if (array.length) {
        for (let i = 0; i < array.length; i++) {
          result += '<div class=\\'aside-list-item\\'>'

          if (${'${avatarFlag}'}) {
            const name = '${'${lazyName}'}'
            result += \`<a href='\${array[i].url}' class='thumbnail'><img \${name}='\${array[i].avatar}' alt='\${array[i].nick}'></a>\`
          }

          result += \`<div class='content'>
          <a class='comment' href='\${array[i].url}' title='\${array[i].content}'>\${array[i].content}</a>
          <div class='name'><span>\${array[i].nick} / </span><time datetime="\${array[i].date}">\${anzhiyu.diffDate(array[i].date, true)}</time></div>
          </div></div>\`
        }
      } else {
        result += '${ZERO_LABEL}'
      }

      let $dom = document.querySelector('#card-newest-comments .aside-list')
      $dom && ($dom.innerHTML = result)
      window.lazyLoadInstance && window.lazyLoadInstance.update()
      window.pjax && window.pjax.refresh($dom)
    }`
}

/** 把 generateHtmlFn 模板里的占位符替换成实际配置（避免再嵌一层模板字符串）。 */
function generateHtml(theme) {
  return generateHtmlFn()
    .replace('${avatarFlag}', String(Boolean(obj(theme.newest_comments).avatar)))
    .replace('${lazyName}', flag(theme.lazyload, 'enable') ? 'data-lazy-src' : 'src')
}

/** twikoo-comment.pug:1-91 —— getRecentComments + twikoo-newest-comments。 */
export function renderNewestCommentsTwikoo(theme) {
  if (!newestGate(theme) || !systemEnabled(theme, 'Twikoo')) return ''
  const t = obj(theme.twikoo)
  const limit = Number(obj(theme.newest_comments).limit ?? 6)
  const storage = Number(obj(theme.newest_comments).storage ?? 10)
  const body = `window.addEventListener('load', () => {
    const changeContent = window.newestComments.changeContent

    const getComment = () => {
      const runTwikoo = () => {
        twikoo.getRecentComments({
          envId: ${jsval(t.envId)},
          region: ${jsval(t.region)},
          pageSize: ${limit},
          includeReply: true
        }).then(function (res) {
          const twikooArray = res.map(e => {
            return {
              'content': changeContent(e.comment),
              'avatar': e.avatar,
              'nick': e.nick,
              'url': e.url + '#' + e.id,
              'date': new Date(e.created).toISOString()
            }
          })

          saveToLocal.set('twikoo-newest-comments', JSON.stringify(twikooArray), ${storage}/(60*24))
          generateHtml(twikooArray)
        }).catch(function (err) {
          const $dom = document.querySelector('#card-newest-comments .aside-list')
          $dom.textContent = '${ERROR_LABEL}'
        })
      }

      if (typeof twikoo === 'object') {
        runTwikoo()
      } else {
        getScript('${asset(theme, 'twikoo')}').then(runTwikoo)
      }
    }

    ${generateHtml(theme)}

    const newestCommentInit = () => {
      if (document.querySelector('#card-newest-comments .aside-list')) {
        const data = saveToLocal.get('twikoo-newest-comments')
        if (data) {
          generateHtml(JSON.parse(data))
        } else {
          getComment()
        }
      }
    }

    newestCommentInit()
    document.addEventListener('pjax:complete', newestCommentInit)
  })`
  return inlineScript(body)
}

/** valine.pug:1-99 —— 额外加载 blueimp_md5，读 valine.serverURLs/appId/appKey。 */
export function renderNewestCommentsValine(theme) {
  if (!newestGate(theme) || !systemEnabled(theme, 'Valine')) return ''
  const v = obj(theme.valine)
  const limit = Number(obj(theme.newest_comments).limit ?? 6)
  const storage = Number(obj(theme.newest_comments).storage ?? 10)
  const serverURL =
    v.serverURLs ||
    `https://${String(v.appId ?? '').substring(0, 8)}.api.lncldglobal.com`
  const md5Script = srcScript(asset(theme, 'blueimp_md5'))
  const body = `window.addEventListener('load', () => {
    const changeContent = window.newestComments.changeContent

    const getIcon = (icon, mail) => {
      if (icon) return icon
      const defaultIcon = ${jsval(v.avatar ? `?d=${v.avatar}` : '')}
      return \`https://gravatar.loli.net/avatar/\${md5(mail.toLowerCase()) + defaultIcon}\`
    }

    ${generateHtml(theme)}

    const getComment = () => {
      const serverURL = ${jsval(serverURL)}

      var settings = {
        "method": "GET",
        "headers": {
          "X-LC-Id": ${jsval(v.appId)},
          "X-LC-Key": ${jsval(v.appKey)},
          "Content-Type": "application/json"
        },
      }

      fetch(\`\${serverURL}/1.1/classes/Comment?limit=${limit}&order=-createdAt\`, settings)
        .then(response => response.json())
        .then(data => {
          const valineArray = data.results.map(function (e) {
            return {
              'avatar': getIcon(e.QQAvatar, e.mail),
              'content': changeContent(e.comment),
              'nick': e.nick,
              'url': e.url + '#' + e.objectId,
              'date': e.updatedAt,
            }
          })
          saveToLocal.set('valine-newest-comments', JSON.stringify(valineArray), ${storage}/(60*24))
          generateHtml(valineArray)
        }).catch(e => {
          const $dom = document.querySelector('#card-newest-comments .aside-list')
          $dom.textContent = '${ERROR_LABEL}'
        })
    }

    const newestCommentInit = () => {
      if (document.querySelector('#card-newest-comments .aside-list')) {
        const data = saveToLocal.get('valine-newest-comments')
        if (data) {
          generateHtml(JSON.parse(data))
        } else {
          getComment()
        }
      }
    }

    newestCommentInit()
    document.addEventListener('pjax:complete', newestCommentInit)
  })`
  return md5Script + inlineScript(body)
}

/** waline.pug:1-81 —— /api/comment?type=recent。 */
export function renderNewestCommentsWaline(theme) {
  if (!newestGate(theme) || !systemEnabled(theme, 'Waline')) return ''
  const serverURL = String(obj(theme.waline).serverURL ?? '').replace(/\/$/, '')
  const limit = Number(obj(theme.newest_comments).limit ?? 6)
  const storage = Number(obj(theme.newest_comments).storage ?? 10)
  const body = `window.addEventListener('load', () => {
    const changeContent = window.newestComments.changeContent

    ${generateHtml(theme)}

    const getComment = async () => {
      try {
        const res = await fetch('${esc(serverURL)}/api/comment?type=recent&count=${limit}', { method: 'GET' })
        const result = await res.json()
        const walineArray = result.data.map(e => {
          return {
            'content': changeContent(e.comment),
            'avatar': e.avatar,
            'nick': e.nick,
            'url': e.url + '#' + e.objectId,
            'date': e.time || e.insertedAt
          }
        })
        saveToLocal.set('waline-newest-comments', JSON.stringify(walineArray), ${storage}/(60*24))
        generateHtml(walineArray)
      } catch (err) {
        console.error(err)
        const $dom = document.querySelector('#card-newest-comments .aside-list')
        $dom.textContent = '${ERROR_LABEL}'
      }
    }

    const newestCommentInit = () => {
      if (document.querySelector('#card-newest-comments .aside-list')) {
        const data = saveToLocal.get('waline-newest-comments')
        if (data) {
          generateHtml(JSON.parse(data))
        } else {
          getComment()
        }
      }
    }

    newestCommentInit()
    document.addEventListener('pjax:complete', newestCommentInit)
  })`
  return inlineScript(body)
}

/** artalk.pug:1-118 —— /api/v2/stats/latest_comments + gravatar conf。 */
export function renderNewestCommentsArtalk(theme) {
  if (!newestGate(theme) || !systemEnabled(theme, 'Artalk')) return ''
  const a = obj(theme.artalk)
  const option = obj(a.option)
  const gravatar = obj(option.gravatar)
  const avatarCdn = gravatar.mirror || ''
  const avatarDefault = gravatar.params || gravatar.default || ''
  const limit = Number(obj(theme.newest_comments).limit ?? 6)
  const storage = Number(obj(theme.newest_comments).storage ?? 10)
  const body = `window.addEventListener('load', () => {
    const keyName = 'artalk-newest-comments'
    const changeContent = window.newestComments.changeContent

    ${generateHtml(theme)}

    const getAvatarValue = async () => {
      const predefinedAvatarCdn = ${jsval(avatarCdn)}
      const predefinedAvatarDefault = ${jsval(avatarDefault)}

      const avatarDefaultFormat = e => e.startsWith('d=') ? e : \`d=\${e}\`

      if (predefinedAvatarCdn && predefinedAvatarDefault) {
        return { avatarCdn: predefinedAvatarCdn, avatarDefault: avatarDefaultFormat(predefinedAvatarDefault) }
      }

      try {
        const res = await fetch('${esc(a.server ?? '')}/api/v2/conf')
        const result = await res.json()
        const { mirror, params, default: defaults } = result.frontend_conf.gravatar
        const avatarCdn = predefinedAvatarCdn || mirror
        let avatarDefault = avatarDefaultFormat(predefinedAvatarDefault || params || defaults)
        return { avatarCdn, avatarDefault }
      } catch (e) {
        console.error(e)
        return { avatarCdn: predefinedAvatarCdn, avatarDefault: avatarDefaultFormat(predefinedAvatarDefault) }
      }
    }

    const searchParams = new URLSearchParams({
      'site_name': ${jsval(a.site)},
      'limit': '${limit * 2}',
    })

    const getComment = async () => {
      try {
        const res = await fetch(\`${esc(a.server ?? '')}/api/v2/stats/latest_comments?\${searchParams}\`)
        const result = await res.json()
        const { avatarCdn, avatarDefault } = await getAvatarValue()
        const artalk = result.data
          .filter(e => !e.is_pending)
          .slice(0, ${limit})
          .map(e => {
            const avatar = avatarCdn && e.email_encrypted ? \`\${avatarCdn}\${e.email_encrypted}?\${avatarDefault}\` : ''
            return {
              'avatar': avatar,
              'content': changeContent(e.content_marked),
              'nick': e.nick,
              'url': e.page_url,
              'date': e.date,
            }
          })
        saveToLocal.set(keyName, JSON.stringify(artalk), ${storage}/(60*24))
        generateHtml(artalk)
      } catch (e) {
        console.log(e)
        const $dom = document.querySelector('#card-newest-comments .aside-list')
        $dom && ($dom.textContent = '${ERROR_LABEL}')
      }
    }

    const newestCommentInit = () => {
      if (document.querySelector('#card-newest-comments .aside-list')) {
        const data = saveToLocal.get(keyName)
        if (data) {
          generateHtml(JSON.parse(data))
        } else {
          getComment()
        }
      }
    }

    newestCommentInit()
    document.addEventListener('pjax:complete', newestCommentInit)
  })`
  return inlineScript(body)
}

const BACKENDS = {
  Twikoo: renderNewestCommentsTwikoo,
  Valine: renderNewestCommentsValine,
  Waline: renderNewestCommentsWaline,
  Artalk: renderNewestCommentsArtalk,
}

/**
 * index.pug:1-13 —— `if use` + case use[0]。
 * 上游 additional-js.pug:86-89 还要求 `aside.enable`；pjax.enable=false 时
 * 只有非文章页才 include，这里把该条件交给调用方（page.isPost）决定。
 */
export function renderNewestCommentsIndex(theme, props = {}) {
  if (!newestGate(theme)) return ''
  const page = props && typeof props.page === 'object' && props.page !== null ? props.page : props || {}
  if (!flag(theme.pjax, 'enable') && (page.isPost === true || page.pageType === 'post')) return ''
  const name = commentSystems(theme)[0]
  return BACKENDS[name] ? BACKENDS[name](theme) : ''
}

export const newestCommentsRenderers = {
  common: renderNewestCommentsCommon,
  index: renderNewestCommentsIndex,
  ...BACKENDS,
}
