export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export interface ProfileConfig {
  name: string;
  avatar: string;
  bio: string;
  greeting: string;
  statusEmoji: string;
  skills: string[];
  social: SocialLink[];
}

export const profileConfig: ProfileConfig = {
  name: "AnZhiYu",
  avatar: "/img/demo/anime/avatar-anime.jpg",
  bio: "这有关于产品、设计、开发相关的问题和看法，还有文章翻译和日常分享。",
  greeting: "欢迎光临小站 👋",
  statusEmoji: "✨",
  skills: [
    "🤖️ 数码科技爱好者",
    "🔍 分享与热心帮助",
    "🔨 设计开发一条龙",
    "🤝 专修交互与设计",
  ],
  social: [
    {
      name: "GitHub",
      url: "https://github.com/mcxiaochenn/astro-theme-anzhiyu",
      icon: "fa6-brands:github",
    },
    {
      name: "BiliBili",
      url: "https://space.bilibili.com/",
      icon: "fa6-brands:bilibili",
    },
    {
      name: "RSS",
      url: "/rss.xml",
      icon: "fa6-solid:rss",
    },
    {
      name: "Email",
      url: "mailto:example@example.com",
      icon: "fa6-solid:envelope",
    },
  ],
};
