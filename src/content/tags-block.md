---
title: 块级容器标签全量样本
date: 2025-03-18 09:00:00
categories:
  - 标签测试
tags:
  - tag插件
  - 容器
description: 覆盖附录 B「块级容器」12 个 tag：note / subnote / tabs / subtabs / subsubtabs / hideInline / hideBlock / hideToggle / folding / checkbox / radio / timeline。
cover: /img/default_cover.jpg
---

本页覆盖块级容器类 tag。每个 tag 都带了会触发不同渲染分支的参数。

## note 系列

{% note info %}
默认 flat 风格的 note。
{% endnote %}

{% note warning modern %}
modern 风格的 warning note。
{% endnote %}

{% note success simple %}
simple 风格的 success note。
{% endnote %}

{% note info fa-bell %}
带图标的 note（fa 开头的第二个参数会被识别成图标）。
{% endnote %}

{% subnote info %}
subnote 与 note 共用同一个渲染函数。
{% endsubnote %}

## tabs 系列

{% tabs 基准标签, 2 %}
<!-- tab 第一个标签 -->
第一个标签页的内容，支持 **Markdown**。
<!-- endtab -->
<!-- tab 第二个标签 -->
第二个标签页的内容，默认激活第二页。
<!-- endtab -->
{% endtabs %}

{% subtabs 子标签 %}
<!-- tab 子标签一 -->
sub 标签一
<!-- endtab -->
<!-- tab 子标签二 -->
sub 标签二
<!-- endtab %}
{% endsubtabs %}

{% subsubtabs 孙标签 %}
<!-- tab 孙标签一 -->
subsub 标签一
<!-- endtab %}
{% endsubsubtabs %}

## hide 系列

行内隐藏：{% hideInline 这是藏起来的行内文字, 点我查看 %}。

{% hideBlock 点我展开隐藏块 %}
隐藏块里的 **Markdown** 内容。
{% endhideBlock %}

{% hideToggle 点我折叠 %}
折叠面板里的内容。
{% endhideToggle %}

## folding

{% folding 一个可折叠的 details %}
folding 里面的内容，渲染时会先走一遍 Markdown。
{% endfolding %}

## checkbox / radio

{% checkbox 已完成的事项 %}
{% checkbox checked, 已勾选的事项 %}
{% radio 单选选项一 %}
{% radio checked, 已勾选的单选 %}

## timeline

{% timeline 基准事件时间线, blue %}
<!-- timeline 2024-11-01 -->
第一版 fixture 完成。
<!-- endtimeline -->
<!-- timeline 2025-03-18 -->
块级标签补全。
<!-- endtimeline -->
{% endtimeline %}

正文结束。
