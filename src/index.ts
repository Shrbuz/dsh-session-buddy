/**
 * dsh-session-buddy host half — settings namespace + the native-toast route.
 * The browser half reads every switch straight from the settings scope it
 * binds against this namespace, and POSTs {title, body} to /api/session-buddy/
 * toast to have the host pop a real OS notification (no browser permission).
 *
 * Install via `dsh plugin --profile web add link:<this-dir>`; the
 * cordis.patch.yml inserts this plugin row.
 * @module dsh-session-buddy
 */

import { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
// Pull the cordis Context augmentation (`ctx.webServer`) into the program.
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from 'schemastery'
import { mountOnce } from './mount-once.ts'
import { fireNativeToast } from './host/toast.ts'
import {
  LIB_VERSION,
  compareVersions,
  fetchLatestManifest,
  parseVersion,
  startUpgrade,
  upgradeJobs,
  PACKAGE_NAME,
} from './host/upgrade.ts'

// Re-export the upgrade module's pure helpers so standalone tests
// (scripts/smoke-host.mjs) can exercise version parsing/comparison without a
// live web runtime. These are additive, non-breaking public symbols.
export { LIB_VERSION, PACKAGE_NAME, parseVersion, compareVersions, unsafeSpecReason } from './host/upgrade.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'session-buddy'

/**
 * Declared service dependency: the loader defers this plugin's apply until the
 * `webServer` service is available, so the native-toast route can be registered
 * directly at apply time.
 */
export const inject = ['webServer']

/** Settings namespace of the session-buddy capability. */
export const SESSION_BUDDY_NAMESPACE = 'session-buddy'

/** Notification trigger kinds (each independently switchable). */
export type NotifyTrigger = 'reply' | 'ask' | 'confirm'

/**
 * Plugin configuration — all optional, defaults applied by the schema.
 * The browser half reads the effective section through its settings scope.
 */
export interface SessionBuddyConfig {
  /** Master switch for the whole plugin (browser half unmounts when off). */
  enabled?: boolean
  /** Notify when an assistant reply stabilizes. */
  notifyReply?: boolean
  /** Notify when the session is waiting for user input. */
  notifyAsk?: boolean
  /** Notify when an approval/confirmation dialog is waiting. */
  notifyConfirm?: boolean
  /** Play a short sound alongside the notification. */
  sound?: boolean
  /** Ladder outline panel width in px. */
  outlineWidth?: number
  /** Show per-rung timestamps in the tooltip. */
  showTimestamps?: boolean
}

/** The settings-namespace section the web settings surface edits. */
export interface SessionBuddySettingsSection {
  enabled: boolean
  notifyReply: boolean
  notifyAsk: boolean
  notifyConfirm: boolean
  sound: boolean
  outlineWidth: number
  showTimestamps: boolean
}

/** Settings schema: master switch + the three trigger kinds + UI prefs. */
export function makeSessionBuddySettingsSchema() {
  return z.object({
    enabled: z.boolean().default(true),
    notifyReply: z.boolean().default(true),
    notifyAsk: z.boolean().default(true),
    notifyConfirm: z.boolean().default(true),
    sound: z.boolean().default(false),
    outlineWidth: z.number().min(12).max(32).default(18),
    showTimestamps: z.boolean().default(true),
  })
}

/** Register the session-buddy settings namespace on the context. */
export const apply = mountOnce('dsh-session-buddy', applyImpl)

/** Native-toast trigger route the browser half fetches. Loopback-only. */
export const TOAST_ROUTE = '/api/session-buddy/toast'
/** Maximum accepted request body. Toasts carry only title+body text, so a
 * small cap (and an early stream destroy) is a cheap DoS hardening. */
const MAX_BODY_BYTES = 8 * 1024

/** The request's socket address (authoritative; never trust forwarded headers). */
function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/**
 * Loopback-only + browser same-origin fence for the toast route: the socket
 * address must be loopback, the Host header must name a loopback host, and a
 * cross-site fetch (any other local page or a remote origin) is rejected.
 */
function isLoopbackRequest(request: IncomingMessage): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Read a small JSON request body. Resolves undefined on any failure (malformed
 * JSON, over-long body, or a stream error). */
function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Kill the stream instead of buffering an unbounded body.
        request.destroy()
        resolve(undefined)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (size > MAX_BODY_BYTES) return // already resolved via destroy path
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        resolve(typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined)
      } catch {
        resolve(undefined)
      }
    })
    request.on('error', () => { resolve(undefined) })
  })
}

/** A toast-route JSON body: the browser half sets `ok`, a short machine-readable
 * `error` code on failure, and the accepted `title`/`body` echo back on success. */
interface JsonBody {
  ok: boolean
  error?: string
  title?: string
  body?: string
  name?: string
  current?: string
  latest?: string
  updateAvailable?: boolean
  jobId?: string
  job?: unknown
}

