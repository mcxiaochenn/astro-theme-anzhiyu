export interface FooterBadge {
  title: string;
  link: string;
  img: string;
  alt: string;
}

export interface FooterConfig {
  since: string;
  icp?: {
    text: string;
    url: string;
  };
  badges?: FooterBadge[];
  links?: {
    title: string;
    items: { name: string; link: string }[];
  }[];
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
  title: "AnZhiYu Astro",
  subtitle: "生活明朗，万物可爱",
  description: "Anzhiyu 的外貌，Astro 的心 —— 基于 Astro 重构的 AnZhiYu 个人博客主题",
  keywords: ["Astro", "AnZhiYu", "Blog", "个人博客"],
  author: "AnZhiYu",
  url: "https://anzhiyu.example.mcxiaochen.top",
  language: "zh-CN",
  favicon: "/favicon.ico",
  pageSize: 12,
  footer: {
    since: "2024-01-01",
    links: [
      {
        title: "导航",
        items: [
          { name: "归档", link: "/archives/" },
          { name: "分类", link: "/categories/" },
          { name: "标签", link: "/tags/" },
        ],
      },
      {
        title: "服务",
        items: [
          { name: "友链", link: "/link/" },
          { name: "即刻", link: "/essay/" },
          { name: "关于", link: "/about/" },
        ],
      },
      {
        title: "协议",
        items: [
          { name: "RSS", link: "/rss.xml" },
          { name: "Sitemap", link: "/sitemap-index.xml" },
        ],
      },
    ],
  },
};
