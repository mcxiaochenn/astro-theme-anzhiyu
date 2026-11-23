/**
 * log-js.ts — 上游 `layout/includes/anzhiyu/log-js.pug` 的内联脚本模板（P4-1）。
 *
 * 这是 additional-js 里的「控制台打印信息」脚本：
 *   - 先劫持 console.log，再在 queueMicrotask 里用原始 log 输出欢迎信息；
 *   - 建站天数用 `theme.footer.runtime.launch_time`，版权行用 `theme.footer.owner.since`
 *     与主题版本号；
 *   - pug 里的 `#{...}` 已换成 %%XXX%% 占位符，由 buildLogJs() 注入。
 *
 * 脚本内容由上游 pug 生成，逐行保留（含 ASCII art 的缩进空白，diff 会折叠空白）。
 */
export interface LogJsInput {
  author: string
  since: string | number
  launchTime: string
  version: string
}

const TEMPLATE = "// 消除控制台打印\nvar HoldLog = console.log;\nconsole.log = function () {};\nlet now1 = new Date();\nqueueMicrotask(() => {\n  const Log = function () {\n    HoldLog.apply(console, arguments);\n  }; //在恢复前输出日志\n  const grt = new Date(\"%%LAUNCH%%\"); //此处修改你的建站时间或者网站上线时间\n  now1.setTime(now1.getTime() + 250);\n  const days = (now1 - grt) / 1000 / 60 / 60 / 24;\n  const dnum = Math.floor(days);\n  const ascll = [\n    `欢迎使用安知鱼!`,\n    `生活明朗, 万物可爱`,\n    `\n        \n       █████╗ ███╗   ██╗███████╗██╗  ██╗██╗██╗   ██╗██╗   ██╗\n      ██╔══██╗████╗  ██║╚══███╔╝██║  ██║██║╚██╗ ██╔╝██║   ██║\n      ███████║██╔██╗ ██║  ███╔╝ ███████║██║ ╚████╔╝ ██║   ██║\n      ██╔══██║██║╚██╗██║ ███╔╝  ██╔══██║██║  ╚██╔╝  ██║   ██║\n      ██║  ██║██║ ╚████║███████╗██║  ██║██║   ██║   ╚██████╔╝\n      ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝    ╚═════╝\n        \n        `,\n    \"已上线\",\n    dnum,\n    \"天\",\n    \"©%%SINCE%% By 安知鱼 V%%VERSION%%\",\n  ];\n  const ascll2 = [`NCC2-036`, `调用前置摄像头拍照成功，识别为【小笨蛋】.`, `Photo captured: `, `🤪`];\n\n  setTimeout(\n    Log.bind(\n      console,\n      `\\n%c${ascll[0]} %c ${ascll[1]} %c ${ascll[2]} %c${ascll[3]}%c ${ascll[4]}%c ${ascll[5]}\\n\\n%c ${ascll[6]}\\n`,\n      \"color:#425AEF\",\n      \"\",\n      \"color:#425AEF\",\n      \"color:#425AEF\",\n      \"\",\n      \"color:#425AEF\",\n      \"\"\n    )\n  );\n  setTimeout(\n    Log.bind(\n      console,\n      `%c ${ascll2[0]} %c ${ascll2[1]} %c \\n${ascll2[2]} %c\\n${ascll2[3]}\\n`,\n      \"color:white; background-color:#4fd953\",\n      \"\",\n      \"\",\n      'background:url(\"https://npm.elemecdn.com/anzhiyu-blog@1.1.6/img/post/common/tinggge.gif\") no-repeat;font-size:450%'\n    )\n  );\n\n  setTimeout(Log.bind(console, \"%c WELCOME %c 你好，小笨蛋.\", \"color:white; background-color:#4f90d9\", \"\"));\n\n  setTimeout(\n    console.warn.bind(\n      console,\n      \"%c ⚡ Powered by 安知鱼 %c 你正在访问 %%AUTHOR%% 的博客.\",\n      \"color:white; background-color:#f0ad4e\",\n      \"\"\n    )\n  );\n\n  setTimeout(Log.bind(console, \"%c W23-12 %c 你已打开控制台.\", \"color:white; background-color:#4f90d9\", \"\"));\n\n  setTimeout(\n    console.warn.bind(console, \"%c S013-782 %c 你现在正处于监控中.\", \"color:white; background-color:#d9534f\", \"\")\n  );\n});"

export function buildLogJs(input: LogJsInput): string {
  return TEMPLATE.replaceAll("%%AUTHOR%%", String(input.author ?? ""))
    .replaceAll("%%SINCE%%", String(input.since ?? ""))
    .replaceAll("%%LAUNCH%%", String(input.launchTime ?? ""))
    .replaceAll("%%VERSION%%", String(input.version ?? ""))
}
