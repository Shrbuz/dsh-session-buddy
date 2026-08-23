/**
 * Jump-to-latest verification — CDP probe against the RUNNING dsh web with the
 * plugin installed. Restores the real session (boot-then-seed), pages history
 * in, then verifies the bottom button:
 *   1. shown when the transcript is NOT at the bottom,
 *   2. clicking it scrolls to the bottom,
 *   3. hidden once at the bottom.
 *
 * Usage: node scripts/verify-bottom.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9247
const SESSION = 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb'
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-bottom-'))
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

let saw = false
for (let i = 0; i < 30 && !saw; i += 1) {
  await sleep(1000)
  if (await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`) > 0) saw = true
}
console.log('  session restored:', saw)

// Scroll to the TOP so the transcript is NOT at the bottom → button should show.
await ev(`(() => { const sp = document.querySelector('[data-conversation-scroll]'); if (sp) sp.scrollTop = 0; })()`)
await sleep(600)
const btnShown = await ev(`document.querySelector('[data-dsh-part="outline-bottom"]') !== null`)
console.log('  bottom button shown (scrolled up):', btnShown)
check('bottom button shown when not at bottom', btnShown === true)

// It sits just below the rail shell and HORIZONTALLY CENTERED under it. As an
// absolutely-positioned child of the rail, it follows the rail automatically.
const btnPlacement = await ev(`(() => {
  const b = document.querySelector('[data-dsh-part="outline-bottom"]');
  const rail = document.querySelector('[data-dsh-part="outline"]');
  if (!b || !rail) return null;
  const br = b.getBoundingClientRect();
  const rr = rail.getBoundingClientRect();
  const bc = br.left + br.width / 2;
  const rc = rr.left + rr.width / 2;
  return { below: br.top > rr.bottom, centered: Math.abs(bc - rc) <= 2, inRail: rail.contains(b), gap: Math.round(br.top - rr.bottom), abs: getComputedStyle(b).position };
})()`)
console.log('  button placement:', JSON.stringify(btnPlacement))
check('button sits below the rail shell', btnPlacement !== null && btnPlacement.below === true)
check('button is a child of the rail (absolute, follows it)', btnPlacement !== null && btnPlacement.inRail === true)
check('button is position:absolute', btnPlacement !== null && btnPlacement.abs === 'absolute')
check('button horizontally centers under the rail', btnPlacement !== null && btnPlacement.centered === true)

// Follows width changes: resize the viewport and confirm the button still hangs
// centered under the rail (did NOT stay put in the page middle).
const posBefore = await ev(`(() => { const b = document.querySelector('[data-dsh-part="outline-bottom"]'); const rail = document.querySelector('[data-dsh-part="outline"]'); if (!b || !rail) return null; const br=b.getBoundingClientRect(), rr=rail.getBoundingClientRect(); return { dx: Math.abs((br.left+br.width/2)-(rr.left+rr.width/2)), railLeft: Math.round(rr.left), btnLeft: Math.round(br.left) }; })()`)
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
await sleep(400)
const posAfter = await ev(`(() => { const b = document.querySelector('[data-dsh-part="outline-bottom"]'); const rail = document.querySelector('[data-dsh-part="outline"]'); if (!b || !rail) return null; const br=b.getBoundingClientRect(), rr=rail.getBoundingClientRect(); return { dx: Math.abs((br.left+br.width/2)-(rr.left+rr.width/2)), railLeft: Math.round(rr.left), btnLeft: Math.round(br.left) }; })()`)
await send('Emulation.clearDeviceMetricsOverride')
console.log('  follow width (before/after):', JSON.stringify({ before: posBefore, after: posAfter }))
check('button stays centered under rail after width change', posBefore !== null && posAfter !== null && posAfter.dx <= 2 && posAfter.dx === posBefore.dx)
// The button must have a visible container (border + background) holding the
// arrow, not a bare arrow.
const btnVisual = await ev(`(() => {
  const b = document.querySelector('[data-dsh-part="outline-bottom"]');
  const rail = document.querySelector('[data-dsh-part="outline"]');
  if (!b) return null;
  const cs = getComputedStyle(b);
  const rr = rail ? rail.getBoundingClientRect() : null;
  const hasBorder = parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderTopWidth) === parseFloat(cs.borderBottomWidth);
  const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
  const hasSvg = b.querySelector('svg') !== null;
  const btnRadius = parseFloat(cs.borderTopLeftRadius);
  const railRadius = rail ? parseFloat(getComputedStyle(rail).borderTopLeftRadius) : null;
  return { hasBorder, hasBg, borderColor: cs.borderTopColor, bg: cs.backgroundColor, hasSvg, btnW: Math.round(b.getBoundingClientRect().width), railW: rr ? Math.round(rr.width) : null, btnRadius, railRadius };
})()`)
console.log('  button visual:', JSON.stringify(btnVisual))
check('button has a visible border-line container', btnVisual !== null && btnVisual.hasBorder === true)
check('button has a background (visible square)', btnVisual !== null && btnVisual.hasBg === true)
check('button contains the arrow icon', btnVisual !== null && btnVisual.hasSvg === true)
check('rail shell width is 30px', btnVisual !== null && btnVisual.railW === 30)
check('button width matches rail (30px)', btnVisual !== null && btnVisual.btnW === 30 && btnVisual.btnW === btnVisual.railW)
check('button radius matches rail shell (12px)', btnVisual !== null && btnVisual.btnRadius === 12 && btnVisual.btnRadius === btnVisual.railRadius)
check('button has a background (visible square)', btnVisual !== null && btnVisual.hasBg === true)
check('button contains the arrow icon', btnVisual !== null && btnVisual.hasSvg === true)

// Click it → transcript scrolls to bottom (smooth scroll; poll until it
// settles since headless RAF can be slow).
await ev(`(() => { const b = document.querySelector('[data-dsh-part="outline-bottom"]'); if (b) b.click(); })()`)
let bottomState = null
for (let i = 0; i < 20; i += 1) {
  await sleep(400)
  bottomState = await ev(`(() => {
    const sp = document.querySelector('[data-conversation-scroll]');
    const b = document.querySelector('[data-dsh-part="outline-bottom"]');
    return { atBottom: sp.scrollTop + sp.clientHeight >= sp.scrollHeight - 24, btnGone: b === null, scrollTop: sp.scrollTop, scrollHeight: sp.scrollHeight, clientHeight: sp.clientHeight };
  })()`)
  if (bottomState.atBottom === true || (bottomState.scrollTop ?? 0) + (bottomState.clientHeight ?? 0) >= (bottomState.scrollHeight ?? 0) - 24) break
}
console.log('  after click:', JSON.stringify(bottomState))
check('click scrolls to bottom', (bottomState?.atBottom ?? false) === true)
check('button hides once at bottom', bottomState?.btnGone === true)

// Scroll up again → button reappears.
await ev(`(() => { const sp = document.querySelector('[data-conversation-scroll]'); if (sp) sp.scrollTop = 0; })()`)
await sleep(600)
const btnAgain = await ev(`document.querySelector('[data-dsh-part="outline-bottom"]') !== null`)
check('button reappears when scrolled up again', btnAgain === true)

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
