import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const LIB_VERSION = "0.1.1";
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
/** Locate the `dsh` CLI. Prefers an absolute path we can spawn directly;
* falls back to a bare name (resolved via the OS). On Windows the .cmd shim is
* later expanded through node + bin.js (see {@link resolveLaunch}). */
function findDshBinary(env = process.env) {
	const candidates = [
		"dsh",
		join(dirname(process.execPath), "dsh"),
		join(dirname(process.execPath), "dsh.cmd")
	];
	for (const candidate of candidates) if ((candidate.includes("\\") || candidate.includes("/")) && existsSync(candidate)) return candidate;
	return "dsh";
}
/** The dsh CLI's npm bin script (matches the `dsh` entry in @deepseek-ai/dsh). */
const DSH_BIN_JS = join(dirname(process.execPath), "node_modules", "@deepseek-ai", "dsh", "bin", "dsh.mjs");
/**
* Resolve a launch command for the CLI. On Windows a `.cmd` shim is a batch
* file: spawning it through a shell is unreliable (spaced paths, quoting), so
* we resolve the node binary + the CLI's bin script and spawn those directly.
* On POSIX the bare `dsh` (or the resolved path) is executed as-is.
*/
function resolveLaunch(binary, platform = process.platform) {
	if (platform === "win32" && (binary === "dsh" || binary.endsWith(".cmd"))) {
		if (existsSync(DSH_BIN_JS)) return {
			command: process.execPath,
			argsPrefix: [DSH_BIN_JS]
		};
		return {
			command: "node",
			argsPrefix: [DSH_BIN_JS]
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
			shell: false
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
			fireNativeToast({
				title,
				body: text
			});
			writeJson(response, 200, {
				ok: true,
				title,
				body: text
			});
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
				updateAvailable: latest !== void 0 ? (compareVersions(latest, "0.1.1") ?? 0) > 0 : false
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
			statusRoute
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
export { LIB_VERSION, PACKAGE_NAME, SESSION_BUDDY_NAMESPACE, TOAST_ROUTE, apply, compareVersions, inject, makeSessionBuddySettingsSchema, name, parseVersion, unsafeSpecReason };
