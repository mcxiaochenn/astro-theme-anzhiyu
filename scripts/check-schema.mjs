/**
 * check-schema.mjs — schema 自检：上游真实 `_config.yml` + P1-12 三条用例。
 *
 * 用法：
 *   node scripts/check-schema.mjs [configPath]
 *   或 THEME_UPSTREAM_CONFIG=<path> node scripts/check-schema.mjs
 *
 * 检查项：
 *   1. YAML 顶层 key 数 vs schema 已声明顶层 key 数；
 *   2. 上游配置原样 safeParse 必须零错误（P1-12 收紧后仍要全量通过）；
 *   3. 11 个上游 null 顶层键保持 z.unknown() 但必须继续被接受；
 *   4. 用例 a：未知顶层键（`some_new_key: 1`）→ 必须失败，错误信息含该键名；
 *   5. 用例 b：已知键写错类型（`theme_color.main: 123`）→ 必须失败，含完整键路径；
 *   6. unknown key 统计（YAML 中出现、schema 未声明的顶层 key）。
 *
 * 退出码：0 = 全部通过；1 = 校验失败或自检用例失败；2 = 校验通过但上游有未知键。
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const DEFAULT_UPSTREAM = resolve(
  PKG_ROOT,
  '../_research/anzhiyu-upstream/_config.yml',
);

const configPath = resolve(
  process.argv[2] ?? process.env.THEME_UPSTREAM_CONFIG ?? DEFAULT_UPSTREAM,
);
if (!existsSync(configPath)) {
  console.error(`[check-schema] 上游配置不存在: ${configPath}`);
  console.error(
    '[check-schema] 默认读 _research/anzhiyu-upstream/_config.yml；' +
      '上游副本在别处时用 THEME_UPSTREAM_CONFIG=<path>（或第一个命令行参数 [configPath]）指向真实 _config.yml。',
  );
  process.exit(1);
}

/** 上游为 null 的 11 个顶层键：P1-12 明确不编造类型，但必须继续被接受。 */
const NULL_TOP_LEVEL_KEYS = [
  'menu',
  'social',
  'baidu_analytics',
  'google_analytics',
  'cnzz_analytics',
  'cloudflare_analytics',
  'microsoft_clarity',
  'index_site_info_top',
  'index_top_img_height',
  'category_ui',
  'tag_ui',
];

const raw = readFileSync(configPath, 'utf8');
const doc = parse(raw);

const { themeConfigSchema, KNOWN_TOP_LEVEL_KEYS } = await import(
  '../src/config/schema.ts'
);
// zod 版本用 Node 标准解析链定位（hoisted / symlink 布局都能解析），不拼 ../../node_modules。
const require = createRequire(import.meta.url);
const zodVersion = JSON.parse(
  readFileSync(require.resolve('zod/package.json'), 'utf8'),
).version;

const yamlKeys = doc && typeof doc === 'object' ? Object.keys(doc) : [];
const known = new Set(KNOWN_TOP_LEVEL_KEYS);
const unknownKeys = yamlKeys.filter((k) => !known.has(k));
const missingInYaml = KNOWN_TOP_LEVEL_KEYS.filter(
  (k) => !yamlKeys.includes(k),
);

