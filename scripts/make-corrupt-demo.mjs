/**
 * TEMP diagnostic helper — inject a corrupt row into a sacrificial session's
 * log so the GUI shows the ⚠ badge + "删除会话" menu for a screenshot.
 *
 * Only safe for a session you are willing to lose: after this, the session
 * can no longer be loaded (that is the point) and should be deleted via the
 * injected "删除会话" item.
 *
 * Usage: node scripts/make-corrupt-demo.mjs <sessionDir>
 * (sessionDir = absolute path of the session-* directory containing
 *  session.jsonl.zstd)
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { decodeSessionRows, detectCorruption } from '../lib/index.js'

const dir = process.argv[2]
if (dir === undefined || !existsSync(dir)) {
  console.error('usage: node scripts/make-corrupt-demo.mjs <sessionDir>')
  process.exit(2)
}
const log = join(dir, 'session.jsonl.zstd')
if (!existsSync(log)) {
  console.error('no session.jsonl.zstd in', dir)
  process.exit(2)
}

const beforeBuf = readFileSync(log)
const before = decodeSessionRows(beforeBuf)
console.log('before: rows=%d decodeError=%s corrupt=%s', before.rows.length, before.decodeError, detectCorruption(before.rows).corrupt)

// Back up the original so the experiment can be reverted.
writeFileSync(log + '.bak', beforeBuf)

// A tool/result with an empty message.source.callId — the exact shape dsh
// writes when the model emits a tool call with an empty name, and the exact
// thing dsh's own load validation refuses to read back.
const badRow = {
  type: 'tool/result',
  seq: 900000,
  time: Date.now(),
  data: {
    turn: 1,
    step: 1,
    message: {
      role: 'user',
      id: 'm-corrupt-demo',
      source: { kind: 'tool', callId: '' },
      content: [{ type: 'tool-result', toolCallId: '', content: [{ type: 'text', text: 'corrupt demo' }] }],
    },
  },
}
const frame = zstdCompressSync(Buffer.from(JSON.stringify(badRow) + '\n'))
appendFileSync(log, frame)

const after = decodeSessionRows(readFileSync(log))
const det = detectCorruption(after.rows)
console.log('after:  rows=%d corrupt=%s reason=%s', after.rows.length, det.corrupt, det.reason)
console.log(det.corrupt ? 'OK — session is now corrupt; refresh the GUI to see the ⚠ badge.' : 'FAIL — still not corrupt')
process.exit(det.corrupt ? 0 : 1)
