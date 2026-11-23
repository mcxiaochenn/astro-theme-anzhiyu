---
title: 长文基准：从 Hexo 到 Astro 的完整迁移札记
date: 2024-11-01 09:30:00
categories:
  - 前端
  - Hexo
tags:
  - Hexo
  - Astro
  - 迁移
  - 长文
description: 覆盖长文场景：多级标题、代码块、表格、引用、列表、图片、脚注与行内公式文本。
cover: /img/default_cover.jpg
ai: true
mathjax: true
---

这是 P1-6 基准站点里最长的一篇文章，用途是给 HTML diff 与像素 diff 提供一段结构足够复杂的正文：多级标题、有序与无序列表、引用、表格、三种语言的代码块、行内代码、图片、加粗斜体删除线，以及脚注和行内公式的原始文本。

## 为什么需要一份固定的参考产物

迁移的验收不能靠肉眼。没有同一份内容喂给上游 Hexo 和迁移民 Astro，两边产出的 HTML 就没有可比性；没有可比的 HTML，像素 diff 也就失去了意义的锚点。所以第一步永远是先把「上游此刻的真实输出」固化下来。

### 三个层次

1. **结构层**：归一化后的 DOM 树与属性集合。
2. **视觉层**：三档视口下的截图像素。
3. **行为层**：暗色模式、pjax、音乐播放器等交互的 DOM 变化序列。

第二层依赖第一层的正确性，第三层依赖前两层的稳定性。三层都建立在同一份 fixture 与同一套配置之上。

### 不能被「优化」的部分

主题的 302 KB Stylus 与 115 KB JavaScript 全部按 `#web_bg`、`#body-wrap`、`#content-inner`、`#rightside` 这类选择器写死。任何 DOM 结构上的「顺手优化」都会引发连锁失效，因此基准里的 class 与 id 必须逐个保留。

> 换渲染引擎，不重做前端。
>
> —— 迁移计划的硬约束之一

## 代码块

下面三种语言各自验证代码高亮的分支。上游使用 highlight.js，行号开启，因此每个代码块会渲染成带行号表格的 figure。

```js
// 计算分组后的文章列表
export function groupPosts(posts) {
  const byYear = new Map();
  for (const post of posts) {
    const year = post.date.getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(post);
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
}
```

```bash
hexo clean
hexo generate
node scripts/verify-css.mjs
```

```json
{
  "baseline": { "commit": "72439d93", "version": "1.7.1" },
  "css": { "indexCssBytes": 0 }
}
```

行内的 `code` 也要覆盖，例如 `pnpm --filter blog build` 与 `node scripts/diff-html.mjs`。

## 表格与列表

| 基准 | 来源 | 用途 |
| --- | --- | --- |
| 样式基准 | `public/css/index.css` | 字节数、gzip、变量值 |
| HTML 基准 | 各页面 HTML | 结构 diff |
| 视觉基准 | Playwright 截图 | 像素 diff |

无序列表：

- 长文与短讯
- 一个分类与多个分类
- 一个标签与多个标签

有序列表：

1. 造 fixture
2. 跑上游 `hexo g`
3. 提取摘要
4. 重跑验证确定性

## 图片与行内元素

![默认封面](/img/default_cover.jpg)

正文中还有 ~~删除线~~、**加粗**、*斜体*、`inline code` 与一个[外链](https://hexo.io/)，以及一条分隔线：

---

## 数学与脚注

行内公式写成 $E = mc^2$，块级公式写成 $$a^2 + b^2 = c^2$$。上游默认关闭 MathJax，因此这里验证的是「公式原文是否被原样保留在 HTML 里」。

这里放一个脚注引用[^note1]，用来观察上游 marked 渲染器对脚注语法的处理方式。

[^note1]: 这是一条脚注定义，迁移时 Astro 侧需要产出可跳转的脚注区块。

## 收尾

文章到这里结束。它的作用是提供足够多的结构变体，而不是讲清楚迁移的全部细节。
