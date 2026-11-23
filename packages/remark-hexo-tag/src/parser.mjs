/**
 * Hexo tag 词法/语法扫描。
 *
 * 只负责「把 `{% name args %}…{% endname %}` 从 Markdown 原文里切出来」，
 * 不关心具体 tag 怎么渲染。三个硬性要求：
 *
 *   1. **支持嵌套**：容器 tag 可以套容器 tag，同名 tag 也能套（Hexo 的 Nunjucks
 *      实现其实不支持同名嵌套，但真实文章里出现过，这里按计数配对，行为更宽容）。
 *   2. **严格模式（默认）**：未知 tag 必须报错，带文件路径 + `行:列`，绝不静默吞掉；
 *      `lenient: true`（宽松模式）时未闭合容器自动补齐、其余脏 tag 原样透传并
 *      warning，供 Hexo 历史站迁移使用（见 scanTags 的 JSDoc）。
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

    if (hasKey) {
      // Hexo 的 `args` 里 `key=value` 仍然是普通 token（上游 tag 直接遍历 args 取
      // `alt=` / `url=`），所以既放进 kwargs，也按 `key=value` 原样留在 args。
      kwargs[key] = token
      args.push(`${key}=${token}`)
    } else {
      args.push(token)
    }
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
 * 默认（严格模式）：未知 tag / 未闭合容器 / 错配 end tag 一律抛错，带
 * `文件:行:列`（见文件头「三个硬性要求」）。
 *
 * `lenient: true`（宽松模式，供迁移站的历史脏内容使用）：
 *   - 未闭合的块级容器 → 隐式补齐 `{% endX %}`（产出节点，正文到文末），并 warning；
 *   - 未知 tag / 孤立或错配的 end tag / 未终止 / 格式错误 → **原样透传**（保留
 *     `{% … %}` 字面量），并 warning；
 *   - 绝不会因为内容里的 tag 语法错误中断构建。
 * 严格模式的行为与报错文案完全不变（59/59 单测守护）。
 *
 * @param {string} source
 * @param {{
 *   resolve: (name: string) => ({ kind: 'inline' | 'block', ends?: boolean, passthrough?: boolean } | null),
 *   fileLabel?: string,
 *   lenient?: boolean,
 *   onWarning?: (message: string) => void,
 * }} options
 * @returns {Array<object>} 顶层节点列表
 */
export function scanTags(source, { resolve, fileLabel = '<unknown file>', lenient = false, onWarning }) {
  /** @type {Array<object>} 顶层节点 */
  const nodes = []
  /** @type {Array<object>} 容器 tag 的栈（root 不占栈） */
  const stack = []

  let textStart = 0
  let cursor = 0

  /** 宽松模式下的 warning（带 文件:行:列），由插件工厂注入的回调去重后输出。 */
  const warn = (message, offset) => {
    if (typeof onWarning !== 'function') return
    const { line, column } = positionOf(source, offset)
    onWarning(`[remark-hexo-tag][lenient] ${message} (${fileLabel}:${line}:${column})`)
  }

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
      if (!lenient) throw tagError('Unterminated Hexo tag: missing `%}`', source, open, fileLabel)
      warn('未终止的 Hexo tag（缺少 `%}`），按原文透传', open)
      // 直接结束扫描：textStart 之后的全部内容（含这个 `{%`）由结尾的
      // flushText 原样输出；若此时还有未闭合容器，结尾逻辑会一并补齐。
      break
    }

    let inner = source.slice(innerStart, close)
    if (inner.endsWith('-')) inner = inner.slice(0, -1)

    const header = HEADER_RE.exec(inner)
    if (!header) {
      if (!lenient) {
        throw tagError(`Malformed Hexo tag \`{%${inner}%}\`: missing tag name`, source, open, fileLabel)
      }
      warn(`格式错误的 Hexo tag \`{%${inner}%}\`（缺少 tag 名），按原文透传`, open)
      cursor = close + 2
      continue
    }

    const name = header[1]
    const rawArgs = header[2].trim()
    const tagEnd = close + 2
    const raw = source.slice(open, tagEnd)
    const endMatch = /^end([A-Za-z_][A-Za-z0-9_-]*)$/.exec(name)

    // ── 结束标签 ────────────────────────────────────────────────────────────
    if (endMatch) {
      const expected = endMatch[1]
      // 先 peek 再 pop：宽松模式下遇到孤立 / 错配 end tag 要保留栈顶容器，
      // 让后续真正的 `{% endX %}` 还能配对。严格模式的报错文案保持完全一致。
      const top = stack[stack.length - 1]
      if (!top) {
        if (!lenient) {
          throw tagError(`Unexpected \`{% ${name} %}\`: no matching open tag`, source, open, fileLabel)
        }
        warn(`孤立的 \`{% ${name} %}\`（没有匹配的开始 tag），按原文透传`, open)
        cursor = tagEnd
        continue
      }
      if (top.name !== expected) {
        if (!lenient) {
          throw tagError(
            `Mismatched \`{% ${name} %}\`: expected \`{% end${top.name} %}\` ` +
              `for the tag opened at ${positionOf(source, top.start).line}:${positionOf(source, top.start).column}`,
            source,
            open,
            fileLabel,
          )
        }
        warn(`错配的 \`{% ${name} %}\`（期望 \`{% end${top.name} %}\`），按原文透传`, open)
        cursor = tagEnd
        continue
      }
      const frame = stack.pop()

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
      if (!lenient) {
        throw tagError(
          `Unknown Hexo tag \`{% ${name} %}\`. ` +
            'Known tags live in src/tags/{inline,block,media,thirdparty}.',
          source,
          open,
          fileLabel,
        )
      }
      warn(`未知的 Hexo tag \`{% ${name} %}\`，按原文透传`, open)
      cursor = tagEnd
      continue
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
    if (!lenient) {
      throw tagError(
        `Unclosed Hexo tag \`{% ${frame.name} %}\`: missing \`{% end${frame.name} %}\``,
        source,
        frame.start,
        fileLabel,
      )
    }

    // 宽松模式：为每个未闭合容器隐式补齐 `{% endX %}`（warning）。
    // 只产出「最外层」一个 block 节点，正文一直延伸到文末；内层未闭合容器
    // 会在 body 递归（ctx.md，同样是宽松模式）时被同样地补齐，效果等价于
    // 在文末按栈的逆序追加了所有 `{% endX %}`。
    for (const open of stack) {
      warn(`未闭合的 Hexo tag \`{% ${open.name} %}\`，自动补齐 \`{% end${open.name} %}\``, open.start)
    }
    const outer = stack[0]
    nodes.push({
      type: 'block',
      name: outer.name,
      args: outer.args,
      kwargs: outer.kwargs,
      rawArgs: outer.rawArgs,
      raw: source.slice(outer.start, source.length),
      body: source.slice(outer.bodyStart, source.length),
      bodyStart: outer.bodyStart,
      start: outer.start,
      end: source.length,
      passthrough: outer.passthrough,
    })
    // 阻止结尾的 flushText 把外层容器正文（已由 block 节点承载）重复成 text。
    textStart = source.length
  }

  flushText(source.length)
  return nodes
}
