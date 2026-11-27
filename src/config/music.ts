export interface MusicConfig {
  enable: boolean;
  meting: {
    id: string;
    server: "netease" | "tencent" | "kugou" | "xiami" | "baidu";
    type: "playlist" | "song" | "album" | "search" | "artist";
  };
  theme: string;
}

export const musicConfig: MusicConfig = {
  enable: true,
  meting: {
    id: "8152976493",
    server: "netease",
    type: "playlist",
  },
  theme: "#425aef",
};
