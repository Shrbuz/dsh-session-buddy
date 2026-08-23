/**
 * dsh-session-buddy session listener — wires the pure event classifier to the
 * live dsh DOM with a MutationObserver. It watches the session scrollport
 * (`[data-conversation-scroll]`) plus the document root for structural
 * changes, rebuilds a snapshot via the DOM layer, and forwards classified
 * events to a callback. All event decisions live in events.ts (pure); this
 * file is only transport + stability detection + debounce.
 *
 * @module dsh-session-buddy/client/listener
 */
import { type SessionEvent } from './events.ts';
/** Options for the session listener. */
export interface SessionListenerOptions {
    /** Receive every classified event. */
    onEvent: (event: SessionEvent) => void;
    /** Optional live reader of the harness's pending-interaction marker for the
     * current session (`'approval' | 'plan-review' | 'question'`), provided by
     * the owner from the sessions service. Drives the ask/confirm triggers. */
    readPendingInteraction?: () => 'approval' | 'plan-review' | 'question' | undefined;
}
/**
 * The session listener. Returns a dispose function that tears down the
 * observers. Call once per page lifetime.
 */
export declare function startSessionListener(options: SessionListenerOptions): () => void;
//# sourceMappingURL=listener.d.ts.map