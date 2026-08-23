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
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** Windows PowerShell 5.1 absolute path (always present on Windows). */
const WINDOWS_POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
/**
 * Escape a string as a PowerShell single-quoted literal (single quotes are
 * doubled; `$` is literal inside single quotes, so no variable expansion).
 */
function psQuote(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
/** Escape a string as an AppleScript string literal. */
function osaQuote(value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
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
        '$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
        '$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
        '$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
        '$texts = $template.GetElementsByTagName(\'text\')',
        `$null = $texts.Item(0).AppendChild($template.CreateTextNode(${psQuote(title)}))`,
        `$null = $texts.Item(1).AppendChild($template.CreateTextNode(${psQuote(body)}))`,
        '$node = $template.CreateElement(\'audio\')',
        "$node.SetAttribute('silent', 'true')",
        '$null = $template.DocumentElement.AppendChild($node)',
        '$toast = New-Object Windows.UI.Notifications.ToastNotification -ArgumentList $template',
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows PowerShell').Show($toast)",
    ].join('\n');
}
/** Write the script to a fresh temp .ps1 and return its path. */
function writeWinScript(script) {
    const dir = mkdtempSync(join(tmpdir(), 'dsb-toast-'));
    const file = join(dir, 'toast.ps1');
    // UTF-8 BOM: Windows PowerShell 5.1 reads a BOM-less .ps1 as the ANSI/GBK
    // codepage, which garbles the embedded Chinese title/body. The BOM makes it
    // parse the file (and the literals) as UTF-8.
    writeFileSync(file, `\uFEFF${script}`, 'utf8');
    return { dir, file };
}
/** Normal Windows toast — runs via `execFile` fire-and-forget (a detached
 * `spawn` of powershell.exe was silently dropped on the target machine, while
 * `execFile` reliably showed the banner). Never throws. */
function winToast(title, body) {
    try {
        const { dir, file } = writeWinScript(buildWinToastScript(title, body));
        execFile(WINDOWS_POWERSHELL, [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden', '-File', file,
        ], { timeout: 15_000, windowsHide: true }, () => {
            // The toast rendered in well under a second; clean the temp script after.
            try {
                rmSync(dir, { recursive: true, force: true });
            }
            catch { /* best-effort */ }
        });
    }
    catch {
        /* best-effort */
    }
}
/** macOS notification via osascript (best-effort). */
function macToast(title, body) {
    const command = `display notification ${osaQuote(body)} with title ${osaQuote(title)}`;
    execFile('osascript', ['-e', command], () => { });
}
/** Linux notification via notify-send (best-effort). */
function linuxToast(title, body) {
    execFile('notify-send', [title, body], () => { });
}
/**
 * Fire a native OS toast for the current platform. Returns true when a channel
 * was dispatched (the toast itself may still be best-effort).
 */
export function fireNativeToast(payload) {
    const title = payload.title === '' ? 'dsh-session-buddy' : payload.title;
    const body = payload.body ?? '';
    switch (process.platform) {
        case 'win32':
            winToast(title, body);
            return true;
        case 'darwin':
            macToast(title, body);
            return true;
        default:
            linuxToast(title, body);
            return true;
    }
}
