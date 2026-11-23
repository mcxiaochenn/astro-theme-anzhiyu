#!/usr/bin/env node
/**
 * P-upstream-delta：上游差异登记表的只读回归校验。
 *
 * 上游基线锁在 hexo-theme-anzhiyu 1.7.1 / commit 72439d93。迁移期我们对上游
 * 副本一个字节都不改（包括上游自己的笔误），所有「已知差异」都记在
 * docs/upstream-delta.md 里。这个脚本负责在 CI 里守住登记表的前提，只读、
 * 不写任何文件、不做构建：
 *
 * 1. 上游只读守卫（readmode.styl 笔误不许"顺手修好"）
 *    - examples/blog/src/styles/upstream/_mode/readmode.styl:120 必须仍是
 *      非法写法 `background: var(-highlight-bg) !important`，:104 必须仍是
 *      正确写法 `background: var(--highlight-bg) !important`。
 *      改回正确写法会让 read-mode 代码块背景真的生效、与上游视觉不一致，
 *      而且会打乱 P1-5/P1-6 已固化的字节基准 —— 属于"上游缺陷，我们选择
 *      保真不改"，不是可以顺手修的东西。
 * 2. 基准摘要一致（docs ↔ docs/baseline.json）
 *    - docs/upstream-delta.md 里的机器可读锚点（baseline-index-css-bytes 等）
 *      与 docs/baseline.json 的 commit / 字节数 / gzip / SHA-256 必须一致；
 *    - P1-11 的产物字节口径：上游样式子集 = 基准字节 + 残余排版差，即
 *      683218 + (-228) = 682990（U6 的 @css{} 排版差是唯一剩余项）。
 *      P1-5 的历史口径 686772 = 683218 + 3782 + (-228) 已随 D9 修复作废；
 *      真实构建产物还会多出 ClientRouter 自带的 1097 B（见登记表 §3.3）。
 * 3. 上游关键文件 SHA-256
 *    - 登记表锚点里的 upstreamFiles 映射逐个校验，任何被格式化、换行归一化、
 *      替换或更新的文件都会被抓到。上游副本是"基线证据"，不是可编辑源码。
 * 4. 登记表的事实前提
 *    - 上游 styl 树里 `$prismjs_enable` / 其余 Hexo 注入变量必须仍然零赋值
 *      （D9 的根因：它们来自模板脚本 scripts/events/stylus.js 的 .define()，
 *      不在 styl 源码里）。
 *    - 插件必须复刻这一层：动态 import 插件、展开上游 index.styl，断言展开
 *      源码顶部注入了锚点 hexoInjectedStylusVarValues 里的 4 个变量与值
 *      （即 $highlight_enable=true / $highlight_line_number=true /
 *      $prismjs_enable=false / $prismjs_line_number=true）。这一条是 D9
 *      不回归的开关：插件哪天把 define 层删了/算错了，这里直接红。
 *    - theme.config.yml 必须是 133 顶层键 / 662 递归 mapping key，且
 *      theme_color.button_hover / theme_color.blockquote_padding_color /
 *      theme_color.blockquote_background_color 三个键保持"被注释掉 = 不存在"，
 *      theme_color / hr_icon 保持对象。
 * 5. 环境事实（仅本地有 .baseline-work 时）
 *    - 参考产物工作区的 hexo 必须钉在 7.3.0（换机器重跑基准的前提）。CI
 *      checkout 里没有 .baseline-work（.gitignore 掉），这一项 SKIP。
 *
 * 依赖：node 内置模块 + 可选的 yaml（根 node_modules 里已 hoist；缺失时相关
 * 项降级为 SKIP，不让 CI 因为一个可选依赖红）。
 *
 * 失败即非零退出；本地调试：
 *   node scripts/check-upstream-delta.mjs
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DELTA_DOC = path.join(REPO_ROOT, 'docs', 'upstream-delta.md')
const NOTES_DOC = path.join(REPO_ROOT, 'docs', 'notes', 'P-upstream-delta.md')
const BASELINE_JSON = path.join(REPO_ROOT, 'docs', 'baseline.json')
const UPSTREAM_STYLES = path.join(REPO_ROOT, 'examples', 'blog', 'src', 'styles', 'upstream')
const THEME_CONFIG = path.join(REPO_ROOT, 'examples', 'blog', 'theme.config.yml')
const BASELINE_WORK = path.join(REPO_ROOT, '.baseline-work')
const PLUGIN_ENTRY = path.join(
  REPO_ROOT,
  'packages',
  'vite-plugin-stylus-hexo-config',
  'src',
  'index.mjs',
)

// readmode.styl 两条关键声明的唯一允许形态（按 trim 后比较，行号写死）
const READMODE_LINE_104 = 'background: var(--highlight-bg) !important'
const READMODE_LINE_120 = 'background: var(-highlight-bg) !important'

/** @type {{check: string, detail: string, ok: boolean}[]} */
const failures = []
let passed = 0
let skipped = 0

