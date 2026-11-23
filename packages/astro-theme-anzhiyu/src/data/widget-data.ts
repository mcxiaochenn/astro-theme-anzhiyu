/**
 * widget-data.ts — 上游 `site.data.widget` 的形状（P3-1）。
 *
 * 上游从 `source/_data/widget.yml` 读取：
 *   - `widget.top[]`    → `card_top_self.pug`
 *   - `widget.bottom[]` → `card_bottom_self.pug`
 *
 * Astro 站还没有等价的站点数据层（Phase 7 迁移脚本才会落地），
 * 所以卡片组件只接收调用方整理好的数组；没有数据时输出为空。
 */
export interface WidgetDataItem {
  /** `.card-widget` 追加的 class（如 `card-custom`）。 */
  class_name?: string
  /** `.card-widget` 的 id。 */
  id_name?: string
  /** 标题图标 class（`anzhiyufont anzhiyu-icon-...`）。 */
  icon?: string
  /** 标题文本。 */
  name?: string
  /** 卡片正文（原样 HTML）。 */
  html?: string
  /** 仅 bottom 使用：`order: n` 内联样式。 */
  order?: number
}
