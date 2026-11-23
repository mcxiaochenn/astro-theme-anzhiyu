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
      if (part.startsWith('<')) {
        return (
          part
            .replace(/\s*\/>$/, '>')
            // HTML 解析器会把无值属性序列化成 `attr=""`，与上游的 `attr` 等价
            .replace(/\s(controls|preload|hidden|data-pjax|no-lazy)=""/g, ' $1')
        )
      }
      return part.replace(/\s+/g, ' ')
    })
    .join('')
    .replace(/>\s+</g, '><')
    // 实体与原文等价（link/flink 的 onerror 属性里是单引号/双引号）
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#x22;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
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
  // ── 媒体与卡片 11 个（P6-2） ─────────────────────────────────────────────
  {
    name: 'image（alt + width）',
    input: '{% image /img/default_cover.jpg, alt=图片示例, width=60% %}',
    expected:
      '<div class="img-wrap"><div class="img-bg"><img class="img" src="/img/default_cover.jpg" alt="图片示例" style="width:60%;"></div><span class="image-caption">图片示例</span></div>',
  },
  {
    name: 'image（bg + height，无 alt 时无 caption）',
    input: '{% image /img/512.png, bg=#eee, height=32px %}',
    expected:
      '<div class="img-wrap"><div class="img-bg" style="background:#eee"><img class="img" src="/img/512.png" style="height:32px;"></div></div>',
  },
  {
    name: 'inlineimage（height=）',
    input: '行内图片：{% inlineimage /img/512.png, height=32px %}。',
    expected: '<p>行内图片：<img no-lazy class="inline" src="/img/512.png" style="height:32px;">。</p>',
  },
  {
    name: 'inlineimage（无 height，默认 1.5em）',
    input: '图：{% inlineimage /img/512.png %}。',
    expected: '<p>图：<img no-lazy class="inline" src="/img/512.png" style="height:1.5em">。</p>',
  },
  {
    name: 'audio',
    input: '{% audio https://example.com/baseline-demo.mp3 %}',
    expected:
      '<div class="audio"><audio controls preload><source src="https://example.com/baseline-demo.mp3" type="audio/mp3">Your browser does not support the audio tag.</audio></div>',
  },
  {
    name: 'video',
    input: '{% video https://example.com/baseline-demo.mp4 %}',
    expected:
      '<div class="video"><video controls preload><source src="https://example.com/baseline-demo.mp4" type="video/mp4">Your browser does not support the video tag.</video></div>',
  },
  {
    name: 'videos（col=2，正文不跑 Markdown）',
    input: [
      '{% videos , 2 %}',
      '{% video https://example.com/1.mp4 %}',
      '{% video https://example.com/2.mp4 %}',
      '{% endvideos %}',
    ].join('\n'),
    expected:
      '<div class="videos" col="2">' +
      '<div class="video"><video controls preload><source src="https://example.com/1.mp4" type="video/mp4">Your browser does not support the video tag.</video></div>' +
      '<div class="video"><video controls preload><source src="https://example.com/2.mp4" type="video/mp4">Your browser does not support the video tag.</video></div>' +
      '</div>',
  },
  {
    name: 'gallery（默认参数 + 图片正则）',
    input: [
      '{% gallery %}',
      '![图片一](/img/default_cover.jpg)',
      '![图片二](/img/512.png)',
      '![图片三](/img/comment_bg.png)',
      '{% endgallery %}',
    ].join('\n'),
    expected:
      '<div class="gallery">' +
      '<div class="fj-gallery page_img_lazyload data" data-rowheight="220" data-limit="10">' +
      '<span class="gallery-data">[{"url":"/img/default_cover.jpg","alt":"图片一"},{"url":"/img/512.png","alt":"图片二"},{"url":"/img/comment_bg.png","alt":"图片三"}]</span>' +
      '</div><button class="gallery-load-more" style="opacity:0">' +
      '<span>加载更多</span><i class="anzhiyufont anzhiyu-icon-arrow-down"></i></button></div>',
  },
  {
    name: 'galleryGroup',
    input: '{% galleryGroup 基准站点 上游参考产物 /album/ /img/default_cover.jpg %}',
    expected:
      '<figure class="gallery-group"><img class="gallery-group-img no-lightbox" src="/img/default_cover.jpg" alt="Group Image Gallery">' +
      '<figcaption><div class="gallery-group-name">基准站点</div><p>上游参考产物</p><a href="/album/"></a></figcaption></figure>',
  },
  {
    name: 'site',
    input:
      '{% site 示例站点, url=https://example.com, screenshot=/img/default_cover.jpg, avatar=/img/512.png, description=站点卡片说明 %}',
    expected:
      '<a class="site-card" href="https://example.com" data-title="站点卡片说明">' +
      '<div class="wrapper cover"><img class="cover fadeIn" src="/img/default_cover.jpg"></div>' +
      '<div class="info"><img class="flink-avatar" src="/img/512.png"><span class="site-title">示例站点</span></div></a>',
  },
  {
    name: 'sitegroup（标题 + 两个站点，正文不跑 Markdown）',
    input: [
      '{% sitegroup 友情链接 %}',
      '{% site 站点甲, url=https://example.com/a, screenshot=/img/default_cover.jpg, avatar=/img/512.png, description=说明甲 %}',
      '{% site 站点乙, url=https://example.com/b, screenshot=/img/comment_bg.png, avatar=/img/512.png, description=说明乙 %}',
      '{% endsitegroup %}',
    ].join('\n'),
    expected:
      '<div class="site-card-group"><p class="p h2">友情链接</p>' +
      '<a class="site-card" href="https://example.com/a" data-title="说明甲"><div class="wrapper cover"><img class="cover fadeIn" src="/img/default_cover.jpg"></div><div class="info"><img class="flink-avatar" src="/img/512.png"><span class="site-title">站点甲</span></div></a>' +
      '<a class="site-card" href="https://example.com/b" data-title="说明乙"><div class="wrapper cover"><img class="cover fadeIn" src="/img/comment_bg.png"></div><div class="info"><img class="flink-avatar" src="/img/512.png"><span class="site-title">站点乙</span></div></a>' +
      '</div>',
  },
  {
    name: 'btns（容器）',
    input: [
      '{% btns rounded grid5 %}',
      '{% cell 示例链接, https://example.com, anzhiyufont anzhiyu-icon-arrow-right %}',
      '{% cell 关于页, /about/, anzhiyufont anzhiyu-icon-paper-plane %}',
      '{% endbtns %}',
    ].join('\n'),
    expected:
      '<div class="btns rounded grid5">' +
      '<a class="button no-text-decoration" href="https://example.com" title="示例链接"><i class="anzhiyufont anzhiyu-icon-arrow-right"></i>示例链接</a>' +
      '<a class="button no-text-decoration" href="/about/" title="关于页"><i class="anzhiyufont anzhiyu-icon-paper-plane"></i>关于页</a>' +
      '</div>',
  },
  {
    name: 'cell（图标参数带前导空格时必须识别为图标）',
    input: '{% cell 关于页, /about/, anzhiyufont anzhiyu-icon-paper-plane %}',
    expected:
      '<a class="button no-text-decoration" href="/about/" title="关于页"><i class="anzhiyufont anzhiyu-icon-paper-plane"></i>关于页</a>',
  },

  // ── 第三方嵌入 7 个（P6-3） ──────────────────────────────────────────────
  {
    name: 'bilibili（客户端脚本与构建期插值）',
    input: '{% bilibili BV1xx411c7mD 12:00 false %}',
    contains: [
      'class="bilibili_box" id="BV1xx411c7mD"',
      'href="https://www.bilibili.com/video/BV1xx411c7mD/"',
      "fetch('https://api.320.ink/api/b?id=BV1xx411c7mD')",
      '<span>12:00</span>',
      '<div class="desc">${data.desc}</div>',
      '${data.pic + \'&h=300\'}',
    ],
  },
  {
    name: 'dogeplayer',
    input: '{% dogeplayer 123456 vcode123 %}',
    expected:
      '<div id="player_vcode123"></div>' +
      '<script type="text/javascript" data-pjax src="https://player.dogecloud.com/js/loader"></script>' +
      '<script type="text/javascript" data-pjax defer> setTimeout(() => { var dogePlayer = new DogePlayer({ container: document.getElementById("player_vcode123"), userId: 123456, vcode: "vcode123", autoPlay: false }); }, 300); </script>',
  },
  {
    name: 'mermaid（正文转义进 pre）',
    input: '{% mermaid %}\ngraph TD\n  A[Hexo] --> B[fixture]\n  B --> C[baseline]\n{% endmermaid %}',
    expected:
      '<div class="mermaid-wrap"><pre class="mermaid-src" hidden> graph TD A[Hexo] --&gt; B[fixture] B --&gt; C[baseline] </pre></div>',
  },
  {
    name: 'tip（默认无参数 → class="tip "）',
    input: '{% tip %}\ntip 默认样式的提示块。\n{% endtip %}',
    expected: '<div class="tip"><p>tip 默认样式的提示块。</p></div>',
  },
  {
    name: 'tip（warning）',
    input: '{% tip warning %}\n带 warning 类名的 tip。\n{% endtip %}',
    expected: '<div class="tip warning"><p>带 warning 类名的 tip。</p></div>',
  },
  {
    name: 'link（站外 + 显式图标）',
    input: '{% link 示例站点, 外链示例, https://example.com, /img/favicon.ico %}',
    expected:
      '<div class="anzhiyu-tag-link"><a class="tag-Link" target="_blank" rel="noopener external nofollow noreferrer" href="https://example.com">' +
      '<div class="tag-link-tips">引用站外地址</div><div class="tag-link-bottom">' +
      '<div class="tag-link-left" data-icon="/img/favicon.ico">' +
      '<img class="tag-link-favicon" src="/img/favicon.ico" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" style="" alt="favicon">' +
      '<i class="anzhiyufont anzhiyu-icon-link" style="display:none"></i></div>' +
      '<div class="tag-link-right"><div class="tag-link-title">示例站点</div><div class="tag-link-sitename">外链示例</div></div>' +
      '<i class="anzhiyufont anzhiyu-icon-angle-right"></i></div></a></div>',
  },
  {
    name: 'link（站内地址 → 站内图标 + 无 target）',
    input: '{% link 关于页, 本站, /about/, true %}',
    expected:
      '<div class="anzhiyu-tag-link"><a class="tag-Link" href="/about/">' +
      '<div class="tag-link-tips">站内地址</div><div class="tag-link-bottom">' +
      '<div class="tag-link-left" data-icon="/favicon.ico">' +
      '<img class="tag-link-favicon" src="/favicon.ico" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" style="" alt="favicon">' +
      '<i class="anzhiyufont anzhiyu-icon-link" style="display:none"></i></div>' +
      '<div class="tag-link-right"><div class="tag-link-title">关于页</div><div class="tag-link-sitename">本站</div></div>' +
      '<i class="anzhiyufont anzhiyu-icon-angle-right"></i></div></a></div>',
  },
  {
    name: 'intCard（含底部作者信息）',
    input: '{% intCard /about/ /img/default_cover.jpg 最爱 介绍卡片 /img/512.png AnZhiYu 基准站点 %}',
    expected:
      '<div class="introduction-card" style=""><div class="introduction-card-top" style="">' +
      '<div class="int-card-info"><div class="int-tip">最爱</div><div class="int-cardTitle">介绍卡片</div></div>' +
      '<img src="/img/default_cover.jpg" class="no-lightbox" alt="introduction"></div>' +
      '<div class="introduction-card-bottom"><div class="left">' +
      '<img src="/img/512.png" class="no-lightbox" alt="introduction">' +
      '<div class="info"><div class="title">AnZhiYu</div><div class="subTitle">基准站点</div></div></div>' +
      '<div class="right"><a href="/about/" tableindex="-1" class="no-text-decoration">前往</a></div></div></div>',
  },
  {
    name: 'flink（YAML：anzhiyu + flexcard 两个分支）',
    input: [
      '{% flink %}',
      '- class_name: 基准友链',
      '  class_desc: 下游对比用的固定友链数据',
      '  flink_style: anzhiyu',
      '  link_list:',
      '    - name: 示例站点',
      '      link: https://example.com',
      '      avatar: /img/512.png',
      '      descr: 友链描述',
      '- class_name: 卡片风格',
      '  class_desc: flexcard 分支',
      '  flink_style: flexcard',
      '  link_list:',
      '    - name: 站点乙',
      '      link: https://example.com/b',
      '      avatar: /img/512.png',
      '      descr: 卡片风格描述',
      '      siteshot: /img/comment_bg.png',
      '{% endflink %}',
    ].join('\n'),
    expected:
      '<div class="flink"><div class="flink-name">基准友链</div><div class="flink-desc">下游对比用的固定友链数据</div>' +
      '<div class="flink-list"><div class="anzhiyu-flink-list">' +
      '<div class="flink-list-item"><a href="https://example.com" title="示例站点" class="cf-friends-link" target="_blank">' +
      '<div class="flink-item-icon"><img class="no-lightbox cf-friends-avatar" src="/img/512.png" onerror="this.onerror=null;this.src=&quot;/img/friend_404.gif&quot;" alt="示例站点"></div>' +
      '<div class="flink-item-info"><div class="flink-item-name">示例站点</div><div class="flink-item-desc" title="友链描述">友链描述</div></div>' +
      '</a></div></div></div>' +
      '<div class="flink-name">卡片风格</div><div class="flink-desc">flexcard 分支</div>' +
      '<div class="flink-list"><div class="flexcard-flink-list">' +
      '<a href="https://example.com/b" title="站点乙" target="_blank" class="flink-list-card cf-friends-link">' +
      '<div class="wrapper cover"><img class="no-lightbox cover fadeIn" src="/img/comment_bg.png" onerror="this.onerror=null;this.src=&quot;/img/friend_404.gif&quot;" alt="站点乙"></div>' +
      '<div class="info"><img class="no-lightbox cf-friends-avatar flink-avatar" src="/img/512.png" onerror="this.onerror=null;this.src=&quot;/img/friend_404.gif&quot;" alt="站点乙">' +
      '<span class="flink-sitename cf-friends-name">站点乙</span></div></a>' +
      '</div></div></div>',
  },
]

let passed = 0
let failed = 0

for (const testCase of cases) {
  const html = await render(testCase.input)

  // 超长模板（bilibili 的客户端脚本）只断言关键片段，避免 oracle 变成脚本快照。
  if (testCase.contains) {
    const missing = testCase.contains.filter((snippet) => !html.includes(snippet))
    if (missing.length === 0) passed += 1
    else {
      failed += 1
      console.error(`\n✗ ${testCase.name}：缺少片段 ${JSON.stringify(missing)}`)
      console.error(`  实际: ${html.slice(0, 500)}`)
    }
    continue
  }

  const actual = testCase.mode === 'text' ? textOf(html) : canon(html)
  const expected = testCase.mode === 'text' ? testCase.expected : canon(testCase.expected)
  if (assertEqual(testCase.name, actual, expected)) passed += 1
  else failed += 1
}

// ── 参数解析器单测 ──────────────────────────────────────────────────────────
{
  const parsed = parseArgs('a b "c d" e=f g="h i"')
  const ok =
    JSON.stringify(parsed.args) === JSON.stringify(['a', 'b', 'c d', 'e=f', 'g=h i']) &&
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
