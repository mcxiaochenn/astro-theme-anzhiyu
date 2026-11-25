import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const CONFIG_CALL_RE = /hexo-config\(\s*(['"])([^'"]+)\1\s*\)/g
const STYL_RE = /\.styl(us)?$/
const CSS_RE = /\.css$/i
// 注意：这里只允许行内空格，不能写成 \s*——Stylus 的 @import 后面常跟换行，
// 一旦把换行吃掉，被导入文件末尾没有换行时就会和下一行的 @import / 代码黏在一起。
// 匹配 @import / @require。后者是 Stylus 的「只展开一次」语义（见 evaluator.js 的
// importFile：requireHistory 按文件路径记账），上游 _highlight/highlight.styl 用它。
const IMPORT_RE = /@(import|require)[ \t]+(['"])([^'"]+)\2[ \t]*;?/g
const USE_RE = /\buse\(\s*(['"])([^'"]+)\1\s*\)/g
const MAGIC_RE = /[*?]/

// Hexo 7.3.0 的站点级默认值（hexo/dist/hexo/default_config.js）。上游主题脚本
// scripts/events/stylus.js 读的是 `hexo.config`，而 hexo.config 是站点 _config.yml
// 深合并这份默认值之后的完整配置，所以「配置里没写」不等于「值不存在」：
// 没写就用这里的默认值，与 Hexo load_config() 的语义一致。
// 注意 Hexo 7 的默认配置里没有 highlight.enable / prismjs.enable（那是 Hexo 6
// 及更早的开关），只有 Hexo > 7.0 的 syntax_highlighter 生效，enable 由它推导。
const HEXO_SITE_DEFAULT = {
  syntax_highlighter: 'highlight.js',
  highlight: { line_number: true },
  prismjs: { line_number: true },
}

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_VENDOR_DIR = path.resolve(PLUGIN_DIR, '..', 'vendor')

/**
 * 让为 Hexo 写的 Stylus 能直接在 Vite / Astro 里编译。
 *
 * 这个插件要复刻的是 `hexo-renderer-stylus` + `stylus` 在 Hexo 下的完整行为，
 * 而不只是 `hexo-config()` 一个函数。Hexo 那边 `lib/renderer.js` 做了三件事：
 *
 * 1. `use(nib())`：把 `nib/lib` 加进 Stylus 的 include 路径（`@import 'nib'`
 *    因此可解析），并在没有 node-canvas 时把 `has-canvas` 定义成 false。
 * 2. `.set('include css', true)`：`@import` 的 `.css` 文件被**原样内联**进产物，
 *    不留给浏览器（Stylus 的 `literal` 节点，见 stylus/lib/visitor/evaluator.js
 *    的 importFile()）。上游 `_third-party/normalize.min.css` 与
 *    `_extra` 下的递归 CSS glob 都走这条。
 * 3. `.define('hexo-config', key => getProperty(theme.config, key))`：返回 JS 值，
 *    缺失键返回 `''`，对象/数组返回对象/数组（Stylus 会 coerce 成表达式）。
 * 4. 主题自己的脚本 `scripts/events/stylus.js` 还会注册一个 `stylus:renderer`
 *    filter，用 `.define()` 注入 4 个语法高亮开关变量（下一节）。
 *
 * ## Hexo define 层（stylus:renderer filter）
 *
 * 上游主题脚本（不在 `hexo-renderer-stylus` 里，但真实站点一定会执行）：
 *
 * ```js
 * const { syntax_highlighter, highlight, prismjs } = hexo.config
 * let { enable: highlightEnable, line_number: highlightLineNumber } = highlight
 * let { enable: prismjsEnable, line_number: prismjsLineNumber } = prismjs
 * if (syntax_highlighter) {                       // Hexo > 7.0 的站点级开关
 *   highlightEnable = syntax_highlighter === 'highlight.js'
 *   prismjsEnable = syntax_highlighter === 'prismjs'
 * }
 * style.define('$highlight_enable', highlightEnable)
 *      .define('$highlight_line_number', highlightLineNumber)
 *      .define('$prismjs_enable', prismjsEnable)
 *      .define('$prismjs_line_number', prismjsLineNumber)
 * ```
 *
 * 这 4 个变量在 72 个上游 `.styl` 里**零赋值**，只被 `_highlight/highlight.styl`
 * 的 `if` / `&&` 消费。漏掉这一层时它们未定义，而 Stylus 对 `if` 里的未定义变量
 * 当**真**，于是 `if $prismjs_enable` 的 prismjs 分支被错误包含（+3782 字节）。
 *
 * 复刻方式：从同一份配置算出 4 个值，在展开源码顶部生成与 `.define()` 等价的
 * 赋值行（`$name = true/false`）。Hexo 的 `.define()` 走 stylus/lib/utils.js 的
 * `coerce`，boolean → `nodes.Boolean`，与源码里 `$name = true` 等价；配置缺失时
 * 上游拿到 `nodes.null`（条件语境为假），这里写成 `false`（在 `if` / `&&` / `!`
 * 里与 null 同真值，上游 styl 只在这三种语境里消费它们）。
 *
 * ## 为什么不用 define / preprocessorOptions 注入
 *
 * 最初的做法是 `css.preprocessorOptions.stylus.define = { 'hexo-config': fn }`。
 * Vite 8 的样式预处理在独立 worker 里跑，实测（2026-11-23，astro 7.4.13 +
 * vite 8.3.8）函数写在 `vite.css` 或插件 `config` 钩子里都到不了编译现场。
 *
 * P1-5 全量编译时进一步实测：**Vite 8.3.8 里 `css.preprocessorOptions.stylus`
 * 的普通数据项同样到不了 Stylus 编译现场**——`include css: true`、`compress: true`、
 * `additionalData` 三项都验证过不生效（同一份 `resolveConfig()` 结果里能读到这些
 * 选项，但 `preprocessCSS` 阶段的 Stylus 输出完全不受影响）。所以 CSS 内联、
 * 字符串引号这些语义只能由插件在文本层自己复刻，不能依赖 Stylus 的 options。
 *
 * ## 做法
 *
 * 在 Vite 的 transform 阶段把整个 `.styl` 依赖树展开成**一个** Stylus 源码：
 *
 * - `.styl` 的 `@import` / `@require`：按 Stylus 的查找顺序（当前文件目录优先、
 *   其次 include 路径，支持 glob 与 `foo/index.styl` 目录索引）递归内联，保留
 *   缩进——这样写在 `if` 分支里的 import 展开后仍然留在同一个分支里。
 *   `@require` 按 Stylus 的 requireHistory 语义只展开一次。
 * - `.css` 的 `@import`：直接内联文件原文，但包进 Stylus 的 `@css { ... }`
 *   字面量块（stylus/lib/lexer.js 的 literal()，按花括号配对原样输出），
 *   等价于 Hexo 下 `include css: true` 的 literal 导入，且不让 Stylus 去解析 CSS。
 *   注意字面量会被 compiler 每行剥掉两个行首空格，插件已按相反方向补齐。
 * - `nib`：默认从包内 `vendor/nib` 解析（nib@1.2.0 的 Stylus 源码拷贝），
 *   见 vendor/nib/README.md。
 * - `hexo-config('x.y')`：按 Hexo 的 `getProperty` 语义求值，在文件顶部为每个键
 *   定义变量 `$cfg_x_y = <值>`，调用点替换成变量名（不是字面量）：
 *   `hexo-config('x') ? hexo-config('x') : 99999` 换成变量后是
 *   `$cfg_x ? $cfg_x : 99999`，与上游写法同构，不会踩到「字符串字面量后跟 ?」
 *   的解析错误。
 *
 * ## 字符串引号
 *
 * Hexo 下 `hexo-config()` 返回 JS 值，Stylus 的 `utils.coerce` 把字符串包成
 * `nodes.String`，其默认引号是单引号（见 stylus/lib/nodes/string.js），所以这里
 * 也优先用单引号包裹。Stylus 不支持字符串内的引号转义（`"a\"b"` 和 `'a\'b'`
 * 都会解析乱），所以含单引号的值改用双引号。
 *
 * @typedef {object} Options
 * @property {string} [configPath]  YAML 配置路径，与 config 二选一
 * @property {object} [config]      直接传入配置对象
 * @property {boolean} [expandImports] 展开 @import（styl 与 css），默认 true
 * @property {boolean} [warnOnMissing] 引用不存在的键时警告，默认 true
 * @property {boolean} [debug]      打印每个文件的统计
 * @property {string[]} [includePaths] 额外的 Stylus include 路径，默认 [vendor 目录]
 */

/** @param {Options} options */
export function stylusHexoConfig(options = {}) {
  const {
    configPath,
    expandImports = true,
    warnOnMissing = true,
    debug = false,
  } = options
  const includePaths = options.includePaths ?? [DEFAULT_VENDOR_DIR]

  if (!configPath && !options.config) {
    throw new Error('[stylus-hexo-config] 需要 configPath 或 config')
  }

  let cachedConfig = options.config ?? null
  let cachedMtime = 0
  const warnedKeys = new Set()
  const warnedImports = new Set()

  function loadConfig() {
    if (!configPath) return cachedConfig
    const stat = fs.statSync(configPath)
    if (stat.mtimeMs !== cachedMtime) {
      cachedConfig = YAML.parse(fs.readFileSync(configPath, 'utf8'))
      cachedMtime = stat.mtimeMs
    }
    return cachedConfig
  }

  // ---- hexo-config 求值：复刻 hexo-renderer-stylus/lib/renderer.js 的 getProperty ----

  function getProperty(obj, name) {
    name = name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '')

    const split = name.split('.')
    let key = split.shift()

    if (!Object.prototype.hasOwnProperty.call(obj, key)) return ''

    let result = obj[key]
    const len = split.length

    if (!len) {
      if (result === 0) return result
      return result || ''
    }
    if (typeof result !== 'object') return ''

    for (let i = 0; i < len; i++) {
      key = split[i]
      if (result === null || !Object.prototype.hasOwnProperty.call(result, key)) {
        return ''
      }
      result = result[key]
      if (typeof result !== 'object') return result
    }

    return result
  }

  function hasProperty(obj, name) {
    const split = name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '').split('.')
    let cur = obj
    for (const key of split) {
      if (cur === null || typeof cur !== 'object') return false
      if (!Object.prototype.hasOwnProperty.call(cur, key)) return false
      cur = cur[key]
    }
    return true
  }

  function stylusLiteral(value, key) {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') {
      // 引号要与 Hexo 下一致：hexo-config 返回 JS string，Stylus 的 utils.coerce
      // 会包成 nodes.String，而 nodes.String 默认 quote 是单引号（见
      // stylus/lib/nodes/string.js 的 constructor 与 compiler.js visitString），
      // 所以产物里字符串值默认是单引号。
      const hasSingle = value.includes("'")
      if (!hasSingle) return `'${value}'`
      const hasDouble = value.includes('"')
      if (!hasDouble) return `"${value}"`
      // 同键告警只打一次，且与 missing/object 告警共用 warnOnMissing 总闸（G6）。
      if (warnOnMissing && !warnedKeys.has(`quote:${key}`)) {
        warnedKeys.add(`quote:${key}`)
        console.warn(
          `[stylus-hexo-config] hexo-config('${key}') 的值同时含单双引号，双引号已替换为单引号：${value}`,
        )
      }
      return `"${value.replace(/"/g, "'")}"`
    }
    // 对象 / 数组：Hexo 下 getProperty 原样返回，Stylus 把 JS 值 coerce 成
    // 表达式（utils.coerceObject / coerceArray），在布尔上下文里恒为真。
    // 当前上游 179 处调用里对象值只用于 `if` / `&&` 判断，因此这里用 `true`
    // 这个 truthy 字面量代替整个 coerced 表达式（产物不输出该变量）。
    if (warnOnMissing && !warnedKeys.has(`object:${key}`)) {
      warnedKeys.add(`object:${key}`)
      console.warn(
        `[stylus-hexo-config] hexo-config('${key}') 的值是对象/数组，按 truthy 字面量 true 处理（仅用于条件判断时等价）`,
      )
    }
    return 'true'
  }

  // ---- Hexo define 层：复刻上游主题脚本 scripts/events/stylus.js ----

  /** 取点路径值；缺失返回 undefined（区别于 getProperty 的「缺失 → ''」语义） */
  function lookupRaw(obj, dotted) {
    let cur = obj
    for (const key of dotted.split('.')) {
      if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) {
        return undefined
      }
      cur = cur[key]
    }
    return cur
  }

  /** 站点配置区块：配置里是对象就与 Hexo 默认值浅合并，否则整块用默认值 */
  function siteSection(config, key, defaults) {
    const value = lookupRaw(config, key)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...defaults, ...value }
    }
    return { ...defaults }
  }

  /**
   * `.define()` 值的文本等价物。
   *
   * 上游 `.define(name, value)` 会走 stylus/lib/utils.js 的 `coerce`：
   * boolean → `nodes.Boolean`、number → `nodes.Unit`、string → `nodes.String`、
   * null/undefined → `nodes.null`、object/array → 恒真表达式。与源码文本的对应：
   * `true/false`、数字字面量、引号字符串、`false`（null 在条件语境为假）、`true`。
   */
  function defineLiteral(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') {
      return value.includes("'") ? `"${value.replace(/"/g, "'")}"` : `'${value}'`
    }
    if (value === null || value === undefined) return 'false'
    return 'true'
  }

  /**
   * 复刻上游主题脚本 `scripts/events/stylus.js` 的 `stylus:renderer` filter：
   *
   * ```js
   * const { syntax_highlighter, highlight, prismjs } = hexo.config
   * let { enable: highlightEnable, line_number: highlightLineNumber } = highlight
   * let { enable: prismjsEnable, line_number: prismjsLineNumber } = prismjs
   * if (syntax_highlighter) {                        // Hexo > 7.0
   *   highlightEnable = syntax_highlighter === 'highlight.js'
   *   prismjsEnable = syntax_highlighter === 'prismjs'
   * }
   * style.define('$highlight_enable', highlightEnable)
   *      .define('$highlight_line_number', highlightLineNumber)
   *      .define('$prismjs_enable', prismjsEnable)
   *      .define('$prismjs_line_number', prismjsLineNumber)
   * ```
   *
   * 这 4 个变量在 72 个上游 `.styl` 里零赋值，只被 `_highlight/highlight.styl`
   * 与 `_highlight/theme.styl` 的 `if` / `&&` 消费；漏掉这一层时它们未定义，
   * 而 Stylus 对 `if` 里的未定义变量当**真**，`if $prismjs_enable` 分支就会被
   * 错误包含（+3782 字节，见 docs/upstream-delta.md 的 U3/D9）。
   *
   * 值的来源：hexo.config 是「站点 _config.yml 深合并 default_config」的结果。
   * 本插件拿到的 YAML 可能是主题配置（`examples/blog/theme.config.yml`，里面
   * 没有站点级键），所以缺省回落 Hexo 7.3.0 默认值：`syntax_highlighter`
   * 默认 `highlight.js` → `$highlight_enable=true` / `$prismjs_enable=false`。
   *
   * @param {object} config
   * @returns {string[]} 形如 ['$highlight_enable = true', ...]
   */
  function hexoDefineLines(config) {
    const site = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
    const syntaxHighlighter =
      lookupRaw(site, 'syntax_highlighter') ?? HEXO_SITE_DEFAULT.syntax_highlighter
    const highlight = siteSection(site, 'highlight', HEXO_SITE_DEFAULT.highlight)
    const prismjs = siteSection(site, 'prismjs', HEXO_SITE_DEFAULT.prismjs)

    let highlightEnable = highlight.enable
    let highlightLineNumber = highlight.line_number
    let prismjsEnable = prismjs.enable
    let prismjsLineNumber = prismjs.line_number

    if (syntaxHighlighter) {
      highlightEnable = syntaxHighlighter === 'highlight.js'
      prismjsEnable = syntaxHighlighter === 'prismjs'
    }

    return [
      `$highlight_enable = ${defineLiteral(highlightEnable)}`,
      `$highlight_line_number = ${defineLiteral(highlightLineNumber)}`,
      `$prismjs_enable = ${defineLiteral(prismjsEnable)}`,
      `$prismjs_line_number = ${defineLiteral(prismjsLineNumber)}`,
    ]
  }

  function varNameFor(key, registry) {
    let name = registry.get(key)
    if (name) return name
    const base = `$cfg_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`
    name = base
    let i = 2
    const taken = new Set(registry.values())
    while (taken.has(name)) name = `${base}_${i++}`
    registry.set(key, name)
    return name
  }

  /** 把调用点换成变量名，并生成变量定义 */
  function rewriteConfigCalls(code) {
    const config = loadConfig()
    const registry = new Map()

    const body = code.replace(CONFIG_CALL_RE, (_match, _quote, key) =>
      // 加括号：上游有 `hexo-config('x') is a 'unit' ? ... : ...` 这种行首表达式，
      // 换成裸变量后 Stylus 会把行首标识符当属性名，报 expected "indent", got "is a"
      `(${varNameFor(key, registry)})`,
    )

    if (registry.size === 0) return { prelude: '', body, count: 0 }

    const defs = []
    for (const [key, name] of registry) {
      if (!hasProperty(config, key)) {
        if (warnOnMissing && !warnedKeys.has(`missing:${key}`)) {
          warnedKeys.add(`missing:${key}`)
          console.warn(
            `[stylus-hexo-config] hexo-config('${key}') 在配置里不存在，按 '' 处理（与 Hexo getProperty 一致）`,
          )
        }
        defs.push(`${name} = ${stylusLiteral(getProperty(config, key), key)}`)
      } else {
        defs.push(`${name} = ${stylusLiteral(getProperty(config, key), key)}`)
      }
    }

    return {
      prelude: `${defs.join('\n')}\n`,
      body,
      count: registry.size,
    }
  }

  // ---- @import 解析与内联：复刻 Stylus evaluator 的查找顺序 ----
  //
  // Stylus 的 paths 是一个栈：初始是 options.paths（include 路径）+ 根文件目录，
  // 每进入一个被导入文件就把该文件目录 push 进去，出栈时 pop；查找时从栈尾往
  // 栈头遍历（最近的文件目录优先，最后才是 include 路径），每层用 glob 匹配。
  // 具体见 stylus/lib/utils.js 的 find()/lookupIndex() 与
  // stylus/lib/visitor/evaluator.js 的 importFile()。

  function toPosix(p) {
    return p.split(path.sep).join('/')
  }

  function globToRegExp(pattern) {
    let out = ''
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i]
      if (c === '*') {
        if (pattern[i + 1] === '*') {
          i++
          if (pattern[i + 1] === '/') {
            i++
            out += '(?:[^/]+/)*'
          } else {
            out += '.*'
          }
        } else {
          out += '[^/]*'
        }
      } else if (c === '?') {
        out += '[^/]'
      } else {
        out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      }
    }
    return new RegExp(`^${out}$`)
  }

  function walkFiles(dir, recursive, out = []) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (recursive) walkFiles(full, recursive, out)
      } else if (entry.isFile()) {
        out.push(full)
      }
    }
    return out
  }

  /**
   * 在 baseDir 下按 Stylus 的 glob 语义找 spec 匹配的文件，结果按 posix 路径排序
   * （Stylus 的 utils.find 用 glob.sync(..., {posix:true}) 后 .sort()）。
   */
  function globFiles(baseDir, spec) {
    if (!MAGIC_RE.test(spec)) {
      const full = path.resolve(baseDir, spec)
      try {
        if (fs.statSync(full).isFile()) return [full]
      } catch {
        /* not found */
      }
      return []
    }

    const magicIndex = spec.search(MAGIC_RE)
    const prefix = spec.slice(0, magicIndex)
    const slash = prefix.lastIndexOf('/')
    const baseRel = slash === -1 ? '' : prefix.slice(0, slash)
    const subPattern = spec.slice(baseRel ? baseRel.length + 1 : 0)
    const absBase = path.resolve(baseDir, baseRel)
    const re = globToRegExp(subPattern.replace(/\\/g, '/'))
    return walkFiles(absBase, subPattern.includes('**'))
      .map((full) => ({ full, rel: toPosix(path.relative(absBase, full)) }))
      .filter((item) => re.test(item.rel))
      .map((item) => item.full)
      .sort((a, b) => (toPosix(a) < toPosix(b) ? -1 : toPosix(a) > toPosix(b) ? 1 : 0))
  }

  /** Stylus utils.find：对 paths 从栈尾往栈头，第一个有匹配的路径生效 */
  function find(spec, dirStack) {
    for (let i = dirStack.length - 1; i >= 0; i--) {
      const found = globFiles(dirStack[i], spec)
      if (found.length) return found
    }
    return []
  }

  /** Stylus utils.lookupIndex：foo/index.styl，其次 foo/foo.styl */
  function lookupIndex(spec, dirStack) {
    const first = find(`${spec}/index.styl`, dirStack)
    if (first.length) return first
    const base = path.posix.basename(spec.replace(/\.styl$/i, ''))
    return find(`${spec}/${base}.styl`, dirStack)
  }

  /** @returns {string[]} 命中的 .styl 文件（.css 由调用方提前分流给 Stylus） */
  function resolveImport(spec, dirStack) {
    // Stylus 对非 .css 的 import 一律补 .styl 再 glob（evaluator.js visitImport），
    // 所以 `_third-party/*` 只匹配 .styl，不会把 normalize.min.css 也吞进来。
    const target = STYL_RE.test(spec) ? spec : `${spec}.styl`
    const found = find(target, dirStack)
    if (found.length) return found
    return lookupIndex(spec, dirStack)
  }

  /**
   * Stylus 的 `use('x.js')` 内置函数会 `require()` 指定 JS 插件（nib 的
   * lib/nib/vendor.styl 用 `use('../nodes/vendor-helpers.js')` 定义 normalize()）。
   *
   * 它靠 Stylus 的 options.paths（动态 import 目录栈）找文件；我们把 @import
   * 文本展开之后这个栈里没有 nib 的目录了，所以把相对路径改写成绝对路径，
   * `use()` 的 utils.lookup 对绝对路径直接 stat，能正常 require。
   */
  function rewriteUseCalls(code, dirStack) {
    if (!code.includes('use(')) return code
    return code.replace(USE_RE, (match, _quote, spec) => {
      let found = null
      if (path.isAbsolute(spec)) {
        try {
          if (fs.statSync(spec).isFile()) found = spec
        } catch {
          /* not found */
        }
      }
      if (!found) {
        for (let i = dirStack.length - 1; i >= 0; i--) {
          const full = path.resolve(dirStack[i], spec)
          try {
            if (fs.statSync(full).isFile()) {
              found = full
              break
            }
          } catch {
            /* not found */
          }
        }
      }
      if (!found) return match
      // Stylus 字符串不做转义处理；Windows 路径用正斜杠，反斜杠会被原样保留
      return `use("${toPosix(found)}")`
    })
  }

  /**
   * 去掉被导入文件「根层级」的块注释。
   *
   * 依据（stylus 0.64 实测）：被 @import 的文件里，根层级的块注释会被 Stylus
   * 编译器丢弃（compiler.js visitBlock 的 case 'comment' 只输出 !node.suppress
   * 的注释，而 lexer 只把以 "/*!" 开头的设成不 suppress）；写在选择器 / at-rule
   * 块内部的注释则照常输出。主文件根层级的注释是输出的——上游入口 index.styl
   * 根层级只有双斜线注释，所以把被导入文件的根层级块注释去掉，正好等价于
   * Hexo 的编译结果。
   *
   * @param {string} text
   */
  function stripRootComments(text) {
    return text.replace(/^\/\*(?!\!)[\s\S]*?\*\/[^\n]*\n?/gm, '')
  }

  /**
   * 中和「整行双斜线注释里出现的块注释开始符」。
   *
   * Stylus 0.64 的 Lexer 构造函数会用一条正则把「行尾逗号 + 换行」接续成一行
   * （lib/lexer.js constructor 第 4 个 replace，用于 `th,` + `td` 这种选择器续行）。
   * 这条正则的替换函数靠「全文里最后一个块注释开始符是否在最后一个结束符之后」
   * 判断是否处于块注释中；一旦某个双斜线注释里出现块注释开始符、又永远没有对应
   * 的结束符，这个判断会永久为真，之后的逗号续行不再拼接，`th,` 会被当成属性
   * 解析成 `th: ,`。把双斜线注释里的块注释开始符写成转义形式（注释内容不参与
   * 编译，语义不变）即可绕开。
   *
   * 只处理整行双斜线注释，不动字符串 / url 里的双斜线。
   */  function neutralizeSlashComments(text) {
    if (!text.includes('//')) return text
    return text
      .split('\n')
      .map((line) => {
        const m = /^[ \t]*\/\/(.*)$/.exec(line)
        if (!m || !m[1].includes('/*')) return line
        return line.replace(/\/\*/g, '/\\*')
      })
      .join('\n')
  }

  /**
   * 把一个 .css 文件变成 Stylus 的 `@css { ... }` 字面量块。
   *
   * 两个必须处理的细节（stylus 0.64 实测）：
   * 1. Lexer 的 @css 字面量取「{」与配对大括号之间的全部文本，末尾的
   *    「空白 + }」会被去掉；Compiler 的 visitLiteral 还会对字面量做
   *    `.replace(/^  /gm, '')`，即**每行行首去掉两个空格**。所以要把每行补上
   *    两个空格，产物才是 CSS 原文。
   * 2. 字面量块开头不能留换行，否则产物开头多一个空行；因此第一行紧贴
   *    「{」写。
   *
   * 结尾换行由 compiler 统一补：visitBlock 里 literal 分支输出
   * `this.visit(node) + '\n'`，刚好抵消第 1 条里被去掉的文件末尾换行。
   *
   * @param {string} file
   */
  function cssLiteralBlock(file) {
    const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
    if (!raw.trim()) return ''
    const lines = raw.split('\n')
    const body = lines.map((line, i) => (i === 0 ? line : `  ${line}`)).join('\n')
    return `@css {${body}}`
  }

  function inlineImports(code, filePath, state) {
    const dirStack = state.dirStack
    const stackSet = state.stack
    const source = rewriteUseCalls(neutralizeSlashComments(code), dirStack)

    return source.replace(IMPORT_RE, (match, keyword, _quote, spec, offset) => {
      // .css 的 @import 在文本层展开：按 hexo-renderer-stylus 的
      // `.set('include css', true)` 语义，把 CSS 原文内联进产物（不是留给浏览器）。
      // 用 Stylus 的 `@css { ... }` 字面量块承载，等价于 stylus 的 literal 导入。
      if (CSS_RE.test(spec)) {
        const cssFiles = find(spec, dirStack)
        if (!cssFiles.length) {
          if (!warnedImports.has(spec)) {
            warnedImports.add(spec)
            console.warn(
              `[stylus-hexo-config] 无法解析 @${keyword} '${spec}'（来自 ${filePath}）`,
            )
          }
          return match
        }
        const blocks = []
        for (const file of cssFiles) {
          state.files.add(file)
          const block = cssLiteralBlock(file)
          if (block) blocks.push(block)
        }
        if (!blocks.length) return ''
        const lineStart = source.lastIndexOf('\n', offset - 1) + 1
        const prefix = source.slice(lineStart, offset)
        const indent = /^[ \t]*$/.test(prefix) ? prefix : ''
        const joined = blocks.join('\n')
        return joined
          .split('\n')
          .map((line, i) => (i === 0 || line === '' ? line : indent + line))
          .join('\n')
      }

      let resolved = resolveImport(spec, dirStack)
      if (!resolved.length) {
        if (!warnedImports.has(spec)) {
          warnedImports.add(spec)
          console.warn(
            `[stylus-hexo-config] 无法解析 @${keyword} '${spec}'（来自 ${filePath}），保持原样交给 Stylus`,
          )
        }
        return match
      }

      if (keyword === 'require') {
        const remaining = []
        for (const file of resolved) {
          if (state.requires.has(file)) continue
          state.requires.add(file)
          remaining.push(file)
        }
        if (!remaining.length) return ''
        resolved = remaining
      }

      const lineStart = source.lastIndexOf('\n', offset - 1) + 1
      const prefix = source.slice(lineStart, offset)
      const indent = /^[ \t]*$/.test(prefix) ? prefix : ''

      const parts = []
      for (const file of resolved) {
        if (stackSet.has(file)) {
          console.warn(`[stylus-hexo-config] 检测到 import 循环，跳过：${file}`)
          continue
        }
        state.files.add(file)
        const childSource = stripRootComments(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'))
        stackSet.add(file)
        try {
          parts.push(
            inlineImports(childSource, file, {
              dirStack: [...dirStack, path.dirname(file)],
              stack: stackSet,
              files: state.files,
              requires: state.requires,
            }),
          )
        } finally {
          stackSet.delete(file)
        }
      }

      const joined = parts.join('\n')
      // 保留 import 行的缩进：写在 if 分支里的 import 展开后仍然留在同一分支
      return joined
        .split('\n')
        .map((line, i) => (i === 0 || line === '' ? line : indent + line))
        .join('\n')
    })
  }

  return {
    name: 'vite-plugin-stylus-hexo-config',
    enforce: 'pre',

    transform(code, rawId) {
      const id = rawId.split('?')[0]
      if (!STYL_RE.test(id)) return null

      // 注意：不能像以前那样「没有 hexo-config()/import 就早退」——上游的
      // stylus:renderer filter 对每次样式渲染都会注入 4 个 define 变量，
      // 与源文件内容无关。
      const hasImport = expandImports && /@(import|require)\b/.test(code)

      let body = code
      let fileCount = 1
      if (hasImport) {
        const state = {
          dirStack: [...includePaths.map((p) => path.resolve(p)), path.dirname(id)],
          stack: new Set([id]),
          files: new Set(),
          requires: new Set(),
        }
        body = inlineImports(code, id, state)
        fileCount = state.files.size + 1
      }

      // Hexo define 层（上游主题脚本 stylus:renderer filter）与 hexo-config 变量
      // 同级：都放在展开源码顶部，先 define 再 $cfg_*（顺序不影响求值）。
      const defineLines = hexoDefineLines(loadConfig())
      const { prelude, body: rewritten, count } = rewriteConfigCalls(body)
      const preludeParts = [defineLines.join('\n')]
      if (prelude) preludeParts.push(prelude)
      const out = `${preludeParts.join('\n')}\n${rewritten}`

      if (debug) {
        console.log(
          `[stylus-hexo-config] ${path.basename(id)}: ${count} 个配置键, 展开 ${fileCount} 个文件`,
        )
        console.log(
          `[stylus-hexo-config] ${path.basename(id)}: Hexo define → ${defineLines
            .map((line) => line.replace(/^\$/, '').replace(' = ', '='))
            .join(' ')}`,
        )
      }

      return out === code ? null : { code: out, map: null }
    },
  }
}

export default stylusHexoConfig
