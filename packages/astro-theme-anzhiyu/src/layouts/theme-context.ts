/**
 * theme-context.ts — 组件层读取主题配置的入口（P2-2 / P2-3）。
 *
 * 布局/组件在构建期（SSG）执行 frontmatter，可以直接走 `loadThemeConfig()`：
 *   - 配置文件搜索/合并/校验全部复用 P1-8 的 loader，不在组件里重复实现；
 *   - 一次构建里多次调用只真正加载一次（模块级缓存）；
 *   - `ANZHIYU_THEME_CONFIG` 环境变量可显式指定配置文件（测试/多站构建用），
 *     不设置时按 loader 的约定在 `process.cwd()`（Astro 项目根）下找
 *     `anzhiyu.config.yml` / `_config.anzhiyu.yml`，找不到则用完整默认值。
 *
 * 为什么不在组件的 props 里传 theme：
 *   主题配置是「整站一份」的构建期数据，逐层透传会让每个组件的签名都膨胀；
 *   而 Astro 组件只在服务端渲染阶段执行，模块级缓存不会跨请求泄漏状态。
 */
import { loadThemeConfig } from '../config/loader.ts';
import type { ThemeConfig } from '../config/schema.ts';

let cached: ThemeConfig | null = null;

/**
 * 读取并缓存主题配置。
 *
 * 显式指定路径写错时 loader 会抛错（不静默回退默认值），这是有意的：
 * 构建期就该炸，而不是产出一份用默认配置的站。
 */
export function getThemeConfig(): ThemeConfig {
  if (cached) return cached;
  const explicit = process.env.ANZHIYU_THEME_CONFIG;
  cached = explicit ? loadThemeConfig({ configPath: explicit }) : loadThemeConfig();
  return cached;
}

/**
 * `looseObject` 区块（preloader / nav_music / home_top …）在 schema 里是
 * 未知值的透传对象，类型上取到什么算什么；这里用一个显式的取值函数收口，
 * 避免组件里散落 `as any`。
 */
export function readFlag(
  section: unknown,
  key: string,
  fallback = false,
): boolean {
  if (!section || typeof section !== 'object') return fallback;
  const value = (section as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

/** 同上，取字符串字段。 */
export function readString(
  section: unknown,
  key: string,
  fallback = '',
): string {
  if (!section || typeof section !== 'object') return fallback;
  const value = (section as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : fallback;
}

/** 同上，取数字字段。 */
export function readNumber(
  section: unknown,
  key: string,
  fallback = 0,
): number {
  if (!section || typeof section !== 'object') return fallback;
  const value = (section as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : fallback;
}
