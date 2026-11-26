# 换页生命周期修复（懒加载换页后「音乐岛」等附属功能失效/异常）

日期：2026-11-26。报告：「页面组件懒加载有问题……懒加载切换页面后音乐岛这类附属功能失效或异常，
查找是否还有别的同类问题也一并修复」。根因是 **ClientRouter 换页生命周期下的绑定管理**，
不是懒加载（vanilla-lazyload）本身。共 3 类根因、16 个修复点，全部带回归用例
（`tests/e2e/aux-lifecycle.spec.ts`，10 条）。

## 取证方法

一次性探针（`EventTarget.addEventListener/removeEventListener` 净计数 + 行为探测 +
`pjax:success` 计数）跑「首屏 → 换页 → 回首页 → /music/ 往返」，实测：

| 指标 | 首屏 | 换页后 | 结论 |
|---|---|---|---|
| `#rightside` click 委托 | 1 | 仍 1（挂在已丢弃节点上） | 换页后右侧按钮栏全灭（齿轮实测 dead） |
| `#menu-mask` click | 1 | 仍 1 | 换页后点遮罩关不掉侧栏（实测 closedAfterMask=false） |
| `#nav-music` click | 1 | 2→3→…逐页 +1 | refreshFn 在常驻节点上重复绑定 |
| `document` visibilitychange | 1 | 2→3→…逐页 +1 | 同上，标题处理器叠加 |
| `pjax:success` 派发数 | 0 | 0 | shim 从未派发 → people.js 永不重初始化 |
| `/music/` 等待计时器 | 1 | 2 且永不清理 | 离开音乐页后 interval 永久轮询 |

## 根因 A：一次性绑定挂在「换页即被替换」的节点上 → 换页后死亡

Astro 的 swap 是整 `<body>` 替换（`swapBodyElement` 里 `oldElement.replaceWith(newElement)`），
只有 `transition:persist` 的 6 个节点（web_bg / an_music_bg / nav-music / rightMenu /
rightmenu-mask / popup-window）存活。上游 pjax 只换 `#body-wrap`/`.js-pjax`，rightside /
sidebar / menu-mask / body 都常驻 —— 主题的一次性绑定在上游成立、在 ClientRouter 下全部失效。

修复（统一改到 `refreshFn` 重绑 + `anzhiyu.addEventListenerPjax` 换页解绑）：

1. `#rightside` 事件委托（main.js）——整个右侧按钮栏（返回顶部/深色/阅读模式/隐藏侧栏/目录）
2. `#menu-mask` 点击关侧栏（main.js，原在 unRefreshFn）
3. 侧栏 `.darkmode_switchbutton`（原在 unRefreshFn）
4. `#sidebar-menus .menus_items` 子菜单展开 `clickFnOfSubMenu`（原在 unRefreshFn）
5. `document.body` copy 版权监听 `addCopyright`（body 元素本身每次换页都是新的）
6. local-search：`#search-mask` 闭包缓存旧节点（换页后遮罩永远显示不出来）→ 现查；
   `#local-search .search-close-button`/遮罩点击 → 幂等重绑
7. algolia.js 同族同修（弹层节点现查 + 关闭按钮幂等重绑）
8. 404 页 `#toggle-menu`/`#page-name` 缺节点抛 TypeError 打断整个 refreshFn → 空值保护
   （404 页附属功能此前从 openMobileMenu 起全部失效）
9. `owoBig` 的 MutationObserver 换页后挂在被丢弃的 `#post-comment` 上 → pjax:send 解绑

搜索弹层另做**架构对齐**：上游 pjax 里 third-party/search 整棵在换页区域**之外**（常驻），
本地给 `#local-search` / `#algolia-search` / `.docsearch-wrap` 根节点补
`data-astro-transition-persist="search_overlay"`（diff-html N7 规则丢弃 `data-astro-*`，
不影响基线 DOM 比对）。这同时修掉 Algolia instantsearch 持有的容器引用换页即失效的问题。

## 根因 B：refreshFn 重复绑定 → 叠加/泄漏/键盘劫持

10. `addEventListenerConsoleMusicList` 从 refreshFn 移到 unRefreshFn（`#nav-music` 是 persist
    常驻节点，只绑一次）；并补 `.aplayer-list` 空值保护（播放器未就绪时点击音乐球抛 TypeError）
11. `changeDocumentTitle` 的 `document` visibilitychange → `addEventListenerPjax`（逐页解绑）
12. `/music/` 页 `addEventListenerMusic`：
    - `document` keydown（Space/方向键全局劫持 + `preventDefault` + 闭包指着已销毁播放器）
      → `addEventListenerPjax`，离开音乐页即解绑；并加「一页只绑一次」保护
    - `#menu-mask` 点击处理器同修
    - `changeMusicBg(false)` 的 `setInterval` 泄漏 → 单例计时器 + 离开音乐页（`#anMusic-page`
      不在 DOM）即清理
    - `changeMusicBg(true)` 换页后残留事件打到不存在的 `.aplayer-pic` 抛 TypeError → 空值保护
13. `musicToggle` / `musicBindEvent` 播放器未就绪的 TypeError → 空值保护
14. `getCustomPlayList` `#anMusic-page-meting` 缺节点保护
15. `setInputFocusListener` 的过滤条件 `id !== A || id !== B` 恒真 → 全部输入框被滤掉、
    `anzhiyu_intype` 永远 false（打字时 Shift 快捷键误触发）→ `&&` 并返回保留项

