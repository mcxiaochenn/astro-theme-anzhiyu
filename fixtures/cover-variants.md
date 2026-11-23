---
title: 无封面与自定义顶部图
date: 2025-02-20 19:45:00
categories:
  - 生活
tags:
  - 封面
  - 图片
description: cover 关闭、top_img 指向另一张图、main_color 写死，验证封面与顶部图的四个分支。
cover: false
top_img: /img/comment_bg.png
main_color: '#3e5658'
aside: true
---

本文的 frontmatter 故意让两张图分叉：

- `cover: false`：首页卡片不显示封面；
- `top_img: /img/comment_bg.png`：文章顶部大图使用另一张图；
- `main_color: '#3e5658'`：主色调写死为十六进制，主题会跳过取色请求。

## 三个分支的判定点

首页卡片用 `article.cover === false || !theme.cover.index_enable` 判断是否输出 `no-cover` 类；顶部图用 `page.top_img || page.cover || page.randomcover` 取值；主色用 `page.main_color` 直接注入 `GLOBAL_CONFIG_SITE`。

## 正文

正文里再放一张行内图片，观察 `lazyload: site` 配置对 `<img src>` 的重写：上游主题会把 `src` 换成 base64 占位图并写入 `data-lazy-src`。

![评论背景](/img/comment_bg.png)

段落结束。
