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
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
/** The on-disk suffix of the JSONL artifact (zstd-compressed by default). */
const LOG_SUFFIX_ZSTD = '.jsonl.zstd';
const LOG_SUFFIX_PLAIN = '.jsonl';
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); // zstd frame magic
/** Decode every complete zstd frame of a session artifact into JSON rows. */
export function decodeSessionRows(buf) {
    const positions = [];
    for (let i = 0; i + 4 <= buf.length; i++) {
        if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd)
            positions.push(i);
    }
    const rows = [];
    for (let i = 0; i < positions.length; i++) {
        const start = positions[i];
        const end = i + 1 < positions.length ? positions[i + 1] : buf.length;
        let dec;
        try {
            dec = zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
        }
        catch {
            return { rows, decodeError: 'zstd-frame' };
        }
        for (const line of dec.split('\n')) {
            if (line.trim() === '')
                continue;
            try {
                rows.push(JSON.parse(line));
            }
            catch {
                return { rows, decodeError: 'json-line' };
            }
        }
    }
    return { rows, decodeError: null };
}
/** Replicate dsh-session's load-time message validation over stored rows. */
export function detectCorruption(rows) {
    const messageTypes = new Set(['user/message', 'assistant/message', 'tool/result']);
    for (const raw of rows) {
        const event = raw;
        if (event.type === 'session')
            continue;
        // Only message events are validated at the load/seed boundary; packed and
        // auxiliary storage rows (reasoning-chunks, tool-call-chunks,
        // assistant/chunk, request/header, permission/*, session/title, …) are not.
        if (!messageTypes.has(event.type ?? ''))
            continue;
        if (typeof event.type !== 'string' || typeof event.seq !== 'number' || !Number.isSafeInteger(event.seq)
            || event.seq < 0 || typeof event.time !== 'number' || event.data === undefined)
            return { corrupt: true, reason: `envelope at seq ${event.seq}` };
        const record = event.data;
        const message = (event.type === 'user/message' ? record : record?.message);
        if (typeof message !== 'object' || message === null || typeof message.id !== 'string' || message.id === '') {
            return { corrupt: true, reason: `no id at seq ${event.seq}` };
        }
        const expectedRole = event.type === 'assistant/message' ? 'assistant' : 'user';
        if (message.role !== expectedRole)
            return { corrupt: true, reason: `role at seq ${event.seq}` };
        const source = message.source;
        if (typeof source !== 'object' || source === null || typeof source.kind !== 'string' || source.kind === '') {
            return { corrupt: true, reason: `source at seq ${event.seq}` };
        }
        if (!Array.isArray(message.content))
            return { corrupt: true, reason: `content at seq ${event.seq}` };
        if (event.type === 'assistant/message') {
            if (source.kind !== 'model' || !(typeof source.provider === 'string' && source.provider.length > 0) || !(typeof source.model === 'string' && source.model.length > 0)) {
                return { corrupt: true, reason: `model source at seq ${event.seq}` };
            }
            continue;
        }
        if (event.type !== 'tool/result')
            continue;
        if (source.kind !== 'tool' || typeof source.callId !== 'string' || source.callId === '') {
            return { corrupt: true, reason: `tool source (empty callId) at seq ${event.seq}` };
        }
        const content = message.content;
        const block = content[0];
        if (content.length !== 1 || typeof block !== 'object' || block === null || block.type !== 'tool-result' || !Array.isArray(block.content)) {
            return { corrupt: true, reason: `tool-result block at seq ${event.seq}` };
        }
        if (block.toolCallId !== source.callId)
            return { corrupt: true, reason: `mismatched tool call ids at seq ${event.seq}` };
    }
    return { corrupt: false };
}
/** Detect corruption from the raw artifact bytes (decode + validate). */
export function detectCorruptionInLog(buf) {
    const { rows, decodeError } = decodeSessionRows(buf);
    if (decodeError !== null)
        return { corrupt: true, reason: `decode:${decodeError}` };
    return detectCorruption(rows);
}
/** Size of a file, or 0 when unreadable. */
function fileSize(path) {
    try {
        return statSync(path).size;
    }
    catch {
        return 0;
    }
}
/** The session's artifact directory + total size, or undefined when absent. */
function sessionDirInfo(persistence, header) {
    const located = persistence.locate(header);
    if (located === undefined || located.kind !== 'jsonl')
        return undefined;
    const log = located.path;
    const dir = dirname(log);
    if (log === dir)
        return undefined; // malformed locate
    const base = log.endsWith(LOG_SUFFIX_ZSTD) ? LOG_SUFFIX_ZSTD : LOG_SUFFIX_PLAIN;
    if (!log.endsWith(base))
        return undefined;
    return { dir, log, size: fileSize(log) };
}
/**
 * List materialized sessions with a corruption flag. Live sessions are listed
 * but never marked corrupt (their log is being written; not deletable anyway).
 */
