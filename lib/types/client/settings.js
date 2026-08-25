/**
 * dsh-session-buddy browser-side settings — the `session-buddy`
 * settings-namespace scope the browser mirrors from the Host. Every switch
 * (enabled / three notification triggers / sound / outline prefs) is read
 * from here, so each change in the settings card applies LIVE to the floating
 * UI and the notification logic.
 * @module dsh-session-buddy/client/settings
 */
/** Normalize an unknown section value to the UI settings (lenient). */
function decodeSection(section) {
    if (typeof section !== 'object' || section === null)
        return undefined;
    const value = section;
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
        collapseTools: value.collapseTools !== false,
        foldThink: value.foldThink !== false,
        foldLongUser: value.foldLongUser !== false,
    };
}
/** The scope spec the client binds against the `session-buddy` namespace. */
export const sessionBuddySettingsSpec = {
    namespace: 'session-buddy',
    decode: decodeSection,
};
/** Defaults the UI falls back to while the scope has no accepted section yet. */
export const DEFAULT_UI_SETTINGS = {
    enabled: true,
    notifyReply: true,
    notifyAsk: true,
    notifyConfirm: true,
    sound: false,
    outlineWidth: 18,
    showTimestamps: true,
    collapseTools: true,
    foldThink: true,
    foldLongUser: true,
};
/** Derive the effective settings from a bound scope (never throws). */
export function deriveUiSettings(scope) {
    return scope.getSnapshot().value ?? DEFAULT_UI_SETTINGS;
}
