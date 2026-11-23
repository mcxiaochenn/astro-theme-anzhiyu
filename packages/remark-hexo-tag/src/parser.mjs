/**
 * Hexo tag 词法/语法扫描。
 *
 * 只负责「把 `{% name args %}…{% endname %}` 从 Markdown 原文里切出来」，
 * 不关心具体 tag 怎么渲染。三个硬性要求：
 *
 *   1. **支持嵌套**：容器 tag 可以套容器 tag，同名 tag 也能套（Hexo 的 Nunjucks
 *      实现其实不支持同名嵌套，但真实文章里出现过，这里按计数配对，行为更宽容）。
 *   2. **未知 tag 必须报错**：带文件路径 + `行:列`，绝不静默吞掉。
 *   3. **自闭合 / 容器**由调用方的 `resolve()` 决定：`ends: false` 的按行内处理，
 *      `ends: true` 的必须找到配对的 `{% endname %}`。
 *
 * 产出的节点（供 index.mjs 展开）：
 *
 *   { type: 'text', value, start, end }
 *   { type: 'inline', name, args, kwargs, rawArgs, raw, start, end }
 *   { type: 'block', name, args, kwargs, rawArgs, raw, body, bodyStart, start, end, passthrough }
 *
 * @module remark-hexo-tag/parser
 */

/** `{% name ... %}` 的头部解析。 */
const HEADER_RE = /^\s*([A-Za-z_][A-Za-z0-9_-]*)([\s\S]*)$/

/**
 * 解析 tag 参数串。
 *
 * Hexo 的 `args` 是 Nunjucks 词法器按空白切出来的 token 数组（引号内空格不断开）。
 * 本批 fixture 只用到位置参数，但计划里要求支持 `key=value` 与引号，所以额外给出
 * `kwargs`；tag 实现仍然只消费 `args`（与上游一致）。
 *
 * @param {string} raw 例如 `info fa-bell` / `/about/, 前往关于页, foo`
 * @returns {{ args: string[], kwargs: Record<string, string> }}
 */
export function parseArgs(raw) {
  /** @type {string[]} */
  const args = []
  /** @type {Record<string, string>} */
  const kwargs = Object.create(null)

  let index = 0
  const length = raw.length

  while (index < length) {
    while (index < length && /\s/.test(raw[index])) index += 1
    if (index >= length) break

    let token = ''
    let quote = ''
    let key = ''
    let hasKey = false

    while (index < length) {
      const char = raw[index]

      if (quote) {
        if (char === '\\' && index + 1 < length) {
          token += raw[index + 1]
          index += 2
          continue
        }
        if (char === quote) {
          quote = ''
          index += 1
          continue
        }
        token += char
        index += 1
        continue
      }

      if (char === '"' || char === "'") {
        quote = char
        index += 1
        continue
      }
      if (/\s/.test(char)) break
      if (char === '=' && !hasKey && token.length > 0) {
        key = token
        token = ''
        hasKey = true
        index += 1
        continue
      }

      token += char
      index += 1
    }

    if (hasKey) kwargs[key] = token
    else args.push(token)
  }

  return { args, kwargs }
}

