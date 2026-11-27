<script lang="ts">
  import { onMount } from "svelte";

  interface SearchItem {
    title: string;
    url: string;
    description?: string;
    tags?: string[];
  }

  interface Props {
    fallbackPosts?: SearchItem[];
  }

  let { fallbackPosts = [] }: Props = $props();

  let open = $state(false);
  let query = $state("");
  let results = $state<{ title: string; url: string; excerpt?: string }[]>([]);
  let loading = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();
  let pagefindApi: { search: (q: string) => Promise<{ results: { data: () => Promise<any> }[] }> } | null = null;

  async function ensurePagefind() {
    if (pagefindApi) return pagefindApi;
    try {
      const pfUrl = "/pagefind/pagefind.js";
      const mod = await import(/* @vite-ignore */ pfUrl);
      if (mod?.init) await mod.init();
      pagefindApi = mod;
      return mod;
    } catch {
      return null;
    }
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      results = [];
      return;
    }
    loading = true;
    const pf = await ensurePagefind();
    if (pf) {
      try {
        const res = await pf.search(trimmed);
        const top = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
        results = top.map((d) => ({
          title: d.meta?.title || d.url,
          url: d.url,
          excerpt: d.excerpt,
        }));
        loading = false;
        return;
      } catch {
        // fallback below
      }
    }

    const lower = trimmed.toLowerCase();
    results = fallbackPosts
      .filter(
        (p) =>
          p.title.toLowerCase().includes(lower) ||
          (p.description ?? "").toLowerCase().includes(lower) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(lower)),
      )
      .slice(0, 8)
      .map((p) => ({
        title: p.title,
        url: p.url,
        excerpt: p.description,
      }));
    loading = false;
  }

  $effect(() => {
    void runSearch(query);
  });

  onMount(() => {
    const onOpen = () => {
      open = true;
      setTimeout(() => inputEl?.focus(), 30);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      } else if (e.key === "Escape" && open) {
        open = false;
      }
    };
    window.addEventListener("anzhiyu:open-search", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("anzhiyu:open-search", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-[240] flex items-start justify-center pt-20 p-4 bg-black/55 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="站内搜索"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false;
    }}
  >
    <div class="w-full max-w-xl rounded-2xl bg-[var(--anzhiyu-card-bg)] border border-[var(--anzhiyu-card-border)] shadow-2xl overflow-hidden text-[var(--anzhiyu-fontcolor)]">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-[var(--anzhiyu-card-border)]">
        <span class="opacity-60">🔍</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="search"
          placeholder="搜索文章标题、内容或标签..."
          class="flex-1 bg-transparent outline-none text-base"
        />
        <button
          type="button"
          class="text-xs px-2 py-1 rounded bg-[var(--anzhiyu-secondbg)] cursor-pointer"
          onclick={() => (open = false)}
        >
          ESC
        </button>
      </div>

      <div class="max-h-96 overflow-y-auto p-3">
        {#if !query.trim()}
          <div class="text-center py-8 text-sm text-[var(--anzhiyu-secondtext)]">输入关键词开始搜索</div>
        {:else if loading}
          <div class="text-center py-8 text-sm text-[var(--anzhiyu-secondtext)]">正在搜索...</div>
        {:else if results.length === 0}
          <div class="text-center py-8 text-sm text-[var(--anzhiyu-secondtext)]">未找到相关文章</div>
        {:else}
          <div class="flex flex-col gap-2">
            {#each results as item}
              <a
                href={item.url}
                class="block p-3 rounded-xl hover:bg-[var(--anzhiyu-secondbg)] transition-colors"
                onclick={() => (open = false)}
              >
                <div class="font-bold text-sm text-[var(--anzhiyu-main)]">{item.title}</div>
                {#if item.excerpt}
                  <div class="text-xs text-[var(--anzhiyu-secondtext)] mt-1 line-clamp-2">{@html item.excerpt}</div>
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
