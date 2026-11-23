import { defineConfig } from 'astro/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stylusHexoConfig } from 'vite-plugin-stylus-hexo-config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  vite: {
    plugins: [
      stylusHexoConfig({
        // 直接复用上游 Hexo 主题的 _config.yml，不做任何改写
        configPath: path.join(root, 'theme.config.yml'),
        debug: true,
      }),
    ],
  },
})
