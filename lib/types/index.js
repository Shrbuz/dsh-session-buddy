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
/** Read a small JSON request body. Resolves undefined on any failure. */
function readJsonBody(request) {
    return new Promise((resolve) => {
        const chunks = [];
        request.on('data', (chunk) => { chunks.push(chunk); });
        request.on('end', () => {
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
                writeJson(response, 403, { error: 'forbidden: loopback-only' });
                return;
            }
            if (request.method !== 'POST') {
                writeJson(response, 405, { error: `method not allowed: ${request.method}` });
                return;
            }
            const body = await readJsonBody(request);
            if (body === undefined) {
                writeJson(response, 400, { error: 'invalid JSON body' });
                return;
            }
            const title = typeof body.title === 'string' && body.title !== '' ? body.title : 'dsh-session-buddy';
            const text = typeof body.body === 'string' ? body.body : '';
            fireNativeToast({ title, body: text });
            writeJson(response, 200, { ok: true });
        },
    };
    ctx.effect(() => {
        // Register the route once the `webServer` service is available. The apply
        // order of host plugins is not guaranteed (webServer may still be starting
        // when this plugin applies), so poll briefly instead of assuming; a throw
        // here must never fail the boot — if the service never appears the route is
        // simply skipped (notifications degrade to the in-page marker only).
        const tryRegister = () => {
            try {
                const server = ctx.webServer;
                if (server === undefined || typeof server.register !== 'function')
                    return false;
                server.register(toastRoute);
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
    }, 'session-buddy: toast route');
}
