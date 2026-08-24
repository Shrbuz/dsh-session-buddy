/**
 * dsh-session-buddy host half — event-driven notification triggers.
 *
 * Listens to the harness's `session/event` firehose (emitted by dsh-session on
 * every accepted append; the event shape is `{ type, seq, time, data }`) and
 * derives the three notification triggers the browser half consumes:
 *   - `reply`:   a turn ended with `reason.kind === 'completed'` (`turn/end`)
 *   - `ask`:     the model called the ask-user tool
 *                (`tool/call` with `name === 'ask_user_question'`)
 *   - `confirm`: an approval request was raised (`approval/asked`, appended by
 *                dsh-user-approval through the same session log)
 *
 * Triggers are pushed to every connected browser tab through one SSE long
 * connection (`/api/session-buddy/events`). The browser decides whether/when
 * to notify (hidden-tab gate, per-kind switches, claim dedup); the host only
 * observes and relays. This makes notifications authoritative across tabs
 * instead of each tab re-deriving them from its own DOM.
 *
 * The trigger contract is verified against the installed harness
 * (`@deepseek-ai/dsh-session` `SessionEventMap`): the callback is
 * `ctx.on('session/event', (session, event) => …)` and subagent sessions
 * (`header.origin === 'subagent'`) are skipped — their turns belong to a
 * parent session the user is not directly watching.
 *
 * @module dsh-session-buddy/host/events
 */
import type { Context } from '@deepseek-ai/cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
/** The three notification trigger kinds (mirror the settings switches). */
export type BuddyTriggerKind = 'reply' | 'ask' | 'confirm';
/** One event-driven notification trigger relayed to the browser. */
export interface BuddyTrigger {
    kind: BuddyTriggerKind;
    /** The session that produced the event (id from the session log). */
    sessionId: string;
    /** The session's working directory (workspace), when present. */
    workspace?: string;
    /** The turn this event belongs to (reply/ask). */
    turn?: number;
    /** When that turn started (epoch ms) — the browser uses it to decide
     *  "was the user away during this reply?" via its own visibility history. */
    turnStartedAt?: number;
    /** Short human summary of the finished reply (ask/confirm have none). */
    summary?: string;
    /** Stable per-episode identity the browser uses to dedup: the turn number
     *  for a reply, the ask-user call id, the approval request id. */
    dedupKey: string;
}
/** Registered name of the ask-user tool (from @deepseek-ai/dsh-tool-ask-user). */
export declare const ASK_TOOL_NAME = "ask_user_question";
/** Pull the visible text out of an assistant message's content blocks
 *  (skips `reasoning` and `tool-call` blocks), collapsed + truncated. */
export declare function assistantSummary(message: {
    content?: readonly {
        type?: string;
        text?: string;
    }[];
} | undefined): string;
/**
 * SSE broadcaster: holds the connected browser responses and pushes every
 * trigger to all of them. One connection per tab; each gets every trigger and
 * filters locally (current-session + hidden gate + claim).
 */
export declare class BuddySseHub {
    private readonly clients;
    /** SSE route handler: answer 200 text/event-stream and hang the connection. */
    handle(_req: IncomingMessage, res: ServerResponse): void;
    /** Push one trigger to every connected tab (event: trigger). */
    broadcast(trigger: BuddyTrigger): void;
    /** Close every connection (plugin teardown). */
    dispose(): void;
}
/**
 * The pure-ish event→trigger derivation. Stateful (it tracks the open turn
 * and the latest assistant text per session) but fully unit-testable: feed it
 * `(sessionLike, event)` pairs and it returns the trigger for that event (or
 * null) and, when an emitter is attached, relays it. Defensive against odd
 * event shapes — a malformed event is skipped, never thrown.
 */
export declare class BuddyMonitor {
    private readonly emit?;
    /** Per-session open turn: { turn, startedAt } (seeded on turn/start). */
    private readonly turns;
    /** Per-session latest assistant text for the current turn (for the summary). */
    private readonly summaries;
    constructor(emit?: ((trigger: BuddyTrigger) => void) | undefined);
    /** Handle one session/event. Returns the derived trigger (or null). */
    ingest(session: {
        id?: unknown;
        header?: {
            origin?: unknown;
            cwd?: unknown;
        };
    }, event: {
        type?: string;
        time?: number;
        data?: unknown;
    }): BuddyTrigger | null;
    /** Derive a trigger, relay it, and return it. */
    private trigger;
}
/**
 * Subscribe the monitor to the harness `session/event` firehose. Returns a
 * disposer that detaches the listener (called on plugin teardown / hot reload).
 *
 * The `session/event` channel is a harness extension of the cordis event map
 * (declared by `@deepseek-ai/dsh-session`), so the listener is typed locally
 * and the channel name is passed through the untyped overload.
 */
export declare function createEventMonitor(ctx: Context, hub: BuddySseHub): () => void;
//# sourceMappingURL=events.d.ts.map