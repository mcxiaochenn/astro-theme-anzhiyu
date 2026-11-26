/**
 * 媒体与卡片 tag（11 个，附录 B「媒体与卡片」）—— P6-2。
 *
 * 上游实现逐条对应：
 *   - `image.js`   → image / inlineimage
 *   - `media.js`   → audio / video / videos
 *   - `gallery.js` → gallery / galleryGroup
 *   - `site.js`    → site / sitegroup
 *   - `btns.js`    → btns / cell
 *
 * 两个关键语义：
 *   1. `videos` / `sitegroup` / `btns` 的正文上游**不跑 Markdown**（Nunjucks 先展开
 *      嵌套 tag，Markdown 语法保持字面量），所以这里用 `ctx.raw()`；
 *   2. `image` / `site` / `flink` 等 `<img>` 上的 `data-lazy-src` / 占位 `src` 来自
 *      上游 `scripts/filters/post_lazyload.js`，不是 tag 模板，本插件输出滤镜前形态。
 *
 * @module remark-hexo-tag/tags/media
 */

import { commaArgs, escapeHtml, escapeHtmlAttr, safeUrl, urlFor } from '../../runtime.mjs'

/**
 * `{% image url, alt=, width=, height=, bg= %}`
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function image({ args }) {
  const parts = args.join(' ').split(', ')
  const url = (parts[0] || '').trim()
  let alt = ''
  let bg = ''
  let style = ''

  for (let index = 1; index < parts.length; index += 1) {
    const item = parts[index].trim()
    if (item.includes('alt=')) alt = item.substring(4)
    else if (item.includes('width=')) style += `width:${item.substring(6)};`
    else if (item.includes('height=')) style += `height:${item.substring(7)};`
    else if (item.includes('bg=')) bg = item.substring(3)
  }

  let img = `<img class="img" src="${escapeHtmlAttr(safeUrl(url))}"`
  if (alt.length > 0) img += ` alt="${escapeHtmlAttr(alt)}"`
  if (style.length > 0) img += ` style="${escapeHtmlAttr(style)}"`
  img += '/>'

  let output = '<div class="img-wrap"><div class="img-bg"'
  if (bg.length > 0) output += ` style="background:${escapeHtmlAttr(bg)}"`
  output += `>${img}</div>`
  if (alt.length > 0) output += `<span class="image-caption">${escapeHtml(alt)}</span>`
  output += '</div>'
  return output
}

/**
 * `{% inlineimage url, height=22px %}`
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function inlineimage({ args }) {
  const parts = args.join(' ').split(', ')
  const url = (parts[0] || '').trim()
  let style = ''
  for (let index = 1; index < parts.length; index += 1) {
    const item = parts[index].trim()
    if (item.includes('height=')) style += `height:${item.substring(7)};`
  }

  const styleAttr = style.length > 0 ? style : 'height:1.5em'
  return `<img no-lazy class="inline" src="${escapeHtmlAttr(safeUrl(url))}" style="${escapeHtmlAttr(styleAttr)}"/>`
}

/** `{% audio src %}` */
function audio({ args }) {
  const src = (args[0] || '').trim()
  return `<div class="audio"><audio controls preload><source src='${escapeHtmlAttr(safeUrl(src))}' type='audio/mp3'>Your browser does not support the audio tag.</audio></div>`
}

/** `{% video src %}` */
function video({ args }) {
  const src = (args[0] || '').trim()
  return `<div class="video"><video controls preload><source src='${escapeHtmlAttr(safeUrl(src))}' type='video/mp4'>Your browser does not support the video tag.</video></div>`
}

/**
 * `{% videos [class], [col] %} … {% endvideos %}`
 *
 * 正文字面量拼接（不跑 Markdown）。
 *
 * @param {{ args: string[], raw: () => string }} ctx
 * @returns {object[]}
 */
function videos(ctx) {
  const parts = commaArgs(ctx.args)
  let cls = parts[0] || ''
  if (cls.length > 0) cls = ` ${cls}`
  const col = Number(parts[1]) || 0
  const colAttr = col > 0 ? ` col='${col}'` : ''
  return [{ type: 'html', value: `<div class="videos${cls}"${colAttr}>${ctx.raw()}</div>` }]
}

