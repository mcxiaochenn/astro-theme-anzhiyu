#!/usr/bin/env node
/**
 * scripts/extract-upstream-css.mjs
 *
 * 从本地冻结的上游 hexo-theme-anzhiyu 1.7.1 源码编译并拆分为纯正原生 CSS 模块（src/styles/anzhiyu/*.css），
 * 使项目在构建与运行时彻底零 Stylus 依赖，同时 100% 像素级保留上游全部选择器、圆角、阴影与动画。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import YAML from "yaml";

const require = createRequire(import.meta.url);
const UPSTREAM_DIR = process.env.ANZHIYU_UPSTREAM_DIR || "D:/Git-project/_research/anzhiyu-upstream";
const CSS_ROOT = path.join(UPSTREAM_DIR, "source/css");
const OUT_DIR = path.resolve("src/styles/anzhiyu");

if (!fs.existsSync(CSS_ROOT)) {
  console.error(`[extract-upstream-css] 未找到上游目录: ${CSS_ROOT}`);
  process.exit(1);
}

const stylus = require("stylus");

// 1. 读取上游默认 _config.yml，并开启所有核心视觉模块以导出完整样式规则
const baseConfig = YAML.parse(fs.readFileSync(path.join(UPSTREAM_DIR, "_config.yml"), "utf8")) ?? {};
const fullConfig = {
  ...baseConfig,
  css_prefix: false,
  display_mode: "light",
  darkmode: { ...baseConfig.darkmode, enable: true, button: true },
  readmode: true,
  mainTone: { ...baseConfig.mainTone, enable: true, mode: "both", cover_change: true },
  dynamicEffect: { postTopWave: true, postTopRollZoomInfo: false, pageCommentsRollZoom: false },
  ptool: { ...baseConfig.ptool, enable: true, mode: "1" },
  preloader: { ...baseConfig.preloader, enable: true, source: 1 },
  rightClickMenu: { enable: true },
  shortcutKey: { enable: true, delay: 100, shiftDelay: 200 },
  centerConsole: { ...baseConfig.centerConsole, enable: true },
  hr_icon: { enable: true, icon: "\\f0c4", "icon-top": null },
  beautify: { enable: true, field: "post", "title-prefix-icon": "\\f0c1", "title-prefix-icon-color": "#F47466" },
  table_interlaced_discoloration: true,
  highlight_theme: "mac light",
  highlight_height_limit: 360,
  code_word_wrap: false,
  // 基础编译先按 false 输出单栏基础规则，双栏覆写统一由 astro-bridge.css 的 body[data-double-row="true"] 动态控制
  article_double_row: false,
  home_top: {
    ...baseConfig.home_top,
    enable: true,
    swiper: { ...baseConfig.home_top?.swiper, enable: false },
  },
  aside: {
    ...baseConfig.aside,
    enable: true,
    button: true,
    mobile: true,
    position: "right",
  },
  local_search: { enable: true, preload: true },
  algolia_search: { enable: false },
  comments: { ...baseConfig.comments, use: "Twikoo", text: true },
  footer: {
    ...baseConfig.footer,
    footerBar: { ...baseConfig.footer?.footerBar, enable: true },
  },
  lazyload: { enable: false, blur: false, progressive: false },
  icons: { ali_iconfont_js: null, fontawesome: false, fontawesome_animation_css: null },
  note: { style: "flat", icons: true, border_radius: 3, light_bg_offset: 0 },
};

// ---- Stylus @import/@require 展开与 hexo-config() 变量转换器 ----
const CONFIG_CALL_RE = /hexo-config\(\s*(['"])([^'"]+)\1\s*\)/g;
const STYL_RE = /\.styl(us)?$/;
const CSS_RE = /\.css$/i;
const IMPORT_RE = /@(import|require)[ \t]+(['"])([^'"]+)\2[ \t]*;?/g;
const MAGIC_RE = /[*?]/;

const toPosix = (p) => p.split(path.sep).join("/");
const pathKey = (p) => toPosix(path.resolve(p)).toLowerCase();

function getProperty(obj, name) {
  name = name.replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
  const split = name.split(".");
  let key = split.shift();
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return "";
  let result = obj[key];
  if (!split.length) return result ?? "";
  if (typeof result !== "object") return "";
  for (let i = 0; i < split.length; i++) {
    key = split[i];
    if (result === null || !Object.prototype.hasOwnProperty.call(result, key)) return "";
    result = result[key];
    if (typeof result !== "object") return result;
  }
  return result;
}

function stylusLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const flat = value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    if (!flat.includes("'")) return `'${flat}'`;
    if (!flat.includes('"')) return `"${flat}"`;
    return `"${flat.replace(/"/g, "'")}"`;
  }
  return "true";
}

function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

function walkFiles(dir, recursive, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) walkFiles(full, recursive, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function globFiles(baseDir, spec) {
  if (!MAGIC_RE.test(spec)) {
    const full = path.resolve(baseDir, spec);
    try {
      if (fs.statSync(full).isFile()) return [full];
    } catch {
      /* ignore */
    }
    return [];
  }
  const magicIndex = spec.search(MAGIC_RE);
  const prefix = spec.slice(0, magicIndex);
  const slash = prefix.lastIndexOf("/");
  const baseRel = slash === -1 ? "" : prefix.slice(0, slash);
  const subPattern = spec.slice(baseRel ? baseRel.length + 1 : 0);
  const absBase = path.resolve(baseDir, baseRel);
  const re = globToRegExp(subPattern.replace(/\\/g, "/"));
  return walkFiles(absBase, subPattern.includes("**"))
    .map((full) => ({ full, rel: toPosix(path.relative(absBase, full)) }))
    .filter((item) => re.test(item.rel))
    .map((item) => item.full)
    .sort((a, b) => (toPosix(a) < toPosix(b) ? -1 : toPosix(a) > toPosix(b) ? 1 : 0));
}

