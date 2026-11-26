/**
 * 共享：从构建产物的 index.html 里挑选用于样式基准比对的本地样式表。
 *
 * 为什么抽成模块：verify-css.mjs（字节数 / gzip）与 compare-css-vars.mjs（--anzhiyu-*
 * 变量逐值）必须比对**同一批** CSS 文件，否则两个验收会得出互相矛盾的结论。规则只写
 * 这一份，两边都 import。
 *
 * 为什么要跳过外部样式表：上游主题在开启 snackbar / fancybox / aplayer 等第三方组件时，
 * head 里会先输出若干 CDN 的 `<link rel="stylesheet">`（例如
 * `https://cdn.cbd.int/node-snackbar@0.1.16/dist/snackbar.min.css`），基线 HTML 也是同样
 * 的顺序。这些文件不在本地构建产物里，既没有本地字节数也没有本地变量声明，无法参与比对；
 * 「head 里第一个 stylesheet 就是构建产物」的假设从一开始就不成立，必须按 URL 区分。
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

/** 绝对 URL：带 scheme（http: / https: / data: …）或协议相对（`//cdn...`）。 */
function isAbsoluteUrl(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
}

/** Vite 打包出的样式资源，即站点真实样式（当前为 upstream.<hash>.css）。兼容带 base 前缀（子路径部署）。 */
const ASTRO_CSS_RE = /^(?:\/[^/?#]+)*\/_astro\/[^/?#]+\.css$/i

/** 上游 Head 固定输出的结构性占位（见 public/css/index.css 的说明）。 */
const INDEX_CSS_RE = /^(?:\/[^/?#]+)*\/css\/index\.css$/i

/** 按文档顺序收集 `<link ... rel="stylesheet" ...>` 的 href；忽略没有 href 的占位标签。 */
export function collectStylesheetHrefs(html) {
  const hrefs = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue
    const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (href) hrefs.push(href)
  }
  return hrefs
}

/** 集合本地样式的「路径部分」：去掉查询串 / hash，便于命中构建产物规则。 */
function pathnameOf(href) {
  return href.split(/[?#]/)[0]
}

/**
 * 选出要比对的本地样式表文件（绝对路径，保持文档顺序）。
 *
 * 规则：
 *   1. 跳过绝对 URL（CDN 样式），只留下本地路径；
 *   2. 只有 1 个本地样式表时直接用它；
 *   3. 有多个本地样式表时取构建产物：优先 `/_astro/*.css`（可能有多个 chunk，全部取），
 *      其次 `/css/index.css`；两者都没有则报清晰错误，而不是随便挑一个；
 *   4. 每个选中项都要落在 distDir 内且文件存在，防止越界 / 404。
 *
 * 抛出的 Error.message 是给调用方 `fail()` 直接打印的中文说明。
 *
 * @param {{ html: string, distDir: string, repoRoot: string }} options
 * @returns {{ files: string[], externalHrefs: string[], localHrefs: string[], selectedHrefs: string[] }}
 */
export function selectLocalStylesheets({ html, distDir, repoRoot }) {
  // path.resolve 会把分隔符统一成当前平台的形式，后续 startsWith 比较才不会因斜杠混用出错。
  const root = path.resolve(distDir)

  const hrefs = collectStylesheetHrefs(html)
  if (hrefs.length === 0) {
    throw new Error('index.html 没有引用任何样式表：P1-5 要求构建产出独立 CSS 文件')
  }

  const externalHrefs = hrefs.filter(isAbsoluteUrl)
  const localHrefs = hrefs.filter((href) => !isAbsoluteUrl(href))
  if (localHrefs.length === 0) {
    throw new Error(
      `index.html 只引用了外部样式表（${externalHrefs.join(', ')}），没有可与本地构建产物比对的文件`,
    )
  }

  let selectedHrefs = localHrefs
  if (localHrefs.length > 1) {
    const astroHrefs = localHrefs.filter((href) => ASTRO_CSS_RE.test(pathnameOf(href)))
    selectedHrefs =
      astroHrefs.length > 0
        ? astroHrefs
        : localHrefs.filter((href) => INDEX_CSS_RE.test(pathnameOf(href)))
    if (selectedHrefs.length === 0) {
      throw new Error(
        'index.html 引用了多个本地样式表，但找不到构建产物（/_astro/*.css 或 /css/index.css）：' +
          localHrefs.join(', '),
      )
    }
  }

  const files = []
  for (const href of selectedHrefs) {
    const clean = pathnameOf(href).replace(/^\/+/, '')
    if (!clean) {
      throw new Error(`样式表 href 无法解析为文件路径：${href}`)
    }
    const file = path.resolve(root, clean)
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new Error(`样式表路径越界：${href}`)
    }
    if (!existsSync(file)) {
      throw new Error(`index.html 引用的样式表不存在：${path.relative(repoRoot, file)}`)
    }
    files.push(file)
  }

  return { files, externalHrefs, localHrefs, selectedHrefs }
}
