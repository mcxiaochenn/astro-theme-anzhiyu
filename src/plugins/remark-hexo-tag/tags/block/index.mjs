/**
 * 块级容器 tag（12 个，附录 B「块级容器」）。
 *
 * 上游实现：
 *   - `note.js`       → note / subnote
 *   - `tabs.js`       → tabs / subtabs / subsubtabs
 *   - `hide.js`       → hideBlock / hideToggle（hideInline 在 inline 表）
 *   - `folding.js`    → folding
 *   - `checkbox.js`   → checkbox / radio（上游是自闭合 tag，但正文参数要过 Markdown，
 *                       本实现把它当块级处理，见下）
 *   - `timeline.js`   → timeline
 *
 * 渲染约定：每个 handler 返回 **mdast 节点数组**，形如
 * `[html(开标签), ...正文 mdast, html(闭标签)]`。正文通过 `ctx.content()`
 * 递归调用 remark 解析（`this.parse`），因此容器里的 Markdown / 嵌套 tag 都照常渲染，
 * 再由 `rehype-raw` 把 `html` 节点解析成真正的 DOM。
 *
 * 这样做的原因：上游是「先把正文 markdown 渲染成 HTML，再把 HTML 字符串塞回
 * 外层的 markdown 再渲染一次」；在 remark 管线里等价的做法就是保留 mdast 结构，
 * 只把容器外壳用 HTML 节点表达，避免字符串往返丢失节点。
 *
 * @module remark-hexo-tag/tags/block
 */

import { commaArgs } from '../../runtime.mjs'

/** note 支持的四套样式（`hexo.theme.config.note.style` 的合法取值）。 */
const NOTE_STYLES = new Set(['flat', 'modern', 'simple', 'disabled'])

/**
 * `{% note [type] [style] [icon] %}` / `{% subnote %}`
 *
 * 上游规则：
 *   1. 最后一个参数不是四套样式之一 → 追加主题配置里的 `note.style`；
 *   2. 倒数第二个参数以 `fa` 开头 → 当成 Font Awesome 图标，并把该参数换成
 *      `icon-padding` 类。
 *
 * @param {{ args: string[], content: () => object[], options: { noteStyle?: string } }} ctx
 * @returns {object[]}
 */
function renderNote(ctx) {
  const style = ctx.options.noteStyle || 'flat'
  const args = [...ctx.args]
  const last = args[args.length - 1]
  if (!NOTE_STYLES.has(last)) args.push(style)

  let icon = ''
  const maybeIcon = args[args.length - 2]
  if (maybeIcon && maybeIcon.startsWith('fa')) {
    icon = `<i class="note-icon ${maybeIcon}"></i>`
    args[args.length - 2] = 'icon-padding'
  }

  return [
    { type: 'html', value: `<div class="note ${args.join(' ')}">${icon}` },
    ...ctx.content(),
    { type: 'html', value: '</div>' },
  ]
}

/** `<!-- tab caption@icon --> … <!-- endtab -->` 的提取规则（与上游一致）。 */
const TAB_BLOCK_RE = /<!--\s*tab (.*?)\s*-->\n([\w\W\s\S]*?)<!--\s*endtab\s*-->/g

/**
 * `{% tabs name, activeIndex %}` / `{% subtabs %}` / `{% subsubtabs %}`
 *
 * 注意上游用 `<!-- endtab -->` 作为结束标记：fixture 里有两处写成
 * `<!-- endtab %}`（`%}` 误写），因此那两个 tab 会被**丢掉**——基准产物就是
 * 这样，本实现按同一正则照抄，保证与基准一致（见 P6-1 报告 §已知差异）。
 *
 * @param {object} ctx
 * @returns {object[]}
 */
