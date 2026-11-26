/**
 * 行内语义 tag（12 个，附录 B「行内语义」）。
 *
 * 全部来自上游 `scripts/tag/`，模板字符串逐字符照抄：
 *   - `inline-labels.js` → u / emp / wavy / del / kbd / psw
 *   - `label.js`        → label
 *   - `inlineImg.js`    → inlineImg
 *   - `iconfont.js`     → icon
 *   - `button.js`       → btn
 *   - `span.js`         → p / span
 *
 * 与上游的唯一结构性差异在 `inlineImg`：上游在 Markdown 渲染之后还会被
 * `scripts/filters/post_lazyload.js` 改写一次（占位 src + `data-lazy-src`），
 * 那属于 P2-4 的图片懒加载滤镜，不在 tag 插件职责内。这里输出滤镜之前的
 * `<img class="inline-img" src="…" style="…"/>`。
 *
 * 参数语义一律沿用 Hexo：`args` 是空白切分后的 token 数组；上游习惯再
 * `join(' ').split(',')` 的地方用 {@link commaArgs}。
 *
 * @module remark-hexo-tag/tags/inline
 */

import { commaArgs, urlFor } from '../../runtime.mjs'

/**
 * 生成「外层标签包住 args.join(' ')」这一类最简 tag。
 *
 * @param {string} tagName
 * @returns {(ctx: { args: string[] }) => string}
 */
const wrap = (tagName) => ({ args }) => `<${tagName}>${args.join(' ')}</${tagName}>`

/**
 * `{% label text color %}`
 * color 缺省 `default`；上游在 `</mark>` 后固定跟一个空格。
 *
 * @type {(ctx: { args: string[] }) => string}
 */
const label = ({ args }) => `<mark class="hl-label ${args[1] || 'default'}">${args[0]}</mark> `

/**
 * `{% inlineImg src height %}`
 * height 可选，原样进 style（`1.5em` / `36px` 都可以）。
 *
 * @type {(ctx: { args: string[] }) => string}
 */
const inlineImg = ({ args }) => {
  const img = args[0]
  const height = args[1] ? `style="height:${args[1]}"` : ''
  return `<img class="inline-img" src="${urlFor(img)}" ${height}/>`
}

/**
 * `{% icon name size %}`
 *
 * 上游实现是 `args.join(' ').split(',')`，所以 `{% icon foo, 1.2 %}` 的 size
 * 实际是 `" 1.2"`（带前导空格），输出 `width: 1.2em`——必须保留这个空格，
 * 否则和基准产物差一个字符。
 *
 * @type {(ctx: { args: string[] }) => string}
 */
const icon = ({ args }) => {
  const parts = commaArgs(args)
  const name = parts[0]
  const size = parts[1] ? parts[1] : 1
  return `<svg class="icon" style="width:${size}em; height:${size}em" aria-hidden="true"><use xlink:href="#${name}"></use></svg>`
}

/**
 * `{% btn url text icon option %}`
 * 上游模板在 href 与 title 之间有一个「空格 + 换行 + 两空格」，这里照抄；
 * remark 的 HTML 词法会把标签内换行折叠成一个空格，结构上等价。
 *
 * @type {(ctx: { args: string[] }) => string}
 */
const btn = ({ args }) => {
  const parts = commaArgs(args)
  const url = (parts[0] || '').trim()
  const text = (parts[1] || '').trim()
  const iconClass = (parts[2] || '').trim()
  const option = (parts[3] || '').trim()

  return `<a class="btn-anzhiyu ${option}" href="${urlFor(url)}" \n  title="${text}">${
    iconClass.length ? `<i class="${iconClass}"></i>` : ''
  }${text.length ? `<span>${text}</span>` : ''}</a>`
}

/**
 * `{% p class, text %}` / `{% span class, text %}`
 *
 * 注意：上游输出的是字面 `<p class='p h2'>…</p>`，嵌在段落里属于非法 HTML；
 * HTML5 解析器（rehype-raw 里的 parse5）会把外层段落自动闭合，文本内容不变，
 * 结构会变成三个兄弟 <p>（详见 docs/notes/P6-1-hexo-tags.md「已知差异」）。
 *
 * @param {'p' | 'span'} tagName
 * @returns {(ctx: { args: string[] }) => string}
 */
const blockish = (tagName) => ({ args }) => {
  const parts = commaArgs(args)
  // `{% p red %}` 这类缺参写法：parts[1] 不存在时兜底空串，不能 .trim() 崩掉。
  const className = (parts[0] ?? '').trim()
  const text = (parts[1] ?? '').trim()
  return `<${tagName} class='p ${className}'>${text}</${tagName}>`
}

/** 行内 tag 表：name → 渲染函数。 */
export const inlineTags = {
  u: wrap('u'),
  emp: wrap('emp'),
  wavy: wrap('wavy'),
  del: wrap('del'),
  kbd: wrap('kbd'),
  psw: wrap('psw'),
  label,
  inlineImg,
  icon,
  btn,
  p: blockish('p'),
  span: blockish('span'),
  // `{% hideInline %}` 虽然归在「块级容器」一组的文档里，但它是自闭合 tag，
  // 输出的是行内 <span>，因此实现放在 inline 表里。
  hideInline: ({ args }) => {
    const parts = commaArgs(args)
    const content = parts[0]
    const display = parts[1] || 'Click'
    const bg = parts[2] || false
    const color = parts[3] || false
    let group = 'style="'
    if (bg) group += `background-color: ${bg};`
    if (color) group += `color: ${color}`
    group += '"'
    return `<span class="hide-inline"><button type="button" class="hide-button" ${group}>${display}\n  </button><span class="hide-content">${content}</span></span>`
  },
}

/** 自闭合、不需要 `{% endxxx %}` 的 tag 名（元数据，供 index 与测试使用）。 */
export const inlineTagNames = Object.keys(inlineTags)
