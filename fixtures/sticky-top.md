---
title: 置顶与推荐位样本
date: 2025-02-02 08:20:00
categories:
  - 前端
tags:
  - Hexo
  - 置顶
description: sticky + top + swiper_index + top_group_index 四个 frontmatter 变体同时出现，验证首页置顶、推荐位与封面卡片的取值优先级。
cover: /img/default_cover.jpg
sticky: 10
top: true
swiper_index: 3
top_group_index: 2
---

这篇文章同时打开了四个和「位置」有关的 frontmatter：

- `sticky: 10` 让 Hexo 首页生成器把它放到最前面；
- `top: true` 让首页卡片渲染出置顶徽标（`article.top || article.sticky > 0`）；
- `swiper_index: 3` 参与轮播卡片排序（当前主题配置关闭了 swiper，仅保留数据）；
- `top_group_index: 2` 参与顶部推荐位排序。

## 取值优先级

`includes/header/index.pug` 里封面的取值顺序是 `page.top_img || page.cover || page.randomcover`。本文只设置 `cover`，因此顶部大图与卡片封面使用同一张图。

## 正文

置顶文章的正文不需要太长，关键在 frontmatter 的组合。多写一段是为了让摘要截断和阅读进度条有内容可用：固定内容、固定配置、固定产物，三者缺一不可。
