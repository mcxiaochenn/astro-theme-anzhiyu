/**
 * 换页生命周期回归（用户报告：懒加载换页后「音乐岛」这类附属功能失效或异常）。
 *
 * 覆盖三类根因，全部只依赖用户可见契约（DOM 行为 / 事件 / 控制台）：
 *   A. 一次性绑定挂在换页即被替换的节点上 → 换页后功能死亡
 *      （右侧按钮栏 / 蒙版关侧栏 / 侧栏暗色开关 / 搜索入口与弹层关闭）
 *   B. refreshFn 在常驻节点或 document 上重复绑定 → 换页后叠加异常
 *      （#nav-music 点击 / visibilitychange / 音乐页键盘劫持）
 *   C. shim 契约缺口 → 页面脚本永远拿不到重初始化时机
 *      （pjax:success / pjax.refresh / persist 搬移不销毁播放器）
 *
 * 特性门控：搜索类断言在对应配置未启用时 skip（与 search.spec 同策略）。
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

/** 事件监听净计数追踪（addEventListener − removeEventListener），按目标×类型聚合。 */
const TRACER = `
;(function () {
  const log = {};
  window.__listenerLog = log;
  const key = (t, type) => {
    let id;
    if (t === window) id = 'window';
    else if (t === document) id = 'document';
    else if (t === document.body) id = 'body';
    else if (t && t.id) id = '#' + t.id;
    else if (t && t.classList && t.classList.length) id = '.' + [...t.classList].join('.');
    else id = t && t.tagName ? t.tagName.toLowerCase() : 'other';
    return id + '|' + type;
  };
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    const k = key(this, type);
    log[k] = (log[k] || 0) + 1;
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    const k = key(this, type);
    log[k] = (log[k] || 0) - 1;
    return origRemove.call(this, type, fn, opts);
  };
})();
`

async function listenerCount(page: Page, key: string): Promise<number> {
  return page.evaluate((k) => ((window as unknown as { __listenerLog?: Record<string, number> }).__listenerLog || {})[k] || 0, key)
}

/** 用 pjax.loadUrl 做一次站内导航（文章页没有 #recent-posts，第二跳起用它）。 */
async function navTo(page: Page, path: string): Promise<void> {
  // 导航完成信号与 clickAndWaitForClientRoute 同口径：等 astro:page-load。
  // URL 在 swap 后立刻变，但 runScripts 还在等新 src 脚本 load（about 的 countup、
  // data-astro-rerun 的 waterfall），只等 URL 就断言会偶发假失败。
  await page.evaluate((p) => {
    const state = window as unknown as { __e2eRouteDone?: boolean }
    state.__e2eRouteDone = false
    document.addEventListener('astro:page-load', () => { state.__e2eRouteDone = true }, { once: true })
    ;(window as unknown as { pjax: { loadUrl: (u: string) => void } }).pjax.loadUrl(p)
  }, path)
  await expect
    .poll(() => page.url(), { timeout: 20_000, message: `pjax.loadUrl(${path}) 后 URL 未变化` })
    .toContain(path.replace(/\/$/, ''))
  await page.waitForFunction(
    () => (window as unknown as { __e2eRouteDone?: boolean }).__e2eRouteDone === true,
    undefined,
    { timeout: 20_000 },
  )
}

