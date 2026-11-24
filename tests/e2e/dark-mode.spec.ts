/**
 * 行为基线 1/6：暗色模式
 *
 * 覆盖四件事：首访跟随系统、手动切换、刷新保持、站内导航后保持。
 * 断言的稳定契约：
 *   - `<html data-theme>` 的 light/dark；
 *   - `localStorage.theme`（上游 `saveToLocal('theme', mode, 2)`，值是带 value/expiry 的 JSON）。
 */
import { expect, test } from '@playwright/test'
import { currentTheme, internalLink, readStoredTheme, waitForClientRoute } from './helpers'

test.describe('暗色模式 · 首访跟随系统（dark）', () => {
  test.use({ colorScheme: 'dark' })

  test('系统偏好为深色时首访使用 data-theme="dark"', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    // 首访没写过 localStorage，后面才由手动切换写入
    expect(await readStoredTheme(page)).toBeUndefined()
  })
})

test.describe('暗色模式 · 首访跟随系统（light）', () => {
  test.use({ colorScheme: 'light' })

  test('系统偏好为浅色时首访使用 data-theme="light"', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})

test.describe('暗色模式 · 手动切换', () => {
  test('点击右侧暗色按钮切换主题并写入 localStorage', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)

    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    // #darkmode 在右侧折叠组里，小视口可能被视觉折叠；force 只跳过可见性，不跳过事件
    await page.locator('#darkmode').click({ force: true })

    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
  })

  test('右键菜单里的「深色模式」也能切换主题', async ({ page }) => {
    await page.goto('/')
    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    await page.locator('body').click({ button: 'right', position: { x: 8, y: 8 } })
    await expect(page.locator('#rightMenu')).toBeVisible()
    await page.locator('#menu-darkmode').click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
    await expect(page.locator('#rightMenu')).toBeHidden()
  })
})

test.describe('暗色模式 · 状态保持', () => {
  test('刷新后主题与 localStorage 保持一致', async ({ page }) => {
    await page.goto('/')
    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    await page.locator('#darkmode').click({ force: true })
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
  })

  test('站内导航（ClientRouter）后主题不被重置', async ({ page }) => {
    await page.goto('/')
    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    await page.locator('#darkmode').click({ force: true })
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)

    const urlBefore = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, urlBefore)

    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
  })
})
