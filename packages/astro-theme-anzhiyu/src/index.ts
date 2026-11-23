/**
 * astro-theme-anzhiyu — package entry.
 *
 * 配置层：默认值 + zod schema + loader（读取用户 YAML、深合并默认值并校验）。
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
