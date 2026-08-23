/**
 * dsh-session-buddy lightweight in-app upgrade — lets the settings card offer
 * "check for updates" + "upgrade" for THIS package only, without a full plugin
 * manager panel.
 *
 * Design (mirrors the official upgrade path used by @linxin666/dsh-client-ui-
 * plugin-manager, reduced to the single-package case):
 * - Check: read `https://registry.npmjs.org/<name>/latest` for the newest
 *   version; compare with the running LIB_VERSION. Fail-closed: any network /
 *   parse failure reads "unknown" and never blocks the card.
 * - Upgrade: spawn the official `dsh plugin --profile <name> add <pkg>@<ver>`
 *   CLI — the single writer for the profile (the npm web runtime has no
 *   in-process installer service). A bounded job table lets the browser poll
 *   progress instead of a long-blocking request.
 *
 * The CLI is spawned only for the upgrade action; the check is a plain fetch.
 * @module dsh-session-buddy/host/upgrade
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LIB_VERSION } from '../version.ts'

/** The npm package this plugin is published as (self-upgrade target). */
export const PACKAGE_NAME = 'dsh-session-buddy'
/** Registry endpoint for the latest published version (with dsh/engines meta). */
const REGISTRY_LATEST = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
/** Registry fetch timeout; a slow/absent network must not block the card. */
const REGISTRY_TIMEOUT_MS = 5_000
/** A single CLI run must finish within this window (npm install can be slow). */
const CLI_TIMEOUT_MS = 120_000

/** The profile name to operate on. Read once from the environment (dsh sets
 * `DSH_PROFILE` for host plugins); falls back to `web`, the common web UI. */
function profileName(): string {
  return process.env.DSH_PROFILE ?? 'web'
}

/** A short, conservative package/version id allowed in a CLI spec. The spec is
 * interpolated into a `dsh plugin ... add <spec>` argv (no shell), but we still
 * reject shell metacharacters and anything that is not `name` / `name@version`. */
const SAFE_SPEC_RE = /^[A-Za-z0-9@./_~-]+$/

/** Reject an install/update spec that could inject into the CLI argv. */
export function unsafeSpecReason(spec: string): string | undefined {
  if (spec.length === 0 || spec.length > 200) return 'spec-too-long'
  if (!SAFE_SPEC_RE.test(spec)) return 'spec-has-unsafe-chars'
  return undefined
}

/** The installed versions we compare: `1.2.3` (plus optional prerelease). */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

/** Parse a semver-ish string into comparable parts; undefined when malformed. */
export function parseVersion(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = VERSION_RE.exec(value.trim().replace(/^v/, ''))
  if (match === null) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** Compare two version strings; returns >0 when left is newer, <0 older, 0 equal. */
export function compareVersions(left: string, right: string): number | undefined {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/** The published `/latest` manifest shape we care about. */
export interface RegistryVersionManifest {
  version?: unknown
  dsh?: unknown
  engines?: unknown
}

/** Fetch the latest published version + compat metadata. Fail-closed: returns
 * undefined on timeout / non-200 / malformed body / missing version. */
export async function fetchLatestManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<RegistryVersionManifest | undefined> {
  try {
    const response = await fetchImpl(REGISTRY_LATEST, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) })
    if (!response.ok) return undefined
    const body = (await response.json()) as unknown
    if (typeof body !== 'object' || body === null) return undefined
    const manifest = body as RegistryVersionManifest
    if (typeof manifest.version !== 'string') return undefined
    return manifest
  } catch {
    return undefined
  }
}

/** The state of one CLI-backed upgrade job. */
export interface UpgradeJob {
  id: string
  targetVersion: string
  phase: 'running' | 'done' | 'error'
  /** CLI stderr/stdout tail on failure. */
  error?: string
}

/** A resolved launch target for the dsh CLI: either a direct executable, or a
 * node interpreter + script (Windows resolves the .cmd shim to avoid cmd.exe
 * quoting issues with spaced paths). */
export interface DshLaunch {
  command: string
  argsPrefix: string[]
}

/** Locate the `dsh` CLI. Prefers an absolute path we can spawn directly;
 * falls back to a bare name (resolved via the OS). On Windows the .cmd shim is
 * later expanded through node + bin.js (see {@link resolveLaunch}). */