console.log(`[check-schema] upstream config: ${configPath}`);
console.log(`[check-schema] zod version: ${zodVersion}`);
console.log(`[check-schema] yaml top-level keys: ${yamlKeys.length}`);
console.log(`[check-schema] schema declared top-level keys: ${KNOWN_TOP_LEVEL_KEYS.length}`);
console.log(
  `[check-schema] unknown keys: ${unknownKeys.length}` +
    (unknownKeys.length ? ` -> ${unknownKeys.join(', ')}` : ''),
);
if (missingInYaml.length) {
  console.log(`[check-schema] declared but absent in yaml: ${missingInYaml.join(', ')}`);
}

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(
    `[check-schema] ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(label);
};

const printIssues = (error) => {
  for (const issue of error.issues) {
    console.log(
      `    - ${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message} [${issue.code}]`,
    );
  }
};

/* ------------------------------------------------------------------ */
/* 用例 c：上游 _config.yml 原样校验 → 必须零错误                       */
/* ------------------------------------------------------------------ */
console.log('[check-schema] === 用例 c：上游 _config.yml 原样校验 ===');
const upstreamResult = themeConfigSchema.safeParse(doc);
if (upstreamResult.success) {
  console.log('[check-schema] result: PASS (0 errors)');
  check('上游配置零错误', true);
} else {
  console.log(`[check-schema] result: FAIL (${upstreamResult.error.issues.length} issues)`);
  printIssues(upstreamResult.error);
  check('上游配置零错误', false, `${upstreamResult.error.issues.length} issues`);
}

/* ------------------------------------------------------------------ */
/* 附加：11 个上游 null 顶层键必须继续被接受                             */
/* ------------------------------------------------------------------ */
for (const key of NULL_TOP_LEVEL_KEYS) {
  const inYaml = Object.prototype.hasOwnProperty.call(doc, key);
  const accepted = upstreamResult.success && doc[key] === null;
  check(
    `上游 null 顶层键保持 accepted: ${key}`,
    inYaml && accepted,
    upstreamResult.success ? `值 ${JSON.stringify(doc[key])}` : '上游整体校验失败',
  );
}

/* ------------------------------------------------------------------ */
/* 用例 a：未知顶层键 → 必须失败，错误信息必须含键名                     */
/* ------------------------------------------------------------------ */
console.log('[check-schema] === 用例 a：未知顶层键 some_new_key ===');
const withUnknownKey = { ...doc, some_new_key: 1 };
const unknownResult = themeConfigSchema.safeParse(withUnknownKey);
check('未知顶层键 → 必须校验失败', !unknownResult.success);
if (!unknownResult.success) {
  printIssues(unknownResult.error);
  const serialized = unknownResult.error.issues
    .map((issue) => issue.message)
    .join('\n');
  check('错误信息列出未知键名 some_new_key', serialized.includes('some_new_key'));
  check(
    '错误码为 unrecognized_keys',
    unknownResult.error.issues.some((issue) => issue.code === 'unrecognized_keys'),
  );
  check(
    '同时拼错多个键 → 全部列出',
    (() => {
      const multi = themeConfigSchema.safeParse({
        ...doc,
        some_new_key: 1,
        another_typo_key: 2,
      });
      if (multi.success) return false;
      const text = multi.error.issues.map((issue) => issue.message).join('\n');
      return text.includes('some_new_key') && text.includes('another_typo_key');
    })(),
  );
}

/* ------------------------------------------------------------------ */
/* 用例 b：已知键写错类型 → 必须失败，错误信息必须含完整键路径           */
/* ------------------------------------------------------------------ */
console.log('[check-schema] === 用例 b：已知键写错类型 theme_color.main = 123 ===');
const withBadType = structuredClone(doc);
withBadType.theme_color.main = 123;
const badTypeResult = themeConfigSchema.safeParse(withBadType);
check('已知键写错类型 → 必须校验失败', !badTypeResult.success);
if (!badTypeResult.success) {
  printIssues(badTypeResult.error);
  const paths = badTypeResult.error.issues.map((issue) => issue.path.join('.'));
  check('错误信息含完整键路径 theme_color.main', paths.includes('theme_color.main'));
}

/* ------------------------------------------------------------------ */
/* 退出码                                                              */
/* ------------------------------------------------------------------ */
if (failures.length > 0) {
  console.log(`[check-schema] 结果: FAIL（${failures.length} 项用例失败）`);
  process.exit(1);
}
if (unknownKeys.length > 0) {
  console.log('[check-schema] 结果: unknown keys 非 0，退出码 2');
  process.exit(2);
}
console.log('[check-schema] 结果: PASS（上游零错误 + 三条用例全部符合预期）');
process.exit(0);
