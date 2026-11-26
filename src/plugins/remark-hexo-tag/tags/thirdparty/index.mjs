/**
 * 第三方嵌入 tag（7 个，附录 B「第三方嵌入」）—— P6-3。
 *
 * 上游实现逐条对应：
 *   - `bilibili.js`        → bilibili
 *   - `dogeplayer.js`      → dogeplayer
 *   - `mermaid.js`         → mermaid
 *   - `link.js`            → link
 *   - `flink.js`           → flink
 *   - `tip.js`             → tip
 *   - `Introduction-card.js` → intCard
 *
 * `flink` 的正文是 **YAML**（上游 `renderSync({ engine: 'yaml' })`），这里用本包声明的
 * `yaml` 依赖（`package.json` dependencies，`^2.9.1`）解析。
 *
 * @module remark-hexo-tag/tags/thirdparty
 */

import { parse as parseYaml } from 'yaml'

import { commaArgs, escapeHtml, escapeHtmlAttr, safeUrl, urlFor } from '../../runtime.mjs'

/** B 站播放图标（上游原样内联，勿改）。 */
const PLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" class="icon"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.67735 4.2798C5.98983 4.1725 7.85812 4.0625 10 4.0625C12.1421 4.0625 14.0105 4.17252 15.323 4.27983C16.2216 4.3533 16.9184 5.04049 16.9989 5.9318C17.0962 7.00837 17.1875 8.43614 17.1875 10C17.1875 11.5639 17.0962 12.9916 16.9989 14.0682C16.9184 14.9595 16.2216 15.6467 15.323 15.7202C14.0105 15.8275 12.1421 15.9375 10 15.9375C7.85812 15.9375 5.98983 15.8275 4.67735 15.7202C3.77861 15.6467 3.08174 14.9593 3.00119 14.0678C2.90388 12.9908 2.8125 11.5627 2.8125 10C2.8125 8.43727 2.90388 7.00924 3.00119 5.93221C3.08174 5.04067 3.77861 4.35327 4.67735 4.2798ZM10 2.8125C7.81674 2.8125 5.9136 2.92456 4.5755 3.03395C3.07738 3.15643 1.8921 4.31616 1.75626 5.81973C1.65651 6.92379 1.5625 8.39058 1.5625 10C1.5625 11.6094 1.65651 13.0762 1.75626 14.1803C1.8921 15.6838 3.07738 16.8436 4.5755 16.966C5.9136 17.0754 7.81674 17.1875 10 17.1875C12.1835 17.1875 14.0868 17.0754 15.4249 16.966C16.9228 16.8436 18.108 15.6841 18.2438 14.1807C18.3435 13.077 18.4375 11.6105 18.4375 10C18.4375 8.38948 18.3435 6.92296 18.2438 5.81931C18.108 4.31588 16.9228 3.15645 15.4249 3.03398C14.0868 2.92458 12.1835 2.8125 10 2.8125ZM12.1876 10.722C12.7431 10.4013 12.7431 9.59941 12.1876 9.27866L9.06133 7.47373C8.50577 7.15298 7.81133 7.55392 7.81133 8.19542V11.8053C7.81133 12.4468 8.50577 12.8477 9.06133 12.527L12.1876 10.722Z" fill="#9499A0"/></svg>'

/** 点赞图标。 */
const LIKE_ICON =
  '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" class="icon"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.77234 30.8573V11.7471H7.54573C5.50932 11.7471 3.85742 13.3931 3.85742 15.425V27.1794C3.85742 29.2112 5.50932 30.8573 7.54573 30.8573H9.77234ZM11.9902 30.8573V11.7054C14.9897 10.627 16.6942 7.8853 17.1055 3.33591C17.2666 1.55463 18.9633 0.814421 20.5803 1.59505C22.1847 2.36964 23.243 4.32583 23.243 6.93947C23.243 8.50265 23.0478 10.1054 22.6582 11.7471H29.7324C31.7739 11.7471 33.4289 13.402 33.4289 15.4435C33.4289 15.7416 33.3928 16.0386 33.3215 16.328L30.9883 25.7957C30.2558 28.7683 27.5894 30.8573 24.528 30.8573H11.9911H11.9902Z"></path></svg>'

