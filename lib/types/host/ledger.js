/**
 * dsh-session-buddy host half — the "already notified" ledger.
 *
 * A tiny per-machine JSON store (`~/.dsh-session-buddy/notified.json`) that
 * records which notification episodes have already been surfaced, keyed by a
 * stable claim key (session + turn/episode + kind). The browser passes the
 * claim key with the native-toast request; the host claims it atomically so
 * that with several tabs open only ONE tab pops the OS toast for a given
 * event (cross-tab dedup), and a page reload can never re-fire an event that
 * was already notified.
 *
 * The claim is a single synchronous read-modify-write (no `await` in between),
 * which is atomic under Node's single-threaded event loop — concurrent toast
 * POSTs from different tabs are serialized at this point.
 *
 * Fail-open by design: a missing/corrupt ledger means "nothing claimed yet"
 * (the toast may fire); an unwritable ledger also allows the toast (storage
 * trouble must never silently suppress notifications — worst case a duplicate).
 *
 * @module dsh-session-buddy/host/ledger
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Default ledger location (per user, machine-local). */
export const LEDGER_DIR = join(homedir(), '.dsh-session-buddy');
export const LEDGER_FILE = join(LEDGER_DIR, 'notified.json');
/** Entries older than this are pruned on the next claim (keeps the file tiny). */
const TTL_MS = 30 * 24 * 3600_000;
/** Hard cap: newest N entries are kept after a prune. */
const MAX_ENTRIES = 5000;
/** Read the current claim table; corrupt/missing file → empty map. */
function readClaims(file) {
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return new Map();
        const out = new Map();
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && Number.isFinite(value))
                out.set(key, value);
        }
        return out;
    }
    catch {
        return new Map();
    }
}
/**
 * Atomically claim one notification episode. Returns true when the caller
 * should fire the notification (either it is the first to claim, or the
 * ledger is unusable and we fail open); false when another tab already
 * notified this episode.
 */
export function tryClaimNotification(claimKey, file = LEDGER_FILE) {
    if (claimKey === '')
        return true; // no dedup requested → always allow
    const claims = readClaims(file);
    if (claims.has(claimKey))
        return false;
    const now = Date.now();
    claims.set(claimKey, now);
    // Prune: drop stale entries, then keep the newest MAX_ENTRIES.
    let pruned = [];
    for (const [key, ts] of claims) {
        if (now - ts <= TTL_MS)
            pruned.push([key, ts]);
    }
    if (pruned.length > MAX_ENTRIES) {
        pruned.sort((a, b) => b[1] - a[1]);
        pruned = pruned.slice(0, MAX_ENTRIES);
    }
    try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(Object.fromEntries(pruned), null, 0), 'utf8');
        return true;
    }
    catch {
        // Ledger unwritable → fail open (allow the toast; dedup degrades).
        return true;
    }
}
