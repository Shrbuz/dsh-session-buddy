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
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from 'schemastery';
import { mountOnce } from "./mount-once.js";
import { fireNativeToast } from "./host/toast.js";
import { BuddySseHub, createEventMonitor } from "./host/events.js";
import { tryClaimNotification } from "./host/ledger.js";
import { deleteSession, listSessions } from "./host/session-delete.js";
import { LIB_VERSION, compareVersions, fetchLatestManifest, parseVersion, startUpgrade, upgradeJobs, PACKAGE_NAME, } from "./host/upgrade.js";
// Re-export the upgrade module's pure helpers so standalone tests
// (scripts/smoke-host.mjs) can exercise version parsing/comparison without a
// live web runtime. These are additive, non-breaking public symbols.
export { LIB_VERSION, PACKAGE_NAME, parseVersion, compareVersions, unsafeSpecReason, findDshBinary, resolveLaunch, runDshCli } from "./host/upgrade.js";
// Re-export the event-driven trigger monitor + the notified-ledger claim so
// standalone tests can drive them without a live web runtime.
export { BuddySseHub, BuddyMonitor, assistantSummary, ASK_TOOL_NAME } from "./host/events.js";
export { tryClaimNotification, LEDGER_FILE, LEDGER_DIR } from "./host/ledger.js";
export { decodeSessionRows, detectCorruption, detectCorruptionInLog } from "./host/session-delete.js";
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'session-buddy';
/**
 * Declared service dependency: the loader defers this plugin's apply until the
 * `webServer` service is available, so the native-toast route can be registered
 * directly at apply time.
 */
export const inject = ['webServer'];
/** Settings namespace of the session-buddy capability. */
export const SESSION_BUDDY_NAMESPACE = 'session-buddy';
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
    });
}
/** Register the session-buddy settings namespace on the context. */
export const apply = mountOnce('dsh-session-buddy', applyImpl);
/** Native-toast trigger route the browser half fetches. Loopback-only. */
export const TOAST_ROUTE = '/api/session-buddy/toast';
/** SSE route that relays event-driven notification triggers to every tab. */
export const EVENTS_ROUTE = '/api/session-buddy/events';
/** Maximum accepted request body. Toasts carry only title+body text, so a
 * small cap (and an early stream destroy) is a cheap DoS hardening. */
const MAX_BODY_BYTES = 8 * 1024;
/** The request's socket address (authoritative; never trust forwarded headers). */
function isLoopbackAddress(address) {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
function isLoopbackHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}
/**
 * Loopback-only + browser same-origin fence for the toast route: the socket
 * address must be loopback, the Host header must name a loopback host, and a
 * cross-site fetch (any other local page or a remote origin) is rejected.
 */
