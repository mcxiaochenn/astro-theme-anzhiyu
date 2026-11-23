/**
 * toc.ts — 文章目录的数据契约（P2-8 / P3-1 共用）。
 *
 * 上游 `toc(page.content)` 返回的是已经渲染好的嵌套 `<ol class="toc">`；Astro 侧
 * 拆成「标题数据」与「渲染」两步：
 *   - 文章页（P2-8）从渲染后的正文里抽出标题，传给 BaseLayout；
 *   - 侧栏 TOC 卡片（P3-1）只负责按 level 建树并渲染成上游 DOM。
 *
 * 这样两边都不需要重新解析 Markdown，也不会出现「正文标题与目录不一致」。
 */
export interface TocHeading {
  /** 标题文本（已去掉锚点链接）。 */
  text: string;
  /** 标题 id（Hexo/marked 兼容 slugger 的产物，P2-8 M3）。 */
  id: string;
  /** 1–6，对应 h1–h6。上游 TOC 默认从 h2 开始。 */
  level: number;
}

/** `toc` helper 的渲染开关（对应上游 `toc(page.content, { list_number })`）。 */
export interface RenderTocOptions {
  /** `theme.toc.number` / `page.toc_number`。 */
  listNumber?: boolean;
}

/**
 * 把标题列表渲染成上游 `toc()` helper 的 `<ol class="toc">`。
 *
 * 逐行移植 hexo `plugins/helper/toc.js`（1.7.1 依赖的 hexo 7.x）：
 *   - `li` 的 class 是 `toc-item toc-level-<level>`；
 *   - 编号 `<span class="toc-number">` 用「首层到当前层」的 `lastNumber` 拼接；
 *   - 层级变深时插入 `<ol class="toc-child">`，变浅时连续 `</li></ol>`；
 *   - `href` 走 hexo-util `encodeURL(id)`（`encodeURI(unescape(id))`）。
 *
 * 返回 HTML 字符串，由调用方 `set:html` 插入——这样 `<li>` 之间不会因为
 * Astro 模板缩进引入多余空白节点。
 */
export function renderToc(headings: readonly TocHeading[], options: RenderTocOptions = {}): string {
  if (!headings.length) return ''
  const listNumber = options.listNumber !== false

  let result = '<ol class="toc">'
  const lastNumber = [0, 0, 0, 0, 0, 0]
  let firstLevel = 0
  let lastLevel = 0

  for (const heading of headings) {
    const level = clampLevel(heading.level)
    const href = heading.id ? `#${encodeUrl(heading.id)}` : null

    lastNumber[level - 1]++
    for (let i = level; i <= 5; i++) lastNumber[i] = 0

    if (firstLevel) {
      for (let i = level; i < lastLevel; i++) result += '</li></ol>'
      if (level > lastLevel) result += '<ol class="toc-child">'
      else result += '</li>'
    } else {
      firstLevel = level
    }

    result += `<li class="toc-item toc-level-${level}">`
    result += href
      ? `<a class="toc-link" href="${escapeAttribute(href)}">`
      : '<a class="toc-link">'

    if (listNumber) {
      result += '<span class="toc-number">'
      for (let i = firstLevel - 1; i < level; i++) result += `${lastNumber[i]}.`
      result += '</span> '
    }

    result += `<span class="toc-text">${escapeText(heading.text)}</span></a>`
    lastLevel = level
  }

  for (let i = firstLevel - 1; i < lastLevel; i++) result += '</li></ol>'
  return result
}

/** 上游只处理 h1–h6；越界值夹到合法区间，避免数组下标越界。 */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 2
  return Math.min(6, Math.max(1, Math.trunc(level)))
}

/** hexo-util `encodeURL()` 的非绝对 URL 分支：`encodeURI(unescape(str))`。 */
function encodeUrl(value: string): string {
  try {
    return encodeURI(decodeURIComponent(value))
  } catch {
    return encodeURI(value)
  }
}

/** 文本转义与 hexo-util `escapeHTML()` 同表（`&<>"'`/=`）。 */
function escapeText(value: string): string {
  return value
    .replace(/&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
    .replace(/\//g, '&#x2F;')
    .replace(/=/g, '&#x3D;')
}

/** href 只需要 HTML 属性转义（id 已经过 encodeURI，不含引号）。 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
