#!/usr/bin/env node
/**
 * check-slugger.mjs — `src/utils/slugger.ts`（Hexo marked 标题 id 语义）验收。
 *
 * oracle 来源：`.baseline-html/*／<yyyy>/<mm>/<dd>/<slug>/index.html` 里每篇文章
 * `<h1 id="CrawlerTitle">` 之外的标题 id。9 篇文章的 id 列表**硬编码**在下方
 * `BASELINE_IDS`，脚本在任何机器上都能独立运行；`.baseline-html/` 存在时再加一段
 * 「拿基线真实标题文本回放」的活体对拍（不存在则 SKIP）。
 *
 * 断言：
 *   A. slugize：中文标点保留、驼峰保留、ASCII 标点/空白折叠为 `-`、首尾分隔符裁剪；
 *   B. 重复标题：`x`、`x-1`、`x-2`（上游 headingId 计数键是基础 slug）；
 *   C. rewriteHeadings：补 `a.headerlink`（href/title）、替换 Astro 旧 id；
 *   D. 9 篇基线文章 id 列表逐条相等（硬编码 oracle）；
 *   E. 活体对拍（可选）：从基线 HTML 抽标题文本，回放 rewriteHeadings 后 id 必须一致。
 *
 * 用法（在 仓库根目录下）：
 *   node scripts/check-slugger.mjs
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const REPO_ROOT = path.resolve(PKG_ROOT)
const BASELINE_HTML = process.env.BASELINE_HTML_DIR
  ? path.resolve(process.env.BASELINE_HTML_DIR)
  : path.join(REPO_ROOT, '.baseline-html')

const S = await import('../src/utils/slugger.ts')

const log = (...args) => console.log('[check-slugger]', ...args)
let passed = 0
let failed = 0
let skipped = 0

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    log(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function equal(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(label, ok, ok ? '' : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}

/* ================================================================== */
/* A. slugize 单点                                                */
/* ================================================================== */

log('§A slugize 单点')

const cases = [
  // [输入, 期望 id, 说明]
  ['不能被「优化」的部分', '不能被「优化」的部分', '中文引号保留'],
  ['为什么需要一份固定的参考产物', '为什么需要一份固定的参考产物', '纯中文'],
  ['p 与 span', 'p-与-span', '空白折叠为 -'],
  ['checkbox / radio', 'checkbox-radio', '空格+斜杠统一成一个 -'],
  ['audio / video', 'audio-video', '空格+斜杠统一成一个 -'],
  ['btns / cell', 'btns-cell', '空格+斜杠统一成一个 -'],
  ['note 系列', 'note-系列', '中英混排'],
  ['galleryGroup', 'galleryGroup', '驼峰原样（modifyAnchors: 0）'],
  ['intCard', 'intCard', '驼峰原样'],
  ['  leading and trailing  ', 'leading-and-trailing', '首尾空白裁剪'],
  ['a---b', 'a-b', '连续分隔符折叠'],
  ['A.B,C;D', 'A-B-C-D', 'ASCII 标点'],
  ['naïve café', 'naive-cafe', '变音符号 NFKD'],
  ['ÆØß', 'AEOs', '连字手工映射'],
  ['', '', '空串'],
]
for (const [input, expected, note] of cases) {
  equal(`slugize(${JSON.stringify(input)}) — ${note}`, S.slugize(input), expected)
}

/* ================================================================== */
/* B. 重复标题                                                     */
/* ================================================================== */

log('§B 重复标题')
{
  const slug = S.createHeadingSlugger(0)
  equal('第一次', slug('正文'), '正文')
  equal('第二次', slug('正文'), '正文-1')
  equal('第三次', slug('正文'), '正文-2')
  equal('另一个标题', slug('代码块'), '代码块')
}

/* ================================================================== */
/* C. rewriteHeadings                                              */
/* ================================================================== */

log('§C rewriteHeadings')
{
  const input =
    '<h2 id="p-与-span">p 与 span</h2>' +
    '<h3 id="dup">重复</h3><h3 id="dup-1">重复</h3>' +
    '<h2 class="sr-only" id="footnote-label">Footnotes</h2>'
  const { html, headings } = S.rewriteHeadings(input)
  equal(
    '输出 HTML',
    html,
    '<h2 id="p-与-span"><a href="#p-与-span" class="headerlink" title="p 与 span"></a>p 与 span</h2>' +
      '<h3 id="重复"><a href="#重复" class="headerlink" title="重复"></a>重复</h3>' +
      '<h3 id="重复-1"><a href="#重复-1" class="headerlink" title="重复"></a>重复</h3>' +
      '<h2 class="sr-only" id="footnote-label">Footnotes</h2>',
  )
  equal('抽取的标题（不含脚注）', headings, [
    { level: 2, id: 'p-与-span', text: 'p 与 span' },
    { level: 3, id: '重复', text: '重复' },
    { level: 3, id: '重复-1', text: '重复' },
  ])
  // 幂等：再跑一遍不应叠加锚点
  equal('幂等', S.rewriteHeadings(html).html, html)
}

/* ================================================================== */
/* D. 基线 id oracle（硬编码）                                       */
/* ================================================================== */

