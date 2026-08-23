/**
 * CDP probe — the requirements doc's "最关键前置步骤": capture the REAL dsh
 * conversation DOM to confirm the exact signals for
 *   1. assistant reply completion (streaming → settled)
 *   2. waiting-for-user-input
 *   3. approval/confirmation dialog
 *   4. user-vs-assistant row distinction
 *   5. session title element
 * Everything the client DOM layer (src/client/dom.ts) and event model need is
 * verified here before we trust the heuristics.
 *
 * Usage: node scripts/cdp-probe.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3080
const CDP_PORT = 9227
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = mkdtempSync(join(tmpdir(), 'dsb-probe-'))
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

// Seed the persisted current-session cell BEFORE the app boots, so it restores
// the real conversation instead of landing on the hero/workspace-picker screen.
// dsh.sessions.current is the snapshot-store persist key (see
// dsh-client-runtime sessions service).
await ev(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'session-671e2384-33d8-4df1-b578-2c6f1d47e0bb' }))`)
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })
for (let i = 0; i < 60; i += 1) {
  await sleep(1000)
  if (await ev(`document.querySelector('[data-conversation-scroll]') !== null`)) break
}
const restored = await ev(`JSON.parse(localStorage.getItem('dsh.sessions.current') || '{}').sessionId`)
console.log('== boot ==')
console.log('restored session:', restored)
console.log('scrollport present:', await ev(`document.querySelector('[data-conversation-scroll]') !== null`))
console.log('composer seat:', await ev(`document.querySelector('[data-composer-seat]') !== null`))
console.log('body text head:', await ev(`(document.body?.innerText ?? '').slice(0, 120)`))

// Wait for real anchor rows to render.
let anchors = 0
for (let i = 0; i < 40 && anchors === 0; i += 1) {
  await sleep(1000)
  anchors = await ev(`document.querySelectorAll('[data-chat-anchor-key]').length`)
}
console.log('anchor rows found:', anchors)

// Long sessions virtualize: click "加载更早" / "Load earlier" repeatedly so
// older USER messages render, then re-scan for a user row.
for (let attempt = 0; attempt < 3; attempt += 1) {
  const loaded = await ev(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /加载更早|Load earlier/i.test(b.textContent || ''));
      if (!btn) return 'no-load-earlier-btn';
      btn.click();
      return 'clicked';
    })()
  `)
  console.log('load-earlier:', loaded)
  await sleep(1200)
}

// --- 1. Anchor rows: count + structure ---
const rows = await ev(`
  Array.from(document.querySelectorAll('[data-chat-anchor-key]')).map((row) => {
    const attrs = {};
    for (const a of row.attributes) attrs[a.name] = a.value.slice(0, 80);
    const cls = (row.className || '').toString().slice(0, 120);
    const text = (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    const rect = row.getBoundingClientRect();
    return { key: row.getAttribute('data-chat-anchor-key'), attrs, cls, text, x: Math.round(rect.x), width: Math.round(rect.width), height: Math.round(rect.height) };
  })
`)
console.log('\n== anchor rows ==')
if (Array.isArray(rows)) {
  console.log('count:', rows.length)
  for (const r of rows.slice(0, 8)) {
    console.log(`- key=${r.key} h=${r.height} w=${r.width} x=${r.x}`)
    console.log(`    class: ${r.cls}`)
    console.log(`    text : ${r.text}`)
    console.log(`    attrs: ${JSON.stringify(r.attrs)}`)
  }
} else {
  console.log('rows:', rows)
}

// --- 1b. Distinct flow-kinds (the stable role marker) ---
console.log('\n== flow-kind histogram ==')
console.log(await ev(`
  (() => {
    const hist = {};
    const samples = {};
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const kind = row.getAttribute('data-chat-flow-kind') || '(none)';
      hist[kind] = (hist[kind] ?? 0) + 1;
      if (samples[kind] === undefined) {
        samples[kind] = {
          key: row.getAttribute('data-chat-anchor-key'),
          cls: (row.className || '').toString().slice(0, 70),
          text: (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50),
          rightAligned: (() => {
            const rect = row.getBoundingClientRect();
            for (const c of row.querySelectorAll('div, section')) {
              const cr = c.getBoundingClientRect();
              if (cr.width > 0 && Math.abs(cr.right - rect.right) < 12 && cr.left - rect.left > 40) return true;
            }
            return false;
          })()
        };
      }
    }
    return { hist, samples };
  })()
`))

// --- 1c. Find the USER message rows: search for any element mentioning user / input ---
console.log('\n== user/input message row candidates ==')
console.log(await ev(`
  (() => {
    const out = [];
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const key = row.getAttribute('data-chat-anchor-key') || '';
      const kind = row.getAttribute('data-chat-flow-kind') || '';
      const cls = (row.className || '').toString();
      const text = (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
      if (/user|input|message|steering/i.test(key + kind) || /user/i.test(cls)) {
        out.push({ key, kind, cls: cls.slice(0, 70), text });
      }
    }
    return out.slice(0, 20);
  })()
`))

// --- 1e. All rows whose anchor-key contains input-message / user / steering, with FULL attrs ---
console.log('\n== input-message / user / steering anchor rows (full attrs) ==')
console.log(await ev(`
  (() => {
    const out = [];
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const key = row.getAttribute('data-chat-anchor-key') || '';
      if (!/input-message|user|steering/i.test(key)) continue;
      const attrs = {};
      for (const a of row.attributes) attrs[a.name] = a.value;
      const rect = row.getBoundingClientRect();
      out.push({
        key,
        attrs,
        cls: (row.className || '').toString().slice(0, 80),
        text: (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50),
        right: Math.round(rect.right),
        left: Math.round(rect.left)
      });
    }
    return out;
  })()
`))

// --- 1h. Locate USER question text in the DOM and show its row structure ---
console.log('\n== locate user-question text rows ==')
console.log(await ev(`
  (() => {
    const needles = ['分析需求', '打断一下', '开始吧', '你知道dsh-web-notes', '官方插件是否已经有'];
    const out = [];
    for (const needle of needles) {
      const found = [];
      for (const el of document.querySelectorAll('body *')) {
        const t = (el.textContent || '').trim();
        if (t === needle || (t.length < 120 && t.includes(needle))) {
          // walk up to the nearest anchor row
          let row = el;
          let hops = 0;
          while (row && !row.hasAttribute('data-chat-anchor-key') && hops < 8) { row = row.parentElement; hops += 1; }
          const attrs = {};
          for (const a of (row?.attributes ?? [])) attrs[a.name] = a.value;
          found.push({
            needle,
            leafCls: (el.className || '').toString().slice(0, 50),
            leafText: t.slice(0, 40),
            rowKey: row?.getAttribute('data-chat-anchor-key') ?? null,
            rowCls: row ? (row.className || '').toString().slice(0, 60) : null,
            rowKind: row?.getAttribute('data-chat-flow-kind') ?? null,
            rowAttrs: attrs
          });
          break;
        }
      }
      out.push(...found);
    }
    return out;
  })()
`))

// --- 2. Distinguish user vs assistant rows (based on flow-kind + geometry) ---
const dist = await ev(`
  (() => {
    const out = [];
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const text = (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50);
      const rect = row.getBoundingClientRect();
      let rightAligned = false;
      const children = row.querySelectorAll('div, section');
      for (const c of children) {
        const cr = c.getBoundingClientRect();
        if (cr.width > 0 && Math.abs(cr.right - rect.right) < 12 && cr.left - rect.left > 40) { rightAligned = true; break; }
      }
      const cls = (row.className || '').toString();
      out.push({
        key: row.getAttribute('data-chat-anchor-key'),
        kind: row.getAttribute('data-chat-flow-kind'),
        rightAligned,
        clsHasUser: /user/i.test(cls),
        clsHasAssist: /assist|agent|model/i.test(cls),
        text
      });
    }
    // only show rows whose kind is user-like OR first few of each kind
    return out.filter((r) => r.kind === 'user' || r.rightAligned || r.clsHasUser).concat(
      out.filter((r) => r.kind !== 'user' && !r.rightAligned && !r.clsHasUser).slice(0, 3)
    ).slice(0, 15);
  })()
`)
console.log('\n== user vs assistant ==')
console.log(JSON.stringify(dist, null, 2))

// --- 3. Session title ---
console.log('\n== session title ==')
console.log('title:', await ev(`
  (() => {
    const sp = document.querySelector('[data-conversation-scroll]');
    const scope = sp ?? document;
    const candidates = scope.querySelectorAll('h1, h2, [class*="title"], [class*="header"]');
    return Array.from(candidates).slice(0, 8).map((el) => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), text: (el.textContent||'').trim().slice(0, 60) }));
  })()
`))

// --- 4. Streaming/settled signals: check for aria-busy, progress, status markers ---
console.log('\n== settled/streaming markers ==')
console.log(await ev(`
  (() => {
    const markers = [];
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const key = row.getAttribute('data-chat-anchor-key');
      const busy = row.matches('[aria-busy="true"]') || row.querySelector('[aria-busy="true"]') !== null;
      const cls = (row.className || '').toString();
      markers.push({ key, busy, clsBusy: /busy|stream|loading|pending/i.test(cls), clsSettled: /settled|done|complete/i.test(cls) });
    }
    return markers;
  })()
`))

// --- 5. Dialogs (approval) present? ---
console.log('\n== dialogs ==')
console.log('role=dialog:', await ev(`document.querySelector('[role="dialog"]') !== null`))
console.log('any dialog-ish:', await ev(`
  Array.from(document.querySelectorAll('[role="dialog"], [data-dialog], .dialog, [class*="modal"], [class*="confirm"], [class*="approve"]')).slice(0,5).map((el) => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), text: (el.textContent||'').trim().slice(0,60) }))
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
