# vite-plugin-stylus-hexo-config

让为 [Hexo](https://hexo.io/) 写的 Stylus 能直接在 Vite / Astro 里编译。

处理的是 `hexo-config()` —— Hexo 的 `hexo-renderer-stylus` 注入的函数，用来在样式里读主题配置：

```stylus
$theme-color = hexo-config('theme_color.enable') && hexo-config('theme_color.main') \
  ? convert(hexo-config('theme_color.main')) : #425AEF
$font-size = hexo-config('font.global-font-size') \
  ? convert(hexo-config('font.global-font-size')) : 14px
```

换成 Vite / Astro 之后这个函数不存在，`index.styl` 直接编译不过。

## 用法

```js
import { defineConfig } from 'astro/config'
import { stylusHexoConfig } from 'vite-plugin-stylus-hexo-config'

export default defineConfig({
  vite: {
    plugins: [
      stylusHexoConfig({
        // Hexo 主题的 _config.yml，不需要改写
        configPath: './theme.config.yml',
      }),
    ],
  },
})
```

同时要装 `stylus`（Vite 对 `.styl` 的内置支持只要求预处理器本身）：

```bash
npm i -D stylus vite-plugin-stylus-hexo-config
```

## 它做了什么

1. **展开 `.styl` 的 `@import`**。Stylus 的 import 由编译器直接读盘，被导入的文件不经过 Vite 的 transform 钩子，所以替换必须自己把 import 递归内联。`.css` 的 import 保持原样，交给 Stylus 输出成 CSS 的 `@import`。glob 支持 `dir/*` 和 `dir/**/*` 两种写法。
2. **把 `hexo-config('x.y')` 换成变量**。文件顶部生成 `$cfg_x_y = <值>`，调用点替换成 `($cfg_x_y)`。
3. **值类型按配置原始类型保留**：字符串、布尔、数字、null。字符串的包裹引号按内容选（含双引号用单引号，含单引号用双引号），因为 Stylus 不支持字符串内的引号转义。
4. **复刻 Hexo 主题脚本的 define 层**（`stylus:renderer` filter）：在展开源码顶部注入 4 个语法高亮开关，与 `$cfg_*` 同级：

   ```js
   // 上游 scripts/events/stylus.js 的逻辑
   const { syntax_highlighter, highlight, prismjs } = hexo.config
   if (syntax_highlighter) {
     highlightEnable = syntax_highlighter === 'highlight.js'
     prismjsEnable = syntax_highlighter === 'prismjs'
   }
   style.define('$highlight_enable', highlightEnable)
        .define('$highlight_line_number', highlightLineNumber)
        .define('$prismjs_enable', prismjsEnable)
        .define('$prismjs_line_number', prismjsLineNumber)
   ```

   生成 `$highlight_enable = true` / `$highlight_line_number = true` / `$prismjs_enable = false` / `$prismjs_line_number = true`（默认 Hexo 7.3.0 站点配置：`syntax_highlighter: highlight.js`）。**这层不能省**：Stylus 把 `if` 里的未定义变量当真，漏掉 `$prismjs_enable=false` 会让 `_highlight/highlight.styl` 的 prismjs 分支多输出 +3782 字节。

   站点级键（`syntax_highlighter` / `highlight` / `prismjs`）从传入的配置对象里取；`configPath` 指向主题 `_config.yml` 时这些键不存在，插件按 Hexo 7.3.0 的 `default_config` 回落默认值（`highlight.js` + 两个 `line_number: true`）。站点配置层落地后把站点 YAML 的键传进来即可，推导逻辑不变。

## 为什么不注入 JS 函数

`stylus.define('hexo-config', fn)` 看起来是最直接的方案，Vite 源码里也有这条路径。但实测（astro 7.4.13 + vite 8.3.8）函数到不了编译现场：

- 写在 `vite.css.preprocessorOptions.stylus.define` 里 → 传递过程中丢失
- 写在插件 `config` 钩子里 → 插件内 `typeof` 是 `function`，编译器那侧看不到

Vite 8 的样式预处理跑在隔离环境，函数跨不过去。完整记录见 [docs/analysis/02-astro-mapping.md](../../docs/analysis/02-astro-mapping.md#6-phase-1-实测记录2026-11-23)。

## 为什么不直接替换成字面量

单文件能过，换上游真实 `var.styl` 就翻车：

```stylus
// 替换前
$rightside-bottom = hexo-config('rightside.bottom') ? convert(hexo-config('rightside.bottom')) : 40px
// 直接替换成字面量
$rightside-bottom = "100px" ? convert("100px") : 40px   // ✗ expected "indent", got "?"
// 换成变量
$rightside-bottom = ($cfg_rightside_bottom) ? convert(($cfg_rightside_bottom)) : 40px  // ✓
```

变量形态和上游的函数调用形态一致，解析器不会歧义。括号也是必需的：上游有 `hexo-config('note.light_bg_offset') is a 'unit' ? ...` 这种行首表达式，裸变量会被当成属性名。

## 选项

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `configPath` | `string` | — | YAML 配置路径，与 `config` 二选一 |
| `config` | `object` | — | 直接传配置对象 |
| `expandImports` | `boolean` | `true` | 是否展开 `.styl` 的 `@import` |
| `warnOnMissing` | `boolean` | `true` | 缺失/改写类告警总闸（缺失键、对象值、双引号改写三类；同键只告警一次） |
| `debug` | `boolean` | `false` | 打印每个文件的替换统计 |

## 限制

- 只处理 `hexo-config()` 与上游主题脚本 `scripts/events/stylus.js` 注入的 4 个高亮变量（`$highlight_enable` / `$highlight_line_number` / `$prismjs_enable` / `$prismjs_line_number`），不实现 Hexo 的其它模板函数 / 过滤器。
- glob 只支持 `dir/*` 与 `dir/**/*`，不支持 `**/*.styl` 这种放在路径中间的写法。
- 嵌套对象（如 `menu`）会被扁平化成点路径；数组会被序列化成字符串，在 CSS 里通常没有意义。
- 值改写语义：值同时含单双引号时 `"` 改写为 `'`（Stylus 字符串无转义）；对象/数组值按 truthy `true` 输出；缺失键、对象值、双引号改写三类告警由 `warnOnMissing` 统一门控，且同键只告警一次。
- 配置文件变化时会按 mtime 重新读取，但已编译过的文件要等 Vite 重新触发 transform 才更新。

## 许可

GPL-3.0，与本仓库其它部分一致。
