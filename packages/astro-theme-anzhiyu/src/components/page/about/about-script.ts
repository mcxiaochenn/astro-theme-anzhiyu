/**
 * about 页内联脚本 — 上游 `layout/includes/page/about.pug:289-500`（P3-3 Phase 4 交互）。
 *
 * 上游把整段交互写在 pug 的 `script(defer).` 里，并用 `#{...}` / `!{...}` 把配置值
 * 直接插进产物：
 *   统计卡片数字动画（CountUp）→ 51la / Umami 数据拉取 → 出生年份动画 →
 *   文案轮播 → `.hello-about` 鼠标跟随（gsap）
 *
 * 这里用模板字符串保持同一份源码形状，渲染侧用 `<script is:inline defer set:html>`
 * 原样输出，逐字符对齐基线 `.baseline-html/about/index.html`。
 *
 * 配置取值口径与 pug 一致：
 *   - `theme.LA.enable` / `theme.LA.ck`（51la）
 *   - `theme.umami.{enable,apiHost,websiteId,token}`
 *   - `item.selfInfo.selfInfoContentYear`（出生年份动画的起始值）
 *   - `theme.asset.gsap_js`（`getScript(url_for(...))`，走 asset 解析层）
 */
import type { AboutItem } from './types.ts'
import { getThemeConfig, readFlag, readString } from '../../../config/theme-context.ts'
import { escapeJsString } from '../../head/global-config.ts'
import { _p, assetUrl } from './shared.ts'

const theme = getThemeConfig()

/** 上游 `theme.LA`：51la 统计开关与站点 ck。 */
const laEnable = readFlag(theme.LA, 'enable')
const laCk = readString(theme.LA, 'ck')

/** 上游 `theme.umami`：Umami 统计接口参数。 */
const umamiEnable = readFlag(theme.umami, 'enable')
const umamiApiHost = readString(theme.umami, 'apiHost')
const umamiWebsiteId = readString(theme.umami, 'websiteId')
const umamiToken = readString(theme.umami, 'token')

/**
 * 上游 `about.pug:296-305` 的 `i18nStats`。
 * 键顺序决定 `JSON.stringify` 的输出顺序，必须与 pug 保持一致。
 */
const i18nStats = {
  today_visitors: _p('about.stats.today_visitors'),
  today_views: _p('about.stats.today_views'),
  yesterday_visitors: _p('about.stats.yesterday_visitors'),
  yesterday_views: _p('about.stats.yesterday_views'),
  month_views: _p('about.stats.month_views'),
  total_views: _p('about.stats.total_views'),
  fetch_failed: _p('about.stats.fetch_failed'),
}

/**
 * 生成 `#about-page` 之后的 `script[defer]` 正文（`about.pug:306-500`）。
 *
 * 上游用 `#{selfInfoContentYear}` 把出生年份原样插到 `new CountUp(...)` 的参数位，
 * 这里沿用「不转义、不加引号」的口径，保证产物与基线逐字符一致。
 */
