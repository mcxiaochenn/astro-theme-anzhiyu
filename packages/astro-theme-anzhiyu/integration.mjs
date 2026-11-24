/**
 * integration.mjs — 主题自有静态资源的 Astro 接线（P7-6 / W1-D）
 *
 * 背景：上游 Hexo 主题（hexo-theme-anzhiyu）把 `themes/anzhiyu/source/` 整个复制进
 * 站点 `public/`，所以模板里写死的 `<script src="/js/main.js">`、`/js/utils.js`、
 * `/js/tw_cn.js`、`/js/anzhiyu/*.js`、`/js/search/*.js`、`<link href="/css/index.css">`
 * 天然可达。Astro 侧 `public/` 是**站点自己的**目录，主题包不能往里写，所以这一层
 * 由本 integration 承担：主题包 `assets/` → 站点产物 `dist/`（build）或 dev server（dev）。
 *
 * 用法（站点 astro.config.mjs，主题包已作为依赖安装时）：
 *
 *   import anzhiyuAssets from 'astro-theme-anzhiyu/integration'
 *   export default defineConfig({ integrations: [anzhiyuAssets()] })
 *
 * 选项（都可省略）：
 *   - assetsDir  资源目录。默认 `<本文件所在目录>/assets`（即主题包自带 assets/）；
 *                相对路径按 `process.cwd()` 解析。只在站点要换成自己的资源副本时才需要。
 *   - verbose    逐个文件打印复制 / 命中日志，默认 false（只打印一行汇总）。
 *
 * 行为契约：
 *   - build：`astro:build:done` 把 assets/ 逐文件复制进 outDir，保持目录结构。
 *     目标文件已存在时**只 warn、保留站点侧文件**（站点自定义版本优先，主题包不覆盖）。
 *   - dev：`astro:server:setup` 挂 connect 中间件，按 URL 从 assets/ 读文件返回；
 *     不命中（或非 GET/HEAD、目录穿越、目录）就 `next()`，交给 Astro 自己的 404。
 *   - 不引入任何第三方依赖（只用 node:fs / node:path / node:url）。
 *   - 资源目录用 `import.meta.url` 解析：主题包被 `file:` / npm 安装到别处、
 *     或从 `.migration-out/<site>/node_modules/astro-theme-anzhiyu` 加载都能找到。
 */
import { createReadStream, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** integration.mjs 自身所在目录（被安装到任何位置都成立）。 */
const INTEGRATION_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 主题包自带资源目录。 */
const DEFAULT_ASSETS_DIR = path.join(INTEGRATION_DIR, 'assets')

/** 静态中间件用到的 MIME 表；没收录的扩展名回落到 application/octet-stream。 */
const CONTENT_TYPES = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
])

/** 递归列出目录下全部普通文件（返回 POSIX 风格相对路径，按字典序，便于稳定输出）。 */
function walkFiles(root) {
  const out = []
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  walk(root, '')
  return out.sort()
}

function contentTypeOf(file) {
  return CONTENT_TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
}

/**
 * 创建 dev 静态中间件（connect 签名 `(req, res, next)`）。
 * 抽成独立函数是为了能脱离 Astro dev server 直接做冒烟测试。
 */