const log = (...args) => console.log('[check-upstream-delta]', ...args)
const pass = (check) => {
  passed += 1
  log(`PASS ${check}`)
}
const fail = (check, detail) => {
  failures.push({ check, detail })
  console.error(`[check-upstream-delta] FAIL ${check}`)
  if (detail) console.error(`  ${detail}`)
}
const skip = (check, reason) => {
  skipped += 1
  log(`SKIP ${check}（${reason}）`)
}

const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/')
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

// —— 0. 读登记表锚点 ——

const ANCHOR_RE =
  /<!--\s*upstream-delta:begin\s*-->\s*```json\s*([\s\S]*?)```\s*<!--\s*upstream-delta:end\s*-->/m

if (!existsSync(DELTA_DOC)) {
  fail('登记表存在', `缺少 ${rel(DELTA_DOC)}`)
  finish()
}

const deltaDocText = readFileSync(DELTA_DOC, 'utf8')
const anchorMatch = deltaDocText.match(ANCHOR_RE)
if (!anchorMatch) {
  fail(
    '登记表锚点',
    `${rel(DELTA_DOC)} 里找不到 upstream-delta:begin/end 之间的 json 代码块（CI 依赖它做机器校验）`,
  )
  finish()
}

let anchor
try {
  anchor = JSON.parse(anchorMatch[1])
} catch (error) {
  fail('登记表锚点', `${rel(DELTA_DOC)} 的锚点 JSON 解析失败：${error.message}`)
  finish()
}

const REQUIRED_ANCHOR_FIELDS = [
  'upstreamVersion',
  'upstreamCommit',
  'baselineIndexCssBytes',
  'baselineIndexCssGzipBytes',
  'baselineIndexCssSha256',
  'p111CompiledIndexCssBytes',
  'residualFormatDeltaBytes',
  'hexoVersion',
  'hexoInjectedStylusVars',
  'hexoInjectedStylusVarValues',
  'themeConfigTopLevelKeys',
  'themeConfigRecursiveMappingKeys',
  'commentedOutConfigKeys',
  'objectValuedConfigKeys',
  'upstreamFiles',
]
const missingFields = REQUIRED_ANCHOR_FIELDS.filter((key) => !(key in anchor))
if (missingFields.length) {
  fail('登记表锚点字段', `缺少字段：${missingFields.join(', ')}`)
} else {
  pass('登记表锚点字段完整')
}

// —— 1. 上游只读守卫：readmode.styl 笔误不许被"修好" ——

const readmodeRel = 'examples/blog/src/styles/upstream/_mode/readmode.styl'
const readmodePath = path.join(REPO_ROOT, readmodeRel)

if (!existsSync(readmodePath)) {
  fail('readmode 只读守卫', `缺少 ${readmodeRel}`)
} else {
  const lines = readFileSync(readmodePath, 'utf8').split('\n')
  const line104 = (lines[103] ?? '').replace(/\r$/, '').trim()
  const line120 = (lines[119] ?? '').replace(/\r$/, '').trim()

  if (line104 === READMODE_LINE_104) {
    pass('readmode.styl:104 保持正确写法 var(--highlight-bg)')
  } else {
    fail(
      'readmode.styl:104 保持正确写法 var(--highlight-bg)',
      `实际：${JSON.stringify(line104)}；这一行是对照基准，不允许改动`,
    )
  }

  if (line120 === READMODE_LINE_120) {
    pass('readmode.styl:120 保持上游笔误 var(-highlight-bg)（我们决策：不改）')
  } else {
    fail(
      'readmode.styl:120 保持上游笔误 var(-highlight-bg)（我们决策：不改）',
      `实际：${JSON.stringify(line120)}。` +
        '把这里"修好"会让 read-mode 代码块背景真的生效（上游实际不生效），' +
        '破坏像素级还原与 P1-6 字节基准；确需修复请先更新 docs/upstream-delta.md 的决策与锚点。',
    )
  }
}