/** 投币图标。 */
const COIN_ICON =
  '<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" class="icon" style="fill:;"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.045 25.5454C7.69377 25.5454 2.54504 20.3967 2.54504 14.0454C2.54504 7.69413 7.69377 2.54541 14.045 2.54541C20.3963 2.54541 25.545 7.69413 25.545 14.0454C25.545 17.0954 24.3334 20.0205 22.1768 22.1771C20.0201 24.3338 17.095 25.5454 14.045 25.5454ZM9.66202 6.81624H18.2761C18.825 6.81624 19.27 7.22183 19.27 7.72216C19.27 8.22248 18.825 8.62807 18.2761 8.62807H14.95V10.2903C17.989 10.4444 20.3766 12.9487 20.3855 15.9916V17.1995C20.3854 17.6997 19.9799 18.1052 19.4796 18.1052C18.9793 18.1052 18.5738 17.6997 18.5737 17.1995V15.9916C18.5667 13.9478 16.9882 12.2535 14.95 12.1022V20.5574C14.95 21.0577 14.5444 21.4633 14.0441 21.4633C13.5437 21.4633 13.1382 21.0577 13.1382 20.5574V12.1022C11.1 12.2535 9.52148 13.9478 9.51448 15.9916V17.1995C9.5144 17.6997 9.10883 18.1052 8.60856 18.1052C8.1083 18.1052 7.70273 17.6997 7.70265 17.1995V15.9916C7.71158 12.9487 10.0992 10.4444 13.1382 10.2903V8.62807H9.66202C9.11309 8.62807 8.66809 8.22248 8.66809 7.72216C8.66809 7.22183 9.11309 6.81624 9.66202 6.81624Z"></path></svg>'

/**
 * `{% bilibili idBv time hiddenDesc %}`
 *
 * 输出包含一段客户端 `<script>`；其中 `${…}` 有两类：
 *   - 构建期插值（`${id}` / `${API}` / `${time}` / `${hidden_desc}`）→ 保持不转义；
 *   - 客户端插值（`${data.pic}` 等）→ 写成 `\${…}`，原样留在脚本里。
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function bilibili({ args }) {
  const id = escapeHtml((args[0] || '').replace(/.*video\/(.*)\/?.*/, '$1'))
  const time = escapeHtml(args[1])
  const hiddenDesc = escapeHtml(args[2])
  const api = 'https://api.320.ink/api/b'

  return `
  <a href="https://www.bilibili.com/video/${id}/" class="bilibili_box" id="${id}"></a>

  <script>
    bilibili()

    function bilibili() {
      let dom = document.getElementById('${id}')
      fetch('${api}?id=${id}').then(res=>res.json()).then(data=>{
        dom.innerHTML = \`
        <div class="bilibili_cover">
          <img src="https://s1.hdslb.com/bfs/static/player/img/play.svg" class="play_icon no-lazyload">
          <img src="\${data.pic + '&h=300'}" class="no-lazyload">
          ${time ? `<span>${time}</span>` : ''}
        </div>
        <div class="bilibili_info">
          <div class="title">\${data.title}</div>
          ${hiddenDesc == 'true' ? '' : '<div class="desc">${data.desc}</div>'}
          <div class="stat">
            <span>${PLAY_ICON}\${data.view >= 10000 ? (data.view / 10000).toFixed(1) + "w" : data.view}</span>
            <span>${LIKE_ICON}\${data.like >= 10000 ? (data.like / 10000).toFixed(1) + "w" : data.view}</span>
            <span>${COIN_ICON}\${data.coin >= 10000 ? (data.coin / 10000).toFixed(1) + "w" : data.coin}</span>
          </div>
          <div class="owner">
            <span class="tip">视频</span>
            <img src="\${data.face + '&h=100'}" class="no-lazyload">
            <span>\${data.owner}</span>
          </div>
        </div>
        \`
      })
    }
  </script>
  `
}

/**
 * `{% dogeplayer userId vcode %}`
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function dogeplayer({ args }) {
  const userId = args[0]
  const vcode = escapeHtml(args[1])
  const divId = `player_${vcode}`
  // userId 直接落在脚本的数值位：只接受纯数字，其余一律 0，杜绝脚本注入。
  const userIdNum = Number(String(userId ?? '').trim())
  const safeUserId = Number.isFinite(userIdNum) ? userIdNum : 0

  return (
    `<div id="${divId}"></div>\n` +
    '<script type="text/javascript" data-pjax src="https://player.dogecloud.com/js/loader"></script>\n' +
    '<script type="text/javascript" data-pjax defer>\n' +
    '  setTimeout(() => {\n' +
    '    var dogePlayer = new DogePlayer({\n' +
    `        container: document.getElementById("${divId}"),\n` +
    `        userId: ${safeUserId},\n` +
    `        vcode: "${vcode}",\n` +
    '        autoPlay: false\n' +
    '    });\n' +
    '  }, 300);\n' +
    '</script>\n'
  )
}

/**
 * `{% mermaid %} … {% endmermaid %}`
 *
 * 正文不跑 Markdown，只做 HTML 转义后塞进 `<pre class="mermaid-src" hidden>`。
 *
 * @param {{ trimmedBody: string }} ctx
 * @returns {object[]}
 */
