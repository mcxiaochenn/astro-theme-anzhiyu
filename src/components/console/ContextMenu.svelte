<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    postUrls?: string[];
  }

  let { postUrls = [] }: Props = $props();

  let visible = $state(false);
  let x = $state(0);
  let y = $state(0);
  let selectedText = $state("");
  let linkHref = $state("");
  let imgSrc = $state("");
  let onMusic = $state(false);
  let isDark = $state(false);
  let barrageOn = $state(true);
  let isTraditional = $state(false);

  function toast(message: string) {
    window.dispatchEvent(new CustomEvent("anzhiyu:toast", { detail: { message } }));
  }

  function close() {
    visible = false;
  }

  function syncStates() {
    isDark = document.documentElement.getAttribute("data-theme") === "dark";
    barrageOn = localStorage.getItem("anzhiyu-barrage") !== "false";
    isTraditional = localStorage.getItem("anzhiyu-translate") === "tw";
  }

  async function copyStr(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      toast("复制失败，请手动复制");
    }
    close();
  }

  function randomPost() {
    close();
    if (!postUrls.length) return;
    const url = postUrls[Math.floor(Math.random() * postUrls.length)];
    window.location.href = url;
  }

  function searchSelected() {
    const q = selectedText;
    close();
    window.dispatchEvent(new CustomEvent("anzhiyu:open-search", { detail: { query: q } }));
  }

  function quoteToComment() {
    const q = selectedText;
    close();
    const commentEl = document.getElementById("post-comment");
    if (commentEl) {
      commentEl.scrollIntoView({ behavior: "smooth" });
      const textarea = commentEl.querySelector("textarea") as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.value = `> ${q}\n\n` + textarea.value;
        textarea.focus();
      }
      toast("已将选中内容引用至评论区");
    } else {
      void copyStr(`> ${q}\n`, "当前页面无评论区，已为您复制引用格式");
    }
  }

  onMount(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey || e.shiftKey || window.innerWidth < 768) return;
      e.preventDefault();
      syncStates();

      selectedText = window.getSelection()?.toString().trim() ?? "";
      const target = e.target as HTMLElement | null;
      onMusic = Boolean(target?.closest("#nav-music, #anMusic-page"));
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      linkHref =
        anchor && anchor.href && !anchor.href.startsWith("javascript:") ? anchor.href : "";
      const img = target?.closest("img") as HTMLImageElement | null;
      imgSrc = img?.src ?? "";

      const menuW = 170;
      const menuH = selectedText || linkHref || imgSrc || onMusic ? 340 : 280;
      x = Math.min(e.clientX, window.innerWidth - menuW - 12);
      y = Math.min(e.clientY, window.innerHeight - menuH - 12);
      visible = true;
    };

    const onOpenCenter = () => {
      syncStates();
      selectedText = "";
      linkHref = "";
      imgSrc = "";
      onMusic = false;
      x = Math.round(window.innerWidth / 2 - 80);
      y = Math.round(window.innerHeight / 2 - 140);
      visible = true;
    };

    const onWinClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      close();
    };

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("anzhiyu:open-contextmenu", onOpenCenter);
    window.addEventListener("click", onWinClick);
    window.addEventListener("scroll", close, { passive: true });
    document.getElementById("rightMenu")?.setAttribute("data-rm-ready", "1");
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("anzhiyu:open-contextmenu", onOpenCenter);
      window.removeEventListener("click", onWinClick);
      window.removeEventListener("scroll", close);
    };
  });

  const hasPluginItems = $derived(Boolean(selectedText || linkHref || imgSrc || onMusic));
</script>

