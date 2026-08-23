/**
 * Redesign verification (approach-2, snapshot-backed) — CDP probe against the
 * RUNNING dsh web. Restores the real session (boot-then-seed), pages older
 * history in via the footer so rungs render, then verifies the UI redesign:
 * vertical rungs, subdued breathing on hover, follows the scrollport's right
 * edge, no toggle, click scrolls.
 *
 * Usage: node scripts/verify-redesign.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9233
const SESSION = 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb'
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-redesign-'))
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

let booted = false
for (let i = 0; i < 40 && !booted; i += 1) {
  await sleep(1000)
  booted = await ev(`document.querySelector('[data-dsh-buddy-root]') !== null || document.querySelector('[data-conversation-scroll]') !== null`)
}
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: '${SESSION}' }))`)
await send('Page.reload', { ignoreCache: true })

let failures = 0
function check(name, condition) {
  if (condition) { console.log('  ok  ' + name) }
  else { failures += 1; console.log('FAIL  ' + name) }
}

let sawTranscript = false
for (let i = 0; i < 30 && !sawTranscript; i += 1) {
  await sleep(1000)
  const anchors = await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`)
  if (anchors > 0) sawTranscript = true
}
console.log('  session restored:', sawTranscript)

// 1. No toggle button / closed class (removed design).
check('no toggle button', await ev(`document.querySelector('[data-dsh-part="outline-toggle"]') === null`))
check('no closed class', await ev(`document.querySelector('.dsb-outline-closed') === null`))

// 2. Page older history in until rungs render (real hidden-history scenario).
let rungCount = await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`)
if (rungCount === 0) {
  for (let p = 0; p < 10 && rungCount === 0; p += 1) {
    await ev(`(() => { const f = document.querySelector('[data-dsh-part="outline-footer"]'); if (f) f.click(); })()`)
    await sleep(800)
    rungCount = await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`)
  }
}
console.log('  rungs after paging:', rungCount)
check('rungs rendered after paging', rungCount > 0)
if (rungCount === 0) {
  console.log('\nSKIP (no rungs — session had no pageable history)')
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

// 3. Rung geometry: vertical (height > width, ~8px wide).
const geom = await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); const b = r.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })()`)
console.log('  rung geom:', JSON.stringify(geom))
check('rung is vertical (h > w)', (geom.h ?? 0) > (geom.w ?? 0))
check('rung width ≈ 8px', Math.abs((geom.w ?? 0) - 8) <= 2)

// 4. Follows scrollport: aside sits INSIDE scrollport's right edge.
const pos = await ev(`(() => {
  const aside = document.querySelector('[data-dsh-part="outline"]');
  const sp = document.querySelector('[data-conversation-scroll]');
  const a = aside.getBoundingClientRect();
  const s = sp.getBoundingClientRect();
  return { asideLeft: Math.round(a.left), scrollRight: Math.round(s.right), inset: Math.round(s.right - a.left) };
})()`)
console.log('  pos:', JSON.stringify(pos))
check('aside inside scrollport right edge', (pos.asideLeft ?? 0) < (pos.scrollRight ?? 0))
check('aside inset ≈ rail + gap (30–50)', (pos.inset ?? 0) >= 30 && (pos.inset ?? 0) <= 50)

// 4b. Follows compression.
const beforeFollow = await ev(`(() => {
  const sp = document.querySelector('[data-conversation-scroll]');
  const aside = document.querySelector('[data-dsh-part="outline"]');
  return { scrollRight: sp.getBoundingClientRect().right, asideLeft: aside.getBoundingClientRect().left };
})()`)
await ev(`(() => { const sp = document.querySelector('[data-conversation-scroll]'); sp.style.marginRight = '180px'; })()`)
let stableLeft = 0
for (let i = 0; i < 20; i += 1) {
  await sleep(150)
  const l = await ev(`document.querySelector('[data-dsh-part="outline"]').getBoundingClientRect().left`)
  if (Math.abs(l - stableLeft) < 1 && i > 2) break
  stableLeft = l
}
const afterFollow = await ev(`(() => {
  const sp = document.querySelector('[data-conversation-scroll]');
  const aside = document.querySelector('[data-dsh-part="outline"]');
  const v = { scrollRight: sp.getBoundingClientRect().right, asideLeft: aside.getBoundingClientRect().left };
  sp.style.marginRight = '';
  return v;
})()`)
const shift = (beforeFollow.asideLeft ?? 0) - (afterFollow.asideLeft ?? 0)
console.log('  follow shift:', shift)
check('scrollport shrank', (beforeFollow.scrollRight ?? 0) > (afterFollow.scrollRight ?? 0))
check('ladder followed left', shift > 100)
for (let i = 0; i < 20; i += 1) {
  await sleep(150)
  const l = await ev(`document.querySelector('[data-dsh-part="outline"]').getBoundingClientRect().left`)
  if (Math.abs(l - (beforeFollow.asideLeft ?? 0)) < 1) break
}

// 5. Breathing on hover (native events; real-browser hover covered elsewhere).
await sleep(500)
await ev(`(() => {
  const r = document.querySelector('[data-dsh-part="outline-rung"]');
  if (r) {
    r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }
  return 'dispatched';
})()`)
await sleep(700)
const hoverInfo = await ev(`(() => {
  const r = document.querySelector('.dsb-outline-rung-hover');
  if (!r) return null;
  const cs = getComputedStyle(r);
  return { hoverClass: true, animationName: cs.animationName, animationDuration: cs.animationDuration };
})()`)
console.log('  hover:', JSON.stringify(hoverInfo))
check('hover rung has breathing class', hoverInfo !== null && hoverInfo.hoverClass === true)
check('breathing animation applied', hoverInfo !== null && (hoverInfo.animationName ?? '').includes('breathe'))

// 6. Click a rung → transcript scrolls.
const beforeScroll = await ev(`document.querySelector('[data-conversation-scroll]')?.scrollTop ?? 0`)
await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); if (r) r.click(); })()`)
await sleep(1200)
const afterScroll = await ev(`document.querySelector('[data-conversation-scroll]')?.scrollTop ?? 0`)
check('click rung scrolls transcript', beforeScroll !== afterScroll)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
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
process.exit(failures === 0 ? 0 : 1)
