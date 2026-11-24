/**
 * 行为基线 3/6：全局中控台
 *
 * 打开方式：导航栏里的 `input#center-console` + `label.widget`（CSS 依赖兄弟关系）；
 * label 上的内联 `onclick="anzhiyu.switchConsole();"` 是上游 nav.pug:45 的开关契约。
 * 面板契约：`#console` 上的 `.show` 类（CSS 用它把 opacity 0 / pointer-events none
 * 切成可见可点），`#center-console:checked` 跟随 label 点击。
 * 开关契约：`#consoleHideAside` 切 `<html class="hide-aside">` 与按钮 `.on`、
 * `.darkmode_switchbutton` 切 `<html data-theme>`。
 *
 * P4-10 修复（CI 首跑 3 条失败，均为用例假设错误）：
 *   1. `#console` 是 `position: fixed; width/height: 100vw/100vh; opacity: 0` 的面板，
 *      未展开时也有非空 bounding box —— Playwright 的 toBeVisible() 会永远为真
 *      （旧用例据此断言「面板打开/关闭」是错的）。现在断言 `.show` 类 + 面板内部内容。
 *   2. `#console .console-card` 的 first() 命中 `ul.reward-all.console-card`，它由
 *      `.console-card-group-reward { display: none; opacity: 0 }` 永久隐藏（赞赏控制台
 *      分支）。卡片区改断言 `.console-card-group .console-card`。
 *   3. 主题 CSS 有 `@media (max-height: 800px) { #console .console-card-group { display: none } }`，
 *      旧配置的 viewport 实际是 devices["Desktop Chrome"] 的 1280×720 → 卡片永远不渲染。
 *      playwright.config.ts 已把 viewport 固定为 1280×900（>800 断点）。
 *   4. `.console-mask` 的几何中心被面板卡片盖住，中心点点击会 "element intercepts pointer
 *      events"；遮罩是整块 100vw/100vh，点左上角空白处才是真实用户路径。
 */
import {
  currentTheme,
  expect,
  gotoReady,
  test,
} from './helpers'

/** 打开中控台：真实用户路径是点导航栏的 label。 */
async function openConsole(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('label[for="center-console"]').click()
  await expect(page.locator('#center-console')).toBeChecked()
  await expect(page.locator('#console')).toHaveClass(/\bshow\b/)
}

test.describe('全局中控台', () => {
  test('点击导航栏按钮打开面板，且面板内容已渲染', async ({ page }) => {
    await gotoReady(page, '/')

    await openConsole(page)

    // 面板里的卡片（最新评论 / 标签云 / 归档）与按钮组都应真实渲染
    await expect(page.locator('#console .console-card-group .console-card').first()).toBeVisible()
    await expect(page.locator('#console .button-group')).toBeVisible()
    await expect(page.locator('#consoleHideAside')).toBeVisible()
    await expect(page.locator('#console .button-group .darkmode_switchbutton')).toBeVisible()
  })

  test('再次点击入口关闭面板', async ({ page }) => {
    await gotoReady(page, '/')
    const toggle = page.locator('label[for="center-console"]')

    await toggle.click()
    await expect(page.locator('#console')).toHaveClass(/\bshow\b/)

    await toggle.click()
    // 关闭契约：`.show` 被移除 + checkbox 复位（`#console` 仍有全屏几何，不能断言 toBeHidden）
    await expect(page.locator('#console')).not.toHaveClass(/\bshow\b/)
    await expect(page.locator('#center-console')).not.toBeChecked()
  })

  test('「隐藏侧栏」开关切换 html.hide-aside 与按钮 .on 状态', async ({ page }) => {
    await gotoReady(page, '/')
    await openConsole(page)

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
    await gotoReady(page, '/')
    await openConsole(page)

    const before = await currentTheme(page)
    const next = before === 'dark' ? 'light' : 'dark'

    await page.locator('#console .darkmode_switchbutton').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  })

  test('点击遮罩关闭面板并复位入口复选框', async ({ page }) => {
    await gotoReady(page, '/')
    await openConsole(page)

    // 遮罩中心被卡片盖住，点左上角空白才是用户真实能点的位置
    await page.locator('#console .console-mask').click({ position: { x: 10, y: 10 } })

    await expect(page.locator('#console')).not.toHaveClass(/\bshow\b/)
    await expect(page.locator('#center-console')).not.toBeChecked()
  })
})
