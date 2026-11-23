/**
 * _kit.mjs — P5-1 第三方集成组件的共享工具。
 *
 * 为什么是 .mjs 而不是 .ts：
 *   `scripts/check-third-party.mjs` 用 `node`（Node 24）直接 import 这些渲染函数，
 *   .mjs 无需编译；Astro/Vite 同样能直接 import。渲染函数只接收
 *   `theme`（由 .astro 从 getThemeConfig() 取得）与 `page`（Astro.props），
 *   因此既可单测、又保证组件层不碰 astro:content。
 *
 * 资源 URL 复用 `config/assets.ts` 的 resolveAssets（上游 `theme.asset` 的等价物），
 * 与 Head.astro / AdditionalJs.astro 用的是同一张表；这里再套一次 url_for(root)。
 */
import { resolveAssets } from '../../config/assets.ts'

/** 任意 looseObject 区块的安全读取。 */
export function obj(section) {
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {}
}
export function flag(section, key, fallback = false) {
  const value = obj(section)[key]
  return typeof value === 'boolean' ? value : fallback
}
export function str(section, key, fallback = '') {
  const value = obj(section)[key]
  return typeof value === 'string' ? value : fallback
}
export function num(section, key, fallback = 0) {
  const value = obj(section)[key]
  return typeof value === 'number' ? value : fallback
}

/** HTML 属性/文本转义（上游 pug 的 `= expr` 语义）。 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 把配置值嵌进内联 JS（上游 `!{...}` / JSON.stringify 的等价物）。 */
export function jsval(value) {
  return JSON.stringify(value ?? null)
}

/**
 * 属性表 → 属性串。true 写成布尔属性（async / defer / data-pjax），
 * false / null / undefined / '' 跳过（上游 pug 的 `attr=false` 不输出）。
 */
export function attrs(values) {
  let out = ''
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === false || value === '') continue
    out += value === true ? ` ${key}` : ` ${key}="${esc(value)}"`
  }
  return out
}

/** 内联脚本：上游 `script.` → `<script>…</script>`；防止正文里的 `</script>` 提前闭合。 */
export function inlineScript(body, attrMap = {}) {
  const safe = String(body ?? '').replace(/<\/script/gi, '<\\/script')
  return `<script${attrs(attrMap)}>${safe}</script>`
}

/** 外链脚本：上游 `script(src=…)` → `<script …></script>`（Pug 会输出闭合标签）。 */
export function srcScript(src, attrMap = {}) {
  return `<script${attrs({ src, ...attrMap })}></script>`
}

/** 外链样式：上游 `link(rel='stylesheet' href=…)`。 */
export function styleLink(href, attrMap = {}) {
  return `<link${attrs({ rel: 'stylesheet', href, ...attrMap })}>`
}

const assetCache = new WeakMap()

/**
 * 上游 `url_for(theme.asset.xxx)` 的等价物。
 * resolveAssets 给出相对路径（`/pluginsSrc/...` 或 `js/...`）或完整 URL；
 * 相对路径补站点 root（组件拿不到 site，默认 '/'，基准站即 root='/'）。
 */
export function asset(theme, key, root = '/') {
  let table = assetCache.get(theme)
  if (!table) {
    table = resolveAssets(theme)
    assetCache.set(theme, table)
  }
  const value = table[key] || ''
  if (!value) return ''
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:')) return value
  const prefix = root.endsWith('/') ? root : `${root}/`
  return `${prefix}${value.replace(/^\/+/, '')}`
}

/** 评论系统名（上游 scripts/events/comment.js：大小写不敏感 → PascalCase）。 */
const COMMENT_NAMES = ['Valine', 'Waline', 'Twikoo', 'Artalk', 'Giscus']

export function pascalSystem(value) {
  const key = String(value ?? '').trim().toLowerCase()
  return COMMENT_NAMES.find((name) => name.toLowerCase() === key) || ''
}

/**
 * 归一化 `theme.comments.use`（上游三种形态：null / "valine,waline" / ["valine"]）。
 * 返回去重后的 PascalCase 数组；关闭时为 []。
 */
export function commentSystems(theme) {
  const use = obj(theme.comments).use
  const raw = Array.isArray(use)
    ? use
    : typeof use === 'string'
      ? use.split(',')
      : []
  const out = []
  for (const item of raw) {
    const name = pascalSystem(item)
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** 单个后端组件是否被启用（子 pug 本身无 if，由 use 分发 → 这里补门控）。 */
export function systemEnabled(theme, name) {
  return commentSystems(theme).includes(name)
}

/** `page` props 归一化：支持 `<X page={...}/>` 与 `<X ai={true}/>` 两种传法。 */
export function pageOf(props) {
  if (props && typeof props.page === 'object' && props.page !== null) return props.page
  return props || {}
}
