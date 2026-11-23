/**
 * 第三方嵌入 tag（7 个，附录 B「第三方嵌入」）—— **本批未实现**。
 *
 * 归属 P6-3（第三方嵌入）：`bilibili` `dogeplayer` `mermaid` `link` `flink` `tip` `intCard`。
 *
 * 与 media 一样，本批只导出空表。`src/index.mjs` 的 PENDING_* 集合负责把
 * 这些 tag 原样透传（占位），避免在 P6-2 / P6-3 落地前让整站构建失败。
 *
 * @module remark-hexo-tag/tags/thirdparty
 */

/** 自闭合第三方 tag（`ends: false`）。 */
export const thirdPartyTags = {}

/** 容器型第三方 tag（`ends: true`）。 */
export const thirdPartyBlockTags = {}
