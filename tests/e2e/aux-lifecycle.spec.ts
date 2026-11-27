/**
 * 换页生命周期回归（Astro ClientRouter 原生导航下附属功能与持久化岛存活验证）
 */
import type { Page } from '@playwright/test'
import {
  clickAndWaitForClientRoute,
  collectPageErrors,
  detectSearchUi,
  expect,
  gotoReady,
  internalLink,
  runtimeConsoleErrors,
  test,
} from './helpers'

async function navViaMenu(page: Page, href: string): Promise<void> {
  await page.evaluate((targetHref) => {
    const state = window as unknown as { __e2eRouteDone?: boolean }
    state.__e2eRouteDone = false
    document.addEventListener('astro:page-load', () => { state.__e2eRouteDone = true }, { once: true })
    const a = document.createElement('a')
    a.href = targetHref
    document.body.appendChild(a)
    a.click()
  }, href)
  await expect
    .poll(() => page.url(), { timeout: 20_000 })
    .toContain(href.replace(/\/$/, ''))
  await page.waitForFunction(
    () => (window as unknown as { __e2eRouteDone?: boolean }).__e2eRouteDone === true,
    undefined,
    { timeout: 20_000 },
  )
}

test.describe('换页生命周期 · 附属功能跨站内导航存活', () => {
  test('右侧按钮栏换页后仍可用', async ({ page }) => {
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))

    await page.evaluate(() => window.scrollTo(0, 400))
    await page.locator('#rightside-config').click()
    await expect(page.locator('#rightside-config-hide')).toHaveClass(/\bshow\b/)

    const before = await page.locator('html').getAttribute('data-theme')
    const next = before === 'dark' ? 'light' : 'dark'
    await page.locator('#darkmode').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  })

  test('换页后点蒙版可关闭移动端侧滑菜单', async ({ page }) => {
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))

    await page.evaluate(() => (document.querySelector('#toggle-menu a') as HTMLElement)?.click())
    await expect(page.locator('#sidebar-menus')).toHaveClass(/\bopen\b/)

    await page.evaluate(() => document.getElementById('menu-mask')!.click())
    await expect(page.locator('#sidebar-menus')).not.toHaveClass(/\bopen\b/)
  })

  test('换页后移动端抽屉暗色开关可用', async ({ page }) => {
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))

    const before = await page.locator('html').getAttribute('data-theme')
    const next = before === 'dark' ? 'light' : 'dark'
    await page.evaluate(() => {
      const btn = document.querySelector('#sidebar-menus .darkmode_switchbutton') as HTMLElement
      btn.click()
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  })

  test('音乐岛：播放器未就绪时点击音乐球不抛异常且跨页保持同一节点', async ({ page }) => {
    const { pageErrors } = collectPageErrors(page)
    await gotoReady(page, '/')
    test.skip((await page.locator('#nav-music').count()) === 0, 'musicConfig.enable=false')

    await page.evaluate(() => {
      ;(window as unknown as { __navMusicRef?: Element | null }).__navMusicRef =
        document.getElementById('nav-music')
      document.getElementById('nav-music-hoverTips')!.click()
    })

    await navViaMenu(page, '/about/')

    const isSame = await page.evaluate(
      () => (window as unknown as { __navMusicRef?: Element | null }).__navMusicRef === document.getElementById('nav-music'),
    )
    expect(isSame).toBe(true)
    expect(runtimeConsoleErrors(pageErrors)).toEqual([])
  })

  test('搜索：换页后入口按钮与弹层关闭仍可用，并正确管理滚动锁', async ({ page }) => {
    await gotoReady(page, '/')
    const ui = await detectSearchUi(page)
    test.skip(ui !== 'local', '当前未启用 local_search')
    await clickAndWaitForClientRoute(page, internalLink(page))

    await page.evaluate(() => {
      const btn = document.querySelector('#search-button a.search') as HTMLElement
      btn.click()
    })
    await expect(page.locator('#local-search .search-dialog')).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    await page.evaluate(() => {
      const btn = document.querySelector('#local-search .search-close-button') as HTMLElement
      btn.click()
    })
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe('')
  })
})
