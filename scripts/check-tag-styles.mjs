#!/usr/bin/env node
/**
 * P6-7：Hexo tag 的样式命中验证。
 *
 * 目的：证明 42 个 `{% tag %}` 生成的 HTML 里的 class，能在上游样式源中找到规则，
 * 避免「标签渲染出来了、但没有样式」的静默退化。只读产物与 styl/css 源，不跑构建。
 *
 * 判定口径（与 docs/notes/P6-7-tag-styles.md 一致）：
 *   - 只看 class；元素选择器（`u`、`kbd` 这类）只作补充说明，不计入命中率；
 *   - 精确命中：class 本身出现在某条选择器里；
 *   - 仅语境命中：class 本身没有规则，但同一元素上的其它 class、或祖先元素的 class 有规则
 *     （例如 `.btn-anzhiyu.larger` 里 `larger` 没有独立规则，但 `.btn-anzhiyu` 有）；
 *   - 未命中：以上都不成立 → 退出码 1。
 *
 * 样式源范围：默认扫 `examples/blog/src/styles/upstream/` 全树（含 `_tags`、`_global`、
 * `_layout`，以及 `_extra/tag/*.css`、`_page/flink.styl` 这类被 tag 复用的规则）。
 * 上游并非把所有 tag 样式都放在 `_tags/`：link 在 `_extra/tag/link.css`，site 在
 * `_extra/tag/site.css` 与 `_page/flink.styl`，flink 在 `_page/flink.styl`。只扫 `_tags`
 * 会把它们误判成未命中，所以按整个 upstream 样式树统计，并单独标注命中来源目录。
 *
 * 另外，Stylus 的 `for $type in $color-types` 循环会在编译期生成 `.note.info` 之类的选择器，
 * 源文件里看不到字面量。这类 class 用构建产物 `dist/_astro/*.css` 做补充判定，单独统计为
 * 「编译展开命中」，不算精确命中，也不会被误报成未命中。
 *
 * 用法：
 *   node scripts/check-tag-styles.mjs            # 常规检查
 *   node scripts/check-tag-styles.mjs --strict   # 把「上游无规则」的 class 也判失败
 *   node scripts/check-tag-styles.mjs --verbose  # 逐 tag 打印精确命中的 class 清单
 *   node scripts/check-tag-styles.mjs --json     # 末尾追加机器可读结果（写报告用）
 *   DIST_DIR=... STYLE_ROOT=... node scripts/check-tag-styles.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.join(REPO_ROOT, 'examples', 'blog', 'dist')
const STYLE_ROOT = process.env.STYLE_ROOT
  ? path.resolve(process.env.STYLE_ROOT)
  : path.join(REPO_ROOT, 'examples', 'blog', 'src', 'styles', 'upstream')

const log = (...args) => console.log('[check-tag-styles]', ...args)
const warn = (...args) => console.warn('[check-tag-styles] WARN', ...args)
const fail = (message) => {
  console.error('[check-tag-styles] FAIL', message)
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/* 1. tag → 页面 / 分节 / 根元素 的映射表                                */
/* ------------------------------------------------------------------ */

/** 4 个 tag fixture 对应的产物页面（日期来自 docs/baseline.json）。 */
const PAGES = {
  inline: '2025/03/05/tags-inline',
  block: '2025/03/18/tags-block',
  media: '2025/04/01/tags-media',
  thirdparty: '2025/04/20/tags-thirdparty',
}

/** 空元素：没有闭合标签，不需要做子树平衡。 */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * 每个 tag 的定位方式：
 *   page     —— 在哪张 fixture 页面
 *   section  —— 分节 h2 的 id（按 fixture 的 `## 标题` 生成）
 *   root     —— 分节内根元素的起始标签正则
 *   pick     —— 同根 class 的多个实例里取第几个（0 起）；缺省取全部
 *   element  —— 无 class 的 tag 用于补充说明的元素名（仅统计，不参与命中判定）
 */
