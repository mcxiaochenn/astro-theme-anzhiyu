/**
 * inject-head-js.ts — 上游 `scripts/helpers/inject_head_js.js` 的构建器（P4-1）。
 *
 * 这是 head 里 GLOBAL_CONFIG / config-diff / noscript 之后的第 4 段内联脚本，
 * 负责在首屏 paint 前把主题运行时（saveToLocal / getScript / getCSS /
 * activateDarkMode / activateLightMode / aside-status / apple 检测）装到 window。
 *
 * 为什么必须复刻而不是「自己写个精简版」：
 *   - `src/js/main.js` / `src/js/tw_cn.js` 直接读全局 `saveToLocal`；
 *   - `activateDarkMode` / `activateLightMode` 由 main.js 的暗色切换复用；
 *   - `getScript` / `getCSS` 是 `additional-js.pug` 里 peoplecanvas 等片段的依赖；
 *   - `.apple` / `.hide-aside` 的初始 class 必须在 CSS 生效前挂到 `<html>` 上。
 *
 * 模板与上游逐行一致（P2-2 的 themeBootstrap 是过渡实现，本文件接管后删除）。
 */
import type { SiteConfig } from '../../layouts/site.ts'
import type { ThemeConfig } from '../../config/schema.ts'

function obj(section: unknown): Record<string, unknown> {
  return section && typeof section === 'object' ? (section as Record<string, unknown>) : {}
}
function flag(section: unknown, key: string, fallback = false): boolean {
  const value = obj(section)[key]
  return typeof value === 'boolean' ? value : fallback
}
function str(section: unknown, key: string, fallback = ''): string {
  const value = obj(section)[key]
  return typeof value === 'string' ? value : fallback
}

export function buildInjectHeadJs(theme: ThemeConfig, site: SiteConfig): string {
  const darkmode = obj(theme.darkmode)
  const aside = obj(theme.aside)
  const themeColor = obj(theme.theme_color)
  const themeColorLight =
    (themeColor.enable && (themeColor.meta_theme_color_light as string)) || '#ffffff'
  const themeColorDark =
    (themeColor.enable && (themeColor.meta_theme_color_dark as string)) || '#0d0d0d'

  const start = (darkmode.start as number) || 6
  const end = (darkmode.end as number) || 18

  const createLocalStore = () => `
      win.saveToLocal = {
        set: (key, value, ttl) => {
          if (ttl === 0) return
          const now = Date.now()
          const expiry = now + ttl * 86400000
          const item = {
            value,
            expiry
          }
          localStorage.setItem(key, JSON.stringify(item))
        },
      
        get: key => {
          const itemStr = localStorage.getItem(key)
      
          if (!itemStr) {
            return undefined
          }
          const item = JSON.parse(itemStr)
          const now = Date.now()
      
          if (now > item.expiry) {
            localStorage.removeItem(key)
            return undefined
          }
          return item.value
        }
      }
    `

  const createGetScript = () => `
      win.getScript = (url, attr = {}) => new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        script.onerror = reject
        script.onload = script.onreadystatechange = function() {
          const loadState = this.readyState
          if (loadState && loadState !== 'loaded' && loadState !== 'complete') return
          script.onload = script.onreadystatechange = null
          resolve()
        }

        Object.keys(attr).forEach(key => {
          script.setAttribute(key, attr[key])
        })

        document.head.appendChild(script)
      })
    `

  const createGetCSS = () => `
      win.getCSS = (url, id = false) => new Promise((resolve, reject) => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        if (id) link.id = id
        link.onerror = reject
        link.onload = link.onreadystatechange = function() {
          const loadState = this.readyState
          if (loadState && loadState !== 'loaded' && loadState !== 'complete') return
          link.onload = link.onreadystatechange = null
          resolve()
        }
        document.head.appendChild(link)
      })
    `

  const createDarkmodeJs = () => {
    if (!flag(darkmode, 'enable')) return ''

    let darkmodeJs = `
      win.activateDarkMode = () => {
        document.documentElement.setAttribute('data-theme', 'dark')
        if (document.querySelector('meta[name="theme-color"]') !== null) {
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '${themeColorDark}')
        }
      }
      win.activateLightMode = () => {
        document.documentElement.setAttribute('data-theme', 'light')
        if (document.querySelector('meta[name="theme-color"]') !== null) {
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '${themeColorLight}')
        }
      }
      const t = saveToLocal.get('theme')
    `

    const autoChangeMode = darkmode.autoChangeMode

    if (autoChangeMode === 1) {
      darkmodeJs += `
          const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
          const isLightMode = window.matchMedia('(prefers-color-scheme: light)').matches
          const isNotSpecified = window.matchMedia('(prefers-color-scheme: no-preference)').matches
          const hasNoSupport = !isDarkMode && !isLightMode && !isNotSpecified

          if (t === undefined) {
            if (isLightMode) activateLightMode()
            else if (isDarkMode) activateDarkMode()
            else if (isNotSpecified || hasNoSupport) {
              const now = new Date()
              const hour = now.getHours()
              const isNight = hour <= ${start} || hour >= ${end}
              isNight ? activateDarkMode() : activateLightMode()
            }
            window.matchMedia('(prefers-color-scheme: dark)').addListener(e => {
              if (saveToLocal.get('theme') === undefined) {
                e.matches ? activateDarkMode() : activateLightMode()
              }
            })
          } else if (t === 'light') activateLightMode()
          else activateDarkMode()
        `
    } else if (autoChangeMode === 2) {
      darkmodeJs += `
          const now = new Date()
          const hour = now.getHours()
          const isNight = hour <= ${start} || hour >= ${end}
          if (t === undefined) isNight ? activateDarkMode() : activateLightMode()
          else if (t === 'light') activateLightMode()
          else activateDarkMode()
        `
    } else {
      darkmodeJs += `
        if (t === 'dark') activateDarkMode()
        else if (t === 'light') activateLightMode()
      `
    }

    return darkmodeJs
  }

  const createAsideStatus = () => {
    if (!flag(aside, 'enable') || !flag(aside, 'button')) return ''

    return `
      const asideStatus = saveToLocal.get('aside-status')
      if (asideStatus !== undefined) {
        if (asideStatus === 'hide') {
          document.documentElement.classList.add('hide-aside')
        } else {
          document.documentElement.classList.remove('hide-aside')
        }
      }
    `
  }

  const createDetectApple = () => `
      const detectApple = () => {
        if(/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)){
          document.documentElement.classList.add('apple')
        }
      }
      detectApple()
    `

  // `site` 只用于保持签名一致（上游这边没用到 config）；显式消费避免 lint 噪声。
  void site

  return `(win=>{${
    createLocalStore() +
    createGetScript() +
    createGetCSS() +
    createDarkmodeJs() +
    createAsideStatus() +
    createDetectApple()
  }})(window)`
}
