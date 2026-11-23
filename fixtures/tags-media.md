---
title: 媒体与卡片标签全量样本
date: 2025-04-01 16:30:00
categories:
  - 标签测试
tags:
  - tag插件
  - 媒体
description: 覆盖附录 B「媒体与卡片」11 个 tag：image / inlineimage / audio / video / videos / gallery / galleryGroup / site / sitegroup / btns / cell。
cover: /img/comment_bg.png
---

本页覆盖媒体与卡片类 tag。媒体地址使用占位 URL 或主题自带图片，只关心生成的 HTML 结构。

## image

{% image /img/default_cover.jpg, alt=图片示例, width=60% %}

## inlineimage

行内图片：{% inlineimage /img/512.png, height=32px %}。

## audio / video

{% audio https://example.com/baseline-demo.mp3 %}

{% video https://example.com/baseline-demo.mp4 %}

## videos

{% videos , 2 %}
{% video https://example.com/baseline-demo-1.mp4 %}
{% video https://example.com/baseline-demo-2.mp4 %}
{% endvideos %}

## gallery

{% gallery %}
![图片一](/img/default_cover.jpg)
![图片二](/img/512.png)
![图片三](/img/comment_bg.png)
{% endgallery %}

## galleryGroup

{% galleryGroup 基准站点 上游参考产物 /album/ /img/default_cover.jpg %}

## site

{% site 示例站点, url=https://example.com, screenshot=/img/default_cover.jpg, avatar=/img/512.png, description=站点卡片说明 %}

## sitegroup

{% sitegroup 友情链接 %}
{% site 站点甲, url=https://example.com/a, screenshot=/img/default_cover.jpg, avatar=/img/512.png, description=说明甲 %}
{% site 站点乙, url=https://example.com/b, screenshot=/img/comment_bg.png, avatar=/img/512.png, description=说明乙 %}
{% endsitegroup %}

## btns / cell

{% btns rounded grid5 %}
{% cell 示例链接, https://example.com, anzhiyufont anzhiyu-icon-arrow-right %}
{% cell 关于页, /about/, anzhiyufont anzhiyu-icon-paper-plane %}
{% endbtns %}

正文结束。
