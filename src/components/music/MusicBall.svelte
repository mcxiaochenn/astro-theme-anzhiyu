<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    enable?: boolean;
    playlistId?: string;
    server?: string;
    type?: string;
  }

  let {
    enable = true,
    playlistId = "8152976493",
    server = "netease",
    type = "playlist",
  }: Props = $props();

  let playing = $state(false);
  let loadedMeting = $state(false);
  let hostEl: HTMLElement | undefined = $state();

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function loadStyle(href: string) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  async function ensurePlayerReady() {
    if (loadedMeting) return;
    loadedMeting = true;
    try {
      loadStyle("https://unpkg.com/anzhiyu-theme-static@1.0.0/aplayer/APlayer.min.css");
      await loadScript("https://unpkg.com/aplayer@1.10.1/dist/APlayer.min.js");
      await loadScript("https://unpkg.com/meting@2.0.1/dist/Meting.min.js");
    } catch {
      // 离线或外部 CDN 受限时保持胶囊可用，不抛未捕获异常
    }
  }

  async function togglePlay() {
    await ensurePlayerReady();
    const aplayer = (hostEl?.querySelector("meting-js") as any)?.aplayer;
    if (aplayer) {
      aplayer.toggle();
      playing = !aplayer.audio?.paused;
    } else {
      playing = !playing;
      window.dispatchEvent(
        new CustomEvent("anzhiyu:toast", {
          detail: { message: playing ? "正在连接歌单服务..." : "已暂停音乐" },
        }),
      );
    }
  }

  onMount(() => {
    const onToggle = () => {
      void togglePlay();
    };
    window.addEventListener("anzhiyu:music-toggle", onToggle);
    return () => {
      window.removeEventListener("anzhiyu:music-toggle", onToggle);
    };
  });
</script>

{#if enable}
  <div id="nav-music" bind:this={hostEl} class:playing={playing}>
    <a
      id="nav-music-hoverTips"
      href="javascript:void(0);"
      accesskey="m"
      onclick={(e) => {
        e.preventDefault();
        void togglePlay();
      }}
    >
      {playing ? "暂停音乐" : "播放音乐"}
    </a>
    <div id="console-music-bg"></div>
    {#if loadedMeting}
      <meting-js
        id={playlistId}
        server={server}
        type={type}
        mutex="true"
        preload="none"
        theme="var(--anzhiyu-main)"
        data-lrctype="0"
        order="random"
      ></meting-js>
    {:else}
      <div
        class="aplayer aplayer-narrow"
        role="button"
        tabindex="0"
        title="点击播放音乐"
        onclick={() => void togglePlay()}
        onkeydown={(e) => e.key === "Enter" && void togglePlay()}
      >
        <div class="aplayer-body">
          <div class="aplayer-pic" style="background-image: url('/img/default_cover.jpg');">
            <div class="aplayer-button aplayer-play">
              <i class="anzhiyufont anzhiyu-icon-play" style="color: #fff; font-size: 12px;"></i>
            </div>
          </div>
          <div class="aplayer-info">
            <div class="aplayer-music">
              <span class="aplayer-title">AnZhiYu 音乐馆</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
