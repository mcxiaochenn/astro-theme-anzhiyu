---
title: "AnZhiYu 标签语法演示"
date: 2025-12-05 10:00:00
categories:
  - "标签演示"
tags:
  - "Hexo Tag"
  - "样式"
  - "演示"
abbrlink: a102
cover: /img/demo/anime/anime-03-tall.jpg
description: "主题内置的 42 个 Hexo 标签语法演示：note、tabs、tip、折叠块、音视频、卡片、友链等一应俱全。"
swiper_index: 2
---

AnZhiYu 主题内置 **42 个 Hexo 标签**（由 `remark-hexo-tag` 插件在 Astro 侧完整复刻）。本文按分组演示全部标签的渲染效果。

## 提示块（note 系列）

{% note blue 'fas fa-info-circle' %}
info 提示块：蓝色，带图标。
{% endnote %}

{% note green 'fas fa-check-circle' %}
success 提示块：绿色。
{% endnote %}

{% note red 'fas fa-times-circle' %}
danger 提示块：红色。
{% endnote %}

{% note yellow 'fas fa-exclamation-circle' %}
warning 提示块：黄色，无图标时也能正常折行。
{% endnote %}

{% tip %}
tip 小贴士：轻量提示样式。
{% endtip %}

## 折叠与标签页

{% hideToggle 点击展开详情 %}
折叠块里的内容：可以放**任意 Markdown**，包括列表和代码。
{% endhideToggle %}

{% hideInline 行内折叠内容, 点我看看 %}

{% tabs test-tabs %}
<!-- tab 第一页 -->
标签页第一页的内容。
<!-- endtab -->
<!-- tab 第二页 -->
标签页第二页的内容。
<!-- endtab -->
{% endtabs %}

## 交互控件

{% checkbox checked %} 复选框（已勾选）
{% checkbox %} 复选框（未勾选）
{% radio checked %} 单选（已选）
{% radio %} 单选（未选）

{% btn /about/, 前往关于页, fa-solid fa-address-card %}

## 媒体

{% video https://www.w3schools.com/html/mov_bbb.mp4 %}

{% audio https://www.w3schools.com/html/horse.mp3 %}

{% bilibili BV1GJ411x7h7 %}

## 卡片与链接

{% link AnZhiYu Astro 仓库, https://github.com/mcxiaochenn/astro-theme-anzhiyu, /img/demo/anime/avatar-anime.jpg %}

{% image /img/demo/anime/anime-06-tall.jpg, 图片标签演示 %}

{% cell 图标卡片, 支持自定义图标与链接, https://github.com/mcxiaochenn/astro-theme-anzhiyu %}

## 友链与时间线

{% flink %}
- name: AnZhiYu Astro
  link: https://github.com/mcxiaochenn/astro-theme-anzhiyu
  avatar: /img/demo/anime/avatar-anime.jpg
  descr: hexo-theme-anzhiyu 的 Astro 移植版
{% endflink %}

{% timeline 2025 %}
<!-- node 12月 样式测试 -->
本文写成。
<!-- node 12月 标签演示 -->
本文写成。
{% endtimeline %}

## 结语

以上覆盖了 inline / block / media / thirdparty 四组标签。标签语法与上游 Hexo 版本一致，旧文章可以直接平移。
