/**
 * Diagnose the sessions-backed rung collection — reads the plugin's debug
 * surface (window.__dsbDebug) to see exactly what the snapshot yields.
 * Usage: node scripts/diag-session-source.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9244
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-src-'))
try {
  const { execFileSync } = await import('node:child_process')
  const list = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
  for (const line of list.split(/\r?\n/)) {
    if (line.includes(`:${CDP_PORT}`) && line.includes('LISTENING')) {
      const pid = line.trim().split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid)) { try { execFileSync('taskkill', ['/pid', pid, '/F'], { stdio: 'ignore' }) } catch { /* ignore */ } }
    }
  }
} catch { /* ignore */ }
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-sync', '--no-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`,
  `http://127.0.0.1:${PORT}/`,
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function target() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch { /* retry */ }
    await sleep(500)
  }
  return undefined
}

const page = await target()
if (!page) { console.error('no page'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { pending.get(m.id)?.(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  seq += 1; pending.set(seq, res); ws.send(JSON.stringify({ id: seq, method, params }))
})
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}

await send('Runtime.enable')
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb' }))`)
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })

// Wait for session restore.
let sawTranscript = false
for (let i = 0; i < 45 && !sawTranscript; i += 1) {
  await sleep(1000)
  const anchors = await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`)
  const debug = await ev(`window.__dsbDebug`)
  if (anchors > 0 || (debug && Array.isArray(debug.rungs) && debug.rungs.length > 0)) sawTranscript = true
}
console.log('session restored:', sawTranscript)

// Debug surface.
const debug = await ev(`window.__dsbDebug ?? null`)
console.log('__dsbDebug:', JSON.stringify(debug))

// After paging in older history, compare rung keys vs DOM user keys.
await ev(`(() => { const f = document.querySelector('[data-dsh-part="outline-footer"]'); if (f) f.click(); })()`)
await sleep(1500)
console.log('after footer click — rungs:', await ev(`Array.from(document.querySelectorAll('[data-dsh-part="outline-rung"]')).map((r) => ({ key: r.getAttribute('data-dsh-key'), loaded: r.getAttribute('data-dsh-loaded') }))`))
console.log('DOM user rows:', await ev(`Array.from(document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]')).map((r) => r.getAttribute('data-chat-anchor-key'))`))
console.log('debug rungs after page:', await ev(`window.__dsbDebug?.rungs ?? null`))

// What does the DOM see vs what the snapshot sees?
console.log('DOM user rows:', await ev(`document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]').length`))
console.log('DOM anchor kinds:', await ev(`(() => { const h = {}; for (const r of document.querySelectorAll('[data-chat-anchor-key]')) { const k = r.getAttribute('data-chat-flow-kind') || '(none)'; h[k] = (h[k] ?? 0) + 1; } return h; })()`))
console.log('outline rungs:', await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`))

try { ws.close() } catch { /* ignore */ }
try {
  const { execFileSync } = await import('node:child_process')
  const list = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
  for (const line of list.split(/\r?\n/)) {
    if (line.includes(`:${CDP_PORT}`) && line.includes('LISTENING')) {
      const pid = line.trim().split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid)) { try { execFileSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ } }
    }
  }
} catch { /* ignore */ }
try { proc.kill() } catch { /* ignore */ }
for (let i = 0; i < 5; i += 1) {
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); break } catch { await sleep(400) }
}
process.exit(0)
