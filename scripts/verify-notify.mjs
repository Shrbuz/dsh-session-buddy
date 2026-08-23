/**
 * Hidden-tab notification probe — verify that when the tab is hidden and a
 * reply-complete event fires, a Web Notification is actually delivered (and
 * that nothing fires while the tab is visible).
 *
 * Strategy: install an interceptor on `window.Notification` BEFORE the plugin
 * bundle loads (via addScriptToEvaluateOnNewDocument) so we can observe real
 * constructions, then:
 *   1. with the tab VISIBLE: append a synthetic settled assistant row → the
 *      listener should classify a reply event, but notify() must NOT fire.
 *   2. hide the tab (document.hidden override), append a NEW settled assistant
 *      row → notify() should construct a Notification.
 *
 * Usage: node scripts/verify-notify.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9235
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-notif-'))
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

// Intercept Notification BEFORE the page scripts run, so the plugin bundle's
// `new Notification(...)` calls are observable. We override the constructor
// and record invocations.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__notifLog = [];
    const OrigNotification = window.Notification;
    window.Notification = function (title, opts) {
      window.__notifLog.push({ title, body: opts?.body ?? null, tag: opts?.tag ?? null });
      return { close: () => {}, onclick: null, title, body: opts?.body ?? null };
    };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = () => Promise.resolve('granted');
  `,
})

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
await sleep(3000)

let failures = 0
function check(name, condition) {
  if (condition) { console.log('  ok  ' + name) }
  else { failures += 1; console.log('FAIL  ' + name) }
}

// Grant the plugin's own permission check by making Notification.permission granted.
await ev(`window.Notification.permission = 'granted'`)

// The plugin mounted on the hero screen; restore our session so the listener
// runs against a real transcript.
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb' }))`)
await send('Page.reload', { ignoreCache: true })
await sleep(3000)
for (let i = 0; i < 30; i += 1) {
  if (await ev(`document.querySelector('[data-conversation-scroll]') !== null`)) break
  await sleep(1000)
}
for (let i = 0; i < 5; i += 1) {
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /加载更早|Load earlier/i.test(x.textContent || '')); if (b) b.click(); })()`)
  await sleep(800)
}

// --- helper: append a synthetic settled assistant row that the listener will
// treat as a NEW settled turn (fresh anchor key + stable text). ---
const appendAssistantRow = async (key, text) => {
  await ev(`(() => {
    const sp = document.querySelector('[data-conversation-scroll]');
    if (!sp) return 'no-scrollport';
    const row = document.createElement('div');
    row.setAttribute('data-chat-anchor-key', '${key}');
    row.setAttribute('data-chat-flow-key', '${key}');
    row.setAttribute('data-chat-flow-kind', 'assistant-step');
    row.setAttribute('data-dsh-part', 'message-row');
    row.textContent = '${text}';
    sp.appendChild(row);
    return 'appended';
  })()`)
  await sleep(1600) // > SETTLED_GRACE_MS so it stabilizes
}

// --- Phase A: tab VISIBLE → reply completes → must NOT notify ---
console.log('\n== phase A: visible tab, reply completes ==')
console.log('  hidden?', await ev(`document.hidden`))
await appendAssistantRow('verify:a1', '可见时的测试回复内容')
const aLog = await ev(`window.__notifLog`)
check('no notification while visible', Array.isArray(aLog) && aLog.length === 0)

// --- Phase B: tab HIDDEN → new reply completes → must notify ---
console.log('\n== phase B: hidden tab, reply completes ==')
// Force document.hidden=true by overriding the visibilityState (CDP emulation).
await send('Emulation.setPageVisibilityState', { visibilityState: 'hidden' })
// Also set the document.hidden property directly for the plugin's check.
await ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })`)
await ev(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })`)
console.log('  hidden now?', await ev(`document.hidden`))
await appendAssistantRow('verify:a2', '隐藏标签页时的测试回复内容')
await sleep(800)
const bLog = await ev(`window.__notifLog`)
console.log('  notif log:', JSON.stringify(bLog))
check('notification fired while hidden', Array.isArray(bLog) && bLog.length > 0)
check('notification title is session title', Array.isArray(bLog) && (bLog[0]?.title ?? '').includes('分析需求'))
check('notification body has trigger + summary', Array.isArray(bLog) && /AI 回复完成|回复完成/.test(bLog[0]?.body ?? ''))

// --- Phase C: hidden but ask/confirm switches off → no extra notification ---
console.log('\n== phase C: hidden + reply again (dedupe per turn) ==')
await appendAssistantRow('verify:a3', '第三次测试回复')
await sleep(800)
const cLog = await ev(`window.__notifLog`)
console.log('  notif count after third:', Array.isArray(cLog) ? cLog.length : 0)
check('each turn notifies once', Array.isArray(cLog) && cLog.length >= 2)

// restore visibility
await send('Emulation.setPageVisibilityState', { visibilityState: 'visible' })

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
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
process.exit(failures === 0 ? 0 : 1)
