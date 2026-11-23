/**
 * remark-hexo-tag — 在 remark 阶段还原 Hexo 的 `{% tag %}` 语法。
 *
 * ## 为什么不直接「正则替换成 HTML 字符串」
 *
 * 上游 Hexo 的执行顺序是：
 *
 *   markdown 原文 --(tag 渲染)--> 含 HTML 的 markdown --(marked)--> HTML
 *
 * 容器 tag 的正文会被单独 `renderSync({ engine: 'markdown' })` 渲染成 HTML，再拼回
 * 外层 markdown。在 remark 里如果照抄「字符串拼 HTML」，容器正文的 Markdown
 * （`**bold**`、嵌套 tag、列表…）就得自己再实现一遍 Markdown 渲染。
 *
 * 所以这里的做法是：
 *
 *   1. 扫描原文，把 **行内 tag** 直接展开成 HTML 文本（行内内容上游不过 Markdown）；
 *   2. 把 **块级 tag** 换成一个独立的 HTML 注释占位符，原文其余部分保持不变；
 *   3. 用 `this.parse()` 解析成 mdast（Markdown 结构完整保留）；
 *   4. 把占位符节点替换成 `[html(开标签), ...容器正文的 mdast, html(闭标签)]`；
 *      容器正文用同一套流程递归处理（`ctx.md`），因此嵌套 tag 天然支持。
 *
 * 最后 `remark-rehype` + `rehype-raw` 会把 `html` 节点解析成正常 DOM。
 *
 * ## 未知 tag
 *
 *   - 上游注册过、但本批未实现的 tag（media / thirdparty 两组）→ **原样透传** +
 *     构建期 warning（一次性，带文件与行号），保证其它文章不被拖垮；
 *   - 完全没见过的 tag、未闭合容器、错配的 end tag → **抛错**，带 `文件:行:列`。
 *
 * @module remark-hexo-tag
 */

import { positionOf, scanTags } from './parser.mjs'
import { trimBlockBody } from './runtime.mjs'
import { inlineTags } from './tags/inline/index.mjs'
import { blockTags } from './tags/block/index.mjs'
import { mediaTags, mediaBlockTags } from './tags/media/index.mjs'
import { thirdPartyTags, thirdPartyBlockTags } from './tags/thirdparty/index.mjs'

/**
 * 上游已注册、本批尚未实现的 tag。
 *
 * 名单来自 `D:/Git-project/_research/anzhiyu-upstream/scripts/tag/` 的
 * `hexo.extend.tag.register(...)` 全集（附录 B 的 42 个），减去本批已实现的 25 个：
 *   - media（P6-2，11 个）
 *   - thirdparty（P6-3，7 个）
 *
 * 落地某个 tag 后，把名字从下面两张表删掉，并在对应的
 * `tags/{media,thirdparty}/index.mjs` 里补 handler 即可。
 */
const PENDING_INLINE = new Set([
  // media（P6-2）
  'image',
  'inlineimage',
  'audio',
  'video',
  'galleryGroup',
  'site',
  'cell',
  // thirdparty（P6-3）
  'link',
  'bilibili',
  'dogeplayer',
  'intCard',
])

const PENDING_BLOCK = new Set([
  // media（P6-2）
  'videos',
  'gallery',
  'sitegroup',
  'btns',
  // thirdparty（P6-3）
  'mermaid',
  'flink',
  'tip',
])

/** `<!--hexo-tag-12-->` 形式的占位符。 */
const PLACEHOLDER_RE = /^<!--hexo-tag-(\d+)-->$/

/**
 * 把 tag 名解析成渲染规格。
 *
 * @param {string} name
 * @returns {{ kind: 'inline' | 'block', ends?: boolean, passthrough?: boolean } | null}
 */
function createResolver() {
  return (name) => {
    if (inlineTags[name]) return { kind: 'inline' }
    if (blockTags[name]) return { kind: 'block', ends: blockTags[name].ends !== false }
    if (mediaTags[name] || thirdPartyTags[name]) return { kind: 'inline' }
    if (mediaBlockTags[name] || thirdPartyBlockTags[name]) return { kind: 'block', ends: true }
    if (PENDING_INLINE.has(name)) return { kind: 'inline', passthrough: true }
    if (PENDING_BLOCK.has(name)) return { kind: 'block', ends: true, passthrough: true }
    return null
  }
}

/**
 * 展开行内 tag。
 *
 * @param {object} node
 * @param {object} ctx
 * @returns {string}
 */
function renderInline(node, ctx) {
  if (node.passthrough) {
    ctx.warnPending(node.name, node.start)
    return node.raw
  }
  const handler = inlineTags[node.name]
  return handler({
    tag: node.name,
    args: node.args,
    kwargs: node.kwargs,
    rawArgs: node.rawArgs,
    options: ctx.options,
  })
}

