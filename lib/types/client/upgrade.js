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
const ROUTE = '/api/session-buddy/toast';
/** Check the current/latest version through the host. Never throws. */
export async function checkVersion() {
    try {
        const response = await fetch(`${ROUTE}/version`, { method: 'GET' });
        if (!response.ok)
            return undefined;
        const body = (await response.json());
        if (typeof body !== 'object' || body === null)
            return undefined;
        return body;
    }
    catch {
        return undefined;
    }
}
/** Start an upgrade to `version`. Returns the job id, or undefined on failure. */
export async function startUpgrade(version) {
    try {
        const response = await fetch(`${ROUTE}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version }),
        });
        if (!response.ok)
            return undefined;
        const body = (await response.json());
        if (body.ok !== true || body.jobId === undefined)
            return undefined;
        return body.jobId;
    }
    catch {
        return undefined;
    }
}
/** Poll one upgrade job until it settles or `timeoutMs` elapses. Never throws. */
export async function pollUpgrade(jobId, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() < deadline) {
            const response = await fetch(`${ROUTE}/update/status?id=${encodeURIComponent(jobId)}`, { method: 'GET' });
            if (response.ok) {
                const body = (await response.json());
                if (body.ok === true && body.job !== undefined) {
                    if (body.job.phase === 'done' || body.job.phase === 'error')
                        return body.job;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }
    catch {
        // Polling is best-effort; fall through.
    }
    return undefined;
}
