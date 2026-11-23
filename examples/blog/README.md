# examples/blog

Phase 1 的验证站。目的只有一个：证明上游为 Hexo 写的 Stylus 能在 Astro 里原样编译。

## 里面是什么

| 文件 | 来源 |
| --- | --- |
| `theme.config.yml` | 上游 [anzhiyu-c/hexo-theme-anzhiyu](https://github.com/anzhiyu-c/hexo-theme-anzhiyu) `main` 分支的 `_config.yml`，未改动 |
| `src/styles/var.styl` | 上游 `source/css/var.styl`，未改动（63 处 `hexo-config`） |
| `src/styles/probe.styl` | 本项目所写，消费上游变量 |
| `src/pages/index.astro` | 本项目所写 |

上游文件按 GPL-3.0 授权，与本仓库一致。

## 跑起来

```bash
pnpm install
pnpm --filter blog dev
```

或者从仓库根 `pnpm build`。

## 验证的是什么

- `.styl` 的 glob `@import` 在 Vite 8 管线里可用
- `hexo-config()` 能被 [`vite-plugin-stylus-hexo-config`](../../packages/vite-plugin-stylus-hexo-config/) 正确替换
- 上游 `var.styl` 里 `convert()`、`unquote()`、`alpha()` 与条件分支的行为与 Hexo 下一致

构建时控制台会打印类似：

```
[stylus-hexo-config] probe.styl: 33 个配置键, 展开 2 个文件
```

那 5 条 `在配置里不存在，按 null 处理` 的警告是正常的——它们对应上游 `_config.yml` 里被注释掉的可选项。

## 这不是最终形态

这个站点没有主题组件、没有路由、没有内容集合，只验证样式管线。真正的 `packages/astro-theme-anzhiyu` 在 Phase 2 之后才会有。
