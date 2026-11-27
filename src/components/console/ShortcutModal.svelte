<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    postUrls?: string[];
  }

  let { postUrls = [] }: Props = $props();
  let show = $state(false);

  const shortcutItems = [
    { key: "K", content: "关闭快捷键功能" },
    { key: "A", content: "打开/关闭中控台" },
    { key: "M", content: "播放/暂停音乐" },
    { key: "D", content: "深色/浅色显示模式" },
    { key: "S", content: "站内搜索" },
    { key: "R", content: "随机访问文章" },
    { key: "H", content: "返回首页" },
    { key: "F", content: "友链鱼塘" },
    { key: "L", content: "友链页面" },
    { key: "P", content: "关于本站" },
    { key: "I", content: "快捷右键菜单" },
  ];

  onMount(() => {
    let shiftTimer: number | undefined;

    const isInputTarget = (el: EventTarget | null) => {
      const tag = (el as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputTarget(e.target)) return;
      const enabled = localStorage.getItem("anzhiyu-keyboard") !== "false";

      if (e.key === "Shift" && !e.repeat && enabled) {
        window.clearTimeout(shiftTimer);
        shiftTimer = window.setTimeout(() => {
          show = true;
        }, 200);
        return;
      }

      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const upper = e.key.toUpperCase();
      if (!enabled && upper !== "K") return;

      switch (upper) {
        case "K":
          e.preventDefault();
          show = false;
          const next = !enabled;
          localStorage.setItem("anzhiyu-keyboard", String(next));
          window.dispatchEvent(
            new CustomEvent("anzhiyu:toast", { detail: { message: next ? "已开启快捷键" : "已关闭快捷键" } }),
          );
          break;
        case "A":
          e.preventDefault();
          show = false;
          window.dispatchEvent(new CustomEvent("anzhiyu:toggle-console"));
          break;
        case "M":
          e.preventDefault();
          show = false;
          window.dispatchEvent(new CustomEvent("anzhiyu:music-toggle"));
          break;
        case "D":
          e.preventDefault();
          show = false;
          window.dispatchEvent(new CustomEvent("anzhiyu:toggle-theme"));
          break;
        case "S":
          e.preventDefault();
          show = false;
          window.dispatchEvent(new CustomEvent("anzhiyu:open-search"));
          break;
        case "R":
          e.preventDefault();
          show = false;
          if (postUrls.length > 0) {
            window.location.href = postUrls[Math.floor(Math.random() * postUrls.length)];
          }
          break;
        case "H":
          e.preventDefault();
          show = false;
          window.location.href = "/";
          break;
        case "F":
          e.preventDefault();
          show = false;
          window.location.href = "/fcircle/";
          break;
        case "L":
          e.preventDefault();
          show = false;
          window.location.href = "/link/";
          break;
        case "P":
          e.preventDefault();
          show = false;
          window.location.href = "/about/";
          break;
        case "I":
          e.preventDefault();
          show = false;
          window.dispatchEvent(new CustomEvent("anzhiyu:open-contextmenu"));
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        window.clearTimeout(shiftTimer);
        show = false;
      }
    };

    const onBlur = () => {
      window.clearTimeout(shiftTimer);
      show = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearTimeout(shiftTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  });
</script>

<!-- 保持上游原样类名拼写：keyboardTitle / keybordList / keybordItem -->
<div id="keyboard-tips" class:show={show}>
  <div class="keyboardTitle">博客快捷键</div>
  <div class="keybordList">
    {#each shortcutItems as item}
      <div class="keybordItem">
        <div class="keyGroup">
          <div class="key">{`shift ${item.key}`}</div>
        </div>
        <div class="keyContent">
          <div class="content">{item.content}</div>
        </div>
      </div>
    {/each}
  </div>
</div>