// —— 2. 基准摘要一致：docs 锚点 ↔ docs/baseline.json ——

if (!existsSync(BASELINE_JSON)) {
  fail('baseline.json 存在', `缺少 ${rel(BASELINE_JSON)}`)
} else {
  let baseline
  try {
    baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'))
  } catch (error) {
    fail('baseline.json 可解析', `${rel(BASELINE_JSON)} 解析失败：${error.message}`)
  }

  if (baseline) {
    const css = baseline.css ?? {}
    const meta = baseline.baseline ?? {}
    const pairs = [
      ['commit', meta.commit, String(anchor.upstreamCommit).slice(0, 8)],
      ['version', meta.version, anchor.upstreamVersion],
      ['css.indexCssBytes', css.indexCssBytes, anchor.baselineIndexCssBytes],
      ['css.indexCssGzipBytes', css.indexCssGzipBytes, anchor.baselineIndexCssGzipBytes],
      [
        'css.indexCssSha256',
        String(css.indexCssSha256 ?? '').toLowerCase(),
        String(anchor.baselineIndexCssSha256).toLowerCase(),
      ],
    ]
    for (const [field, actual, expected] of pairs) {
      if (actual === expected) {
        pass(`baseline.json ${field} 与登记表一致（${actual}）`)
      } else {
        fail(`baseline.json ${field} 与登记表一致`, `baseline.json=${actual} / 登记表=${expected}`)
      }
    }
  }
}

// —— 2b. 登记表内部算术自洽 + notes 报告同数 ——
//
// P1-11（D9 修复）之后，上游样式子集只剩 U6 的 @css{} 排版差：
// 基准 683218 + (-228) = 682990。P1-5 的 686772 = 683218 + 3782 + (-228)
// 是修复前历史口径，不再参与闭环（3782 的 prismjs 增量已消失）。

const arith = anchor.baselineIndexCssBytes + anchor.residualFormatDeltaBytes
if (arith === anchor.p111CompiledIndexCssBytes) {
  pass(
    `P1-11 字节闭环：${anchor.baselineIndexCssBytes} + (${anchor.residualFormatDeltaBytes}) = ` +
      `${anchor.p111CompiledIndexCssBytes}`,
  )
} else {
  fail(
    'P1-11 字节闭环：基准 + 残余排版差 = 上游样式子集',
    `期望 ${anchor.p111CompiledIndexCssBytes}，按锚点算得 ${arith}`,
  )
}

if (existsSync(NOTES_DOC)) {
  const notes = readFileSync(NOTES_DOC, 'utf8')
  const notesChecks = [
    ['baseline.css.indexCssBytes', /baseline\.css\.indexCssBytes\s*=\s*(\d+)/, anchor.baselineIndexCssBytes],
    ['baseline.css.indexCssGzipBytes', /baseline\.css\.indexCssGzipBytes\s*=\s*(\d+)/, anchor.baselineIndexCssGzipBytes],
    [
      'baseline.css.indexCssSha256',
      /baseline\.css\.indexCssSha256\s*=\s*([0-9a-f]{64})/i,
      String(anchor.baselineIndexCssSha256).toLowerCase(),
    ],
  ]
  for (const [field, re, expected] of notesChecks) {
    const match = notes.match(re)
    if (!match) {
      skip(`${rel(NOTES_DOC)} 记录 ${field}`, '报告里没有该锚点行')
      continue
    }
    const actual = /Sha256/i.test(field) ? match[1].toLowerCase() : Number(match[1])
    if (actual === expected) {
      pass(`${rel(NOTES_DOC)} 记录 ${field} 与登记表一致（${actual}）`)
    } else {
      fail(
        `${rel(NOTES_DOC)} 记录 ${field} 与登记表一致`,
        `notes=${actual} / 登记表=${expected}`,
      )
    }
  }
} else {
  skip('notes 报告记录', 'docs/notes/P-upstream-delta.md 不存在')
}

// —— 3. 上游关键文件 SHA-256 ——

