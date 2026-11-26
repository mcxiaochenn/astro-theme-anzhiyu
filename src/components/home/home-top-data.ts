/**
 * home-top-data.ts — `#home_top` 两处 `sort_attr_post()` 调用的数据准备（P2-7）。
 *
 * 上游 `top.pug`：
 *   - swiper 关闭 → `sort_attr_post("top_group_list").splice(0, 6)`（.topGroup）
 *   - swiper 开启 → `sort_attr_post("swiper_list")`（轮播）+ `sort_attr_post("top_group_list").splice(0, 4)`
 *     （#topPostGroup）
 *
 * `top_group_list` 的选择已由 `post-list.ts` 的 `selectTopGroupPosts()` 复用（卡片列表也用它）；
 * 这里只补一个 `swiper_list` 版本，排序口径与上游 helper 完全一致：
 * helper 的入参是 `hexo.locals.get('posts').data`（date 降序 → path 码点升序），
 * 不是首页 sticky 排序。
 */
import { sortAttrPost } from '../../utils/helpers.ts'
import type { PreparedPost } from '../post/post-list.ts'

/** 与 `post-list.ts` 内部一致的字符串比较（码点升序）。 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * `sort_attr_post("swiper_list")` 对应的文章列表（swiper 开启时 4 篇）。
 *
 * 注意 `sortAttrPost` 的入参需要保持 `hexo.locals` 的顺序，否则「用最新文章补足」
 * 会挑错对象。
 */
export function selectSwiperPosts(posts: PreparedPost[]): PreparedPost[] {
  const byDate = [...posts].sort(
    (a, b) => b.date.xml.localeCompare(a.date.xml) || byCodePoint(a.path, b.path),
  )
  const byPath = new Map(byDate.map((post) => [post.path, post]))
  const selected =
    sortAttrPost('swiper_list', {
      posts: byDate.map((post) => ({
        path: post.path,
        swiper_index: post.swiperIndex,
        top_group_index: post.topGroupIndex,
      })),
      swiperEnable: true,
    }) ?? []
  return selected
    .map((item) => byPath.get(item.path))
    .filter((post): post is PreparedPost => Boolean(post))
    .slice(0, 4)
}