function renderTabs(ctx) {
  const args = commaArgs(ctx.args)
  const tabName = args[0]
  const tabActive = Number(args[1]) || 0

  /** @type {Array<{ isActive: string, tabHref: string, content: string, nav: string }>} */
  const items = []
  let noDefault = true
  let tabId = 0
  let nav = ''

  const content = ctx.trimmedBody
  const re = new RegExp(TAB_BLOCK_RE.source, 'g')
  let match
  const matches = []
  while ((match = re.exec(content)) !== null) matches.push(match[1], match[2])

  for (let index = 0; index < matches.length; index += 2) {
    const tabParameters = matches[index].split('@')
    const postContent = matches[index + 1]
    let caption = tabParameters[0] || ''
    let iconClass = tabParameters[1] || ''

    tabId += 1
    const tabHref = `${tabName} ${tabId}`.toLowerCase().split(' ').join('-')

    if (caption.length === 0 && iconClass.length === 0) caption = `${tabName} ${tabId}`

    const onlyIcon = iconClass.length > 0 && caption.length === 0 ? ' style="text-align: center;"' : ''
    let iconHtml = ''
    if (iconClass.length > 0) iconHtml = `<i class="${iconClass.trim()}"${onlyIcon}></i>`

    let isActive = ''
    if ((tabActive > 0 && tabActive === tabId) || (tabActive === 0 && tabId === 1)) {
      isActive = ' active'
      noDefault = false
    }

    nav += `<button type="button" class="tab ${isActive}" data-href="${tabHref}">${iconHtml + caption.trim()}</button>`
    items.push({ isActive, tabHref, content: postContent.trim() })
  }

  const id = String(tabName).toLowerCase().split(' ').join('-')
  const nodes = [
    {
      type: 'html',
      value: `<div class="tabs" id="${id}"><ul class="nav-tabs${noDefault ? ' no-default' : ''}">${nav}</ul><div class="tab-contents">`,
    },
  ]

  for (const item of items) {
    nodes.push({ type: 'html', value: `<div class="tab-item-content${item.isActive}" id="${item.tabHref}">` })
    nodes.push(...ctx.md(item.content))
    nodes.push({ type: 'html', value: '</div>' })
  }

  nodes.push({
    type: 'html',
    value:
      '</div><div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  })

  return nodes
}

/** 拼出 hide 系列共用的内联 style 串。 */
function hideStyle(bg, color) {
  let group = 'style="'
  if (bg) group += `background-color: ${bg};`
  if (color) group += `color: ${color}`
  group += '"'
  return group
}

/**
 * `{% hideBlock display,bg,color %} … {% endhideBlock %}`
 *
 * @param {object} ctx
 * @returns {object[]}
 */
function renderHideBlock(ctx) {
  const parts = commaArgs(ctx.args)
  const display = parts[0] || 'Click'
  const bg = parts[1] || false
  const color = parts[2] || false

  return [
    {
      type: 'html',
      value: `<div class="hide-block"><button type="button" class="hide-button" ${hideStyle(bg, color)}>${display}\n    </button><div class="hide-content">`,
    },
    ...ctx.content(),
    { type: 'html', value: '</div></div>' },
  ]
}

/**
 * `{% hideToggle display,bg,color %} … {% endhideToggle %}`
 *
 * @param {object} ctx
 * @returns {object[]}
 */
function renderHideToggle(ctx) {
  const parts = commaArgs(ctx.args)
  const display = parts[0]
  const bg = parts[1] || false
  const color = parts[2] || false

  let border = ''
  if (bg) border = `style="border: 1px solid ${bg}"`

  return [
    {
      type: 'html',
      value: `<details class="toggle" ${border}><summary class="toggle-button" ${hideStyle(bg, color)}>${display}</summary><div class="toggle-content">`,
    },
    ...ctx.content(),
    { type: 'html', value: '</div></details>' },
  ]
}

/**
 * `{% folding [style,] title %} … {% endfolding %}`
 *
 * 上游把 `style` 原样塞进属性位（例如 `{% folding open, 标题 %}` → `<details … open>`），
 * 缺省时留下一个多余空格（`<details class="folding-tag" >`），照抄。
 *
 * @param {object} ctx
 * @returns {object[]}
 */
function renderFolding(ctx) {
  const parts = commaArgs(ctx.args)
  let style = ''
  let title = ''
  if (parts.length > 1) {
    style = parts[0].trim()
    title = parts[1].trim()
  } else if (parts.length > 0) {
    title = parts[0].trim()
  }

  return [
    {
      type: 'html',
      value: `<details class="folding-tag" ${style}><summary> ${title} </summary>\n              <div class='content'>\n              `,
    },
    ...ctx.content(),
    { type: 'html', value: `\n              </div>\n            </details>` },
  ]
}

/**
 * `{% checkbox [class,] text %}` / `{% radio [class,] text %}`
 *
 * 上游是自闭合 tag，`text` 参数会先过一遍 Markdown（所以会包 `<p>`）。
 * 这里按块级处理正是为了拿到「递归解析 + 保留 mdast」的能力。
 *
 * @param {object} ctx
 * @param {'checkbox' | 'radio'} inputType
 * @returns {object[]}
 */
function renderCheckable(ctx, inputType) {
  const parts = commaArgs(ctx.args)
  let cls = ''
  let text = ''
  let checked = false

  if (parts.length > 1) {
    cls = (parts[0] || '').trim()
    if (cls.length > 0) cls = ` ${cls}`
    if (cls.indexOf('checked') > -1) checked = true
    text = (parts[1] || '').trim()
  } else if (parts.length > 0) {
    text = (parts[0] || '').trim()
  }

  if (text.length === 0) return []

  return [
    {
      type: 'html',
      value: `<div class='checkbox${cls}'><input type="${inputType}" ${checked ? 'checked="checked"' : ''}/>`,
    },
    ...ctx.content(text),
    { type: 'html', value: '</div>' },
  ]
}

/** `<!-- timeline title --> … <!-- endtimeline -->` 的提取规则（与上游一致）。 */
const TIMELINE_BLOCK_RE = /<!--\s*timeline (.*?)\s*-->\n([\w\W\s\S]*?)<!--\s*endtimeline\s*-->/g

/**
 * `{% timeline headline, color %} … {% endtimeline %}`
 *
 * @param {object} ctx
 * @returns {object[]}
 */
function renderTimeline(ctx) {
  const hasArgs = ctx.args.length > 0
  const parts = commaArgs(ctx.args)
  const color = hasArgs ? parts[1] : ''

  const nodes = [{ type: 'html', value: `<div class="timeline ${color}">` }]

  if (hasArgs) {
    nodes.push({
      type: 'html',
      value: `<div class='timeline-item headline'><div class='timeline-item-title'><div class='item-circle'>`,
    })
    nodes.push(...ctx.md(parts[0]))
    nodes.push({ type: 'html', value: `</div></div></div>` })
  }

  const re = new RegExp(TIMELINE_BLOCK_RE.source, 'g')
  const matches = []
  let match
  while ((match = re.exec(ctx.trimmedBody)) !== null) matches.push(match[1], match[2])

  for (let index = 0; index < matches.length; index += 2) {
    nodes.push({
      type: 'html',
      value: `<div class='timeline-item'><div class='timeline-item-title'><div class='item-circle'>`,
    })
    nodes.push(...ctx.md(matches[index]))
    nodes.push({ type: 'html', value: `</div></div><div class='timeline-item-content'>` })
    nodes.push(...ctx.md(matches[index + 1]))
    nodes.push({ type: 'html', value: `</div></div>` })
  }

  nodes.push({ type: 'html', value: '</div>' })
  return nodes
}

/**
 * 块级 tag 表：name → `{ ends?: boolean, render(ctx) }`。
 *
 * `ends: false` 用于上游注册为自闭合、但需要渲染参数 Markdown 的 checkbox / radio。
 */
export const blockTags = {
  note: { render: renderNote },
  subnote: { render: renderNote },
  tabs: { render: renderTabs },
  subtabs: { render: renderTabs },
  subsubtabs: { render: renderTabs },
  hideBlock: { render: renderHideBlock },
  hideToggle: { render: renderHideToggle },
  folding: { render: renderFolding },
  checkbox: { ends: false, render: (ctx) => renderCheckable(ctx, 'checkbox') },
  radio: { ends: false, render: (ctx) => renderCheckable(ctx, 'radio') },
  timeline: { render: renderTimeline },
}

/** 接受 `{% endxxx %}` 的 tag 名（元数据）。 */
export const blockTagNames = Object.keys(blockTags)