function find(spec, dirStack) {
  for (let i = dirStack.length - 1; i >= 0; i--) {
    const found = globFiles(dirStack[i], spec);
    if (found.length) return found;
  }
  return [];
}

function resolveImport(spec, dirStack) {
  const target = STYL_RE.test(spec) ? spec : `${spec}.styl`;
  const found = find(target, dirStack);
  if (found.length) return found;
  const first = find(`${spec}/index.styl`, dirStack);
  if (first.length) return first;
  const base = path.posix.basename(spec.replace(/\.styl$/i, ""));
  return find(`${spec}/${base}.styl`, dirStack);
}

function replaceInCode(code, jobs) {
  let out = "";
  let i = 0;
  const len = code.length;
  while (i < len) {
    const char = code[i];
    if (char === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? len : nl;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      const end = close === -1 ? len : close + 2;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const close = code.indexOf(char, i + 1);
      const end = close === -1 ? len : close + 1;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    let matched = false;
    for (const job of jobs) {
      job.re.lastIndex = i;
      const m = job.re.exec(code);
      if (m && m.index === i) {
        out += job.replace(m, i);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += char;
      i += 1;
    }
  }
  return out;
}

function stripRootComments(text) {
  return text.replace(/^\/\*(?!\!)[\s\S]*?\*\/[ \t]*\n?/gm, "");
}

function neutralizeSlashComments(text) {
  if (!text.includes("//")) return text;
  return text
    .split("\n")
    .map((line) => {
      const m = /^[ \t]*\/\/(.*)$/.exec(line);
      if (!m || !m[1].includes("/*")) return line;
      return line.replace(/\/\*/g, "/\\*");
    })
    .join("\n");
}

function patchUpstreamQuirks(raw, file) {
  const norm = toPosix(file);
  // 修复上游 twikoo.styl 缩进笔误（若存在悬空行导致 Stylus 解析失败）
  if (norm.endsWith("_third-party/twikoo.styl")) {
    return raw.replace(/^\s+border-radius:\s*0\s*0\s*12px\s*12px\s*\n(\s+border-top:)/m, "$1");
  }
  // 修复上游 readmode.styl:120 非法自定义属性 var(-highlight-bg)（浏览器本就丢弃，移除以通过 LightningCSS）
  if (norm.endsWith("_mode/readmode.styl")) {
    return raw.replace(/^[ \t]*background:\s*var\(-highlight-bg\)\s*!important[ \t]*$/gm, "          // skipped invalid upstream var(-highlight-bg)");
  }
  return raw;
}

function cssLiteralBlock(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return "";
  const lines = raw.split("\n");
  const body = lines.map((line, i) => (i === 0 ? line : `  ${line}`)).join("\n");
  return `@css {${body}}`;
}

function inlineImports(code, filePath, state) {
  const dirStack = state.dirStack;
  const stackSet = state.stack;
  const source = neutralizeSlashComments(code);

  return replaceInCode(source, [
    {
      re: new RegExp(IMPORT_RE.source, "y"),
      replace: (m, offset) => {
        const keyword = m[1];
        const spec = m[3];
        if (CSS_RE.test(spec)) {
          const cssFiles = find(spec, dirStack);
          const blocks = cssFiles.map((f) => cssLiteralBlock(f)).filter(Boolean);
          if (!blocks.length) return "";
          const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
          const prefix = source.slice(lineStart, offset);
          const indent = /^[ \t]*$/.test(prefix) ? prefix : "";
          return blocks
            .join("\n")
            .split("\n")
            .map((line, i) => (i === 0 || line === "" ? line : indent + line))
            .join("\n");
        }

        let resolved = resolveImport(spec, dirStack);
        if (!resolved.length) return m[0];

        if (keyword === "require") {
          resolved = resolved.filter((f) => {
            const k = pathKey(f);
            if (state.requires.has(k)) return false;
            state.requires.add(k);
            return true;
          });
          if (!resolved.length) return "";
        }

        const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
        const prefix = source.slice(lineStart, offset);
        const indent = /^[ \t]*$/.test(prefix) ? prefix : "";

        const parts = [];
        for (const file of resolved) {
          const fk = pathKey(file);
          if (stackSet.has(fk)) continue;
          let childRaw = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
          childRaw = patchUpstreamQuirks(stripRootComments(childRaw), file);
          stackSet.add(fk);
          try {
            parts.push(
              inlineImports(childRaw, file, {
                dirStack: [...dirStack, path.dirname(file)],
                stack: stackSet,
                requires: state.requires,
              }),
            );
          } finally {
            stackSet.delete(fk);
          }
        }
        return parts
          .join("\n")
          .split("\n")
          .map((line, i) => (i === 0 || line === "" ? line : indent + line))
          .join("\n");
      },
    },
  ]);
}

function rewriteConfigCalls(code, config) {
  const registry = new Map();
  const body = replaceInCode(code, [
    {
      re: new RegExp(CONFIG_CALL_RE.source, "y"),
      replace: (m) => {
        const key = m[2];
        let name = registry.get(key);
        if (!name) {
          const base = `$cfg_${key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
          name = base;
          let idx = 2;
          const taken = new Set(registry.values());
          while (taken.has(name)) name = `${base}_${idx++}`;
          registry.set(key, name);
        }
        return `(${name})`;
      },
    },
  ]);

  const defs = [
    "$highlight_enable = true",
    "$highlight_line_number = true",
    "$prismjs_enable = false",
    "$prismjs_line_number = true",
  ];
  for (const [key, name] of registry) {
    defs.push(`${name} = ${stylusLiteral(getProperty(config, key))}`);
  }
  return `${defs.join("\n")}\n${body}`;
}

// 2. 构造带模块切分锚点的单次完整入口（确保 @extend .cardHover 等跨文件继承 100% 与原版单次编译一致）
const segmentedEntry = `
.__anzhiyu_split_marker__[data-module="base-global"]
  content: "base-global"
@import '_third-party/normalize.min.css'
@import 'var'
@import '_global/*'

.__anzhiyu_split_marker__[data-module="highlight"]
  content: "highlight"
@import '_highlight/highlight'

.__anzhiyu_split_marker__[data-module="pages"]
  content: "pages"
@import '_page/*'

.__anzhiyu_split_marker__[data-module="layout"]
  content: "layout"
@import '_layout/*'

.__anzhiyu_split_marker__[data-module="tags"]
  content: "tags"
@import '_tags/*'

.__anzhiyu_split_marker__[data-module="modes"]
  content: "modes"
@import '_mode/*'
@import '_third-party/*'

.__anzhiyu_split_marker__[data-module="extra"]
  content: "extra"
@import '_extra/**/*.css'

.__anzhiyu_split_marker__[data-module="search"]
  content: "search"
@import '_search/index'
@import '_search/local-search'
`;

const virtualEntryPath = path.join(CSS_ROOT, "__virtual_entry.styl");
const inlined = inlineImports(segmentedEntry, virtualEntryPath, {
  dirStack: [CSS_ROOT],
  stack: new Set([pathKey(virtualEntryPath)]),
  requires: new Set(),
});
const fullStylusSource = rewriteConfigCalls(inlined, fullConfig);

const compiledCss = stylus(fullStylusSource).set("filename", virtualEntryPath).render();

fs.mkdirSync(OUT_DIR, { recursive: true });
const splitRe = /\.__anzhiyu_split_marker__\[data-module="([a-z0-9-]+)"\]\s*\{\s*content:\s*"[a-z0-9-]+";\s*\}\s*/g;
const markers = [...compiledCss.matchAll(splitRe)];

for (let i = 0; i < markers.length; i++) {
  const name = markers[i][1];
  const start = markers[i].index + markers[i][0].length;
  const end = i + 1 < markers.length ? markers[i + 1].index : compiledCss.length;
  // 统一换行符为 LF
  let chunk = compiledCss
    .slice(start, end)
    .replace(/\r\n?/g, "\n")
    .replace(/#twikoo \.tk-comments \.tk-actions \{\s*a cursor: pointer;\s*\}/g, "#twikoo .tk-comments .tk-actions a {\n  cursor: pointer;\n}")
    .trim() + "\n";
  const outFile = path.join(OUT_DIR, `${name}.css`);
  fs.writeFileSync(outFile, `/* Auto-extracted from hexo-theme-anzhiyu 1.7.1 (${name}) — DO NOT HAND-EDIT */\n${chunk}`);
  console.log(`[extract-upstream-css] Wrote ${name}.css (${Buffer.byteLength(chunk)} bytes)`);
}
