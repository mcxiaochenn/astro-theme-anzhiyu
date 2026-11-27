<script lang="ts">
  import { onMount } from "svelte";

  let open = $state(false);

  const shortcuts = [
    { keys: "Ctrl + K / ⌘ + K", desc: "打开站内全文搜索" },
    { keys: "Shift + ?", desc: "打开 / 关闭快捷键面板" },
    { keys: "Esc", desc: "关闭当前弹窗或中控台" },
    { keys: "Ctrl + 右键", desc: "临时使用浏览器原生右键菜单" },
  ];

  onMount(() => {
    const onOpen = () => (open = true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) open = false;
      if (e.shiftKey && e.key === "?") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          open = !open;
        }
      }
    };
    window.addEventListener("anzhiyu:open-shortcuts", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("anzhiyu:open-shortcuts", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="快捷键指南"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false;
    }}
  >
    <div class="w-full max-w-md rounded-2xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-2xl p-6 text-[var(--anzhiyu-fontcolor)]">
      <div class="flex items-center justify-between pb-3 mb-4 border-b border-[var(--anzhiyu-card-border)]">
        <span class="font-bold text-base">⌨️ 快捷键指南</span>
        <button type="button" class="cursor-pointer opacity-70 hover:opacity-100" onclick={() => (open = false)}>✕</button>
      </div>
      <div class="flex flex-col gap-3">
        {#each shortcuts as item}
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--anzhiyu-secondtext)]">{item.desc}</span>
            <kbd class="px-2 py-0.5 rounded bg-[var(--anzhiyu-secondbg)] border border-[var(--anzhiyu-card-border)] font-mono text-xs">{item.keys}</kbd>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
