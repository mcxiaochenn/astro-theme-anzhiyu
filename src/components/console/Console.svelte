<script lang="ts">
  import { onMount } from "svelte";

  interface TagItem {
    name: string;
    count: number;
  }

  interface ArchiveItem {
    label: string;
    year: number;
    month: number;
    count: number;
  }

  interface Props {
    tags?: TagItem[];
    archives?: ArchiveItem[];
    postCount?: number;
    categoryCount?: number;
  }

  let {
    tags = [],
    archives = [],
    postCount = 0,
    categoryCount = 0,
  }: Props = $props();

  let open = $state(false);
  let isDark = $state(false);
  let hideAside = $state(false);
  let barrageOn = $state(true);
  let musicPlaying = $state(false);
  let keyboardOn = $state(true);

  function syncStates() {
    isDark = document.documentElement.getAttribute("data-theme") === "dark";
    hideAside = document.documentElement.classList.contains("hide-aside") || localStorage.getItem("anzhiyu-hide-aside") === "true";
    barrageOn = localStorage.getItem("anzhiyu-barrage") !== "false";
    keyboardOn = localStorage.getItem("anzhiyu-keyboard") !== "false";
    musicPlaying = Boolean(document.getElementById("nav-music")?.classList.contains("playing"));
  }

  function setOpen(next: boolean) {
    open = next;
    const cb = document.getElementById("center-console") as HTMLInputElement | null;
    if (cb) cb.checked = next;
    if (next) syncStates();
  }

  function toggleDark() {
    window.dispatchEvent(new CustomEvent("anzhiyu:toggle-theme"));
    syncStates();
  }

  function toggleAside() {
    window.dispatchEvent(new CustomEvent("anzhiyu:toggle-aside"));
    syncStates();
  }

  function toggleBarrage() {
    barrageOn = !barrageOn;
    localStorage.setItem("anzhiyu-barrage", String(barrageOn));
    window.dispatchEvent(new CustomEvent("anzhiyu:barrage-change", { detail: { enable: barrageOn } }));
    window.dispatchEvent(
      new CustomEvent("anzhiyu:toast", { detail: { message: barrageOn ? "已开启热评弹幕" : "已关闭热评弹幕" } }),
    );
  }

  function toggleMusic() {
    window.dispatchEvent(new CustomEvent("anzhiyu:music-toggle"));
    setTimeout(syncStates, 80);
  }

  function toggleKeyboard() {
    keyboardOn = !keyboardOn;
    localStorage.setItem("anzhiyu-keyboard", String(keyboardOn));
    window.dispatchEvent(
      new CustomEvent("anzhiyu:toast", { detail: { message: keyboardOn ? "已开启快捷键功能" : "已关闭快捷键功能" } }),
    );
  }

  onMount(() => {
    syncStates();

    const bindCheckbox = () => {
      const cb = document.getElementById("center-console") as HTMLInputElement | null;
      if (!cb) return;
      if (cb.checked !== open) setOpen(cb.checked);
      if (cb.dataset.consoleBound === "1") return;
      cb.dataset.consoleBound = "1";
      cb.addEventListener("change", () => setOpen(cb.checked));
    };
    bindCheckbox();

    const onOpenEvt = () => setOpen(true);
    const onToggleEvt = () => setOpen(!open);
    const onCloseEvt = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };

    document.addEventListener("astro:page-load", () => {
      setOpen(false);
      bindCheckbox();
    });
    window.addEventListener("anzhiyu:open-console", onOpenEvt);
    window.addEventListener("anzhiyu:toggle-console", onToggleEvt);
    window.addEventListener("anzhiyu:close-console", onCloseEvt);
    window.addEventListener("anzhiyu:theme-change", syncStates);
    window.addEventListener("anzhiyu:aside-change", syncStates);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("anzhiyu:open-console", onOpenEvt);
      window.removeEventListener("anzhiyu:toggle-console", onToggleEvt);
      window.removeEventListener("anzhiyu:close-console", onCloseEvt);
      window.removeEventListener("anzhiyu:theme-change", syncStates);
      window.removeEventListener("anzhiyu:aside-change", syncStates);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<div id="console" class:show={open}>
  <div class="close-btn" role="button" tabindex="0" title="关闭中控台" onclick={() => setOpen(false)} onkeydown={(e) => e.key === "Enter" && setOpen(false)}>
    <i class="anzhiyufont anzhiyu-icon-xmark"></i>
  </div>

  <div class="console-card-group">
    <div class="console-card-group-left">
      <div class="console-card" id="card-newest-comments">
        <div class="card-content">
          <div class="author-content-item-tips">站点概览</div>
          <span class="author-content-item-title">捷径与内容导览</span>
        </div>
        <div class="aside-list">
          <a class="aside-list-item" href="/archives/" onclick={() => setOpen(false)}>
            <div class="content">
              <div class="comment">全站共收录 {postCount} 篇文章 · {categoryCount} 个分类</div>
              <div class="name"><span>进入文章隧道 →</span></div>
            </div>
          </a>
          <a class="aside-list-item" href="/essay/" onclick={() => setOpen(false)}>
            <div class="content">
              <div class="comment">记录日常灵感与折腾动态</div>
              <div class="name"><span>查看即刻短文 →</span></div>
            </div>
          </a>
          <a class="aside-list-item" href="/link/" onclick={() => setOpen(false)}>
            <div class="content">
              <div class="comment">探索更多有趣的独立博客与伙伴</div>
              <div class="name"><span>前往友人帐 →</span></div>
            </div>
          </a>
          <a class="aside-list-item" href="/about/" onclick={() => setOpen(false)}>
            <div class="content">
              <div class="comment">了解博主的技能树、装备与故事</div>
              <div class="name"><span>关于本人 →</span></div>
            </div>
          </a>
        </div>
      </div>
    </div>

    <div class="console-card-group-right">
      <div class="console-card tags">
        <div class="card-content">
          <div class="author-content-item-tips">兴趣点</div>
          <span class="author-content-item-title">寻找你感兴趣的领域</span>
          <div class="card-tag-cloud">
            {#each tags.slice(0, 36) as tag}
              <a href={`/tags/${encodeURIComponent(tag.name)}/`} onclick={() => setOpen(false)}>
                {tag.name}<sup>{tag.count}</sup>
              </a>
            {/each}
          </div>
        </div>
      </div>

      <div class="console-card history">
        <div class="item-headline">
          <i class="anzhiyufont anzhiyu-icon-box-archiv"></i>
          <span>文章归档</span>
        </div>
        <ul class="card-archive-list">
          {#each archives as item}
            <li class="card-archive-list-item">
              <a class="card-archive-list-link" href="/archives/" onclick={() => setOpen(false)}>
                <span class="card-archive-list-date">{item.label}</span>
                <div class="card-archive-list-count-group">
                  <span class="card-archive-list-count">{item.count}</span>
                  <span class="card-archive-list-count-unit">篇</span>
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>

  <div class="button-group">
    <div class="console-btn-item" class:on={isDark} title="昼夜颜色切换">
      <a class="darkmode_switchbutton" href="javascript:void(0);" aria-label="昼夜颜色切换" onclick={toggleDark}>
        <i class="anzhiyufont anzhiyu-icon-moon"></i>
      </a>
    </div>
    <div class="console-btn-item" class:on={hideAside} id="consoleHideAside" title="单栏与双栏侧边栏显隐切换">
      <a class="asideSwitch" href="javascript:void(0);" aria-label="侧边栏显隐切换" onclick={toggleAside}>
        <i class="anzhiyufont anzhiyu-icon-arrows-left-right"></i>
      </a>
    </div>
    <div class="console-btn-item" class:on={barrageOn} id="consoleCommentBarrage" title="热评弹幕开关">
      <a class="commentBarrage" href="javascript:void(0);" aria-label="热评弹幕开关" onclick={toggleBarrage}>
        <i class="anzhiyufont anzhiyu-icon-message"></i>
      </a>
    </div>
    <div class="console-btn-item" class:on={musicPlaying} id="consoleMusic" title="音乐开关">
      <a class="music-switch" href="javascript:void(0);" aria-label="音乐开关" onclick={toggleMusic}>
        <i class="anzhiyufont anzhiyu-icon-music"></i>
      </a>
    </div>
    <div class="console-btn-item" class:on={keyboardOn} id="consoleKeyboard" title="快捷键开关">
      <a class="keyboard-switch" href="javascript:void(0);" aria-label="快捷键开关" onclick={toggleKeyboard}>
        <i class="anzhiyufont anzhiyu-icon-keyboard"></i>
      </a>
    </div>
  </div>

  <div class="console-mask" role="presentation" onclick={() => setOpen(false)}></div>
</div>
