/**
 * dsh-session-buddy DOM layer — the single place that knows how to read the
 * official dsh conversation DOM. Selectors here are CONFIRMED by the CDP probe
 * (scripts/cdp-probe.mjs) against the real dsh web page on 2026-08-23:
 *
 * - `[data-chat-anchor-key]` — one row per routed conversation node.
 * - `[data-chat-flow-key]` — equals the anchor key (durable id).
 * - `[data-chat-flow-kind]` — the stable ROLE marker:
 *     `user`        → a real user question turn (right-aligned bubble) ✓
 *     `steering`    → an interrupting user question (also a user turn) ✓
 *     `context`     → injected context rows (NOT user turns) — exclude ✗
 *     `assistant-step` → an AI reply step
 *     `tool-call` / `turn-tail` / `model-retry` / `command` → not user turns
 * - `[data-conversation-scroll]` — the session scrollport.
 * - `[data-composer-seat]` — the composer seat.
 * - Session title: `button.wSkVaW_crumb.wSkVaW_crumbCurrent` in the page
 *   header (breadcrumb); hash-classed, so matched by role + position.
 *
 * All read helpers are defensive: an absent marker degrades to a safe default
 * instead of throwing.
 *
 * @module dsh-session-buddy/client/dom
 */
/** Official stable DOM markers (CDP-confirmed). */
export declare const SELECTORS: {
    /** The session scroll container. */
    readonly scrollport: "[data-conversation-scroll]";
    /** One row per routed message node. */
    readonly anchorRow: "[data-chat-anchor-key]";
    /** The composer seat. */
    readonly composerSeat: "[data-composer-seat]";
    /** Approval / confirmation dialog (role-based; needs CDP confirmation). */
    readonly dialog: "[role=\"dialog\"]";
    /** The session-title breadcrumb button in the header (hash-classed). */
    readonly titleCrumb: "button[class*=\"crumbCurrent\"], button[class*=\"crumb\"]";
};
/** One outline rung: the index anchor for a single user question turn. */
export interface OutlineRung {
    /** The `data-chat-anchor-key` value this rung scrolls to. */
    key: string;
    /** User question summary (first line, truncated). */
    summary: string;
    /** Approximate wall-clock time of the turn (for the tooltip). */
    time: number;
}
/** The scrollport of the current session, if present. */
export declare function findScrollport(root?: ParentNode): HTMLElement | null;
/** All anchor rows in document order (CDP-confirmed: order = chat order). */
export declare function findAnchorRows(root?: ParentNode): HTMLElement[];
/**
 * Is this anchor row a USER question turn? Uses the CDP-confirmed
 * `data-chat-flow-kind` marker: `user` and `steering` are real user turns;
 * everything else (context / assistant-step / tool-call / …) is not.
 */
export declare function isUserRow(row: HTMLElement): boolean;
/**
 * First non-empty text line of the element, normalized and truncated.
 * @param el - the element to summarize.
 * @param max - max chars.
 */
export declare function firstLineSummary(el: HTMLElement, max?: number): string;
/** Extract all outline rungs from the current session DOM. */
export declare function collectRungs(root?: ParentNode): OutlineRung[];
/**
 * Whether the agent is STILL generating. The harness swaps the composer's
 * primary button to a square "stop" icon — an SVG `<rect>` — while `running`,
 * and back to the send arrow (`<path>`) once the reply settles. That rect is
 * the authoritative, locale-free "not done yet" signal: it tracks the harness's
 * own running state, so a reply is never reported complete during a thinking
 * pause. `[data-streaming]` is kept as a belt-and-suspenders check for views
 * that expose it.
 */
export declare function isStreaming(root?: ParentNode): boolean;
/** Whether the composer seat is present (i.e. a session is open and editable). */
export declare function hasComposerSeat(root?: ParentNode): boolean;
/**
 * Whether an approval/confirmation dialog is currently open.
 * @todo CDP probe: confirm `[role="dialog"]` catches the approval panel; if
 * not, this selector is refined in this one file.
 */
export declare function hasOpenDialog(root?: ParentNode): boolean;
/** Locate the anchor row for a given anchor key (for scrollIntoView). */
export declare function anchorRowByKey(root: ParentNode, key: string): HTMLElement | null;
/**
 * Read the current session title from the header breadcrumb (CDP-confirmed:
 * `button[class*="crumbCurrent"]` inside the page header above the scrollport).
 * Falls back to `undefined` so the notification uses its default title.
 */
export declare function readSessionTitle(root?: ParentNode): string | undefined;
//# sourceMappingURL=dom.d.ts.map