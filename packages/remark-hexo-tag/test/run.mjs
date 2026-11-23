#!/usr/bin/env node
/**
 * remark-hexo-tag 对拍测试（P6-1）。
 *
 * 思路：
 *   - 用 `examples/blog` 里同一套 `@astrojs/markdown-remark` 建一个处理器
 *     （`smartypants: false`、`syntaxHighlight: false`），把本插件挂上；
 *   - 每个 tag 给一段最小 Markdown 输入 + **上游产物的硬编码 oracle**
 *     （直接从 `.baseline-html/2025/03/05/tags-inline`、`2025/03/18/tags-block`
 *      与上游 `scripts/tag/*.js` 的模板抄下来，见 docs/notes/P6-1-hexo-tags.md）；
 *   - 归一化只吃掉渲染语义无关的差异：属性引号由 parse5 统一成双引号、
 *     void 元素的 `/`、标签之间的空白。属性值里的空格（例如
 *     `class="timeline blue"`、`width: 1.2em`）必须保留。
 *
 * 运行：
 *   node packages/remark-hexo-tag/test/run.mjs
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import remarkHexoTag from '../src/index.mjs'
import { parseArgs } from '../src/parser.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

/** 从 examples/blog 解析 @astrojs/markdown-remark（它是那个包的直接依赖）。 */
const require = createRequire(path.join(repoRoot, 'examples/blog/package.json'))
const markdownRemarkEntry = require.resolve('@astrojs/markdown-remark')
const { createMarkdownProcessor } = await import(pathToFileURL(markdownRemarkEntry).href)

const warnings = []
const processor = await createMarkdownProcessor({
  smartypants: false,
  syntaxHighlight: false,
  remarkPlugins: [
    [
      remarkHexoTag,
      {
        noteStyle: 'flat',
        onWarning: (message) => warnings.push(message),
      },
    ],
  ],
  rehypePlugins: [],
})

/** 渲染 Markdown → HTML。 */
async function render(markdown) {
  const result = await processor.render(markdown, {})
  return result.code
}

/**
 * 归一化：
 *   - 标签之外（文本节点）的空白折叠成一个空格；
 *   - void 元素的 ` />` 去掉斜杠；
 *   - 只剩空白的两个标签之间直接贴合。
 *
 * 属性值内部不动，保证 `class="tab active"` 这种双空格能被发现。
 */
function canon(html) {
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) return part.replace(/\s*\/>$/, '>')
      return part.replace(/\s+/g, ' ')
    })
    .join('')
    .replace(/>\s+</g, '><')
    .trim()
}

