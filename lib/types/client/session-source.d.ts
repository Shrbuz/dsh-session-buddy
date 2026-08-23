/**
 * dsh-session-buddy session data source (approach 2) — reads the ladder
 * rungs from the OFFICIAL `sessions` client service instead of scanning the
 * DOM. This is what makes the outline complete even when dsh only renders the
 * tail window (PAGE_MESSAGES = 50): the conversation snapshot carries every
 * in-window node regardless of DOM presence, and `loadOlder()` pages the
 * history window backwards so clicking a hidden question can load the page
 * that contains it.
 *
 * Data model (verified in @deepseek-ai/dsh-client-runtime):
 * - `ctx.sessions.list.getSnapshot().current` → current session id
 * - `ctx.sessions.scope(id)` → scoped ctx; `ctx.sessions.sessionOf(ctx)` → SessionFace
 * - `SessionFace.getSnapshot()` → ConversationSnapshot
 * - `snapshot.chat.order` → ordered node keys (stable, also DOM anchor keys)
 * - `snapshot.chat.nodes.get(key)` → ChatConversationViewNode { key, kind, anchorSeq }
 * - kind `user` / `steering` = a real user question turn
 * - `SessionFace.loadOlder()` → page the history window backwards (50 msg/page)
 * - `SessionFace.subscribe(fn)` → notify on any window/snapshot change
 *
 * @module dsh-session-buddy/client/session-source
 */
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client';
import type { SessionFace } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { OutlineRung } from './dom.ts';
/** Data-source status surfaced to the UI. */
export interface SessionSourceStatus {
    /** Total user turns currently visible in the collected rungs. */
    count: number;
    /** Whether older history still exists outside the loaded window. */
    hasMore: boolean;
    /** Whether a page-up (loadOlder) is currently in flight. */
    loadingOlder: boolean;
    /** Set when a session is open but its window has not settled yet. */
    pending: boolean;
}
/** One collected rung plus the node facts needed for paging/scroll. */
export interface SourceRung extends OutlineRung {
    /** The node's anchorSeq (for "which page contains it" decisions). */
    seq: number;
}
/** Callbacks the owner wires. */
export interface SessionSourceHandlers {
    /** Fired whenever the collected rungs change (initial, page-up, session switch). */
    onRungs: (rungs: SourceRung[]) => void;
    /** Fired when status changes (hasMore / loadingOlder / pending). */
    onStatus: (status: SessionSourceStatus) => void;
    /** Optional: the current session id (for debugging / tests). */
    onSessionId?: (id: string | undefined) => void;
}
/** Collect rungs from the current conversation snapshot (in-window user turns).
 * The snapshot's `nodes` (raw Session-event projection) carries the user turns
 * (kind 'user' / 'steering') with content + time. DOM anchor keys are NOT on
 * the snapshot nodes — they are aligned later via `alignRungKeys` once the
 * transcript has rendered (see below). Until then each rung keeps a stable
 * seq-based placeholder key. */
export declare function collectRungsFromSnapshot(snapshot: ConversationSnapshot): SourceRung[];
/** Align rung keys with the rendered transcript. The Nth snapshot user turn
 * maps to the Nth DOM user row (same chronological order); a row whose text
 * contains the rung summary is the best-effort fallback for mismatches. Called
 * from render time, when the DOM has caught up with the snapshot. Mutates and
 * returns the given array (key field). */
export declare function alignRungKeys(rungs: SourceRung[]): SourceRung[];
/** Resolve the current session face (or undefined when none is open). */
export declare function currentSessionFace(sessions: ISessions): SessionFace | undefined;
/** The session-source control face. */
export interface SessionSourceControl {
    dispose: () => void;
    loadOlderUntilSeq: (seq: number) => Promise<void>;
    loadOlderOnce: () => Promise<void>;
}
/**
 * Live session data source. Subscribes to the current session's snapshot and
 * emits the in-window rungs on every change. Call once per page lifetime.
 * @returns a disposer and the paging controls.
 */
export declare function createSessionSource(sessions: ISessions, handlers: SessionSourceHandlers): SessionSourceControl;
//# sourceMappingURL=session-source.d.ts.map