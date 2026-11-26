---
title: 关于本站
date: 2025-05-01 08:00:00
layout: page
type: about
permalink: /about/
top_img: /img/default_cover.jpg
---

这是 P1-6 的独立页面 fixture，走 `layout: page` + `type: about` 分支，用来给「非文章页」提供 HTML 与视觉基准。

## 这个基准站点是什么

它是上游 `hexo-theme-anzhiyu` 1.7.1（commit `72439d93`）用固定 fixture 与固定配置构建出来的参考产物站。

## 它解决什么问题

三层验收——HTML diff、像素 diff、特性清单——都需要同一份内容在两套渲染引擎下产出可比较的结果。这个站点提供的正是其中的「上游一侧」。

## 数据来源

- 主题：`_research/anzhiyu-upstream`，只读冻结副本；
- 内容：仓库 `fixtures/` 下的 9 篇文章与本文；
- 配置：`.baseline-work/_config.yml` 的站点配置 + 主题自带 `_config.yml`。

页面正文结束。
