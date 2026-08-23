/**
 * Sidebar probe — dumps the real sidebar session-list DOM so we can find the
 * right selector for opening a session in CDP probes.
 * Usage: node scripts/probe-sidebar.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9228
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-sb-'))
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

// Wait for boot.
for (let i = 0; i < 60; i += 1) {
  await sleep(1000)
  if (await ev(`document.querySelector('[data-conversation-scroll]') !== null`)) break
}

// Dump the left sidebar region: find elements that look like the session list.
console.log('== sidebar candidates ==')
console.log(await ev(`
  (() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('nav, aside, [class*="sidebar"], [class*="rail"], [class*="list"]')) {
      const t = (el.textContent || '').trim().slice(0, 100);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), x: Math.round(r.x), w: Math.round(r.width), text: t });
    }
    return out.slice(0, 20);
  })()
`))

// Dump all text that could be a session title.
console.log('\n== session title candidates in whole body ==')
console.log(await ev(`
  (() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[class*="session"], [class*="chat"], [class*="item"], [class*="row"]')) {
      const t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 70);
      if (!t || t.length < 3 || seen.has(t)) continue;
      seen.add(t);
      out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), text: t });
    }
    return out.slice(0, 25);
  })()
`))

// Body outline of text blocks.
console.log('\n== body text blocks (first 30) ==')
console.log(await ev(`
  (() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 2) continue;
      out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: t.slice(0, 50) });
    }
    return out.slice(0, 30);
  })()
`))

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
