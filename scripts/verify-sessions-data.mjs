/**
 * Session-data probe — verify the "approach 2" feasibility: can the plugin
 * read the full user-question list from the official `sessions` client service
 * (instead of the DOM), and can it page older history into the window via
 * `loadOlder()`? If yes, the ladder can show every question even when the DOM
 * only renders the recent window — and clicking a hidden question can load the
 * older page that contains it.
 *
 * Usage: node scripts/verify-sessions-data.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9242
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-sess-'))
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}

await send('Runtime.enable')
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb' }))`)
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })

let failures = 0
function check(name, condition) {
  if (condition) { console.log('  ok  ' + name) }
  else { failures += 1; console.log('FAIL  ' + name) }
}

// Wait for the app + sessions service to be reachable. We access the
// `sessions` service through the app's root cordis context, which the shell
// exposes on window (the module loader keeps it on __DSH__ / context). We
// probe for a stable handle first.
let reached = false
for (let i = 0; i < 40 && !reached; i += 1) {
  await sleep(1000)
  reached = await ev(`(async () => {
    try {
      // The web runtime exposes the root ctx on window.__DSH_CTX__ or the
      // loader internals; fall back to inspecting what globals exist.
      return !!window.__DSH_CTX__ || !!window.__dsh__ || Object.keys(window).some((k) => k.toLowerCase().includes('dsh') || k.toLowerCase().includes('cordis'));
    } catch { return false }
  })()`)
}

console.log('== probe global handles ==')
console.log(await ev(`Object.keys(window).filter((k) => /dsh|cordis|__|ctx|runtime/i.test(k)).slice(0, 30)`))

// Try to find the root context. The dsh web client keeps the root cordis
// Context; plugins receive it. We can't import the module here, but we can
// reach the plugin's own context via a DOM marker if our plugin exposed one —
// it doesn't. Instead, test whether the session data is reachable through the
// DOM (approach-1 side) and whether window exposes the app internals.
console.log('== DOM anchor/flow-kind census (what approach 1 sees) ==')
console.log(await ev(`(() => {
  const rows = Array.from(document.querySelectorAll('[data-chat-anchor-key]'));
  const kinds = {};
  let userCount = 0;
  for (const r of rows) {
    const k = r.getAttribute('data-chat-flow-kind') || '(none)';
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k === 'user' || k === 'steering') userCount += 1;
  }
  return { total: rows.length, kinds, userCount };
})()`))

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
