import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Session buddy settings card — the `session-buddy` entry inside the web
 * settings surface (设置 → 插件 → 插件配置). Follows the official plugin-card
 * pattern: a collapsible header (name + description + chevron) that expands
 * into the form. Every control writes straight back through the bound settings
 * scope, so changes apply live — no save/discard footer needed.
 * @module dsh-session-buddy/client/SessionBuddySettingsCard
 */
import { useSyncExternalStore, useState } from 'react';
import { DEFAULT_UI_SETTINGS } from "./settings.js";
import { checkVersion, pollUpgrade, startUpgrade } from "./upgrade.js";
/** A labeled toggle row (official-style switch). */
function Toggle(props) {
    return (_jsxs("div", { className: "dsb-settings-field dsb-settings-field-switch", children: [_jsx("span", { className: "dsb-settings-label", children: props.label }), _jsxs("label", { className: "dsb-settings-switch", children: [_jsx("input", { type: "checkbox", className: "dsb-check", "data-dsh-part": props.dataPart, checked: props.checked, onChange: (event) => { props.onChange(event.target.checked); } }), _jsx("span", { className: "dsb-settings-switch-track", "aria-hidden": "true" })] })] }));
}
/** Length presets for the ladder rungs (vertical bar height in px). */
const WIDTH_PRESETS = [
    { value: 14, labelKey: 'buddy.settings.widthSmall' },
    { value: 18, labelKey: 'buddy.settings.widthMedium' },
    { value: 24, labelKey: 'buddy.settings.widthLarge' },
];
/** A segmented (tab-style) picker, official-style. */
function Segmented(props) {
    return (_jsx("div", { className: "dsb-settings-seg", role: "radiogroup", "data-dsh-part": props.dataPart, children: props.options.map((option) => (_jsx("button", { type: "button", role: "radio", "aria-checked": option.value === props.value, className: option.value === props.value ? 'dsb-settings-seg-btn dsb-settings-seg-active' : 'dsb-settings-seg-btn', "data-dsh-part": `${props.dataPart}-${option.value}`, onClick: () => { props.onChange(option.value); }, children: option.label }, option.value))) }));
}
/** The session-buddy plugin card in 设置 → 插件 → 插件配置. */
export function SessionBuddySettingsCard(props) {
    const { scope, buddyT } = props;
    const snapshot = useSyncExternalStore((listener) => scope.subscribe(listener), () => scope.getSnapshot());
    if (snapshot.status === 'unavailable')
        return null;
    const value = snapshot.value ?? DEFAULT_UI_SETTINGS;
    const [open, setOpen] = useState(false);
    const [versionInfo, setVersionInfo] = useState(undefined);
    const [checking, setChecking] = useState(false);
    const [upgrading, setUpgrading] = useState(false);
    const [upgradeError, setUpgradeError] = useState(undefined);
    const [upgradeDone, setUpgradeDone] = useState(false);
    const set = (key, next) => { void scope.set(key, next); };
    /** Check for a newer version through the host; fail-closed. */
    const handleCheckUpdate = async () => {
        setChecking(true);
        setUpgradeError(undefined);
        setUpgradeDone(false);
        const info = await checkVersion();
        setVersionInfo(info);
        setChecking(false);
    };
    /** Start an upgrade to the latest version; poll until it settles. */
    const handleUpgrade = async () => {
        if (versionInfo?.latest === undefined)
            return;
        const spec = `dsh-session-buddy@${versionInfo.latest}`;
        if (!window.confirm(buddyT('buddy.settings.upgradeConfirm').replace('{spec}', spec)))
            return;
        setUpgrading(true);
        setUpgradeError(undefined);
        setUpgradeDone(false);
        const jobId = await startUpgrade(versionInfo.latest);
        if (jobId === undefined) {
            setUpgradeError(buddyT('buddy.settings.versionUnknown'));
            setUpgrading(false);
            return;
        }
        const job = await pollUpgrade(jobId);
        setUpgrading(false);
        if (job === undefined) {
            setUpgradeError(buddyT('buddy.settings.versionUnknown'));
        }
        else if (job.phase === 'error') {
            setUpgradeError(job.error ?? buddyT('buddy.settings.upgradeFailed'));
        }
        else {
            setUpgradeDone(true);
        }
    };
    return (_jsxs("li", { className: open ? 'dsb-settings-card dsb-settings-card-open' : 'dsb-settings-card', "data-dsh-part": "session-buddy-settings-card", children: [_jsxs("button", { type: "button", className: "dsb-settings-header", "aria-expanded": open, "aria-label": open
                    ? buddyT('buddy.settings.collapse')
                    : buddyT('buddy.settings.expand'), onClick: () => { setOpen((current) => !current); }, children: [_jsxs("span", { className: "dsb-settings-headText", children: [_jsx("span", { className: "dsb-settings-name", children: buddyT('buddy.settings.title') }), _jsx("span", { className: "dsb-settings-description", children: buddyT('buddy.settings.description') })] }), _jsx("svg", { width: "14", height: "14", className: open ? 'dsb-settings-chevron dsb-settings-chevron-open' : 'dsb-settings-chevron', viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z", fill: "currentColor" }) })] }), open ? (_jsxs("div", { className: "dsb-settings-body", children: [_jsx(Toggle, { dataPart: "buddy-setting-enabled", label: buddyT('buddy.settings.enabled'), checked: value.enabled, onChange: (next) => { set('enabled', next); } }), _jsx("div", { className: "dsb-settings-group-label", children: buddyT('buddy.settings.notify') }), _jsx(Toggle, { dataPart: "buddy-setting-notifyReply", label: buddyT('buddy.settings.notifyReply'), checked: value.notifyReply, onChange: (next) => { set('notifyReply', next); } }), _jsx(Toggle, { dataPart: "buddy-setting-notifyAsk", label: buddyT('buddy.settings.notifyAsk'), checked: value.notifyAsk, onChange: (next) => { set('notifyAsk', next); } }), _jsx(Toggle, { dataPart: "buddy-setting-notifyConfirm", label: buddyT('buddy.settings.notifyConfirm'), checked: value.notifyConfirm, onChange: (next) => { set('notifyConfirm', next); } }), _jsx(Toggle, { dataPart: "buddy-setting-sound", label: buddyT('buddy.settings.sound'), checked: value.sound, onChange: (next) => { set('sound', next); } }), _jsx("div", { className: "dsb-settings-group-label", children: buddyT('buddy.settings.outline') }), _jsxs("div", { className: "dsb-settings-field", children: [_jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.outlineWidth') }), _jsx(Segmented, { dataPart: "buddy-setting-outlineWidth", value: value.outlineWidth, onChange: (next) => { set('outlineWidth', next); }, options: WIDTH_PRESETS.map((p) => ({ value: p.value, label: buddyT(p.labelKey) })) })] }), _jsx(Toggle, { dataPart: "buddy-setting-showTimestamps", label: buddyT('buddy.settings.showTimestamps'), checked: value.showTimestamps, onChange: (next) => { set('showTimestamps', next); } }), _jsx("div", { className: "dsb-settings-group-label", children: buddyT('buddy.settings.view') }), _jsx(Toggle, { dataPart: "buddy-setting-collapseTools", label: buddyT('buddy.settings.collapseTools'), checked: value.collapseTools, onChange: (next) => { set('collapseTools', next); } }), _jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label dsb-settings-label-desc", children: buddyT('buddy.settings.collapseToolsDesc') }) }), _jsx(Toggle, { dataPart: "buddy-setting-foldThink", label: buddyT('buddy.settings.foldThink'), checked: value.foldThink, onChange: (next) => { set('foldThink', next); } }), _jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label dsb-settings-label-desc", children: buddyT('buddy.settings.foldThinkDesc') }) }), _jsx(Toggle, { dataPart: "buddy-setting-foldLongUser", label: buddyT('buddy.settings.foldLongUser'), checked: value.foldLongUser, onChange: (next) => { set('foldLongUser', next); } }), _jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label dsb-settings-label-desc", children: buddyT('buddy.settings.foldLongUserDesc') }) }), _jsx("div", { className: "dsb-settings-group-label", children: buddyT('buddy.settings.version') }), _jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.versionCurrent').replace('{version}', versionInfo?.current ?? '0.1.0') }) }), versionInfo?.latest !== undefined ? (_jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.versionLatest').replace('{version}', versionInfo.latest) }) })) : null, versionInfo !== undefined && versionInfo.latest !== undefined && versionInfo.updateAvailable === false ? (_jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.upToDate') }) })) : null, upgradeError !== undefined ? (_jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.upgradeFailed').replace('{error}', upgradeError) }) })) : null, upgradeDone ? (_jsx("div", { className: "dsb-settings-field", children: _jsx("span", { className: "dsb-settings-label", children: buddyT('buddy.settings.upgradeDone') }) })) : null, _jsxs("div", { className: "dsb-settings-field", children: [_jsx("button", { type: "button", className: "dsb-settings-seg-btn dsb-settings-seg-active", "data-dsh-part": "buddy-check-update", disabled: checking || upgrading, onClick: () => { void handleCheckUpdate(); }, children: checking ? buddyT('buddy.settings.checking') : buddyT('buddy.settings.checkUpdate') }), versionInfo?.updateAvailable === true && versionInfo.latest !== undefined ? (_jsx("button", { type: "button", className: "dsb-settings-seg-btn dsb-settings-seg-active", "data-dsh-part": "buddy-upgrade", disabled: checking || upgrading, onClick: () => { void handleUpgrade(); }, children: upgrading
                                    ? buddyT('buddy.settings.upgrading')
                                    : buddyT('buddy.settings.upgrade').replace('{version}', versionInfo.latest) })) : null] })] })) : null] }));
}
