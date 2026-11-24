/**
 * 行为基线 1/6：暗色模式
 *
 * 覆盖四件事：首访跟随系统、手动切换、刷新保持、站内导航后保持。
 * 断言的稳定契约：
 *   - `<html data-theme>` 的 light/dark；
 *   - `localStorage.theme`（上游 `saveToLocal('theme', mode, 2)`，值是带 value/expiry 的 JSON）。
 *
 * P4-10 修复（CI 首跑 4 条失败）：
 *   - `#darkmode` 在默认折叠的 `#rightside-config-hide` 里，且 `#rightside` 未滚动时
 *     整块 translate 到视口外 —— 旧写法 `click({ force: true })` 仍报
 *     "Element is outside of the viewport"。现在统一走 helpers.toggleThemeViaRightside
 *     的真实用户路径：滚动露出 #rightside → 点齿轮展开 → 点 #darkmode。
 *   - 「右键菜单里的深色模式」依赖 rightClickMenu.enable，demo 站为 false → 按运行时
 *     检测 skip（依据写在 helpers.RIGHT_MENU_DISABLED_REASON）。
 */
import {
  RIGHT_MENU_DISABLED_REASON,
  currentTheme,
  expect,
  gotoReady,
  hasRightMenuRuntime,
  internalLink,
  readStoredTheme,
  test,
  toggleThemeViaRightside,
  clickAndWaitForClientRoute,
} from './helpers'

test.describe('暗色模式 · 首访跟随系统（dark）', () => {
  test.use({ colorScheme: 'dark' })

  test('系统偏好为深色时首访使用 data-theme="dark"', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    // 首访没写过 localStorage，后面才由手动切换写入
    expect(await readStoredTheme(page)).toBeUndefined()
  })
})

test.describe('暗色模式 · 首访跟随系统（light）', () => {
  test.use({ colorScheme: 'light' })

  test('系统偏好为浅色时首访使用 data-theme="light"', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})

test.describe('暗色模式 · 手动切换', () => {
  test('点击右侧暗色按钮切换主题并写入 localStorage', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)

    const next = await toggleThemeViaRightside(page)

    expect(await readStoredTheme(page)).toBe(next)
  })

  test('右键菜单里的「深色模式」也能切换主题', async ({ page }) => {
    await gotoReady(page, '/')
    test.skip(!(await hasRightMenuRuntime(page)), RIGHT_MENU_DISABLED_REASON)

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
    await gotoReady(page, '/')
    const next = await toggleThemeViaRightside(page)

    // 刷新同样只等 DOMContentLoaded + 主题运行时，不等外部资源 load
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
  })

  test('站内导航（ClientRouter）后主题不被重置', async ({ page }) => {
    await gotoReady(page, '/')
    const next = await toggleThemeViaRightside(page)

    await clickAndWaitForClientRoute(page, internalLink(page))

    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    expect(await readStoredTheme(page)).toBe(next)
  })
})
