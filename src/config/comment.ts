export type CommentProvider = "twikoo" | "artalk" | "waline" | "giscus" | "none";

export interface CommentConfig {
  provider: CommentProvider;
  barrage: boolean;
  twikoo?: {
    envId: string;
    region?: string;
  };
  artalk?: {
    server: string;
    site: string;
  };
  waline?: {
    serverURL: string;
  };
  giscus?: {
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
  };
}

export const commentConfig: CommentConfig = {
  provider: "none",
  barrage: true,
  twikoo: {
    envId: "",
  },
  artalk: {
    server: "",
    site: "",
  },
};