function isLoopbackRequest(request) {
    if (!isLoopbackAddress(request.socket.remoteAddress))
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostname;
    try {
        hostname = new URL(`http://${host}`).hostname;
    }
    catch {
        return false;
    }
    if (!isLoopbackHostname(hostname))
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
/** Read a small JSON request body. Resolves undefined on any failure (malformed
 * JSON, over-long body, or a stream error). */
function readJsonBody(request) {
    return new Promise((resolve) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                // Kill the stream instead of buffering an unbounded body.
                request.destroy();
                resolve(undefined);
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (size > MAX_BODY_BYTES)
                return; // already resolved via destroy path
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                resolve(typeof parsed === 'object' && parsed !== null ? parsed : undefined);
            }
            catch {
                resolve(undefined);
            }
        });
        request.on('error', () => { resolve(undefined); });
    });
}
function writeJson(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}
function applyImpl(ctx, config = {}) {
    // The settings surface edits the switches through the 'session-buddy'
    // namespace. The composition 'base' starts as the config values, so an
    // empty user layer resolves to exactly what the plugin already does.
    const base = {
        enabled: config.enabled ?? true,
        notifyReply: config.notifyReply ?? true,
        notifyAsk: config.notifyAsk ?? true,
        notifyConfirm: config.notifyConfirm ?? true,
        sound: config.sound ?? false,
        outlineWidth: config.outlineWidth ?? 18,
        showTimestamps: config.showTimestamps ?? true,
    };
    installSettingsSection(ctx, settingsNamespace(SESSION_BUDDY_NAMESPACE), makeSessionBuddySettingsSchema(), base, {
        setSource: () => { }, // Browser reads through its settings scope; nothing host-side to update.
        onChange: () => { },
    });
    // Event-driven notification triggers: the host watches the session event log
    // and relays reply/ask/confirm over SSE (EVENTS_ROUTE) so EVERY open tab can
    // notify authoritatively — no more relying on one tab's DOM observation. The
    // browser decides when to actually notify; cross-tab dedup lives in the
    // toast-route claim ledger below.
    const hub = new BuddySseHub();
    const stopMonitor = createEventMonitor(ctx, hub);
    ctx.effect(() => () => {
        try {
            stopMonitor();
        }
        catch { /* teardown must not throw */ }
        hub.dispose();
    }, 'session-buddy: event monitor + sse hub');
    // Native-toast route: the browser half POSTs {title, body} here when a
    // notification fires while the tab is hidden; the host then pops a real OS
    // toast (PowerShell WinRT / notify-send) with no browser permission needed.
    //
    // Registration is fully defensive: `webServer` may not be ready at apply
    // time in every composition, and a throw here would fail the whole boot. If
    // the service is missing the route is simply skipped (notifications then
    // degrade to the in-page marker only) — never crash the plugin.
    const toastRoute = {
        kind: 'exact',
        path: TOAST_ROUTE,
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'POST') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            const body = await readJsonBody(request);
            if (body === undefined) {
                writeJson(response, 400, { ok: false, error: 'invalid-json-body' });
                return;
            }
            const title = typeof body.title === 'string' && body.title !== '' ? body.title : 'dsh-session-buddy';
            const text = typeof body.body === 'string' ? body.body : '';
            // Cross-tab / cross-reload dedup: the browser sends a stable claim key
            // (session + turn/episode + kind). The first tab to claim this episode
            // fires the OS toast; any other tab gets 409 and stays silent — so a
            // single reply never pops N toasts with several tabs open, and a reload
            // can't re-fire an already-notified event. Missing/empty key = no dedup.
            const claimKey = typeof body.claimKey === 'string' ? body.claimKey : '';
            if (claimKey !== '' && !tryClaimNotification(claimKey)) {
                writeJson(response, 409, { ok: false, error: 'already-notified', claimed: true });
                return;
            }
            fireNativeToast({ title, body: text });
            writeJson(response, 200, { ok: true, title, body: text, claimed: true });
        },
    };
    // SSE: event-driven notification triggers (reply/ask/confirm) relayed to
    // every open tab. Loopback-only like the toast route; the browser subscribes
    // and decides when to notify (hidden gate + per-kind switches + claim).
    const eventsRoute = {
        kind: 'exact',
        path: EVENTS_ROUTE,
        handler: (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'GET') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            hub.handle(request, response);
        },
    };
    // GET /api/session-buddy/sessions — session health listing: id + corrupt
    // flag (replicating dsh's own load validation) so the browser can mark
    // "cannot load history — deletable" sessions. Loopback-only.
    const sessionsRoute = {
        kind: 'exact',
        path: '/api/session-buddy/sessions',
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'GET') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            try {
                const sessions = await listSessions(ctx);
                writeJson(response, 200, { ok: true, sessions });
            }
            catch (e) {
                writeJson(response, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
            }
        },
    };
    // POST /api/session-buddy/sessions/delete — permanently delete one session's
    // on-disk data (frees disk space). Loopback-only; refuses live sessions and
    // unknown ids. Destructive — the browser shows a confirmation first.
    const sessionsDeleteRoute = {
        kind: 'exact',
        path: '/api/session-buddy/sessions/delete',
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'POST') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            const body = await readJsonBody(request);
            const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
            if (sessionId === '' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
                writeJson(response, 400, { ok: false, error: 'invalid-session-id' });
                return;
            }
            try {
                const result = await deleteSession(ctx, sessionId);
                if (!result.ok) {
                    writeJson(response, result.error === 'session-live' ? 409 : 404, { ok: false, error: result.error });
                    return;
                }
                writeJson(response, 200, { ok: true, id: result.id, path: result.path, files: result.files, bytes: result.bytes });
            }
            catch (e) {
                writeJson(response, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
            }
        },
    };
    // GET /api/session-buddy/version — current + latest (when checkable). The
    // registry read is fail-closed: any network/parse failure returns
    // latest:undefined and the card simply shows "current only".
    const versionRoute = {
        kind: 'exact',
        path: `${TOAST_ROUTE}/version`,
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'GET') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            const manifest = await fetchLatestManifest();
            const latest = typeof manifest?.version === 'string' ? manifest.version : undefined;
            writeJson(response, 200, {
                ok: true,
                name: PACKAGE_NAME,
                current: LIB_VERSION,
                latest,
                updateAvailable: latest !== undefined
                    ? (compareVersions(latest, LIB_VERSION) ?? 0) > 0
                    : false,
            });
        },
    };
    // POST /api/session-buddy/update — start an in-place upgrade to a target
    // version via the official dsh CLI; returns a job id the browser polls.
    const updateRoute = {
        kind: 'exact',
        path: `${TOAST_ROUTE}/update`,
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'POST') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            const body = await readJsonBody(request);
            const version = typeof body?.version === 'string' ? body.version : undefined;
            if (version === undefined || parseVersion(version) === undefined) {
                writeJson(response, 400, { ok: false, error: 'invalid-version' });
                return;
            }
            const started = startUpgrade(version);
            if (started.error !== undefined) {
                writeJson(response, 400, { ok: false, error: started.error });
                return;
            }
            writeJson(response, 200, { ok: true, jobId: started.jobId });
        },
    };
    // GET /api/session-buddy/update/status — poll an in-flight upgrade job.
    const statusRoute = {
        kind: 'exact',
        path: `${TOAST_ROUTE}/update/status`,
        handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
                writeJson(response, 403, { ok: false, error: 'forbidden-loopback-only' });
                return;
            }
            if (request.method !== 'GET') {
                writeJson(response, 405, { ok: false, error: `method-not-allowed:${request.method}` });
                return;
            }
            const url = new URL(request.url ?? '', 'http://localhost');
            const id = url.searchParams.get('id');
            const job = id !== null ? upgradeJobs.get(id) : undefined;
            if (job === undefined) {
                writeJson(response, 404, { ok: false, error: 'job-not-found' });
                return;
            }
            writeJson(response, 200, { ok: true, job });
        },
    };
    ctx.effect(() => {
        // Register the routes once the `webServer` service is available. The apply
        // order of host plugins is not guaranteed (webServer may still be starting
        // when this plugin applies), so poll briefly instead of assuming; a throw
        // here must never fail the boot — if the service never appears the routes are
        // simply skipped (notifications degrade to the in-page marker only).
        const routes = [toastRoute, versionRoute, updateRoute, statusRoute, eventsRoute, sessionsRoute, sessionsDeleteRoute];
        const tryRegister = () => {
            try {
                const server = ctx.webServer;
                if (server === undefined || typeof server.register !== 'function')
                    return false;
                for (const route of routes)
                    server.register(route);
                return true;
            }
            catch {
                return false;
            }
        };
        if (tryRegister())
            return () => { };
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            if (tryRegister() || tries >= 120)
                clearInterval(timer);
        }, 500);
        return () => { clearInterval(timer); };
    }, 'session-buddy: toast + upgrade routes');
}
