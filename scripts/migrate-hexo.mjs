#!/usr/bin/env node
/**
 * scripts/migrate-hexo.mjs — Hexo (hexo-theme-anzhiyu) → Astro (astro-theme-anzhiyu v2) 一键迁移工具
 *
 * 用法：
 *   node scripts/migrate-hexo.mjs --site <Hexo站点目录> [--out <输出目录>] [--dry-run]
 *
 * 自动完成：
 * 1. 拷贝本仓库模板骨架至目标目录；
 * 2. 迁移 `source/_posts/**\/*.md` → `src/content/posts/`；
 * 3. 迁移 `source/_data/*.yml`（link / essay / album / equipment / about / creativity）→ `src/data/`；
 * 4. 拷贝 `source/img` 等自定义静态资产 → `public/`；
 * 5. 解析源站 `_config.yml` 与 `_config.anzhiyu.yml`，自动更新 `src/config/site.ts` 与 `src/config/profile.ts` 核心身份信息，并输出 `migration-report.json`。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(HERE, "..");

function parseArgs(argv) {
  const opts = { site: "", out: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") opts.site = argv[++i] || "";
    else if (a.startsWith("--site=")) opts.site = a.slice(7);
    else if (a === "--out") opts.out = argv[++i] || "";
    else if (a.startsWith("--out=")) opts.out = a.slice(6);
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "-h" || a === "--help") {
      console.log("用法: node scripts/migrate-hexo.mjs --site <Hexo目录> [--out <输出目录>] [--dry-run]");
      process.exit(0);
    }
  }
  if (!opts.site) {
    console.error("[migrate-hexo] 缺少 --site <Hexo站点目录>");
    process.exit(1);
  }
  return opts;
}

function walkFiles(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, base, acc);
    else if (ent.isFile()) acc.push(path.relative(base, full));
  }
  return acc;
}

function copyDirFiltered(src, dest, skipNames, dryRun) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.has(ent.name)) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      count += copyDirFiltered(s, d, skipNames, dryRun);
    } else if (ent.isFile()) {
      count++;
      if (!dryRun) {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
      }
    }
  }
  return count;
}

const opts = parseArgs(process.argv.slice(2));
const siteDir = path.resolve(opts.site);
const siteCfgPath = path.join(siteDir, "_config.yml");
if (!fs.existsSync(siteCfgPath)) {
  console.error(`[migrate-hexo] 未找到 Hexo 配置文件: ${siteCfgPath}`);
  process.exit(1);
}

const outDir = path.resolve(opts.out || path.join(".migration-out", path.basename(siteDir)));
const hexoCfg = YAML.parse(fs.readFileSync(siteCfgPath, "utf8")) ?? {};
const themeYmlCandidates = [
  path.join(siteDir, "_config.anzhiyu.yml"),
  path.join(siteDir, "themes/anzhiyu/_config.yml"),
];
const themeYmlPath = themeYmlCandidates.find((p) => fs.existsSync(p));
const hexoThemeCfg = themeYmlPath ? YAML.parse(fs.readFileSync(themeYmlPath, "utf8")) ?? {} : {};

// 1. 拷贝模板基础骨架（不含示例文章与构建产物）
const SKIP = new Set(["node_modules", ".git", ".astro", "dist", ".migration-out", "posts"]);
const templateFiles = copyDirFiltered(TEMPLATE_ROOT, outDir, SKIP, opts.dryRun);

// 2. 迁移文章 source/_posts -> src/content/posts
const postsSrc = path.join(siteDir, "source/_posts");
const postFiles = walkFiles(postsSrc).filter((f) => /\.mdx?$/i.test(f));
for (const rel of postFiles) {
  if (!opts.dryRun) {
    const dest = path.join(outDir, "src/content/posts", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(postsSrc, rel), dest);
  }
}

// 3. 迁移数据文件 source/_data/*.yml -> src/data/
const dataSrc = path.join(siteDir, "source/_data");
const dataFiles = walkFiles(dataSrc).filter((f) => /\.ya?ml$/i.test(f));
for (const rel of dataFiles) {
  if (!opts.dryRun) {
    const dest = path.join(outDir, "src/data", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(dataSrc, rel), dest);
  }
}

// 4. 拷贝静态图片与媒体文件（排除 _posts / _data / *.md）
const sourceRoot = path.join(siteDir, "source");
const assetFiles = walkFiles(sourceRoot).filter(
  (rel) => !rel.startsWith("_") && !/\.mdx?$/i.test(rel) && !/\.njk$/i.test(rel),
);
for (const rel of assetFiles) {
  if (!opts.dryRun) {
    const dest = path.join(outDir, "public", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, rel), dest);
  }
}

// 5. 将源站核心身份写入目标站的 src/config/site.ts 与 profile.ts
if (!opts.dryRun) {
  const siteTsPath = path.join(outDir, "src/config/site.ts");
  if (fs.existsSync(siteTsPath)) {
    let siteTs = fs.readFileSync(siteTsPath, "utf8");
    if (hexoCfg.title) siteTs = siteTs.replace(/title:\s*"[^"]*"/, `title: ${JSON.stringify(String(hexoCfg.title))}`);
    if (hexoCfg.subtitle) siteTs = siteTs.replace(/subtitle:\s*"[^"]*"/, `subtitle: ${JSON.stringify(String(hexoCfg.subtitle))}`);
    if (hexoCfg.description) siteTs = siteTs.replace(/description:\s*"[^"]*"/, `description: ${JSON.stringify(String(hexoCfg.description))}`);
    if (hexoCfg.author) siteTs = siteTs.replace(/author:\s*"[^"]*"/, `author: ${JSON.stringify(String(hexoCfg.author))}`);
    if (hexoCfg.url) siteTs = siteTs.replace(/url:\s*"[^"]*"/, `url: ${JSON.stringify(String(hexoCfg.url))}`);
    fs.writeFileSync(siteTsPath, siteTs);
  }

  const profileTsPath = path.join(outDir, "src/config/profile.ts");
  if (fs.existsSync(profileTsPath)) {
    let profileTs = fs.readFileSync(profileTsPath, "utf8");
    if (hexoCfg.author) profileTs = profileTs.replace(/name:\s*"[^"]*"/, `name: ${JSON.stringify(String(hexoCfg.author))}`);
    if (hexoThemeCfg.avatar?.img) {
      profileTs = profileTs.replace(/avatar:\s*"[^"]*"/, `avatar: ${JSON.stringify(String(hexoThemeCfg.avatar.img))}`);
    }
    fs.writeFileSync(profileTsPath, profileTs);
  }
}

const report = {
  sourceSite: siteDir,
  targetDir: outDir,
  dryRun: opts.dryRun,
  migratedPosts: postFiles.length,
  migratedDataFiles: dataFiles,
  copiedStaticAssets: assetFiles.length,
  templateSkeletonFiles: templateFiles,
};

if (opts.dryRun) {
  console.log(JSON.stringify(report, null, 2));
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "migration-report.json"), JSON.stringify(report, null, 2));
  console.log(`[migrate-hexo] ✓ 迁移完成: ${postFiles.length} 篇文章, ${dataFiles.length} 个数据文件 → ${outDir}`);
}
