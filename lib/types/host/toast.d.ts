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
/** Payload the browser half sends to fire a native toast. */
export interface NativeToastPayload {
    /** Toast title (app line). */
    title: string;
    /** Toast body text. */
    body: string;
}
/**
 * Fire a native OS toast for the current platform. Returns true when a channel
 * was dispatched (the toast itself may still be best-effort).
 */
export declare function fireNativeToast(payload: NativeToastPayload): boolean;
//# sourceMappingURL=toast.d.ts.map