function mermaid(ctx) {
  return [
    {
      type: 'html',
      value: `<div class="mermaid-wrap"><pre class="mermaid-src" hidden>\n  ${escapeHtml(
        ctx.trimmedBody,
      )}\n  </pre></div>`,
    },
  ]
}

/**
 * `{% link title, sitename, url, imgUrl %}`
 *
 * @param {{ args: string[], options: { favicon?: string } }} ctx
 * @returns {string}
 */
function link(ctx) {
  const parts = commaArgs(ctx.args)
  const title = escapeHtml((parts[0] || '').trim())
  const sitename = escapeHtml((parts[1] || '').trim())
  const target = safeUrl((parts[2] || '').trim())
  const imgUrl = (parts[3] || '').trim()

  const isRelativePath = target.startsWith('/') && !target.startsWith('//')
  const isExplicitInside = imgUrl === 'true'
  const insideStation = isRelativePath || isExplicitInside
  const favicon = safeUrl(ctx.options.favicon || '/favicon.ico')

  let iconUrl = ''
  let useAutoFavicon = false
  if (imgUrl && imgUrl !== 'true') {
    iconUrl = safeUrl(imgUrl)
  } else if (insideStation) {
    iconUrl = favicon
  } else {
    useAutoFavicon = true
    try {
      iconUrl = `${new URL(target).origin}/favicon.ico`
    } catch {
      iconUrl = ''
    }
  }

  const hasIcon = iconUrl || useAutoFavicon
  const targetAttr = insideStation ? '' : 'target="_blank" rel="noopener external nofollow noreferrer"'

  return `<div class='anzhiyu-tag-link'><a class="tag-Link" ${targetAttr} href="${escapeHtmlAttr(urlFor(target))}">
    <div class="tag-link-tips">${insideStation ? '站内地址' : '引用站外地址'}</div>
    <div class="tag-link-bottom">
        <div class="tag-link-left"${hasIcon ? ` data-icon="${escapeHtmlAttr(iconUrl)}"` : ''}>
          <img class="tag-link-favicon" src="${escapeHtmlAttr(iconUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" style="${
            hasIcon ? '' : 'display:none'
          }" alt="favicon"/>
          <i class="anzhiyufont anzhiyu-icon-link" style="${hasIcon ? 'display:none' : 'display:flex'}"></i>
        </div>
        <div class="tag-link-right">
            <div class="tag-link-title">${title}</div>
            <div class="tag-link-sitename">${sitename}</div>
        </div>
        <i class="anzhiyufont anzhiyu-icon-angle-right"></i>
    </div>
    </a></div>`
}

/**
 * `{% flink %} … {% endflink %}`（正文是 YAML）
 *
 * @param {{ trimmedBody: string, options: { flinkErrorImg?: string } }} ctx
 * @returns {object[]}
 */
function flink(ctx) {
  // 非法 YAML / 非数组 / 数组里的空项与非对象项都不能把渲染打崩。
  let groups = []
  try {
    const parsed = parseYaml(ctx.trimmedBody)
    if (Array.isArray(parsed)) groups = parsed
  } catch {
    groups = []
  }
  groups = groups.filter((group) => group && typeof group === 'object' && !Array.isArray(group))
  const errorImg = safeUrl(urlFor(ctx.options.flinkErrorImg || '/img/friend_404.gif'))
  let result = ''

  for (const group of groups) {
    const className = group.class_name ? `<div class="flink-name">${escapeHtml(group.class_name)}</div>` : ''
    const classDesc = group.class_desc ? `<div class="flink-desc">${escapeHtml(group.class_desc)}</div>` : ''
    let listResult = ''
    let listContainerClass = ''

    const linkList = Array.isArray(group.link_list)
      ? group.link_list.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : []

    if (group.flink_style === 'anzhiyu') {
      listContainerClass = 'anzhiyu-flink-list'
      for (const item of linkList) {
        const name = escapeHtml(item.name)
        const descr = escapeHtml(item.descr)
        listResult += `
            <div class="flink-list-item">
              <a href="${escapeHtmlAttr(safeUrl(item.link))}" title="${escapeHtmlAttr(item.name)}" class="cf-friends-link" target="_blank">
                <div class="flink-item-icon">
                  <img class="no-lightbox cf-friends-avatar" src="${escapeHtmlAttr(safeUrl(item.avatar))}" onerror='this.onerror=null;this.src="${errorImg}"' alt="${escapeHtmlAttr(item.name)}" />
                </div>
                <div class="flink-item-info">
                  <div class="flink-item-name">${name}</div>
                  <div class="flink-item-desc" title="${escapeHtmlAttr(item.descr)}">${descr}</div>
                </div>
              </a>
            </div>`
      }
    } else {
      listContainerClass = 'flexcard-flink-list'
      for (const item of linkList) {
        const name = escapeHtml(item.name)
        listResult += `
              <a href="${escapeHtmlAttr(safeUrl(item.link))}" title="${escapeHtmlAttr(item.name)}" target="_blank" class="flink-list-card cf-friends-link">
                <div class="wrapper cover">
                    <img class="no-lightbox cover fadeIn" src="${escapeHtmlAttr(safeUrl(item.siteshot))}" onerror='this.onerror=null;this.src="${errorImg}"' alt="${escapeHtmlAttr(item.name)}" />
                </div>
                <div class="info">
                  <img class="no-lightbox cf-friends-avatar flink-avatar" src="${escapeHtmlAttr(safeUrl(item.avatar))}" onerror='this.onerror=null;this.src="${errorImg}"' alt="${escapeHtmlAttr(item.name)}"/>
                  <span class="flink-sitename cf-friends-name">${name}</span>
                </div>
              </a>`
      }
    }

    result += `${className}${classDesc} <div class="flink-list"><div class="${listContainerClass}">${listResult}</div></div>`
  }

  return [{ type: 'html', value: `<div class="flink">${result}</div>` }]
}

