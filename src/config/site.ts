export interface FooterBadge {
  title: string;
  link: string;
  img: string;
  alt?: string;
}

export interface FooterLinkGroup {
  title: string;
  items: { name: string; link: string; external?: boolean }[];
}

export interface FooterConfig {
  /** 建站日期（用于版权年份与侧栏/底栏建站运行天数计算） */
  since: string;
  /** ICP 备案信息 */
  icp?: {
    text: string;
    url: string;
  };
  /** 页脚工作/在线状态徽章（可选） */
  workBadge?: {
    enable: boolean;
    img: string;
    description: string;
  };
  /** 框架与主题徽标 */
  badges?: FooterBadge[];
  /** 页脚多列链接组 */
  links?: FooterLinkGroup[];
  /** 底栏右侧快捷链接 */
  barLinks?: { text: string; link: string; external?: boolean }[];
  /** 是否在底栏显示 CC 许可图标 */
  ccLink?: string;
  /** 是否在页脚显示实时运行时间 */
  runtimeEnable?: boolean;
}

export interface SiteConfig {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  author: string;
  url: string;
  language: string;
  favicon: string;
  pageSize: number;
  footer: FooterConfig;
}

export const siteConfig: SiteConfig = {
  title: "AnZhiYu",
  subtitle: "生活明朗，万物可爱",
  description: "Anzhiyu 的外貌，Astro 的心 —— 基于 Astro 原生架构 1:1 复原的 AnZhiYu 个人博客主题",
  keywords: ["Astro", "AnZhiYu", "Blog", "个人博客", "主题"],
  author: "AnZhiYu",
  url: "https://anzhiyu.example.mcxiaochen.top",
  language: "zh-CN",
  favicon: "/favicon.ico",
  pageSize: 12,
  footer: {
    since: "2024-01-01",
    runtimeEnable: true,
    ccLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    links: [
      {
        title: "导航",
        items: [
          { name: "文章归档", link: "/archives/" },
          { name: "全部分类", link: "/categories/" },
          { name: "全部标签", link: "/tags/" },
        ],
      },
      {
        title: "生活",
        items: [
          { name: "即刻短文", link: "/essay/" },
          { name: "相册画廊", link: "/album/" },
          { name: "音乐馆", link: "/music/" },
        ],
      },
      {
        title: "社交",
        items: [
          { name: "友人帐", link: "/link/" },
          { name: "友链朋友圈", link: "/fcircle/" },
          { name: "我的装备", link: "/equipment/" },
        ],
      },
      {
        title: "关于",
        items: [
          { name: "关于本人", link: "/about/" },
          { name: "RSS 订阅", link: "/rss.xml" },
          { name: "站点地图", link: "/sitemap-index.xml" },
        ],
      },
      {
        title: "开源",
        items: [
          { name: "Astro 主题仓", link: "https://github.com/mcxiaochenn/astro-theme-anzhiyu", external: true },
          { name: "上游 AnZhiYu", link: "https://github.com/anzhiyu-c/hexo-theme-anzhiyu", external: true },
          { name: "Astro 官网", link: "https://astro.build/", external: true },
        ],
      },
    ],
    barLinks: [
      { text: "订阅", link: "/rss.xml" },
      { text: "主题", link: "https://github.com/mcxiaochenn/astro-theme-anzhiyu", external: true },
      { text: "关于", link: "/about/" },
    ],
    badges: [
      {
        title: "博客框架为 Astro",
        link: "https://astro.build/",
        img: "https://img.shields.io/badge/Frame-Astro-BC52EE?style=flat&logo=astro",
        alt: "Frame Astro",
      },
      {
        title: "本站使用 Astro-Theme-AnZhiYu 主题",
        link: "https://github.com/mcxiaochenn/astro-theme-anzhiyu",
        img: "https://img.shields.io/badge/Theme-AnZhiYu-425AEF?style=flat",
        alt: "Theme AnZhiYu",
      },
    ],
  },
};
