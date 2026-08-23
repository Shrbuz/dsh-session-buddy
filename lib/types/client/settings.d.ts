/**
 * dsh-session-buddy browser-side settings — the `session-buddy`
 * settings-namespace scope the browser mirrors from the Host. Every switch
 * (enabled / three notification triggers / sound / outline prefs) is read
 * from here, so each change in the settings card applies LIVE to the floating
 * UI and the notification logic.
 * @module dsh-session-buddy/client/settings
 */
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client';
/** The full settings surface the browser half consumes. */
export interface SessionBuddyUiSettings {
    /** Master switch. */
    enabled: boolean;
    /** Notify when an assistant reply stabilizes. */
    notifyReply: boolean;
    /** Notify when the session is waiting for user input. */
    notifyAsk: boolean;
    /** Notify when an approval/confirmation dialog is waiting. */
    notifyConfirm: boolean;
    /** Play a short sound alongside the notification. */
    sound: boolean;
    /** Ladder outline panel width in px. */
    outlineWidth: number;
    /** Show per-rung timestamps in the tooltip. */
    showTimestamps: boolean;
}
/** The scope spec the client binds against the `session-buddy` namespace. */
export declare const sessionBuddySettingsSpec: SettingsScopeSpec<SessionBuddyUiSettings>;
/** Defaults the UI falls back to while the scope has no accepted section yet. */
export declare const DEFAULT_UI_SETTINGS: SessionBuddyUiSettings;
/** Derive the effective settings from a bound scope (never throws). */
export declare function deriveUiSettings(scope: SettingsScope<SessionBuddyUiSettings>): SessionBuddyUiSettings;
//# sourceMappingURL=settings.d.ts.map