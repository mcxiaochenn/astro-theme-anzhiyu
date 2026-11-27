<script lang="ts">
  import { onMount } from "svelte";

  interface EssayItem {
    content: string;
    date?: string;
    image?: string[];
  }

  interface Props {
    items?: EssayItem[];
  }

  let { items = [] }: Props = $props();
  let current = $state(0);

  const slides = $derived(
    items.map((item) => (item.image?.length ? `${item.content} [图片]` : item.content)),
  );

  onMount(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      current = (current + 1) % slides.length;
    }, 3500);
    return () => window.clearInterval(timer);
  });
</script>

{#if slides.length > 0}
  <div id="bbTimeList" class="bbTimeList container">
    <a href="/essay/" title="即刻短文" aria-label="即刻短文">
      <i class="anzhiyufont anzhiyu-icon-jike bber-logo fontbold"></i>
    </a>
    <div id="bbtalk" class="swiper-container swiper-no-swiping essay_bar_swiper_container" tabindex="-1">
      <div id="bber-talk" class="swiper-wrapper">
        <a class="li-style swiper-slide" href="/essay/" style="display: block; width: 100%;">
          {slides[current]}
        </a>
      </div>
    </div>
    <a class="bber-gotobb anzhiyufont anzhiyu-icon-circle-arrow-right" href="/essay/" title="查看全文"></a>
  </div>
{/if}
