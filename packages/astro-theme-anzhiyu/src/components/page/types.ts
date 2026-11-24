/**
 * 页面组件共享类型（P3-2）。
 *
 * 上游 `layout/page.pug` 把 `page.*` 与 `site.data.*` 作为 Pug locals 直接注入模板；
 * Astro 组件没有全局 locals，改成显式 props。这里的类型只描述「模板实际会读的字段」，
 * 与 `examples/blog/data/*.yml` 的宽松结构对应，缺字段时按上游的假值分支处理。
 */

/** 已渲染的正文（`page.content`）。`html` 优先，缺失时退回 Astro 的 `Content` 组件。 */
export interface PageContentSlot {
  /** 上游 `page.content`（渲染后的 HTML 字符串）。 */
  html?: string
  /** 内容集合的 `render()` 结果，`html` 不可用时用组件方式渲染。 */
  Content?: any
}

/** `tags_page_list(type)` 的条目：标签/分类页的链接卡片。 */
export interface TaxonomyItem {
  name: string
  path: string
  length: number
}

/* ------------------------------------------------------------------ */
/* site.data.essay                                                     */
/* ------------------------------------------------------------------ */

export interface EssayAplayer {
  id?: string | number
  server?: string
}

export interface EssayItem {
  content?: string
  date?: string
  image?: string[]
  video?: string[]
  aplayer?: EssayAplayer
  link?: string
  from?: string
  address?: string
}

export interface EssayGroup {
  title?: string
  subTitle?: string
  tips?: string
  buttonLink?: string
  buttonText?: string
  top_background?: string
  limit?: number
  essay_list?: EssayItem[]
}

/* ------------------------------------------------------------------ */
/* site.data.album                                                     */
/* ------------------------------------------------------------------ */

export interface AlbumItem {
  content?: string
  date?: string
  image?: string[]
  aplayer?: EssayAplayer
  link?: string
  address?: string
  from?: string
}

export interface AlbumGroup {
  class_name?: string
  description?: string
  cover?: string
  path_name?: string
  type?: number
  top_background?: string
  top_link?: string
  top_btn_text?: string
  rowHeight?: number
  limit?: number
  lazyload?: boolean
  btnLazyload?: boolean
  url?: string
  album_list?: AlbumItem[]
}

/* ------------------------------------------------------------------ */
/* site.data.link                                                      */
/* ------------------------------------------------------------------ */

export interface FlinkItem {
  name?: string
  link?: string
  avatar?: string
  descr?: string
  siteshot?: string
  color?: string
  tag?: string
  recommend?: boolean
}

export interface FlinkGroup {
  class_name?: string
  class_desc?: string
  flink_style?: 'anzhiyu' | 'telescopic' | 'flexcard' | string
  lost_contact?: boolean
  hundredSuffix?: string
  link_list?: FlinkItem[]
}

/* ------------------------------------------------------------------ */
/* site.data.equipment                                                 */
/* ------------------------------------------------------------------ */

export interface EquipmentItem {
  name?: string
  image?: string
  specification?: string
  description?: string
  link?: string
}

export interface EquipmentThing {
  title?: string
  description?: string
  equipment_list?: EquipmentItem[]
}

export interface EquipmentGroup {
  class_name?: string
  description?: string
  tip?: string
  top_background?: string
  good_things?: EquipmentThing[]
}

/* ------------------------------------------------------------------ */
/* site.data.todolist（1.6.14 兼容页，1.7.1 已移除模板）                */
/* ------------------------------------------------------------------ */

/** `source/_data/todolist.yml` 的一条待办。 */
export interface TodoItem {
  content?: string
  /** 是否已完成（决定 `todolist-li-done` class 与圆形图标）。 */
  completed?: boolean
}

/** `todolist.yml` 的一个分组（`seat` 决定渲染在左栏还是右栏）。 */
export interface TodoGroup {
  class_name?: string
  /** `left` / `right`；其它值上游不渲染。 */
  seat?: 'left' | 'right' | string
  todo_list?: TodoItem[]
}
