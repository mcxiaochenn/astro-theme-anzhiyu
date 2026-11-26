/**
 * chat/render.mjs — 上游 `layout/includes/third-party/chat/*.pug`（P5-1）。
 *
 * 映射：
 *   renderChatIndex  ← index.pug:1-8      （chatra > tidio > daovoice > crisp 优先级）
 *   renderChatra     ← chatra.pug:1-48
 *   renderTidio      ← tidio.pug:1-46
 *   renderDaovoice   ← daovoice.pug:1-40
 *   renderCrisp      ← crisp.pug:1-45
 *
 * 门控：`theme.<name>.enable`；四个后端都读顶层 `theme.chat_btn` / `theme.chat_hide_show`。
 * 上游挂载点：additional-js.pug:115（effect 之后、aplayer 之前）。
 */
import { esc, flag, inlineScript, obj, srcScript } from '../_kit.mjs'

function chatFlags(theme) {
  return {
    isChatBtn: theme.chat_btn === true,
    isChatHideShow: theme.chat_hide_show === true,
  }
}

/** chatra.pug:1-48 —— ChatraID / chatra.js。 */
export function renderChatra(theme) {
  if (!flag(theme.chatra, 'enable')) return ''
  const { isChatBtn, isChatHideShow } = chatFlags(theme)
  const id = esc(obj(theme.chatra).id ?? '')
  const body = `(() => {
    const isChatBtn = ${isChatBtn}
    const isChatHideShow = ${isChatHideShow}

    if (isChatBtn) {
      const close = () => {
        Chatra('minimizeWidget')
        Chatra('hide')
      }

      const open = () => {
        Chatra('openChat', true)
        Chatra('show')
      }

      window.ChatraSetup = {
        startHidden: true
      }

      window.chatBtnFn = () => {
        const isShow = document.getElementById('chatra').classList.contains('chatra--expanded')
        isShow ? close() : open()
      }
    } else if (isChatHideShow) {
      window.chatBtn = {
        hide: () => {
          Chatra('hide')
        },
        show: () => {
          Chatra('show')
        }
      }
    }

    (function(d, w, c) {
      w.ChatraID = '${id}'
      var s = d.createElement('script')
      w[c] = w[c] || function() {
          (w[c].q = w[c].q || []).push(arguments)
      }
      s.async = true
      s.src = 'https://call.chatra.io/chatra.js'
      if (d.head) d.head.appendChild(s)
    })(document, window, 'Chatra')
  })()`
  return inlineScript(body)
}

/** tidio.pug:1-46 —— 外链 script + tidioChatApi 按钮逻辑。 */
export function renderTidio(theme) {
  if (!flag(theme.tidio, 'enable')) return ''
  const { isChatBtn, isChatHideShow } = chatFlags(theme)
  const publicKey = esc(obj(theme.tidio).public_key ?? '')
  const external = srcScript(`//code.tidio.co/${publicKey}.js`, { async: true })
  const body = `(() => {
    const isChatBtn = ${isChatBtn}
    const isChatHideShow = ${isChatHideShow}

    if (isChatBtn) {
      let isShow = false
      const close = () => {
        window.tidioChatApi.hide()
        isShow = false
        document.body.style.position = 'relative';
        document.documentElement.style.overflow = 'auto'
      }

      const open = () => {
        window.tidioChatApi.open()
        window.tidioChatApi.show()
        isShow = true
      }

      const onTidioChatApiReady = () => {
        window.tidioChatApi.hide()
        window.tidioChatApi.on("close", close)
      }
      if (window.tidioChatApi) {
        window.tidioChatApi.on("ready", onTidioChatApiReady)
      } else {
        document.addEventListener("tidioChat-ready", onTidioChatApiReady)
      }

      window.chatBtnFn = () => {
        if (!window.tidioChatApi) return
        isShow ? close() : open()
      }
    } else if (isChatHideShow) {
      window.chatBtn = {
        hide: () => {
          window.tidioChatApi && window.tidioChatApi.hide()
        },
        show: () => {
          window.tidioChatApi && window.tidioChatApi.show()
        }
      }
    }
  })()`
  return external + inlineScript(body)
}

/** daovoice.pug:1-40 —— widget.daovoice.io/widget/<app_id>.js。 */
export function renderDaovoice(theme) {
  if (!flag(theme.daovoice, 'enable')) return ''
  const { isChatBtn, isChatHideShow } = chatFlags(theme)
  const appId = esc(obj(theme.daovoice).app_id ?? '')
  const body = `(() => {
    (function(i,s,o,g,r,a,m){i["DaoVoiceObject"]=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;a.charset="utf-8";m.parentNode.insertBefore(a,m)})(window,document,"script",('https:' == document.location.protocol ? 'https:' : 'http:') + "//widget.daovoice.io/widget/${appId}.js","daovoice")

    const isChatBtn = ${isChatBtn}
    const isChatHideShow = ${isChatHideShow}

    daovoice('init', {
      app_id: '${appId}',},{
      launcher: {
        disableLauncherIcon: isChatBtn
      },
    });
    daovoice('update');

    if (isChatBtn) {
      window.chatBtnFn = () => {
        const isShow = document.getElementById('daodream-messenger').classList.contains('daodream-messenger-active')
        isShow ? daovoice('hide') : daovoice('show')
      }
    } else if (isChatHideShow) {
      window.chatBtn = {
        hide: () => {
          daovoice('update', {},{
            launcher: {
              disableLauncherIcon: true
            }
          })
        },
        show: () => {
          daovoice('update', {}, {
            launcher: {
              disableLauncherIcon: false
            }
          })
        }
      }
    }
  })()`
  return inlineScript(body)
}

/** crisp.pug:1-45 —— CRISP_WEBSITE_ID / client.crisp.chat/l.js。 */
export function renderCrisp(theme) {
  if (!flag(theme.crisp, 'enable')) return ''
  const { isChatBtn, isChatHideShow } = chatFlags(theme)
  const websiteId = esc(obj(theme.crisp).website_id ?? '')
  const body = `(() => {
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = "${websiteId}";
    (function () {
      d = document;
      s = d.createElement("script");
      s.src = "https://client.crisp.chat/l.js";
      s.async = 1;
      d.getElementsByTagName("head")[0].appendChild(s);
    })();
    $crisp.push(["safe", true])

    const isChatBtn = ${isChatBtn}
    const isChatHideShow = ${isChatHideShow}

    if (isChatBtn) {
      const open = () => {
        $crisp.push(["do", "chat:show"])
        $crisp.push(["do", "chat:open"])
      }

      const close = () => {
        $crisp.push(["do", "chat:hide"])
      }

      close()
      $crisp.push(["on", "chat:closed", function() {
        close()
      }])

      window.chatBtnFn = () => {
        $crisp.is("chat:visible") ? close() : open()
      }
    } else if (isChatHideShow) {
      window.chatBtn = {
        hide: () => {
          $crisp.push(["do", "chat:hide"])
        },
        show: () => {
          $crisp.push(["do", "chat:show"])
        }
      }
    }
  })()`
  return inlineScript(body)
}

const BACKENDS = {
  chatra: renderChatra,
  tidio: renderTidio,
  daovoice: renderDaovoice,
  crisp: renderCrisp,
}

/** index.pug:1-8 —— else-if 链：只输出第一个启用的后端。 */
export function renderChatIndex(theme) {
  for (const name of Object.keys(BACKENDS)) {
    if (flag(theme[name], 'enable')) return BACKENDS[name](theme)
  }
  return ''
}

export const chatRenderers = {
  index: renderChatIndex,
  ...BACKENDS,
}
