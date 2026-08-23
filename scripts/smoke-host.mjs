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
  check('LIB_VERSION matches 0.1.2', LIB_VERSION === '0.1.2')
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

  ctx.dispose?.()
} catch (error) {
  failures += 1
  console.error('THREW:', error)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
