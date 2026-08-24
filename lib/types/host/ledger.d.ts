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
/** Default ledger location (per user, machine-local). */
export declare const LEDGER_DIR: string;
export declare const LEDGER_FILE: string;
/**
 * Atomically claim one notification episode. Returns true when the caller
 * should fire the notification (either it is the first to claim, or the
 * ledger is unusable and we fail open); false when another tab already
 * notified this episode.
 */
export declare function tryClaimNotification(claimKey: string, file?: string): boolean;
//# sourceMappingURL=ledger.d.ts.map