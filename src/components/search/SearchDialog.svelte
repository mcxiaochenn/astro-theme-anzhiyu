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

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightKeyword(text: string, kw: string): string {
    const safe = escapeHtml(text);
    const trimmed = kw.trim();
    if (!trimmed) return safe;
    const escapedKw = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${escapedKw})`, "gi"), '<span class="search-keyword">$1</span>');
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    const pf = await ensurePagefind();
    if (pf) {
      try {
        const res = await pf.search(trimmed);
        const top = await Promise.all(res.results.slice(0, 10).map((r) => r.data()));
        results = top.map((d) => ({
          title: highlightKeyword(d.meta?.title || d.url, trimmed),
          url: d.url,
          excerpt: (d.excerpt || "").replace(/<mark>/g, '<span class="search-keyword">').replace(/<\/mark>/g, "</span>"),
        }));
        loading = false;
        return;
      } catch {
        // fallback to in-memory index
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
      .slice(0, 10)
      .map((p) => ({
        title: highlightKeyword(p.title, trimmed),
        url: p.url,
        excerpt: p.description ? highlightKeyword(p.description, trimmed) : undefined,
      }));
    loading = false;
  }

  $effect(() => {
    void runSearch(query);
  });

  function openDialog(initialQuery?: string) {
    if (typeof initialQuery === "string" && initialQuery) {
      query = initialQuery;
    }
    open = true;
    document.body.style.overflow = "hidden";
    setTimeout(() => inputEl?.focus(), 40);
  }

  function closeDialog() {
    open = false;
    document.body.style.overflow = "";
  }

  onMount(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      openDialog(detail?.query);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open ? closeDialog() : openDialog();
      } else if (e.key === "Escape" && open) {
        closeDialog();
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

<div id="local-search" style={open ? "display: block;" : "display: none;"}>
  <div class="search-dialog" style={open ? "display: block;" : "display: none;"}>
    <nav class="search-nav">
      <span class="search-dialog-title">搜索</span>
      <span id="loading-status">
        {#if loading}
          <i class="anzhiyufont anzhiyu-icon-spinner anzhiyu-pulse-icon"></i>
        {/if}
      </span>
      <button class="search-close-button" type="button" title="关闭搜索" onclick={closeDialog}>
        <i class="anzhiyufont anzhiyu-icon-xmark"></i>
      </button>
    </nav>

    <div class="search-wrap" style="display: block;">
      <div id="local-search-input">
        <div class="local-search-box">
          <input
            bind:this={inputEl}
            bind:value={query}
            class="local-search-box--input"
            type="text"
            placeholder="输入关键词快速查找文章..."
          />
        </div>
      </div>
      <hr />
      <div id="local-search-results">
        {#if query.trim()}
          {#if results.length > 0}
            <ul class="search-result-list">
              {#each results as item}
                <li class="local-search-hit-item">
                  <a class="search-result-title" href={item.url} onclick={closeDialog}>
                    {@html item.title}
                  </a>
                  {#if item.excerpt}
                    <p class="search-result">{@html item.excerpt}</p>
                  {/if}
                </li>
              {/each}
            </ul>
            <div class="local-search-stats-wrap">
              <hr class="local-search-stats__hr" />
              <div class="search-result-stats">共找到 <b>{results.length}</b> 篇相关文章</div>
            </div>
          {:else if !loading}
            <div id="local-search__hits-empty">找不到您查询的内容：{query}</div>
          {/if}
        {/if}
      </div>
    </div>
  </div>

  <div
    id="search-mask"
    style={open ? "display: block;" : "display: none;"}
    role="presentation"
    onclick={closeDialog}
  ></div>
</div>
