/**
 * loader.ts — 主题配置加载层（P1-8）。
 *
 * 职责：
 *   1. 找到并读取用户配置（YAML）；
 *   2. 与 `defaults` 深合并：对象递归合并、数组与标量整体替换（缺键回落到默认值）；
 *   3. 用 `themeConfigSchema` 校验合并结果，失败时抛错并打印完整键路径；
 *   4. 返回类型化的 ThemeConfig。
 *
 * P1-12：schema 顶层是 `.strict()`，未知顶层键会让校验失败。zod 的
 * `unrecognized_keys` issue 路径在根（`path: []`），键名只出现在 message 里；
 * 这里把它展开成「一个键一行、键名当路径」，方便用户直接看到拼错的键。
 *
 * 文件名约定（按优先级）：
 *   - `anzhiyu.config.yml`      新名，推荐
 *   - `_config.anzhiyu.yml`     旧名，兼容；命中时向 stderr 打 deprecation
 *
 * 未找到任何配置文件时返回一份完整的默认配置（defaults 本身即合法配置），
 * 显式传入的 `configPath` 不存在则直接报错，避免路径写错时静默用默认值。
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { defaults } from './defaults.ts';
import { themeConfigSchema, type ThemeConfig } from './schema.ts';

export interface LoadThemeConfigOptions {
  /** 显式配置文件路径；相对路径按 cwd 解析。 */
  configPath?: string;
  /** 搜索配置文件的目录，默认 process.cwd()。 */
  cwd?: string;
}

/** 配置文件候选名（越靠前优先级越高）。 */
const CONFIG_FILENAMES = ['anzhiyu.config.yml', '_config.anzhiyu.yml'] as const;

/** 触发 deprecation 的旧文件名。 */
const DEPRECATED_FILENAME = '_config.anzhiyu.yml';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy as unknown as T;
  }
  return value;
}

/**
 * 深合并：override 覆盖 base。
 * - 两边都是普通对象 → 递归合并；
 * - 其它情况（数组、标量、null、类型不匹配）→ 整体替换为 override；
 * - 结果全部深拷贝，调用方修改返回值不会污染共享的 defaults。
 */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return clone(override);
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) merged[key] = clone(value);
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    merged[key] =
      isPlainObject(baseValue) && isPlainObject(value)
        ? deepMerge(baseValue, value)
        : clone(value);
  }
  return merged;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 从目录里按候选名找配置文件；找不到返回 null。 */
function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const candidate = resolve(cwd, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 校验合并后的配置；失败时抛错，逐条列出「完整键路径（期望类型）: zod 原始信息」。 */
function validateConfig(merged: unknown, source: string): ThemeConfig {
  const result = themeConfigSchema.safeParse(merged);
  if (result.success) return result.data;

  const lines = result.error.issues.flatMap((issue) => {
    // 顶层 strict 命中的未知键：zod 只在 message 里列键名、path 为空，
    // 这里拆成一个键一行，键名直接当路径输出（见 P1-12）。
    if (issue.code === 'unrecognized_keys') {
      const prefix = issue.path.length > 0 ? `${issue.path.join('.')}.` : '';
      return issue.keys.map(
        (key) =>
          `  - ${prefix}${key}: 未知顶层键（schema 未声明，检查拼写或等主题支持）[unrecognized_keys]`,
      );
    }
    const keyPath = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    const expected =
      'expected' in issue && typeof issue.expected === 'string'
        ? `（期望 ${issue.expected}）`
        : '';
    return [`  - ${keyPath}${expected}: ${issue.message} [${issue.code}]`];
  });
  throw new Error(
    `[theme-config] 配置校验失败（${source}），共 ${lines.length} 处：\n${lines.join('\n')}`,
  );
}

/**
 * 加载主题配置。
 *
 * @param options.configPath 显式配置文件路径（相对路径按 cwd 解析）
 * @param options.cwd        搜索配置文件的目录，默认 process.cwd()
 * @throws 配置文件读取/解析失败、顶层不是 YAML mapping、schema 校验失败
 */
export function loadThemeConfig(options: LoadThemeConfigOptions = {}): ThemeConfig {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const configPath =
    options.configPath !== undefined
      ? isAbsolute(options.configPath)
        ? options.configPath
        : resolve(cwd, options.configPath)
      : findConfigFile(cwd);

  // 没有配置文件：defaults 本身即一份完整合法的配置。
  if (configPath === null) return validateConfig(clone(defaults), '<defaults>');

  if (!existsSync(configPath)) {
    throw new Error(`[theme-config] 配置文件不存在：${configPath}`);
  }

  if (basename(configPath) === DEPRECATED_FILENAME) {
    console.warn(
      `[theme-config] DEPRECATED: 检测到旧配置文件名 ${DEPRECATED_FILENAME}，` +
        `请重命名为 ${CONFIG_FILENAMES[0]}（旧名将在后续版本移除）：${configPath}`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`[theme-config] 读取配置文件失败（${configPath}）：${errorMessage(error)}`);
  }

  let userConfig: unknown;
  try {
    userConfig = parseYaml(raw);
  } catch (error) {
    throw new Error(`[theme-config] 解析 YAML 失败（${configPath}）：${errorMessage(error)}`);
  }

  // 空文件解析为 null，按「没写配置」处理。
  if (userConfig === null) return validateConfig(clone(defaults), configPath);

  if (!isPlainObject(userConfig)) {
    throw new Error(
      `[theme-config] ${configPath} 顶层必须是 YAML mapping（对象），实际为 ${describeValue(userConfig)}`,
    );
  }

  return validateConfig(deepMerge(defaults, userConfig), configPath);
}

export default loadThemeConfig;
