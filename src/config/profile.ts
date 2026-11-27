export interface SocialLink {
  name: string;
  url: string;
  /** 支持原版 anzhiyu-icon-*（推荐）或 fa6-* 图标名 */
  icon: string;
  animation?: "faa-tada" | "faa-float" | string;
}

export interface GreetingRule {
  greeting: string;
  startTime: number;
  endTime: number;
}

export interface ProfileConfig {
  name: string;
  avatar: string;
  bio: string;
  /** 作者卡顶部默认问候语与点击切换随机池 */
  greeting: string;
  sayHelloPool: string[];
  /** 作者在线状态：支持图片路径 statusImg 或文字/Emoji */
  statusEmoji: string;
  statusImg?: string;
  skills: string[];
  social: SocialLink[];
  /** 首次进站顶部时段问候胶囊 */
  greetingBox: {
    enable: boolean;
    list: GreetingRule[];
  };
  /** 侧边栏双面翻转微信/二维码卡片 */
  weixinCard: {
    enable: boolean;
    face?: string;
    backFace?: string;
  };
}

export const profileConfig: ProfileConfig = {
  name: "AnZhiYu",
  avatar: "/img/demo/anime/avatar-anime.jpg",
  bio: "这有关于<b>产品、设计、开发</b>相关的问题和看法，还有文章翻译和日常分享。",
  greeting: "👋 欢迎光临小站",
  sayHelloPool: [
    "🤖️ 数码科技爱好者",
    "🔍 分享与热心帮助",
    "🏠 智能家居小能手",
    "🔨 设计开发一条龙",
    "🤝 专修交互与设计",
    "🏃 脚踏实地行动派",
    "🧱 团队小组发动机",
    "💢 壮汉人狠话不多",
  ],
  statusEmoji: "✨",
  skills: [
    "🤖️ 数码科技爱好者",
    "🔍 分享与热心帮助",
    "🔨 设计开发一条龙",
    "🤝 专修交互与设计",
  ],
  social: [
    {
      name: "Github",
      url: "https://github.com/mcxiaochenn/astro-theme-anzhiyu",
      icon: "anzhiyu-icon-github",
      animation: "faa-tada",
    },
    {
      name: "Bilibili",
      url: "https://space.bilibili.com/",
      icon: "anzhiyu-icon-bilibili",
      animation: "faa-tada",
    },
    {
      name: "RSS",
      url: "/rss.xml",
      icon: "anzhiyu-icon-rss",
      animation: "faa-tada",
    },
    {
      name: "Email",
      url: "mailto:example@example.com",
      icon: "anzhiyu-icon-envelope",
      animation: "faa-tada",
    },
  ],
  greetingBox: {
    enable: true,
    list: [
      { greeting: "晚安😴，夜深了注意休息哦～", startTime: 0, endTime: 5 },
      { greeting: "早上好鸭👋，祝你一天好心情！", startTime: 6, endTime: 9 },
      { greeting: "上午好👋，状态满分继续冲～", startTime: 10, endTime: 11 },
      { greeting: "午安👋，吃饱喝足充个电吧～", startTime: 12, endTime: 14 },
      { greeting: "🌈 充实的下午辛苦啦！", startTime: 15, endTime: 18 },
      { greeting: "傍晚好🍔，奖励自己一顿大餐吧！", startTime: 19, endTime: 19 },
      { greeting: "晚上好👋，享受属于自己的轻松时光😌~", startTime: 20, endTime: 24 },
    ],
  },
  weixinCard: {
    enable: false,
  },
};