<!-- 完整保留 rightmenu.pug 的静态节点契约，通过 style.display 切换上下文模式 -->
<div
  id="rightMenu"
  style:display={visible ? "block" : "none"}
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="menu"
>
  <div class="rightMenu-group rightMenu-small">
    <div class="rightMenu-item" id="menu-backward" role="menuitem" tabindex="0" title="后退" onclick={() => { close(); history.back(); }} onkeydown={(e) => e.key === "Enter" && history.back()}>
      <i class="anzhiyufont anzhiyu-icon-arrow-left"></i>
    </div>
    <div class="rightMenu-item" id="menu-forward" role="menuitem" tabindex="0" title="前进" onclick={() => { close(); history.forward(); }} onkeydown={(e) => e.key === "Enter" && history.forward()}>
      <i class="anzhiyufont anzhiyu-icon-arrow-right"></i>
    </div>
    <div class="rightMenu-item" id="menu-refresh" role="menuitem" tabindex="0" title="刷新" onclick={() => location.reload()} onkeydown={(e) => e.key === "Enter" && location.reload()}>
      <i class="anzhiyufont anzhiyu-icon-arrow-rotate-right" style="font-size: 1rem;"></i>
    </div>
    <div class="rightMenu-item" id="menu-top" role="menuitem" tabindex="0" title="回到顶部" onclick={() => { close(); window.scrollTo({ top: 0, behavior: "smooth" }); }} onkeydown={(e) => e.key === "Enter" && window.scrollTo({ top: 0, behavior: "smooth" })}>
      <i class="anzhiyufont anzhiyu-icon-arrow-up"></i>
    </div>
  </div>

  <div class="rightMenu-group rightMenu-line rightMenuPlugin" style={`display: ${hasPluginItems ? "block" : "none"};`}>
    <div class="rightMenu-item" id="menu-copytext" role="menuitem" tabindex="0" style={`display: ${selectedText ? "flex" : "none"};`} onclick={() => void copyStr(selectedText, "复制成功，转载请保留原文链接！")} onkeydown={(e) => e.key === "Enter" && void copyStr(selectedText, "复制成功！")}>
      <i class="anzhiyufont anzhiyu-icon-copy"></i>
      <span>复制选中文本</span>
    </div>
    <div class="rightMenu-item" id="menu-commenttext" role="menuitem" tabindex="0" style={`display: ${selectedText ? "flex" : "none"};`} onclick={quoteToComment} onkeydown={(e) => e.key === "Enter" && quoteToComment()}>
      <i class="anzhiyufont anzhiyu-icon-comment-medical"></i>
      <span>引用到评论</span>
    </div>
    <div class="rightMenu-item" id="menu-search" role="menuitem" tabindex="0" style={`display: ${selectedText ? "flex" : "none"};`} onclick={searchSelected} onkeydown={(e) => e.key === "Enter" && searchSelected()}>
      <i class="anzhiyufont anzhiyu-icon-magnifying-glass"></i>
      <span>站内搜索</span>
    </div>

    <div class="rightMenu-item" id="menu-newwindow" role="menuitem" tabindex="0" style={`display: ${linkHref ? "flex" : "none"};`} onclick={() => { window.open(linkHref, "_blank", "noopener"); close(); }} onkeydown={(e) => e.key === "Enter" && window.open(linkHref, "_blank", "noopener")}>
      <i class="anzhiyufont anzhiyu-icon-window-restore"></i>
      <span>新窗口打开</span>
    </div>
    <div class="rightMenu-item" id="menu-copylink" role="menuitem" tabindex="0" style={`display: ${linkHref ? "flex" : "none"};`} onclick={() => void copyStr(linkHref, "已复制链接地址")} onkeydown={(e) => e.key === "Enter" && void copyStr(linkHref, "已复制链接地址")}>
      <i class="anzhiyufont anzhiyu-icon-link"></i>
      <span>复制链接地址</span>
    </div>

    <div class="rightMenu-item" id="menu-copyimg" role="menuitem" tabindex="0" style={`display: ${imgSrc ? "flex" : "none"};`} onclick={() => void copyStr(imgSrc, "已复制图片地址")} onkeydown={(e) => e.key === "Enter" && void copyStr(imgSrc, "已复制图片地址")}>
      <i class="anzhiyufont anzhiyu-icon-images"></i>
      <span>复制此图片</span>
    </div>
    <div class="rightMenu-item" id="menu-newwindowimg" role="menuitem" tabindex="0" style={`display: ${imgSrc ? "flex" : "none"};`} onclick={() => { window.open(imgSrc, "_blank", "noopener"); close(); }} onkeydown={(e) => e.key === "Enter" && window.open(imgSrc, "_blank", "noopener")}>
      <i class="anzhiyufont anzhiyu-icon-window-restore"></i>
      <span>新窗口打开图片</span>
    </div>

    <div class="rightMenu-item" id="menu-music-toggle" role="menuitem" tabindex="0" style={`display: ${onMusic ? "flex" : "none"};`} onclick={() => { window.dispatchEvent(new CustomEvent("anzhiyu:music-toggle")); close(); }} onkeydown={(e) => e.key === "Enter" && window.dispatchEvent(new CustomEvent("anzhiyu:music-toggle"))}>
      <i class="anzhiyufont anzhiyu-icon-play"></i>
      <span>播放音乐</span>
    </div>
  </div>

  <div class="rightMenu-group rightMenu-line rightMenuOther" style={`display: ${hasPluginItems ? "none" : "block"};`}>
    <a class="rightMenu-item menu-link" id="menu-randomPost" href="javascript:void(0);" onclick={randomPost}>
      <i class="anzhiyufont anzhiyu-icon-shuffle"></i>
      <span>随便逛逛</span>
    </a>
    <a class="rightMenu-item menu-link" href="/categories/" onclick={close}>
      <i class="anzhiyufont anzhiyu-icon-cube"></i>
      <span>博客分类</span>
    </a>
    <a class="rightMenu-item menu-link" href="/tags/" onclick={close}>
      <i class="anzhiyufont anzhiyu-icon-tags"></i>
      <span>文章标签</span>
    </a>
  </div>

  <div class="rightMenu-group rightMenu-line rightMenuOther">
    <a class="rightMenu-item" id="menu-copy" href="javascript:void(0);" onclick={() => void copyStr(window.location.href, "已复制本文地址")}>
      <i class="anzhiyufont anzhiyu-icon-copy"></i>
      <span>复制地址</span>
    </a>
    <a
      class="rightMenu-item"
      id="menu-commentBarrage"
      href="javascript:void(0);"
      onclick={() => {
        const next = !barrageOn;
        localStorage.setItem("anzhiyu-barrage", String(next));
        window.dispatchEvent(new CustomEvent("anzhiyu:barrage-change", { detail: { enable: next } }));
        toast(next ? "已显示热评" : "已关闭热评");
        close();
      }}
    >
      <i class="anzhiyufont anzhiyu-icon-message"></i>
      <span class="menu-commentBarrage-text">{barrageOn ? "关闭热评" : "显示热评"}</span>
    </a>
    <a
      class="rightMenu-item"
      id="menu-darkmode"
      href="javascript:void(0);"
      onclick={() => {
        window.dispatchEvent(new CustomEvent("anzhiyu:toggle-theme"));
        close();
      }}
    >
      <i class="anzhiyufont anzhiyu-icon-circle-half-stroke"></i>
      <span class="menu-darkmode-text">{isDark ? "浅色模式" : "深色模式"}</span>
    </a>
    <a
      class="rightMenu-item"
      id="menu-translate"
      href="javascript:void(0);"
      onclick={() => {
        window.dispatchEvent(new CustomEvent("anzhiyu:toggle-translate"));
        close();
      }}
    >
      <i class="anzhiyufont anzhiyu-icon-language"></i>
      <span>{isTraditional ? "转成简体" : "轉為繁體"}</span>
    </a>
  </div>
</div>

<div
  id="rightmenu-mask"
  style={`display: ${visible ? "block" : "none"};`}
  role="presentation"
  onclick={close}
></div>
