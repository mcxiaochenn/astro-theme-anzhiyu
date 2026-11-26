#!/usr/bin/env node
/**
 * 用 P6-1 的 remark 插件渲染 `tests/baseline-content/tags-{inline,block}.md`，与上游基准
 * （`.baseline-html/…`）的文章正文做对比。这是同目录 `run.mjs` 之外的整页级验收：
 *
 *   - 渲染产物里不允许再出现 `{%`（tag 必须全部被消费）；
 *   - 正文 **文本** 必须与基准完全一致（白空格归一化后比较）；
 *   - 同时把两份正文片段写到临时目录，方便再跑 `scripts/diff-html.mjs` 看结构差异。
 *
 * 运行：
 *   node tests/remark-hexo-tag/render-fixtures.mjs
 *
 * 输出（默认写到系统临时目录下的 `remark-hexo-tag-p61/`）：
 *   tags-inline.baseline.html / tags-inline.rendered.html
 *   tags-block.baseline.html  / tags-block.rendered.html
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

/**
 * 直接 import 示例站的 `astro.config.mjs`，用它导出的 **真实 Markdown 处理器**
 * （包含 `remarkPlugins: [[remarkHexoTag, …]]` 与 rehype 侧的代码块重建）。
 * 这样验证的是构建时实际跑的管线，而不是测试里另建的一份。
 */
const { default: astroConfig } = await import(
  new URL('../../astro.config.mjs', import.meta.url).href
)
const processor = await astroConfig.markdown.processor.createRenderer({})

const PAGES = [
  { slug: 'tags-inline', date: '2025/03/05' },
  { slug: 'tags-block', date: '2025/03/18' },
  { slug: 'tags-media', date: '2025/04/01' },
  { slug: 'tags-thirdparty', date: '2025/04/20' },
]

/** 去掉 frontmatter。 */
function stripFrontmatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}

/**
 * 上游 Hexo `PostRenderEscape.escapeAllSwigTags` 的已知缺陷，不计入 tag 差异：
 *
 *   `swig_tag_name !== '' && str.includes(`end${swig_tag_name}`)`
 *
 * 用「子串包含」判断是否为容器 tag。于是 `{% video %}` 命中 `{% endvideos %}`、
 * `{% site %}` 命中 `{% endsitegroup %}`，Hexo 会把从 `{% video %}` 到
 * `{% endvideos %}` 的整段（包括中间的 `## videos` / `## sitegroup` 标题）当成
 * 一个 Nunjucks 占位块：Markdown 先跑完，标题就成了字面量 `## videos`。
 *
 * 这是上游的转义 bug（浏览器/阅读体验都是错的），本插件不复刻；验收时把这两处
 * 从基准文本里还原成正常标题文本再比较。
 */
const KNOWN_BASELINE_DELTAS = {
  'tags-media': [
    ['## videos', 'videos'],
    ['## sitegroup', 'sitegroup'],
  ],
}

/** 取基准页 `<article>` 里、文章头部 `<header>` 之后的正文。 */
function baselineBody(html) {
  const article = /<article class="post-content"[^>]*>([\s\S]*?)<\/article>/.exec(html)
  if (!article) throw new Error('基准页里找不到 <article class="post-content">')
  return article[1].replace(/^[\s\S]*?<\/header>/, '')
}

/** 归一化文本：去标签、解少量实体、折叠空白。 */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // 先吃掉「两个标签之间只有空白」的排版差异，再拆标签；
    // 否则 Hexo 的 `</h2><p>` 与 remark 的 `</h2>\n<p>` 会凭空多出一个空格。
    .replace(/>\s+</g, '><')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 找第一处文本差异，打印上下文。 */
function describeTextDiff(expected, actual) {
  const max = Math.min(expected.length, actual.length)
  let index = 0
  while (index < max && expected[index] === actual[index]) index += 1
  const from = Math.max(0, index - 40)
  return {
    index,
    expected: expected.slice(from, index + 60),
    actual: actual.slice(from, index + 60),
  }
}

const outDir =
  process.env.P61_OUT_DIR || path.join(os.tmpdir(), 'remark-hexo-tag-p61')
mkdirSync(outDir, { recursive: true })

let failed = 0

for (const page of PAGES) {
  const fixturePath = path.join(repoRoot, 'tests/baseline-content', `${page.slug}.md`)
  const baselinePath = path.join(repoRoot, '.baseline-html', page.date, page.slug, 'index.html')

  const markdown = stripFrontmatter(readFileSync(fixturePath, 'utf8'))
  const rendered = (await processor.render(markdown, {})).code

  const baselineHtml = readFileSync(baselinePath, 'utf8')
  let expectedBody = baselineBody(baselineHtml)

  const leftover = (rendered.match(/\{%/g) || []).length
  for (const [from, to] of KNOWN_BASELINE_DELTAS[page.slug] || []) {
    expectedBody = expectedBody.split(from).join(to)
  }
  const expectedText = textOf(expectedBody)
  const actualText = textOf(rendered)

  const baselineOut = path.join(outDir, `${page.slug}.baseline.html`)
  const renderedOut = path.join(outDir, `${page.slug}.rendered.html`)
  writeFileSync(baselineOut, `<!doctype html><html><body><div id="content">${expectedBody}</div></body></html>`)
  writeFileSync(renderedOut, `<!doctype html><html><body><div id="content">${rendered}</div></body></html>`)

  console.log(`\n== ${page.slug} ==`)
  console.log(`  文件: ${path.relative(repoRoot, fixturePath)}`)
  console.log(`  渲染产物 \`{%\` 残留: ${leftover}`)
  console.log(`  正文文本: 期望 ${expectedText.length} 字符 / 实际 ${actualText.length} 字符`)

  if (leftover !== 0) {
    failed += 1
    console.log('  ✗ 仍有未消费的 tag')
  }

  if (expectedText === actualText) {
    console.log('  ✓ 正文文本一致')
  } else if (expectedText.replace(/\s+/g, '') === actualText.replace(/\s+/g, '')) {
    // 只剩块级边界空白差异（上游把标题变成字面量后，文本节点的空白位置会变）
    console.log('  ✓ 正文文本一致（忽略块级边界空白）')
  } else {
    failed += 1
    const diff = describeTextDiff(expectedText, actualText)
    console.log(`  ✗ 正文文本在字符 ${diff.index} 处开始不同`)
    console.log(`    期望: …${diff.expected}…`)
    console.log(`    实际: …${diff.actual}…`)
  }

  console.log(`  片段已写出：${baselineOut}`)
  console.log(`              ${renderedOut}`)
}

console.log(`\nrender-fixtures: ${failed === 0 ? '全部一致' : `${failed} 项不一致`}`)
process.exitCode = failed === 0 ? 0 : 1
