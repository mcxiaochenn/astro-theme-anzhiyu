/**
 * 站点数据层（P3-2）— 上游 Hexo `source/_data/*.yml` 的等价物。
 *
 * 上游模板直接读 `site.data.<name>`（Hexo 在启动时把 `source/_data/*.yml`
 * 解析成全局对象），典型消费者：
 *   - `layout/includes/page/about.pug:1`      → `site.data.about`
 *   - `layout/includes/page/essay.pug:1`      → `site.data.essay`
 *   - `layout/includes/page/album.pug:14`     → `site.data.album`
 *   - `layout/includes/page/album_detail.pug:2` → `site.data.album`
 *   - `layout/includes/page/flink.pug:24,51`  → `site.data.link`
 *   - `layout/includes/page/equipment.pug:2`  → `site.data.equipment`
 *
 * Astro 侧对应 `examples/blog/data/*.yml`：构建期用 `import.meta.glob` 把整目录
 * 以 raw 文本收进来，再用 `yaml` 解析。模块级缓存保证：
 *   1. 同一份 YAML 只解析一次（多个页面/组件共享）；
 *   2. 解析失败在构建期直接抛错，而不是静默返回空对象（与上游「缺文件就没有数据」
 *      的语义不同：这里的文件名是静态存在的，坏 YAML 属于配置错误）。
 *
 * 为什么放在站点侧而不是主题包：`site.data` 是站点的内容，不是主题的默认值；
 * 主题包只接受组件 props。站点路由（`src/pages/[...path].astro`）负责把
 * `getSiteData(...)` 的结果传给主题的页面组件。
 */
import { parse } from 'yaml'

/** 与 `data/*.yml` 一一对应的逻辑名（上游 `site.data.<name>`）。 */
export type SiteDataName = 'about' | 'essay' | 'album' | 'link' | 'equipment' | 'creativity'

const modules = import.meta.glob('../../data/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 文件名（不含扩展名）→ 原始 YAML 文本。 */
const sources = new Map<string, string>()
for (const [filePath, raw] of Object.entries(modules)) {
  const name = /\/([^/]+)\.yml$/.exec(filePath)?.[1]
  if (name) sources.set(name, raw)
}

const cache = new Map<string, unknown>()

/**
 * 读取并解析 `examples/blog/data/<name>.yml`。
 * 文件不存在时返回 `undefined`（对应上游 `if site.data.<name>` 的假值分支）。
 */
export function getSiteData<T = unknown>(name: SiteDataName | string): T | undefined {
  if (cache.has(name)) return cache.get(name) as T | undefined

  const raw = sources.get(name)
  if (raw === undefined) {
    cache.set(name, undefined)
    return undefined
  }

  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`[site-data] 解析 data/${name}.yml 失败：${message}`)
  }

  cache.set(name, parsed)
  return parsed as T
}
