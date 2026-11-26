/**
 * pnpm build:baseline — 用 HTML 基线验收 fixture 构建（tests/baseline-content/）。
 *
 * 与默认 `pnpm build`（demo 内容）的区别只在内容层：ANZHIYU_CONTENT_BASE 指向
 * 基线 fixture 后，content.config.ts 与 site-data.ts 一起切到字节锁定的验收输入，
 * diff-html 49 页比对、CI build/e2e/lighthouse 全走这条通道。
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

console.log('[build-baseline] 内容层 → tests/baseline-content/（demo 内容旁路）')
const result = spawnSync('pnpm', ['exec', 'astro', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, ANZHIYU_CONTENT_BASE: './tests/baseline-content' },
  shell: true,
})
process.exit(result.status ?? 1)
