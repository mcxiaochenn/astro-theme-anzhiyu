// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import icons from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import remarkHexoTag, { rehypeHexoInlineP } from "./src/plugins/remark-hexo-tag/index.mjs";
import rehypeAnzhiyuCode from "./src/plugins/rehype-anzhiyu-code.mjs";
import { siteConfig } from "./src/config/site";

export default defineConfig({
  site: siteConfig.url,
  trailingSlash: "always",

  integrations: [
    mdx(),
    svelte(),
    icons(),
    sitemap(),
  ],

  markdown: {
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [remarkHexoTag, remarkMath],
      rehypePlugins: [
        rehypeHexoInlineP,
        rehypeKatex,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "prepend",
            properties: { className: ["headerlink"], ariaHidden: true, tabIndex: -1 },
          },
        ],
        [
          rehypeExternalLinks,
          {
            target: "_blank",
            rel: ["noopener", "noreferrer"],
          },
        ],
        rehypeAnzhiyuCode,
      ],
    }),
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
