/**
 * Hover debug — dump what happens on mouse move over a rung.
 * Usage: node scripts/debug-hover.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9234
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-hov-'))
// Free the CDP port from any leftover probe Chrome before starting.
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
for (let i = 0; i < 60; i += 1) {
  await sleep(1000)
  if (await ev(`document.querySelector('[data-conversation-scroll]') !== null`)) break
}
for (let i = 0; i < 5; i += 1) {
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /加载更早|Load earlier/i.test(x.textContent || '')); if (b) b.click(); })()`)
  await sleep(1000)
}

// Where is the first rung exactly? Is it visible?
console.log('rung box:', await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, offsetParent: !!r.offsetParent, display: getComputedStyle(r).display }; })()`))

// Listen for mouseenter manually
await ev(`window.__hoverLog = []; const r = document.querySelector('[data-dsh-part="outline-rung"]'); r.addEventListener('mouseenter', () => __hoverLog.push('enter')); r.addEventListener('mousemove', () => __hoverLog.push('move'));`)

// Dispatch via Input domain (real CDP mouse)
const box = await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`)
console.log('dispatching to:', JSON.stringify(box))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
await sleep(800)
console.log('hover log:', await ev(`window.__hoverLog`))
console.log('hover class present:', await ev(`document.querySelector('.dsb-outline-rung-hover') !== null`))
console.log('tooltip present:', await ev(`document.querySelector('[data-dsh-part="outline-tooltip"]') !== null`))

// Also try dispatching mousePressed/released to be sure it's a button at that point
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await sleep(400)
console.log('after click hover log:', await ev(`window.__hoverLog`))

try { ws.close() } catch { /* ignore */ }
// Best-effort: kill whatever still holds the CDP port (headless Chrome forks
// children whose PID differs from proc.pid, so taskkill on proc.pid alone
// leaks the port to later probe runs).
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
