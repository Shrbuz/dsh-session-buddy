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
/** Host route that pops a native OS toast (loopback-only, no auth). */
const TOAST_ROUTE = '/api/session-buddy/toast';
/** Favicon badge text (a red dot). */
const FAVICON_BADGE = '●';
/** A red-dot icon (SVG data URI, no asset) overlaid on the tab's favicon so a
 *  background tab is visibly marked across the tab strip / taskbar. */
const RED_DOT_FAVICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="%23ff3b30"/></svg>';
/** Min gap between beeps, so a burst of notifications (reply + ask) doesn't
 * machine-gun the sound. */
const SOUND_COOLDOWN_MS = 2_500;
/** Timestamp of the last beep. */
let lastBeepAt = 0;
/** One short beep, generated with the Web Audio API (no asset needed). Rate-
 * limited so rapid notification bursts don't produce a staccato of beeps. */
function playBeep() {
    const now = Date.now();
    if (now - lastBeepAt < SOUND_COOLDOWN_MS)
        return;
    lastBeepAt = now;
    try {
        const AudioContextClass = window.AudioContext
            ?? window.webkitAudioContext;
        if (AudioContextClass === undefined)
            return;
        const ctx = new AudioContextClass();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.28);
        void oscillator.onended;
        setTimeout(() => { void ctx.close().catch(() => { }); }, 500);
    }
    catch {
        // Audio is best-effort; never let a beep failure break notifications.
    }
}
/** Fire-and-forget native OS toast through the host route. Resolves true when
 *  the host fired the toast — i.e. this tab won the cross-tab claim (or no
 *  claim key was supplied) — and false when another tab already notified this
 *  episode (host answers 409) or the host was unreachable. Best-effort. */
async function sendNativeToast(title, body, claimKey) {
    try {
        const payload = claimKey !== undefined && claimKey !== ''
            ? { title, body, claimKey }
            : { title, body };
        const response = await fetch(TOAST_ROUTE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
/** Current marker state, or undefined when no marker is active. */
let marker;
/** Apply the red-dot favicon + title badge. Idempotent: re-activation just
 * re-applies, never double-stacking the title prefix. Persists until the tab
 * comes back to the foreground (see the visibilitychange listener below). */
function applyMarker() {
    if (!document.hidden)
        return;
    if (marker === undefined) {
        let icon = document.querySelector('link[rel~="icon"]');
        let created = false;
        if (icon === null) {
            icon = document.createElement('link');
            icon.rel = 'icon';
            document.head.appendChild(icon);
            created = true;
        }
        marker = {
            originalTitle: document.title,
            icon,
            originalHref: icon.href !== '' ? icon.href : undefined,
            createdIcon: created,
        };
    }
    const m = marker;
    document.title = `(${FAVICON_BADGE}) ${m.originalTitle}`;
    // Idempotent: only rewrite the favicon when it isn't already the marker, so
    // re-notifying (reply then ask) doesn't make the red dot flash repeatedly.
    if (m.icon.href !== RED_DOT_FAVICON)
        m.icon.href = RED_DOT_FAVICON;
}
/** Restore the original title and favicon. */
function clearMarker() {
    if (marker === undefined)
        return;
    const m = marker;
    marker = undefined;
    document.title = m.originalTitle;
    if (m.createdIcon) {
        m.icon.remove();
    }
    else if (m.originalHref !== undefined) {
        m.icon.href = m.originalHref;
    }
}
// When the tab comes back to the foreground the user is looking at it, so the
// marker is no longer needed — drop it.
window.addEventListener('visibilitychange', () => {
    if (!document.hidden)
        clearMarker();
});
/**
 * Deliver one notification (respecting the hidden-tab gate): native OS toast
 * via the host + red-dot/title marker + (only when this tab wins the claim)
 * optional rate-limited beep. Resolves true when the native toast was
 * dispatched; false when gated by visibility or already claimed elsewhere.
 */
export async function notify(options) {
    // Hidden-tab gate: don't notify while the user is actively looking. A reply
    // whose user stepped away during it (`forceHidden`) fires regardless — they
    // were away for the reply, so a brief switch-back at the settle instant must
    // not swallow the toast.
    if (!document.hidden && options.forceHidden !== true)
        return false;
    // Native OS toast — the reliable channel (no browser permission needed).
    // The claim key makes the host dedup across tabs/reloads.
    const native = await sendNativeToast(options.title, options.body, options.claimKey);
    // Cross-tab marker: even when the OS banner is unavailable, the dsh tab gets
    // a red-dot favicon + title badge so the event is visible across the tab
    // strip / taskbar.
    applyMarker();
    // Only the tab that actually fired the toast beeps — otherwise several open
    // tabs would machine-gun the sound for a single event.
    if (native && options.sound)
        playBeep();
    return native;
}