export async function listSessions(ctx) {
    const persistence = ctx.get?.('sessionPersistence');
    if (persistence === undefined || typeof persistence.list !== 'function')
        return [];
    const headers = await persistence.list();
    const liveIds = liveSessionIds(ctx);
    const entries = [];
    for (const header of headers) {
        const id = header.id;
        if (typeof id !== 'string' || id === '')
            continue;
        const info = typeof persistence.locate === 'function' ? sessionDirInfo(persistence, header) : undefined;
        const size = info?.size ?? 0;
        if (liveIds.has(id)) {
            entries.push({ id, cwd: header.cwd, corrupt: false, size });
            continue;
        }
        if (info === undefined) {
            // No per-session artifact (other backend or not materialized): not corrupt.
            entries.push({ id, cwd: header.cwd, corrupt: false, size: 0 });
            continue;
        }
        const detected = detectCorruptionInLog(readFileSync(info.log));
        entries.push({ id, cwd: header.cwd, corrupt: detected.corrupt, corruptReason: detected.reason, size });
    }
    return entries;
}
/** Ids of sessions currently open in this process (never deletable). */
function liveSessionIds(ctx) {
    const store = ctx.get?.('sessions');
    const out = new Set();
    // Call as a method (not detached) so `this` stays bound to the store.
    if (store === undefined || typeof store.list !== 'function')
        return out;
    for (const s of store.list()) {
        const header = s?.header;
        if (typeof header?.id === 'string')
            out.add(header.id);
    }
    return out;
}
/** Recursively count files + total bytes under a directory. */
function dirStats(dir) {
    let files = 0;
    let bytes = 0;
    const walk = (d) => {
        let names = [];
        try {
            names = readdirSync(d);
        }
        catch {
            return;
        }
        for (const name of names) {
            const p = join(d, name);
            let isDir = false;
            try {
                isDir = statSync(p).isDirectory();
            }
            catch {
                continue;
            }
            if (isDir)
                walk(p);
            else {
                files += 1;
                bytes += fileSize(p);
            }
        }
    };
    walk(dir);
    return { files, bytes };
}
/**
 * Delete one session's on-disk data (the session directory). Refuses when the
 * session is unknown or currently live. The path comes from the persistence
 * service's own `locate()`, never from caller input.
 */
export async function deleteSession(ctx, sessionId) {
    const persistence = ctx.get?.('sessionPersistence');
    if (persistence === undefined || typeof persistence.list !== 'function' || typeof persistence.locate !== 'function') {
        return { ok: false, id: sessionId, error: 'session-persistence-unavailable' };
    }
    const headers = await persistence.list();
    const header = headers.find((h) => h.id === sessionId);
    if (header === undefined)
        return { ok: false, id: sessionId, error: 'session-not-found' };
    if (liveSessionIds(ctx).has(sessionId))
        return { ok: false, id: sessionId, error: 'session-live' };
    const info = sessionDirInfo(persistence, header);
    if (info === undefined)
        return { ok: false, id: sessionId, error: 'no-artifact' };
    // Refuse to remove a directory that does not own a session log (sanity).
    if (!info.log.startsWith(info.dir + '\\') && !info.log.startsWith(info.dir + '/')) {
        return { ok: false, id: sessionId, error: 'artifact-outside-dir' };
    }
    try {
        const { files, bytes } = dirStats(info.dir);
        rmSync(info.dir, { recursive: true, force: true });
        return { ok: true, id: sessionId, path: info.dir, files, bytes };
    }
    catch (e) {
        return { ok: false, id: sessionId, error: e instanceof Error ? e.message : String(e) };
    }
}
