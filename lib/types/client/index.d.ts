/**
 * dsh-session-buddy browser half — mounts the ladder outline + notification
 * logic as a global floating surface (host-global like the pet: it has no
 * session dimension of its own, it follows whatever session is open). It
 * reads its switches live from the `session-buddy` settings scope, drives
 * notifications from the official conversation DOM (session listener), and
 * renders the outline from the OFFICIAL sessions snapshot so it stays
 * complete even when dsh only renders the tail window.
 *
 * @module dsh-session-buddy/client
 */
import { type ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services (slots + settingsScope drive the settings card; sessions
 * feeds the ladder outline; the rest is pure DOM observation). */
export declare const inject: string[];
/**
 * Client plugin body: inject the styles, bind the settings scope, mount the
 * ladder outline (backed by the sessions snapshot), and start the session
 * listener that drives notifications.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map