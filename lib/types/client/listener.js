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
import { findScrollport, findAnchorRows, isUserRow, isStreaming, hasComposerSeat, hasOpenDialog, readSessionTitle, } from "./dom.js";
import { classifySnapshot, createClassifierState, } from "./events.js";
/** How long an assistant row must stay unchanged before it counts as settled. */
const SETTLED_GRACE_MS = 1_200;
/**
 * The session listener. Returns a dispose function that tears down the
 * observers. Call once per page lifetime.
 */
export function startSessionListener(options) {
    const state = createClassifierState();
    /** key → signature last observed for that anchor row. */
    let lastSignature = new Map();
    let disposed = false;
    /** Pending "re-check soon" timer so rows that STOPPED mutating (reply done)
     * still get re-evaluated as settled even with no further DOM mutation. */
    let settleTimer;
    /** A stable content signature for one row (text + height). */
    function signatureOf(row) {
        return (row.textContent ?? '') + '|' + row.getBoundingClientRect().height;
    }
    /** Rebuild a snapshot from the current DOM and classify it. */
    function rebuildAndClassify() {
        if (disposed)
            return;
        // Authoritative "still generating" signal: the harness swaps the composer's
        // primary button to a square "stop" icon while `running` and back to the
        // send arrow once the reply is rendered. Its absence is the "done" signal.
        const generating = isStreaming(document);
        const rows = findAnchorRows(document);
        const settled = new Set();
        const streaming = new Set();
        let latestReplySummary;
        let latestSettledKey;
        let latestUserKey;
        for (const row of rows) {
            const key = row.getAttribute('data-chat-anchor-key');
            if (key === null || key === '')
                continue;
            if (isUserRow(row)) {
                // Track the latest user message key as the per-turn boundary.
                latestUserKey = key;
                continue;
            }
            const sig = signatureOf(row);
            const prev = lastSignature.get(key);
            lastSignature.set(key, sig);
            // While anything is still streaming/thinking, no reply row counts as
            // complete — defer the settled edge until the stop button is gone.
            if (generating) {
                streaming.add(key);
                continue;
            }
            // Generation is done (stop button gone → the reply is rendered). A row
            // whose signature is stable is complete: settle IMMEDIATELY, without the
            // old 1.2s grace. That grace relied on a throttled setTimeout which, in
            // a hidden tab, fires late — by then the user has often switched back to
            // check, so the reply event fires while visible and the notification is
            // suppressed AND its dedupe slot consumed. The stop-button signal makes
            // the extra grace unnecessary (generation is authoritative).
            if (prev !== undefined && sig === prev) {
                settled.add(key);
                latestSettledKey = key;
                latestReplySummary = (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
                continue;
            }
            streaming.add(key);
        }
        const snapshot = {
            settledAssistantKeys: settled,
            streamingAssistantKeys: streaming,
            // "Waiting for input" = a composer is present and nothing is streaming
            // (and no step is still generating).
            waitingForInput: hasComposerSeat(document) && streaming.size === 0 && !generating,
            approvalPending: hasOpenDialog(document),
            latestReplySummary,
            latestSettledKey,
            latestUserKey,
            title: readSessionTitle(document),
            generating,
            hidden: document.hidden,
            pendingInteraction: options.readPendingInteraction?.(),
        };
        for (const event of classifySnapshot(state, snapshot)) {
            options.onEvent(event);
        }
        // Arm the settle re-check: the observer fires on DOM mutations, but the
        // stop-button→send swap that ends generation may happen without one in some
        // render paths. Poll once per grace window while a step is still
        // generating, so the flip to "done" is caught and rows settle immediately —
        // while the tab is still hidden. (Settling itself is now immediate: the
        // stop-button signal is authoritative, no throttled-timer grace needed.)
        if (generating)
            armSettleCheck();
    }
    /** Re-run classification after the grace window when there are unsettled rows. */
    function armSettleCheck() {
        if (settleTimer !== undefined || disposed)
            return;
        settleTimer = setTimeout(() => {
            settleTimer = undefined;
            rebuildAndClassify();
        }, SETTLED_GRACE_MS);
    }
    const onMutation = () => { rebuildAndClassify(); };
    const rootObserver = new MutationObserver(onMutation);
    rootObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-streaming'],
    });
    // Keep a scrollport-level observer so streaming text mutations inside the
    // transcript are caught even if they bypass subtree characterData cost.
    let scrollportObserver;
    function ensureScrollport() {
        scrollportObserver?.disconnect();
        scrollportObserver = undefined;
        const scrollport = findScrollport(document);
        if (scrollport === null)
            return;
        scrollportObserver = new MutationObserver(onMutation);
        scrollportObserver.observe(scrollport, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-streaming'],
        });
    }
    ensureScrollport();
    // Rebuild on tab visibility changes: switching away/back is NOT a DOM
    // mutation, so without this the `hidden` flag (and thus `hiddenDuringTurn`,
    // which decides whether a reply notification fires) would only be captured
    // when a mutation happened to coincide with the user being away — the source
    // of the intermittent missed notifications.
    const onVisibilityChange = () => { rebuildAndClassify(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Initial classification so the UI and notifications start consistent.
    queueMicrotask(rebuildAndClassify);
    return () => {
        disposed = true;
        if (settleTimer !== undefined) {
            clearTimeout(settleTimer);
            settleTimer = undefined;
        }
        rootObserver.disconnect();
        scrollportObserver?.disconnect();
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
}
