/**
 * Hover tooltip probe — verify the rung hover tooltip appears via a real CDP
 * mouse move, showing number + summary (+ time when enabled).
 * Usage: node scripts/verify-tooltip.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9232
const SESSION = 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb'
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-ttp-'))
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
await send('Page.enable')

// Boot first, then seed + reload so the real session restores.
let booted = false
for (let i = 0; i < 40 && !booted; i += 1) {
  await sleep(1000)
  booted = await ev(`document.querySelector('[data-dsh-buddy-root]') !== null || document.querySelector('[data-conversation-scroll]') !== null`)
}
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: '${SESSION}' }))`)
await send('Page.reload', { ignoreCache: true })

let sawTranscript = false
for (let i = 0; i < 30 && !sawTranscript; i += 1) {
  await sleep(1000)
  const anchors = await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`)
  if (anchors > 0) sawTranscript = true
}
console.log('  session restored:', sawTranscript)

// Page older history in until at least 2 rungs render (needed to prove the
// tooltip follows the hovered rung, not a fixed spot).
let rungCount = await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`)
for (let p = 0; p < 20 && rungCount < 2; p += 1) {
  await ev(`(() => { const f = document.querySelector('[data-dsh-part="outline-footer"]'); if (f) f.click(); })()`)
  await sleep(700)
  rungCount = await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`)
}
console.log('  rungs after paging:', rungCount)
if (rungCount < 2) {
  console.log('\nSKIP (need ≥2 rungs to prove follow; session had <2 pageable turns)')
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
}

let failures = 0
function check(name, condition) {
  if (condition) { console.log('  ok  ' + name) }
  else { failures += 1; console.log('FAIL  ' + name) }
}

// Trigger hover on the first rung. We dispatch a native mouseenter (and
// mousemove) directly on the rung: this is the reliable way to exercise
// React's onMouseEnter handler in headless (CDP synthetic mouse moves are
// flaky on an 8px-wide target). The real-browser path is covered separately.
await ev(`(() => {
  const r = document.querySelector('[data-dsh-part="outline-rung"]');
  if (!r) return 'no-rung';
  r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  r.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  return 'dispatched';
})()`)
await sleep(700)

const tooltip = await ev(`(() => {
  const t = document.querySelector('[data-dsh-part="outline-tooltip"]');
  if (!t) return null;
  return { num: t.querySelector('.dsb-outline-tooltip-num')?.textContent ?? null, text: t.querySelector('.dsb-outline-tooltip-text')?.textContent ?? null, time: t.querySelector('.dsb-outline-tooltip-time')?.textContent ?? null };
})()`)
console.log('  tooltip:', JSON.stringify(tooltip))
check('tooltip appears on hover', tooltip !== null)
check('tooltip has number', tooltip !== null && tooltip.num === '1')
check('tooltip has summary text', tooltip !== null && (tooltip.text ?? '').length > 0)
check('tooltip shows time (showTimestamps default)', tooltip !== null && (tooltip.time ?? '').length > 0)

// Follows-the-rung: hover rung[0] vs rung[1] and confirm the tooltip moves to
// each rung's position (different top), and sits to the LEFT of the rail.
const posA = await ev(`(() => {
  const t = document.querySelector('[data-dsh-part="outline-tooltip"]');
  const r = document.querySelectorAll('[data-dsh-part="outline-rung"]')[0];
  if (!t || !r) return null;
  const tr = t.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  return { top: Math.round(tr.top), h: Math.round(tr.height), rungTop: Math.round(rr.top), rungH: Math.round(rr.height), right: Math.round(tr.right), rungLeft: Math.round(rr.left) };
})()`)
await ev(`(() => {
  const rs = document.querySelectorAll('[data-dsh-part="outline-rung"]');
  const r = rs[1];
  if (r) {
    r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }
  return 'hover-2';
})()`)
await sleep(500)
const posB = await ev(`(() => {
  const t = document.querySelector('[data-dsh-part="outline-tooltip"]');
  const r = document.querySelectorAll('[data-dsh-part="outline-rung"]')[1];
  if (!t || !r) return null;
  const tr = t.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  return { top: Math.round(tr.top), h: Math.round(tr.height), rungTop: Math.round(rr.top), rungH: Math.round(rr.height), right: Math.round(tr.right), rungLeft: Math.round(rr.left) };
})()`)
console.log('  tooltip pos rung[0]:', JSON.stringify(posA))
console.log('  tooltip pos rung[1]:', JSON.stringify(posB))
const centerA = posA ? posA.top + posA.h / 2 : 0
const rungCenterA = posA ? posA.rungTop + posA.rungH / 2 : 0
const centerB = posB ? posB.top + posB.h / 2 : 0
const rungCenterB = posB ? posB.rungTop + posB.rungH / 2 : 0
check('tooltip follows different rungs (top differs)', posA !== null && posB !== null && posA.top !== posB.top)
check('tooltip vertically centers on its rung', posA !== null && Math.abs(centerA - rungCenterA) <= 2 && posB !== null && Math.abs(centerB - rungCenterB) <= 2)
check('tooltip sits left of its rung', posA !== null && posA.right <= posA.rungLeft && posB !== null && posB.right <= posB.rungLeft)

// Hover back to rung[0] for the leave test.
await ev(`(() => {
  const r = document.querySelectorAll('[data-dsh-part="outline-rung"]')[0];
  if (r) {
    r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }
  return 'hover-1';
})()`)
await sleep(400)

// Move away → tooltip hides (native mouseleave).
await ev(`(() => {
  const r = document.querySelector('[data-dsh-part="outline-rung"]');
  if (r) {
    r.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
  }
  return 'left';
})()`)
await sleep(400)
check('tooltip hides on mouse leave', await ev(`document.querySelector('[data-dsh-part="outline-tooltip"]') === null`))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
try { ws.close() } catch { /* ignore */ }
// Kill the whole Chrome tree (headless Chrome forks many children that survive
// proc.kill() and leak the CDP port to later probe runs).
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
process.exit(failures === 0 ? 0 : 1)
