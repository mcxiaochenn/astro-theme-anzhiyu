/**
 * schema.ts — 主题 config 的 zod schema（第一版：结构完整、类型宽松）。
 *
 * 设计目标（P0）：
 *   1. 上游 anzhiyu `_config.yml` 的全部 133 个顶层 key 都在 schema 里有对应项，
 *      保证真实配置能零错误通过校验；
 *   2. 只对「上游已知的标量 key」给明确类型（boolean / number / string / array），
 *      未知 key、嵌套子键一律 passthrough / unknown 兜底，先不追求 200 键全覆盖的精确类型；
 *   3. 用户配置里出现 schema 未声明的顶层 key 时，safeParse 不会失败（.passthrough()），
 *      但 check-schema.mjs 会单独统计 unknown key 数，方便后续逐块收紧。
 *
 * 下一阶段：按 KNOWN_TOP_LEVEL_KEYS 清单逐块把 passthrough 收紧成精确类型，
 * 并为全部 ~200 个键补 explicit 类型。
 */
import { z } from 'zod';

/** 宽松对象：已知是 object 的区块先不列子键，允许任意子键通过。 */
export const looseObject = z.object({}).passthrough();

/** 宽松数组：元素类型未知。 */
const looseArray = z.array(z.unknown());

/* ------------------------------------------------------------------ */
/* 明确类型的顶层分区块（已知标量键给明确类型，其余子键 passthrough）      */
/* ------------------------------------------------------------------ */

const navSchema = z
  .object({
    enable: z.boolean(),
    travelling: z.boolean(),
    clock: z.boolean(),
    menu: looseArray,
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

const postMetaSchema = z
  .object({
    page: looseObject,
    post: looseObject,
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

const commentsSchema = z
  .object({
    use: z.unknown(), // 上游为 null，用户可填插件名
    text: z.boolean(),
    lazyload: z.boolean(),
    count: z.boolean(),
    card_post_count: z.boolean(),
  })
  .passthrough();

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
    serverURLs: z.unknown(),
    bg: z.string(),
    emojiCDN: z.string(),
    enableQQ: z.boolean(),
    requiredFields: z.string(),
    visitor: z.boolean(),
    master: looseArray,
    friends: looseArray,
    tagMeta: z.string(),
    option: z.unknown(),
  })
  .passthrough();

const walineSchema = z
  .object({
    serverURL: z.unknown(),
    bg: z.unknown(),
    pageview: z.boolean(),
    meta_css: z.boolean(),
    imageUploader: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

const twikooSchema = z
  .object({
    envId: z.unknown(),
    region: z.unknown(),
    visitor: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

const artalkSchema = z
  .object({
    server: z.unknown(),
    site: z.unknown(),
    visitor: z.boolean(),
    option: z.unknown(),
  })
  .passthrough();

const giscusSchema = z
  .object({
    repo: z.string().nullable(),
    repo_id: z.string().nullable(),
    category_id: z.string().nullable(),
    theme: looseObject,
    option: looseObject,
  })
  .passthrough();

const footerSchema = z
  .object({
    owner: looseObject,
    custom_text: z.unknown(),
    runtime: looseObject,
    bdageitem: looseObject,
    socialBar: looseObject,
    list: looseObject,
    footerBar: looseObject,
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

const asideSchema = z
  .object({
    enable: z.boolean(),
    hide: z.boolean(),
    button: z.boolean(),
    mobile: z.boolean(),
    position: z.string(),
    display: looseObject,
    card_author: looseObject,
    card_announcement: looseObject,
    card_weixin: looseObject,
    card_recent_post: looseObject,
    card_categories: looseObject,
    card_tags: looseObject,
    card_archives: looseObject,
    card_webinfo: looseObject,
  })
  .passthrough();

const homeTopSchema = z
  .object({
    enable: z.boolean(),
    timemode: z.string(),
    title: z.string(),
    subTitle: z.string(),
    siteText: z.string(),
    category: looseArray,
    default_descr: z.string(),
    swiper: looseObject,
    banner: looseObject,
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

const rewardSchema = z
  .object({
    enable: z.boolean(),
    QR_code: looseArray,
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
/* 其余顶层 key：类型宽松兜底（第一版不细拆）                             */
/* ------------------------------------------------------------------ */

const looseTopLevel = {
  // 上游为 null，用户可替换为任意结构
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

  // 上游为 object，第一版整体 passthrough
  mourn: looseObject,
  copy: looseObject,
  docsearch: looseObject,
  avatar: looseObject,
  error_img: looseObject,
  error_404: looseObject,
  mainTone: looseObject,
  index_post_content: looseObject,
  post_edit: looseObject,
  related_post: looseObject,
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
  ptool: looseObject,
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
  })
  .passthrough();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type ThemeConfigInput = z.input<typeof themeConfigSchema>;

/** schema 已声明的顶层 key（= 上游全部 133 个顶层 key）。 */
export const KNOWN_TOP_LEVEL_KEYS: readonly string[] = Object.keys(
  themeConfigSchema.shape,
);
