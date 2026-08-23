/**
 * Debug why tooltip hover fails on the injected page.
 * Usage: node scripts/diag-tooltip.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9241
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-dttp-'))
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
let rootMounted = false
for (let i = 0; i < 40 && !rootMounted; i += 1) {
  await sleep(1000)
  rootMounted = await ev(`document.querySelector('[data-dsh-buddy-root]') !== null`)
}
console.log('root mounted:', rootMounted)

await ev(`(() => {
  let sp = document.querySelector('[data-conversation-scroll]');
  if (!sp) {
    sp = document.createElement('div');
    sp.setAttribute('data-conversation-scroll', '');
    document.body.appendChild(sp);
  }
  const turns = [
    ['u-1', 'user', '第一条提问'],
    ['a-1', 'assistant-step', '第一条回复'],
    ['u-2', 'user', '第二条提问'],
    ['a-2', 'assistant-step', '第二条回复'],
  ];
  for (const [key, kind, text] of turns) {
    const row = document.createElement('div');
    row.setAttribute('data-chat-anchor-key', key);
    row.setAttribute('data-chat-flow-key', key);
    row.setAttribute('data-chat-flow-kind', kind);
    row.setAttribute('data-dsh-part', 'message-row');
    row.textContent = text;
    row.style.marginBottom = '60px';
    sp.appendChild(row);
  }
  return 'injected';
})()`)
await sleep(800)

console.log('rung count:', await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`))
console.log('outline exists:', await ev(`document.querySelector('[data-dsh-part="outline"]') !== null`))
console.log('empty class:', await ev(`document.querySelector('.dsb-outline-empty') !== null`))
const box = await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, offsetParent: !!r.offsetParent }; })()`)
console.log('rung box:', JSON.stringify(box))

if (box) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + box.w / 2, y: box.y + box.h / 2 })
  await sleep(700)
  console.log('tooltip after hover:', await ev(`document.querySelector('[data-dsh-part="outline-tooltip"]')?.textContent ?? 'NO TOOLTIP'`))
  // Try dispatching several small moves within the rung
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 1, y: box.y + 2 })
  await sleep(200)
  console.log('tooltip after small move:', await ev(`document.querySelector('[data-dsh-part="outline-tooltip"]')?.textContent ?? 'NO TOOLTIP'`))
}

try { ws.close() } catch { /* ignore */ }
try { spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { try { proc.kill() } catch { /* ignore */ } }
for (let i = 0; i < 5; i += 1) {
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); break } catch { await sleep(400) }
}
process.exit(0)
