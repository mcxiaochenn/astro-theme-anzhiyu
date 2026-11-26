---
title: 第三方嵌入与卡片标签样本
date: 2025-04-20 11:15:00
categories:
  - 标签测试
tags:
  - tag插件
  - 第三方
description: 覆盖附录 B「第三方嵌入」7 个 tag：bilibili / dogeplayer / mermaid / link / flink / tip / intCard。
cover: false
top_img: /img/512.png
---

本页覆盖第三方嵌入与卡片类 tag。所有嵌入都只生成静态 HTML，构建期不会访问网络。

## bilibili

{% bilibili BV1xx411c7mD 12:00 false %}

## dogeplayer

{% dogeplayer 123456 vcode123 %}

## mermaid

{% mermaid %}
graph TD
  A[Hexo] --> B[fixture]
  B --> C[baseline]
  C --> D[Astro]
{% endmermaid %}

## tip

{% tip %}
tip 默认样式的提示块。
{% endtip %}

{% tip warning %}
带 warning 类名的 tip。
{% endtip %}

## link

{% link 示例站点, 外链示例, https://example.com, /img/favicon.ico %}

## intCard

{% intCard /about/ /img/default_cover.jpg 最爱 介绍卡片 /img/512.png AnZhiYu 基准站点 %}

## flink

{% flink %}
- class_name: 基准友链
  class_desc: 下游对比用的固定友链数据
  flink_style: anzhiyu
  link_list:
    - name: 示例站点
      link: https://example.com
      avatar: /img/512.png
      descr: 友链描述
- class_name: 卡片风格
  class_desc: flexcard 分支
  flink_style: flexcard
  link_list:
    - name: 站点乙
      link: https://example.com/b
      avatar: /img/512.png
      descr: 卡片风格描述
      siteshot: /img/comment_bg.png
{% endflink %}

正文结束。
