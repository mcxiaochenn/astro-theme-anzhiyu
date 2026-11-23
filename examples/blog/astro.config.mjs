import { defineConfig } from 'astro/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stylusHexoConfig } from 'vite-plugin-stylus-hexo-config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  vite: {
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