/** 纯文本（用于 `<p>` 这种 HTML5 会重排结构的 tag）。 */
function textOf(html) {
  return html
    .replace(/>\s+</g, '><')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 断言。 */
function assertEqual(name, actual, expected) {
  if (actual === expected) return true
  console.error(`\n✗ ${name}`)
  console.error(`  期望: ${expected}`)
  console.error(`  实际: ${actual}`)
  return false
}

/** @type {Array<{ name: string, input: string, expected: string, mode?: 'html' | 'text' }>} */
const cases = [
  // ── 行内语义 12 个 ────────────────────────────────────────────────────────
  {
    name: 'u',
    input: '普通文字：{% u 带下划线的文字 %}。',
    expected: '<p>普通文字：<u>带下划线的文字</u>。</p>',
  },
  {
    name: 'emp',
    input: '普通文字：{% emp 带着重号的文字 %}。',
    expected: '<p>普通文字：<emp>带着重号的文字</emp>。</p>',
  },
  {
    name: 'wavy',
    input: '普通文字：{% wavy 波浪线文字 %}。',
    expected: '<p>普通文字：<wavy>波浪线文字</wavy>。</p>',
  },
  {
    name: 'del',
    input: '普通文字：{% del 被删除的文字 %}。',
    expected: '<p>普通文字：<del>被删除的文字</del>。</p>',
  },
  {
    name: 'kbd',
    input: '按 {% kbd Ctrl %} 组合键。',
    expected: '<p>按 <kbd>Ctrl</kbd> 组合键。</p>',
  },
  {
    name: 'psw',
    input: '密码是 {% psw hunter2 %}。',
    expected: '<p>密码是 <psw>hunter2</psw>。</p>',
  },
  {
    name: 'label（默认 + 指定颜色 + 尾随空格）',
    input: '默认 {% label 默认 %}；蓝色 {% label 蓝色 blue %}。',
    expected:
      '<p>默认 <mark class="hl-label default">默认</mark> ；蓝色 <mark class="hl-label blue">蓝色</mark> 。</p>',
  },
  {
    name: 'inlineImg（带高度，不含 lazyload 滤镜）',
    input: '图：{% inlineImg /img/512.png 1.5em %}。',
    expected: '<p>图：<img class="inline-img" src="/img/512.png" style="height:1.5em">。</p>',
  },
  {
    name: 'inlineImg（无高度）',
    input: '图：{% inlineImg /img/512.png %}。',
    expected: '<p>图：<img class="inline-img" src="/img/512.png">。</p>',
  },
  {
    name: 'icon（逗号后的前导空格要保留）',
    input: '图标：{% icon anzhiyu-icon-home, 1.2 %}。',
    expected:
      '<p>图标：<svg class="icon" style="width: 1.2em; height: 1.2em" aria-hidden="true"><use xlink:href="#anzhiyu-icon-home"></use></svg>。</p>',
  },
  {
    name: 'btn',
    input: '按钮：{% btn /about/, 前往关于页, anzhiyu-icon-paper-plane, larger %}。',
    expected:
      '<p>按钮：<a class="btn-anzhiyu larger" href="/about/" title="前往关于页"><i class="anzhiyu-icon-paper-plane"></i><span>前往关于页</span></a>。</p>',
  },
  {
    name: 'p（HTML5 会把嵌套 <p> 拆成兄弟节点，只比文本）',
    mode: 'text',
    input: '段落标签：{% p h2, 这是一个 h2 级别的段落标签 %}。',
    expected: '段落标签：这是一个 h2 级别的段落标签。',
  },
  {
    name: 'span',
    input: '行内 span：{% span red, 这是一个红色 span %}。',
    expected: '<p>行内 span：<span class="p red">这是一个红色 span</span>。</p>',
  },

  // ── 块级容器 12 个 ────────────────────────────────────────────────────────
  {
    name: 'note（默认 flat）',
    input: '{% note info %}\n默认 flat 风格的 note。\n{% endnote %}',
    expected: '<div class="note info flat"><p>默认 flat 风格的 note。</p></div>',
  },
  {
    name: 'note（modern）',
    input: '{% note warning modern %}\nmodern 风格的 warning note。\n{% endnote %}',
    expected: '<div class="note warning modern"><p>modern 风格的 warning note。</p></div>',
  },
  {
    name: 'note（simple）',
    input: '{% note success simple %}\nsimple 风格的 success note。\n{% endnote %}',
    expected: '<div class="note success simple"><p>simple 风格的 success note。</p></div>',
  },
  {
    name: 'note（fa 图标 → icon-padding）',
    input: '{% note info fa-bell %}\n带图标的 note。\n{% endnote %}',
    expected:
      '<div class="note info icon-padding flat"><i class="note-icon fa-bell"></i><p>带图标的 note。</p></div>',
  },
  {
    name: 'subnote（与 note 共用渲染）',
    input: '{% subnote info %}\nsubnote 与 note 共用同一个渲染函数。\n{% endsubnote %}',
    expected: '<div class="note info flat"><p>subnote 与 note 共用同一个渲染函数。</p></div>',
  },
  {
    name: 'tabs（激活第 2 页）',
    input: [
      '{% tabs 基准标签, 2 %}',
      '<!-- tab 第一个标签 -->',
      '第一个标签页的内容，支持 **Markdown**。',
      '<!-- endtab -->',
      '<!-- tab 第二个标签 -->',
      '第二个标签页的内容，默认激活第二页。',
      '<!-- endtab -->',
      '{% endtabs %}',
    ].join('\n'),
    expected:
      '<div class="tabs" id="基准标签"><ul class="nav-tabs">' +
      '<button type="button" class="tab" data-href="基准标签-1">第一个标签</button>' +
      '<button type="button" class="tab active" data-href="基准标签-2">第二个标签</button>' +
      '</ul><div class="tab-contents">' +
      '<div class="tab-item-content" id="基准标签-1"><p>第一个标签页的内容，支持 <strong>Markdown</strong>。</p></div>' +
      '<div class="tab-item-content active" id="基准标签-2"><p>第二个标签页的内容，默认激活第二页。</p></div>' +
      '</div><div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  },
  {
    name: 'subtabs',
    input: [
      '{% subtabs 子标签 %}',
      '<!-- tab 子标签一 -->',
      'sub 标签一',
      '<!-- endtab -->',
      '<!-- tab 子标签二 -->',
      'sub 标签二',
      '<!-- endtab -->',
      '{% endsubtabs %}',
    ].join('\n'),
    expected:
      '<div class="tabs" id="子标签"><ul class="nav-tabs">' +
      '<button type="button" class="tab active" data-href="子标签-1">子标签一</button>' +
      '<button type="button" class="tab" data-href="子标签-2">子标签二</button>' +
      '</ul><div class="tab-contents">' +
      '<div class="tab-item-content active" id="子标签-1"><p>sub 标签一</p></div>' +
      '<div class="tab-item-content" id="子标签-2"><p>sub 标签二</p></div>' +
      '</div><div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  },
  {
    name: 'subtabs（fixture 的 `<!-- endtab %}` 笔误会让后一个 tab 丢失，基准如此）',
    input: [
      '{% subtabs 子标签 %}',
      '<!-- tab 子标签一 -->',
      'sub 标签一',
      '<!-- endtab -->',
      '<!-- tab 子标签二 -->',
      'sub 标签二',
      '<!-- endtab %}',
      '{% endsubtabs %}',
    ].join('\n'),
    expected:
      '<div class="tabs" id="子标签"><ul class="nav-tabs">' +
      '<button type="button" class="tab active" data-href="子标签-1">子标签一</button>' +
      '</ul><div class="tab-contents">' +
      '<div class="tab-item-content active" id="子标签-1"><p>sub 标签一</p></div>' +
      '</div><div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  },
  {
    name: 'subsubtabs（同一个笔误导致空 nav + no-default）',
    input: [
      '{% subsubtabs 孙标签 %}',
      '<!-- tab 孙标签一 -->',
      'subsub 标签一',
      '<!-- endtab %}',
      '{% endsubsubtabs %}',
    ].join('\n'),
    expected:
      '<div class="tabs" id="孙标签"><ul class="nav-tabs no-default"></ul><div class="tab-contents"></div>' +
      '<div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  },
  {
    name: 'hideInline',
    input: '行内隐藏：{% hideInline 这是藏起来的行内文字, 点我查看 %}。',
    expected:
      '<p>行内隐藏：<span class="hide-inline"><button type="button" class="hide-button" style=""> 点我查看 </button>' +
      '<span class="hide-content">这是藏起来的行内文字</span></span>。</p>',
  },
  {
    name: 'hideBlock',
    input: '{% hideBlock 点我展开隐藏块 %}\n隐藏块里的 **Markdown** 内容。\n{% endhideBlock %}',
    expected:
      '<div class="hide-block"><button type="button" class="hide-button" style="">点我展开隐藏块 </button>' +
      '<div class="hide-content"><p>隐藏块里的 <strong>Markdown</strong> 内容。</p></div></div>',
  },
  {
    name: 'hideToggle',
    input: '{% hideToggle 点我折叠 %}\n折叠面板里的内容。\n{% endhideToggle %}',
    expected:
      '<details class="toggle"><summary class="toggle-button" style="">点我折叠</summary>' +
      '<div class="toggle-content"><p>折叠面板里的内容。</p></div></details>',
  },
  {
    name: 'folding',
    input: '{% folding 一个可折叠的 details %}\nfolding 里面的内容，渲染时会先走一遍 Markdown。\n{% endfolding %}',
    expected:
      '<details class="folding-tag"><summary> 一个可折叠的 details </summary>' +
      "<div class=\"content\"><p>folding 里面的内容，渲染时会先走一遍 Markdown。</p></div></details>",
  },
  {
    name: 'checkbox',
    input: '{% checkbox 已完成的事项 %}',
    expected: '<div class="checkbox"><input type="checkbox"><p>已完成的事项</p></div>',
  },
  {
    name: 'checkbox（checked）',
    input: '{% checkbox checked, 已勾选的事项 %}',
    expected:
      '<div class="checkbox checked"><input type="checkbox" checked><p>已勾选的事项</p></div>',
  },
  {
    name: 'radio',
    input: '{% radio 单选选项一 %}',
    expected: '<div class="checkbox"><input type="radio"><p>单选选项一</p></div>',
  },
  {
    name: 'radio（checked）',
    input: '{% radio checked, 已勾选的单选 %}',
    expected:
      '<div class="checkbox checked"><input type="radio" checked><p>已勾选的单选</p></div>',
  },
  {
    name: 'timeline',
    input: [
      '{% timeline 基准事件时间线, blue %}',
      '<!-- timeline 2024-11-01 -->',
      '第一版 fixture 完成。',
      '<!-- endtimeline -->',
      '<!-- timeline 2025-03-18 -->',
      '块级标签补全。',
      '<!-- endtimeline -->',
      '{% endtimeline %}',
    ].join('\n'),
    expected:
      '<div class="timeline blue">' +
      "<div class=\"timeline-item headline\"><div class=\"timeline-item-title\"><div class=\"item-circle\"><p>基准事件时间线</p></div></div></div>" +
      "<div class=\"timeline-item\"><div class=\"timeline-item-title\"><div class=\"item-circle\"><p>2024-11-01</p></div></div>" +
      "<div class=\"timeline-item-content\"><p>第一版 fixture 完成。</p></div></div>" +
      "<div class=\"timeline-item\"><div class=\"timeline-item-title\"><div class=\"item-circle\"><p>2025-03-18</p></div></div>" +
      "<div class=\"timeline-item-content\"><p>块级标签补全。</p></div></div></div>",
  },

  // ── 组合 / 健壮性 ─────────────────────────────────────────────────────────
  {
    name: '嵌套：note 里再套 u + strong',
    input: '{% note info %}\n外层 **粗体**，内层 {% u 下划线 %}。\n{% endnote %}',
    expected:
      '<div class="note info flat"><p>外层 <strong>粗体</strong>，内层 <u>下划线</u>。</p></div>',
  },
  {
    name: '嵌套：tabs 里的 hideToggle',
    input: [
      '{% tabs 嵌套 %}',
      '<!-- tab 一 -->',
      '{% hideToggle 展开 %}\n里面是 **内容**。\n{% endhideToggle %}',
      '<!-- endtab -->',
      '{% endtabs %}',
    ].join('\n'),
    expected:
      '<div class="tabs" id="嵌套"><ul class="nav-tabs">' +
      '<button type="button" class="tab active" data-href="嵌套-1">一</button>' +
      '</ul><div class="tab-contents"><div class="tab-item-content active" id="嵌套-1">' +
      '<details class="toggle"><summary class="toggle-button" style="">展开</summary>' +
      '<div class="toggle-content"><p>里面是 <strong>内容</strong>。</p></div></details>' +
      '</div></div><div class="tab-to-top"><button type="button" aria-label="scroll to top">' +
      '<i class="anzhiyufont anzhiyu-icon-arrow-up"></i></button></div></div>',
  },
  {
    name: '未实现的 mermaid 原样透传（不抛错）',
    input: '{% mermaid %}\ngraph TD\nA --> B\n{% endmermaid %}',
    expected: '<p>{% mermaid %} graph TD A --> B {% endmermaid %}</p>',
  },
]

let passed = 0
let failed = 0

for (const testCase of cases) {
  const html = await render(testCase.input)
  const actual = testCase.mode === 'text' ? textOf(html) : canon(html)
  const expected = testCase.mode === 'text' ? testCase.expected : canon(testCase.expected)
  if (assertEqual(testCase.name, actual, expected)) passed += 1
  else failed += 1
}

// ── 参数解析器单测 ──────────────────────────────────────────────────────────
{
  const parsed = parseArgs('a b "c d" e=f g="h i"')
  const ok =
    JSON.stringify(parsed.args) === JSON.stringify(['a', 'b', 'c d']) &&
    parsed.kwargs.e === 'f' &&
    parsed.kwargs.g === 'h i'
  if (ok) passed += 1
  else {
    failed += 1
    console.error('\n✗ parseArgs')
    console.error(`  实际: ${JSON.stringify(parsed)}`)
  }
}

// ── 报错路径 ────────────────────────────────────────────────────────────────
async function expectError(name, input, pattern) {
  try {
    await render(input)
  } catch (error) {
    if (pattern.test(error.message)) {
      passed += 1
      return
    }
    failed += 1
    console.error(`\n✗ ${name}：错误信息不匹配\n  实际: ${error.message}`)
    return
  }
  failed += 1
  console.error(`\n✗ ${name}：预期抛错但成功了`)
}

await expectError('未知 tag 报错带行号', 'a\nb\n{% nope x %}', /Unknown Hexo tag.*:3:1/)
await expectError('未闭合容器报错', '{% note info %}\ntext', /Unclosed Hexo tag/)
await expectError('错配 end tag 报错', '{% note info %}\ntext\n{% endtabs %}', /Mismatched/)

// ── 汇总 ────────────────────────────────────────────────────────────────────
const total = passed + failed
if (warnings.length > 0) {
  console.log(`\n（透传 warning ${warnings.length} 条，示例：${warnings[0]}）`)
}
console.log(`\nremark-hexo-tag: ${passed}/${total} 通过${failed ? `，${failed} 失败` : ''}`)
process.exitCode = failed === 0 ? 0 : 1
