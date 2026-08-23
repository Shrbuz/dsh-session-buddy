/**
 * Diagnose current session render state in headless.
 * Usage: node scripts/diag-session.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9240
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-diag-'))
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
// host needs time to reconnect + pull the session list before it can restore
for (let i = 0; i < 20; i += 1) { await sleep(1000) }
await sleep(3000)
console.log('body text (first 500):', await ev(`(document.body?.innerText ?? '').slice(0, 500)`))
console.log('anchor rows:', await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`))
console.log('scrollport exists:', await ev(`document.querySelector('[data-conversation-scroll]') !== null`))
console.log('composer exists:', await ev(`document.querySelector('[data-composer-seat]') !== null`))
console.log('load-earlier btn:', await ev(`Array.from(document.querySelectorAll('button')).some((b) => /加载更早|Load earlier/i.test(b.textContent || ''))`))
console.log('session list hints:', await ev(`(document.body?.innerText ?? '').match(/会话|[A-Za-z0-9_-]+\.md|REQUIREMENTS|dsh-web-notes/g)?.slice(0,10) ?? []`))

try { ws.close() } catch { /* ignore */ }
try { spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { try { proc.kill() } catch { /* ignore */ } }
for (let i = 0; i < 5; i += 1) {
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); break } catch { await sleep(400) }
}
process.exit(0)
