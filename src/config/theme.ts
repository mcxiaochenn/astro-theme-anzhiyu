export interface HomeCategoryTile {
  name: string;
  link: string;
  icon: string;
  gradient: string;
}

export interface ThemeConfig {
  /** 默认明暗模式：light | dark | auto */
  displayMode: "light" | "dark" | "auto";
  /** 主题色 */
  themeColor: {
    light: string;
    dark: string;
  };
  /** 是否开启文章封面主色调动态提取 */
  mainTone: boolean;
  /** 首页配置 */
  home: {
    doubleRow: boolean;
    homeTopEnable: boolean;
    homeTopTitle: string;
    homeTopSubtitle: string;
    categories: HomeCategoryTile[];
    bbTimeEnable: boolean;
  };
  /** 侧边栏配置 */
  sidebar: {
    enable: boolean;
    position: "left" | "right";
    announcement: string;
    recentPostsCount: number;
  };
  /** 文章页功能开关 */
  post: {
    toc: boolean;
    copyright: boolean;
    relatedPosts: boolean;
    aiAbstract: boolean;
    reward: {
      enable: boolean;
      wechat?: string;
      alipay?: string;
    };
  };
  /** 全局交互开关 */
  features: {
    rightMenu: boolean;
    console: boolean;
    shortcutKey: boolean;
    search: boolean;
    lazyLoad: boolean;
  };
}

export const themeConfig: ThemeConfig = {
  displayMode: "auto",
  themeColor: {
    light: "#425aef",
    dark: "#f2b94b",
  },
  mainTone: true,
  home: {
    doubleRow: true,
    homeTopEnable: true,
    homeTopTitle: "分享设计与科技生活",
    homeTopSubtitle: "AnZhiYu · Astro Native",
    categories: [
      {
        name: "前端开发",
        link: "/categories/前端/",
        icon: "fa6-solid:code",
        gradient: "linear-gradient(135deg, #358bff 0%, #15c6ff 100%)",
      },
      {
        name: "实用教程",
        link: "/categories/入门指南/",
        icon: "fa6-solid:compass",
        gradient: "linear-gradient(135deg, #f65 0%, #ffbf37 100%)",
      },
      {
        name: "生活随笔",
        link: "/essay/",
        icon: "fa6-solid:feather-pointed",
        gradient: "linear-gradient(135deg, #18e7ae 0%, #1eebeb 100%)",
      },
    ],
    bbTimeEnable: true,
  },
  sidebar: {
    enable: true,
    position: "right",
    announcement: "欢迎来到 AnZhiYu Astro v2 —— 原汁原味的外观，纯正 Astro 的内核！",
    recentPostsCount: 5,
  },
  post: {
    toc: true,
    copyright: true,
    relatedPosts: true,
    aiAbstract: true,
    reward: {
      enable: true,
      wechat: "/img/demo/donate/wechat.png",
      alipay: "/img/demo/donate/alipay.png",
    },
  },
  features: {
    rightMenu: true,
    console: true,
    shortcutKey: true,
    search: true,
    lazyLoad: true,
  },
};