function writeJson(response: ServerResponse, status: number, body: JsonBody): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function applyImpl(ctx: Context, config: SessionBuddyConfig = {}): void {
  // The settings surface edits the switches through the 'session-buddy'
  // namespace. The composition 'base' starts as the config values, so an
  // empty user layer resolves to exactly what the plugin already does.
  const base: SessionBuddySettingsSection = {
    enabled: config.enabled ?? true,
    notifyReply: config.notifyReply ?? true,
    notifyAsk: config.notifyAsk ?? true,
    notifyConfirm: config.notifyConfirm ?? true,
    sound: config.sound ?? false,
    outlineWidth: config.outlineWidth ?? 18,
    showTimestamps: config.showTimestamps ?? true,
  }

  installSettingsSection(
    ctx,
    settingsNamespace(SESSION_BUDDY_NAMESPACE),
    makeSessionBuddySettingsSchema(),
    base,
    {
      setSource: () => {}, // Browser reads through its settings scope; nothing host-side to update.
      onChange: () => {},
    },
  )

  // Native-toast route: the browser half POSTs {title, body} here when a
  // notification fires while the tab is hidden; the host then pops a real OS
  // toast (PowerShell WinRT / notify-send) with no browser permission needed.
  //
  // Registration is fully defensive: `webServer` may not be ready at apply
  // time in every composition, and a throw here would fail the whole boot. If
  // the service is missing the route is simply skipped (notifications then
  // degrade to the in-page marker only) — never crash the plugin.
  const toastRoute: WebRoute = {
    kind: 'exact',
    path: TOAST_ROUTE,
    handler: async (request, response) => {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' })
        return
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` })
        return
      }
      const body = await readJsonBody(request)
      if (body === undefined) {
        writeJson(response, 400, { ok: false, error: 'invalid-json-body' })
        return
      }
      const title = typeof body.title === 'string' && body.title !== '' ? body.title : 'dsh-session-buddy'
      const text = typeof body.body === 'string' ? body.body : ''
      fireNativeToast({ title, body: text })
      writeJson(response, 200, { ok: true, title, body: text })
    },
  }

  // GET /api/session-buddy/version — current + latest (when checkable). The
  // registry read is fail-closed: any network/parse failure returns
  // latest:undefined and the card simply shows "current only".
  const versionRoute: WebRoute = {
    kind: 'exact',
    path: `${TOAST_ROUTE}/version`,
    handler: async (request, response) => {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' })
        return
      }
      if (request.method !== 'GET') {
        writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` })
        return
      }
      const manifest = await fetchLatestManifest()
      const latest = typeof manifest?.version === 'string' ? manifest.version : undefined
      writeJson(response, 200, {
        ok: true,
        name: PACKAGE_NAME,
        current: LIB_VERSION,
        latest,
        updateAvailable: latest !== undefined
          ? (compareVersions(latest, LIB_VERSION) ?? 0) > 0
          : false,
      })
    },
  }

  // POST /api/session-buddy/update — start an in-place upgrade to a target
  // version via the official dsh CLI; returns a job id the browser polls.
  const updateRoute: WebRoute = {
    kind: 'exact',
    path: `${TOAST_ROUTE}/update`,
    handler: async (request, response) => {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' })
        return
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` })
        return
      }
      const body = await readJsonBody(request)
      const version = typeof body?.version === 'string' ? body.version : undefined
      if (version === undefined || parseVersion(version) === undefined) {
        writeJson(response, 400, { ok: false, error: 'invalid-version' })
        return
      }
      const started = startUpgrade(version)
      if (started.error !== undefined) {
        writeJson(response, 400, { ok: false, error: started.error })
        return
      }
      writeJson(response, 200, { ok: true, jobId: started.jobId })
    },
  }

  // GET /api/session-buddy/update/status — poll an in-flight upgrade job.
  const statusRoute: WebRoute = {
    kind: 'exact',
    path: `${TOAST_ROUTE}/update/status`,
    handler: async (request, response) => {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' })
        return
      }
      if (request.method !== 'GET') {
        writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` })
        return
      }
      const url = new URL(request.url ?? '', 'http://localhost')
      const id = url.searchParams.get('id')
      const job = id !== null ? upgradeJobs.get(id) : undefined
      if (job === undefined) {
        writeJson(response, 404, { ok: false, error: 'job-not-found' })
        return
      }
      writeJson(response, 200, { ok: true, job })
    },
  }

  ctx.effect(() => {
    // Register the routes once the `webServer` service is available. The apply
    // order of host plugins is not guaranteed (webServer may still be starting
    // when this plugin applies), so poll briefly instead of assuming; a throw
    // here must never fail the boot — if the service never appears the routes are
    // simply skipped (notifications degrade to the in-page marker only).
    const routes = [toastRoute, versionRoute, updateRoute, statusRoute]
    const tryRegister = (): boolean => {
      try {
        const server = (ctx as unknown as { webServer?: { register(route: WebRoute): () => void } }).webServer
        if (server === undefined || typeof server.register !== 'function') return false
        for (const route of routes) server.register(route)
        return true
      } catch {
        return false
      }
    }
    if (tryRegister()) return () => {}
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (tryRegister() || tries >= 120) clearInterval(timer)
    }, 500)
    return () => { clearInterval(timer) }
  }, 'session-buddy: toast + upgrade routes')
}
