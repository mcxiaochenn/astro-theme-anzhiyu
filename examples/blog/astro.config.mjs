import { defineConfig } from 'astro/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unified } from '@astrojs/markdown-remark'
import { stylusHexoConfig } from 'vite-plugin-stylus-hexo-config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // ADR-001：显式切回 unified 处理器（@astrojs/markdown-remark），不用 Astro 7 默认的 Sätteri。
  // 原因：Phase 6 的 42 个 Hexo tag 需要在 Markdown 解析阶段做语法替换，
  // remark/rehype 生态有现成的 MDAST/HAST 插件与大量可参考实现；Sätteri 没有插件生态。
  // 代价是失去 Sätteri 的构建速度，对几百篇文章的站点在秒级，可接受（见 docs/02-astro-mapping.md §ADR-001）。
  markdown: {
    processor: unified(),
  },
  vite: {
    build: {
      // 关闭 CSS 压缩，两个原因，缺一不可：
      //
      // 1. 上游 1.7.1 自己的样式里有一处笔误：source/css/_mode/readmode.styl:120
      //    写的是 `var(-highlight-bg)`（少一个横杠，104 行是对的）。浏览器会
      //    静默丢弃这条声明，所以 Hexo 下一直不报错；但 lightningcss 是严格
      //    解析器，遇到非法自定义属性直接让整个构建失败：
      //    `[lightningcss minify] Unexpected token Ident("-highlight-bg")`。
      //    修上游那处笔误会让 read-mode 的代码块背景真的生效，跟上游的视觉
      //    不一致（上游实际是「没生效」），验收要求像素级还原，所以不能改。
      //
      // 2. 验收基准 docs/baseline.json 里的 CSS 是上游 `hexo g` 的未压缩产物
      //    （683218 字节）。压缩后会差 30% 以上，verify-css 的 ±5% 判定必然失败。
      //
      // 压缩属于性能优化，按 PLAN 的原则放到 Phase 7 再做；那时的做法是让
      // 基准比对用未压缩产物，另建一条「压缩后体积」的独立预算，而不是拿
      // 压缩产物去对未压缩基准。
      cssMinify: false,
    },
    css: {
      preprocessorOptions: {
        stylus: {
          // hexo-renderer-stylus 的 .set('include css', true)：
          // 让 Stylus 把 .css 的 @import 当 literal 原文内联进产物。
          // 插件本身也会通过 config 钩子注入同一项，这里显式写一份用于排查
          // （如果插件注入不生效，删掉这段就能看出来）。
          'include css': true,
        },
      },
    },
    plugins: [
      stylusHexoConfig({
        // 直接复用上游 Hexo 主题的 _config.yml，不做任何改写
        configPath: path.join(root, 'theme.config.yml'),
        debug: true,
      }),
    ],
  },
})