const upstreamFiles = anchor.upstreamFiles && typeof anchor.upstreamFiles === 'object'
  ? anchor.upstreamFiles
  : {}
const fileEntries = Object.entries(upstreamFiles)
if (fileEntries.length === 0) {
  fail('上游关键文件 SHA-256', '登记表锚点 upstreamFiles 为空')
} else {
  for (const [relPath, expectedSha] of fileEntries) {
    const abs = path.join(REPO_ROOT, relPath)
    if (!existsSync(abs)) {
      fail(`上游文件存在 ${relPath}`, '文件缺失，上游副本不完整')
      continue
    }
    const actual = sha256(readFileSync(abs))
    if (actual === String(expectedSha).toLowerCase()) {
      pass(`上游文件 SHA-256 ${relPath}`)
    } else {
      fail(
        `上游文件 SHA-256 ${relPath}`,
        `实际 ${actual} / 登记表 ${String(expectedSha).toLowerCase()}。` +
          '上游副本必须与 1.7.1 基线逐字节一致（不许格式化/换行归一化/"顺手修复"）。',
      )
    }
  }
}

// —— 4. 登记表的事实前提 ——

const hexoInjectedVars = Array.isArray(anchor.hexoInjectedStylusVars)
  ? anchor.hexoInjectedStylusVars
  : []
if (hexoInjectedVars.length === 0) {
  fail('Hexo 注入变量清单', '登记表锚点 hexoInjectedStylusVars 为空')
} else if (existsSync(UPSTREAM_STYLES)) {
  const stylFiles = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.styl$/i.test(entry.name)) stylFiles.push(full)
    }
  }
  walk(UPSTREAM_STYLES)

  const assigned = []
  for (const file of stylFiles) {
    const text = readFileSync(file, 'utf8')
    for (const varName of hexoInjectedVars) {
      // 只认行首赋值（含缩进）；注释行不算
      const re = new RegExp(`^\\s*${varName.replace(/[$]/g, '\\$&')}\\s*=`, 'm')
      if (re.test(text)) assigned.push(`${rel(file)}: ${varName}`)
    }
  }
  if (assigned.length === 0) {
    pass(
      `上游 ${stylFiles.length} 个 styl 里 ${hexoInjectedVars.join(' / ')} 仍然零赋值` +
        '（它们由 Hexo 模板脚本的 .define() 注入，插件侧的复刻见 4c 守卫）',
    )
  } else {
    fail(
      'Hexo 注入变量在 styl 里保持零赋值',
      `发现赋值：${assigned.join('；')}。上游副本被改了：这四个变量只应由 Hexo 的 ` +
        '.define() / 插件的 define 层提供，styl 里出现赋值会让 D9 的现场失效，' +
        '必须重新定位并更新 docs/upstream-delta.md。',
    )
  }

  const highlightStyl = path.join(UPSTREAM_STYLES, '_highlight', 'highlight.styl')
  if (existsSync(highlightStyl) && /^if \$prismjs_enable\s*$/m.test(readFileSync(highlightStyl, 'utf8'))) {
    pass('_highlight/highlight.styl 仍有 if $prismjs_enable 守卫（D9 现场保留）')
  } else {
    fail(
      '_highlight/highlight.styl 仍有 if $prismjs_enable 守卫（D9 现场保留）',
      '守卫被删除或改写了；请确认上游副本未被修改，并同步更新登记表。',
    )
  }
} else {
  fail('上游 styl 树存在', `缺少 ${rel(UPSTREAM_STYLES)}`)
}

// —— 4c. 插件必须复刻 Hexo define 层（D9 不回归的开关）——
//
// 动态 import 插件（只读、不构建），用 theme.config.yml 展开上游 index.styl，
// 断言展开源码顶部出现锚点 hexoInjectedStylusVarValues 的 4 行赋值。上游配置
// 里没有站点级 syntax_highlighter/highlight/prismjs，插件必须回落 Hexo 7.3.0
// 默认值才能得到基线的四个值。插件哪天删掉 define 层或算错，这里直接红。

const UPSTREAM_ENTRY = path.join(UPSTREAM_STYLES, 'index.styl')
const expectedDefineVars = anchor.hexoInjectedStylusVarValues
const expectedDefineEntries =
  expectedDefineVars && typeof expectedDefineVars === 'object' && !Array.isArray(expectedDefineVars)
    ? Object.entries(expectedDefineVars)
    : []

