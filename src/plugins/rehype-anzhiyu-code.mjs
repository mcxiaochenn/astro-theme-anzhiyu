/**
 * src/plugins/rehype-anzhiyu-code.mjs
 *
 * 使用 Astro 内置 Shiki 双主题引擎对代码块进行语法着色，并输出 100% 匹配原版 AnZhiYu
 * `_highlight/highlight.styl` 选择器契约的 DOM 结构：
 *   figure.highlight.<lang>[data-mac="true"]
 *     .highlight-tools
 *       i.anzhiyufont.anzhiyu-icon-angle-down.expand
 *       .code-lang
 *       .copy-notice
 *       i.anzhiyufont.anzhiyu-icon-paste.copy-button
 *     table > tbody > tr
 *       td.gutter > pre > span.line + br
 *       td.code   > pre > span.line + br
 */
import { createHighlighter } from "shiki";
import { visit } from "unist-util-visit";
import { themeConfig } from "../config/theme.ts";

let highlighterPromise = null;

function getHighlighterInstance() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "one-dark-pro"],
      langs: [
        "javascript",
        "typescript",
        "tsx",
        "jsx",
        "json",
        "yaml",
        "toml",
        "html",
        "css",
        "scss",
        "stylus",
        "astro",
        "svelte",
        "vue",
        "bash",
        "shell",
        "powershell",
        "python",
        "rust",
        "go",
        "java",
        "c",
        "cpp",
        "markdown",
        "mdx",
        "sql",
        "dockerfile",
        "diff",
        "ini",
        "xml",
      ],
    });
  }
  return highlighterPromise;
}

function extractText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) return node.children.map(extractText).join("");
  return "";
}

export default function rehypeAnzhiyuCode() {
  return async (tree) => {
    const highlighter = await getHighlighterInstance();
    const loadedLangs = new Set(highlighter.getLoadedLanguages());
    const targets = [];

    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined || node.tagName !== "pre") return;
      // 跳过已经处于 figure.highlight 内部的 pre
      if (parent.type === "element" && (parent.tagName === "td" || parent.tagName === "figure")) return;
      const codeEl = node.children?.find((c) => c.type === "element" && c.tagName === "code");
      if (!codeEl) return;
      targets.push({ node, codeEl, index, parent });
    });

    for (const { codeEl, index, parent } of targets) {
      const classList = Array.isArray(codeEl.properties?.className) ? codeEl.properties.className : [];
      const langClass = classList.find((c) => typeof c === "string" && c.startsWith("language-"));
      const rawLang = langClass ? langClass.slice("language-".length).toLowerCase() : "plaintext";
      let rawCode = extractText(codeEl).replace(/\r\n?/g, "\n");
      if (rawCode.endsWith("\n")) rawCode = rawCode.slice(0, -1);

      // Mermaid 围栏直接转为 .mermaid-wrap 供前端渲染图表
      if (rawLang === "mermaid") {
        parent.children[index] = {
          type: "element",
          tagName: "div",
          properties: { className: ["anzhiyu-mermaid-wrap", "mermaid-wrap"] },
          children: [
            {
              type: "element",
              tagName: "pre",
              properties: { className: ["mermaid"] },
              children: [{ type: "text", value: rawCode }],
            },
          ],
        };
        continue;
      }

      let targetLang = rawLang;
      if (!loadedLangs.has(targetLang)) {
        try {
          await highlighter.loadLanguage(targetLang);
          loadedLangs.add(targetLang);
        } catch {
          targetLang = "text";
        }
      }

      const hast = highlighter.codeToHast(rawCode, {
        lang: targetLang === "plaintext" ? "text" : targetLang,
        themes: {
          light: "github-light",
          dark: "one-dark-pro",
        },
        defaultColor: false,
      });

      const shikiPre = hast.children?.find((c) => c.type === "element" && c.tagName === "pre");
      const shikiCode = shikiPre?.children?.find((c) => c.type === "element" && c.tagName === "code");
      const lineSpans = (shikiCode?.children ?? []).filter(
        (c) => c.type === "element" && c.tagName === "span",
      );

      const lineCount = Math.max(1, lineSpans.length);
      const gutterChildren = [];
      for (let i = 1; i <= lineCount; i++) {
        gutterChildren.push({
          type: "element",
          tagName: "span",
          properties: { className: ["line"] },
          children: [{ type: "text", value: String(i) }],
        });
        gutterChildren.push({ type: "element", tagName: "br", properties: {}, children: [] });
      }

      const codeChildren = [];
      if (lineSpans.length > 0) {
        for (const span of lineSpans) {
          codeChildren.push(span);
          codeChildren.push({ type: "element", tagName: "br", properties: {}, children: [] });
        }
      } else {
        codeChildren.push({
          type: "element",
          tagName: "span",
          properties: { className: ["line"] },
          children: [{ type: "text", value: rawCode }],
        });
        codeChildren.push({ type: "element", tagName: "br", properties: {}, children: [] });
      }

      const displayLang = (rawLang === "plaintext" || rawLang === "text" ? "CODE" : rawLang).toUpperCase();
      const { macStyle, theme: codeTheme, lineNumbers } = themeConfig.post.codeBlock;

      const trChildren = [];
      if (lineNumbers) {
        trChildren.push({
          type: "element",
          tagName: "td",
          properties: { className: ["gutter"] },
          children: [
            {
              type: "element",
              tagName: "pre",
              properties: {},
              children: gutterChildren,
            },
          ],
        });
      }
      trChildren.push({
        type: "element",
        tagName: "td",
        properties: { className: ["code"] },
        children: [
          {
            type: "element",
            tagName: "pre",
            properties: {},
            children: codeChildren,
          },
        ],
      });

      parent.children[index] = {
        type: "element",
        tagName: "figure",
        properties: {
          className: ["highlight", rawLang],
          "data-mac": macStyle ? "true" : "false",
          "data-code-theme": codeTheme,
        },
        children: [
          {
            type: "element",
            tagName: "div",
            properties: { className: ["highlight-tools"] },
            children: [
              {
                type: "element",
                tagName: "i",
                properties: {
                  className: ["anzhiyufont", "anzhiyu-icon-angle-down", "expand"],
                  title: "折叠代码",
                },
                children: [],
              },
              {
                type: "element",
                tagName: "div",
                properties: { className: ["code-lang"] },
                children: [{ type: "text", value: displayLang }],
              },
              {
                type: "element",
                tagName: "div",
                properties: { className: ["copy-notice"] },
                children: [],
              },
              {
                type: "element",
                tagName: "i",
                properties: {
                  className: ["anzhiyufont", "anzhiyu-icon-paste", "copy-button"],
                  title: "复制代码",
                },
                children: [],
              },
            ],
          },
          {
            type: "element",
            tagName: "table",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "tbody",
                properties: {},
                children: [
                  {
                    type: "element",
                    tagName: "tr",
                    properties: {},
                    children: trChildren,
                  },
                ],
              },
            ],
          },
        ],
      };
    }
  };
}
