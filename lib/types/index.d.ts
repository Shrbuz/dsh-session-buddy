/**
 * dsh-session-buddy host half — settings namespace + the native-toast route.
 * The browser half reads every switch straight from the settings scope it
 * binds against this namespace, and POSTs {title, body} to /api/session-buddy/
 * toast to have the host pop a real OS notification (no browser permission).
 *
 * Install via `dsh plugin --profile web add link:<this-dir>`; the
 * cordis.patch.yml inserts this plugin row.
 * @module dsh-session-buddy
 */
import { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
export { LIB_VERSION, PACKAGE_NAME, parseVersion, compareVersions, unsafeSpecReason, findDshBinary, resolveLaunch, runDshCli } from './host/upgrade.ts';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "session-buddy";
/**
 * Declared service dependency: the loader defers this plugin's apply until the
 * `webServer` service is available, so the native-toast route can be registered
 * directly at apply time.
 */
export declare const inject: string[];
/** Settings namespace of the session-buddy capability. */
export declare const SESSION_BUDDY_NAMESPACE = "session-buddy";
/** Notification trigger kinds (each independently switchable). */
export type NotifyTrigger = 'reply' | 'ask' | 'confirm';
/**
 * Plugin configuration — all optional, defaults applied by the schema.
 * The browser half reads the effective section through its settings scope.
 */
export interface SessionBuddyConfig {
    /** Master switch for the whole plugin (browser half unmounts when off). */
    enabled?: boolean;
    /** Notify when an assistant reply stabilizes. */
    notifyReply?: boolean;
    /** Notify when the session is waiting for user input. */
    notifyAsk?: boolean;
    /** Notify when an approval/confirmation dialog is waiting. */
    notifyConfirm?: boolean;
    /** Play a short sound alongside the notification. */
    sound?: boolean;
    /** Ladder outline panel width in px. */
    outlineWidth?: number;
    /** Show per-rung timestamps in the tooltip. */
    showTimestamps?: boolean;
}
/** The settings-namespace section the web settings surface edits. */
export interface SessionBuddySettingsSection {
    enabled: boolean;
    notifyReply: boolean;
    notifyAsk: boolean;
    notifyConfirm: boolean;
    sound: boolean;
    outlineWidth: number;
    showTimestamps: boolean;
}
/** Settings schema: master switch + the three trigger kinds + UI prefs. */
export declare function makeSessionBuddySettingsSchema(): z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
    notifyReply: z<boolean, boolean>;
    notifyAsk: z<boolean, boolean>;
    notifyConfirm: z<boolean, boolean>;
    sound: z<boolean, boolean>;
    outlineWidth: z<number, number>;
    showTimestamps: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
    notifyReply: z<boolean, boolean>;
    notifyAsk: z<boolean, boolean>;
    notifyConfirm: z<boolean, boolean>;
    sound: z<boolean, boolean>;
    outlineWidth: z<number, number>;
    showTimestamps: z<boolean, boolean>;
}>>;
/** Register the session-buddy settings namespace on the context. */
export declare const apply: typeof applyImpl;
/** Native-toast trigger route the browser half fetches. Loopback-only. */
export declare const TOAST_ROUTE = "/api/session-buddy/toast";
declare function applyImpl(ctx: Context, config?: SessionBuddyConfig): void;
//# sourceMappingURL=index.d.ts.map