<script lang="ts">
  import { onMount } from "svelte";

  interface TagItem {
    name: string;
    count: number;
  }

  interface Props {
    tags?: TagItem[];
    postCount?: number;
    categoryCount?: number;
    siteTitle?: string;
  }

  let { tags = [], postCount = 0, categoryCount = 0, siteTitle = "AnZhiYu" }: Props = $props();

  let open = $state(false);
  let isDark = $state(false);

  function syncTheme() {
    isDark = document.documentElement.getAttribute("data-theme") === "dark";
  }

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("anzhiyu-theme", next);
    isDark = next === "dark";
    window.dispatchEvent(new CustomEvent("anzhiyu:theme-change", { detail: { theme: next } }));
  }

  onMount(() => {
    syncTheme();
    const onOpen = () => {
      syncTheme();
      open = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) open = false;
    };
    window.addEventListener("anzhiyu:open-console", onOpen);
    window.addEventListener("anzhiyu:theme-change", syncTheme);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("anzhiyu:open-console", onOpen);
      window.removeEventListener("anzhiyu:theme-change", syncTheme);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-label="全局中控台"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false;
    }}
  >
    <div class="w-full max-w-4xl rounded-2xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-2xl p-6 text-[var(--anzhiyu-fontcolor)]">
      <div class="flex items-center justify-between pb-4 mb-5 border-b border-[var(--anzhiyu-card-border)]">
        <div class="flex items-center gap-3">
          <span class="text-lg font-extrabold">{siteTitle} · 中控台</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-[var(--anzhiyu-secondbg)] text-[var(--anzhiyu-secondtext)]">
            {postCount} 篇文章 · {categoryCount} 个分类
          </span>
        </div>
        <button
          type="button"
          class="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--anzhiyu-secondbg)] hover:bg-[var(--anzhiyu-main)] hover:text-white transition-colors cursor-pointer"
          onclick={() => (open = false)}
          aria-label="关闭中控台"
        >
          ✕
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          type="button"
          class="p-4 rounded-xl border border-[var(--anzhiyu-card-border)] bg-[var(--anzhiyu-secondbg)] hover:border-[var(--anzhiyu-main)] text-left transition-all cursor-pointer"
          onclick={toggleTheme}
        >
          <div class="text-xs text-[var(--anzhiyu-secondtext)] mb-1">外观模式</div>
          <div class="font-bold text-base">{isDark ? "🌙 深色模式" : "☀️ 浅色模式"}</div>
        </button>

        <button
          type="button"
          class="p-4 rounded-xl border border-[var(--anzhiyu-card-border)] bg-[var(--anzhiyu-secondbg)] hover:border-[var(--anzhiyu-main)] text-left transition-all cursor-pointer"
          onclick={() => {
            open = false;
            window.dispatchEvent(new CustomEvent("anzhiyu:open-shortcuts"));
          }}
        >
          <div class="text-xs text-[var(--anzhiyu-secondtext)] mb-1">键盘效率</div>
          <div class="font-bold text-base">⌨️ 查看快捷键 (Shift + ?)</div>
        </button>

        <button
          type="button"
          class="p-4 rounded-xl border border-[var(--anzhiyu-card-border)] bg-[var(--anzhiyu-secondbg)] hover:border-[var(--anzhiyu-main)] text-left transition-all cursor-pointer"
          onclick={() => {
            open = false;
            window.dispatchEvent(new CustomEvent("anzhiyu:open-search"));
          }}
        >
          <div class="text-xs text-[var(--anzhiyu-secondtext)] mb-1">站内检索</div>
          <div class="font-bold text-base">🔍 全局搜索 (Ctrl + K)</div>
        </button>
      </div>

      {#if tags.length > 0}
        <div>
          <div class="text-sm font-bold mb-3 text-[var(--anzhiyu-secondtext)]">热门标签</div>
          <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {#each tags.slice(0, 30) as tag}
              <a
                href={`/tags/${encodeURIComponent(tag.name)}/`}
                class="px-3 py-1 rounded-lg text-sm bg-[var(--anzhiyu-secondbg)] hover:bg-[var(--anzhiyu-main)] hover:text-white transition-colors"
                onclick={() => (open = false)}
              >
                {tag.name} <span class="opacity-60 text-xs">{tag.count}</span>
              </a>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
