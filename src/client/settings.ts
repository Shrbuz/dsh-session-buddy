/**
 * dsh-session-buddy browser-side settings — the `session-buddy`
 * settings-namespace scope the browser mirrors from the Host. Every switch
 * (enabled / three notification triggers / sound / outline prefs) is read
 * from here, so each change in the settings card applies LIVE to the floating
 * UI and the notification logic.
 * @module dsh-session-buddy/client/settings
 */

import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'

/** The full settings surface the browser half consumes. */
export interface SessionBuddyUiSettings {
  /** Master switch. */
  enabled: boolean
  /** Notify when an assistant reply stabilizes. */
  notifyReply: boolean
  /** Notify when the session is waiting for user input. */
  notifyAsk: boolean
  /** Notify when an approval/confirmation dialog is waiting. */
  notifyConfirm: boolean
  /** Play a short sound alongside the notification. */
  sound: boolean
  /** Ladder outline panel width in px. */
  outlineWidth: number
  /** Show per-rung timestamps in the tooltip. */
  showTimestamps: boolean
}

/** Schema-resolved section of the `session-buddy` namespace (host-side mirror). */
interface SessionBuddyWireSection {
  enabled?: unknown
  notifyReply?: unknown
  notifyAsk?: unknown
  notifyConfirm?: unknown
  sound?: unknown
  outlineWidth?: unknown
  showTimestamps?: unknown
}

/** Normalize an unknown section value to the UI settings (lenient). */
function decodeSection(section: unknown): SessionBuddyUiSettings | undefined {
  if (typeof section !== 'object' || section === null) return undefined
  const value = section as SessionBuddyWireSection
  return {
    enabled: value.enabled !== false,
    notifyReply: value.notifyReply !== false,
    notifyAsk: value.notifyAsk !== false,
    notifyConfirm: value.notifyConfirm !== false,
    sound: value.sound === true,
    outlineWidth: typeof value.outlineWidth === 'number'
      ? Math.min(32, Math.max(12, Math.round(value.outlineWidth)))
      : 18,
    showTimestamps: value.showTimestamps !== false,
  }
}

/** The scope spec the client binds against the `session-buddy` namespace. */
export const sessionBuddySettingsSpec: SettingsScopeSpec<SessionBuddyUiSettings> = {
  namespace: 'session-buddy',
  decode: decodeSection,
}

/** Defaults the UI falls back to while the scope has no accepted section yet. */
export const DEFAULT_UI_SETTINGS: SessionBuddyUiSettings = {
  enabled: true,
  notifyReply: true,
  notifyAsk: true,
  notifyConfirm: true,
  sound: false,
  outlineWidth: 18,
  showTimestamps: true,
}

/** Derive the effective settings from a bound scope (never throws). */
export function deriveUiSettings(scope: SettingsScope<SessionBuddyUiSettings>): SessionBuddyUiSettings {
  return scope.getSnapshot().value ?? DEFAULT_UI_SETTINGS
}
