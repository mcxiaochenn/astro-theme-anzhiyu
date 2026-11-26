/**
 * astro-theme-anzhiyu — package entry.
 *
 * 配置层：默认值 + zod schema + loader（读取用户 YAML、深合并默认值并校验）。
 * i18n：4 个上游语言字典 + `t()` / `tp()`（对齐 Hexo `__` / `_p`）。
 * helper 层：上游 12 个 Hexo helper 扩展文件的纯函数移植。
 */
export { defaults, type ThemeDefaults } from './config/defaults.ts';
export {
  themeConfigSchema,
  type ThemeConfig,
  type ThemeConfigInput,
  looseObject,
  KNOWN_TOP_LEVEL_KEYS,
} from './config/schema.ts';
export {
  loadThemeConfig,
  type LoadThemeConfigOptions,
} from './config/loader.ts';

/* ------------------------------------------------------------------ */
/* i18n（P2-11）                                                       */
/* ------------------------------------------------------------------ */
export {
  LANGUAGES,
  i18n,
  t,
  tp,
  has,
  dictionary,
  createI18n,
  interpolate,
  flattenDictionary,
  normalizeLanguage,
} from './i18n/index.ts';
export type {
  Language,
  Dictionary,
  DictionaryInput,
  Dictionaries,
  I18n,
} from './i18n/index.ts';

/* ------------------------------------------------------------------ */
/* helpers（P2-6）                                                     */
/* ------------------------------------------------------------------ */
export {
  // hexo-util 等价实现
  escapeHtml,
  stripHtml,
  prettyUrls,
  md5Hex,
  // 日期工具（替代 moment）
  toMomentLocale,
  getDateParts,
  monthName,
  formatMomentLike,
  compareValues,
  // aside_archives.js
  asideArchives,
  // aside_categories.js
  asideCategories,
  // catalog_list.js
  catalogList,
  // findArchiveLength.js
  getArchiveLength,
  // get_version.js
  getVersion,
  // inject_head_js.js
  injectHeadJs,
  // page.js
  pageDescription,
  getPageFillDescription,
  cloudTags,
  urlNoIndex,
  md5,
  injectHtml,
  findArchivesTitle,
  isImgOrUrl,
  // random.js
  randomGenerator,
  // related_post.js
  relatedPosts,
  // sort_attr_post.js
  sortAttrPost,
  // tags_page_list.js
  tagsPageList,
  // year.js
  getAnimalIcon,
} from './utils/helpers.ts';
export type {
  UrlFor,
  Translate,
  FormatDate,
  DateLike,
  DateParts,
  PrettyUrlsOptions,
  AsideArchivesOptions,
  AsideArchivesInput,
  AsideCategoryLike,
  AsideCategoriesOptions,
  AsideCategoriesInput,
  CatalogItemLike,
  ArchiveGeneratorConfig,
  GetArchiveLengthInput,
  InjectHeadJsInput,
  PageLike,
  PageDescriptionInput,
  CloudTagLike,
  CloudTagsOptions,
  CloudTagsInput,
  FindArchivesTitlePage,
  FindArchivesTitleInput,
  RandomLinkGroup,
  RandomGeneratorInput,
  RelatedPostLike,
  RelatedPostsEnv,
  SortAttrPostLike,
  SortAttrPostInput,
  TagsPageItemLike,
} from './utils/helpers.ts';
