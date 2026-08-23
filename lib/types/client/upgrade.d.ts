/**
 * dsh-session-buddy browser half — version check + in-app upgrade wiring for
 * the settings card. Talks to the host's loopback routes:
 *   GET  /api/session-buddy/toast/version        → current/latest
 *   POST /api/session-buddy/toast/update         → start upgrade, get jobId
 *   GET  /api/session-buddy/toast/update/status  → poll job state
 * All calls fail-closed: a fetch/parse failure surfaces as "unknown / failed"
 * in the card and never throws into the settings UI.
 * @module dsh-session-buddy/client/upgrade
 */
/** The version-check response the host serves. */
export interface VersionResponse {
    ok: boolean;
    name?: string;
    current?: string;
    latest?: string;
    updateAvailable?: boolean;
}
/** The upgrade-start response the host serves. */
export interface StartUpgradeResponse {
    ok: boolean;
    jobId?: string;
    error?: string;
}
/** One upgrade job's polled state. */
export interface UpgradeJobState {
    id: string;
    targetVersion: string;
    phase: 'running' | 'done' | 'error';
    error?: string;
}
/** The status-response the host serves. */
export interface StatusResponse {
    ok: boolean;
    job?: UpgradeJobState;
    error?: string;
}
/** Check the current/latest version through the host. Never throws. */
export declare function checkVersion(): Promise<VersionResponse | undefined>;
/** Start an upgrade to `version`. Returns the job id, or undefined on failure. */
export declare function startUpgrade(version: string): Promise<string | undefined>;
/** Poll one upgrade job until it settles or `timeoutMs` elapses. Never throws. */
export declare function pollUpgrade(jobId: string, timeoutMs?: number): Promise<UpgradeJobState | undefined>;
//# sourceMappingURL=upgrade.d.ts.map