import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const STYL_RE = /\.styl(us)?$/
const CSS_RE = /\.css$/i
const CONFIG_CALL_RE = /hexo-config\(\s*(['"])([^'"]+)\1\s*\)/g

/**
 * 让为 Hexo 写的 Stylus 能直接在 Vite / Astro 里编译。
 *
 * ## 为什么不用 define 注入 JS 函数
 *
 * 最初的做法是 `css.preprocessorOptions.stylus.define = { 'hexo-config': fn }`。
 * Vite 8 的样式预处理在独立 worker 里跑，实测（2026-11-23，astro 7.4.13 +
 * vite 8.3.8）函数写在 `vite.css` 或插件 `config` 钩子里都到不了编译现场，
 * `stylus.define()` 收不到东西。
 *
 * ## 做法
 *
 * 1. 展开 `.styl` 的 `@import`。Stylus 的 import 由编译器直接读盘，被导入的
 *    文件不经过 Vite 的 transform，而 `hexo-config()` 几乎全在被导入文件里
 *    （上游 `var.styl` 一个文件就 63 处）。`.css` 的 import 保持原样。
 * 2. 扫源码里出现的 `hexo-config('x.y')`，在文件顶部为每个键定义一个变量
 *    `$cfg_x_y = <值>`，并把调用点替换成变量名。
 *
 * 为什么不停留在纯文本替换：
 * - 直接替换成字面量时，`hexo-config('x') ? hexo-config('x') : 99999` 会变成
 *   `"100px" ? convert("100px") : 40px`，Stylus 解析器在字符串字面量后遇到 `?`
 *   会报 `expected "ident", got "?"`。
 * - 换成变量后是 `$cfg_x ? $cfg_x : 40px`，和上游的函数调用形态一致，能正常解析。
 *
 * ## 字符串引号
 *
 * Stylus 不支持字符串内的引号转义（`"a\"b"` 和 `'a\'b'` 都会解析乱），所以按
 * 内容选引号：含双引号用单引号包裹，含单引号用双引号包裹。
 *
 * @typedef {object} Options
 * @property {string} [configPath]  YAML 配置路径，与 config 二选一
 * @property {object} [config]      直接传入配置对象
 * @property {boolean} [expandImports] 展开 .styl 的 @import，默认 true
 * @property {boolean} [warnOnMissing] 引用不存在的键时警告，默认 true
 * @property {boolean} [debug]      打印每个文件的统计
 */

/** @param {Options} options */
export function stylusHexoConfig(options = {}) {
  const {
    configPath,
    expandImports = true,
    warnOnMissing = true,
    debug = false,
  } = options

  if (!configPath && !options.config) {
    throw new Error('[stylus-hexo-config] 需要 configPath 或 config')
  }

  let flatConfig = options.config ? flatten(options.config) : null
  let cachedMtime = 0
  const warnedKeys = new Set()

  function loadConfig() {
    if (!configPath) return flatConfig
    const stat = fs.statSync(configPath)
    if (stat.mtimeMs !== cachedMtime) {
      flatConfig = flatten(YAML.parse(fs.readFileSync(configPath, 'utf8')))
      cachedMtime = stat.mtimeMs
    }
    return flatConfig
  }

  function flatten(obj, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(obj ?? {})) {
      const full = prefix ? `${prefix}.${key}` : key
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, full, out)
      } else {
        out[full] = value
      }
    }
    return out
  }

  function stylusLiteral(value) {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') {
      const hasDouble = value.includes('"')
      const hasSingle = value.includes("'")
      if (hasDouble && !hasSingle) return `'${value}'`
      if (hasSingle && !hasDouble) return `"${value}"`
      if (!hasDouble && !hasSingle) return `"${value}"`
      console.warn(
        `[stylus-hexo-config] 值同时含单双引号，双引号已替换为单引号：${value}`,
      )
      return `"${value.replace(/"/g, "'")}"`
    }
    return JSON.stringify(String(value))
  }

  function resolveImport(spec, fromDir) {
    if (CSS_RE.test(spec)) return []

    if (spec.includes('*')) {
      const starPos = spec.indexOf('*')
      const dirPart = spec.slice(0, starPos).replace(/[\\/]+$/, '')
      const absDir = path.resolve(fromDir, dirPart)
      if (!fs.existsSync(absDir)) return []
      const recursive = spec.includes('**')
      const found = []
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (recursive) walk(full)
          } else if (STYL_RE.test(entry.name)) {
            found.push(full)
          }
        }
      }
      walk(absDir)
      return found.sort()
    }

    for (const candidate of [spec, `${spec}.styl`, `${spec}.stylus`]) {
      const full = path.resolve(fromDir, candidate)
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return [full]
    }
    return []
  }

  function inlineImports(code, filePath, seen) {
    return code.replace(/@import\s+(['"])([^'"]+)\1\s*;?/g, (match, _quote, spec) => {
      const files = resolveImport(spec, path.dirname(filePath))
      if (files.length === 0) return match
      return files
        .map((f) => {
          if (seen.has(f)) return ''
          seen.add(f)
          return inlineImports(fs.readFileSync(f, 'utf8'), f, seen)
        })
        .filter(Boolean)
        .join('\n')
    })
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
      if (!(key in config)) {
        if (warnOnMissing && !warnedKeys.has(key)) {
          warnedKeys.add(key)
          console.warn(
            `[stylus-hexo-config] hexo-config('${key}') 在配置里不存在，按 null 处理`,
          )
        }
        defs.push(`${name} = null`)
      } else {
        defs.push(`${name} = ${stylusLiteral(config[key])}`)
      }
    }

    return {
      prelude: `${defs.join('\n')}\n`,
      body,
      count: registry.size,
    }
  }

  return {
    name: 'vite-plugin-stylus-hexo-config',
    enforce: 'pre',

    transform(code, rawId) {
      const id = rawId.split('?')[0]
      if (!STYL_RE.test(id)) return null

      const hasConfig = code.includes('hexo-config(')
      const hasImport = expandImports && code.includes('@import')
      if (!hasConfig && !hasImport) return null

      let body = code
      let fileCount = 1
      if (hasImport) {
        const seen = new Set([id])
        body = inlineImports(code, id, seen)
        fileCount = seen.size
      }

      const { prelude, body: rewritten, count } = rewriteConfigCalls(body)
      const out = prelude ? `${prelude}\n${rewritten}` : rewritten

      if (debug) {
        console.log(
          `[stylus-hexo-config] ${path.basename(id)}: ${count} 个配置键, 展开 ${fileCount} 个文件`,
        )
      }

      return out === code ? null : { code: out, map: null }
    },
  }
}

export default stylusHexoConfig
