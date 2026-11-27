<script lang="ts">
  interface Props {
    enable?: boolean;
    musicUrl?: string;
  }

  let { enable = true, musicUrl = "/music/" }: Props = $props();
  let expanded = $state(false);
</script>

{#if enable}
  <div class="fixed left-4 bottom-6 z-[85] flex items-center gap-2">
    <button
      type="button"
      class="w-11 h-11 rounded-full bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-lg flex items-center justify-center text-lg hover:border-[var(--anzhiyu-main)] hover:scale-105 transition-all cursor-pointer"
      title="音乐馆"
      onclick={() => (expanded = !expanded)}
    >
      🎵
    </button>

    {#if expanded}
      <div class="px-3.5 py-2 rounded-xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-xl flex items-center gap-3 text-sm">
        <span class="text-[var(--anzhiyu-secondtext)]">AnZhiYu 音乐馆</span>
        <a
          href={musicUrl}
          class="px-2.5 py-1 rounded-lg bg-[var(--anzhiyu-main)] text-white text-xs font-semibold hover:opacity-90"
        >
          进入歌单
        </a>
      </div>
    {/if}
  </div>
{/if}