/**
 * 渲染块级 tag，返回 mdast 节点数组。
 *
 * @param {object} node
 * @param {object} ctx
 * @returns {object[]}
 */
function renderBlock(node, ctx) {
  if (node.passthrough) {
    ctx.warnPending(node.name, node.start)
    return [{ type: 'text', value: node.raw }]
  }

  const entry = blockTags[node.name]
  const trimmedBody = trimBlockBody(node.body)

  return entry.render({
    tag: node.name,
    args: node.args,
    kwargs: node.kwargs,
    rawArgs: node.rawArgs,
    body: node.body,
    trimmedBody,
    /** 解析容器正文；不传参数时用去掉缩进/首尾空行的 body。 */
    content: (markdown) => ctx.md(markdown === undefined ? trimmedBody : markdown),
    /** 解析任意 markdown 片段（用于标签自己切出来的小段，如 tab 标题）。 */
    md: ctx.md,
    options: ctx.options,
  })
}

/**
 * 把 mdast 里的占位符换成真正的块级结构。占位符在 `this.parse()` 之后是
 * `{ type: 'html', value: '<!--hexo-tag-N-->' }`（独立成块时）或
 * 段落里的一个 inline html 节点，两种位置都要能替换。
 *
 * @param {object} node
 * @param {Map<string, object>} placeholders
 * @param {object} ctx
 */
function replacePlaceholders(node, placeholders, ctx) {
  if (!Array.isArray(node.children)) return

  /** @type {object[]} */
  const next = []
  for (const child of node.children) {
    if (child.type === 'html' || child.type === 'raw') {
      const matched = PLACEHOLDER_RE.exec(String(child.value).trim())
      if (matched && placeholders.has(matched[1])) {
        next.push(...renderBlock(placeholders.get(matched[1]), ctx))
        continue
      }
    }
    replacePlaceholders(child, placeholders, ctx)
    next.push(child)
  }
  node.children = next
}

/**
 * 解析一段 Markdown（可能含 tag），返回 mdast 子节点数组。
 *
 * @param {string} markdown
 * @param {object} ctx
 * @returns {object[]}
 */
function renderMarkdown(markdown, ctx) {
  const nodes = scanTags(markdown, { resolve: ctx.resolve, fileLabel: ctx.fileLabel })

  let source = ''
  /** @type {Map<string, object>} */
  const placeholders = new Map()

  for (const node of nodes) {
    if (node.type === 'text') {
      source += node.value
      continue
    }
    if (node.type === 'inline') {
      source += renderInline(node, ctx)
      continue
    }

    // 块级容器 / 容器型待实现 tag
    if (node.passthrough) {
      ctx.warnPending(node.name, node.start)
      source += node.raw
      continue
    }
    const id = String((ctx.uid += 1))
    placeholders.set(id, node)
    source += `\n\n<!--hexo-tag-${id}-->\n\n`
  }

  const tree = ctx.parse(source)
  if (placeholders.size > 0) replacePlaceholders(tree, placeholders, ctx)
  return tree.children
}

/**
 * remark 插件入口。
 *
 * @param {{
 *   noteStyle?: 'flat' | 'modern' | 'simple' | 'disabled',
 *   onWarning?: (message: string) => void,
 * }} [options]
 * @returns {(tree: object, file?: object) => void}
 */
export default function remarkHexoTag(options = {}) {
  // unified 调用插件工厂时 `this` 是 Processor；返回的 transformer 执行时的 `this`
  // 是 undefined（trough 调用），所以必须在工厂阶段把 processor 抓下来，
  // 供后续 `processor.parse()` 递归解析容器正文。
  const processor = this

  const config = {
    noteStyle: 'flat',
    onWarning: (message) => console.warn(message),
    ...options,
  }

  if (!processor || typeof processor.parse !== 'function') {
    throw new Error(
      '[remark-hexo-tag] 必须以 unified/remark 插件方式注册（需要 processor.parse 递归解析容器正文）。',
    )
  }

  return function transformer(tree, file) {
    const source = file && typeof file.value === 'string' ? file.value : String(file ?? '')
    if (!source || !source.includes('{%')) return

    const fileLabel = String(file?.path || file?.history?.[0] || '<unknown file>')
    const warned = new Set()

    /** @type {object} */
    const ctx = {
      options: config,
      fileLabel,
      resolve: createResolver(),
      uid: 0,
      parse: (markdown) => processor.parse(markdown),
      md: (markdown) => renderMarkdown(markdown, ctx),
      warnPending(name, offset) {
        if (warned.has(name)) return
        warned.add(name)
        const { line, column } = positionOf(source, offset)
        config.onWarning(
          `[remark-hexo-tag] \`{% ${name} %}\` 尚未实现（P6-2 / P6-3），` +
            `已按原文透传（${fileLabel}:${line}:${column}）。`,
        )
      },
    }

    tree.children = ctx.md(source)
  }
}
