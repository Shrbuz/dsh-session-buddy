/**
 * dsh-session-buddy session event model — a pure, unit-testable classifier
 * that turns observed DOM facts into the three trigger events the notification
 * logic consumes. The classifier itself never touches the DOM: callers feed it
 * a snapshot (collected by the DOM layer), which keeps the model testable and
 * lets the CDP-refined DOM signals drop in without touching this file.
 *
 * @module dsh-session-buddy/client/events
 */
/** The three notification trigger kinds (mirror the settings switches). */
export type TriggerKind = 'reply' | 'ask' | 'confirm';
/** One observed event emitted by the classifier. */
export interface SessionEvent {
    kind: TriggerKind;
    /** Short human summary for the notification body. */
    summary: string;
    /** Session title for the notification title (falls back to default). */
    title?: string;
    /** Optional anchor key to scroll back to when the notification is clicked. */
    anchorKey?: string;
    /** For `reply`: whether the tab was hidden at any point during this turn —
     * the user stepped away during the reply, so the notification should fire
     * even if the settle instant lands on a brief visible check. */
    wasHidden?: boolean;
}
/** DOM facts the classifier needs (produced by the DOM layer). */
export interface SessionSnapshot {
    /** Anchor keys that are fully settled assistant turns (no longer streaming). */
    settledAssistantKeys: ReadonlySet<string>;
    /** Anchor keys that are still streaming / unstable. */
    streamingAssistantKeys: ReadonlySet<string>;
    /** Whether the session is waiting for user input (composer idle + prompt visible). */
    waitingForInput: boolean;
    /** Whether an approval/confirmation dialog is open. */
    approvalPending: boolean;
    /** Latest reply summary (for the notification body). */
    latestReplySummary?: string;
    /** Latest anchor key that completed. */
    latestSettledKey?: string;
    /** Latest USER message anchor key — used as the per-turn boundary so a single
     * reply fires at most one notification (one user turn = one reply). */
    latestUserKey?: string;
    /** Whether any assistant step is still generating. While true the reply is
     * not yet rendered on the page, so the reply trigger must NOT fire. */
    generating: boolean;
    /** Harness's own pending-interaction marker for the current session:
     * `'question'` = the AI explicitly asked you something (ask-user tool),
     * `'approval'` = a command approval is pending, `'plan-review'` = plan
     * review. Undefined when nothing is blocking. */
    pendingInteraction?: 'approval' | 'plan-review' | 'question';
    /** Whether the browser tab is hidden right now. */
    hidden: boolean;
    /** Session title, if known. */
    title?: string;
}
/** State the classifier keeps between snapshots (debounce bookkeeping). */
export interface ClassifierState {
    /** Trigger kinds already notified for a given turn (dedupe). */
    notifiedKinds: Set<TriggerKind>;
    /** User-message key after which the last reply notification fired. A reply
     * fires again only once the user sends a NEW message (key changes), so the
     * content + meta/status rows of one turn don't each beep. */
    lastReplyUserKey?: string;
    /** User-message key after which the last ask notification fired. `waitingForInput`
     * can oscillate while a residual row streams, so without this the "need your
     * answer" notification re-fires on each oscillation. */
    lastAskUserKey?: string;
    /** Whether the tab was hidden at ANY snapshot since the current user message.
     * The reply notification fires when this is true even if the settle instant
     * happens while the user is (briefly) visible — they were away during the
     * reply, so they still want the toast. */
    hiddenDuringTurn: boolean;
    /** Last snapshot seen, for edge detection. */
    last?: SessionSnapshot;
}
/** Create the initial classifier state. */
export declare function createClassifierState(): ClassifierState;
/**
 * Classify a fresh snapshot into events. Pure: same input → same output for a
 * given state. Events are only emitted on a rising edge (a new settled turn,
 * input-wait turning on, approval appearing), and each trigger kind fires at
 * most once per settled turn.
 *
 * @param state - mutable classifier state (dedupe + edge tracking).
 * @param snapshot - the current DOM facts.
 * @returns events to act on (usually 0 or 1).
 */
export declare function classifySnapshot(state: ClassifierState, snapshot: SessionSnapshot): SessionEvent[];
//# sourceMappingURL=events.d.ts.map