const TAG_SPECS = [
  /* —— 行内（12） —— */
  { name: 'u', page: 'inline', section: '六种行内修饰', root: /<u[\s>]/i, element: 'u' },
  { name: 'emp', page: 'inline', section: '六种行内修饰', root: /<emp[\s>]/i, element: 'emp' },
  { name: 'wavy', page: 'inline', section: '六种行内修饰', root: /<wavy[\s>]/i, element: 'wavy' },
  { name: 'del', page: 'inline', section: '六种行内修饰', root: /<del[\s>]/i, element: 'del' },
  { name: 'kbd', page: 'inline', section: '六种行内修饰', root: /<kbd[\s>]/i, element: 'kbd' },
  { name: 'psw', page: 'inline', section: '六种行内修饰', root: /<psw[\s>]/i, element: 'psw' },
  { name: 'label', page: 'inline', section: 'label', root: /<mark class="hl-label\b/i },
  { name: 'inlineImg', page: 'inline', section: '图片与图标', root: /<img class="inline-img\b/i },
  { name: 'icon', page: 'inline', section: '图片与图标', root: /<svg class="icon"/i },
  { name: 'btn', page: 'inline', section: '按钮', root: /<a class="btn-anzhiyu\b/i },
  { name: 'p', page: 'inline', section: 'p-与-span', root: /<p class="p\b/i },
  { name: 'span', page: 'inline', section: 'p-与-span', root: /<span class="p\b/i },

  /* —— 块级容器（12） —— */
  // note / subnote 共用 `.note` 根，按 fixture 顺序：前 4 个是 note，第 5 个是 subnote
  { name: 'note', page: 'block', section: 'note-系列', root: /<div class="note\b/i, pick: [0, 1, 2, 3] },
  { name: 'subnote', page: 'block', section: 'note-系列', root: /<div class="note\b/i, pick: [4] },
  // tabs / subtabs / subsubtabs 共用 `.tabs` 根，按出现顺序对应
  { name: 'tabs', page: 'block', section: 'tabs-系列', root: /<div class="tabs"/i, pick: [0] },
  { name: 'subtabs', page: 'block', section: 'tabs-系列', root: /<div class="tabs"/i, pick: [1] },
  { name: 'subsubtabs', page: 'block', section: 'tabs-系列', root: /<div class="tabs"/i, pick: [2] },
  { name: 'hideInline', page: 'block', section: 'hide-系列', root: /<span class="hide-inline"/i },
  { name: 'hideBlock', page: 'block', section: 'hide-系列', root: /<div class="hide-block"/i },
  { name: 'hideToggle', page: 'block', section: 'hide-系列', root: /<details class="toggle"/i },
  { name: 'folding', page: 'block', section: 'folding', root: /<details class="folding-tag"/i },
  { name: 'checkbox', page: 'block', section: 'checkbox-radio', root: /<div class=['"]checkbox\b/i, pick: [0, 1] },
  { name: 'radio', page: 'block', section: 'checkbox-radio', root: /<div class=['"]checkbox\b/i, pick: [2, 3] },
  { name: 'timeline', page: 'block', section: 'timeline', root: /<div class="timeline(?:\s|")/i },

  /* —— 媒体与卡片（11） —— */
  { name: 'image', page: 'media', section: 'image', root: /<div class="img-wrap"/i },
  { name: 'inlineimage', page: 'media', section: 'inlineimage', root: /<img[^>]*\bclass="inline"/i },
  { name: 'audio', page: 'media', section: 'audio-video', root: /<div class="audio"/i },
  { name: 'video', page: 'media', section: 'audio-video', root: /<div class="video"/i },
  { name: 'videos', page: 'media', section: 'videos', root: /<div class="videos"/i },
  { name: 'gallery', page: 'media', section: 'gallery', root: /<div class="gallery"/i },
  { name: 'galleryGroup', page: 'media', section: 'galleryGroup', root: /<figure class="gallery-group"/i },
  { name: 'site', page: 'media', section: 'site', root: /<a class="site-card"/i },
  { name: 'sitegroup', page: 'media', section: 'sitegroup', root: /<div class="site-card-group"/i },
  { name: 'btns', page: 'media', section: 'btns-cell', root: /<div class="btns\b/i },
  { name: 'cell', page: 'media', section: 'btns-cell', root: /<a class="button no-text-decoration"/i },

  /* —— 第三方嵌入与卡片（7） —— */
  { name: 'bilibili', page: 'thirdparty', section: 'bilibili', root: /<a[^>]*\bclass="bilibili_box"/i, toSectionEnd: true },
  { name: 'dogeplayer', page: 'thirdparty', section: 'dogeplayer', root: /<div id="player_/i },
  { name: 'mermaid', page: 'thirdparty', section: 'mermaid', root: /<div class="mermaid-wrap"/i },
  { name: 'tip', page: 'thirdparty', section: 'tip', root: /<div class="tip\b/i },
  { name: 'link', page: 'thirdparty', section: 'link', root: /<div class="anzhiyu-tag-link"/i },
  { name: 'intCard', page: 'thirdparty', section: 'intCard', root: /<div class="introduction-card"/i },
  { name: 'flink', page: 'thirdparty', section: 'flink', root: /<div class="flink"/i },
]

/* ------------------------------------------------------------------ */
/* 1.5 「上游本就没有样式」的白名单                                      */
/* ------------------------------------------------------------------ */

/**
 * 「上游本就没有样式」的 class 白名单（`tag:class`）。
 *
 * 判定依据（三者缺一不可）：
 *   1. 上游同版本模板 `_research/anzhiyu-upstream/scripts/tag/*.js` 输出的 class 与我们一致；
 *   2. `styles/upstream/` 全树（119 个 .styl/.css）搜不到该 class 的选择器；
 *   3. 上游构建产物 `.baseline-work/public/css/index.css` 与本地编译产物 `dist/_astro/*.css`
 *      里也没有该 class。
 *
 * 这些不是我们的 tag 写错 class，而是上游「只输出 class、不写规则」。默认只 WARN；
 * 加 `--strict` 时会和其它未命中一样判失败（用于将来上游补上样式后的收紧）。
 */
const UPSTREAM_UNSTYLED = new Map([
  ['image:img-wrap', 'image.js 输出 <div class="img-wrap">，上游无规则'],
  ['image:img-bg', 'image.js 输出 <div class="img-bg">，上游无规则'],
  ['image:image-caption', 'image.js 输出 <span class="image-caption">，上游无规则'],
  ['audio:audio', 'media.js 输出 <div class="audio">，上游只样式化 audio 元素'],
  ['link:anzhiyu-tag-link', "link.js 输出 <div class='anzhiyu-tag-link'>，上游无规则"],
])
const STRICT = process.argv.includes('--strict')
const VERBOSE = process.argv.includes('--verbose')

/* ------------------------------------------------------------------ */
/* 2. 样式源：选择器里的 class / 元素 token                              */
/* ------------------------------------------------------------------ */

/** 递归收集目录下的样式文件。 */
function walkStyleFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walkStyleFiles(full, out)
    else if (/\.(?:styl|css)$/i.test(name)) out.push(full)
  }
  return out
}

/**
 * 判断一行是不是选择器（Stylus 没有花括号，属性行与选择器行混在一起）。
 * 只要求「够用」：排除注释、变量、控制流、明显的 `prop: value` 与 mixin 调用。
 */
function isSelectorLine(line) {
  const t = line.trim()
  if (!t) return false
  if (/^(?:\/\/|\/\*|\*)/.test(t)) return false
  if (t.startsWith('$')) return false
  if (/^(?:if|else|for|return|@)\b/.test(t)) return false
  if (/^[A-Za-z-]+\s*:\s/.test(t)) return false // color: red / background: ...
  if (/^[A-Za-z-]+\s+\S/.test(t) && !/[.#&[>]/.test(t)) return false // 无冒号的属性/函数调用
  if (/^[A-Za-z0-9_-]+\([^)]*\)$/.test(t) && !t.includes('.')) return false // mixin 调用
  if (/^[{}]+$/.test(t)) return false
  return true
}

/** 从选择器文本里抽出 class token（`.foo`）与元素 token（`div`、`u`）。 */
function selectorTokens(text) {
  // `:not(...)` 里的 class 是否定条件，不能算「这个 class 有样式」
  const positive = text.replace(/:not\([^()]*\)/gi, '')

  const classes = new Set()
  for (const m of positive.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1])

  const elements = new Set()
  for (const part of positive.split(',')) {
    // 只取每个复合选择器的起始元素名（`div.btns` → div；`.note` → 无）
    const m = /^[\s>+~]*([a-zA-Z][a-zA-Z0-9-]*)/.exec(part)
    if (!m) continue
    const name = m[1].toLowerCase()
    if (['and', 'or', 'not', 'hover', 'active'].includes(name)) continue
    elements.add(name)
  }
  return { classes, elements }
}

/**
 * 建立 class / element → 来源文件 的索引。
 * 返回 `classIndex: Map<string, Set<string>>`、`elementIndex: Map<string, Set<string>>`。
 */
function buildStyleIndex(files) {
  const classIndex = new Map()
  const elementIndex = new Map()
  const add = (index, token, rel) => {
    if (!index.has(token)) index.set(token, new Set())
    index.get(token).add(rel)
  }

  for (const file of files) {
    const rel = path.relative(STYLE_ROOT, file).split(path.sep).join('/')
    const text = readFileSync(file, 'utf8')
    for (const rawLine of text.split('\n')) {
      // 去掉行尾注释（` // ...`），保留 url(https://...) 之类（选择器行里不会出现）
      const line = rawLine.replace(/\s+\/\/\s.*$/, '')
      if (!isSelectorLine(line)) continue
      const { classes, elements } = selectorTokens(line)
      for (const token of classes) add(classIndex, token, rel)
      for (const token of elements) add(elementIndex, token, rel)
    }
  }
  return { classIndex, elementIndex }
}

/** 构建产物 CSS：仅用于补判 Stylus 循环/变量在编译期展开出来的选择器。 */
function buildCompiledIndex() {
  const dir = path.join(DIST_DIR, '_astro')
  const index = new Map()
  if (!existsSync(dir)) return index
  for (const name of readdirSync(dir)) {
    if (!/\.css$/i.test(name)) continue
    const text = readFileSync(path.join(dir, name), 'utf8')
    // 粗粒度：整份 CSS 里的 `.class` 出现即视为存在选择器（产物中不会在字符串里出现 .class）
    for (const m of text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!index.has(m[1])) index.set(m[1], new Set())
      index.get(m[1]).add(`_astro/${name}`)
    }
  }
  return index
}

/* ------------------------------------------------------------------ */
/* 3. 从产物 HTML 切出每个 tag 的片段并建元素树                          */
/* ------------------------------------------------------------------ */

/** 按 `<h2 id="...">` 切分 article 内的分节。 */
function sliceSection(html, sectionId) {
  const start = html.indexOf(`<h2 id="${sectionId}"`)
  if (start === -1) return null
  const next = html.indexOf('<h2 id="', start + 1)
  const end = next === -1 ? html.length : next
  return html.slice(start, end)
}

/** 取 `class="..."` / `class='...'` 的 token 列表。 */
function parseClassAttr(attrs) {
  const m = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
  const value = m?.[1] ?? m?.[2] ?? m?.[3] ?? ''
  return value.split(/\s+/).filter(Boolean)
}

/**
 * 把片段解析成扁平元素表：每个元素记录自己的 class 与祖先 class 集合。
 * 只做「够用」的标签词法：跳过 script/style 正文，避免内联 JS 里的模板字符串
 * 破坏标签栈；script 内出现的 class 单独记为「运行时插入」，祖先取 script 所在元素。
 */
function collectElements(fragment) {
  const elements = []
  const stack = []
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m

  while ((m = tagRe.exec(fragment)) !== null) {
    const [, closing, rawTag, attrs] = m
    const tag = rawTag.toLowerCase()

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    const ancestors = new Set(stack.flatMap((item) => item.classes))
    if (tag === 'script' || tag === 'style') {
      const close = fragment.toLowerCase().indexOf(`</${tag}>`, tagRe.lastIndex)
      if (close === -1) break
      const body = fragment.slice(tagRe.lastIndex, close)
      for (const cm of body.matchAll(/class\s*=\s*["']([^"']+)["']/g)) {
        const classes = cm[1].split(/\s+/).filter(Boolean)
        for (const cls of classes) {
          elements.push({ classes: [cls], companions: classes, ancestors })
        }
      }
      tagRe.lastIndex = close + `</${tag}>`.length
      continue
    }

    const classes = parseClassAttr(attrs)
    elements.push({ classes, companions: classes, ancestors })
    if (!VOID_TAGS.has(tag) && !attrs.trim().endsWith('/')) stack.push({ tag, classes })
  }

  return elements
}

/** 按根元素正则取片段；用同名标签配对找闭合位置（img 等空元素直接取标签本身）。 */
function extractFragments(sectionHtml, rootRe, pick, toSectionEnd = false) {
  const matches = []
  const re = new RegExp(rootRe.source, rootRe.flags.includes('g') ? rootRe.flags : rootRe.flags + 'g')
  let m
  while ((m = re.exec(sectionHtml)) !== null) matches.push(m)

  const chosen = pick ? pick.map((i) => matches[i]).filter(Boolean) : matches
  return chosen.map((match) => {
    const start = match.index
    // bilibili 这类 tag 的可见 DOM 由紧随其后的 <script> 在运行时生成，
    // 片段必须延续到分节末尾，才能把脚本模板里的 class 也纳入检查。
    if (toSectionEnd) return sectionHtml.slice(start)
    const tagName = /^<([a-zA-Z][\w-]*)/.exec(match[0])?.[1]?.toLowerCase()
    if (!tagName) return sectionHtml.slice(start, start + match[0].length)
    // 根正则只匹配到起始标签的一部分，先补到起始标签的 `>` 为止
    const openEnd = sectionHtml.indexOf('>', start)
    if (openEnd === -1) return sectionHtml.slice(start)
    const openingTag = sectionHtml.slice(start, openEnd + 1)
    if (VOID_TAGS.has(tagName) || /\/>$/.test(openingTag)) return openingTag
    // 平衡同名标签，找到根元素的闭合位置
    const tagRe = new RegExp(`<(/?)${tagName}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>`, 'gi')
    tagRe.lastIndex = start
    let depth = 0
    let tm
    while ((tm = tagRe.exec(sectionHtml)) !== null) {
      if (tm[1] === '/') {
        depth -= 1
        if (depth === 0) return sectionHtml.slice(start, tm.index + tm[0].length)
      } else if (!/\/>$/.test(tm[0])) {
        depth += 1
      }
    }
    return sectionHtml.slice(start)
  })
}

/* ------------------------------------------------------------------ */
/* 4. 主流程                                                           */
/* ------------------------------------------------------------------ */

if (!existsSync(STYLE_ROOT)) fail(`样式源目录不存在：${STYLE_ROOT}`)
if (!existsSync(DIST_DIR)) fail(`构建产物不存在：${DIST_DIR}（先跑 pnpm build）`)

const styleFiles = walkStyleFiles(STYLE_ROOT)
if (styleFiles.length === 0) fail(`样式源目录下没有 .styl/.css 文件：${STYLE_ROOT}`)
const { classIndex, elementIndex } = buildStyleIndex(styleFiles)
const compiledIndex = buildCompiledIndex()

/** 网页缓存：一个页面只读一次。 */
const pageCache = new Map()
function readPage(page) {
  if (pageCache.has(page)) return pageCache.get(page)
  const file = path.join(DIST_DIR, page, 'index.html')
  if (!existsSync(file)) fail(`构建产物缺少 ${path.relative(REPO_ROOT, file)}`)
  const html = readFileSync(file, 'utf8')
  const articleStart = html.indexOf('<article class="post-content"')
  const articleEnd = html.indexOf('</article>', articleStart)
  const article =
    articleStart === -1 || articleEnd === -1 ? html : html.slice(articleStart, articleEnd)
  pageCache.set(page, article)
  return article
}

const results = []
const structuralErrors = []

for (const spec of TAG_SPECS) {
  const article = readPage(PAGES[spec.page])
  const section = sliceSection(article, spec.section)
  if (section === null) {
    structuralErrors.push(`${spec.name}: 在 ${PAGES[spec.page]} 找不到分节 h2#${spec.section}`)
    continue
  }
  const fragments = extractFragments(section, spec.root, spec.pick, spec.toSectionEnd === true)
  if (fragments.length === 0) {
    structuralErrors.push(`${spec.name}: 分节 #${spec.section} 内找不到根元素 ${spec.root}`)
    continue
  }

  /** class → { ancestors:Set, companions:Set }（多处出现时合并上下文） */
  const classContext = new Map()
  for (const fragment of fragments) {
    for (const element of collectElements(fragment)) {
      for (const cls of element.classes) {
        if (!classContext.has(cls)) {
          classContext.set(cls, { ancestors: new Set(), companions: new Set() })
        }
        const entry = classContext.get(cls)
        for (const ancestor of element.ancestors) entry.ancestors.add(ancestor)
        for (const companion of element.companions) {
          if (companion !== cls) entry.companions.add(companion)
        }
      }
    }
  }

  const exact = [] // class 字面量在样式源里命中
  const compiledOnly = [] // 仅编译产物命中（stylus 循环展开）
  const contextOnly = [] // 仅父级 / 同元素其它 class 命中
  const unstyled = [] // 上游模板自己也输出、但上游确实没有规则（白名单）
  const miss = [] // 真·未命中

  for (const [cls, entry] of classContext) {
    if (classIndex.has(cls)) {
      exact.push({ cls, files: [...classIndex.get(cls)] })
      continue
    }
    if (compiledIndex.has(cls)) {
      compiledOnly.push({ cls, files: [...compiledIndex.get(cls)] })
      continue
    }
    // 仅语境命中：同一元素上的其它 class、或祖先元素的 class 有规则
    const related = [...entry.companions, ...entry.ancestors].filter(
      (name) => classIndex.has(name) || compiledIndex.has(name),
    )
    if (related.length > 0) {
      contextOnly.push({ cls, via: related.slice(0, 4) })
      continue
    }
    if (UPSTREAM_UNSTYLED.has(`${spec.name}:${cls}`)) {
      unstyled.push({ cls, reason: UPSTREAM_UNSTYLED.get(`${spec.name}:${cls}`) })
      continue
    }
    miss.push({ cls })
  }

  results.push({
    spec,
    exact,
    compiledOnly,
    contextOnly,
    unstyled,
    miss,
    total: classContext.size,
  })
}

/* ------------------------------------------------------------------ */
/* 5. 输出                                                             */
/* ------------------------------------------------------------------ */

const srcDirs = new Map()
for (const file of styleFiles) {
  const top = path.relative(STYLE_ROOT, file).split(path.sep)[0]
  srcDirs.set(top, (srcDirs.get(top) ?? 0) + 1)
}
log(
  `样式源: ${styleFiles.length} 个文件（${[...srcDirs.entries()]
    .map(([dir, count]) => `${dir} ${count}`)
    .join(' / ')}）`,
)
log(`tag: ${TAG_SPECS.length} 个；产物页面: ${Object.values(PAGES).length} 张`)

const groupNames = { inline: '行内', block: '块级容器', media: '媒体与卡片', thirdparty: '第三方' }
let group = ''

const totals = {
  classes: 0,
  exact: 0,
  compiledOnly: 0,
  contextOnly: 0,
  unstyled: 0,
  miss: 0,
  noClass: 0,
}

/** 判断某 tag 是否完全无 class（u/emp/… 与 dogeplayer）。 */
function isClassless(result) {
  return result.total === 0
}

for (const result of results) {
  const { spec } = result
  if (spec.page !== group) {
    group = spec.page
    console.log(`\n== ${groupNames[group] ?? group}`)
  }

  totals.classes += result.total
  totals.exact += result.exact.length
  totals.compiledOnly += result.compiledOnly.length
  totals.contextOnly += result.contextOnly.length
  totals.unstyled += result.unstyled.length
  totals.miss += result.miss.length

  if (isClassless(result)) {
    totals.noClass += 1
    const elementName = spec.element
    const hit = elementName ? elementIndex.get(elementName) : undefined
    const note = hit
      ? `无 class；元素 <${elementName}> 命中上游规则（${[...hit].join(', ')}）`
      : '无 class；上游也没有该元素的样式规则'
    console.log(`  ${spec.name.padEnd(14)} ${note}`)
    continue
  }

  const status = result.miss.length > 0 ? 'MISS' : 'OK  '
  const covered =
    result.exact.length + result.compiledOnly.length + result.contextOnly.length + result.unstyled.length
  const rate = ((covered / result.total) * 100).toFixed(0)
  console.log(
    `  ${status} ${spec.name.padEnd(14)} class ${result.total}（覆盖 ${rate}%）：` +
      `精确 ${result.exact.length} / 编译展开 ${result.compiledOnly.length} / ` +
      `仅语境 ${result.contextOnly.length} / 上游无规则 ${result.unstyled.length} / ` +
      `未命中 ${result.miss.length}`,
  )
  if (VERBOSE) {
    console.log(`       精确: ${result.exact.map((item) => '.' + item.cls).join(' ')}`)
  }
  if (result.miss.length > 0) {
    console.log(`       未命中: ${result.miss.map((item) => '.' + item.cls).join(' ')}`)
  }
  if (result.unstyled.length > 0) {
    console.log(
      `       上游无规则: ${result.unstyled.map((item) => `.${item.cls}`).join(' ')}` +
        '（上游模板同样输出这些 class，不计失败；--strict 时计入）',
    )
  }
  if (result.miss.length === 0 && result.contextOnly.length > 0) {
    console.log(
      `       仅语境: ${result.contextOnly
        .map((item) => `.${item.cls}←${item.via.map((v) => '.' + v).join('|')}`)
        .join(' ')}`,
    )
  }
}

/* 精确命中的来源目录分布：回答「有多少是 _tags 自己的规则」。 */
const hitDirs = new Map()
/** 直接命中 `_tags/` 的 class 数（按 tag 去重，供报告里给出更严格的口径）。 */
const directTagHits = new Set()
/** 命中 `_tags/` + `_global/` + `_layout/` 的 class 数（任务里点名的三个目录）。 */
const coreDirHits = new Set()
for (const result of results) {
  for (const item of result.exact) {
    for (const file of item.files) {
      const top = file.split('/')[0]
      hitDirs.set(top, (hitDirs.get(top) ?? 0) + 1)
      if (top === '_tags') directTagHits.add(`${result.spec.name}:${item.cls}`)
      if (top === '_tags' || top === '_global' || top === '_layout') {
        coreDirHits.add(`${result.spec.name}:${item.cls}`)
      }
    }
  }
}

console.log('')
const covered = totals.exact + totals.compiledOnly + totals.contextOnly + totals.unstyled
log(
  `汇总: class ${totals.classes} 个，覆盖 ${covered}/${totals.classes}（${(
    (covered / Math.max(totals.classes, 1)) *
    100
  ).toFixed(1)}%）= 精确 ${totals.exact} + 编译展开 ${totals.compiledOnly} + ` +
    `仅语境 ${totals.contextOnly} + 上游无规则 ${totals.unstyled}；未命中 ${totals.miss}；` +
    `无 class 的 tag ${totals.noClass} 个`,
)
log(
  `精确命中的规则来源（class×文件计数）: ${[...hitDirs.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dir, count]) => `${dir} ${count}`)
    .join(' / ')}`,
)
log(
  `其中直接命中 _tags/ 的 class: ${directTagHits.size} 个；` +
    `命中 _tags/ + _global/ + _layout/ 的 class: ${coreDirHits.size} 个`,
)

if (structuralErrors.length > 0) {
  for (const message of structuralErrors) console.error('[check-tag-styles] FAIL', message)
  console.error('[check-tag-styles] 片段定位失败')
  process.exit(1)
}
if (totals.miss > 0) {
  console.error('[check-tag-styles] 存在未命中 class，见上方 MISS 明细')
  process.exit(1)
}
if (STRICT && totals.unstyled > 0) {
  console.error(`[check-tag-styles] --strict：${totals.unstyled} 个「上游无规则」的 class 也判失败`)
  process.exit(1)
}
if (totals.unstyled > 0) {
  warn(
    `${totals.unstyled} 个 class 上游样式树本来就没有规则（见上方「上游无规则」与脚本内 UPSTREAM_UNSTYLED），` +
      '不计失败；加 --strict 可把它们也判成失败',
  )
}
warn('口径提示：元素选择器与编译展开命中不计入「精确」；详见 docs/notes/P6-7-tag-styles.md')

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        tagCount: TAG_SPECS.length,
        totals,
        tags: results.map((result) => ({
          tag: result.spec.name,
          group: result.spec.page,
          classes: result.total,
          exact: result.exact.length,
          compiledOnly: result.compiledOnly.length,
          contextOnly: result.contextOnly.length,
          unstyled: result.unstyled.length,
          miss: result.miss.length,
          exactClasses: result.exact.map((item) => item.cls),
          contextClasses: result.contextOnly.map((item) => item.cls),
          unstyledClasses: result.unstyled.map((item) => item.cls),
          missClasses: result.miss.map((item) => item.cls),
        })),
      },
      null,
      2,
    ),
  )
}

log('通过：所有带 class 的 tag 都能在上游样式里找到规则（或属上游本身未样式化的 class）')