export function buildAboutScript(item: AboutItem): string {
  // 出生年份插在 CountUp 的数值参数位：空 / 非数字会拼出 `0, , 0` 这种语法错误。
  // 合法数字保留原字面量（与基线逐字符一致），其余兜底成 0。
  const rawSelfInfoContentYear = String(item.selfInfo?.selfInfoContentYear ?? '').trim()
  const selfInfoContentYear =
    rawSelfInfoContentYear !== '' && Number.isFinite(Number(rawSelfInfoContentYear))
      ? rawSelfInfoContentYear
      : '0'
  return `function initAboutPage() {
  const statisticEl = document.getElementById("statistic");
  let statistic = [];
  let numValues = [];

  const i18nStats = ${JSON.stringify(i18nStats)};

  // 统计数据渲染函数
  function renderStatistic(title, num) {
    if (!statisticEl) return;
    numValues = num;
    statistic = [];
    
      for (let i = 0; i < num.length; i++) {
        statisticEl.innerHTML +=
        "<div><span>" + title[i] + "</span><span id='stat-" + i + "'>" + num[i] + "</span></div>";
        queueMicrotask(() => {
          statistic.push(
          new CountUp("stat-" + i, 0, num[i], 0, 2, {
              useEasing: true,
              useGrouping: true,
              separator: ",",
              decimal: ".",
              prefix: "",
              suffix: "",
            })
          );
        });
    }
      }

  // 统计数字动画
  function statisticUP() {
      let statisticElement = document.querySelector(".about-statistic.author-content-item");
        if (!statisticElement) return;

        const callback = (entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
          for (let i = 0; i < statistic.length; i++) {
                queueMicrotask(() => {
              statistic[i].start();
                });
              }
          observer.disconnect();
            }
          });
        };

    const options = { root: null, rootMargin: "0px", threshold: 0 };
        const observer = new IntersectionObserver(callback, options);
        observer.observe(statisticElement);
      }

  // 51la 统计
  if (${laEnable}) {
    fetch("https://v6-widget.51.la/v6/${escapeJsString(laCk)}/quote.js")
      .then(res => res.text())
      .then(data => {
        let title = [i18nStats.today_visitors, i18nStats.today_views, i18nStats.yesterday_visitors, i18nStats.yesterday_views, i18nStats.month_views, i18nStats.total_views];
        let num = data.match(/(<\\/span><span>).*?(\\/span><\\/p>)/g);

        num = num.map(el => {
          let val = el.replace(/(<\\/span><span>)/g, "");
          let str = val.replace(/(<\\/span><\\/p>)/g, "");
          return str;
        });

        // 跳过第一个"最近活跃"
        num = num.slice(1);
        renderStatistic(title, num);
        statisticUP();
      })
      .catch(err => {
        console.error("51la stats fetch failed:", err);
        if (statisticEl) statisticEl.innerHTML = "<div>" + i18nStats.fetch_failed + "</div>";
      });
  }

  // Umami 统计
  if (${umamiEnable}) {
    const apiHost = "${escapeJsString(umamiApiHost)}";
    const websiteId = "${escapeJsString(umamiWebsiteId)}";
    const token = "${escapeJsString(umamiToken)}";
    
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 86400000;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const fetchStats = async (startAt, endAt) => {
      const res = await fetch(\`\${apiHost}/api/websites/\${websiteId}/stats?startAt=\${startAt}&endAt=\${endAt}\`, {
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      return res.json();
    };

    Promise.all([
      fetchStats(todayStart, now),      // today
      fetchStats(yesterdayStart, todayStart), // yesterday
      fetchStats(monthStart, now),      // month
      fetchStats(0, now)                // total
    ])
      .then(([today, yesterday, month, total]) => {
        const title = [i18nStats.today_visitors, i18nStats.today_views, i18nStats.yesterday_visitors, i18nStats.yesterday_views, i18nStats.month_views, i18nStats.total_views];
        const num = [
          today.visitors?.value || today.uniques?.value || 0,
          today.pageviews?.value || 0,
          yesterday.visitors?.value || yesterday.uniques?.value || 0,
          yesterday.pageviews?.value || 0,
          month.pageviews?.value || 0,
          total.pageviews?.value || 0
        ];

        renderStatistic(title, num);
        statisticUP();
      })
      .catch(err => {
        console.error("Umami stats fetch failed:", err);
        if (statisticEl) statisticEl.innerHTML = "<div>" + i18nStats.fetch_failed + "</div>";
      });
  }

  // 出生年份动画
      const selfInfoContentYear = new CountUp("selfInfo-content-year", 0, ${selfInfoContentYear}, 0, 2, {
        useEasing: true,
        useGrouping: false,
        separator: ",",
        decimal: ".",
        prefix: "",
        suffix: "",
      });

      let selfInfoContentYearElement = document.querySelector(".author-content-item.selfInfo.single");
      function selfInfoContentYearUp() {
        if (!selfInfoContentYearElement) return;

        const callback = (entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              selfInfoContentYear.start();
          observer.disconnect();
            }
          });
        };

    const options = { root: null, rootMargin: "0px", threshold: 0 };
        const observer = new IntersectionObserver(callback, options);
        observer.observe(selfInfoContentYearElement);
      }

      selfInfoContentYearUp();

  var pursuitInterval = null;
  pursuitInterval = setInterval(function () {
    const show = document.querySelector("span[data-show]");
    const next = show.nextElementSibling || document.querySelector(".first-tips");
    const up = document.querySelector("span[data-up]");

    if (up) {
      up.removeAttribute("data-up");
    }

    show.removeAttribute("data-show");
    show.setAttribute("data-up", "");

    next.setAttribute("data-show", "");
  }, 2000);

  document.addEventListener("pjax:send", function () {
    pursuitInterval && clearInterval(pursuitInterval);
  });

  var helloAboutEl = document.querySelector(".hello-about");
  helloAboutEl.addEventListener("mousemove", evt => {
    const mouseX = evt.offsetX;
    const mouseY = evt.offsetY;
    gsap.set(".cursor", {
      x: mouseX,
      y: mouseY,
    });

    gsap.to(".shape", {
      x: mouseX,
      y: mouseY,
      stagger: -0.1,
    });
  });
}
if (typeof gsap === "object") {
  initAboutPage()
} else {
  getScript("${assetUrl('gsap_js')}").then(initAboutPage);
}`
}
