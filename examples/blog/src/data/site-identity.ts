/**
 * site-identity.ts — 验证站站点身份（各页面共用的「基准站」元数据）。
 *
 * Phase 2 还没有站点配置层（Phase 7 迁移脚本才落 `_config.yml`），
 * 站点元数据以常量形式集中在这一份；此前 index / [slug] / [...path] /
 * page/[...page] / archives/_data.ts 各持一份内联对象，容易漂移，统一到这里。
 *
 * 两种构建形态：
 *   - 验收构建（默认，不设环境变量）：身份 = 基准站 AnZhiYu Baseline，
 *     url = https://baseline.anzhiyu.test、root = / —— 与 tests/baseline-html/
 *     的 48 页基线一一对应，scripts/diff-html.mjs 的归一化（<SITE> 占位）
 *     依赖这个身份，**不要改动默认值**。
 *   - GitHub Pages demo 构建：设置 DEPLOY_SITE_URL / DEPLOY_SITE_ROOT
 *     两个环境变量后，url / root 换成真实部署位置（如
 *     https://mcxiaochenn.github.io + /blog）。站内链接、canonical / og:url
 *     全部跟随 root；Astro 侧的 `base` 由 astro.config.mjs 读同一个变量，
 *     负责页面输出目录与 Vite 打包资源的前缀。
 */

const deployUrl = process.env.DEPLOY_SITE_URL
const deployRoot = process.env.DEPLOY_SITE_ROOT
// Git Bash 会把以 / 开头的 env 值做 MSYS 路径转换（/blog → C:\...\blog），
// 所以约定传值不带前导斜杠（DEPLOY_SITE_ROOT=blog），在这里统一归一化。
const normalizeRoot = (value?: string) =>
  value ? (value.startsWith('/') ? value : `/${value}`) : undefined

export const SITE_IDENTITY = {
  title: 'AnZhiYu Baseline',
  subtitle: '上游 1.7.1 参考产物',
  description: 'hexo-theme-anzhiyu 1.7.1 在固定内容与固定配置下的参考构建',
  keywords: 'Hexo,AnZhiYu,baseline',
  author: 'AnZhiYu Baseline',
  language: 'zh-CN',
  url: deployUrl || 'https://baseline.anzhiyu.test',
  root: normalizeRoot(deployRoot) || '/',
} as const
