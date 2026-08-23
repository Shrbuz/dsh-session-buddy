/**
 * dsh-session-buddy lightweight in-app upgrade — lets the settings card offer
 * "check for updates" + "upgrade" for THIS package only, without a full plugin
 * manager panel.
 *
 * Design (mirrors the official upgrade path used by @linxin666/dsh-client-ui-
 * plugin-manager, reduced to the single-package case):
 * - Check: read `https://registry.npmjs.org/<name>/latest` for the newest
 *   version; compare with the running LIB_VERSION. Fail-closed: any network /
 *   parse failure reads "unknown" and never blocks the card.
 * - Upgrade: spawn the official `dsh plugin --profile <name> add <pkg>@<ver>`
 *   CLI — the single writer for the profile (the npm web runtime has no
 *   in-process installer service). A bounded job table lets the browser poll
 *   progress instead of a long-blocking request.
 *
 * The CLI is spawned only for the upgrade action; the check is a plain fetch.
 * @module dsh-session-buddy/host/upgrade
 */
import { spawn } from 'node:child_process';
import { LIB_VERSION } from '../version.ts';
/** The npm package this plugin is published as (self-upgrade target). */
export declare const PACKAGE_NAME = "dsh-session-buddy";
/** Reject an install/update spec that could inject into the CLI argv. */
export declare function unsafeSpecReason(spec: string): string | undefined;
/** Parse a semver-ish string into comparable parts; undefined when malformed. */
export declare function parseVersion(value: string): {
    major: number;
    minor: number;
    patch: number;
} | undefined;
/** Compare two version strings; returns >0 when left is newer, <0 older, 0 equal. */
export declare function compareVersions(left: string, right: string): number | undefined;
/** The published `/latest` manifest shape we care about. */
export interface RegistryVersionManifest {
    version?: unknown;
    dsh?: unknown;
    engines?: unknown;
}
/** Fetch the latest published version + compat metadata. Fail-closed: returns
 * undefined on timeout / non-200 / malformed body / missing version. */
export declare function fetchLatestManifest(fetchImpl?: typeof fetch): Promise<RegistryVersionManifest | undefined>;
/** The state of one CLI-backed upgrade job. */
export interface UpgradeJob {
    id: string;
    targetVersion: string;
    phase: 'running' | 'done' | 'error';
    /** CLI stderr/stdout tail on failure. */
    error?: string;
}
/** A resolved launch target for the dsh CLI: either a direct executable, or a
 * node interpreter + script (Windows resolves the .cmd shim to avoid cmd.exe
 * quoting issues with spaced paths). */
export interface DshLaunch {
    command: string;
    argsPrefix: string[];
}
/** Locate the `dsh` CLI. Prefers an absolute path we can spawn directly;
 * falls back to a bare name (resolved via the OS). On Windows the .cmd shim is
 * later expanded through node + bin.js (see {@link resolveLaunch}). */
export declare function findDshBinary(env?: NodeJS.ProcessEnv): string | null;
/**
 * Resolve a launch command for the CLI. On Windows a `.cmd` shim is a batch
 * file: spawning it through a shell is unreliable (spaced paths, quoting), so
 * we resolve the node binary + the CLI's bin script and spawn those directly.
 * On POSIX the bare `dsh` (or the resolved path) is executed as-is.
 */
export declare function resolveLaunch(binary: string, platform?: NodeJS.Platform): DshLaunch;
/** Run the dsh CLI once, capturing stdout+stderr. Returns {code, output}. */
export declare function runDshCli(args: string[], timeoutMs?: number, spawnImpl?: typeof spawn, binary?: string | null): Promise<{
    code: number | null;
    output: string;
}>;
/** A minimal in-memory job table for in-flight upgrades (browser polls it). */
declare class UpgradeJobs {
    private jobs;
    private counter;
    start(targetVersion: string): UpgradeJob;
    settle(id: string, phase: 'done' | 'error', error?: string): void;
    get(id: string): UpgradeJob | undefined;
}
/** The shared job table for this process. */
export declare const upgradeJobs: UpgradeJobs;
/**
 * Start an in-place upgrade of THIS package to `targetVersion` via the official
 * CLI. Returns the job id for polling; the CLI runs detached (browser polls
 * `/status`). The profile name comes from the environment.
 */
export declare function startUpgrade(targetVersion: string): {
    jobId: string;
    error?: string;
};
export { LIB_VERSION };
//# sourceMappingURL=upgrade.d.ts.map