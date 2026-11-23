/**
 * math/render.mjs — 上游 `layout/includes/third-party/math/*.pug`（P5-1）。
 *
 * 映射：
 *   renderMathIndex ← index.pug:1-18    （mathjax / katex / mermaid 三段）
 *   renderKatex     ← katex.pug:1-9
 *   renderMathjax   ← mathjax.pug:1-38
 *   renderMermaid   ← mermaid.pug:1-38
 *
 * 门控：
 *   - mathjax/katex：`theme.<key>.enable`，且 per_page=true 时要求 post/page 页，
 *     per_page=false 时要求 `page.mathjax` / `page.katex`（上游 index.pug:1-15）；
 *   - mermaid：`theme.mermaid.enable`（index.pug:17-18）。
 * 上游挂载点：additional-js.pug:72（.js-pjax 内，comments/js 之前）。
 */
import { asset, flag, inlineScript, obj, pageOf, srcScript, styleLink } from '../_kit.mjs'

/** index.pug:2-7 / 10-15 的 per_page / 页面 front-matter 门控。 */
function perPageGate(theme, key, page) {
  if (!flag(theme[key], 'enable')) return false
  const perPage = flag(theme[key], 'per_page')
  if (perPage) return true // 上游 is_post() || is_page()，布局页恒真
  return page[key] === true
}

/** katex.pug:1-9 */
export function renderKatex(theme, props = {}) {
  if (!perPageGate(theme, 'katex', pageOf(props))) return ''
  const css = styleLink(asset(theme, 'katex'), { type: 'text/css' })
  const copytex = srcScript(asset(theme, 'katex_copytex'))
  const body = `(() => {
    document.querySelectorAll('#article-container span.katex-display').forEach(item => {
      anzhiyu.wrap(item, 'div', { class: 'katex-wrap'})
    })
  })()`
  return css + copytex + inlineScript(body)
}

/** mathjax.pug:1-38（MathJax 3 配置 + #MathJax-script 动态插入） */
export function renderMathjax(theme, props = {}) {
  if (!perPageGate(theme, 'mathjax', pageOf(props))) return ''
  const body = `if (!window.MathJax) {
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        tags: 'ams'
      },
      chtml: {
        scale: 1.1
      },
      options: {
        renderActions: {
          findScript: [10, doc => {
            for (const node of document.querySelectorAll('script[type^="math/tex"]')) {
              const display = !!node.type.match(/; *mode=display/)
              const math = new doc.options.MathItem(node.textContent, doc.inputJax[0], display)
              const text = document.createTextNode('')
              node.parentNode.replaceChild(text, node)
              math.start = {node: text, delim: '', n: 0}
              math.end = {node: text, delim: '', n: 0}
              doc.math.push(math)
            }
          }, '']
        }
      }
    }

    const script = document.createElement('script')
    script.src = '${asset(theme, 'mathjax')}'
    script.id = 'MathJax-script'
    script.async = true
    document.head.appendChild(script)
  } else {
    MathJax.startup.document.state(0)
    MathJax.texReset()
    MathJax.typesetPromise()
  }`
  return inlineScript(body)
}

/** mermaid.pug:1-38 —— .mermaid-wrap 渲染 + 主题切换。 */
export function renderMermaid(theme) {
  if (!flag(theme.mermaid, 'enable')) return ''
  const themes = obj(obj(theme.mermaid).theme)
  const body = `(() => {
    const $mermaid = document.querySelectorAll('#article-container .mermaid-wrap')
    if ($mermaid.length === 0) return
    const runMermaid = () => {
      window.loadMermaid = true
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? ${JSON.stringify(themes.dark ?? 'dark')} : ${JSON.stringify(themes.light ?? 'default')}

      Array.from($mermaid).forEach((item, index) => {
        const mermaidSrc = item.firstElementChild
        const mermaidThemeConfig = '%%{init:{ \\'theme\\':\\'' + theme + '\\'}}%%\\n'
        const mermaidID = 'mermaid-' + index
        const mermaidDefinition = mermaidThemeConfig + mermaidSrc.textContent

        const renderFn = mermaid.render(mermaidID, mermaidDefinition)

        const renderV10 = () => {
          renderFn.then(({svg}) => {
            mermaidSrc.insertAdjacentHTML('afterend', svg)
          })
        }

        const renderV9 = svg => {
          mermaidSrc.insertAdjacentHTML('afterend', svg)
        }

        typeof renderFn === 'string' ? renderV9(renderFn) : renderV10()
      })
    }

    const loadMermaid = () => {
      window.loadMermaid ? runMermaid() : getScript('${asset(theme, 'mermaid')}').then(runMermaid)
    }

    anzhiyu.addGlobalFn('themeChange', runMermaid, 'mermaid')

    window.pjax ? loadMermaid() : document.addEventListener('DOMContentLoaded', loadMermaid)
  })()`
  return inlineScript(body)
}

/** index.pug:1-18 —— 按上游顺序拼接（mathjax → katex → mermaid）。 */
export function renderMathIndex(theme, props = {}) {
  return (
    renderMathjax(theme, props) +
    renderKatex(theme, props) +
    renderMermaid(theme)
  )
}

export const mathRenderers = {
  index: renderMathIndex,
  katex: renderKatex,
  mathjax: renderMathjax,
  mermaid: renderMermaid,
}