## 根因 C：shim 契约缺口

16. runtime.ts（`head/runtime.ts`）：
    - **`pjax:*` 事件不冒泡**：上游 `fire()` 用 `initEvent(name, true, true)`，事件冒泡到
      window；本地 `new CustomEvent(name)` 不冒泡 → local-search/algolia/docsearch 的
      `window.addEventListener('pjax:complete')`（换页重绑入口）**从来没被通知过**。
      → `new CustomEvent(name, { bubbles: true })`。这是「换页后搜索入口失效」的直接根因。
    - **缺 `pjax:success`**：上游成功导航后先 `pjax:success` 再 `pjax:complete`；
      people.js 的重初始化挂在 `pjax:success` 上（pjax:send 只做清理）→ 首页行人画布
      「首页 → 别处 → 首页」后永久死掉。→ page-load 时补发 `pjax:success`。
    - **`pjax.refresh` 缺位**：local-search/algolia 结果渲染调用 `window.pjax.refresh(...)`，
      shim 只有 `loadUrl` → 每次搜索结果渲染后 TypeError。→ 补 no-op（ClientRouter 的全局
      链接委托已覆盖其职责）。
    - **Meting2 换页搬移保护**（音乐岛本体）：`transition:persist` 的搬移在无
      `Element.moveBefore` 的内核上走「摘下→挂回」，Meting2@1.0.1 的
      `disconnectedCallback(){ this.lock || this.aplayer.destroy() }` 与
      `connectedCallback(){ this._init(); this._parse() }` 会把播放器销毁再重建
      （换页即重启/失声）。→ 搬移窗口（before-swap→after-swap）内对所有 `meting-js`
      设实例 `lock` + 空实现遮蔽 `_init`/`_parse`（实例属性遮蔽原型方法），窗口结束后恢复；
      随旧 body 丢弃的实例（/music/ 页播放器）延后显式销毁（补空值保护，顺带消掉半初始化
      离开时 `this.aplayer.destroy()` 的 TypeError）。
      **实测教训**：不能补 `prototype.disconnectedCallback` —— custom element 的生命周期
      回调在 `customElements.define()` 时已快照进 definition，事后改原型不生效。

## 同族顺手修（.js-pjax 重执行语义）

上游 `.js-pjax` 内脚本每次 pjax 换页重执行（本地约定用 `data-pjax` 表达，见
AdditionalJs.astro 头注），此前只给 comment_barrage 打了标。补齐：comments 5 个后端初始化、
card-post-count 4 个计数脚本（自身就写 `window.pjax ? run() : load`）、mathjax/katex/mermaid
加载器、副标题打字机。这些脚本文本逐页相同，Astro 默认只执行一次 → 换页后评论区/侧栏计数/
公式/副标题全部不初始化。本站当前配置这些功能全关（`comments.use` 空、subtitle/math 关），
故默认构建 **DOM 零变化**，CI 的 diff-html 门禁不受影响；启用对应功能的站点由此恢复上游语义。

## 验收

- `tests/e2e/aux-lifecycle.spec.ts` 新增 10 条（覆盖 A/B/C 三类 + 音乐岛两条）：
  默认构建 9 过 1 skip（搜索，配置未启用）；demo 配置构建（local_search/rightClickMenu/
  shortcutKey/greetingBox 全开 + search.xml）16/16 全过（含搜索打开→输入→出结果、
  右键菜单 4 条、生命周期 10 条）。
- 全量 e2e：40 passed / 10 skipped（skip 均为配置门控），0 failed。
- `tests/e2e/right-menu.spec.ts` 两条**从未执行过**的用例（rightClickMenu 默认关）断言写歪：
  「基础组与扩展组互斥」误用了 `#menu-top`（`.rightMenu-small` 上游任何模式都常显）和
  `#menu-copytext`（扩展组，仅在有选中文本时出现）当样本，且「右击空白」随手点 (4,4) 会
  命中上游的图片检测（`currentSrc`/`querySelector('img')`/`closest('img')`，与上游源码
  逐字一致）而进入图片扩展模式。按用例章程（「断言上游 right_click_menu.js 的可观察行为」）
  修正样本（`#menu-randomPost`）与场景（注入纯净空白目标）。**产品代码未动**——右键菜单
  行为与上游一致。
- 搜索弹层「输入框不可见」：`.search-wrap` 要等 `search.xml` 加载成功才显示；`search.xml`
  由部署脚本（deploy-demo-pages.mjs）在构建后生成，裸 `astro build` 没有它 → 弹层停在
  「数据库加载中」。环境差异不是 JS bug；补测试用 search.xml 后全链路通过。

## 已知边界

- `window.addEventListener('load', …)` 型初始化（local-search/algolia 的外层）仍只在整页
  加载跑一次，其内部重绑靠 `pjax:complete` —— 与上游一致，不改。
- instantpage 逐链接 hover 预取绑定随旧链接一起被换掉（新链接在下次扫描前无预取），
  与上游 pjax 行为一致（上游也是 load 时一次性扫描），未改。
- comments/math/subtitle 的 data-pjax 重执行在本站配置下无覆盖路径（功能未启用），
  按上游语义接线，未在真实后端下联调。
