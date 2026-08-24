/**
 * dsh-session-buddy browser half — session health & clean deletion.
 *
 * dsh has no "delete session" action (the session row menu only offers fork /
 * archive; archive hides but keeps files). This module adds:
 *   1. A corrupt-session marker — the host reports which sessions fail the
 *      harness's own load validation (their history can't load), and each such
 *      row gets a small warning badge so you know which one to delete.
 *   2. A "删除会话" item injected into the session row's three-dot menu. The
 *      menu is dsh-internal (not slot-extensible), so the item is injected by
 *      cloning an existing menu item (structure-proof) — when the menu can't
 *      be located the injection degrades silently.
 *   3. A confirmation dialog, then a POST to the host which permanently
 *      deletes the session's on-disk data (frees disk space).
 *
 * @module dsh-session-buddy/client/session-delete
 */
/** Session health as reported by the host. */
export interface SessionHealth {
    id: string;
    cwd?: string;
    corrupt: boolean;
    corruptReason?: string;
    size: number;
}
/** Read a session row's id from its React fiber (key = session id). */
export declare function readSessionIdFromRow(row: HTMLElement): string | null;
/** Fetch the session health listing (id → corrupt). Never throws. */
export declare function fetchSessionHealth(): Promise<Map<string, SessionHealth>>;
/** Ask the host to permanently delete a session. Resolves ok/error. */
export declare function deleteSession(sessionId: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/** Information shown in the delete confirmation. */
export interface DeleteConfirmInfo {
    sessionId: string;
    title?: string;
    size?: number;
}
/** Format a byte count as a short human string (e.g. "28 KB"). */
export declare function formatBytes(bytes: number): string;
/** Options for the session-delete manager. */
export interface SessionDeleteOptions {
    /** Current open session id (delete is hidden for it). */
    currentSessionId?: () => string | undefined;
    /** Called after a successful delete to make the dsh session list drop the
     *  removed session (the host deletes the dir; the list is otherwise only
     *  refreshed on a page reload). */
    refreshSessions?: () => void;
}
/** Start the corrupt-marker + menu-injection manager. Returns a disposer. */
export declare function startSessionDeleteManager(options?: SessionDeleteOptions): () => void;
//# sourceMappingURL=session-delete.d.ts.map