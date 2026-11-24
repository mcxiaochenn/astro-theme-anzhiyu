/**
 * 行为基线 2/6：自定义右键菜单
 *
 * 断言的是上游 right_click_menu.js 的可观察行为：
 *   - 桌面宽度（>768）右击才出菜单；
 *   - 右击链接 → 扩展组（新窗口/复制链接）出现；
 *   - 右击空白 → 只留基础组（回到顶部等）；
 *   - 点「回到顶部」会关菜单并滚回顶部。
 */
import { expect, test } from '@playwright/test'

test.describe('右键菜单', () => {
  test('右击链接显示菜单与扩展项，遮罩同时出现', async ({ page }) => {
    await page.goto('/')

    const link = page.locator('#recent-posts a[href^="/"]').first()
    await link.click({ button: 'right' })

    await expect(page.locator('#rightMenu')).toBeVisible()
    await expect(page.locator('#rightmenu-mask')).toBeVisible()

    // 扩展组：右击的是链接，所以「新窗口打开」「复制链接地址」可见
    await expect(page.locator('#menu-newwindow')).toBeVisible()
    await expect(page.locator('#menu-copylink')).toBeVisible()
    // 基础组与扩展组互斥
    await expect(page.locator('#menu-top')).toBeHidden()
  })

  test('右击空白处显示基础菜单，不出现链接扩展项', async ({ page }) => {
    await page.goto('/')

    await page.locator('body').click({ button: 'right', position: { x: 4, y: 4 } })
    await expect(page.locator('#rightMenu')).toBeVisible()

    await expect(page.locator('#menu-top')).toBeVisible()
    await expect(page.locator('#menu-backward')).toBeVisible()
    await expect(page.locator('#menu-forward')).toBeVisible()
    await expect(page.locator('#menu-copytext')).toBeVisible()
    await expect(page.locator('#menu-newwindow')).toBeHidden()
    await expect(page.locator('#menu-copylink')).toBeHidden()
  })

  test('菜单项集合齐全（回到顶部 / 复制 / 搜索 / 音乐 / 随手逛逛）', async ({ page }) => {
    await page.goto('/')

    // 静态结构在首屏就应在 DOM 里（是否可见由交互决定）
    for (const id of [
      'menu-backward',
      'menu-forward',
      'menu-refresh',
      'menu-top',
      'menu-copytext',
      'menu-commenttext',
      'menu-search',
      'menu-music-toggle',
      'menu-randomPost',
      'menu-copy',
      'menu-darkmode',
    ]) {
      await expect(page.locator(`#${id}`), `缺少右键菜单项 #${id}`).toHaveCount(1)
    }
  })

  test('点击「回到顶部」关闭菜单并滚动到页首', async ({ page }) => {
    await page.goto('/')

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, '页面需要先滚到底部才能验证回到顶部').toBeGreaterThan(200)

    await page.locator('body').click({ button: 'right', position: { x: 4, y: 4 } })
    await expect(page.locator('#rightMenu')).toBeVisible()
    await page.locator('#menu-top').click()

    await expect(page.locator('#rightMenu')).toBeHidden()
    await expect.poll(async () => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(5)
  })
})