/**
 * `{% tip [class] %} … {% endtip %}`（正文走 Markdown）
 *
 * @param {{ args: string[], content: () => object[] }} ctx
 * @returns {object[]}
 */
function tip(ctx) {
  return [
    { type: 'html', value: `<div class="tip ${ctx.args.join(' ')}">` },
    ...ctx.content(),
    { type: 'html', value: '</div>' },
  ]
}

/**
 * `{% intCard link img tip cardTitle logo title subTitle %}`
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function intCard({ args }) {
  const [rawLinkUrl, rawImg, rawTipText, rawCardTitle, rawLogo, rawTitle, rawSubTitle] = args
  const linkUrl = safeUrl(rawLinkUrl)
  const img = safeUrl(rawImg)
  const logo = safeUrl(rawLogo)
  const tipText = escapeHtml(rawTipText)
  const cardTitle = escapeHtml(rawCardTitle)
  const title = escapeHtml(rawTitle)
  const subTitle = escapeHtml(rawSubTitle)
  const defaultTip = '最爱'
  const defaultCardTitle = '最爱'

  const introductionCardBottom =
    logo || title || subTitle
      ? `
      <div class="introduction-card-bottom">
        <div class="left">
          <img src="${escapeHtmlAttr(urlFor(logo || ''))}" class="no-lightbox" alt="introduction"/>
          <div class="info">
            <div class="title">${title || ''}</div>
            <div class="subTitle">${subTitle || ''}</div>
          </div>
        </div>
        <div class="right">
          <a href="${escapeHtmlAttr(urlFor(linkUrl))}" tableindex="-1" class="no-text-decoration">前往</a>
        </div>
      </div>
    `
      : ''

  const radius = introductionCardBottom ? '' : 'height: 100%;border-radius:15px;'
  const height = introductionCardBottom ? '' : 'height: 416px;'

  return `
    <div class="introduction-card" style="${height}">
      <div class="introduction-card-top" style="${radius}">
        <div class="int-card-info">
          <div class="int-tip">${tipText || defaultTip}</div>
          <div class="int-cardTitle">${cardTitle || defaultCardTitle}</div>
        </div>
        <img src="${escapeHtmlAttr(urlFor(img))}" class="no-lightbox" alt="introduction"/>
      </div>
      ${introductionCardBottom}
    </div>
  `
}

/** 行内（自闭合）第三方 tag。 */
export const thirdPartyTags = {
  dogeplayer,
  link,
}

/**
 * 容器型第三方 tag。
 *
 * `bilibili` / `intCard` 的输出以 `<a>` / 换行缩进的 `<div>` 开头，留在段落里会被
 * 包 `<p>`（`intCard` 甚至会被当成 4 空格缩进代码块）；上游是 Markdown 之后插入，
 * 天然位于顶层。因此按 `ends: false` 的「字符串块级」tag 处理。
 */
export const thirdPartyBlockTags = {
  mermaid: { render: mermaid },
  flink: { render: flink },
  tip: { render: tip },
  bilibili: { ends: false, string: true, render: bilibili },
  intCard: { ends: false, string: true, render: intCard },
}
