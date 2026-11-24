/**
 * 行为基线 3/6：全局中控台
 *
 * 打开方式：导航栏里的 `input#center-console` + `label.widget`（CSS 依赖兄弟关系）。
 * 面板契约：`#console` 上的 `.show` 类与 `#center-console:checked`；
 * 开关契约：`#consoleHideAside` 切 `<html class="hide-aside">`、
 * `.darkmode_switchbutton` 切 `<html data-theme>`。
 */
import { expect, test } from '@playwright/test'
import { currentTheme } from './helpers'

test.describe('全局中控台', () => {
  test('点击导航栏按钮打开面板，且面板内容已渲染', async ({ page }) => {
    await page.goto('/')

    await page.locator('label[for="center-console"]').click()

    await expect(page.locator('#center-console')).toBeChecked()
    await expect(page.locator('#console')).toBeVisible()
    // 面板里的卡片（标签云 / 归档 / 最新评论）与按钮组都应存在
    await expect(page.locator('#console .console-card').first()).toBeVisible()
    await expect(page.locator('#console .button-group')).toBeVisible()
    await expect(page.locator('#consoleHideAside')).toBeVisible()
  })

  test('再次点击入口关闭面板', async ({ page }) => {
    await page.goto('/')
    const toggle = page.locator('label[for="center-console"]')

    await toggle.click()
    await expect(page.locator('#console')).toBeVisible()

    await toggle.click()
    await expect(page.locator('#console')).toBeHidden()
  })

  test('「隐藏侧栏」开关切换 html.hide-aside 与按钮 .on 状态', async ({ page }) => {
    await page.goto('/')
    await page.locator('label[for="center-console"]').click()
    await expect(page.locator('#console')).toBeVisible()

    const html = page.locator('html')
    const button = page.locator('#consoleHideAside')
    const before = await html.getAttribute('class')
    const hadClass = (before ?? '').split(/\s+/).includes('hide-aside')

    await button.click()
    if (hadClass) {
      await expect(html).not.toHaveClass(/\bhide-aside\b/)
      await expect(button).not.toHaveClass(/\bon\b/)
    } else {
      await expect(html).toHaveClass(/\bhide-aside\b/)
      await expect(button).toHaveClass(/\bon\b/)
    }

    // 再点一次应回到初始状态（toggle 语义）
    await button.click()
    if (hadClass) {
      await expect(html).toHaveClass(/\bhide-aside\b/)
    } else {
      await expect(html).not.toHaveClass(/\bhide-aside\b/)
    }
  })

  test('面板里的暗色开关能切换 data-theme', async ({ page }) => {
    await page.goto('/')
    await page.locator('label[for="center-console"]').click()

    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    await page.locator('#console .darkmode_switchbutton').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  })

  test('点击遮罩关闭面板并复位入口复选框', async ({ page }) => {
    await page.goto('/')
    await page.locator('label[for="center-console"]').click()
    await expect(page.locator('#console')).toBeVisible()

    await page.locator('#console .console-mask').click()
    await expect(page.locator('#console')).toBeHidden()
    await expect(page.locator('#center-console')).not.toBeChecked()
  })
})
