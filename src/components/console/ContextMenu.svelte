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

  function close() {
    visible = false;
  }

  function randomPost() {
    close();
    if (postUrls.length === 0) return;
    const target = postUrls[Math.floor(Math.random() * postUrls.length)];
    window.location.href = target;
  }

  async function copySelectionOrUrl() {
    const content = selectedText || window.location.href;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // ignore clipboard errors
    }
    close();
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("anzhiyu-theme", next);
    close();
  }

  onMount(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey || window.innerWidth < 768) return;
      e.preventDefault();
      selectedText = window.getSelection()?.toString().trim() ?? "";
      const menuW = 190;
      const menuH = 260;
      x = Math.min(e.clientX, window.innerWidth - menuW - 12);
      y = Math.min(e.clientY, window.innerHeight - menuH - 12);
      visible = true;
    };

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close);
    };
  });
</script>

{#if visible}
  <div
    class="fixed z-[250] w-[184px] p-2 rounded-xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-xl text-sm text-[var(--anzhiyu-fontcolor)] select-none"
    style={`left: ${x}px; top: ${y}px;`}
    role="menu"
  >
    <div class="grid grid-cols-4 gap-1 pb-2 mb-1.5 border-b border-[var(--anzhiyu-card-border)]">
      <button type="button" class="h-8 rounded-lg hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" title="后退" onclick={() => history.back()}>←</button>
      <button type="button" class="h-8 rounded-lg hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" title="前进" onclick={() => history.forward()}>→</button>
      <button type="button" class="h-8 rounded-lg hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" title="刷新" onclick={() => location.reload()}>↻</button>
      <button type="button" class="h-8 rounded-lg hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" title="顶部" onclick={() => { close(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>↑</button>
    </div>

    <div class="flex flex-col gap-0.5">
      <button type="button" class="px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" onclick={copySelectionOrUrl}>
        {selectedText ? "📋 复制选中文本" : "🔗 复制页面链接"}
      </button>
      <button type="button" class="px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" onclick={randomPost}>
        🎲 随便逛逛
      </button>
      <button type="button" class="px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer" onclick={toggleTheme}>
        🌓 切换明暗主题
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer"
        onclick={() => {
          close();
          window.dispatchEvent(new CustomEvent("anzhiyu:open-console"));
        }}
      >
        🧭 打开中控台
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--anzhiyu-main)] hover:text-white cursor-pointer"
        onclick={() => {
          close();
          window.dispatchEvent(new CustomEvent("anzhiyu:open-search"));
        }}
      >
        🔍 站内搜索
      </button>
    </div>
  </div>
{/if}
