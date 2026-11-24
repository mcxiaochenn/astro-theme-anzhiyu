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
