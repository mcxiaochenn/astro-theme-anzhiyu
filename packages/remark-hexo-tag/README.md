# remark-hexo-tag

在 **remark 阶段**还原 Hexo 主题 AnZhiYu 的 `{% tag %}` 语法，供 Astro 的
`@astrojs/markdown-remark` 管线使用。

- 纯 ESM + JSDoc，**无构建步骤**；附录 B 的 **42 个 tag 全部实现**；
- 支持行内 tag、容器 tag、嵌套 tag、`key=value` 与引号参数；
- 未知 tag / 未闭合容器 / 错配 end tag 会抛错，并带 `文件:行:列`。

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
| `noteStyle` | `'flat'` | 对应 `theme.config.yml` 的 `note.style` |
| `loadMoreText` | `'加载更多'` | `{% gallery %}` 的「加载更多」文案（zh-CN 字典） |
| `favicon` | `'/favicon.ico'` | `{% link %}` 站内地址的默认图标 |
| `flinkErrorImg` | `'/img/friend_404.gif'` | `{% flink %}` 头像加载失败兜底图 |
| `onWarning` | `console.warn` | 预留的 warning 回调 |

## 实现的 42 个 tag

| 组 | tag |
| --- | --- |
| 行内语义（12） | `u` `emp` `wavy` `del` `kbd` `psw` `label` `inlineImg` `icon` `btn` `p` `span` |
| 块级容器（12） | `note` `subnote` `tabs` `subtabs` `subsubtabs` `hideInline` `hideBlock` `hideToggle` `folding` `checkbox` `radio` `timeline` |
| 媒体与卡片（11） | `image` `inlineimage` `audio` `video` `videos` `gallery` `galleryGroup` `site` `sitegroup` `btns` `cell` |
| 第三方嵌入（7） | `bilibili` `dogeplayer` `mermaid` `link` `flink` `tip` `intCard` |

实现细节：

- `hideInline` 是行内实现（上游 `hide.js` 自闭合）；
- `checkbox` / `radio` 上游自闭合但参数过 Markdown，按块级渲染；
- `videos` / `sitegroup` / `btns` 的正文上游**不跑 Markdown**，用 `ctx.raw()`
  只展开嵌套 tag；
- `site` / `cell` / `bilibili` / `intCard` 输出以 `<a>` 或缩进 `<div>` 开头，
  按「字符串块级」tag 产出 html 节点，避免被包 `<p>` 或误判为代码块；
- `flink` 的正文是 YAML，用工作区已有的 `yaml` 包解析（`node-linker=hoisted`，
  来自 `vite-plugin-stylus-hexo-config` 的依赖，不是本插件新增）；
- `tabs` 系列严格沿用上游 `<!-- endtab -->` 正则；
- `<img>` 的 `data-lazy-src` / 占位 `src` 属于上游 `post_lazyload.js` 滤镜，
  不在 tag 模板里，本插件输出滤镜前形态。

## 目录结构

```
src/index.mjs              remark 插件入口（扫描 → 占位 → 递归解析 → 替换）
src/parser.mjs             tag 词法/语法扫描 + 参数解析
src/runtime.mjs            stripIndent / trimBody / url_for / commaArgs / escapeHtml
src/tags/inline/index.mjs  行内 tag（13，含 hideInline）
src/tags/block/index.mjs   块级容器 tag（11）
src/tags/media/index.mjs   媒体与卡片（11）
src/tags/thirdparty/index.mjs 第三方嵌入（7）
test/run.mjs               59 条 oracle 对拍
test/render-fixtures.mjs   4 篇 fixture 与 `.baseline-html` 做正文文本对比
```

## 测试

```bash
node packages/remark-hexo-tag/test/run.mjs              # 59/59
node packages/remark-hexo-tag/test/render-fixtures.mjs  # 4 篇 fixture 文本 diff
```

测试从 `examples/blog` 解析 `@astrojs/markdown-remark`；`render-fixtures.mjs` 直接
import `examples/blog/astro.config.mjs` 并用它导出的真实 processor。

## 已知限制

1. **上游 escape 缺陷不复刻**：Hexo 的 `escapeAllSwigTags` 用
   `str.includes('end' + name)` 判断容器 tag，`video` 会命中 `endvideos`、
   `site` 会命中 `endsitegroup`，导致 `## videos` / `## sitegroup` 在基准里变成
   字面量。本插件正常渲染成标题，验收时按白名单处理（见 P6-2 报告）。
2. **`{%` 出现在代码块/行内代码里**也会被当作 tag 处理——与 Hexo 一致。
3. **`url_for`** 只实现基准站 `root: /` 的语义；子路径部署需替换实现。
4. **嵌套 `<p>`**：`{% p %}` 输出的 `<p>` 嵌在段落里是非法 HTML，parse5 会按
   浏览器规则拆开，文本不变。
5. **源码位置**：整段重解析后节点 `position` 相对片段而非原文件，当前无消费方。
