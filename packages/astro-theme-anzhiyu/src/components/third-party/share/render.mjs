/**
 * share/render.mjs — 上游 `layout/includes/third-party/share/*.pug`（P5-1）。
 *
 * 映射：
 *   renderShareIndex ← index.pug:1-7      （.post_share；sharejs 优先于 addtoany）
 *   renderShareJs    ← share-js.pug:1-3   （.social-share + CSS/JS）
 *   renderAddtoany   ← addtoany.pug:1-11  （.a2a_kit + a2a_button_* + page.js）
 *
 * 门控：`theme.sharejs.enable` / `theme.addtoany.enable`（上游 index.pug 的 if/else-if）。
 * 上游挂载点：post-copyright.pug:42 / :63（文章底部工具区）。
 */
import { asset, esc, flag, obj, srcScript, styleLink, pageOf } from '../_kit.mjs'

/** share-js.pug:1-3 —— data-image 取 page.cover || theme.avatar.img。 */
export function renderShareJs(theme, props = {}) {
  if (!flag(theme.sharejs, 'enable')) return ''
  const page = pageOf(props)
  const avatar = obj(theme.avatar).img ?? ''
  const image = page.cover || avatar
  const sites = obj(theme.sharejs).sites ?? ''
  return (
    `<div class="social-share" data-image="${esc(image)}" data-sites="${esc(sites)}"></div>` +
    styleLink(asset(theme, 'sharejs_css'), {
      media: 'print',
      onload: "this.media='all'",
    }) +
    srcScript(asset(theme, 'sharejs'), { defer: true })
  )
}

/** addtoany.pug:1-11 —— item 是逗号分隔字符串。 */
export function renderAddtoany(theme) {
  if (!flag(theme.addtoany, 'enable') || flag(theme.sharejs, 'enable')) return ''
  const item = String(obj(theme.addtoany).item ?? '')
  const buttons = item
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `<a class="a2a_button_${esc(name)}"></a>`)
    .join('')
  return (
    '<div class="addtoany">' +
    `<div class="a2a_kit a2a_kit_size_32 a2a_default_style">${buttons}` +
    '<a class="a2a_dd" href="https://www.addtoany.com/share"></a>' +
    '</div></div>' +
    srcScript('https://static.addtoany.com/menu/page.js', { async: true })
  )
}

/** index.pug:1-7 —— sharejs 与 addtoany 互斥，外层统一包 .post_share。 */
export function renderShareIndex(theme, props = {}) {
  if (flag(theme.sharejs, 'enable')) {
    return `<div class="post_share">${renderShareJs(theme, props)}</div>`
  }
  if (flag(theme.addtoany, 'enable')) {
    return `<div class="post_share">${renderAddtoany(theme)}</div>`
  }
  return ''
}

export const shareRenderers = {
  index: renderShareIndex,
  'share-js': renderShareJs,
  addtoany: renderAddtoany,
}
