export interface HomeCategoryTile {
  name: string;
  link: string;
  /** 原版 anzhiyu-icon-* 图标名 */
  icon: string;
  /** 原版预设样式类：blue | red | green */
  colorClass: "blue" | "red" | "green";
  shadow?: string;
}

export interface ThemeConfig {
  /** 默认明暗模式：light | dark | auto */
  displayMode: "light" | "dark" | "auto";
  /** 主题色 */
  themeColor: {
    light: string;
    dark: string;
  };
  /** 是否开启文章封面主色调动态提取与渐变融合 */
  mainTone: boolean;
  /** 顶图系统配置（默认 indexImg: false 为经典卡片首屏；设为图片路径即切换全屏 Banner 首屏） */
  header: {
    indexImg: false | string;
    indexTopImgHeight: string;
    defaultTopImg: false | string;
    subtitleTyping: string[];
  };
  /** 首页配置 */
  home: {
    doubleRow: boolean;
    bbTimeEnable: boolean;
    homeTopEnable: boolean;
    swiperEnable: boolean;
    homeTopTitle: string;
    homeTopSubtitle: string;
    siteText: string;
    todayBanner: {
      tips: string;
      title: string;
      image: string;
      link: string;
    };
    categories: HomeCategoryTile[];
  };
  /** 侧边栏配置 */
  sidebar: {
    enable: boolean;
    position: "left" | "right";
    mobileEnable: boolean;
    announcement: string;
    recentPostsCount: number;
    showCategories: boolean;
    showArchives: boolean;
    showTags: boolean;
    showWebinfo: boolean;
  };
  /** 文章页功能与代码框配置 */
  post: {
    toc: boolean;
    ptool: boolean;
    copyright: boolean;
    copyrightLocation: string;
    relatedPosts: boolean;
    aiAbstract: boolean;
    noticeOutdateDays: number | false;
    codeBlock: {
      macStyle: boolean;
      theme: "mac light" | "mac";
      lineNumbers: boolean;
      heightLimit: number;
    };
    reward: {
      enable: boolean;
      wechat?: string;
      alipay?: string;
    };
  };
  /** 全局交互开关 */
  features: {
    preloader: boolean;
    rightMenu: boolean;
    console: boolean;
    shortcutKey: boolean;
    search: boolean;
    translate: boolean;
    readMode: boolean;
  };
}

export const themeConfig: ThemeConfig = {
  displayMode: "auto",
  themeColor: {
    light: "#425aef",
    dark: "#f2b94b",
  },
  mainTone: true,
  header: {
    indexImg: false,
    indexTopImgHeight: "100vh",
    defaultTopImg: false,
    subtitleTyping: [
      "生活明朗，万物可爱。",
      "Anzhiyu 的外貌，Astro 的心。",
    ],
  },
  home: {
    doubleRow: true,
    bbTimeEnable: true,
    homeTopEnable: true,
    swiperEnable: false,
    homeTopTitle: "生活明朗",
    homeTopSubtitle: "万物可爱。",
    siteText: "anzhiyu.astro",
    todayBanner: {
      tips: "今日推荐",
      title: "探索 Astro 原生架构下的 AnZhiYu 主题美学",
      image: "/img/demo/anime/banner.jpg",
      link: "/about/",
    },
    categories: [
      {
        name: "样式演示",
        link: "/categories/样式演示/",
        icon: "anzhiyu-icon-dove",
        colorClass: "blue",
        shadow: "var(--anzhiyu-shadow-blue)",
      },
      {
        name: "标签语法",
        link: "/categories/标签演示/",
        icon: "anzhiyu-icon-fire",
        colorClass: "red",
        shadow: "var(--anzhiyu-shadow-red)",
      },
      {
        name: "入门指南",
        link: "/categories/入门指南/",
        icon: "anzhiyu-icon-book",
        colorClass: "green",
        shadow: "var(--anzhiyu-shadow-green)",
      },
    ],
  },
  sidebar: {
    enable: true,
    position: "right",
    mobileEnable: true,
    announcement: "欢迎来到 <b>Astro-Theme-AnZhiYu</b> —— 100% 原版视觉质感，纯正 Astro 原生内核！",
    recentPostsCount: 5,
    showCategories: true,
    showArchives: true,
    showTags: true,
    showWebinfo: true,
  },
  post: {
    toc: true,
    ptool: true,
    copyright: true,
    copyrightLocation: "中国",
    relatedPosts: true,
    aiAbstract: true,
    noticeOutdateDays: false,
    codeBlock: {
      macStyle: true,
      theme: "mac light",
      lineNumbers: true,
      heightLimit: 360,
    },
    reward: {
      enable: true,
      wechat: "/img/demo/anime/avatar-anime.jpg",
      alipay: "/img/demo/anime/avatar-anime.jpg",
    },
  },
  features: {
    preloader: false,
    rightMenu: true,
    console: true,
    shortcutKey: true,
    search: true,
    translate: true,
    readMode: true,
  },
};
