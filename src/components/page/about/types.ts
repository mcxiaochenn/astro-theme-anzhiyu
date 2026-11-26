/**
 * about 页数据形状 — 上游 `layout/includes/page/about.pug` 读取的 `site.data.about`
 * （`src/data/about.yml`）字段集合。
 *
 * 上游用解构 + `item.xxx` 直接取值，缺字段会在渲染期抛错（例如 `item.map.background`）；
 * 这里统一标成可选，模板侧按各段的 `if` 分支跳过，避免坏数据把整页构建炸掉。
 */

export interface AboutAvatarSkills {
  left?: string[]
  right?: string[]
}

/** `aboutsiteTips.word`：最后两项分别给 `data-up` / `data-show`，前面的是静态轮播项。 */
export interface AboutSiteTips {
  tips?: string
  title1?: string
  title2?: string
  word?: string[]
}

export interface AboutTextTips {
  tips?: string
  title?: string
}

export interface AboutCareerItem {
  desc?: string
  color?: string
}

export interface AboutCareers extends AboutTextTips {
  list?: AboutCareerItem[]
  /** 不为空时在 careers 卡片底部输出一张图（about.pug:89-90）。 */
  img?: string
}

export interface AboutMap {
  background?: string
  backgroundDark?: string
  title?: string
  StrengthenTitle?: string
}

export interface AboutSelfInfo {
  selfInfoTips1?: string
  selfInfoContentYear?: string
  selfInfoTips2?: string
  selfInfoContent2?: string
  selfInfoTips3?: string
  selfInfoContent3?: string
}

export interface AboutPersonalities {
  author_name?: string
  personality_type?: string
  photo_url?: string
  personality_img?: string
  name_url?: string
  personality_type_color?: string
}

export interface AboutMaxim {
  maxim_tips?: string
  maxim_top?: string
  maxim_bottom?: string
}

export interface AboutBuff {
  buff_tips?: string
  buff_top?: string
  buff_bottom?: string
}

export interface AboutGame {
  game_tips?: string
  game_title?: string
  game_uid?: string
  game_bg?: string
}

export interface AboutComicItem {
  name?: string
  href?: string
  cover?: string
}

export interface AboutComic {
  comic_tips?: string
  comic_title?: string
  comic_list?: AboutComicItem[]
}

export interface AboutMusic {
  music_tips?: string
  music_title?: string
  music_link?: string
  music_bg?: string
}

export interface AboutLike {
  like_tips?: string
  like_title?: string
  like_bottom?: string
  like_bg?: string
}

/** `item.statistic`：仅在 `theme.LA.enable` / `theme.umami.enable` 打开时渲染。 */
export interface AboutStatistic {
  cover?: string
  link?: string
  text?: string
}

/** `item.reward_list` 的单项（about.pug:224-286）。 */
export interface AboutRewardItem {
  name?: string
  amount?: number
  /** 展示用后缀（如「元」）；上游只在金额 < 50 时拼接。 */
  suffix?: string
  datatime?: string
}

/** `site.data.about` 的单项（上游 `each item in aboutData`）。 */
export interface AboutItem {
  subtitle?: string
  name?: string
  avatarImg?: string
  description?: string
  helloAbout?: string
  skillsTips?: AboutTextTips
  careers?: AboutCareers
  avatarSkills?: AboutAvatarSkills
  aboutsiteTips?: AboutSiteTips
  map?: AboutMap
  selfInfo?: AboutSelfInfo
  personalities?: AboutPersonalities
  maxim?: AboutMaxim
  buff?: AboutBuff
  game?: AboutGame
  comic?: AboutComic
  music?: AboutMusic
  like?: AboutLike
  statistic?: AboutStatistic
  reward_list?: AboutRewardItem[]
}

/** `site.data.creativity` 的单项（skills 卡片里的图标列表）。 */
export interface CreativityItem {
  name?: string
  icon?: string
  color?: string
}

export interface CreativityGroup {
  creativity_list?: CreativityItem[]
}