export function findDshBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  void env // keep the seam signature; PATH is resolved by the OS spawn.
  const candidates = [
    'dsh',
    join(dirname(process.execPath), 'dsh'),
    join(dirname(process.execPath), 'dsh.cmd'),
  ]
  for (const candidate of candidates) {
    if ((candidate.includes('\\') || candidate.includes('/')) && existsSync(candidate)) return candidate
  }
  return 'dsh'
}

/** The dsh CLI's npm bin script (matches the `dsh` entry in @deepseek-ai/dsh). */
const DSH_BIN_JS = join(dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh', 'bin', 'dsh.mjs')

/**
 * Resolve a launch command for the CLI. On Windows a `.cmd` shim is a batch
 * file: spawning it through a shell is unreliable (spaced paths, quoting), so
 * we resolve the node binary + the CLI's bin script and spawn those directly.
 * On POSIX the bare `dsh` (or the resolved path) is executed as-is.
 */
export function resolveLaunch(binary: string, platform: NodeJS.Platform = process.platform): DshLaunch {
  if (platform === 'win32' && (binary === 'dsh' || binary.endsWith('.cmd'))) {
    // Resolve the .cmd shim → node + bin script when the bin script exists.
    if (existsSync(DSH_BIN_JS)) {
      return { command: process.execPath, argsPrefix: [DSH_BIN_JS] }
    }
    // Fall back to the system node on PATH with the same bin script.
    return { command: 'node', argsPrefix: [DSH_BIN_JS] }
  }
  return { command: binary, argsPrefix: [] }
}

/** Run the dsh CLI once, capturing stdout+stderr. Returns {code, output}. */
export function runDshCli(
  args: string[],
  timeoutMs = CLI_TIMEOUT_MS,
  spawnImpl: typeof spawn = spawn,
  binary: string | null = findDshBinary(),
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    if (binary === null) {
      resolve({ code: -1, output: 'dsh CLI not found' })
      return
    }
    const launch = resolveLaunch(binary)
    const child = spawnImpl(launch.command, [...launch.argsPrefix, ...args], {
      env: process.env,
      windowsHide: true,
      // No shell: argv is passed directly, so there is no quoting/injection
      // surface. Node + bin.js (Windows) and the plain executable (POSIX) both
      // spawn without a shell.
      shell: false,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const timer = setTimeout(() => { child.kill() }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, output: `failed to spawn dsh CLI: ${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
}

/** A minimal in-memory job table for in-flight upgrades (browser polls it). */
class UpgradeJobs {
  private jobs = new Map<string, UpgradeJob>()
  private counter = 0

  start(targetVersion: string): UpgradeJob {
    const id = `upgrade-${++this.counter}`
    const job: UpgradeJob = { id, targetVersion, phase: 'running' }
    this.jobs.set(id, job)
    return job
  }

  settle(id: string, phase: 'done' | 'error', error?: string): void {
    const job = this.jobs.get(id)
    if (job === undefined) return
    job.phase = phase
    if (error !== undefined) job.error = error
  }

  get(id: string): UpgradeJob | undefined {
    const job = this.jobs.get(id)
    return job === undefined ? undefined : { ...job }
  }
}

/** The shared job table for this process. */
export const upgradeJobs = new UpgradeJobs()

/**
 * Start an in-place upgrade of THIS package to `targetVersion` via the official
 * CLI. Returns the job id for polling; the CLI runs detached (browser polls
 * `/status`). The profile name comes from the environment.
 */
export function startUpgrade(targetVersion: string): { jobId: string; error?: string } {
  const spec = `${PACKAGE_NAME}@${targetVersion}`
  const unsafe = unsafeSpecReason(spec)
  if (unsafe !== undefined) return { jobId: '', error: `invalid upgrade spec: ${unsafe}` }
  const job = upgradeJobs.start(targetVersion)
  void runDshCli([
    'plugin',
    '--profile',
    profileName(),
    'add',
    spec,
  ]).then(({ code, output }) => {
    if (code === 0) upgradeJobs.settle(job.id, 'done')
    else upgradeJobs.settle(job.id, 'error', output.trim() || `dsh plugin add exited with code ${String(code)}`)
  })
  return { jobId: job.id }
}

export { LIB_VERSION }
