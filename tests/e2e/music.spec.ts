/**
 * 行为基线 4/6：音乐播放器（nav_music / APlayer + Meting）
 *
 * 本 fixture 的 `theme.nav_music.enable` 为 true，但 APlayer/Meting 的音频源来自
 * 网易云 CDN：CI 上可能被网络策略阻断、浏览器也可能拒绝自动播放。这类环境原因
 * 不适合作 fail，用 `test.skip()` 标注「未验证」。
 *
 * 一定会验证的部分：`#nav-music` 是 `transition:persist` 节点，站内导航后仍是同一个
 * DOM 元素（这是「播放不中断」的结构前提）。
 */
import { expect, test } from '@playwright/test'
import { internalLink, waitForClientRoute } from './helpers'

test.describe('音乐播放器', () => {
  test('播放器容器跨站内导航保持同一个 DOM 节点', async ({ page }) => {
    await page.goto('/')
    test.skip((await page.locator('#nav-music').count()) === 0, 'nav_music.enable=false，播放器未渲染')

    await expect(page.locator('#nav-music')).toBeAttached()
    await page.evaluate(() => {
      ;(window as unknown as { __e2eNavMusic?: Element | null }).__e2eNavMusic =
        document.getElementById('nav-music')
    })

    const urlBefore = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, urlBefore)

    const sameNode = await page.evaluate(() => {
      const stored = (window as unknown as { __e2eNavMusic?: Element | null }).__e2eNavMusic
      return stored !== undefined && stored === document.getElementById('nav-music')
    })
    expect(sameNode, '站内导航后 #nav-music 被重建（transition:persist 未生效）').toBe(true)
  })

  test('播放中导航不中断且进度继续推进', async ({ page }) => {
    await page.goto('/')
    test.skip((await page.locator('#nav-music').count()) === 0, 'nav_music.enable=false，播放器未渲染')

    // 触发播放：上游把音乐球点击映射到 anzhiyu.musicToggle()
    await page.locator('#nav-music-hoverTips').click({ force: true })

    let audio = page.locator('#nav-music audio').first()
    try {
      await audio.waitFor({ state: 'attached', timeout: 20_000 })
    } catch {
      test.skip(true, 'APlayer/Meting 音频未加载（CDN 不可达或 CI 未允许自动播放）')
    }

    // 等真正开始播放；仍为 paused 时按环境原因跳过
    try {
      await expect.poll(async () => audio.evaluate((el) => !(el as HTMLAudioElement).paused), {
        timeout: 20_000,
      }).toBe(true)
    } catch {
      test.skip(true, '音频未能开始播放（自动播放被浏览器拦截或音源不可用）')
    }

    const before = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime)

    const urlBefore = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, urlBefore)

    audio = page.locator('#nav-music audio').first()
    await expect(audio).toHaveCount(1)
    const state = await audio.evaluate((el) => {
      const audioEl = el as HTMLAudioElement
      return { paused: audioEl.paused, currentTime: audioEl.currentTime }
    })

    expect(state.paused, '站内导航后音频被暂停').toBe(false)
    expect(state.currentTime, '站内导航后播放进度被重置').toBeGreaterThanOrEqual(before)
  })
})
