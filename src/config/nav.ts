export interface NavSubItem {
  name: string;
  link: string;
  /** 支持原版 anzhiyu-icon-*（推荐）或 fa6-* */
  icon?: string;
}

export interface NavItem {
  name: string;
  link?: string;
  icon?: string;
  children?: NavSubItem[];
}

export interface NavSiteGroup {
  title: string;
  items: {
    name: string;
    link: string;
    icon: string;
  }[];
}

export interface NavConfig {
  /** 顶部左侧九宫格站点矩阵菜单 */
  siteMenu: {
    enable: boolean;
    groups: NavSiteGroup[];
  };
  /** 主导航菜单 */
  menu: NavItem[];
  /** 是否显示开往（Travelling）图标 */
  travelling: boolean;
  /** 是否在顶栏右侧显示随机文章按钮 */
  randomPost: boolean;
}

export const navConfig: NavConfig = {
  siteMenu: {
    enable: true,
    groups: [
      {
        title: "博客与开源",
        items: [
          {
            name: "Astro 主题仓",
            link: "https://github.com/mcxiaochenn/astro-theme-anzhiyu",
            icon: "/favicon.ico",
          },
          {
            name: "原版 AnZhiYu",
            link: "https://github.com/anzhiyu-c/hexo-theme-anzhiyu",
            icon: "/favicon.ico",
          },
        ],
      },
    ],
  },
  travelling: true,
  randomPost: true,
  menu: [
    {
      name: "文章",
      children: [
        { name: "隧道", link: "/archives/", icon: "anzhiyu-icon-box-archive" },
        { name: "分类", link: "/categories/", icon: "anzhiyu-icon-shapes" },
        { name: "标签", link: "/tags/", icon: "anzhiyu-icon-tags" },
      ],
    },
    {
      name: "友链",
      children: [
        { name: "友人帐", link: "/link/", icon: "anzhiyu-icon-link" },
        { name: "朋友圈", link: "/fcircle/", icon: "anzhiyu-icon-artstation" },
      ],
    },
    {
      name: "我的",
      children: [
        { name: "即刻短文", link: "/essay/", icon: "anzhiyu-icon-lightbulb" },
        { name: "相册画廊", link: "/album/", icon: "anzhiyu-icon-images" },
        { name: "音乐馆", link: "/music/", icon: "anzhiyu-icon-music" },
        { name: "我的装备", link: "/equipment/", icon: "anzhiyu-icon-dice-d20" },
      ],
    },
    {
      name: "关于",
      children: [
        { name: "关于本人", link: "/about/", icon: "anzhiyu-icon-paper-plane" },
        { name: "随便逛逛", link: "#random-post", icon: "anzhiyu-icon-shoe-prints" },
      ],
    },
  ],
};
