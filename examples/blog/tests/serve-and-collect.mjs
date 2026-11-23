#!/usr/bin/env node
/**
 * P1.5 垂直切片 · 浏览器证据服务器（本机沙箱专用）
 *
 * 作用（一个端口干两件事）：
 *   1. 反向代理 → astro preview（127.0.0.1:4399），记录每个请求的
 *      method / path / Sec-Fetch-Dest / Sec-Fetch-Mode / 状态码。
 *      其中 Sec-Fetch-Dest === "document" 就是「整页导航请求」的 HTTP 层证据。
 *   2. POST /__report 接收页内 harness 的 JSON 结果，落盘到 tests/artifacts/。
 *
 * 为什么需要它：本机 DSH 沙箱禁止 Playwright 启动 Chromium（见报告 §沙箱限制），
 * 真实浏览器验证改走 wincu 浏览器通道；这个服务器只负责收集真实浏览器跑出来的证据。
 *
 * 用法：
 *   pnpm --filter blog build
 *   pnpm --filter blog preview -- --host 127.0.0.1 --port 4399   # 另一个终端
 *   node examples/blog/tests/serve-and-collect.mjs               # 本文件
 *   浏览器打开 http://127.0.0.1:4401/?slice-test=1
 */
import http from 'node:http'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS = path.join(__dirname, 'artifacts')
mkdirSync(ARTIFACTS, { recursive: true })

const PORT = Number(process.env.PORT || 4401)
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1'
const TARGET_PORT = Number(process.env.TARGET_PORT || 4399)

const REQUEST_LOG = path.join(ARTIFACTS, 'browser-requests.log')
const REPORT_JSON = path.join(ARTIFACTS, 'browser-harness-report.json')
const logStream = createWriteStream(REQUEST_LOG, { flags: 'w' })
const writeLog = (record) => logStream.write(JSON.stringify(record) + '\n')

function collectReport(req, res) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 4_000_000) {
      req.destroy()
    }
  })
  req.on('end', () => {
    writeFileSync(REPORT_JSON, body)
    console.log(`[test-server] 收到 harness 报告 ${body.length} 字节 → ${REPORT_JSON}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
  })
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__report') {
    collectReport(req, res)
    return
  }
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }

  const startedAt = Date.now()
  const proxy = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers)
      upstream.pipe(res)
      upstream.on('end', () => {
        writeLog({
          ts: startedAt,
          method: req.method,
          url: req.url,
          status: upstream.statusCode,
          dest: req.headers['sec-fetch-dest'] || null,
          mode: req.headers['sec-fetch-mode'] || null,
          accept: req.headers.accept || null,
          durationMs: Date.now() - startedAt,
        })
      })
    },
  )
  proxy.on('error', (error) => {
    writeLog({ ts: startedAt, method: req.method, url: req.url, status: 502, error: String(error), dest: req.headers['sec-fetch-dest'] || null })
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('proxy error')
  })
  req.pipe(proxy)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[test-server] http://127.0.0.1:${PORT} → preview ${TARGET_HOST}:${TARGET_PORT}`)
  console.log(`[test-server] 报告落盘: ${REPORT_JSON}`)
  console.log(`[test-server] 请求日志: ${REQUEST_LOG}`)
})
