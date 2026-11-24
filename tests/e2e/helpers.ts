/**
 * 行为用例共用的选择器与小工具。
 *
 * 只依赖「用户可见/稳定」的契约（真实 DOM id 与 localStorage 键），
 * 不读主题内部变量名或组件实现细节。
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** 首页上第一个站内文章链接（用于站内导航相关用例）。 */
export function internalLink(page: Page) {
  return page.locator('#recent-posts a[href^="/"]').first()
}

/** 右击一个元素，打开自定义右键菜单。 */
export async function openContextMenu(page: Page, target: Locator) {
  await target.click({ button: 'right' })
  await expect(page.locator('#rightMenu')).toBeVisible()
}

/** 读取 `saveToLocal('theme')` 的值；没写过时返回 undefined。 */
export async function readStoredTheme(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('theme')
    if (!raw) return undefined
    try {
      return JSON.parse(raw).value as string
    } catch {
      return undefined
    }
  })
}

/** `<html data-theme>` 的当前值。 */
export async function currentTheme(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('data-theme')
}

/** 站点启用了哪套搜索 UI；都没启用时返回 null（用例据此 skip）。 */
export async function detectSearchUi(page: Page): Promise<'local' | 'algolia' | 'docsearch' | null> {
  if ((await page.locator('#local-search').count()) > 0) return 'local'
  if ((await page.locator('#algolia-search').count()) > 0) return 'algolia'
  if ((await page.locator('.docsearch-wrap').count()) > 0) return 'docsearch'
  return null
}

/** 等 ClientRouter 完成一次站内导航（URL 变化 + 文档没有整页刷新）。 */
export async function waitForClientRoute(page: Page, previousUrl: string) {
  await page.waitForURL((url) => url.href !== previousUrl)
  // ClientRouter 换完 body 后会给 <html> 打上 astro-* 状态；等它稳定下来
  await page.locator('body[data-type="anzhiyu"]').waitFor({ state: 'attached' })
}

/**
 * 记录所有 `document` 类型的请求（整页刷新的硬证据）。
 *
 * 必须在 `page.goto` 之前挂监听，否则首访的那次 document 请求会被漏掉；
 * 首访之后用返回数组的长度作为基线，站内导航不应再追加任何一条。
 */
export function trackDocumentRequests(page: Page): string[] {
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })
  return documents
}

/** 页面运行期错误收集器：console 的 error 级消息 + 未捕获 JS 异常分开记。 */
export function collectPageErrors(page: Page): {
  consoleErrors: string[]
  pageErrors: string[]
} {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { consoleErrors, pageErrors }
}

/**
 * 过滤掉「资源加载失败」类 console 噪音。
 *
 * 第三方 CDN（Meting / fancybox / lazyload…）与图片 404 属于 P4 资源与第三方集成
 * 的验收范围（另有用例覆盖），不是 ClientRouter 的运行时错误；把它们排除后只留
 * 真正的 JS 报错。
 */
export function runtimeConsoleErrors(errors: string[]): string[] {
  return errors.filter(
    (text) => !/Failed to load resource|net::ERR|ERR_(?:CONNECTION|NAME|CERT|ABORTED)/.test(text),
  )
}
