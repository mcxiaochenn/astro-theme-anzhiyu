/**
 * check-schema.mjs — 自检：用主题 schema 校验上游真实 `_config.yml`。
 *
 * 用法：
 *   node scripts/check-schema.mjs [configPath]
 *   或 THEME_UPSTREAM_CONFIG=<path> node scripts/check-schema.mjs
 *
 * 输出：
 *   - YAML 顶层 key 数 vs schema 已声明顶层 key 数
 *   - safeParse 通过/失败；失败时逐条打印 issue path
 *   - unknown key 数（YAML 中出现、schema 未声明的顶层 key）
 *   - 退出码：0 = 通过且 unknown=0；1 = 校验失败；2 = 有 unknown key 但校验通过
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const DEFAULT_UPSTREAM = resolve(
  PKG_ROOT,
  '../../../_research/anzhiyu-upstream/_config.yml',
);

const configPath = resolve(
  process.argv[2] ?? process.env.THEME_UPSTREAM_CONFIG ?? DEFAULT_UPSTREAM,
);

const raw = readFileSync(configPath, 'utf8');
const doc = parse(raw);

const { themeConfigSchema, KNOWN_TOP_LEVEL_KEYS } = await import(
  '../src/config/schema.ts'
);
const zodVersion = JSON.parse(
  readFileSync(resolve(PKG_ROOT, '../../node_modules/zod/package.json'), 'utf8'),
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

const result = themeConfigSchema.safeParse(doc);
if (result.success) {
  console.log('[check-schema] result: PASS (0 errors)');
  process.exit(unknownKeys.length === 0 ? 0 : 2);
}

console.log(`[check-schema] result: FAIL (${result.error.issues.length} issues)`);
for (const issue of result.error.issues) {
  console.log(
    `  - ${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message} [${issue.code}]`,
  );
}
process.exit(1);
