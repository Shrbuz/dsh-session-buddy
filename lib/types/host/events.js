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
/** Registered name of the ask-user tool (from @deepseek-ai/dsh-tool-ask-user). */
export const ASK_TOOL_NAME = 'ask_user_question';
/** Longest reply summary we relay (the browser may truncate further). */
const MAX_SUMMARY = 120;
/** Pull the visible text out of an assistant message's content blocks
 *  (skips `reasoning` and `tool-call` blocks), collapsed + truncated. */
export function assistantSummary(message) {
    if (message === undefined || !Array.isArray(message.content))
        return '';
    const parts = [];
    for (const block of message.content) {
        if (block?.type === 'text' && typeof block.text === 'string')
            parts.push(block.text);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY);
}
/**
 * SSE broadcaster: holds the connected browser responses and pushes every
 * trigger to all of them. One connection per tab; each gets every trigger and
 * filters locally (current-session + hidden gate + claim).
 */
export class BuddySseHub {
    clients = new Set();
    /** SSE route handler: answer 200 text/event-stream and hang the connection. */
    handle(_req, res) {
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        });
        res.write(': connected\n\n');
        this.clients.add(res);
        const drop = () => { this.clients.delete(res); };
        res.on('close', drop);
    }
    /** Push one trigger to every connected tab (event: trigger). */
    broadcast(trigger) {
        const data = JSON.stringify(trigger);
        for (const res of this.clients) {
            try {
                res.write(`event: trigger\nid: ${Date.now()}\ndata: ${data}\n\n`);
            }
            catch {
                this.clients.delete(res);
            }
        }
    }
    /** Close every connection (plugin teardown). */
    dispose() {
        for (const res of this.clients) {
            try {
                res.end();
            }
            catch { /* connection already gone */ }
        }
        this.clients.clear();
    }
}
/**
 * The pure-ish event→trigger derivation. Stateful (it tracks the open turn
 * and the latest assistant text per session) but fully unit-testable: feed it
 * `(sessionLike, event)` pairs and it returns the trigger for that event (or
 * null) and, when an emitter is attached, relays it. Defensive against odd
 * event shapes — a malformed event is skipped, never thrown.
 */
export class BuddyMonitor {
    emit;
    /** Per-session open turn: { turn, startedAt } (seeded on turn/start). */
    turns = new Map();
    /** Per-session latest assistant text for the current turn (for the summary). */
    summaries = new Map();
    constructor(emit) {
        this.emit = emit;
    }
    /** Handle one session/event. Returns the derived trigger (or null). */
    ingest(session, event) {
        const sid = session?.id;
        if (typeof sid !== 'string' || sid.length === 0)
            return null;
        if (session?.header?.origin === 'subagent')
            return null;
        const headerCwd = session?.header?.cwd;
        const workspace = typeof headerCwd === 'string' && headerCwd.length > 0 ? headerCwd : undefined;
        const type = event?.type;
        const time = typeof event?.time === 'number' ? event.time : Date.now();
        const data = (event?.data ?? {});
        if (type === 'turn/start') {
            const turn = typeof data.turn === 'number' ? data.turn : -1;
            this.turns.set(sid, { turn, startedAt: time });
            this.summaries.set(sid, '');
            return null;
        }
        if (type === 'assistant/message') {
            const text = assistantSummary(data.message);
            if (text.length > 0)
                this.summaries.set(sid, text);
            return null;
        }
        if (type === 'tool/call') {
            if (data.name === ASK_TOOL_NAME) {
                const turn = typeof data.turn === 'number' ? data.turn : undefined;
                const callId = typeof data.callId === 'string' ? data.callId : undefined;
                return this.trigger({
                    kind: 'ask',
                    sessionId: sid,
                    workspace,
                    turn,
                    turnStartedAt: this.turns.get(sid)?.startedAt,
                    dedupKey: callId ?? `ask:${String(turn ?? '')}`,
                });
            }
            return null;
        }
        if (type === 'approval/asked') {
            const id = typeof data.id === 'string' ? data.id : undefined;
            return this.trigger({
                kind: 'confirm',
                sessionId: sid,
                workspace,
                turn: typeof data.turn === 'number' ? data.turn : this.turns.get(sid)?.turn,
                turnStartedAt: this.turns.get(sid)?.startedAt,
                dedupKey: id ?? `confirm:${String(this.turns.get(sid)?.turn ?? '')}`,
            });
        }
        if (type === 'turn/end') {
            const reason = data.reason?.kind;
            const turn = typeof data.turn === 'number' ? data.turn : undefined;
            const summary = this.summaries.get(sid) ?? '';
            // A completed turn is the authoritative "reply is done" signal.
            const trigger = reason === 'completed'
                ? this.trigger({
                    kind: 'reply',
                    sessionId: sid,
                    workspace,
                    turn,
                    turnStartedAt: this.turns.get(sid)?.startedAt,
                    summary,
                    dedupKey: `turn:${String(turn ?? '')}`,
                })
                : null;
            // The turn is over; clear per-turn state (a later turn re-seeds it).
            this.turns.delete(sid);
            this.summaries.delete(sid);
            return trigger;
        }
        return null;
    }
    /** Derive a trigger, relay it, and return it. */
    trigger(t) {
        try {
            this.emit?.(t);
        }
        catch {
            /* a relay failure must never break the monitor */
        }
        return t;
    }
}
/**
 * Subscribe the monitor to the harness `session/event` firehose. Returns a
 * disposer that detaches the listener (called on plugin teardown / hot reload).
 *
 * The `session/event` channel is a harness extension of the cordis event map
 * (declared by `@deepseek-ai/dsh-session`), so the listener is typed locally
 * and the channel name is passed through the untyped overload.
 */
export function createEventMonitor(ctx, hub) {
    const monitor = new BuddyMonitor((trigger) => hub.broadcast(trigger));
    const off = ctx.on('session/event', (session, event) => {
        try {
            monitor.ingest(session, event);
        }
        catch {
            /* observer containment: a bad event must never break the harness */
        }
    });
    return typeof off === 'function' ? off : () => { };
}
