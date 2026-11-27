<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    enable?: boolean;
    provider?: string;
    twikooEnvId?: string;
  }

  let { enable = true, provider = "none", twikooEnvId = "" }: Props = $props();
  let visible = $state(false);
  let items = $state<{ nick: string; content: string; avatar?: string }[]>([]);
  let currentIdx = $state(0);

  onMount(() => {
    const syncPref = () => {
      const pref = localStorage.getItem("anzhiyu-barrage") !== "false";
      visible = enable && pref && items.length > 0;
    };

    const onBarrageChange = (e: Event) => {
      const detail = (e as CustomEvent<{ enable: boolean }>).detail;
      visible = Boolean(detail?.enable) && items.length > 0;
    };

    // 若配置了 Twikoo 后端，尝试拉取当前页面近期评论作为热评弹幕
    if (enable && provider === "twikoo" && twikooEnvId && /^https?:\/\//.test(twikooEnvId)) {
      fetch(twikooEnvId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "COMMENT_GET",
          url: window.location.pathname,
          pageSize: 10,
          page: 1,
        }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (Array.isArray(res?.data) && res.data.length > 0) {
            items = res.data.map((c: any) => ({
              nick: c.nick || "访客",
              content: String(c.commentText || c.comment || "").slice(0, 60),
              avatar: c.avatar,
            }));
            syncPref();
          }
        })
        .catch(() => {});
    }

    const timer = window.setInterval(() => {
      if (items.length > 1) {
        currentIdx = (currentIdx + 1) % items.length;
      }
    }, 5000);

    window.addEventListener("anzhiyu:barrage-change", onBarrageChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("anzhiyu:barrage-change", onBarrageChange);
    };
  });
</script>

{#if visible && items[currentIdx]}
  <div class="comment-barrage">
    <div class="comment-barrage-item">
      <div class="barrageHead">
        <a class="barrageTitle" href="#post-comment">热评</a>
        <div class="barrageNick">{items[currentIdx].nick}</div>
        <button
          type="button"
          class="barrageClose"
          title="关闭热评"
          onclick={() => {
            localStorage.setItem("anzhiyu-barrage", "false");
            visible = false;
          }}
        >
          <i class="anzhiyufont anzhiyu-icon-xmark"></i>
        </button>
      </div>
      <a class="barrageContent" href="#post-comment">{items[currentIdx].content}</a>
    </div>
  </div>
{/if}
