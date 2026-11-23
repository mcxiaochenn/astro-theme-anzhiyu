/**
 * toc.ts — 文章目录的数据契约（P2-8 / P3-1 共用）。
 *
 * 上游 `toc(page.content)` 返回的是已经渲染好的嵌套 `<ol class="toc">`；Astro 侧
 * 拆成「标题数据」与「渲染」两步：
 *   - 文章页（P2-8）从渲染后的正文里抽出标题，传给 BaseLayout；
 *   - 侧栏 TOC 卡片（P3-1）只负责按 level 建树并渲染成上游 DOM。
 *
 * 这样两边都不需要重新解析 Markdown，也不会出现「正文标题与目录不一致」。
 */
export interface TocHeading {
  /** 标题文本（已去掉锚点链接）。 */
  text: string;
  /** 标题 id（Hexo/marked 兼容 slugger 的产物，P2-8 M3）。 */
  id: string;
  /** 1–6，对应 h1–h6。上游 TOC 默认从 h2 开始。 */
  level: number;
}
