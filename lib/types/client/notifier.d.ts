/**
 * dsh-session-buddy notification module — notification delivery while the tab
 * is hidden:
 * 1. A native OS toast fired through the host (POST /api/session-buddy/toast),
 *    which pops a real system banner (PowerShell WinRT / osascript /
 *    notify-send) with NO browser notification permission required and no
 *    Chrome/OS toast suppression.
 * 2. A cross-tab marker while hidden: a red-dot favicon + `(●)` title badge,
 *    so there is a visible cue even when the OS banner is unavailable.
 * 3. Optional short sound (default off, configurable), rate-limited so a
 *    burst of notifications (reply + ask) doesn't machine-gun the beep.
 *
 * Notifications only fire while the tab is hidden (`document.hidden`), and a
 * single turn fires at most once (the classifier already dedupes; this module
 * additionally guards against edge-triggered double delivery).
 *
 * @module dsh-session-buddy/client/notifier
 */
/** One notification delivery. */
export interface NotifyOptions {
    /** Title shown in the notification (defaults to the session title). */
    title: string;
    /** Body text (trigger copy + summary). */
    body: string;
    /** Whether to play the beep. */
    sound: boolean;
    /** Trigger identity (reply/ask/confirm) — recorded for diagnostics. */
    tag: string;
    /** Fire even when the tab is visible. Used for a reply when the user stepped
     * away during the reply (`wasHidden`): they want the toast even if the settle
     * instant happens to land on a brief switch-back. */
    forceHidden?: boolean;
    /** Anchor key to scroll to when clicked (native toasts don't carry a click
     *  handler; kept for forward compatibility). */
    anchorKey?: string;
    /** Called after the user clicks the notification (unused for native toasts). */
    onClick?: (anchorKey: string | undefined) => void;
}
/**
 * Deliver one notification (respecting the hidden-tab gate): native OS toast
 * via the host + red-dot/title marker + optional rate-limited beep. Returns
 * whether the native toast was dispatched.
 */
export declare function notify(options: NotifyOptions): boolean;
//# sourceMappingURL=notifier.d.ts.map