/** `![alt](url "title")` —— 与上游 gallery.js 的正则一致。 */
const GALLERY_IMAGE_RE = /!\[(.*?)\]\(([^\s]*)\s*(?:["'](.*?)["']?)?\s*\)/g

/**
 * `{% gallery [lazyload],[rowHeight],[limit] %}` 或 `{% gallery url,[link],… %}`
 *
 * @param {{ args: string[], trimmedBody: string, options: { loadMoreText?: string } }} ctx
 * @returns {object[]}
 */
function gallery(ctx) {
  const parts = commaArgs(ctx.args)
  let rowHeight
  let limit
  let lazyload
  let type
  let dataStr
  let lazyloadBtn

  if (parts[0] === 'url') {
    ;[type, dataStr, lazyload, rowHeight = 220, limit = 10, lazyloadBtn = false] = parts
    rowHeight = rowHeight === '' ? 220 : rowHeight
    limit = limit === '' ? 10 : limit
    lazyloadBtn = lazyloadBtn === false ? false : lazyloadBtn
  } else {
    ;[lazyload, rowHeight = 220, limit = 10, lazyloadBtn = false] = parts
    rowHeight = rowHeight === '' ? 220 : rowHeight
    limit = limit === '' ? 10 : limit
    lazyloadBtn = lazyloadBtn === false ? false : lazyloadBtn

    const re = new RegExp(GALLERY_IMAGE_RE.source, 'g')
    const items = []
    let match
    while ((match = re.exec(ctx.trimmedBody)) !== null) {
      if (match.index === re.lastIndex) re.lastIndex += 1
      items.push({ url: match[2], alt: match[1], title: match[3] })
    }
    dataStr = JSON.stringify(items)
  }

  const resolvedType = type ? ' url' : ' data'
  const lazyloadClass = lazyload === 'true' ? 'lazyload btn_album_detail_lazyload' : ''
  const pageImgLazyloadClass = lazyloadBtn == true ? '' : 'page_img_lazyload '

  // gallery-data 是 JSON 文本：`<` 会提前开标签、`&` 会被当 HTML 实体解码，
  // 都会破坏 JSON.parse，前者转义成 \u003c，后者走 HTML 实体。
  const safeDataStr = String(dataStr ?? '')
    .replace(/</g, '\\u003c')
    .replace(/&/g, '&amp;')

  const html = `<div class="gallery">
  <div class="fj-gallery ${escapeHtmlAttr(pageImgLazyloadClass + lazyloadClass + resolvedType)}" data-rowHeight="${escapeHtmlAttr(rowHeight)}" data-limit="${escapeHtmlAttr(limit)}">
    <span class="gallery-data">${safeDataStr}</span>
  </div><button class="gallery-load-more" style="${!lazyloadBtn ? 'opacity:0' : ''}">
  <span>${escapeHtml(ctx.options.loadMoreText || '加载更多')}</span>
  <i class="anzhiyufont anzhiyu-icon-arrow-down"></i>
  </button></div>`

  return [{ type: 'html', value: html }]
}

/**
 * `{% galleryGroup name descr url img %}`
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function galleryGroup({ args }) {
  const name = args[0]
  const descr = args[1]
  const url = urlFor(safeUrl(args[2]))
  const img = urlFor(safeUrl(args[3]))

  return `
  <figure class="gallery-group">
  <img class="gallery-group-img no-lightbox" src='${escapeHtmlAttr(img)}' alt="Group Image Gallery">
  <figcaption>
  <div class="gallery-group-name">${escapeHtml(name)}</div>
  <p>${escapeHtml(descr)}</p>
  <a href='${escapeHtmlAttr(url)}'></a>
  </figcaption>
  </figure>
  `
}

/**
 * `{% site title, url=, screenshot=, avatar=, description= %}`
 *
 * 注意上游按 `', '` 切分（逗号 + 空格），不是单独的逗号。
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function site({ args }) {
  const parts = args.join(' ').split(', ')
  const title = (parts[0] || '').trim()
  let url = ''
  let screenshot = ''
  let avatar = ''
  let description = ''

  for (let index = 1; index < parts.length; index += 1) {
    const item = parts[index].trim()
    if (item.includes('url=')) url = item.substring(4)
    else if (item.includes('screenshot=')) screenshot = item.substring(11)
    else if (item.includes('avatar=')) avatar = item.substring(7)
    else if (item.includes('description=')) description = item.substring(12)
  }

  let output = `<a class="site-card" href="${escapeHtmlAttr(safeUrl(url))}" data-title="${escapeHtmlAttr(description)}">`
  output += `<div class="wrapper cover"><img class="cover fadeIn" src="${escapeHtmlAttr(safeUrl(screenshot))}"/></div>`
  output += '<div class="info">'
  if (avatar.length > 0) output += `<img class="flink-avatar" src="${escapeHtmlAttr(safeUrl(avatar))}"/>`
  output += `<span class="site-title">${escapeHtml(title)}</span>`
  output += '</div></a>'
  return output
}

/**
 * `{% sitegroup [标题] %} … {% endsitegroup %}`
 *
 * 正文不跑 Markdown；`${args}` 在 JS 里是数组 toString（逗号连接）。
 *
 * @param {{ args: string[], raw: () => string }} ctx
 * @returns {object[]}
 */
function sitegroup(ctx) {
  const header = ctx.args.length > 0 ? `<p class='p h2'>${ctx.args.toString()}</p>` : ''
  return [{ type: 'html', value: `<div class="site-card-group">${header}${ctx.raw()}</div>` }]
}

/**
 * `{% btns class… %} … {% endbtns %}`
 *
 * @param {{ args: string[], raw: () => string }} ctx
 * @returns {object[]}
 */
function btns(ctx) {
  return [
    {
      type: 'html',
      value: `<div class="btns ${ctx.args.join(' ')}">\n            ${ctx.raw()}\n          </div>`,
    },
  ]
}

/**
 * `{% cell text, url, icon-or-img %}`
 *
 * `图标`判定用的是**未 trim** 的第三个参数是否包含 `' anzhiyufont'`（带前导空格），
 * 所以 `split(',')` 后必须保留那个前导空格。
 *
 * @param {{ args: string[] }} ctx
 * @returns {string}
 */
function cell({ args }) {
  const parts = args.join(' ').split(',')
  const text = (parts[0] || '').trim()
  let url = (parts[1] || '').trim()
  if (url.length > 0) url = `href='${escapeHtmlAttr(safeUrl(url))}'`

  let icon = ''
  let img = 'https://npm.elemecdn.com/hexo-butterfly-tag-plugins-plus/lib/assets/default.svg'
  if (parts.length > 2) {
    if (parts[2].indexOf(' anzhiyufont') > -1) icon = parts[2].trim()
    else img = parts[2].trim()
  }

  const safeText = escapeHtmlAttr(text)
  if (icon.length > 0) {
    return `<a class="button no-text-decoration" ${url} title='${safeText}'><i class='${escapeHtmlAttr(icon)}'></i>${escapeHtml(text)}</a>`
  }
  return `<a class="button no-text-decoration" ${url} title='${safeText}'><img src='${escapeHtmlAttr(safeUrl(img))}'>${escapeHtml(text)}</a>`
}

/** 行内（自闭合）媒体与卡片 tag。 */
export const mediaTags = {
  image,
  inlineimage,
  audio,
  video,
  galleryGroup,
}

/**
 * 容器型媒体与卡片 tag。
 *
 * `site` / `cell` 虽然上游注册为自闭合 tag，但输出以 `<a>` 开头：在 remark 里
 * 单行 `<a>…</a>` 会被当成段落内联 HTML（多出一层 `<p>`），而上游是 Markdown 之后
 * 再插入、天然位于顶层。所以这里标记为 `ends: false` 的「字符串块级」tag，
 * 由插件直接产出 html 节点；`sitegroup` / `btns` 的 `ctx.raw()` 也会识别并展开它们。
 */
export const mediaBlockTags = {
  videos: { render: videos },
  gallery: { render: gallery },
  sitegroup: { render: sitegroup },
  btns: { render: btns },
  site: { ends: false, string: true, render: site },
  cell: { ends: false, string: true, render: cell },
}