/** 1 基的行列号（用于报错信息）。 */
export function positionOf(source, offset) {
  let line = 1
  let column = 1
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

/** 统一的报错构造，保证每条消息都带 `文件 行:列` 与出错 tag 名。 */
function tagError(message, source, offset, fileLabel) {
  const { line, column } = positionOf(source, offset)
  return new Error(`[remark-hexo-tag] ${message} (${fileLabel}:${line}:${column})`)
}

/**
 * 扫描整段 Markdown。
 *
 * @param {string} source
 * @param {{
 *   resolve: (name: string) => ({ kind: 'inline' | 'block', ends?: boolean, passthrough?: boolean } | null),
 *   fileLabel?: string,
 * }} options
 * @returns {Array<object>} 顶层节点列表
 */
export function scanTags(source, { resolve, fileLabel = '<unknown file>' }) {
  /** @type {Array<object>} 顶层节点 */
  const nodes = []
  /** @type {Array<object>} 容器 tag 的栈（root 不占栈） */
  const stack = []

  let textStart = 0
  let cursor = 0

  const flushText = (end) => {
    if (end > textStart) {
      nodes.push({ type: 'text', value: source.slice(textStart, end), start: textStart, end })
    }
  }

  while (cursor < source.length) {
    const open = source.indexOf('{%', cursor)
    if (open === -1) break

    let innerStart = open + 2
    if (source[innerStart] === '-') innerStart += 1

    const close = source.indexOf('%}', innerStart)
    if (close === -1) {
      throw tagError('Unterminated Hexo tag: missing `%}`', source, open, fileLabel)
    }

    let inner = source.slice(innerStart, close)
    if (inner.endsWith('-')) inner = inner.slice(0, -1)

    const header = HEADER_RE.exec(inner)
    if (!header) {
      throw tagError(`Malformed Hexo tag \`{%${inner}%}\`: missing tag name`, source, open, fileLabel)
    }

    const name = header[1]
    const rawArgs = header[2].trim()
    const tagEnd = close + 2
    const raw = source.slice(open, tagEnd)
    const endMatch = /^end([A-Za-z_][A-Za-z0-9_-]*)$/.exec(name)

    // ── 结束标签 ────────────────────────────────────────────────────────────
    if (endMatch) {
      const expected = endMatch[1]
      const frame = stack.pop()
      if (!frame) {
        throw tagError(`Unexpected \`{% ${name} %}\`: no matching open tag`, source, open, fileLabel)
      }
      if (frame.name !== expected) {
        throw tagError(
          `Mismatched \`{% ${name} %}\`: expected \`{% end${frame.name} %}\` ` +
            `for the tag opened at ${positionOf(source, frame.start).line}:${positionOf(source, frame.start).column}`,
          source,
          open,
          fileLabel,
        )
      }

      const body = source.slice(frame.bodyStart, open)
      if (stack.length === 0) {
        nodes.push({
          type: 'block',
          name: frame.name,
          args: frame.args,
          kwargs: frame.kwargs,
          rawArgs: frame.rawArgs,
          raw: source.slice(frame.start, tagEnd),
          body,
          bodyStart: frame.bodyStart,
          start: frame.start,
          end: tagEnd,
          passthrough: frame.passthrough,
        })
      }
      // 嵌套容器：正文稍后由父级的 body 递归处理，这里不单独产出节点

      cursor = tagEnd
      textStart = tagEnd
      continue
    }

    // ── 开始标签 ────────────────────────────────────────────────────────────
    const spec = resolve(name)
    if (!spec) {
      throw tagError(
        `Unknown Hexo tag \`{% ${name} %}\`. ` +
          'Known tags live in src/tags/{inline,block,media,thirdparty}.',
        source,
        open,
        fileLabel,
      )
    }

    const { args, kwargs } = parseArgs(rawArgs)

    if (spec.kind === 'inline') {
      // 容器正文内部的行内 tag 不在这里处理：父级会拿 body 原文重新扫描。
      if (stack.length === 0) {
        flushText(open)
        nodes.push({
          type: 'inline',
          name,
          args,
          kwargs,
          rawArgs,
          raw,
          start: open,
          end: tagEnd,
          passthrough: Boolean(spec.passthrough),
        })
        textStart = tagEnd
      }
      cursor = tagEnd
      continue
    }

    // 块级容器：`ends: false` 的自闭合块（checkbox / radio）立即出栈，
    // 其余入栈等待 `{% endname %}`。
    if (spec.ends === false) {
      if (stack.length === 0) {
        flushText(open)
        nodes.push({
          type: 'block',
          name,
          args,
          kwargs,
          rawArgs,
          raw,
          body: '',
          bodyStart: tagEnd,
          start: open,
          end: tagEnd,
          passthrough: Boolean(spec.passthrough),
        })
        textStart = tagEnd
      }
      cursor = tagEnd
      continue
    }

    if (stack.length === 0) flushText(open)
    stack.push({
      name,
      args,
      kwargs,
      rawArgs,
      start: open,
      bodyStart: tagEnd,
      passthrough: Boolean(spec.passthrough),
    })
    cursor = tagEnd
  }

  if (stack.length > 0) {
    const frame = stack[stack.length - 1]
    throw tagError(
      `Unclosed Hexo tag \`{% ${frame.name} %}\`: missing \`{% end${frame.name} %}\``,
      source,
      frame.start,
      fileLabel,
    )
  }

  flushText(source.length)
  return nodes
}
