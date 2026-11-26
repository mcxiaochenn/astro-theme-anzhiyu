/**
 * external-link.ts — Hexo 站点级 `external_link` 过滤器的等价判定（P2-4）。
 *
 * 上游 `_config.yml` 开了 `external_link.enable: true`：模板（pug）渲染完之后，
 * 一个 `after_render:html` 过滤器会扫描所有 `<a>`，给「外站链接」补
 * `target="_blank" rel="noopener"`。模板本身不写这两个属性，所以 Astro 组件
 * 必须在输出 `<a>` 时自己补齐，否则全量 HTML diff 会报 attr-missing。
 *
 * 判定与 `components/home/TopGroup.astro` 里的 `isExternalLink` 同源（那份是
 * 组件内私有实现，按本次分工不改动它）：
 *   - 只有「带协议 / 协议相对」的绝对 URL 形态（`http(s)://`、`//`）才参与，
 *     站内相对链接、锚点、`javascript:`、`data:`、`mailto:` 一律不补；
 *   - host 与 `config.url`（siteUrl）的 host 相同视为站内，不补；
 *   - siteUrl 缺失时，只要能解析出 host 就按外链处理。
 *
 * 用法：先 `urlFor()` 得到最终 href，再展开 `externalLinkAttrs()`：
 *   const href = urlFor(path)
 *   <a href={href} {...externalLinkAttrs(href, site.url)}>
 * 各组件用一个局部 `linkAttrs(path)` 把 href 与属性一次算好再展开。
 */

/** 判断最终 href 是否为「外站链接」。 */
export function isExternalLink(href: string, siteUrl?: string): boolean {
  if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href)) return false
  try {
    // 协议相对（//example.com）没有 base 时 new URL 会抛，先给一个假 base 再比 host。
    const host = new URL(href, 'https://example.invalid').hostname
    if (!siteUrl) return Boolean(host)
    return Boolean(host) && host !== new URL(siteUrl, 'https://example.invalid').hostname
  } catch {
    return false
  }
}

/** 外链 → `{ target, rel }`；其余 → `{}`（可直接展开到 `<a>`）。 */
export function externalLinkAttrs(
  href: string,
  siteUrl?: string,
): { target?: string; rel?: string } {
  return isExternalLink(href, siteUrl) ? { target: '_blank', rel: 'noopener' } : {}
}
