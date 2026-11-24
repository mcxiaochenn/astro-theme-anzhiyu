/**
 * rehype-hexo-inline-p — 把段落内部的 `{% p %}` 从外层段落里拆出来。
 *
 * ## 为什么需要
 *
 * `{% p %}` 的输出是字面量 `<p class='p h2'>…</p>`（同上游 `scripts/tag/span.js`
 * 的 `postP`）。它出现在句子中间时，上游产物是**非法嵌套**：
 *
 *     <p>段落标签：<p class='p h2'>…</p>。</p>
 *
 * Hexo 把这段字符串直接写进页面、不再解析，所以基准产物就是这个形态。
 * 我们的链路里 HTML 一定会被 `rehype-raw`（底层的 parse5）重新解析，而 parse5
 * 的规则是：`<p>` 开始标签关闭外层 p，末尾游离的 `</p>` 再**凭空补一个空
 * `<p></p>`**。于是产物变成
 *
 *     <p>段落标签：</p><p class="p h2">…</p>。<p></p>
 *
 * 那个空 `<p>` 是解析器补出来的（浏览器打开基准页也这样），但
 * `scripts/diff-html.mjs` 对基准里的游离 `</p>` 是「丢弃 + warning」，不会造出
 * 空 p，于是我们多一个节点、后续兄弟段落的下标整体后移，滚成一串差异。
 *
 * ## 做法
 *
 * hast 序列化永远输出平衡标签，字面量复刻非法嵌套做不到。这里改为让**归一化
 * 后的结构**与基准一致：按块级 `<p>` 把外层段落切开，前段仍是 `<p>`，tag 自己
 * 升为兄弟，tag 之后的内容（含 Markdown 内联产物）也一起提升为兄弟：
 *
 *     <p>段落标签：</p><p class="p h2">…</p>。
 *
 * 这段 HTML 合法，parse5 不会再补空 p；归一化后与基准同为
 * `p / p.p.h2 / 裸文本「。」`。提升而不是重新序列化，Markdown 内联格式
 * （`**粗体**`、链接、其它行内 tag）全部原样保留。
 *
 * ## 挂载位置
 *
 * 必须挂 `rehypePlugins`：`@astrojs/markdown-remark` 里用户插件跑在
 * `rehype-raw` **之前**，此时 `{% p %}` 的 HTML 还是 `raw` 节点，段落尚未被
 * parse5 拆开。挂到 remark 阶段做不到——那里连 HTML 树都还没有。
 *
 * @module remark-hexo-tag/rehype-inline-p
 */

/** 行首就是块级 `<p>`（排除 `<pre>` / `<picture>` 之类）。 */
const BLOCK_P_OPEN_RE = /^<p(?=[\s>/])/i

/** 单个 `<p …>` / `</p>` 词法，用来配对深度。 */
const P_TOKEN_RE = /<\/?p(?=[\s>/])[^>]*>/gi

/**
 * 判断一个 hast 节点是不是「块级 `<p>` 的起始 raw 节点」。
 *
 * @param {object} node
 * @returns {boolean}
 */
function isBlockPStart(node) {
  return node?.type === 'raw' && BLOCK_P_OPEN_RE.test(String(node.value).trim())
}

/**
 * 从一个段落的孩子里，把 `index` 起的块级 `<p>`（含正文和闭合标签）收成一段
 * HTML 字符串。
 *
 * `{% p %}` 的 HTML 在 remark 阶段是一个整体字符串，但经过 micromark 的内联
 * 词法后会被切成 `raw("<p …>") / text / raw("</p>")` 三个节点，所以这里按
 * `<p>` 深度配对，直到闭合为止。
 *
 * 遇到普通元素（`strong`、`a`…）就放弃：那种情况不属于 `{% p %}` 的输出，
 * 保持原样更安全。
 *
 * @param {object[]} children
 * @param {number} start
 * @returns {{ html: string, next: number } | null}
 */
function takeBlockP(children, start) {
  let depth = 0
  let html = ''
  let index = start

  while (index < children.length) {
    const child = children[index]

    if (child.type === 'raw') {
      html += child.value
      for (const token of String(child.value).match(P_TOKEN_RE) || []) {
        depth += token.startsWith('</') ? -1 : 1
      }
      index += 1
      if (depth <= 0) return { html, next: index }
      continue
    }

    if (child.type === 'text') {
      html += child.value
      index += 1
      continue
    }

    return null
  }

  // 没配到闭合标签：不是我们生成的完整块，交给调用方保持原样
  return null
}

/**
 * 把一个含块级 `<p>` 的段落拆成兄弟节点数组。
 *
 * @param {object} paragraph
 * @returns {object[]}
 */
function splitParagraph(paragraph) {
  /** @type {object[]} */
  const out = []
  /** 当前这段普通内容：第一段包成 `<p>`，之后的内容直接提升为兄弟。 */
  let segment = []
  let headDone = false
  let index = 0

  /** 把 `segment` 落成节点：第一段是段落，后续段是裸兄弟。 */
  const flush = () => {
    if (!headDone) {
      headDone = true
      // 第一段即使为空也要保留 `<p>`：上游 `<p><p class='p x'>…</p></p>` 的外层
      // 段落就是空的，基准归一化后同样有一个空 `<p>`。
      out.push({
        type: 'element',
        tagName: paragraph.tagName,
        properties: { ...paragraph.properties },
        children: segment,
      })
    } else {
      out.push(...segment)
    }
    segment = []
  }

  while (index < paragraph.children.length) {
    const child = paragraph.children[index]

    if (isBlockPStart(child)) {
      const grabbed = takeBlockP(paragraph.children, index)
      if (grabbed) {
        flush()
        out.push({ type: 'raw', value: grabbed.html })
        index = grabbed.next
        continue
      }
    }

    segment.push(child)
    index += 1
  }

  // 收尾：tag 之后剩下的内容不包 `<p>`，直接提升（与基准归一化后的裸文本一致）；
  // 只有 tag 之前的内容还没有段落时才补段落。
  if (!headDone) flush()
  else out.push(...segment)

  return out
}

/**
 * rehype 插件：把段落内部的块级 `<p>` 拆成兄弟节点。
 *
 * @returns {(tree: object) => void}
 */
export default function rehypeHexoInlineP() {
  return function transformer(tree) {
    /** @param {object} node */
    const walk = (node) => {
      if (!Array.isArray(node.children)) return

      /** @type {object[]} */
      const next = []
      for (const child of node.children) {
        if (
          child.type === 'element' &&
          child.tagName === 'p' &&
          Array.isArray(child.children) &&
          child.children.some(isBlockPStart)
        ) {
          next.push(...splitParagraph(child))
          continue
        }
        walk(child)
        next.push(child)
      }
      node.children = next
    }

    walk(tree)
  }
}
