/**
 * slugger.ts — `hexo-renderer-marked` 的标题 id / headerlink 渲染语义（P2-8 M3）。
 *
 * 上游链路（`.baseline-work/node_modules/hexo-renderer-marked/lib/renderer.js:26-60`）：
 *
 *   const anchorId = (str, transformOption) =>
 *     slugize(stripHTML(unescape(str)).trim(), { transform: transformOption });
 *
 *   heading({ tokens, depth: level }) {
 *     let text = this.parser.parseInline(tokens);
 *     ...
 *     let id = anchorId(text, this.options.modifyAnchors);
 *     if (headingId[id]) id += `-${headingId[id]++}`; else headingId[id] = 1;
 *     return `<h${level} id="${id}"><a href="#${id}" class="headerlink" title="${stripHTML(text)}"></a>${text}</h${level}>`;
 *   }
 *
 * 关键点（与 github-slugger 的差异，也是本文件存在的理由）：
 *   - `modifyAnchors: 0`（hexo-renderer-marked 默认）→ **不做大小写转换**，
 *     `galleryGroup` / `intCard` 这类驼峰原样保留；
 *   - 分隔符只作用于 `[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+` 这一段 ASCII 集合，
 *     中文标点（「」、，、。…）**不在其中**，所以 `不能被「优化」的部分` 原样保留；
 *   - `p 与 span` → `p-与-span`、`checkbox / radio` → `checkbox-radio`；
 *   - 重复标题依次追加 `-1`、`-2`……（第一份不加后缀）。
 *
 * 抽成纯函数而不是改 `astro.config.mjs` 的 rehype 管线：
 *   渲染层（P2-7 M1）已经冻结，正文 HTML 由 `entry.rendered.html` 直接拿到；
 *   文章页在输出前用 {@link rewriteHeadings} 把 Astro/github-slugger 的 id 改写回
 *   Hexo 口径，并补上 `a.headerlink`（基准站每篇文章的标题都带它）。
 */
import { stripHtml } from './helpers.ts';

/* ------------------------------------------------------------------ */
/* 1. hexo-util slugize                                                */
/* ------------------------------------------------------------------ */

/** 控制字符（hexo-util/slugize.js:11）。 */
const rControl = /[\u0000-\u001f]/g;

/** 会被替换成分隔符的 ASCII 标点/空白（hexo-util/slugize.js:12）。 */
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+/g;

/**
 * NFKD 分解无法还原的拉丁连字/特殊字母（hexo-util/escape_diacritic.js 的手工表里
 * 与中文站点可能遇到的子集）。CJK 不受影响，NFKD 对汉字是恒等变换。
 */
const LIGATURES: Record<string, string> = {
  Æ: 'AE',
  æ: 'ae',
  Œ: 'OE',
  œ: 'oe',
  Ø: 'O',
  ø: 'o',
  Ð: 'D',
  ð: 'd',
  Þ: 'TH',
  þ: 'th',
  Ł: 'L',
  ł: 'l',
  ß: 's',
  Đ: 'D',
  đ: 'd',
};

/** hexo-util `escape_diacritic()`：非 ASCII 字符逐一映射到基本字母。 */
function escapeDiacritic(str: string): string {
  return str.replace(/[^\u0000-\u007E]/g, (char) => {
    if (LIGATURES[char] !== undefined) return LIGATURES[char];
    const decomposed = char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return decomposed || char;
  });
}

export interface SlugizeOptions {
  /** 分隔符，默认 `-`。 */
  separator?: string;
  /** 0 = 原样（默认）、1 = 小写、2 = 大写。上游 `modifyAnchors` 对应值。 */
  transform?: 0 | 1 | 2;
}

/**
 * hexo-util `slugize()` 的等价实现（`hexo-util/dist/slugize.js`）。
 *
 * 注意：`transform` 是**先替换分隔符再转大小写**，与上游 `switch` 的位置一致。
 */
