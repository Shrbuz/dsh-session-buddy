import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	ctx.effect(() => {
		const tryRegister = () => {
			try {
				const server = ctx.webServer;
				if (server === void 0 || typeof server.register !== "function") return false;
				server.register(toastRoute);
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
	}, "session-buddy: toast route");
}
//#endregion
export { SESSION_BUDDY_NAMESPACE, TOAST_ROUTE, apply, inject, makeSessionBuddySettingsSchema, name };
