/**
 * 媒体与卡片 tag（11 个，附录 B「媒体与卡片」）—— **本批未实现**。
 *
 * 归属 P6-2（媒体与卡片）：`image` `inlineimage` `audio` `video` `videos`
 * `gallery` `galleryGroup` `site` `sitegroup` `btns` `cell`。
 *
 * 本批（P6-1）只交付骨架 + 行内/块级 24 个 tag，因此这里按要求导出空表。
 * 插件对「上游确实注册过、但本批没有 handler」的 tag 走 **透传** 分支：
 * 原样保留 `{% … %}` 文本 + 构建期 warning，保证含这些 tag 的文章仍能构建，
 * 同时不会把它们当成拼写错误。真正的实现落地后，把渲染函数填进下面两张表、
 * 并从 `src/index.mjs` 的 PENDING_* 集合里删掉对应名字即可。
 *
 * @module remark-hexo-tag/tags/media
 */

/** 自闭合媒体/卡片 tag（`ends: false`）。 */
export const mediaTags = {}

/** 容器型媒体/卡片 tag（`ends: true`）。 */
export const mediaBlockTags = {}