function createAssetsMiddleware(options) {
  const { assetsDir, logger, verbose } = options
  let { base } = options
  if (!base || !base.startsWith('/')) base = '/'
  // '/blog/' → '/blog'：dev 下请求可能是带 base 的原始 URL（Vite 已剥 base 时也不出错）
  const basePrefix = base === '/' ? '' : base.replace(/\/+$/, '')

  return function anzhiyuAssetsMiddleware(req, res, next) {
    const method = req.method || 'GET'
    if (method !== 'GET' && method !== 'HEAD') return next()

    const rawUrl = req.url || ''
    if (!rawUrl.startsWith('/')) return next()

    let pathname
    try {
      pathname = decodeURIComponent(rawUrl.split('?')[0].split('#')[0])
    } catch {
      // 非法百分号编码：交给后面的中间件处理
      return next()
    }

    if (basePrefix && pathname.startsWith(`${basePrefix}/`)) {
      pathname = pathname.slice(basePrefix.length)
    }

    // NUL 截断 & 空路径直接放行
    if (!pathname || pathname.includes('\0')) return next()
    const rel = pathname.replace(/^\/+/, '')
    if (!rel) return next()

    // 目录穿越防护：解析后必须仍在 assetsDir 内
    const filePath = path.resolve(assetsDir, rel)
    if (!filePath.startsWith(assetsDir + path.sep)) return next()

    let stat
    try {
      stat = statSync(filePath)
    } catch {
      return next() // 不存在 → 交给 Astro（最终 404）
    }
    if (!stat.isFile()) return next()

    res.statusCode = 200
    res.setHeader('Content-Type', contentTypeOf(filePath))
    res.setHeader('Content-Length', String(stat.size))
    // dev 下改完资源要立刻生效，不缓存
    res.setHeader('Cache-Control', 'no-cache')
    if (method === 'HEAD') {
      res.end()
      return undefined
    }

    if (verbose) logger.info(`dev 命中 ${pathname}`)

    const stream = createReadStream(filePath)
    stream.on('error', (error) => {
      logger.warn(`读取 ${rel} 失败：${error.message}`)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
    stream.pipe(res)
    return undefined
  }
}

/**
 * @typedef {object} AnzhiyuAssetsOptions
 * @property {string} [assetsDir] 资源目录，默认 `<主题包>/assets`
 * @property {boolean} [verbose]  是否逐文件打印日志
 */

/**
 * 主题静态资源 integration。
 * @param {AnzhiyuAssetsOptions} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function anzhiyuAssets(options = {}) {
  const assetsDir = path.resolve(options.assetsDir || DEFAULT_ASSETS_DIR)
  const verbose = options.verbose === true
  let base = '/'
  let warnedMissingAssetsDir = false

  return {
    name: 'anzhiyu-assets',
    hooks: {
      'astro:config:done': ({ config, logger }) => {
        base = config.base || '/'
        // 资源目录缺失不是每页都该报的错：只在确实没搬过包时才 warn 一次（build 阶段会再提示）
        if (!existsSync(assetsDir) && !warnedMissingAssetsDir) {
          warnedMissingAssetsDir = true
          logger.warn(`资源目录不存在：${assetsDir}（/js/* 与 /css/index.css 将 404）`)
        }
      },

      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(
          createAssetsMiddleware({
            assetsDir,
            base,
            logger,
            verbose,
          }),
        )
        if (verbose) {
          logger.info(`dev 中间件已挂载：${path.relative(process.cwd(), assetsDir) || assetsDir}`)
        }
      },

      'astro:build:done': ({ dir, logger }) => {
        if (!existsSync(assetsDir)) {
          logger.warn(`资源目录不存在，跳过复制：${assetsDir}`)
          return
        }
        const outDir = fileURLToPath(dir)
        const files = walkFiles(assetsDir)
        const conflicts = []
        let copied = 0

        for (const rel of files) {
          const from = path.join(assetsDir, rel)
          const to = path.join(outDir, rel)
          if (existsSync(to)) {
            // 站点侧已经有同名文件（例如站点 public/ 里自己维护的版本）：
            // 保留站点版本，不覆盖，只记一条 warn。
            conflicts.push(rel)
            continue
          }
          mkdirSync(path.dirname(to), { recursive: true })
          copyFileSync(from, to)
          copied += 1
          if (verbose) logger.info(`+ ${rel}`)
        }

        if (conflicts.length > 0) {
          logger.warn(
            `${conflicts.length} 个主题资源在产物里已存在，保留站点侧文件：${conflicts.join(', ')}`,
          )
        }
        logger.info(
          `复制 ${copied} 个主题静态资源 → ${path.relative(process.cwd(), outDir) || '.'}` +
            (conflicts.length > 0 ? `（跳过 ${conflicts.length} 个已存在文件）` : ''),
        )
      },
    },
  }
}
