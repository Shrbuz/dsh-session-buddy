/**
 * dsh-session-buddy version constant, shared by the host and browser halves.
 * The value is mirrored from `package.json#version` at build time. Keeping a
 * single exported constant lets the host route and the settings card agree on
 * "the currently running version" without importing package.json at runtime
 * (and without the bundler inlining a copy that can drift).
 * @module dsh-session-buddy/version
 */

/** The currently running plugin version (synced with package.json). */
export const LIB_VERSION = '0.1.1'
