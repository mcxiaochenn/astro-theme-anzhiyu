---
title: "Markdown 样式测试"
date: 2025-12-01 10:00:00
categories:
  - "样式演示"
tags:
  - "Markdown"
  - "样式"
abbrlink: a101
cover: /img/demo/anime/anime-01-tall.jpg
description: "一篇覆盖 Markdown 全元素的样式测试文：标题、列表、引用、代码、表格、图片、脚注等，用来检验主题的正文排版。"
swiper_index: 1
---

这是 AnZhiYu Astro 版的 **Markdown 样式测试** 文，覆盖常用语法元素，用来检验正文排版的每一个细节。

## 文字样式

普通段落。**粗体**、*斜体*、~~删除线~~、`行内代码`、<mark>高亮标记</mark>、<u>下划线</u>。

> 引用块：样式测试中的引用文本。
> 第二行继续引用。

## 列表

无序列表：

- 一级项目
  - 二级项目
    - 三级项目
- 回到一级

有序列表：

1. 第一步
2. 第二步
3. 第三步

任务列表：

- [x] 已完成的事项
- [ ] 待办事项
- [ ] 另一个待办

## 代码

行内代码：`pnpm build`、`const answer = 42`。

代码块（TypeScript）：

```typescript
interface Post {
  title: string
  date: Date
  tags?: string[]
}

export function formatDate(post: Post, locale = 'zh-CN'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(post.date)
}
```

代码块（Bash）：

```bash
# 构建基线 fixture 并对拍
pnpm build:baseline
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
```

## 表格

| 语法 | 示例 | 说明 |
| --- | --- | --- |
| 粗体 | `**text**` | 强调文本 |
| 链接 | `[text](url)` | 超链接 |
| 图片 | `![alt](src)` | 插入图片 |
| 代码 | `` `code` `` | 行内代码 |

## 图片

![二次元占位插画](/img/demo/anime/anime-02-tall.jpg)

## 链接与脚注

普通链接：[AnZhiYu Astro 仓库](https://github.com/mcxiaochenn/astro-theme-anzhiyu)

带标题的链接：[Astro 官网](https://astro.build "Built with Astro")

脚注引用在这里[^note]，定义在文末。

## 分隔线

---

## 结语

以上就是全部 Markdown 基础元素。如果你在阅读本文时发现任何排版异常，欢迎提 Issue。

[^note]: 这是脚注的定义内容。
