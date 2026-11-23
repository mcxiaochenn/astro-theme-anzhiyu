/**
 * schema.ts — 主题 config 的 zod schema。
 *
 * 设计（P0 结构完整 + P1-12 收紧）：
 *   1. 上游 anzhiyu `_config.yml` 的 133 个顶层 key 全部在 schema 里声明，
 *      上游配置原样喂进来必须零错误（check-schema.mjs 守着这条）；
 *   2. 顶层用 `.strict()`：未知顶层 key（拼写错误 / 上游新增键）直接校验失败，
 *      错误里带未知键名 —— loader.ts 会把 zod 的 `unrecognized_keys` 展开成
 *      一个键一行，方便定位。缺键**不**报错：loader 先用 defaults 深合并，
 *      缺的键回落到默认值（ADR-005 要求用户能直接拷自己改过的配置）；
 *   3. 区块内部保持宽松：已展开的区块给出已知子键的精确类型，但每层对象都
 *      `.passthrough()`，未知子键继续透传（用户魔改配置 / 上游新增子键兼容）。
 *      也就是说 P1-12 只收紧「顶层键是否存在」，不收紧「区块内是否有多余键」；
 *   4. 上游为 null 的 11 个顶层键（menu / social / 5 个 analytics / index_site_info_top /
 *      index_top_img_height / category_ui / tag_ui）保持 `z.unknown()`，不编造类型，
 *      但必须继续被接受（用户会把它们填成对象/字符串）。
 *
 * P1-12 按 Phase 2/3 的实际使用顺序展开了 17 个顶层区块的子键：
 *   nav（含 nav.menu 分组与菜单项）、post_meta、aside（display + 9 张边栏卡片）、
 *   home_top（category / swiper / banner）、footer（owner/runtime/bdageitem/socialBar/
 *   list/footerBar）、comments（use 的三种形态）、valine / waline / twikoo / artalk /
 *   giscus（连接参数）、reward（QR_code 项）、index_post_content、related_post、
 *   post_edit、copy、ptool。
 *   其余 56 个整块宽松的顶层键（渲染工具类开关）仍保持 looseObject，后续按需展开。
 */
import { z } from 'zod';

/** 宽松对象：已知是 object 的区块先不列子键，允许任意子键通过。 */
export const looseObject = z.object({}).passthrough();

/** 宽松数组：元素类型未知。 */
const looseArray = z.array(z.unknown());

/** 可空字符串：上游默认 null、用户填字符串的连接参数之类。 */
const nullableString = z.string().nullable();

/* ------------------------------------------------------------------ */
/* 明确类型的顶层分区块（已知标量键给明确类型，其余子键 passthrough）      */
/* ------------------------------------------------------------------ */

/* ===== nav（Phase 2 P2-4 Header；导航分组 / 菜单项结构来自 nav.pug） ===== */

/** nav.menu 的菜单项（nav.pug：item.name / item.link / item.icon）。 */
const navMenuItemSchema = z
  .object({
    name: z.string(),
    link: z.string(),
    icon: z.string(),
  })
  .passthrough();

/** nav.menu 的分组（nav.pug / sidebar.pug：group.title + group.item[]）。 */
const navMenuGroupSchema = z
  .object({
    title: z.string(),
    item: z.array(navMenuItemSchema),
  })
  .passthrough();

const navSchema = z
  .object({
    enable: z.boolean(),
    travelling: z.boolean(),
    clock: z.boolean(),
    menu: z.array(navMenuGroupSchema),
  })
  .passthrough();

/* ===== post_meta（Phase 2 P2-8 文章页 / P2-7 首页卡片） ===== */

/** post_meta.page（_config.yml：5 个键，page 没有 unread）。 */
const postMetaPageSchema = z
  .object({
    date_type: z.string(),
    date_format: z.string(),
    categories: z.boolean(),
    tags: z.boolean(),
    label: z.boolean(),
  })
  .passthrough();

/** post_meta.post（比 page 多一个 unread）。 */
const postMetaPostSchema = z
  .object({
    date_type: z.string(),
    date_format: z.string(),
    categories: z.boolean(),
    tags: z.boolean(),
    label: z.boolean(),
    unread: z.boolean(),
  })
  .passthrough();

const postMetaSchema = z
  .object({
    page: postMetaPageSchema,
    post: postMetaPostSchema,
  })
  .passthrough();

/* ===== aside（Phase 2 P2-5 Sidebar；display + 8 张卡片 + 1 张可选卡片） ===== */

