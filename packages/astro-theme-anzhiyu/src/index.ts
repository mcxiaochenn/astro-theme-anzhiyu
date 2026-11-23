/**
 * astro-theme-anzhiyu — package entry.
 *
 * 当前只导出配置层：默认值 + zod schema。
 * loader（读取用户 _config.yml 并与 defaults 深合并）留给下一个任务。
 */
export { defaults, type ThemeDefaults } from './config/defaults.ts';
export {
  themeConfigSchema,
  type ThemeConfig,
  type ThemeConfigInput,
  looseObject,
  KNOWN_TOP_LEVEL_KEYS,
} from './config/schema.ts';