export function slugize(str: string, options: SlugizeOptions = {}): string {
  if (typeof str !== 'string') throw new TypeError('str must be a string!');

  const separator = options.separator || '-';
  const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const result = escapeDiacritic(str)
    .replace(rControl, '')
    .replace(rSpecial, separator)
    .replace(new RegExp(`${escapedSep}{2,}`, 'g'), separator)
    .replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');

  switch (options.transform) {
    case 1:
      return result.toLowerCase();
    case 2:
      return result.toUpperCase();
    default:
      return result;
  }
}

/* ------------------------------------------------------------------ */
/* 2. 标题文本与 id                                                    */
/* ------------------------------------------------------------------ */

/** hexo-util `unescapeHTML()`：只处理会出现在 marked 输出里的实体。 */
export function unescapeHtml(str: string): string {
  return str.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g, (all, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    switch (name.toLowerCase()) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      case 'nbsp':
        return '\u00a0';
      default:
        return all;
    }
  });
}

/** `anchorId()` 的前半段：`stripHTML(unescape(str)).trim()`。 */
export function headingPlainText(html: string): string {
  return unescapeHtml(stripHtml(html)).trim();
}

/** 一个标题在渲染后的信息（结构上兼容 `components/widget/toc.ts` 的 `TocHeading`）。 */
export interface HeadingInfo {
  level: number;
  id: string;
  text: string;
}

/**
 * 创建**有状态**的标题 id 生成器：同一篇正文里重复标题按上游规则追加 `-1`、`-2`。
 *
 * 上游的计数键是「基础 slug」，不是最终 id，所以第二个重复项是 `x-1`，第三个是 `x-2`。
 */
export function createHeadingSlugger(
  transform: 0 | 1 | 2 = 0,
): (textHtml: string) => string {
  const counters = new Map<string, number>();
  return (textHtml: string): string => {
    const base = slugize(headingPlainText(textHtml), { transform });
    const count = counters.get(base);
    if (count === undefined) {
      counters.set(base, 1);
      return base;
    }
    counters.set(base, count + 1);
    return `${base}-${count}`;
  };
}

/* ------------------------------------------------------------------ */
/* 3. 正文标题重写                                                     */
/* ------------------------------------------------------------------ */

/**
 * `rewriteHeadings` 的匹配规则：连同标题后面的**一个换行**一起吃掉。
 * 上游 hexo-renderer-marked 覆写的 heading 渲染器不在 `</hN>` 后补换行，
 * 而 remark-rehype 会在块级元素之间插 `\n`；这里去掉标题后的那个换行，
 * 保证 `<hN>` 后紧跟下一个块级标签（`<hN>` 之前的换行保持不动）。
 */