const asideDisplaySchema = z
  .object({
    archive: z.boolean(),
    tag: z.boolean(),
    category: z.boolean(),
  })
  .passthrough();

const asideCardAuthorSchema = z
  .object({
    enable: z.boolean(),
    description: nullableString,
    name_link: z.string(),
  })
  .passthrough();

const asideCardAnnouncementSchema = z
  .object({
    enable: z.boolean(),
    content: z.string(),
  })
  .passthrough();

const asideCardWeixinSchema = z
  .object({
    enable: z.boolean(),
    face: z.string(),
    backFace: z.string(),
  })
  .passthrough();

const asideCardRecentPostSchema = z
  .object({
    enable: z.boolean(),
    limit: z.number(),
    sort: z.string(),
    sort_order: z.number().nullable(),
  })
  .passthrough();

const asideCardCategoriesSchema = z
  .object({
    enable: z.boolean(),
    limit: z.number(),
    expand: z.string(),
    sort_order: z.number().nullable(),
  })
  .passthrough();

const asideCardTagsSchema = z
  .object({
    enable: z.boolean(),
    limit: z.number(),
    color: z.boolean(),
    /** orderby / order 只在 merge_config.js 的默认值里，_config.yml 未列出 → optional。 */
    orderby: z.string().optional(),
    order: z.number().optional(),
    sort_order: z.number().nullable(),
    highlightTags: z.array(z.string()).nullable(),
  })
  .passthrough();

const asideCardArchivesSchema = z
  .object({
    enable: z.boolean(),
    type: z.string(),
    format: z.string(),
    order: z.number(),
    limit: z.number(),
    sort_order: z.number().nullable(),
  })
  .passthrough();

const asideCardWebinfoSchema = z
  .object({
    enable: z.boolean(),
    post_count: z.boolean(),
    last_push_date: z.boolean(),
    sort_order: z.number().nullable(),
  })
  .passthrough();

/** card_post_series 只在 merge_config.js 默认值里，_config.yml 没有 → 整块 optional。 */
const asideCardPostSeriesSchema = z
  .object({
    enable: z.boolean(),
    orderBy: z.string(),
    order: z.number(),
  })
  .passthrough();

const asideSchema = z
  .object({
    enable: z.boolean(),
    hide: z.boolean(),
    button: z.boolean(),
    mobile: z.boolean(),
    position: z.string(),
    display: asideDisplaySchema,
    card_author: asideCardAuthorSchema,
    card_announcement: asideCardAnnouncementSchema,
    card_weixin: asideCardWeixinSchema,
    card_recent_post: asideCardRecentPostSchema,
    card_categories: asideCardCategoriesSchema,
    card_tags: asideCardTagsSchema,
    card_archives: asideCardArchivesSchema,
    card_webinfo: asideCardWebinfoSchema,
    card_post_series: asideCardPostSeriesSchema.optional(),
  })
  .passthrough();

/* ===== home_top（Phase 2 P2-7 首页顶部；结构来自 top.pug） ===== */

const homeTopCategorySchema = z
  .object({
    name: z.string(),
    path: z.string(),
    shadow: z.string(),
    class: z.string(),
    icon: z.string(),
  })
  .passthrough();

const homeTopSwiperSchema = z
  .object({
    enable: z.boolean(),
    swiper_css: z.string(),
    swiper_js: z.string(),
  })
  .passthrough();

const homeTopBannerSchema = z
  .object({
    tips: z.string(),
    title: z.string(),
    image: z.string(),
    link: z.string(),
    /** top.pug 会读，但 _config.yml 未列出 → optional。 */
    top_group_banner_css: z.string().optional(),
  })
  .passthrough();

const homeTopSchema = z
  .object({
    enable: z.boolean(),
    timemode: z.string(),
    title: z.string(),
    subTitle: z.string(),
    siteText: z.string(),
    category: z.array(homeTopCategorySchema),
    default_descr: z.string(),
    swiper: homeTopSwiperSchema,
    banner: homeTopBannerSchema,
  })
  .passthrough();

/* ===== footer（Phase 2 P2-4 Footer；结构来自 footer.pug） ===== */

const footerOwnerSchema = z
  .object({
    enable: z.boolean(),
    since: z.number(),
  })
  .passthrough();

const footerRuntimeSchema = z
  .object({
    enable: z.boolean(),
    launch_time: z.string(),
    work_img: z.string(),
    work_description: z.string(),
    offduty_img: z.string(),
    offduty_description: z.string(),
  })
  .passthrough();

