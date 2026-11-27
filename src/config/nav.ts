export interface NavSubItem {
  name: string;
  link: string;
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
  /** 顶部左侧站点快捷下拉菜单 */
  siteMenu: {
    enable: boolean;
    groups: NavSiteGroup[];
  };
  /** 主导航菜单 */
  menu: NavItem[];
  /** 是否显示开往（Travelling）图标 */
  travelling: boolean;
}

export const navConfig: NavConfig = {
  siteMenu: {
    enable: true,
    groups: [
      {
        title: "项目",
        items: [
          {
            name: "Astro 主题仓库",
            link: "https://github.com/mcxiaochenn/astro-theme-anzhiyu",
            icon: "/favicon.ico",
          },
          {
            name: "原版 Hexo AnZhiYu",
            link: "https://github.com/anzhiyu-c/hexo-theme-anzhiyu",
            icon: "/favicon.ico",
          },
        ],
      },
    ],
  },
  travelling: true,
  menu: [
    {
      name: "文章",
      children: [
        { name: "隧道", link: "/archives/", icon: "fa6-solid:box-archive" },
        { name: "分类", link: "/categories/", icon: "fa6-solid:shapes" },
        { name: "标签", link: "/tags/", icon: "fa6-solid:tags" },
      ],
    },
    {
      name: "友链",
      children: [
        { name: "友人帐", link: "/link/", icon: "fa6-solid:link" },
        { name: "朋友圈", link: "/fcircle/", icon: "fa6-solid:circle-nodes" },
      ],
    },
    {
      name: "我的",
      children: [
        { name: "音乐馆", link: "/music/", icon: "fa6-solid:music" },
        { name: "相册集", link: "/album/", icon: "fa6-solid:images" },
        { name: "我的装备", link: "/equipment/", icon: "fa6-solid:laptop" },
      ],
    },
    {
      name: "关于",
      children: [
        { name: "关于本人", link: "/about/", icon: "fa6-solid:paper-plane" },
        { name: "闲言碎语", link: "/essay/", icon: "fa6-solid:lightbulb" },
        { name: "随便逛逛", link: "#random-post", icon: "fa6-solid:shoe-prints" },
      ],
    },
  ],
};
