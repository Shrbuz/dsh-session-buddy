/**
 * dsh-session-buddy host half — session health & clean deletion.
 *
 * dsh has no "delete a session to free disk" capability: the session row menu
 * only offers fork/archive (archive just hides; files stay), and there is no
 * public API to remove a session's on-disk artifact. This module fills that
 * gap so the browser half can mark corrupt sessions and offer a clean delete.
 *
 * Corrupt-session detection replicates the harness's OWN load-time message
 * validation (dsh-session `assertMessageEventShape` — the exact check that
 * throws `SessionPersistenceCorruptionError` and leaves a session unable to
 * load). The known failure: a `tool/result` persisted with an empty
 * `message.source.callId` (dsh writes it when the model emits a tool call
 * with an empty name, then refuses to read it back). Detection decodes the
 * zstd frame stream and validates only the message events — the same subset
 * the load boundary validates.
 *
 * Deletion resolves the session's artifact path through the persistence
 * service's own `locate()` (never from a caller-supplied path), refuses to
 * delete a live session, and removes the session directory recursively.
 *
 * @module dsh-session-buddy/host/session-delete
 */
import type { Context } from '@deepseek-ai/cordis';
/** One session in the health listing. */
export interface SessionHealthEntry {
    id: string;
    cwd?: string;
    corrupt: boolean;
    /** Why it is corrupt (short diagnostic). */
    corruptReason?: string;
    /** Total bytes of the session's artifact file(s), when readable. */
    size: number;
}
/** The result of a delete. */
export interface SessionDeleteResult {
    ok: boolean;
    id: string;
    path?: string;
    files?: number;
    bytes?: number;
    error?: string;
}
/** Decode every complete zstd frame of a session artifact into JSON rows. */
export declare function decodeSessionRows(buf: Buffer): {
    rows: unknown[];
    decodeError: string | null;
};
/** Replicate dsh-session's load-time message validation over stored rows. */
export declare function detectCorruption(rows: readonly unknown[]): {
    corrupt: boolean;
    reason?: string;
};
/** Detect corruption from the raw artifact bytes (decode + validate). */
export declare function detectCorruptionInLog(buf: Buffer): {
    corrupt: boolean;
    reason?: string;
};
/**
 * List materialized sessions with a corruption flag. Live sessions are listed
 * but never marked corrupt (their log is being written; not deletable anyway).
 */
export declare function listSessions(ctx: Context): Promise<SessionHealthEntry[]>;
/**
 * Delete one session's on-disk data (the session directory). Refuses when the
 * session is unknown or currently live. The path comes from the persistence
 * service's own `locate()`, never from caller input.
 */
export declare function deleteSession(ctx: Context, sessionId: string): Promise<SessionDeleteResult>;
//# sourceMappingURL=session-delete.d.ts.map