---
title: abbrlink 覆盖末段样本
date: 2024-11-20 10:30:00
categories:
  - 随笔
tags:
  - 短讯
abbrlink: 24531
description: 带数字 abbrlink 的 fixture：文章 URL 末段应为 abbrlink 而不是文件 id，验证归档、分类、标签与 404 页的链接解析和实际路由一致。
---

这篇文章的 front-matter 写了 `abbrlink: 24531`。上游 abbrlink 插件会把 permalink
的最后一段从 `:title`（本例即文件 id `abbrlink-post`）换成 `:abbrlink`，所以本文的
真实路由是 `/2024/11/20/24531/`，而不是 `/2024/11/20/abbrlink-post/`。

## 验证点

- 归档列表（`/archives/`）里本文的链接指向 `/2024/11/20/24531/`；
- 分类页（`/categories/随笔/`）与标签页（`/tags/短讯/`）里的链接同上；
- 404 页的「文章列表」链接同上；
- 文章页自身的 `og:url` / 版权块 URL 同上。

任一列表用文件 id 拼末段都会 404——B4 把「末段 = `abbrlink ?? id`」收口成
`site.ts` 的 `postSlugOf()`，列表与路由共用同一段解析。

（完）
