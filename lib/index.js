import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
//#region src/mount-once.ts
/**
* Host single-instance guard. A profile may end up with the same plugin
* reachable from two sources (an npm install and a `link:` install side by
* side); without this guard the second instance would re-register the same
* settings namespace and fail the boot. mountOnce makes the second host apply
* a no-op for the lifetime of the first instance.
*
* The registry rides a global symbol so two module instances of the same
* package still share one verdict. `ctx.effect` runs its callback immediately
* and treats the callback's return value as the fiber disposer, so the
* unmarker is returned, not run.
* @module dsh-session-buddy/mount-once
*/
const MOUNTED = Symbol.for("dsh-session-buddy.mounted-plugins");
function mountedSet() {
	const registry = globalThis;
	return registry[MOUNTED] ??= /* @__PURE__ */ new Set();
}
/**
* Wrap a cordis plugin apply so the package runs at most once per process.
* @param packageName - npm package identity shared by every install source.
* @param fn - the original plugin apply.
* @returns an apply of the same shape.
*/
function mountOnce(packageName, fn) {
	return ((...args) => {
		const mounted = mountedSet();
		if (mounted.has(packageName)) return;
		mounted.add(packageName);
		args[0]?.effect?.(() => () => {
			mounted.delete(packageName);
		});
		return fn(...args);
	});
}
//#endregion
//#region src/host/toast.ts
/**
* dsh-session-buddy native toast — fires an OS-level notification from the
* host process, so the browser needs NO notification permission and the banner
* is not subject to Chrome/Web-Notification suppression (the browser's own
* notifications are gated by site permission and get silently dropped on many
* machines; the native toast always pops in the OS notification center).
*
* Channels:
* - Windows  → Windows PowerShell 5.1 + WinRT `Windows.UI.Notifications`
*              (zero dependencies, no AUMID setup; `powershell.exe` is always
*              present under System32).
* - macOS    → `osascript` `display notification`.
* - Linux    → `notify-send`.
*
* Normal delivery is best-effort and detached: a failure never throws into the
* plugin.
*
* @module dsh-session-buddy/host/toast
*/
/** Windows PowerShell 5.1 absolute path (always present on Windows). */
const WINDOWS_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
/**
* Escape a string as a PowerShell single-quoted literal (single quotes are
* doubled; `$` is literal inside single quotes, so no variable expansion).
*/
function psQuote(value) {
	return `'${value.replace(/'/g, "''")}'`;
}
/** Escape a string as an AppleScript string literal. */
function osaQuote(value) {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
/**
* Build the Windows toast script. Uses the canonical zero-setup pattern:
* `CreateToastNotifier` with the built-in, always-registered "Windows
* PowerShell" app id so the banner is guaranteed to display on Win10/11. The
* toast is deliberately SILENT: sound is handled by the browser half's
* rate-limited beep, so a burst never produces staccato OS notification tones.
*/
function buildWinToastScript(title, body) {
	return [
		"$ErrorActionPreference = 'Stop'",
		"$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
		"$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]",
		"$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
		"$texts = $template.GetElementsByTagName('text')",
		`$null = $texts.Item(0).AppendChild($template.CreateTextNode(${psQuote(title)}))`,
		`$null = $texts.Item(1).AppendChild($template.CreateTextNode(${psQuote(body)}))`,
		"$node = $template.CreateElement('audio')",
		"$node.SetAttribute('silent', 'true')",
		"$null = $template.DocumentElement.AppendChild($node)",
		"$toast = New-Object Windows.UI.Notifications.ToastNotification -ArgumentList $template",
		"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows PowerShell').Show($toast)"
	].join("\n");
}
/** Write the script to a fresh temp .ps1 and return its path. */
function writeWinScript(script) {
	const dir = mkdtempSync(join(tmpdir(), "dsb-toast-"));
	const file = join(dir, "toast.ps1");
	writeFileSync(file, `\uFEFF${script}`, "utf8");
	return {
		dir,
		file
	};
}
/** Normal Windows toast — runs via `execFile` fire-and-forget (a detached
* `spawn` of powershell.exe was silently dropped on the target machine, while
* `execFile` reliably showed the banner). Never throws. */
function winToast(title, body) {
	try {
		const { dir, file } = writeWinScript(buildWinToastScript(title, body));
		execFile(WINDOWS_POWERSHELL, [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-WindowStyle",
			"Hidden",
			"-File",
			file
		], {
			timeout: 15e3,
			windowsHide: true
		}, () => {
			try {
				rmSync(dir, {
					recursive: true,
					force: true
				});
			} catch {}
		});
	} catch {}
}
/** macOS notification via osascript (best-effort). */
function macToast(title, body) {
	const command = `display notification ${osaQuote(body)} with title ${osaQuote(title)}`;
	execFile("osascript", ["-e", command], () => {});
}
/** Linux notification via notify-send (best-effort). */
function linuxToast(title, body) {
	execFile("notify-send", [title, body], () => {});
}
/**
* Fire a native OS toast for the current platform. Returns true when a channel
* was dispatched (the toast itself may still be best-effort).
*/
function fireNativeToast(payload) {
	const title = payload.title === "" ? "dsh-session-buddy" : payload.title;
	const body = payload.body ?? "";
	switch (process.platform) {
		case "win32":
			winToast(title, body);
			return true;
		case "darwin":
			macToast(title, body);
			return true;
		default:
			linuxToast(title, body);
			return true;
	}
}
//#endregion
//#region src/host/events.ts
/** Registered name of the ask-user tool (from @deepseek-ai/dsh-tool-ask-user). */
const ASK_TOOL_NAME = "ask_user_question";
/** Longest reply summary we relay (the browser may truncate further). */
const MAX_SUMMARY = 120;
/** Pull the visible text out of an assistant message's content blocks
*  (skips `reasoning` and `tool-call` blocks), collapsed + truncated. */
function assistantSummary(message) {
	if (message === void 0 || !Array.isArray(message.content)) return "";
	const parts = [];
	for (const block of message.content) if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
	return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY);
}
/**
* SSE broadcaster: holds the connected browser responses and pushes every
* trigger to all of them. One connection per tab; each gets every trigger and
* filters locally (current-session + hidden gate + claim).
*/
var BuddySseHub = class {
	clients = /* @__PURE__ */ new Set();
	/** SSE route handler: answer 200 text/event-stream and hang the connection. */
	handle(_req, res) {
		res.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
			"x-accel-buffering": "no"
		});
		res.write(": connected\n\n");
		this.clients.add(res);
		const drop = () => {
			this.clients.delete(res);
		};
		res.on("close", drop);
	}
	/** Push one trigger to every connected tab (event: trigger). */
	broadcast(trigger) {
		const data = JSON.stringify(trigger);
		for (const res of this.clients) try {
			res.write(`event: trigger\nid: ${Date.now()}\ndata: ${data}\n\n`);
		} catch {
			this.clients.delete(res);
		}
	}
	/** Close every connection (plugin teardown). */
	dispose() {
		for (const res of this.clients) try {
			res.end();
		} catch {}
		this.clients.clear();
	}
};
/**
* The pure-ish event→trigger derivation. Stateful (it tracks the open turn
* and the latest assistant text per session) but fully unit-testable: feed it
* `(sessionLike, event)` pairs and it returns the trigger for that event (or
* null) and, when an emitter is attached, relays it. Defensive against odd
* event shapes — a malformed event is skipped, never thrown.
*/
var BuddyMonitor = class {
	emit;
	/** Per-session open turn: { turn, startedAt } (seeded on turn/start). */
	turns = /* @__PURE__ */ new Map();
	/** Per-session latest assistant text for the current turn (for the summary). */
	summaries = /* @__PURE__ */ new Map();
	constructor(emit) {
		this.emit = emit;
	}
	/** Handle one session/event. Returns the derived trigger (or null). */
	ingest(session, event) {
		const sid = session?.id;
		if (typeof sid !== "string" || sid.length === 0) return null;
		if (session?.header?.origin === "subagent") return null;
		const headerCwd = session?.header?.cwd;
		const workspace = typeof headerCwd === "string" && headerCwd.length > 0 ? headerCwd : void 0;
		const type = event?.type;
		const time = typeof event?.time === "number" ? event.time : Date.now();
		const data = event?.data ?? {};
		if (type === "turn/start") {
			const turn = typeof data.turn === "number" ? data.turn : -1;
			this.turns.set(sid, {
				turn,
				startedAt: time
			});
			this.summaries.set(sid, "");
			return null;
		}
		if (type === "assistant/message") {
			const text = assistantSummary(data.message);
			if (text.length > 0) this.summaries.set(sid, text);
			return null;
		}
		if (type === "tool/call") {
			if (data.name === "ask_user_question") {
				const turn = typeof data.turn === "number" ? data.turn : void 0;
				const callId = typeof data.callId === "string" ? data.callId : void 0;
				return this.trigger({
					kind: "ask",
					sessionId: sid,
					workspace,
					turn,
					turnStartedAt: this.turns.get(sid)?.startedAt,
					dedupKey: callId ?? `ask:${String(turn ?? "")}`
				});
			}
			return null;
		}
		if (type === "approval/asked") {
			const id = typeof data.id === "string" ? data.id : void 0;
			return this.trigger({
				kind: "confirm",
				sessionId: sid,
				workspace,
				turn: typeof data.turn === "number" ? data.turn : this.turns.get(sid)?.turn,
				turnStartedAt: this.turns.get(sid)?.startedAt,
				dedupKey: id ?? `confirm:${String(this.turns.get(sid)?.turn ?? "")}`
			});
		}
		if (type === "turn/end") {
			const reason = data.reason?.kind;
			const turn = typeof data.turn === "number" ? data.turn : void 0;
			const summary = this.summaries.get(sid) ?? "";
			const trigger = reason === "completed" ? this.trigger({
				kind: "reply",
				sessionId: sid,
				workspace,
				turn,
				turnStartedAt: this.turns.get(sid)?.startedAt,
				summary,
				dedupKey: `turn:${String(turn ?? "")}`
			}) : null;
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
		} catch {}
		return t;
	}
};
/**
* Subscribe the monitor to the harness `session/event` firehose. Returns a
* disposer that detaches the listener (called on plugin teardown / hot reload).
*
* The `session/event` channel is a harness extension of the cordis event map
* (declared by `@deepseek-ai/dsh-session`), so the listener is typed locally
* and the channel name is passed through the untyped overload.
*/
function createEventMonitor(ctx, hub) {
	const monitor = new BuddyMonitor((trigger) => hub.broadcast(trigger));
	const off = ctx.on("session/event", (session, event) => {
		try {
			monitor.ingest(session, event);
		} catch {}
	});
	return typeof off === "function" ? off : () => {};
}
//#endregion
//#region src/host/ledger.ts
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
const LEDGER_DIR = join(homedir(), ".dsh-session-buddy");
const LEDGER_FILE = join(LEDGER_DIR, "notified.json");
/** Entries older than this are pruned on the next claim (keeps the file tiny). */
const TTL_MS = 2592e6;
/** Hard cap: newest N entries are kept after a prune. */
const MAX_ENTRIES = 5e3;
/** Read the current claim table; corrupt/missing file → empty map. */
function readClaims(file) {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return /* @__PURE__ */ new Map();
		const out = /* @__PURE__ */ new Map();
		for (const [key, value] of Object.entries(parsed)) if (typeof value === "number" && Number.isFinite(value)) out.set(key, value);
		return out;
	} catch {
		return /* @__PURE__ */ new Map();
	}
}
/**
* Atomically claim one notification episode. Returns true when the caller
* should fire the notification (either it is the first to claim, or the
* ledger is unusable and we fail open); false when another tab already
* notified this episode.
*/
function tryClaimNotification(claimKey, file = LEDGER_FILE) {
	if (claimKey === "") return true;
	const claims = readClaims(file);
	if (claims.has(claimKey)) return false;
	const now = Date.now();
	claims.set(claimKey, now);
	let pruned = [];
	for (const [key, ts] of claims) if (now - ts <= TTL_MS) pruned.push([key, ts]);
	if (pruned.length > MAX_ENTRIES) {
		pruned.sort((a, b) => b[1] - a[1]);
		pruned = pruned.slice(0, MAX_ENTRIES);
	}
	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify(Object.fromEntries(pruned), null, 0), "utf8");
		return true;
	} catch {
		return true;
	}
}
//#endregion
//#region src/host/session-delete.ts
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
/** The on-disk suffix of the JSONL artifact (zstd-compressed by default). */
const LOG_SUFFIX_ZSTD = ".jsonl.zstd";
const LOG_SUFFIX_PLAIN = ".jsonl";
Buffer.from([
	40,
	181,
	47,
	253
]);
/** Decode every complete zstd frame of a session artifact into JSON rows. */
function decodeSessionRows(buf) {
	const positions = [];
	for (let i = 0; i + 4 <= buf.length; i++) if (buf[i] === 40 && buf[i + 1] === 181 && buf[i + 2] === 47 && buf[i + 3] === 253) positions.push(i);
	const rows = [];
	for (let i = 0; i < positions.length; i++) {
		const start = positions[i];
		const end = i + 1 < positions.length ? positions[i + 1] : buf.length;
		let dec;
		try {
			dec = zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
		} catch {
			return {
				rows,
				decodeError: "zstd-frame"
			};
		}
		for (const line of dec.split("\n")) {
			if (line.trim() === "") continue;
			try {
				rows.push(JSON.parse(line));
			} catch {
				return {
					rows,
					decodeError: "json-line"
				};
			}
		}
	}
	return {
		rows,
		decodeError: null
	};
}
/** Replicate dsh-session's load-time message validation over stored rows. */
function detectCorruption(rows) {
	const messageTypes = /* @__PURE__ */ new Set([
		"user/message",
		"assistant/message",
		"tool/result"
	]);
	for (const raw of rows) {
		const event = raw;
		if (event.type === "session") continue;
		if (!messageTypes.has(event.type ?? "")) continue;
		if (typeof event.type !== "string" || typeof event.seq !== "number" || !Number.isSafeInteger(event.seq) || event.seq < 0 || typeof event.time !== "number" || event.data === void 0) return {
			corrupt: true,
			reason: `envelope at seq ${event.seq}`
		};
		const record = event.data;
		const message = event.type === "user/message" ? record : record?.message;
		if (typeof message !== "object" || message === null || typeof message.id !== "string" || message.id === "") return {
			corrupt: true,
			reason: `no id at seq ${event.seq}`
		};
		const expectedRole = event.type === "assistant/message" ? "assistant" : "user";
		if (message.role !== expectedRole) return {
			corrupt: true,
			reason: `role at seq ${event.seq}`
		};
		const source = message.source;
		if (typeof source !== "object" || source === null || typeof source.kind !== "string" || source.kind === "") return {
			corrupt: true,
			reason: `source at seq ${event.seq}`
		};
		if (!Array.isArray(message.content)) return {
			corrupt: true,
			reason: `content at seq ${event.seq}`
		};
		if (event.type === "assistant/message") {
			if (source.kind !== "model" || !(typeof source.provider === "string" && source.provider.length > 0) || !(typeof source.model === "string" && source.model.length > 0)) return {
				corrupt: true,
				reason: `model source at seq ${event.seq}`
			};
			continue;
		}
		if (event.type !== "tool/result") continue;
		if (source.kind !== "tool" || typeof source.callId !== "string" || source.callId === "") return {
			corrupt: true,
			reason: `tool source (empty callId) at seq ${event.seq}`
		};
		const content = message.content;
		const block = content[0];
		if (content.length !== 1 || typeof block !== "object" || block === null || block.type !== "tool-result" || !Array.isArray(block.content)) return {
			corrupt: true,
			reason: `tool-result block at seq ${event.seq}`
		};
		if (block.toolCallId !== source.callId) return {
			corrupt: true,
			reason: `mismatched tool call ids at seq ${event.seq}`
		};
	}
	return { corrupt: false };
}
/** Detect corruption from the raw artifact bytes (decode + validate). */
function detectCorruptionInLog(buf) {
	const { rows, decodeError } = decodeSessionRows(buf);
	if (decodeError !== null) return {
		corrupt: true,
		reason: `decode:${decodeError}`
	};
	return detectCorruption(rows);
}
/** Size of a file, or 0 when unreadable. */
function fileSize(path) {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}
/** The session's artifact directory + total size, or undefined when absent. */
function sessionDirInfo(persistence, header) {
	const located = persistence.locate(header);
	if (located === void 0 || located.kind !== "jsonl") return void 0;
	const log = located.path;
	const dir = dirname(log);
	if (log === dir) return void 0;
	const base = log.endsWith(LOG_SUFFIX_ZSTD) ? LOG_SUFFIX_ZSTD : LOG_SUFFIX_PLAIN;
	if (!log.endsWith(base)) return void 0;
	return {
		dir,
		log,
		size: fileSize(log)
	};
}
/**
* List materialized sessions with a corruption flag. Live sessions are listed
* but never marked corrupt (their log is being written; not deletable anyway).
*/
async function listSessions(ctx) {
	const persistence = ctx.get?.("sessionPersistence");
	if (persistence === void 0 || typeof persistence.list !== "function") return [];
	const headers = await persistence.list();
	const liveIds = liveSessionIds(ctx);
	const entries = [];
	for (const header of headers) {
		const id = header.id;
		if (typeof id !== "string" || id === "") continue;
		const info = typeof persistence.locate === "function" ? sessionDirInfo(persistence, header) : void 0;
		const size = info?.size ?? 0;
		if (liveIds.has(id)) {
			entries.push({
				id,
				cwd: header.cwd,
				corrupt: false,
				size
			});
			continue;
		}
		if (info === void 0) {
			entries.push({
				id,
				cwd: header.cwd,
				corrupt: false,
				size: 0
			});
			continue;
		}
		const detected = detectCorruptionInLog(readFileSync(info.log));
		entries.push({
			id,
			cwd: header.cwd,
			corrupt: detected.corrupt,
			corruptReason: detected.reason,
			size
		});
	}
	return entries;
}
/** Ids of sessions currently open in this process (never deletable). */
function liveSessionIds(ctx) {
	const store = ctx.get?.("sessions");
	const out = /* @__PURE__ */ new Set();
	if (store === void 0 || typeof store.list !== "function") return out;
	for (const s of store.list()) {
		const header = s?.header;
		if (typeof header?.id === "string") out.add(header.id);
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
		} catch {
			return;
		}
		for (const name of names) {
			const p = join(d, name);
			let isDir = false;
			try {
				isDir = statSync(p).isDirectory();
			} catch {
				continue;
			}
			if (isDir) walk(p);
			else {
				files += 1;
				bytes += fileSize(p);
			}
		}
	};
	walk(dir);
	return {
		files,
		bytes
	};
}
/**
* Delete one session's on-disk data (the session directory). Refuses when the
* session is unknown or currently live. The path comes from the persistence
* service's own `locate()`, never from caller input.
*/
async function deleteSession(ctx, sessionId) {
	const persistence = ctx.get?.("sessionPersistence");
	if (persistence === void 0 || typeof persistence.list !== "function" || typeof persistence.locate !== "function") return {
		ok: false,
		id: sessionId,
		error: "session-persistence-unavailable"
	};
	const header = (await persistence.list()).find((h) => h.id === sessionId);
	if (header === void 0) return {
		ok: false,
		id: sessionId,
		error: "session-not-found"
	};
	if (liveSessionIds(ctx).has(sessionId)) return {
		ok: false,
		id: sessionId,
		error: "session-live"
	};
	const info = sessionDirInfo(persistence, header);
	if (info === void 0) return {
		ok: false,
		id: sessionId,
		error: "no-artifact"
	};
	if (!info.log.startsWith(info.dir + "\\") && !info.log.startsWith(info.dir + "/")) return {
		ok: false,
		id: sessionId,
		error: "artifact-outside-dir"
	};
	try {
		const { files, bytes } = dirStats(info.dir);
		rmSync(info.dir, {
			recursive: true,
			force: true
		});
		return {
			ok: true,
			id: sessionId,
			path: info.dir,
			files,
			bytes
		};
	} catch (e) {
		return {
			ok: false,
			id: sessionId,
			error: e instanceof Error ? e.message : String(e)
		};
	}
}
//#endregion
//#region src/version.ts
/**
* dsh-session-buddy version constant, shared by the host and browser halves.
* The value is mirrored from `package.json#version` at build time. Keeping a
* single exported constant lets the host route and the settings card agree on
* "the currently running version" without importing package.json at runtime
* (and without the bundler inlining a copy that can drift).
* @module dsh-session-buddy/version
*/
/** The currently running plugin version (synced with package.json). */
const LIB_VERSION = "0.3.0";
//#endregion
//#region src/host/upgrade.ts
/**
* dsh-session-buddy lightweight in-app upgrade — lets the settings card offer
* "check for updates" + "upgrade" for THIS package only, without a full plugin
* manager panel.
*
* Design (mirrors the official upgrade path used by @linxin666/dsh-client-ui-
* plugin-manager, reduced to the single-package case):
* - Check: read `https://registry.npmjs.org/<name>/latest` for the newest
*   version; compare with the running LIB_VERSION. Fail-closed: any network /
*   parse failure reads "unknown" and never blocks the card.
* - Upgrade: spawn the official `dsh plugin --profile <name> add <pkg>@<ver>`
*   CLI — the single writer for the profile (the npm web runtime has no
*   in-process installer service). A bounded job table lets the browser poll
*   progress instead of a long-blocking request.
*
* The CLI is spawned only for the upgrade action; the check is a plain fetch.
* @module dsh-session-buddy/host/upgrade
*/
/** The npm package this plugin is published as (self-upgrade target). */
const PACKAGE_NAME = "dsh-session-buddy";
/** Registry endpoint for the latest published version (with dsh/engines meta). */
const REGISTRY_LATEST = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
/** Registry fetch timeout; a slow/absent network must not block the card. */
const REGISTRY_TIMEOUT_MS = 5e3;
/** A single CLI run must finish within this window (npm install can be slow). */
const CLI_TIMEOUT_MS = 12e4;
/** The profile name to operate on. Read once from the environment (dsh sets
* `DSH_PROFILE` for host plugins); falls back to `web`, the common web UI. */
function profileName() {
	return process.env.DSH_PROFILE ?? "web";
}
/** A short, conservative package/version id allowed in a CLI spec. The spec is
* interpolated into a `dsh plugin ... add <spec>` argv (no shell), but we still
* reject shell metacharacters and anything that is not `name` / `name@version`. */
const SAFE_SPEC_RE = /^[A-Za-z0-9@./_~-]+$/;
/** Reject an install/update spec that could inject into the CLI argv. */
function unsafeSpecReason(spec) {
	if (spec.length === 0 || spec.length > 200) return "spec-too-long";
	if (!SAFE_SPEC_RE.test(spec)) return "spec-has-unsafe-chars";
}
/** The installed versions we compare: `1.2.3` (plus optional prerelease). */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
/** Parse a semver-ish string into comparable parts; undefined when malformed. */
function parseVersion(value) {
	const match = VERSION_RE.exec(value.trim().replace(/^v/, ""));
	if (match === null) return void 0;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3])
	};
}
/** Compare two version strings; returns >0 when left is newer, <0 older, 0 equal. */
function compareVersions(left, right) {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (a === void 0 || b === void 0) return void 0;
	return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
/** Fetch the latest published version + compat metadata. Fail-closed: returns
* undefined on timeout / non-200 / malformed body / missing version. */
async function fetchLatestManifest(fetchImpl = fetch) {
	try {
		const response = await fetchImpl(REGISTRY_LATEST, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
		if (!response.ok) return void 0;
		const body = await response.json();
		if (typeof body !== "object" || body === null) return void 0;
		const manifest = body;
		if (typeof manifest.version !== "string") return void 0;
		return manifest;
	} catch {
		return;
	}
}
/** The npm-global bin directory for the current user, e.g.
* `C:\Users\<user>\AppData\Roaming\npm` on Windows / `<prefix>/bin` on POSIX.
* This is where `dsh`/`dsh.cmd` shims live when installed via npm globally.
*
* IMPORTANT: `npm_config_prefix` (set by `npm run`) ALREADY IS the full npm
* global dir (`...\Roaming\npm`) — do NOT append `npm` to it. `APPDATA` is the
* parent (`...\Roaming`), so only that one needs the `npm` suffix appended. */
function npmBinDir(env = process.env) {
	const prefix = env.npm_config_prefix;
	if (typeof prefix === "string" && prefix.length > 0) return prefix;
	const appdata = env.APPDATA;
	if (typeof appdata === "string" && appdata.length > 0) return process.platform === "win32" ? join(appdata, "npm") : join(appdata, "bin");
	return "";
}
/** Locate the `dsh` CLI shim (or executable). Prefers the npm-global bin dir
* (where a global `dsh` install actually puts `dsh.cmd` on Windows); falls
* back to a bare name resolved by the OS. Returns an absolute path when
* possible so {@link resolveLaunch} can expand it deterministically. */
function findDshBinary(env = process.env) {
	const binDir = npmBinDir(env);
	const candidates = [];
	if (binDir !== "") candidates.push(join(binDir, process.platform === "win32" ? "dsh.cmd" : "dsh"));
	candidates.push(join(dirname(process.execPath), "dsh"), join(dirname(process.execPath), "dsh.cmd"), "dsh");
	for (const candidate of candidates) if ((candidate.includes("\\") || candidate.includes("/")) && existsSync(candidate)) return candidate;
	return "dsh";
}
/** The dsh CLI's bin script path, relative to the npm bin dir that holds the
* `dsh.cmd` shim. Mirrors what the shim itself executes. */
function binScriptFor(binDir) {
	return join(binDir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
/**
* Resolve a launch command for the CLI. On Windows a `.cmd` shim is a batch
* file: spawning it through a shell is unreliable (spaced paths, quoting), so
* we resolve the node binary + the CLI's bin script and spawn those directly.
* On POSIX the bare `dsh` (or the resolved path) is executed as-is.
*/
function resolveLaunch(binary, platform = process.platform) {
	if (platform === "win32" && (binary === "dsh" || binary.endsWith(".cmd"))) {
		const binDir = binary.endsWith(".cmd") ? dirname(binary) : npmBinDir();
		const binScript = binDir !== "" ? binScriptFor(binDir) : "";
		if (binScript !== "" && existsSync(binScript)) return {
			command: process.execPath,
			argsPrefix: [binScript]
		};
		return {
			command: binary,
			argsPrefix: [],
			shell: true
		};
	}
	return {
		command: binary,
		argsPrefix: []
	};
}
/** Run the dsh CLI once, capturing stdout+stderr. Returns {code, output}. */
function runDshCli(args, timeoutMs = CLI_TIMEOUT_MS, spawnImpl = spawn, binary = findDshBinary()) {
	return new Promise((resolve) => {
		if (binary === null) {
			resolve({
				code: -1,
				output: "dsh CLI not found"
			});
			return;
		}
		const launch = resolveLaunch(binary);
		const child = spawnImpl(launch.command, [...launch.argsPrefix, ...args], {
			env: process.env,
			windowsHide: true,
			shell: launch.shell === true
		});
		let output = "";
		child.stdout?.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			output += chunk.toString();
		});
		const timer = setTimeout(() => {
			child.kill();
		}, timeoutMs);
		child.on("error", (error) => {
			clearTimeout(timer);
			resolve({
				code: -1,
				output: `failed to spawn dsh CLI: ${error.message}`
			});
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				code,
				output
			});
		});
	});
}
/** A minimal in-memory job table for in-flight upgrades (browser polls it). */
var UpgradeJobs = class {
	jobs = /* @__PURE__ */ new Map();
	counter = 0;
	start(targetVersion) {
		const id = `upgrade-${++this.counter}`;
		const job = {
			id,
			targetVersion,
			phase: "running"
		};
		this.jobs.set(id, job);
		return job;
	}
	settle(id, phase, error) {
		const job = this.jobs.get(id);
		if (job === void 0) return;
		job.phase = phase;
		if (error !== void 0) job.error = error;
	}
	get(id) {
		const job = this.jobs.get(id);
		return job === void 0 ? void 0 : { ...job };
	}
};
/** The shared job table for this process. */
const upgradeJobs = new UpgradeJobs();
/**
* Start an in-place upgrade of THIS package to `targetVersion` via the official
* CLI. Returns the job id for polling; the CLI runs detached (browser polls
* `/status`). The profile name comes from the environment.
*/
function startUpgrade(targetVersion) {
	const spec = `${PACKAGE_NAME}@${targetVersion}`;
	const unsafe = unsafeSpecReason(spec);
	if (unsafe !== void 0) return {
		jobId: "",
		error: `invalid upgrade spec: ${unsafe}`
	};
	const job = upgradeJobs.start(targetVersion);
	runDshCli([
		"plugin",
		"--profile",
		profileName(),
		"add",
		spec
	]).then(({ code, output }) => {
		if (code === 0) upgradeJobs.settle(job.id, "done");
		else upgradeJobs.settle(job.id, "error", output.trim() || `dsh plugin add exited with code ${String(code)}`);
	});
	return { jobId: job.id };
}
//#endregion
//#region src/index.ts
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "session-buddy";
/**
* Declared service dependency: the loader defers this plugin's apply until the
* `webServer` service is available, so the native-toast route can be registered
* directly at apply time.
*/
const inject = ["webServer"];
/** Settings namespace of the session-buddy capability. */
const SESSION_BUDDY_NAMESPACE = "session-buddy";
/** Settings schema: master switch + the three trigger kinds + UI prefs. */
function makeSessionBuddySettingsSchema() {
	return z.object({
		enabled: z.boolean().default(true),
		notifyReply: z.boolean().default(true),
		notifyAsk: z.boolean().default(true),
		notifyConfirm: z.boolean().default(true),
		sound: z.boolean().default(false),
		outlineWidth: z.number().min(12).max(32).default(18),
		showTimestamps: z.boolean().default(true)
	});
}
/** Register the session-buddy settings namespace on the context. */
const apply = mountOnce("dsh-session-buddy", applyImpl);
/** Native-toast trigger route the browser half fetches. Loopback-only. */
const TOAST_ROUTE = "/api/session-buddy/toast";
/** SSE route that relays event-driven notification triggers to every tab. */
const EVENTS_ROUTE = "/api/session-buddy/events";
/** Maximum accepted request body. Toasts carry only title+body text, so a
* small cap (and an early stream destroy) is a cheap DoS hardening. */
const MAX_BODY_BYTES = 8192;
/** The request's socket address (authoritative; never trust forwarded headers). */
function isLoopbackAddress(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function isLoopbackHostname(hostname) {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
/**
* Loopback-only + browser same-origin fence for the toast route: the socket
* address must be loopback, the Host header must name a loopback host, and a
* cross-site fetch (any other local page or a remote origin) is rejected.
*/
function isLoopbackRequest(request) {
	if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostname;
	try {
		hostname = new URL(`http://${host}`).hostname;
	} catch {
		return false;
	}
	if (!isLoopbackHostname(hostname)) return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
/** Read a small JSON request body. Resolves undefined on any failure (malformed
* JSON, over-long body, or a stream error). */
function readJsonBody(request) {
	return new Promise((resolve) => {
		const chunks = [];
		let size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				request.destroy();
				resolve(void 0);
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => {
			if (size > MAX_BODY_BYTES) return;
			try {
				const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
				resolve(typeof parsed === "object" && parsed !== null ? parsed : void 0);
			} catch {
				resolve(void 0);
			}
		});
		request.on("error", () => {
			resolve(void 0);
		});
	});
}
function writeJson(response, status, body) {
	response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(body));
}
function applyImpl(ctx, config = {}) {
	const base = {
		enabled: config.enabled ?? true,
		notifyReply: config.notifyReply ?? true,
		notifyAsk: config.notifyAsk ?? true,
		notifyConfirm: config.notifyConfirm ?? true,
		sound: config.sound ?? false,
		outlineWidth: config.outlineWidth ?? 18,
		showTimestamps: config.showTimestamps ?? true
	};
	installSettingsSection(ctx, settingsNamespace(SESSION_BUDDY_NAMESPACE), makeSessionBuddySettingsSchema(), base, {
		setSource: () => {},
		onChange: () => {}
	});
	const hub = new BuddySseHub();
	const stopMonitor = createEventMonitor(ctx, hub);
	ctx.effect(() => () => {
		try {
			stopMonitor();
		} catch {}
		hub.dispose();
	}, "session-buddy: event monitor + sse hub");
	const toastRoute = {
		kind: "exact",
		path: TOAST_ROUTE,
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			const body = await readJsonBody(request);
			if (body === void 0) {
				writeJson(response, 400, {
					ok: false,
					error: "invalid-json-body"
				});
				return;
			}
			const title = typeof body.title === "string" && body.title !== "" ? body.title : "dsh-session-buddy";
			const text = typeof body.body === "string" ? body.body : "";
			const claimKey = typeof body.claimKey === "string" ? body.claimKey : "";
			if (claimKey !== "" && !tryClaimNotification(claimKey)) {
				writeJson(response, 409, {
					ok: false,
					error: "already-notified",
					claimed: true
				});
				return;
			}
			fireNativeToast({
				title,
				body: text
			});
			writeJson(response, 200, {
				ok: true,
				title,
				body: text,
				claimed: true
			});
		}
	};
	const eventsRoute = {
		kind: "exact",
		path: EVENTS_ROUTE,
		handler: (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "GET") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			hub.handle(request, response);
		}
	};
	const sessionsRoute = {
		kind: "exact",
		path: "/api/session-buddy/sessions",
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "GET") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			try {
				writeJson(response, 200, {
					ok: true,
					sessions: await listSessions(ctx)
				});
			} catch (e) {
				writeJson(response, 500, {
					ok: false,
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}
	};
	const sessionsDeleteRoute = {
		kind: "exact",
		path: "/api/session-buddy/sessions/delete",
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			const body = await readJsonBody(request);
			const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
			if (sessionId === "" || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
				writeJson(response, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				return;
			}
			try {
				const result = await deleteSession(ctx, sessionId);
				if (!result.ok) {
					writeJson(response, result.error === "session-live" ? 409 : 404, {
						ok: false,
						error: result.error
					});
					return;
				}
				writeJson(response, 200, {
					ok: true,
					id: result.id,
					path: result.path,
					files: result.files,
					bytes: result.bytes
				});
			} catch (e) {
				writeJson(response, 500, {
					ok: false,
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}
	};
	const versionRoute = {
		kind: "exact",
		path: `${TOAST_ROUTE}/version`,
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "GET") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			const manifest = await fetchLatestManifest();
			const latest = typeof manifest?.version === "string" ? manifest.version : void 0;
			writeJson(response, 200, {
				ok: true,
				name: PACKAGE_NAME,
				current: LIB_VERSION,
				latest,
				updateAvailable: latest !== void 0 ? (compareVersions(latest, "0.3.0") ?? 0) > 0 : false
			});
		}
	};
	const updateRoute = {
		kind: "exact",
		path: `${TOAST_ROUTE}/update`,
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			const body = await readJsonBody(request);
			const version = typeof body?.version === "string" ? body.version : void 0;
			if (version === void 0 || parseVersion(version) === void 0) {
				writeJson(response, 400, {
					ok: false,
					error: "invalid-version"
				});
				return;
			}
			const started = startUpgrade(version);
			if (started.error !== void 0) {
				writeJson(response, 400, {
					ok: false,
					error: started.error
				});
				return;
			}
			writeJson(response, 200, {
				ok: true,
				jobId: started.jobId
			});
		}
	};
	const statusRoute = {
		kind: "exact",
		path: `${TOAST_ROUTE}/update/status`,
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden-loopback-only"
				});
				return;
			}
			if (request.method !== "GET") {
				writeJson(response, 405, {
					ok: false,
					error: `method-not-allowed:${request.method}`
				});
				return;
			}
			const id = new URL(request.url ?? "", "http://localhost").searchParams.get("id");
			const job = id !== null ? upgradeJobs.get(id) : void 0;
			if (job === void 0) {
				writeJson(response, 404, {
					ok: false,
					error: "job-not-found"
				});
				return;
			}
			writeJson(response, 200, {
				ok: true,
				job
			});
		}
	};
	ctx.effect(() => {
		const routes = [
			toastRoute,
			versionRoute,
			updateRoute,
			statusRoute,
			eventsRoute,
			sessionsRoute,
			sessionsDeleteRoute
		];
		const tryRegister = () => {
			try {
				const server = ctx.webServer;
				if (server === void 0 || typeof server.register !== "function") return false;
				for (const route of routes) server.register(route);
				return true;
			} catch {
				return false;
			}
		};
		if (tryRegister()) return () => {};
		let tries = 0;
		const timer = setInterval(() => {
			tries += 1;
			if (tryRegister() || tries >= 120) clearInterval(timer);
		}, 500);
		return () => {
			clearInterval(timer);
		};
	}, "session-buddy: toast + upgrade routes");
}
//#endregion
export { ASK_TOOL_NAME, BuddyMonitor, BuddySseHub, EVENTS_ROUTE, LEDGER_DIR, LEDGER_FILE, LIB_VERSION, PACKAGE_NAME, SESSION_BUDDY_NAMESPACE, TOAST_ROUTE, apply, assistantSummary, compareVersions, decodeSessionRows, detectCorruption, detectCorruptionInLog, findDshBinary, inject, makeSessionBuddySettingsSchema, name, parseVersion, resolveLaunch, runDshCli, tryClaimNotification, unsafeSpecReason };
