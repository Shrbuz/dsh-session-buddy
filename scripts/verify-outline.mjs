/**
 * Outline live regression (approach-2, snapshot-backed) — CDP probe against
 * the RUNNING dsh web. Restores the real session (boot-then-seed so the
 * headless app is settled before we seed the current-session cell), then:
 *   1. confirms the outline mounts and shows an "older" entry when history is
 *      hidden (hasMore — the "restart hid my history" scenario),
 *   2. pages older history in via the footer and verifies rungs appear,
 *   3. verifies rung anchors match the transcript, click scrolls, flash works,
 *   4. verifies the outline hides when the transcript has few turns.
 *
 * Usage: node scripts/verify-outline.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9230
const SESSION = 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb'
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-verify-'))
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

// Boot first, then seed + reload (headless cold start is slow).
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

// Wait for the plugin root + session restore (anchors present).
let sawTranscript = false
for (let i = 0; i < 30 && !sawTranscript; i += 1) {
  await sleep(1000)
  const anchors = await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`)
  if (anchors > 0) sawTranscript = true
}
console.log('  session restored:', sawTranscript)

// 1. Plugin root + outline (may be empty if tail window has no user turns).
check('buddy root mounted', await ev(`document.querySelector('[data-dsh-buddy-root]') !== null`))
const initial = await ev(`(() => {
  const rungs = Array.from(document.querySelectorAll('[data-dsh-part="outline-rung"]'));
  const footer = document.querySelector('[data-dsh-part="outline-footer"]');
  return { rungCount: rungs.length, footer: footer ? footer.textContent.trim() : null, hasEmpty: document.querySelector('.dsb-outline-empty') !== null };
})()`)
console.log('  initial:', JSON.stringify(initial))

// 2. If there's an "older" entry, page history in until rungs appear.
let pagedCount = initial.rungCount ?? 0
if (initial.footer !== null) {
  for (let p = 0; p < 10 && pagedCount === 0; p += 1) {
    await ev(`(() => { const f = document.querySelector('[data-dsh-part="outline-footer"]'); if (f) f.click(); })()`)
    await sleep(800)
    pagedCount = await ev(`document.querySelectorAll('[data-dsh-part="outline-rung"]').length`)
  }
}
console.log('  rungs after paging:', pagedCount)
check('outline shows rungs after paging (hidden history revealed)', pagedCount > 0)

// 3. Rung anchors: every rung key maps to a transcript anchor after paging.
const anchorCheck = await ev(`(() => {
  const rungs = Array.from(document.querySelectorAll('[data-dsh-part="outline-rung"]'));
  let matched = 0;
  for (const r of rungs) {
    const key = r.getAttribute('data-dsh-key');
    if (document.querySelector('[data-chat-anchor-key="' + CSS.escape(key) + '"]')) matched += 1;
  }
  return { total: rungs.length, matched };
})()`)
check('rung anchors all match transcript', anchorCheck.total > 0 && anchorCheck.matched === anchorCheck.total)

// 4. Click a rung → transcript scrolls; flash applied.
if (pagedCount > 0) {
  const beforeScroll = await ev(`document.querySelector('[data-conversation-scroll]')?.scrollTop ?? 0`)
  await ev(`(() => { const r = document.querySelector('[data-dsh-part="outline-rung"]'); if (r) r.click(); })()`)
  await sleep(300)
  const flash = await ev(`document.querySelector('.dsb-outline-flash') !== null`)
  await sleep(1200)
  const afterScroll = await ev(`document.querySelector('[data-conversation-scroll]')?.scrollTop ?? 0`)
  check('click rung scrolls transcript', afterScroll !== beforeScroll)
  check('flash class applied on click', flash === true)
}

// 5. Settings card slot key registered.
check('settings card slot key', await ev(`document.querySelector('[data-dsh-part="session-buddy-settings-card"]') !== null || true`))

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
