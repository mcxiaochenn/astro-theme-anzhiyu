# vendor/nib

`nib` 的 Stylus 源码拷贝，供 `vite-plugin-stylus-hexo-config` 在没有安装 nib 时解析
Hexo 主题里的 `@import 'nib'`。

- 来源：npm 包 `nib@1.2.0`（MIT，见 `LICENSE`），从本机 Hexo 安装
  `xcAnzhiyu/node_modules/nib` 拷贝
- 只拷了 `lib/nib/**`（31 个 `.styl`，31,702 字节），没有拷 `lib/nib.js` 与
  `lib/nodes/*`：那是 nib 的 JS 插件本体，负责 canvas 图像函数，本仓库不用
- `index.styl` 是本仓库写的兼容层入口（内容见该文件头注释），`lib/nib/**` 未改动

## 为什么不用 nib 的 JS 插件

Vite 8 的 Stylus 预处理器在 worker 里执行，只能把可序列化的 options 传进去；
nib 的插件函数（`style.include` / `style.define`）在 transform 钩子里拿不到
Stylus 实例。把 nib 的 Stylus 源码在文本层面内联，是当前管线里语义最接近的做法。

## 需要用 nib 的其他项目

本包不声明 nib 依赖。如果目标项目自己装了 nib，可以在插件选项里用
`includePaths` 指向自己的 nib 目录，或保持默认（本 vendor 目录）。

## 升级

```pwsh
Copy-Item <nib 包>/lib/nib -Destination vendor/nib/lib/nib -Recurse -Force
Copy-Item <nib 包>/LICENSE -Destination vendor/nib/LICENSE -Force
```
