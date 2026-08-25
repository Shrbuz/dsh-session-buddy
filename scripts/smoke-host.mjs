/**
 * Standalone host-logic smoke test — runs WITHOUT the dsh web app: builds a
 * bare cordis Context and drives the session-buddy host half directly. The
 * host half only carries the settings namespace, so this verifies the schema
 * defaults, the settings section resolution, and the mount-once guard.
 * Usage: node scripts/smoke-host.mjs
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// The built host half is ESM (lib/index.js). Import it dynamically.
const mod = await import(pathToFileURL(join(__dirname, '..', 'lib', 'index.js')).href)
const { makeSessionBuddySettingsSchema, SESSION_BUDDY_NAMESPACE, name } = mod

// The upgrade module is bundled into lib/index.js; its exported pure helpers
// are reachable through the same module namespace.
const {
  LIB_VERSION,
  parseVersion,
  compareVersions,
  unsafeSpecReason,
  PACKAGE_NAME,
  findDshBinary,
  resolveLaunch,
  BuddyMonitor,
  assistantSummary,
  tryClaimNotification,
  decodeSessionRows,
  detectCorruption,
  detectCorruptionInLog,
} = mod

// A bare cordis Context.
const { Context } = require('@deepseek-ai/cordis')

let failures = 0
function check(name, condition) {
  if (condition) {
    console.log('  ok  ' + name)
  } else {
    failures += 1
    console.log('FAIL  ' + name)
  }
}

try {
  const ctx = new Context()

  check('plugin name', name === 'session-buddy')
  check('settings namespace', SESSION_BUDDY_NAMESPACE === 'session-buddy')

  // Schema defaults.
  const schema = makeSessionBuddySettingsSchema()
  const parsed = schema({})
  check('enabled default true', parsed.enabled === true)
  check('notifyReply default true', parsed.notifyReply === true)
  check('notifyAsk default true', parsed.notifyAsk === true)
  check('notifyConfirm default true', parsed.notifyConfirm === true)
  check('sound default false', parsed.sound === false)
  check('outlineWidth default 18', parsed.outlineWidth === 18)
  check('showTimestamps default true', parsed.showTimestamps === true)

  // The client-side collapse grouping is pure and node-importable via the
  // tsc-emitted ESM (lib/types/client/collapse-tools.js). The client bundle is
  // a CJS closure (window.__ModuleLoader__), so these pure helpers are tested
  // from the type-emit instead.
  const collapse = await import(pathToFileURL(join(__dirname, '..', 'lib', 'types', 'client', 'collapse-tools.js')).href)
  const { parseTurnFromKey, groupToolRuns, groupThinkRuns } = collapse
  check('parseTurnFromKey reads 9:turn-tail1', parseTurnFromKey('9:turn-tail1') === 1)
  check('parseTurnFromKey reads 9:turn-tail123', parseTurnFromKey('9:turn-tail123') === 123)
  check('parseTurnFromKey rejects tool-call key', parseTurnFromKey('9:tool-callabc') === null)
  check('parseTurnFromKey rejects garbage', parseTurnFromKey('nope') === null)
  check('groupToolRuns counts one turn', JSON.stringify(
    groupToolRuns([
      { key: '9:tool-callpwsh1', kind: 'tool-call' },
      { key: '9:tool-callread2', kind: 'tool-call' },
      { key: '9:turn-tail1', kind: 'turn-tail' },
    ]),
  ) === JSON.stringify([{ turn: 1, steps: 2, toolRowIndexes: [0, 1] }]))
  check('groupToolRuns separates turns by tail', JSON.stringify(
    groupToolRuns([
      { key: '9:tool-callw', kind: 'tool-call' },
      { key: '9:turn-tail1', kind: 'turn-tail' },
      { key: '9:tool-callg', kind: 'tool-call' },
      { key: '9:turn-tail2', kind: 'turn-tail' },
    ]),
  ) === JSON.stringify([
    { turn: 1, steps: 1, toolRowIndexes: [0] },
    { turn: 2, steps: 1, toolRowIndexes: [2] },
  ]))
  check('groupToolRuns skips running turn (no tail yet)', JSON.stringify(
    groupToolRuns([
      { key: '9:tool-callw', kind: 'tool-call' },
    ]),
  ) === JSON.stringify([]))
  check('groupToolRuns ignores non-tool rows', JSON.stringify(
    groupToolRuns([
      { key: '9:user', kind: 'user' },
      { key: '9:tool-callx', kind: 'tool-call' },
      { key: '9:assistant-step1', kind: 'assistant-step' },
      { key: '9:turn-tail1', kind: 'turn-tail' },
    ]),
  ) === JSON.stringify([{ turn: 1, steps: 1, toolRowIndexes: [1] }]))

  // Think grouping: ≥2 thinks per turn → one group; single think stays as-is;
  // context rows fold into whatever turn's window they fall inside; text-only
  // "小结" assistant-step rows fold too, but the LAST assistant-step row (final
  // summary) stays visible.
  const thinkRow = (kind, thinkCount = 0, isContext = false) => ({ key: `k:${kind}-${thinkCount}`, kind, thinkCount, isContext })
  const turnTail = (turn) => ({ key: `9:turn-tail${turn}`, kind: 'turn-tail', thinkCount: 0, isContext: false })
  check('groupThinkRuns folds a multi-think turn', JSON.stringify(
    groupThinkRuns([
      thinkRow('user'),
      thinkRow('assistant-step', 1),
      thinkRow('assistant-step', 1),
      turnTail(1),
    ]),
  ) === JSON.stringify([{ turn: 1, thinks: 2, stepIndexes: [1, 2], finalStepIndex: 2, contextIndexes: [] }]))
  check('groupThinkRuns folds a single think into nothing', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 1),
      turnTail(1),
    ]),
  ) === JSON.stringify([]))
  check('groupThinkRuns folds context rows with the thinks', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 1),
      thinkRow('context', 0, true),
      thinkRow('assistant-step', 1),
      turnTail(1),
    ]),
  ) === JSON.stringify([{ turn: 1, thinks: 2, stepIndexes: [0, 2], finalStepIndex: 2, contextIndexes: [1] }]))
  check('groupThinkRuns separates turns by tail', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 1),
      thinkRow('assistant-step', 1),
      turnTail(1),
      thinkRow('assistant-step', 1),
      turnTail(2),
    ]),
  ) === JSON.stringify([{ turn: 1, thinks: 2, stepIndexes: [0, 1], finalStepIndex: 1, contextIndexes: [] }]))
  check('groupThinkRuns counts multiple thinks per row', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 2),
      thinkRow('assistant-step', 1),
      turnTail(1),
    ]),
  ) === JSON.stringify([{ turn: 1, thinks: 3, stepIndexes: [0, 1], finalStepIndex: 1, contextIndexes: [] }]))
  check('groupThinkRuns tracks text-only 小结 rows', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 1),
      thinkRow('assistant-step', 0),
      thinkRow('assistant-step', 1),
      turnTail(1),
    ]),
  ) === JSON.stringify([{ turn: 1, thinks: 2, stepIndexes: [0, 1, 2], finalStepIndex: 2, contextIndexes: [] }]))
  check('groupThinkRuns skips running turn (no tail yet)', JSON.stringify(
    groupThinkRuns([
      thinkRow('assistant-step', 1),
      thinkRow('assistant-step', 1),
    ]),
  ) === JSON.stringify([]))

  // Schema clamps / overrides.
  const overridden = schema({
    enabled: false,
    notifyReply: false,
    sound: true,
  })
  check('enabled override honored', overridden.enabled === false)
  check('notifyReply override honored', overridden.notifyReply === false)
  check('sound override honored', overridden.sound === true)

  // outlineWidth is range-validated (schemastery rejects, it does not clamp);
  // the browser half additionally clamps defensively.
  let rangeRejected = false
  try {
    schema({ outlineWidth: 500 })
  } catch {
    rangeRejected = true
  }
  check('outlineWidth out-of-range rejected', rangeRejected)

  // ---- Upgrade module pure helpers (version parsing / comparison / spec) ----
  check('PACKAGE_NAME is dsh-session-buddy', PACKAGE_NAME === 'dsh-session-buddy')
  check('LIB_VERSION matches 0.3.0', LIB_VERSION === '0.3.0')
  check('parseVersion parses 1.2.3', JSON.stringify(parseVersion('1.2.3')) === '{"major":1,"minor":2,"patch":3}')
  check('parseVersion strips leading v', JSON.stringify(parseVersion('v1.2.3')) === '{"major":1,"minor":2,"patch":3}')
  check('parseVersion rejects garbage', parseVersion('not-a-version') === undefined)
  check('compareVersions older<newer', (compareVersions('0.1.0', '0.1.1') ?? 0) < 0)
  check('compareVersions newer>older', (compareVersions('0.2.0', '0.1.9') ?? 0) > 0)
  check('compareVersions equal', (compareVersions('1.2.3', 'v1.2.3') ?? -1) === 0)
  check('compareVersions invalid returns undefined', compareVersions('a', 'b') === undefined)
  check('unsafeSpecReason rejects shell metachar', unsafeSpecReason('x; rm -rf /') !== undefined)
  check('unsafeSpecReason rejects spaces', unsafeSpecReason('a b') !== undefined)
  check('unsafeSpecReason accepts plain name', unsafeSpecReason('dsh-session-buddy') === undefined)
  check('unsafeSpecReason accepts name@version', unsafeSpecReason('dsh-session-buddy@1.2.3') === undefined)

  // ---- dsh CLI launch resolution (no execution — parsing only) ----
  check('findDshBinary returns non-empty', (findDshBinary() ?? '').length > 0)
  // Windows: the resolved launch must run node + the real bin script, never
  // shell out to a bare "dsh" (which Windows cannot spawn directly).
  if (process.platform === 'win32') {
    const binary = findDshBinary()
    const launch = resolveLaunch(binary)
    check('win32 launch.command is node', launch.command === process.execPath)
    check('win32 launch.argsPrefix points at dsh lib/bin.js',
      launch.argsPrefix.length === 1 && launch.argsPrefix[0].endsWith('lib\\bin.js'))
  } else {
    const binary = findDshBinary()
    const launch = resolveLaunch(binary)
    check('posix launch.command non-empty', launch.command.length > 0)
    check('posix launch shell false', launch.shell !== true)
  }

  // ---- Event-driven trigger monitor (BuddyMonitor) ----
  // reply: turn/start → assistant/message(text) → turn/end(completed)
  const emitted = []
  const monitor = new BuddyMonitor((trigger) => emitted.push(trigger))
  monitor.ingest({ id: 'sess-1', header: { cwd: 'C:\\ws' } }, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  const mid = monitor.ingest({ id: 'sess-1', header: { cwd: 'C:\\ws' } }, {
    type: 'assistant/message', time: 1100,
    data: { turn: 1, step: 0, message: { content: [{ type: 'text', text: '  完成了 工作 ' }, { type: 'reasoning', text: 'hidden' }] } },
  })
  check('assistant/message derives no trigger', mid === null)
  const reply = monitor.ingest({ id: 'sess-1', header: { cwd: 'C:\\ws' } }, { type: 'turn/end', time: 1200, data: { turn: 1, reason: { kind: 'completed' } } })
  check('turn/end completed derives reply', reply !== null && reply.kind === 'reply')
  check('reply carries session/workspace/turn', reply.sessionId === 'sess-1' && reply.workspace === 'C:\\ws' && reply.turn === 1)
  check('reply carries turnStartedAt from turn/start', reply.turnStartedAt === 1000)
  check('reply summary is text blocks only', reply.summary === '完成了 工作')
  check('reply dedupKey is turn-scoped', reply.dedupKey === 'turn:1')
  check('monitor relayed reply to emitter', emitted.length === 1 && emitted[0].kind === 'reply')

  // non-completed turn endings never derive a reply
  const aborted = monitor.ingest({ id: 'sess-2', header: {} }, { type: 'turn/end', time: 1300, data: { turn: 1, reason: { kind: 'aborted' } } })
  check('aborted turn derives nothing', aborted === null)

  // ask: the model calls the ask-user tool
  const ask = monitor.ingest({ id: 'sess-3', header: {} }, { type: 'tool/call', time: 2000, data: { turn: 1, step: 0, callId: 'call-abc', name: 'ask_user_question', arguments: '{}' } })
  check('tool/call ask_user_question derives ask', ask !== null && ask.kind === 'ask' && ask.dedupKey === 'call-abc')

  // confirm: an approval request was raised
  const confirm = monitor.ingest({ id: 'sess-4', header: {} }, { type: 'approval/asked', time: 2100, data: { id: 'apr-1', toolName: 'pwsh' } })
  check('approval/asked derives confirm', confirm !== null && confirm.kind === 'confirm' && confirm.dedupKey === 'apr-1')

  // subagent sessions are ignored (their turns belong to a parent session)
  const sub = monitor.ingest({ id: 'sess-5', header: { origin: 'subagent' } }, { type: 'turn/end', time: 2200, data: { turn: 1, reason: { kind: 'completed' } } })
  check('subagent session ignored', sub === null)

  // unknown / malformed events are ignored without throwing
  const unknown = monitor.ingest({ id: 'sess-6', header: {} }, { type: 'whatever', time: 2300, data: {} })
  check('unknown event type ignored', unknown === null)
  check('assistantSummary skips reasoning blocks', assistantSummary({ content: [{ type: 'text', text: 'a' }, { type: 'reasoning', text: 'b' }] }) === 'a')

  // ---- Notified-ledger claim (cross-tab dedup) ----
  const ledDir = mkdtempSync(join(tmpdir(), 'dsb-ledger-'))
  const ledFile = join(ledDir, 'notified.json')
  check('first claim wins', tryClaimNotification('sess-1:turn:1:reply', ledFile) === true)
  check('second claim of same episode loses', tryClaimNotification('sess-1:turn:1:reply', ledFile) === false)
  check('different episode wins', tryClaimNotification('sess-1:turn:2:reply', ledFile) === true)
  check('empty claimKey always allowed', tryClaimNotification('', ledFile) === true)

  // ---- Session corruption detection (replicates dsh load validation) ----
  const toolResult = (callId) => ({
    type: 'tool/result', seq: 116, time: 1,
    data: { turn: 1, step: 1, message: { role: 'user', id: 'm-1', source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'ok' }] }] } },
  })
  const assistantMessage = (src) => ({
    type: 'assistant/message', seq: 114, time: 1,
    data: { turn: 1, step: 1, message: { role: 'assistant', id: 'm-2', source: src, content: [{ type: 'text', text: 'hi' }] } },
  })
  const packed = { type: 'reasoning-chunks', seq0: 21, time0: 1, data: {} }
  check('valid tool/result is not corrupt', detectCorruption([toolResult('call-1')]).corrupt === false)
  const emptyCall = detectCorruption([toolResult('')])
  check('empty callId tool/result is corrupt', emptyCall.corrupt === true && /tool source/.test(emptyCall.reason ?? ''))
  const mismatch = {
    ...toolResult('a'),
    data: { ...toolResult('a').data, message: { ...toolResult('a').data.message, content: [{ ...toolResult('a').data.message.content[0], toolCallId: 'b' }] } },
  }
  check('tool/result mismatched toolCallId is corrupt', detectCorruption([mismatch]).corrupt === true)
  check('assistant/message missing model source is corrupt', detectCorruption([assistantMessage({ kind: 'model' })]).corrupt === true)
  check('assistant/message with model source passes', detectCorruption([assistantMessage({ kind: 'model', provider: 'p', model: 'm' })]).corrupt === false)
  check('packed storage rows are skipped (not corrupt)', detectCorruption([packed, toolResult('call-1')]).corrupt === false)
  check('envelope violation is corrupt', detectCorruption([{ type: 'tool/result', time: 1, data: {} }]).corrupt === true)

  // Round-trip through the zstd frame encoding the persistence uses.
  const encode = (rows) => zstdCompressSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'))
  const header = { type: 'session', version: 0, id: 'session-x', createdAt: 1, delegationDepth: 0 }
  check('decodeSessionRows round-trips a zstd frame', decodeSessionRows(encode([header, toolResult('call-1')])).rows.length === 2)
  check('detectCorruptionInLog clean log passes', detectCorruptionInLog(encode([header, toolResult('call-1')])).corrupt === false)
  check('detectCorruptionInLog bad log flagged', detectCorruptionInLog(encode([toolResult('')])).corrupt === true)

  ctx.dispose?.()
} catch (error) {
  failures += 1
  console.error('THREW:', error)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
