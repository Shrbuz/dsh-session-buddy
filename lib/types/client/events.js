/**
 * dsh-session-buddy session event model — a pure, unit-testable classifier
 * that turns observed DOM facts into the three trigger events the notification
 * logic consumes. The classifier itself never touches the DOM: callers feed it
 * a snapshot (collected by the DOM layer), which keeps the model testable and
 * lets the CDP-refined DOM signals drop in without touching this file.
 *
 * @module dsh-session-buddy/client/events
 */
/** Create the initial classifier state. */
export function createClassifierState() {
    return { notifiedKinds: new Set(), hiddenDuringTurn: false };
}
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
export function classifySnapshot(state, snapshot) {
    const events = [];
    // Track whether the user was away at ANY point since the current user
    // message. The reply notification fires when this is true even if the settle
    // instant lands on a brief visible check (the user periodically switches
    // back to look), so the "stepped away during the reply" case is never lost.
    const hiddenNow = snapshot.hidden === true;
    if (state.last === undefined) {
        state.hiddenDuringTurn = hiddenNow;
    }
    else if (snapshot.latestUserKey !== state.last.latestUserKey) {
        state.hiddenDuringTurn = hiddenNow;
    }
    else {
        state.hiddenDuringTurn = state.hiddenDuringTurn || hiddenNow;
    }
    // 1. Reply-complete: a turn newly entered the settled set.
    const newSettled = [];
    for (const key of snapshot.settledAssistantKeys) {
        if (state.last !== undefined && !state.last.settledAssistantKeys.has(key)) {
            newSettled.push(key);
        }
    }
    // First observation (no last) with existing settled turns: consume whatever
    // is already present so we NEVER notify on mount (the user is looking at the
    // page), and anchor reply/ask dedup to the current turn so the in-progress
    // reply (already shown) or a current input-wait doesn't re-fire when a
    // sibling row settles or the input-wait oscillates shortly after.
    if (state.last === undefined) {
        for (const key of snapshot.settledAssistantKeys)
            state.notifiedKinds.add('reply');
        if (snapshot.pendingInteraction === 'question')
            state.notifiedKinds.add('ask');
        if (snapshot.approvalPending || snapshot.pendingInteraction === 'approval')
            state.notifiedKinds.add('confirm');
        state.lastReplyUserKey = snapshot.latestUserKey;
        state.lastAskUserKey = snapshot.latestUserKey;
    }
    // At most one reply notification per user turn: the content row and the
    // meta/status row of one turn settle as separate keys, but they belong to the
    // same turn (same latestUserKey), so only the first should beep. A new user
    // message (new latestUserKey) re-arms the next reply. While a step is still
    // generating it is NOT yet rendered, so no reply is emitted (the listener
    // already keeps settled rows out while `generating`, but guard defensively).
    if (!snapshot.generating) {
        for (const key of newSettled) {
            if (key === snapshot.latestSettledKey && state.lastReplyUserKey !== snapshot.latestUserKey) {
                events.push({
                    kind: 'reply',
                    summary: snapshot.latestReplySummary ?? '',
                    title: snapshot.title,
                    anchorKey: key,
                    wasHidden: state.hiddenDuringTurn,
                });
                state.lastReplyUserKey = snapshot.latestUserKey;
            }
            state.notifiedKinds.add('reply');
        }
    }
    // 2. Ask-needed: fires ONLY when the AI explicitly asks a question (the
    // harness marks the session `pendingInteraction === 'question'` for the
    // ask-user tool). A plain finished reply is covered by `reply` and must NOT
    // also fire "need your answer" — that would notify after every reply.
    const questionPending = snapshot.pendingInteraction === 'question';
    if (questionPending && !state.notifiedKinds.has('ask') && state.lastAskUserKey !== snapshot.latestUserKey) {
        events.push({ kind: 'ask', summary: '', title: snapshot.title });
        state.notifiedKinds.add('ask');
        state.lastAskUserKey = snapshot.latestUserKey;
    }
    if (!questionPending)
        state.notifiedKinds.delete('ask');
    // 3. Confirm-needed: command approval pending (approval dialog OR the
    // harness's 'approval' interaction marker), at most once per episode.
    const approvalPending = snapshot.approvalPending || snapshot.pendingInteraction === 'approval';
    if (approvalPending && !state.notifiedKinds.has('confirm')) {
        events.push({ kind: 'confirm', summary: '', title: snapshot.title });
        state.notifiedKinds.add('confirm');
    }
    if (!approvalPending)
        state.notifiedKinds.delete('confirm');
    state.last = snapshot;
    return events;
}