const footerBadgeItemSchema = z
  .object({
    link: z.string(),
    shields: z.string(),
    message: z.string(),
  })
  .passthrough();

const footerBadgeSchema = z
  .object({
    enable: z.boolean(),
    list: z.array(footerBadgeItemSchema),
  })
  .passthrough();

/** socialBar.left / right 的元素（footer.pug：item.link / item.title / item.icon）。 */
const footerSocialLinkSchema = z
  .object({
    link: z.string(),
    title: z.string(),
    icon: z.string(),
  })
  .passthrough();

const footerSocialBarSchema = z
  .object({
    enable: z.boolean(),
    centerImg: nullableString,
    left: z.array(footerSocialLinkSchema).nullable(),
    right: z.array(footerSocialLinkSchema).nullable(),
  })
  .passthrough();

/** list.project 的元素（footer.pug：item.title + item.links[].title/.link）。 */
const footerProjectLinkSchema = z
  .object({
    title: z.string(),
    link: z.string(),
  })
  .passthrough();

const footerProjectSchema = z
  .object({
    title: z.string(),
    links: z.array(footerProjectLinkSchema),
  })
  .passthrough();

const footerListSchema = z
  .object({
    enable: z.boolean(),
    randomFriends: z.number(),
    project: z.array(footerProjectSchema).nullable(),
  })
  .passthrough();

const footerBarCcSchema = z
  .object({
    enable: z.boolean(),
    link: z.string(),
  })
  .passthrough();

const footerBarLinkSchema = z
  .object({
    link: z.string(),
    text: z.string(),
  })
  .passthrough();

/** footerBar.subTitle（footerBarSubtitle.pug：sub 可为 null 或字符串数组）。 */
const footerBarSubTitleSchema = z
  .object({
    enable: z.boolean(),
    effect: z.boolean(),
    startDelay: z.number(),
    typeSpeed: z.number(),
    backSpeed: z.number(),
    loop: z.boolean(),
    source: z.number(),
    sub: z.array(z.string()).nullable(),
  })
  .passthrough();

const footerBarSchema = z
  .object({
    enable: z.boolean(),
    authorLink: z.string(),
    cc: footerBarCcSchema,
    linkList: z.array(footerBarLinkSchema),
    subTitle: footerBarSubTitleSchema,
  })
  .passthrough();

const footerSchema = z
  .object({
    owner: footerOwnerSchema,
    custom_text: nullableString,
    runtime: footerRuntimeSchema,
    bdageitem: footerBadgeSchema,
    socialBar: footerSocialBarSchema,
    list: footerListSchema,
    footerBar: footerBarSchema,
  })
  .passthrough();

/* ===== comments + 5 个评论插件（Phase 5 P5-1；comments.use 影响 Phase 2 计数） ===== */

/**
 * comments.use 的三种形态（上游 scripts/events/comment.js）：
 *   null            → 不启用评论
 *   "valine,waline" → 逗号分隔字符串，before_generate 时切成数组
 *   ["valine"]      → 数组
 * 插件名大小写不敏感（filter 统一转 PascalCase），所以只约束结构不约束取值。
 */
const commentsSchema = z
  .object({
    use: z.union([z.string(), z.array(z.string())]).nullable(),
    text: z.boolean(),
    lazyload: z.boolean(),
    count: z.boolean(),
    card_post_count: z.boolean(),
  })
  .passthrough();

/** 多服务器 URL：Valine serverURLs / Waline serverURL 都允许字符串或数组。 */
const serverUrlSchema = z.union([z.string(), z.array(z.string())]).nullable();

/** Valine master / friends 元素：QQ 号可能写成数字，也允许字符串。 */
const commentAccountSchema = z.array(z.union([z.string(), z.number()]));

const valineSchema = z
  .object({
    appId: z.string(),
    appKey: z.string(),
    pageSize: z.number(),
    avatar: z.string(),
    lang: z.string(),
    placeholder: z.string(),
    guest_info: z.string(),
    recordIP: z.boolean(),
    serverURLs: serverUrlSchema,
    bg: z.string(),
    emojiCDN: z.string(),
    enableQQ: z.boolean(),
    requiredFields: z.string(),
    visitor: z.boolean(),
    master: commentAccountSchema,
    friends: commentAccountSchema,
    tagMeta: z.string(),
    option: z.unknown(),
  })
  .passthrough();

