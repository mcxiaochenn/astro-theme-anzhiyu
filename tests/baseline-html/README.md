# baseline-html.tar.gz

上游 Hexo 主题基线（`docs/reference/baseline.json` 里的 49 页）的 HTML 归档，给
`scripts/diff-html.mjs --all` 当参考产物用。CI 上没有 `.baseline-work/`
（被 gitignore），所以只把 HTML 打进归档进仓库，不再走 Release / CI cache。

## 内容约定（写死，生成器和解压脚本都依赖）

- 只含 `.html`（49 个文件 / 2,254,657 字节），**不含图片 / CSS / JS**；
- 归档内路径 = 相对 `.baseline-work/public` 的路径，POSIX `/` 分隔；
- 解压根目录就是 baseline HTML 根目录（即 `BASELINE_HTML_DIR`）：
  `index.html`、`404.html`、`about/index.html`、`categories/前端/index.html`；
- 49 个文件与 `docs/reference/baseline.json` 的 `pages` 一一对应；逐文件字节数 / SHA256
  记在 `baseline-html.manifest.json`，整包 SHA256 也在里面。

当前归档：

| 项 | 值 |
| --- | --- |
| 文件 | 49 |
| 原始 HTML | 2,254,657 字节 |
| 归档 | 501,268 字节（489.5 KiB，gzip 9） |
| SHA256 | `7e1449d2e2df328cf028b8014e32cfdffe15fff3655dfce7d36d0348bd5908aa` |

## 生成（需要本机有 `.baseline-work/public`，即 hexo g 产物）

```bash
node tests/baseline-html/make-baseline-html-archive.mjs
```

归档是确定性的（条目按 UTF-8 字节序、固定 mtime/uid/gid/mode、gzip 不写 mtime），
同一份源目录重复生成 SHA256 不变。生成后把 `baseline-html.tar.gz` +
`baseline-html.manifest.json` 一起提交。

流程备注：增量构建若遇 FATAL（`reproducible.js` 排序 null date——旧 `db.json`
缓存 + 新增文章的过渡态竞态），先删 `.baseline-work/db.json` 再 generate。

## 解压（CI 与本地同一条命令）

```bash
pnpm build:baseline           # 基线 fixture 构建（diff-html 的比对对象是这个 dist/）
pnpm baseline:extract        # = node scripts/extract-baseline-html.mjs
# → .baseline-html/（gitignore）
BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
```

细节见 `docs/notes/topics/P-baseline-html-ci.md`。
