/**
 * tag 实现共用的运行时小工具。
 *
 * 这里刻意只做「上游脚本里确实用到的那几件事」，不引入 hexo / hexo-util：
 *   - `url_for()` 在基准站配置下（`url: https://…`、`root: /`）是恒等映射，
 *     绝对路径与协议 URL 原样返回，相对路径补一个 `/`；
 *   - `stripIndent()` / `trimBlockBody()` 复刻 Hexo `NunjucksBlock` 的 `trimBody`；
 *   - `commaArgs()` 复刻上游 `args.join(' ').split(',')` 的惯用写法。
 *
 * @module remark-hexo-tag/runtime
 */

/**
 * 复刻 hexo-util 的 `stripIndent()`（`stripIndent: true` 默认行为）：
 * 取所有非空行里最小的行首空白宽度，整段裁掉。
 *
 * @param {string} value
 * @returns {string}
 */
export function stripIndent(value) {
  const matches = value.match(/^[ \t]*(?=\S)/gm)
  if (!matches) return value
  const indent = Math.min(...matches.map((line) => line.length))
  if (indent === 0) return value
  return value.replace(new RegExp(`^[ \\t]{${indent}}`, 'gm'), '')
}

/**
 * 复刻 Hexo `extend/tag.js` 的：
 *
 *     trimBody = (body) => stripIndent(body).replace(/^\n?|\n?$/g, '')
 *
 * 即「先按最小缩进裁掉行首空白，再去掉最多一个开头换行和一个结尾换行」。
 *
 * @param {string} value
 * @returns {string}
 */
export function trimBlockBody(value) {
  return stripIndent(value).replace(/^\n?/, '').replace(/\n?$/, '')
}

/**
 * 上游 `hexo-util` 的 `url_for()` 在基准站配置下的等价实现。
 *
 * 基准站 `_config.yml` 为 `url: https://baseline.anzhiyu.test`、`root: /`，
 * 因此：
 *   - `/img/a.png`、`https://…`、`//cdn/…`、`#hash`、`mailto:` → 原样；
 *   - `img/a.png` → `/img/a.png`。
 *
 * 真正站点若把 `root` 配成子路径，需要换成完整的 `url_for` 实现（见 README 限制）。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function urlFor(value) {
  if (value === undefined || value === null) return ''
  const url = String(value)
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return url
  return `/${url}`
}

/**
 * 复刻上游 9 个脚本里反复出现的 `args.join(' ').split(',')`。
 *
 * Hexo 的 `args` 是按空白切开的 token（Nunjucks 的词法），所以逗号后面的空格
 * 会留在下一个 token 里（例如 `['blue', ' 1.2']`）。上游大量依赖这一点产生
 * `width: 1.2em` 这种带空格的内联样式，这里必须原样保留、**不要 trim**。
 *
 * @param {string[]} args 空白切分后的参数
 * @returns {string[]}
 */
export function commaArgs(args) {
  return args.join(' ').split(',')
}

/** 把任何值变成可嵌入 HTML 的字符串（上游不做转义，这里也不做）。 */
export function toHtml(value) {
  return value === undefined || value === null ? '' : String(value)
}
