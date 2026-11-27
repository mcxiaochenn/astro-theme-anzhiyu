<script lang="ts">
  import { onMount } from "svelte";

  interface EssayItem {
    content: string;
    date?: string;
  }

  interface Props {
    items?: EssayItem[];
  }

  let { items = [] }: Props = $props();
  let currentIndex = $state(0);

  onMount(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % items.length;
    }, 3500);
    return () => clearInterval(timer);
  });
</script>

{#if items.length > 0}
  <div class="max-w-[1400px] mx-auto px-6 md:px-6 pt-4">
    <a
      href="/essay/"
      class="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] hover:border-[var(--anzhiyu-main)] shadow-sm transition-colors"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="shrink-0 font-bold text-sm text-[var(--anzhiyu-main)]">⚡ 即刻</span>
        <span class="truncate text-sm font-medium text-[var(--anzhiyu-fontcolor)]">
          {items[currentIndex]?.content}
        </span>
      </div>
      <span class="shrink-0 text-xs text-[var(--anzhiyu-secondtext)] hover:text-[var(--anzhiyu-main)]">
        查看更多 →
      </span>
    </a>
  </div>
{/if}