const walineSchema = z
  .object({
    serverURL: serverUrlSchema,
    bg: nullableString,
    pageview: z.boolean(),
    meta_css: z.boolean(),
    imageUploader: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

const twikooSchema = z
  .object({
    envId: nullableString,
    region: nullableString,
    visitor: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

const artalkSchema = z
  .object({
    server: nullableString,
    site: nullableString,
    visitor: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

/** giscus 暗色/亮色主题映射（giscus.pug 直接取 themes.dark / themes.light）。 */
const giscusThemeSchema = z
  .object({
    light: z.string(),
    dark: z.string(),
  })
  .passthrough();

/** giscus 的 data-* 参数；其余任意 data-* 通过 passthrough 透传。 */
const giscusOptionSchema = z
  .object({
    'data-lang': nullableString,
    'data-mapping': nullableString,
    'data-category': nullableString,
    'data-input-position': nullableString,
  })
  .passthrough();

const giscusSchema = z
  .object({
    repo: nullableString,
    repo_id: nullableString,
    category_id: nullableString,
    theme: giscusThemeSchema,
    option: giscusOptionSchema,
  })
  .passthrough();

/* ===== reward（Phase 2 P2-8 文章页打赏；结构来自 reward.pug） ===== */

const rewardQrCodeSchema = z
  .object({
    img: z.string(),
    link: nullableString,
    text: z.string(),
  })
  .passthrough();

const rewardSchema = z
  .object({
    enable: z.boolean(),
    /** merge_config.js 默认 null，template 仅在 truthy 时渲染 → nullable。 */
    QR_code: z.array(rewardQrCodeSchema).nullable(),
  })
  .passthrough();

/* ===== 以下是 Phase 2 文章页/首页要用到、原来整块宽松的区块 ===== */

/** index_post_content（P2-7 首页摘要；post-ui.pug 的 switch 按 method 分支）。 */
const indexPostContentSchema = z
  .object({
    method: z.number(),
    length: z.number(),
  })
  .passthrough();

/** related_post（P2-8 文章页相关推荐 / P2-10 404 页）。 */
const relatedPostSchema = z
  .object({
    enable: z.boolean(),
    limit: z.number(),
    date_type: z.string(),
  })
  .passthrough();

/**
 * post_edit（P2-8 文章页）。
 * github / yuque 既是开关也可以是 URL：false 关闭，字符串时当编辑地址模板
 * （_config.yml 注释：`github: https://github.com/user/repo/edit/...`）。
 */
const postEditSchema = z
  .object({
    enable: z.boolean(),
    github: z.union([z.boolean(), z.string()]),
    yuque: z.union([z.boolean(), z.string()]),
  })
  .passthrough();

/** copy（P2-8 文章页复制版权；head/config.pug 读 copyright.enable/limit_count）。 */
const copySchema = z
  .object({
    enable: z.boolean(),
    copyright: z
      .object({
        enable: z.boolean(),
        limit_count: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

/** ptool（P2-8 文章页工具条；ptool.pug / post-copyright.pug）。 */
const ptoolSchema = z
  .object({
    enable: z.boolean(),
    share_mobile: z.boolean(),
    share_weibo: z.boolean(),
    share_copyurl: z.boolean(),
    categories: z.boolean(),
    mode: nullableString,
  })
  .passthrough();

const tocSchema = z
  .object({
    post: z.boolean(),
    page: z.boolean(),
    number: z.boolean(),
    expand: z.boolean(),
    style_simple: z.boolean(),
  })
  .passthrough();

const postCopyrightSchema = z
  .object({
    enable: z.boolean(),
    decode: z.boolean(),
    author_href: z.string().nullable(),
    location: z.string(),
    license: z.string(),
    license_url: z.string(),
    avatarSinks: z.boolean(),
    copyright_author_img_back: z.string().nullable(),
    copyright_author_img_front: z.string().nullable(),
    copyright_author_link: z.string(),
  })
  .passthrough();

const themeColorSchema = z
  .object({
    enable: z.boolean(),
    main: z.string(),
    dark_main: z.string(),
    paginator: z.string(),
    text_selection: z.string(),
    link_color: z.string(),
    meta_color: z.string(),
    hr_color: z.string(),
    code_foreground: z.string(),
    code_background: z.string(),
    toc_color: z.string(),
    scrollbar_color: z.string(),
    meta_theme_color_light: z.string(),
    meta_theme_color_dark: z.string(),
  })
  .passthrough();

const sidebarSchema = z
  .object({
    site_data: looseObject,
    menus_items: z.boolean(),
    tags_cloud: z.boolean(),
    display_mode: z.boolean(),
    nav_menu_project: z.boolean(),
  })
  .passthrough();

const coverSchema = z
  .object({
    index_enable: z.boolean(),
    aside_enable: z.boolean(),
    archives_enable: z.boolean(),
    position: z.string(),
    default_cover: z.unknown(),
  })
  .passthrough();

const fontSchema = z
  .object({
    'global-font-size': z.string(),
    'code-font-size': z.string().nullable(),
    'font-family': z.string().nullable(),
    'code-font-family': z.string(),
  })
  .passthrough();

const subtitleSchema = z
  .object({
    enable: z.boolean(),
    effect: z.boolean(),
    startDelay: z.number(),
    typeSpeed: z.number(),
    backSpeed: z.number(),
    loop: z.boolean(),
    source: z.number(),
    sub: z.unknown(),
  })
  .passthrough();

const cdnSchema = z
  .object({
    internal_provider: z.string(),
    third_party_provider: z.string(),
    version: z.boolean(),
    custom_format: z.unknown(),
    option: z.unknown(),
  })
  .passthrough();

const injectSchema = z
  .object({
    head: z.unknown(),
    bottom: z.unknown(),
  })
  .passthrough();

const pwaSchema = z
  .object({
    enable: z.boolean(),
    startup_image_enable: z.boolean(),
    manifest: z.string(),
    theme_color: z.string(),
    mask_icon: z.string(),
    apple_touch_icon: z.string(),
    bookmark_icon: z.string(),
    favicon_32_32: z.string(),
    favicon_16_16: z.string(),
  })
  .passthrough();

const darkmodeSchema = z
  .object({
    enable: z.boolean(),
    button: z.boolean(),
    autoChangeMode: z.number(),
    start: z.unknown(),
    end: z.unknown(),
  })
  .passthrough();

const authorStatusSchema = z
  .object({
    enable: z.boolean(),
    statusImg: z.string(),
    skills: z.unknown(),
  })
  .passthrough();

const wordcountSchema = z
  .object({
    enable: z.boolean(),
    post_wordcount: z.boolean(),
    min2read: z.boolean(),
    total_wordcount: z.boolean(),
  })
  .passthrough();

const sharejsSchema = z
  .object({
    enable: z.boolean(),
    sites: z.string(),
  })
  .passthrough();

const noticeOutdateSchema = z
  .object({
    enable: z.boolean(),
    style: z.string(),
    limit_day: z.number(),
    position: z.string(),
    message_prev: z.string(),
    message_next: z.string(),
  })
  .passthrough();

const algoliaSearchSchema = z
  .object({
    enable: z.boolean(),
    hits: looseObject,
    tags: z.unknown(),
  })
  .passthrough();

const localSearchSchema = z
  .object({
    enable: z.boolean(),
    preload: z.boolean(),
    CDN: z.unknown(),
  })
  .passthrough();

const mathjaxSchema = z
  .object({
    enable: z.boolean(),
    per_page: z.boolean(),
  })
  .passthrough();

const katexSchema = z
  .object({
    enable: z.boolean(),
    per_page: z.boolean(),
    hide_scrollbar: z.boolean(),
  })
  .passthrough();

/* ------------------------------------------------------------------ */
/* 其余顶层 key：类型宽松兜底（P1-12 未展开的 56 个整块）                  */
/* ------------------------------------------------------------------ */

const looseTopLevel = {
  // 上游为 null，用户可替换为任意结构（P1-12：保持 unknown，不编造类型）
  menu: z.unknown(),
  social: z.unknown(),
  baidu_analytics: z.unknown(),
  google_analytics: z.unknown(),
  cnzz_analytics: z.unknown(),
  cloudflare_analytics: z.unknown(),
  microsoft_clarity: z.unknown(),
  index_site_info_top: z.unknown(),
  index_top_img_height: z.unknown(),
  category_ui: z.unknown(),
  tag_ui: z.unknown(),

  // 上游为 object，整块 passthrough（待后续按需展开）
  mourn: looseObject,
  docsearch: looseObject,
  avatar: looseObject,
  error_img: looseObject,
  error_404: looseObject,
  mainTone: looseObject,
  addtoany: looseObject,
  chatra: looseObject,
  tidio: looseObject,
  daovoice: looseObject,
  crisp: looseObject,
  google_adsense: looseObject,
  canvas_ribbon: looseObject,
  canvas_fluttering_ribbon: looseObject,
  canvas_nest: looseObject,
  activate_power_mode: looseObject,
  fireworks: looseObject,
  click_heart: looseObject,
  ClickShowText: looseObject,
  beautify: looseObject,
  blog_title_font: looseObject,
  hr_icon: looseObject,
  preloader: looseObject,
  busuanzi: looseObject,
  runtimeshow: looseObject,
  newest_comments: looseObject,
  translate: looseObject,
  centerConsole: looseObject,
  rightside_item_order: looseObject,
  mermaid: looseObject,
  note: looseObject,
  icons: looseObject,
  pjax: looseObject,
  aplayerInject: looseObject,
  snackbar: looseObject,
  pangu: looseObject,
  lazyload: looseObject,
  friends_vue: looseObject,
  universe: looseObject,
  bubble: looseObject,
  console: looseObject,
  LA: looseObject,
  umami: looseObject,
  diytitle: looseObject,
  comment_barrage_config: looseObject,
  nav_music: looseObject,
  visitorMail: looseObject,
  greetingBox: looseObject,
  post_head_ai_description: looseObject,
  shortcutKey: looseObject,
  accesskey: looseObject,
  linkPageTop: looseObject,
  agreementPopup: looseObject,
  rightClickMenu: looseObject,
  peoplecanvas: looseObject,
  dynamicEffect: looseObject,

  // 上游为 string
  highlight_theme: z.string(),
  favicon: z.string(),
  'rightside-bottom': z.string(),
  display_mode: z.string(),
  music_page_default: z.string(),
  pageThumbnailSuffix: z.string(),

  // 上游为 boolean
  highlight_copy: z.boolean(),
  highlight_lang: z.boolean(),
  highlight_shrink: z.boolean(),
  code_word_wrap: z.boolean(),
  disable_top_img: z.boolean(),
  index_img: z.boolean(),
  default_top_img: z.boolean(),
  anchor: z.boolean(),
  photofigcaption: z.boolean(),
  chat_btn: z.boolean(),
  chat_hide_show: z.boolean(),
  h2Divider: z.boolean(),
  table_interlaced_discoloration: z.boolean(),
  article_double_row: z.boolean(),
  footer_bg: z.boolean(),
  readmode: z.boolean(),
  medium_zoom: z.boolean(),
  fancybox: z.boolean(),
  instantpage: z.boolean(),
  Open_Graph_meta: z.boolean(),
  css_prefix: z.boolean(),

  // 上游为 number
  highlight_height_limit: z.number(),
  post_pagination: z.number(),

  // 上游为 array
  site_verification: looseArray,
};

/* ------------------------------------------------------------------ */
/* 顶层 schema                                                         */
/* ------------------------------------------------------------------ */

export const themeConfigSchema = z
  .object({
    ...looseTopLevel,

    // 明确类型的分区块（放在展开之后，便于以后逐块替换 / 收紧）
    nav: navSchema,
    toc: tocSchema,
    post_meta: postMetaSchema,
    post_copyright: postCopyrightSchema,
    theme_color: themeColorSchema,
    sidebar: sidebarSchema,
    cover: coverSchema,
    comments: commentsSchema,
    valine: valineSchema,
    waline: walineSchema,
    twikoo: twikooSchema,
    artalk: artalkSchema,
    giscus: giscusSchema,
    footer: footerSchema,
    font: fontSchema,
    subtitle: subtitleSchema,
    aside: asideSchema,
    home_top: homeTopSchema,
    CDN: cdnSchema,
    inject: injectSchema,
    pwa: pwaSchema,
    darkmode: darkmodeSchema,
    author_status: authorStatusSchema,
    wordcount: wordcountSchema,
    reward: rewardSchema,
    sharejs: sharejsSchema,
    noticeOutdate: noticeOutdateSchema,
    algolia_search: algoliaSearchSchema,
    local_search: localSearchSchema,
    mathjax: mathjaxSchema,
    katex: katexSchema,
    index_post_content: indexPostContentSchema,
    related_post: relatedPostSchema,
    post_edit: postEditSchema,
    copy: copySchema,
    ptool: ptoolSchema,
  })
  // P1-12：顶层 strict。未知顶层键（拼错 / 上游新增）直接失败，
  // loader.ts 把 zod 的 unrecognized_keys 展开成一个键一行。
  .strict();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type ThemeConfigInput = z.input<typeof themeConfigSchema>;

/** schema 已声明的顶层 key（= 上游全部 133 个顶层 key）。 */
export const KNOWN_TOP_LEVEL_KEYS: readonly string[] = Object.keys(
  themeConfigSchema.shape,
);