if (!existsSync(PLUGIN_ENTRY)) {
  fail('插件 define 层注入', `缺少插件入口 ${rel(PLUGIN_ENTRY)}`)
} else if (expectedDefineEntries.length !== hexoInjectedVars.length) {
  fail(
    '插件 define 层注入',
    `锚点 hexoInjectedStylusVarValues 必须覆盖 ${hexoInjectedVars.join(' / ')}（${hexoInjectedVars.length} 项），` +
      `实际 ${expectedDefineEntries.length} 项`,
  )
} else if (!existsSync(UPSTREAM_ENTRY)) {
  fail('插件 define 层注入', `缺少上游入口 ${rel(UPSTREAM_ENTRY)}`)
} else {
  let stylusHexoConfig = null
  try {
    ;({ stylusHexoConfig } = await import(pathToFileURL(PLUGIN_ENTRY).href))
  } catch (error) {
    skip('插件 define 层注入', `插件不可直接 import（${error.message.split('\n')[0]}）`)
  }

  if (stylusHexoConfig) {
    let expanded = ''
    let expandError = null
    try {
      const plugin = stylusHexoConfig({ configPath: THEME_CONFIG, warnOnMissing: false })
      expanded = plugin.transform(readFileSync(UPSTREAM_ENTRY, 'utf8'), UPSTREAM_ENTRY)?.code ?? ''
    } catch (error) {
      expandError = error
    }

    if (expandError) {
      fail(
        '插件 define 层注入',
        `用插件展开上游 index.styl 失败：${String(expandError.message).split('\n')[0]}`,
      )
    } else {
      const missingDefines = []
      for (const [name, value] of expectedDefineEntries) {
        const literal = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
        const re = new RegExp(`^${name.replace(/[$]/g, '\\$&')} = ${literal}$`, 'm')
        if (!re.test(expanded)) missingDefines.push(`${name} = ${literal}`)
      }
      if (missingDefines.length === 0) {
        pass(
          `插件展开上游 index.styl 后注入了 ${expectedDefineEntries.length} 个 define 变量（` +
            expectedDefineEntries.map(([name, value]) => `${name}=${value}`).join(' / ') +
            '），D9 的 prismjs 分支已被关闭',
        )
      } else {
        fail(
          '插件 define 层注入',
          `展开源码里缺少/值不符：${missingDefines.join('；')}。` +
            '这会让未定义变量在 Stylus 的 if 里当「真」，prismjs 分支回归（+3782 B）。' +
            '修法是 packages/vite-plugin-stylus-hexo-config 的 hexoDefineLines()。',
        )
      }
    }
  }
}

// —— 4b. theme.config.yml：键数 + 注释键缺失 + 对象键（需要 yaml，可降级 SKIP）——

