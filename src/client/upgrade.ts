/**
 * dsh-session-buddy browser half — version check + in-app upgrade wiring for
 * the settings card. Talks to the host's loopback routes:
 *   GET  /api/session-buddy/toast/version        → current/latest
 *   POST /api/session-buddy/toast/update         → start upgrade, get jobId
 *   GET  /api/session-buddy/toast/update/status  → poll job state
 * All calls fail-closed: a fetch/parse failure surfaces as "unknown / failed"
 * in the card and never throws into the settings UI.
 * @module dsh-session-buddy/client/upgrade
 */

/** The host route family (mirrors src/index.ts). */
const ROUTE = '/api/session-buddy/toast'

/** The version-check response the host serves. */
export interface VersionResponse {
  ok: boolean
  name?: string
  current?: string
  latest?: string
  updateAvailable?: boolean
}

/** The upgrade-start response the host serves. */
export interface StartUpgradeResponse {
  ok: boolean
  jobId?: string
  error?: string
}

/** One upgrade job's polled state. */
export interface UpgradeJobState {
  id: string
  targetVersion: string
  phase: 'running' | 'done' | 'error'
  error?: string
}

/** The status-response the host serves. */
export interface StatusResponse {
  ok: boolean
  job?: UpgradeJobState
  error?: string
}

/** Check the current/latest version through the host. Never throws. */
export async function checkVersion(): Promise<VersionResponse | undefined> {
  try {
    const response = await fetch(`${ROUTE}/version`, { method: 'GET' })
    if (!response.ok) return undefined
    const body = (await response.json()) as unknown
    if (typeof body !== 'object' || body === null) return undefined
    return body as VersionResponse
  } catch {
    return undefined
  }
}

/** Start an upgrade to `version`. Returns the job id, or undefined on failure. */
export async function startUpgrade(version: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${ROUTE}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as StartUpgradeResponse
    if (body.ok !== true || body.jobId === undefined) return undefined
    return body.jobId
  } catch {
    return undefined
  }
}

/** Poll one upgrade job until it settles or `timeoutMs` elapses. Never throws. */
export async function pollUpgrade(jobId: string, timeoutMs = 120_000): Promise<UpgradeJobState | undefined> {
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const response = await fetch(`${ROUTE}/update/status?id=${encodeURIComponent(jobId)}`, { method: 'GET' })
      if (response.ok) {
        const body = (await response.json()) as StatusResponse
        if (body.ok === true && body.job !== undefined) {
          if (body.job.phase === 'done' || body.job.phase === 'error') return body.job
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  } catch {
    // Polling is best-effort; fall through.
  }
  return undefined
}