const HEADING_RE = /<h([1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>\n?/g;
const EXISTING_HEADERLINK_RE = /^<a\b[^>]*class="[^"]*\bheaderlink\b[^"]*"[^>]*><\/a>/;

export interface RewriteHeadingsOptions {
  /** 上游 `modifyAnchors`，基准站为 0。 */
  transform?: 0 | 1 | 2;
  /** 是否补 `a.headerlink`（默认 true，基准站 `anchor: false` 下 marked 仍然输出）。 */
  headerlink?: boolean;
}

export interface RewriteHeadingsResult {
  html: string;
  /** 正文里出现的全部 h1–h6（不含脚注区块的 `Footnotes` 标题）。 */
  headings: HeadingInfo[];
}

/**
 * 把 Astro/github-slugger 产出的标题改写成 Hexo marked 的形态：
 *
 *   <h2 id="…"><a href="#…" class="headerlink" title="…"></a>文本</h2>
 *
 * 跳过 `#footnote-label`（remark-gfm 脚注区块的 sr-only 标题；上游 marked 没有脚注，
 * 这一块本身是已知的「有意升级」差异，不参与 TOC）。
 */
export function rewriteHeadings(
  html: string,
  options: RewriteHeadingsOptions = {},
): RewriteHeadingsResult {
  const slug = createHeadingSlugger(options.transform ?? 0);
  const withHeaderlink = options.headerlink !== false;
  const headings: HeadingInfo[] = [];

  const output = html.replace(HEADING_RE, (all, levelText: string, attrText: string, inner: string) => {
    // 脚注区块标题：原样保留，不进 TOC
    if (/\bid="footnote-label"/.test(attrText)) return all;

    // 幂等：如果调用方传进来的已经是重写过的 HTML，先摘掉旧锚点再算
    const content = inner.replace(EXISTING_HEADERLINK_RE, '');
    const text = headingPlainText(content);
    const id = slug(content);
    const level = Number(levelText);

    headings.push({ level, id, text });

    const attrs = attrText.replace(/\s+\bid="[^"]*"/, '');
    const anchor = withHeaderlink
      ? `<a href="#${id}" class="headerlink" title="${stripHtml(content)}"></a>`
      : '';
    return `<h${level} id="${id}"${attrs}>${anchor}${content}</h${level}>`;
  });

  return { html: output, headings };
}

/**
 * 只抽取标题、不改写 HTML（给不需要 headerlink 的调用方）。
 */
export function extractHeadings(html: string): HeadingInfo[] {
  return rewriteHeadings(html, { headerlink: false }).headings;
}

/* ------------------------------------------------------------------ */
/* 4. 上游渲染缺陷 / 差异在「标题集合」上的投影                          */
/* ------------------------------------------------------------------ */

/**
 * 上游 `hexo-renderer-marked` 的标题吞噬缺陷（基线可见）：`{% videos %}` /
 * `{% sitegroup %}` 容器会把紧邻其前的 Markdown 标题吞掉，1.7.1 基线里
 * `## videos`、`## sitegroup` 以字面文本留在正文，因此既不是标题、也不进 TOC。
 * 我们的 tag 插件按正常 Markdown 渲染成 `h2`，描述抽取（`get_page_fill_description`
 * 只认 h1–h6）与 TOC 都会多出这两项。
 *
 * 规则只认这两种容器，其它标题与正文都不动。
 */
export const SWALLOWED_HEADING_RE =
  /<h([1-6])\b([^>]*)>((?:(?!<h[1-6]\b)[\s\S])*?)<\/h\1>\s*<div class="(?:videos|site-card-group)["'\s>]/g;

/** 从正文里剔除「被 videos / site-card-group 容器吞噬」的标题（上游这些标题不是标题）。 */
export function stripSwallowedHeadings(html: string): string {
  return html.replace(SWALLOWED_HEADING_RE, '');
}

/**
 * M2/U8：上游 `hexo-renderer-marked` 不渲染 GFM 脚注（`docs/reference/upstream-delta.md` U8），
 * 定义行被当成普通段落留在**书写位置**（本基准里紧挨引用所在段）；Astro 侧启用的
 * GFM 会把定义统一挪到文末的 `section[data-footnotes]`。
 *
 * 描述抽取（`get_page_fill_description`）在上游能看到那段定义文本，所以这里：
 *   1. 抽出脚注区块里每个定义（去掉回跳链接）；
 *   2. 删掉整个脚注区块（连同 `Footnotes` 标题，上游没有它）；
 *   3. 把定义段落插回其引用所在段的后面，还原上游的文本顺序。
 * 只影响描述抽取用的副本，正文渲染不受影响。
 */
export function normalizeFootnoteSectionForDescription(html: string): string {
  const sectionRe = /<section\b[^>]*\bdata-footnotes\b[^>]*>[\s\S]*?<\/section>/g;
  const section = sectionRe.exec(html)?.[0];
  if (!section) return html;

  const definitions: Array<{ id: string; html: string }> = [];
  const listItemRe = /<li id="([^"]+)">([\s\S]*?)<\/li>/g;
  for (const match of section.matchAll(listItemRe)) {
    const defHtml = match[2]
      .replace(/<a\b[^>]*\bdata-footnote-backref\b[^>]*>[\s\S]*?<\/a>/g, '')
      .trim();
    if (defHtml) definitions.push({ id: match[1], html: defHtml });
  }

  let output = html.replace(sectionRe, '');
  for (const def of definitions) {
    const refIndex = output.indexOf(`href="#${def.id}"`);
    if (refIndex === -1) continue;
    const paragraphEnd = output.indexOf('</p>', refIndex);
    if (paragraphEnd === -1) continue;
    const insertAt = paragraphEnd + '</p>'.length;
    output = `${output.slice(0, insertAt)}\n${def.html}${output.slice(insertAt)}`;
  }
  return output;
}