if (!existsSync(THEME_CONFIG)) {
  fail('theme.config.yml 存在', `缺少 ${rel(THEME_CONFIG)}`)
} else {
  const configText = readFileSync(THEME_CONFIG, 'utf8')

  let YAML = null
  try {
    YAML = await import('yaml')
  } catch {
    skip('theme.config.yml 结构校验', '根 node_modules 里找不到可选依赖 yaml')
  }

  if (YAML) {
    let config
    try {
      config = YAML.parse(configText)
    } catch (error) {
      fail('theme.config.yml 可解析', `${rel(THEME_CONFIG)} 解析失败：${error.message}`)
    }

    if (config) {
      const countMappingKeys = (node) => {
        let count = 0
        const walk = (value) => {
          if (Array.isArray(value)) {
            for (const item of value) walk(item)
            return
          }
          if (value && typeof value === 'object') {
            count += Object.keys(value).length
            for (const key of Object.keys(value)) walk(value[key])
          }
        }
        walk(node)
        return count
      }

      const topKeys = Object.keys(config).length
      const recursiveKeys = countMappingKeys(config)
      if (topKeys === anchor.themeConfigTopLevelKeys) {
        pass(`theme.config.yml 顶层键 = ${topKeys}（登记表 ${anchor.themeConfigTopLevelKeys}）`)
      } else {
        fail(
          'theme.config.yml 顶层键数量',
          `实际 ${topKeys} / 登记表 ${anchor.themeConfigTopLevelKeys}`,
        )
      }
      if (recursiveKeys === anchor.themeConfigRecursiveMappingKeys) {
        pass(
          `theme.config.yml 递归 mapping key = ${recursiveKeys}（登记表 ${anchor.themeConfigRecursiveMappingKeys}）`,
        )
      } else {
        fail(
          'theme.config.yml 递归 mapping key 数量',
          `实际 ${recursiveKeys} / 登记表 ${anchor.themeConfigRecursiveMappingKeys}`,
        )
      }

      const hasPath = (object, dotted) => {
        let current = object
        for (const key of dotted.split('.')) {
          if (current === null || typeof current !== 'object') return false
          if (!Object.prototype.hasOwnProperty.call(current, key)) return false
          current = current[key]
        }
        return true
      }

      const commentedKeys = Array.isArray(anchor.commentedOutConfigKeys)
        ? anchor.commentedOutConfigKeys
        : []
      const presentCommented = commentedKeys.filter((key) => hasPath(config, key))
      if (presentCommented.length === 0) {
        pass(`上游注释掉的 ${commentedKeys.length} 个配置键仍然不存在（缺失 → falsy → 上游 fallback 默认值）`)
      } else {
        fail(
          '上游注释掉的配置键保持不存在',
          `theme.config.yml 里出现了 ${presentCommented.join(', ')}。` +
            '补上这些键会改变 var.styl 的 fallback 分支、让 Astro 产出色值与上游不一致。',
        )
      }

      const objectKeys = Array.isArray(anchor.objectValuedConfigKeys)
        ? anchor.objectValuedConfigKeys
        : []
      const notObjects = objectKeys.filter((key) => {
        const value = config[key]
        return !(value && typeof value === 'object' && !Array.isArray(value))
      })
      if (notObjects.length === 0) {
        pass(`对象型配置键保持对象：${objectKeys.join(', ')}（hexo-config 返回 JS 对象 → 布尔语境恒真）`)
      } else {
        fail(
          '对象型配置键保持对象',
          `不是对象的键：${notObjects.join(', ')}`,
        )
      }
    }
  }
}

// —— 5. 环境事实：hexo 钉死 7.3.0（只有本地基准工作区才有）——

const baselineWorkPkg = path.join(BASELINE_WORK, 'package.json')
const installedHexoPkg = path.join(BASELINE_WORK, 'node_modules', 'hexo', 'package.json')
if (!existsSync(BASELINE_WORK)) {
  skip('hexo 版本钉死', '.baseline-work 不存在（CI checkout 不包含该目录）')
} else if (!existsSync(baselineWorkPkg)) {
  skip('hexo 版本钉死', '.baseline-work/package.json 缺失')
} else {
  const pkg = JSON.parse(readFileSync(baselineWorkPkg, 'utf8'))
  const declared = pkg?.dependencies?.hexo
  const cliBlock = pkg?.hexo?.version
  const problems = []
  if (declared !== anchor.hexoVersion) problems.push(`dependencies.hexo=${declared}`)
  if (cliBlock !== anchor.hexoVersion) problems.push(`hexo.version=${cliBlock}`)
  if (existsSync(installedHexoPkg)) {
    const installed = JSON.parse(readFileSync(installedHexoPkg, 'utf8')).version
    if (installed !== anchor.hexoVersion) problems.push(`已安装 hexo=${installed}`)
  }
  if (problems.length === 0) {
    pass(`baseline 工作区 hexo 钉死 ${anchor.hexoVersion}（声明 + CLI 块 + 实际安装）`)
  } else {
    fail('baseline 工作区 hexo 版本', `必须 ${anchor.hexoVersion}，实际：${problems.join('；')}`)
  }
}

finish()

function finish() {
  console.log('')
  if (failures.length) {
    console.error(
      `[check-upstream-delta] 校验失败：${failures.length} 项不通过（PASS ${passed} / SKIP ${skipped}）`,
    )
    for (const { check } of failures) console.error(`  - ${check}`)
    process.exit(1)
  }
  log(`校验通过：PASS ${passed} / SKIP ${skipped} / FAIL 0`)
  log('登记表：docs/upstream-delta.md（上游 1.7.1 / 72439d93，只读副本不许改）')
  process.exit(0)
}
