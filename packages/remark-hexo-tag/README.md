# remark-hexo-tag

在 **remark 阶段**还原 Hexo 主题 AnZhiYu 的 `{% tag %}` 语法，供 Astro 的
`@astrojs/markdown-remark` 管线使用。

- 纯 ESM + JSDoc，**无构建步骤、无第三方依赖**；
- 支持行内 tag、容器 tag、嵌套 tag、`key=value` 与引号参数；
- 未知 tag / 未闭合容器 / 错配 end tag 会抛错，并带 `文件:行:列`；
- 已注册但尚未实现的 tag（media / thirdparty 两组）原样透传并 warning，
  不会让整站构建失败。

## 用法

```js
// astro.config.mjs
import remarkHexoTag from '../../packages/remark-hexo-tag/src/index.mjs'

const processor = {
  async createRenderer(shared) {
    return createMarkdownProcessor({
      ...shared,
      smartypants: false,
      remarkPlugins: [[remarkHexoTag, { noteStyle: 'flat' }]],
    })
  },
}
```

> 插件工厂通过 `this` 拿到 unified `Processor`，用 `processor.parse()` 递归解析
> 容器正文，因此**必须**以 unified 插件方式注册，不能当作普通函数直接调用。

### 选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `noteStyle` | `'flat'` | 对应 `theme.config.yml` 的 `note.style`，可选 `flat` / `modern` / `simple` / `disabled` |
| `onWarning` | `console.warn` | 待实现 tag 透传时的回调，参数为已格式化的消息 |

## 已实现（P6-1：24 个 tag）

| 组 | tag |
| --- | --- |
| 行内语义（12） | `u` `emp` `wavy` `del` `kbd` `psw` `label` `inlineImg` `icon` `btn` `p` `span` |
| 块级容器（12） | `note` `subnote` `tabs` `subtabs` `subsubtabs` `hideInline` `hideBlock` `hideToggle` `folding` `checkbox` `radio` `timeline` |

说明：

- `hideInline` 虽是行内语义，上游注册在 `hide.js`，本实现放在 `tags/inline`；
- `checkbox` / `radio` 上游是自闭合 tag，但参数要过 Markdown，本实现按块级渲染，
  这样才能复用 remark 的 mdast 解析；
- `tabs` 系列严格沿用上游的 `<!-- endtab -->` 正则，因此 fixture 里
  `<!-- endtab %}` 的笔误会像上游一样丢掉对应 tab（基准产物如此）。

## 未实现（原样透传）

- media（P6-2，11 个）：`image` `inlineimage` `audio` `video` `videos` `gallery`
  `galleryGroup` `site` `sitegroup` `btns` `cell`
- thirdparty（P6-3，7 个）：`bilibili` `dogeplayer` `mermaid` `link` `flink`
  `tip` `intCard`

## 目录结构

```
src/index.mjs              remark 插件入口（扫描 → 占位 → 递归解析 → 替换）
src/parser.mjs             tag 词法/语法扫描 + 参数解析（无 Markdown 知识）
src/runtime.mjs            stripIndent / trimBody / url_for / commaArgs
src/tags/inline/index.mjs  行内 tag
src/tags/block/index.mjs   块级容器 tag
src/tags/media/index.mjs   媒体与卡片（本批空表）
src/tags/thirdparty/index.mjs 第三方嵌入（本批空表）
test/run.mjs               24+ 个 tag 的 oracle 对拍
test/render-fixtures.mjs   渲染 fixtures 与 `.baseline-html` 做正文文本对比
```

## 测试

```bash
node packages/remark-hexo-tag/test/run.mjs          # 38 条断言
node packages/remark-hexo-tag/test/render-fixtures.mjs  # 两篇 fixture 的正文文本 diff
```

测试从 `examples/blog` 解析 `@astrojs/markdown-remark`，复用示例站的同一套处理器
（`smartypants: false`、`syntaxHighlight: false`），确保测的就是构建时的管线。

## 已知限制

1. **`{%` 出现在代码块/行内代码里**也会被当作 tag 处理——与 Hexo 一致（上游 tag
   渲染同样发生在 Markdown 之前）。需要字面量时使用 `{% raw %}` 或转义。
2. **`url_for`** 只实现了基准站配置（`root: /`）的等价行为：绝对路径/协议 URL 原样，
   相对路径补 `/`。站点部署在子路径时需替换 `runtime.mjs` 的实现。
3. **嵌套 `<p>`**：`{% p %}` 输出 `<p class="p h2">…</p>`，嵌在段落里是非法 HTML。
   rehype-raw（parse5）会按浏览器规则把外层段落拆开——与浏览器打开基准页的结果一致，
   但原始 HTML 字符串不同。
4. **源码位置**：插件会重新解析整段 Markdown，产出节点的 `position` 相对片段而非原文件。
   目前不影响渲染；若后续有插件依赖 `position` 定位源码（例如图片收集），需要重新评估。