log('§D 基线 id oracle')

/** 9 篇文章的 h2–h6 id（`.baseline-html/<yyyy>/<mm>/<dd>/<slug>/index.html`）。 */
const BASELINE_IDS = {
  '2024/11/01/longform-hexo-astro': [
    '为什么需要一份固定的参考产物',
    '三个层次',
    '不能被「优化」的部分',
    '代码块',
    '表格与列表',
    '图片与行内元素',
    '数学与脚注',
    '收尾',
  ],
  '2024/12/15/short-note': [],
  '2025/01/10/multi-taxonomy': ['分类的层级', '标签的计数', '正文'],
  '2025/02/02/sticky-top': ['取值优先级', '正文'],
  '2025/02/20/cover-variants': ['三个分支的判定点', '正文'],
  '2025/03/05/tags-inline': ['六种行内修饰', 'label', '图片与图标', '按钮', 'p-与-span', '结尾'],
  '2025/03/18/tags-block': ['note-系列', 'tabs-系列', 'hide-系列', 'folding', 'checkbox-radio', 'timeline'],
  '2025/04/01/tags-media': [
    'image',
    'inlineimage',
    'audio-video',
    'gallery',
    'galleryGroup',
    'site',
    'btns-cell',
  ],
  '2025/04/20/tags-thirdparty': [
    'bilibili',
    'dogeplayer',
    'mermaid',
    'tip',
    'link',
    'intCard',
    'flink',
  ],
}

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 由「标题文本」列表生成一篇合成正文，再用 rewriteHeadings 取 id。 */
function idsFromTexts(texts) {
  const html = texts.map((text, index) => `<h2 id="astro-${index}">${escapeHtml(text)}</h2>`).join('')
  return S.rewriteHeadings(html).headings.map((item) => item.id)
}

/**
 * 基线里「标题文本 → id」不是恒等：`checkbox / radio` → `checkbox-radio`。
 * 这里按 id 反推可见文本（用 `-` 还原成空格），只用于硬编码 oracle 的回放；
 * 含中文标点/驼峰的行有单独用例覆盖（§A），不依赖还原。
 */
function textFromId(id) {
  if (id === 'p-与-span') return 'p 与 span'
  if (id === 'checkbox-radio') return 'checkbox / radio'
  if (id === 'audio-video') return 'audio / video'
  if (id === 'btns-cell') return 'btns / cell'
  if (id === 'note-系列') return 'note 系列'
  if (id === 'tabs-系列') return 'tabs 系列'
  if (id === 'hide-系列') return 'hide 系列'
  return id
}

for (const [page, expected] of Object.entries(BASELINE_IDS)) {
  const texts = expected.map(textFromId)
  equal(`${page} — ${expected.length} 个标题`, idsFromTexts(texts), expected)
}

/* ================================================================== */
/* E. 活体对拍（baseline HTML 存在时）                                */
/* ================================================================== */

log('§E 活体对拍')
if (!existsSync(BASELINE_HTML)) {
  skipped += 1
  log(`SKIP 基线目录不存在：${path.relative(REPO_ROOT, BASELINE_HTML)}`)
} else {
  const HEADING_RE = /<h([2-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g
  let checkedPages = 0
  let checkedHeadings = 0

  for (const page of Object.keys(BASELINE_IDS)) {
    const file = path.join(BASELINE_HTML, page, 'index.html')
    if (!existsSync(file)) {
      skipped += 1
      log(`SKIP 缺页：${page}`)
      continue
    }
    const html = readFileSync(file, 'utf8')
    // 只取正文 #article-container 里的标题（排除 #post-info 的 h1.post-title）
    const article = /<article\b[^>]*id="article-container"[^>]*>([\s\S]*?)<\/article>/.exec(html)
    const scope = article ? article[1] : html
    const found = [...scope.matchAll(HEADING_RE)].map((match) => ({
      level: Number(match[1]),
      id: (/\bid="([^"]*)"/.exec(match[2]) || [])[1] ?? '',
      inner: match[3],
    }))
    // 基线标题内部带 `<a class="headerlink">`，去掉后作为「文本」回放
    const texts = found.map((item) => item.inner.replace(/^<a\b[^>]*class="[^"]*headerlink[^"]*"[^>]*><\/a>/, ''))
    const synthetic = found
      .map((item, index) => `<h${item.level} id="astro-${index}">${texts[index]}</h${item.level}>`)
      .join('')
    const actual = S.rewriteHeadings(synthetic).headings

    const ids = actual.map((item) => item.id)
    equal(`${page} id 列表`, ids, found.map((item) => item.id))
    equal(`${page} 层级`, actual.map((item) => item.level), found.map((item) => item.level))
    checkedPages += 1
    checkedHeadings += actual.length
  }

  log(`活体对拍：${checkedPages} 页 / ${checkedHeadings} 个标题`)
}

/* ================================================================== */
/* 汇总                                                             */
/* ================================================================== */

log(`汇总：PASS ${passed} / FAIL ${failed} / SKIP ${skipped}`)
process.exitCode = failed === 0 ? 0 : 1
