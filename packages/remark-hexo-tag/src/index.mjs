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
 * ## 未知 tag / 宽松模式
 *
 *   - 附录 B 的 42 个 tag（P6-1 行内/块级 24 + P6-2 媒体 11 + P6-3 第三方 7）全部有
 *     handler；
 *   - 严格模式（默认）：完全没见过的 tag、未闭合容器、错配的 end tag → **抛错**，
 *     带 `文件:行:列`；
 *   - `lenient: true`（宽松模式，供 Hexo 历史站迁移）：未闭合容器自动补齐
 *     `{% endX %}`、其余脏 tag 原样透传，均输出 warning，绝不因内容语法中断构建。
 *     严格模式行为与单测零回归。
 *
 * @module remark-hexo-tag
 */

import { scanTags } from './parser.mjs'
import { trimBlockBody } from './runtime.mjs'

/**
 * 配套的 rehype 插件（拆 `{% p %}` 的外层段落），见 rehype-inline-p.mjs。
 * 挂在 `rehypePlugins` 里，必须与 remark 插件成对使用。
 */
export { default as rehypeHexoInlineP } from './rehype-inline-p.mjs'
import { inlineTags } from './tags/inline/index.mjs'
import { blockTags } from './tags/block/index.mjs'
import { mediaTags, mediaBlockTags } from './tags/media/index.mjs'
import { thirdPartyTags, thirdPartyBlockTags } from './tags/thirdparty/index.mjs'

/**
 * 上游 42 个 tag 现已全部实现（P6-1 行内/块级 24 + P6-2 媒体 11 + P6-3 第三方 7）。
 * 不再有「已注册但未实现」的透传名单：任何 registry 里没有的 tag 都按拼写错误抛错。
 */

/** `<!--hexo-tag-12-->` 形式的占位符。 */
const PLACEHOLDER_RE = /^<!--hexo-tag-(\d+)-->$/

/**
 * 全部行内 / 块级 tag（三个模块的并集）。
 *
 * @param {string} name
 * @returns {{ kind: 'inline' | 'block', ends?: boolean } | null}
 */
function resolveTag(name) {
  if (inlineTags[name] || mediaTags[name] || thirdPartyTags[name]) return { kind: 'inline' }
  const block = blockTags[name] || mediaBlockTags[name] || thirdPartyBlockTags[name]
  if (block) return { kind: 'block', ends: block.ends !== false }
  return null
}

/**
 * 展开行内 tag。
 *
 * @param {object} node
 * @param {object} ctx
 * @returns {string}
 */
function renderInline(node, ctx) {
  const handler = inlineTags[node.name] || mediaTags[node.name] || thirdPartyTags[node.name]
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
/** 在三个 registry 里查块级 tag。 */
function lookupBlock(name) {
  return blockTags[name] || mediaBlockTags[name] || thirdPartyBlockTags[name]
}

/** 构造传给块级 handler 的上下文。 */
function blockContext(node, ctx) {
  const trimmedBody = trimBlockBody(node.body)
  return {
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
    /** 只展开 tag、不解析 Markdown（videos / sitegroup / btns 上游就是直接拼 content）。 */
    raw: (markdown) => ctx.raw(markdown === undefined ? trimmedBody : markdown),
    options: ctx.options,
  }
}

/**
 * 渲染块级 tag，返回 mdast 节点数组。
 *
 * `entry.string: true` 的自闭合 tag（site / cell / bilibili / intCard）直接返回
 * 一段 HTML 字符串，这里包成一个 html 节点。
 *
 * @param {object} node
 * @param {object} ctx
 * @returns {object[]}
 */
function renderBlock(node, ctx) {
  const entry = lookupBlock(node.name)
  const api = blockContext(node, ctx)
  if (entry.string) return [{ type: 'html', value: entry.render(api) }]
  return entry.render(api)
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
  const nodes = scanTags(markdown, {
    resolve: ctx.resolve,
    fileLabel: ctx.fileLabel,
    lenient: ctx.options.lenient,
    onWarning: ctx.options.onWarning,
  })

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

    const id = String((ctx.uid += 1))
    placeholders.set(id, node)
    source += `\n\n<!--hexo-tag-${id}-->\n\n`
  }

  const tree = ctx.parse(source)
  if (placeholders.size > 0) replacePlaceholders(tree, placeholders, ctx)
  return tree.children
}

/**
 * 只展开 tag、不解析 Markdown。
 *
 * 上游 `postVideos` / `postSiteCardGroup` / `postBtns` 都是把 `content` 原样拼进
 * HTML（嵌套 tag 由 Nunjucks 先渲染，Markdown 语法保持字面量），所以这里不能走
 * `ctx.md`。返回字符串，由调用方包进一个 `html` 节点。
 *
 * 已知限制：区域内若出现**容器型** tag，会保持原文（`ctx.md` 才能递归渲染容器），
 * fixtures 与常见用法里这三类 tag 的正文只含行内 tag。
 *
 * @param {string} markdown
 * @param {object} ctx
 * @returns {string}
 */
function renderRaw(markdown, ctx) {
  const nodes = scanTags(markdown, {
    resolve: ctx.resolve,
    fileLabel: ctx.fileLabel,
    lenient: ctx.options.lenient,
    onWarning: ctx.options.onWarning,
  })
  let output = ''
  for (const node of nodes) {
    if (node.type === 'text') {
      output += node.value
      continue
    }
    if (node.type === 'inline') {
      output += renderInline(node, ctx)
      continue
    }
    // `site` / `cell` 这类「字符串块级」自闭合 tag 也要在 raw 区域里展开，
    // 否则 sitegroup / btns 的正文会残留 `{% site %}`。
    const entry = lookupBlock(node.name)
    if (entry && entry.ends === false && entry.string) {
      output += entry.render(blockContext(node, ctx))
      continue
    }
    output += node.raw
  }
  return output
}

/**
 * remark 插件入口。
 *
 * @param {{
 *   noteStyle?: 'flat' | 'modern' | 'simple' | 'disabled',
 *   loadMoreText?: string,
 *   favicon?: string,
 *   flinkErrorImg?: string,
 *   lenient?: boolean,
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
    // 上游 `theme.config.yml` / `languages/zh-CN.yml` 的默认值（基准站配置）
    loadMoreText: '加载更多',
    favicon: '/favicon.ico',
    flinkErrorImg: '/img/friend_404.gif',
    // 严格模式（默认）。宽松模式供 Hexo 历史站迁移：脏 tag 不抛错，见 parser.mjs。
    lenient: false,
    onWarning: (message) => console.warn(message),
    ...options,
  }

  // 宽松模式下同一条 warning（含 文件:行:列）只输出一次，避免历史脏内容刷屏；
  // 去重表放在工厂级，跨文件、跨容器递归共享。
  const warned = new Set()
  const emitWarning = config.onWarning
  config.onWarning = (message) => {
    if (warned.has(message)) return
    warned.add(message)
    emitWarning(message)
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

    /** @type {object} */
    const ctx = {
      options: config,
      fileLabel,
      resolve: resolveTag,
      uid: 0,
      parse: (markdown) => processor.parse(markdown),
      md: (markdown) => renderMarkdown(markdown, ctx),
      raw: (markdown) => renderRaw(markdown, ctx),
    }

    tree.children = ctx.md(source)
  }
}
