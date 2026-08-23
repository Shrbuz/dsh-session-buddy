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
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LIB_VERSION } from "../version.js";
/** The npm package this plugin is published as (self-upgrade target). */
export const PACKAGE_NAME = 'dsh-session-buddy';
/** Registry endpoint for the latest published version (with dsh/engines meta). */
const REGISTRY_LATEST = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
/** Registry fetch timeout; a slow/absent network must not block the card. */
const REGISTRY_TIMEOUT_MS = 5_000;
/** A single CLI run must finish within this window (npm install can be slow). */
const CLI_TIMEOUT_MS = 120_000;
/** The profile name to operate on. Read once from the environment (dsh sets
 * `DSH_PROFILE` for host plugins); falls back to `web`, the common web UI. */
function profileName() {
    return process.env.DSH_PROFILE ?? 'web';
}
/** A short, conservative package/version id allowed in a CLI spec. The spec is
 * interpolated into a `dsh plugin ... add <spec>` argv (no shell), but we still
 * reject shell metacharacters and anything that is not `name` / `name@version`. */
const SAFE_SPEC_RE = /^[A-Za-z0-9@./_~-]+$/;
/** Reject an install/update spec that could inject into the CLI argv. */
export function unsafeSpecReason(spec) {
    if (spec.length === 0 || spec.length > 200)
        return 'spec-too-long';
    if (!SAFE_SPEC_RE.test(spec))
        return 'spec-has-unsafe-chars';
    return undefined;
}
/** The installed versions we compare: `1.2.3` (plus optional prerelease). */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
/** Parse a semver-ish string into comparable parts; undefined when malformed. */
export function parseVersion(value) {
    const match = VERSION_RE.exec(value.trim().replace(/^v/, ''));
    if (match === null)
        return undefined;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
/** Compare two version strings; returns >0 when left is newer, <0 older, 0 equal. */
export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (a === undefined || b === undefined)
        return undefined;
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
/** Fetch the latest published version + compat metadata. Fail-closed: returns
 * undefined on timeout / non-200 / malformed body / missing version. */
export async function fetchLatestManifest(fetchImpl = fetch) {
    try {
        const response = await fetchImpl(REGISTRY_LATEST, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
        if (!response.ok)
            return undefined;
        const body = (await response.json());
        if (typeof body !== 'object' || body === null)
            return undefined;
        const manifest = body;
        if (typeof manifest.version !== 'string')
            return undefined;
        return manifest;
    }
    catch {
        return undefined;
    }
}
/** The npm-global bin directory for the current user, e.g.
 * `C:\Users\<user>\AppData\Roaming\npm` on Windows / `<prefix>/bin` on POSIX.
 * This is where `dsh`/`dsh.cmd` shims live when installed via npm globally.
 *
 * IMPORTANT: `npm_config_prefix` (set by `npm run`) ALREADY IS the full npm
 * global dir (`...\Roaming\npm`) — do NOT append `npm` to it. `APPDATA` is the
 * parent (`...\Roaming`), so only that one needs the `npm` suffix appended. */
function npmBinDir(env = process.env) {
    const prefix = env.npm_config_prefix;
    if (typeof prefix === 'string' && prefix.length > 0) {
        return prefix;
    }
    const appdata = env.APPDATA;
    if (typeof appdata === 'string' && appdata.length > 0) {
        return process.platform === 'win32'
            ? join(appdata, 'npm')
            : join(appdata, 'bin');
    }
    return '';
}
/** Locate the `dsh` CLI shim (or executable). Prefers the npm-global bin dir
 * (where a global `dsh` install actually puts `dsh.cmd` on Windows); falls
 * back to a bare name resolved by the OS. Returns an absolute path when
 * possible so {@link resolveLaunch} can expand it deterministically. */
export function findDshBinary(env = process.env) {
    const binDir = npmBinDir(env);
    const candidates = [];
    if (binDir !== '') {
        candidates.push(join(binDir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh'));
    }
    candidates.push(join(dirname(process.execPath), 'dsh'), join(dirname(process.execPath), 'dsh.cmd'), 'dsh');
    for (const candidate of candidates) {
        if ((candidate.includes('\\') || candidate.includes('/')) && existsSync(candidate))
            return candidate;
    }
    // Nothing found on disk — return the bare name and let resolveLaunch spawn it
    // (POSIX resolves via PATH; Windows fails fast with a clear error).
    return 'dsh';
}
/** The dsh CLI's bin script path, relative to the npm bin dir that holds the
 * `dsh.cmd` shim. Mirrors what the shim itself executes. */
function binScriptFor(binDir) {
    return join(binDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}
/**
 * Resolve a launch command for the CLI. On Windows a `.cmd` shim is a batch
 * file: spawning it through a shell is unreliable (spaced paths, quoting), so
 * we resolve the node binary + the CLI's bin script and spawn those directly.
 * On POSIX the bare `dsh` (or the resolved path) is executed as-is.
 */
export function resolveLaunch(binary, platform = process.platform) {
    if (platform === 'win32' && (binary === 'dsh' || binary.endsWith('.cmd'))) {
        // Resolve the .cmd shim → node + the CLI's real bin script.
        const binDir = binary.endsWith('.cmd')
            ? dirname(binary)
            : npmBinDir();
        const binScript = binDir !== '' ? binScriptFor(binDir) : '';
        if (binScript !== '' && existsSync(binScript)) {
            return { command: process.execPath, argsPrefix: [binScript] };
        }
        // Fall back to spawning the .cmd through cmd.exe (cmd handles the shim
        // quoting itself); still no user-injected shell — args pass as argv.
        return { command: binary, argsPrefix: [], shell: true };
    }
    return { command: binary, argsPrefix: [] };
}
/** Run the dsh CLI once, capturing stdout+stderr. Returns {code, output}. */
export function runDshCli(args, timeoutMs = CLI_TIMEOUT_MS, spawnImpl = spawn, binary = findDshBinary()) {
    return new Promise((resolve) => {
        if (binary === null) {
            resolve({ code: -1, output: 'dsh CLI not found' });
            return;
        }
        const launch = resolveLaunch(binary);
        const child = spawnImpl(launch.command, [...launch.argsPrefix, ...args], {
            env: process.env,
            windowsHide: true,
            // No shell by default: argv is passed directly, so there is no
            // quoting/injection surface. Node + bin.js (Windows) and the plain
            // executable (POSIX) both spawn without a shell. The .cmd fallback opts
            // into a shell because batch shims require cmd.exe.
            shell: launch.shell === true,
        });
        let output = '';
        child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
        child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
        const timer = setTimeout(() => { child.kill(); }, timeoutMs);
        child.on('error', (error) => {
            clearTimeout(timer);
            resolve({ code: -1, output: `failed to spawn dsh CLI: ${error.message}` });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, output });
        });
    });
}
/** A minimal in-memory job table for in-flight upgrades (browser polls it). */
class UpgradeJobs {
    jobs = new Map();
    counter = 0;
    start(targetVersion) {
        const id = `upgrade-${++this.counter}`;
        const job = { id, targetVersion, phase: 'running' };
        this.jobs.set(id, job);
        return job;
    }
    settle(id, phase, error) {
        const job = this.jobs.get(id);
        if (job === undefined)
            return;
        job.phase = phase;
        if (error !== undefined)
            job.error = error;
    }
    get(id) {
        const job = this.jobs.get(id);
        return job === undefined ? undefined : { ...job };
    }
}
/** The shared job table for this process. */
export const upgradeJobs = new UpgradeJobs();
/**
 * Start an in-place upgrade of THIS package to `targetVersion` via the official
 * CLI. Returns the job id for polling; the CLI runs detached (browser polls
 * `/status`). The profile name comes from the environment.
 */
export function startUpgrade(targetVersion) {
    const spec = `${PACKAGE_NAME}@${targetVersion}`;
    const unsafe = unsafeSpecReason(spec);
    if (unsafe !== undefined)
        return { jobId: '', error: `invalid upgrade spec: ${unsafe}` };
    const job = upgradeJobs.start(targetVersion);
    void runDshCli([
        'plugin',
        '--profile',
        profileName(),
        'add',
        spec,
    ]).then(({ code, output }) => {
        if (code === 0)
            upgradeJobs.settle(job.id, 'done');
        else
            upgradeJobs.settle(job.id, 'error', output.trim() || `dsh plugin add exited with code ${String(code)}`);
    });
    return { jobId: job.id };
}
export { LIB_VERSION };
