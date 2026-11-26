---
title: 行内标签全量样本
date: 2025-03-05 14:10:00
categories:
  - 标签测试
tags:
  - tag插件
  - 行内
description: 覆盖附录 B「行内语义」12 个 tag：u / emp / wavy / del / kbd / psw / label / inlineImg / icon / btn / p / span。
cover: /img/512.png
toc: false
---

本页把行内语义的 12 个 tag 各用一次，用来验证 remark 侧解析出的 HTML 是否与上游一致。

## 六种行内修饰

普通文字：{% u 带下划线的文字 %}，{% emp 带着重号的文字 %}，{% wavy 波浪线文字 %}，{% del 被删除的文字 %}，按 {% kbd Ctrl %} 组合键，密码是 {% psw hunter2 %}。

## label

默认标签：{% label 默认 %}；蓝色标签：{% label 蓝色 blue %}；红色标签：{% label 红色 red %}。

## 图片与图标

行内小图：{% inlineImg /img/512.png 1.5em %}，图标：{% icon anzhiyu-icon-home, 1.2 %}。

## 按钮

行内按钮：{% btn /about/, 前往关于页, anzhiyu-icon-paper-plane, larger %}。

## p 与 span

段落标签：{% p h2, 这是一个 h2 级别的段落标签 %}。

行内 span：{% span red, 这是一个红色 span %}。

## 结尾

以上 12 个 tag 全部覆盖，正文结束。
