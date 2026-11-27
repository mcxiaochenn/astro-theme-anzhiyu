import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const categoryPath: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.array(categoryPath)]),
);

const imageOrDisabled = z.union([z.string(), z.boolean()]);

/**
 * 博客文章集合（src/content/posts/）
 */
const blog = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/posts",
  }),
  schema: z
    .object({
      title: z.string(),
      date: z.coerce.date().optional(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      categories: z.array(categoryPath).default([]),
      cover: imageOrDisabled.optional(),
      top_img: imageOrDisabled.optional(),
      description: z.string().optional(),
      sticky: z.number().optional(),
      top: z.boolean().optional(),
      swiper_index: z.number().optional(),
      top_group_index: z.number().optional(),
      abbrlink: z.union([z.string(), z.number()]).optional(),
      main_color: z.string().optional(),
      ai: z.union([z.string(), z.boolean()]).optional(),
      mathjax: z.boolean().optional(),
      katex: z.boolean().optional(),
      comments: z.boolean().default(true),
      toc: z.boolean().default(true),
      aside: z.boolean().default(true),
      copyright: z.boolean().default(true),
      permalink: z.string().optional(),
      draft: z.boolean().default(false),
    })
    .passthrough(),
});

/**
 * 固定独立页面集合（src/content/spec/）
 */
const spec = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/spec",
  }),
  schema: z
    .object({
      title: z.string().optional(),
      type: z.string().optional(),
      comments: z.boolean().default(true),
      aside: z.boolean().default(false),
    })
    .passthrough(),
});

export const collections = { blog, spec };