test.describe('换页生命周期 · 附属功能跨站内导航存活', () => {
  test('右侧按钮栏换页后仍可用（事件委托重绑）', async ({ page }) => {
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))

    // 真实用户路径：滚动露出 #rightside → 点齿轮展开设置组
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.locator('#rightside-config').click()
    await expect(page.locator('#rightside-config-hide')).toHaveClass(/\bshow\b/)

    // 换页后深色按钮仍能切换主题（rightSideFn.darkmode 委托存活）
    const before = await page.locator('html').getAttribute('data-theme')
    const next = before === 'dark' ? 'light' : 'dark'
    await page.locator('#darkmode').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  })

  test('换页后点蒙版可关闭侧栏', async ({ page }) => {
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))

    await page.evaluate(() => document.getElementById('toggle-menu')!.click())
    await expect(page.locator('#sidebar-menus')).toHaveClass(/\bopen\b/)

    await page.evaluate(() => document.getElementById('menu-mask')!.click())
    await expect(page.locator('#sidebar-menus')).not.toHaveClass(/\bopen\b/)
  })

  test('换页后侧栏暗色开关可用', async ({ page }) => {
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

  test('常驻节点与 document 不随换页叠加监听（#nav-music 点击 / visibilitychange）', async ({ page }) => {
    await page.addInitScript(TRACER)
    await gotoReady(page, '/')
    const navMusic0 = await listenerCount(page, '#nav-music|click')
    const visibility0 = await listenerCount(page, 'document|visibilitychange')

    await clickAndWaitForClientRoute(page, internalLink(page))
    await navTo(page, '/about/')

    expect(await listenerCount(page, '#nav-music|click'), '#nav-music 点击监听随换页叠加').toBe(navMusic0)
    expect(await listenerCount(page, 'document|visibilitychange'), 'visibilitychange 监听随换页叠加').toBe(visibility0)
  })

  test('pjax:success 在每次站内导航后补发（people.js 等页面脚本的重初始化时机）', async ({ page }) => {
    await page.addInitScript(`
      window.__pjaxSuccessCount = 0;
      document.addEventListener('pjax:success', () => { window.__pjaxSuccessCount++; });
    `)
    await gotoReady(page, '/')
    await clickAndWaitForClientRoute(page, internalLink(page))
    expect(await page.evaluate(() => (window as unknown as { __pjaxSuccessCount: number }).__pjaxSuccessCount)).toBe(1)
    await navTo(page, '/about/')
    expect(await page.evaluate(() => (window as unknown as { __pjaxSuccessCount: number }).__pjaxSuccessCount)).toBe(2)
  })

  test('pjax.refresh 存在且不报错（local-search/algolia 结果渲染调用点）', async ({ page }) => {
    await gotoReady(page, '/')
    const result = await page.evaluate(() => {
      const pjax = (window as unknown as { pjax?: { refresh?: (c?: unknown) => void } }).pjax
      if (!pjax || typeof pjax.refresh !== 'function') return 'missing'
      try {
        pjax.refresh(document.body)
        return 'ok'
      } catch (err) {
        return 'threw: ' + (err as Error).message
      }
    })
    expect(result).toBe('ok')
  })

  test('音乐岛：换页搬移不销毁/重建 nav-music 的播放器（无 moveBefore 浏览器路径）', async ({ page }) => {
    // 假件复刻 Meting2@1.0.1 的真实生命周期契约（hexo-anzhiyu-music）：
    //   disconnectedCallback(){ this.lock || this.aplayer.destroy() }   ← lock 跳过销毁
    //   connectedCallback(){ this._init(); this._parse() }              ← 重连即重建
    // 删除 Element.moveBefore 强制走 persist 搬移的「摘下→挂回」回退路径。
    await page.addInitScript(`
      delete Element.prototype.moveBefore;
      window.__metingDestroy = 0;
      window.__metingRebuild = 0;
      class FakeMeting extends HTMLElement {
        connectedCallback() { this._init(); this._parse(); }
        disconnectedCallback() { this.lock || this.aplayer.destroy(); }
        _init() {}
        _parse() {
          window.__metingRebuild++;
          this.aplayer = {
            audio: { paused: true },
            destroy() { window.__metingDestroy++; },
            toggle() {}, volume() {}, on() {}, skipBack() {}, skipForward() {},
            list: { audios: [], clear() {}, add() {}, switch() {} },
          };
          window.__aplayerRef = this.aplayer;
        }
      }
      customElements.define('meting-js', FakeMeting);
    `)
    await gotoReady(page, '/')
    test.skip((await page.locator('#nav-music meting-js').count()) === 0, 'nav_music.enable=false，播放器未渲染')
    const rebuilds0 = await page.evaluate(() => (window as unknown as { __metingRebuild: number }).__metingRebuild)

    await clickAndWaitForClientRoute(page, internalLink(page))

    expect(
      await page.evaluate(() => (window as unknown as { __metingDestroy: number }).__metingDestroy),
      'persist 搬移触发 disconnectedCallback → 播放器被销毁',
    ).toBe(0)
    expect(
      await page.evaluate(() => (window as unknown as { __metingRebuild: number }).__metingRebuild),
      'persist 搬移触发 connectedCallback → 播放器被重建（播放进度/歌单丢失）',
    ).toBe(rebuilds0)
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('#nav-music meting-js') as unknown as { aplayer?: unknown }
        return el && el.aplayer === (window as unknown as { __aplayerRef?: unknown }).__aplayerRef
      }),
      '换页后 nav-music 的 aplayer 实例被换掉',
    ).toBe(true)
  })

  test('音乐页键盘控制不泄漏到其它页面', async ({ page }) => {
    // 假 meting-js：制造 .aplayer-pic 以触发 addEventListenerMusic 的完整绑定路径
    await page.addInitScript(`
      window.__fakeToggle = 0;
      class FakeMeting extends HTMLElement {
        connectedCallback() {
          this.innerHTML =
            '<div class="aplayer-pic"></div>' +
            '<div class="aplayer-info"><div class="aplayer-time"><button class="aplayer-icon-menu"></button></div></div>' +
            '<div class="aplayer-list"></div>';
          this.aplayer = {
            audio: { paused: true },
            toggle() { window.__fakeToggle++; },
            volume() {}, on() {}, skipBack() {}, skipForward() {},
            list: { audios: [], clear() {}, add() {}, switch() {} },
          };
        }
        disconnectedCallback() {}
      }
      customElements.define('meting-js', FakeMeting);
    `)
    await gotoReady(page, '/')
    test.skip((await page.locator('#nav-music').count()) === 0, 'nav_music.enable=false，播放器未渲染')

    await navTo(page, '/music/')
    await page.waitForTimeout(800) // changeMusicBg 的等待计时器（100ms）触发绑定
    await navTo(page, '/about/')
    await navTo(page, '/music/')
    await page.waitForTimeout(800)
    await navTo(page, '/about/')

    // 已离开音乐页：空格键不应再被音乐页键盘处理器劫持
    const prevented = await page.evaluate(() => {
      const evt = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
      document.dispatchEvent(evt)
      return evt.defaultPrevented
    })
    expect(prevented, '离开音乐页后 Space 仍被音乐页键盘监听劫持（preventDefault）').toBe(false)
    expect(
      await page.evaluate(() => (window as unknown as { __fakeToggle: number }).__fakeToggle),
      '离开音乐页后 Space 仍触发旧播放器 toggle',
    ).toBe(0)
  })

  test('音乐岛：播放器未就绪时点击音乐球不抛 TypeError', async ({ page }) => {
    const { pageErrors } = collectPageErrors(page)
    await gotoReady(page, '/')
    test.skip((await page.locator('#nav-music').count()) === 0, 'nav_music.enable=false，播放器未渲染')
    // e2e 基座隔离第三方 CDN → meting-js 不升级、.aplayer 永远不存在
    await page.evaluate(() => {
      document.getElementById('nav-music-hoverTips')!.click()
      document.getElementById('nav-music')!.click()
    })
    expect(runtimeConsoleErrors(pageErrors), '音乐球点击在播放器未就绪时报错').toEqual([])
  })

  test('搜索：换页后入口按钮与弹层关闭仍可用', async ({ page }) => {
    await gotoReady(page, '/')
    const ui = await detectSearchUi(page)
    test.skip(ui !== 'local', '当前 fixture 未启用 local_search')
    await clickAndWaitForClientRoute(page, internalLink(page))

    // 换页后的 Header 新按钮仍能打开搜索弹层
    await page.evaluate(() => {
      const btn = document.querySelector('#search-button > .search') as HTMLElement
      btn.click()
    })
    await expect(page.locator('#local-search .search-dialog')).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow), '打开搜索后 body 应锁定滚动').toBe('hidden')

    // 弹层关闭按钮（常驻弹层 / 重绑兜底）可用，并复位 body 滚动锁
    await page.evaluate(() => {
      const btn = document.querySelector('#local-search .search-close-button') as HTMLElement
      btn.click()
    })
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow), {
        message: '点击关闭按钮后 body 滚动锁未复位（关闭按钮失效）',
      })
      .toBe('')
  })
})
