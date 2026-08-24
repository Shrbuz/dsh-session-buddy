/**
 * dsh-session-buddy browser half — event-driven notification stream.
 *
 * Subscribes to the host's SSE route (/api/session-buddy/events) which relays
 * reply/ask/confirm triggers derived from the session event log (see
 * src/host/events.ts). With this connected, notifications no longer depend on
 * one tab's DOM observation: every open tab receives the same trigger and the
 * claim ledger (host side) makes sure exactly one pops the OS toast.
 *
 * Also owns the tab-visibility history used to answer "was the user away at
 * any point since this turn started?" for a reply — the host reports the turn
 * start timestamp, and this module knows when the tab was hidden.
 *
 * @module dsh-session-buddy/client/sse
 */
/** A trigger relayed by the host (mirror of src/host/events.ts BuddyTrigger). */
export interface BuddyTriggerEvent {
    kind: 'reply' | 'ask' | 'confirm';
    sessionId: string;
    workspace?: string;
    turn?: number;
    turnStartedAt?: number;
    summary?: string;
    dedupKey: string;
}
/** Options for the event stream. */
export interface BuddyEventStreamOptions {
    /** Fired for every trigger the host relays. */
    onTrigger: (trigger: BuddyTriggerEvent) => void;
    /** Fired on connection state changes (true = SSE connected). */
    onStatus?: (connected: boolean) => void;
}
/**
 * Whether the tab was hidden at any point during [start, now]. Pure + exported
 * for unit tests.
 */
export declare function wasHiddenSince(start: number, now?: number): boolean;
/**
 * Open the SSE stream. EventSource auto-reconnects; `onStatus` reports
 * connection state so the owner can fall back to DOM observation while the
 * stream is down. Returns a disposer that closes the connection.
 */
export declare function startBuddyEventStream(options: BuddyEventStreamOptions): () => void;
//# sourceMappingURL=sse.d.ts.map