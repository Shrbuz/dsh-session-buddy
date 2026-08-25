/**
 * dsh-session-buddy conversation folding — after each assistant turn finishes,
 * the tool calls that turn executed (Pwsh / Read / Write / Grep / Edit / …)
 * are folded into a single "共执行 X 步操作" row, and the turn's repeated
 * think blocks — plus any context-injection rows interleaved between them —
 * are folded into a single "共 N 次思考" row, so the closing summary is
 * directly visible. Click a row to expand the details again.
 *
 * It works purely on the OFFICIAL stable DOM markers (confirmed against the
 * real dsh web page, see `dom.ts`):
 *
 * - every routed conversation node is a `[data-chat-anchor-key]` row carrying
 *   a `data-chat-flow-kind` role marker;
 * - `tool-call` rows are one root tool call each (recursive subcalls live
 *   inside that card), so counting rows == counting steps;
 * - `assistant-step` rows render the assistant's message blocks; each
 *   `reasoning` block becomes a `[data-variant="think"]` ReasoningRow inside
 *   that row (itself already a one-line collapsible summary);
 * - `context` rows are the harness's injected "context injection" rows, which
 *   can interleave between think blocks; they carry NO turn number in their
 *   key, so they fold into whichever turn's window they fall inside;
 * - `turn-tail` rows mark a completed turn — the engine publishes the tail
 *   only after `turn/end`, so a visible tail means that turn is finished and
 *   its tool cards / think blocks are stable (safe to fold);
 * - a turn-tail row's `data-chat-anchor-key` is `9:turn-tail<turn>` (the
 *   context-key encoding `${kind.length}:${kind}${id}`), which yields the
 *   stable turn number used for per-session expand/collapse memory.
 *
 * Grouping + counting are pure functions (unit-tested in smoke-host.mjs); the
 * DOM side is defensive and silently degrades if a marker is absent.
 *
 * @module dsh-session-buddy/client/collapse-tools
 */
/** The `data-chat-flow-kind` value of a tool-call row. */
export declare const TOOL_CALL_KIND = "tool-call";
/** The `data-chat-flow-kind` value of a completed-turn tail row. */
export declare const TURN_TAIL_KIND = "turn-tail";
/** The `data-chat-flow-kind` value of a context-injection row. */
export declare const CONTEXT_KIND = "context";
/** The `data-chat-flow-kind` value of a user question row. */
export declare const USER_KIND = "user";
/** Prefix of the turn-tail row's `data-chat-anchor-key` (`9:turn-tail`). */
export declare const TURN_TAIL_KEY_PREFIX = "9:turn-tail";
/** Default number of lines an over-long user question is clamped to. */
export declare const USER_MAX_LINES = 6;
/** One raw conversation row as read off the DOM (pure grouping input). */
export interface FlowRowSpec {
    /** The row's `data-chat-anchor-key` value (durable id). */
    key: string;
    /** The row's `data-chat-flow-kind` role marker. */
    kind: string;
}
/** One grouped turn: its stable turn number + how many tool calls it ran. */
export interface ToolRunGroup {
    /** Stable turn number (from the closing `turn-tail` row's key). */
    turn: number;
    /** Number of root tool-call rows in this turn. */
    steps: number;
    /** Document-order indexes (into the input rows array) of this turn's tool rows. */
    toolRowIndexes: number[];
}
/**
 * Parse the stable turn number out of a `turn-tail` row's anchor key
 * (`9:turn-tail<turn>` → `<turn>`). Returns null when the key is not a
 * turn-tail key (e.g. a `9:tool-call<callId>` row).
 * @param key - the row's `data-chat-anchor-key` value.
 * @returns the turn number, or null when the key has no turn number.
 */
export declare function parseTurnFromKey(key: string): number | null;
/**
 * Group a document-ordered list of conversation rows by turn, counting the
 * tool calls each FINISHED turn executed. A turn is delimited by its closing
 * `turn-tail` row: every `tool-call` row since the previous tail (or the
 * beginning) belongs to the turn that tail closes. Tool rows after the last
 * tail belong to a still-running turn and are NOT folded (its tail has not
 * been published, so the turn is not finished).
 * @param rows - conversation rows in document (chat) order.
 * @returns one group per completed turn that contains at least one tool call.
 */
export declare function groupToolRuns(rows: readonly FlowRowSpec[]): ToolRunGroup[];
/** One conversation row enriched with think/context info (pure grouping input). */
export interface ThinkRowSpec {
    /** The row's `data-chat-anchor-key` value (durable id). */
    key: string;
    /** The row's `data-chat-flow-kind` role marker. */
    kind: string;
    /** Number of `[data-variant="think"]` blocks this row renders (assistant-step rows). */
    thinkCount: number;
    /** Whether this row is a context-injection row (`data-chat-flow-kind="context"`). */
    isContext: boolean;
}
/** One grouped turn's think run: its stable turn number + how many thinks. */
export interface ThinkRunGroup {
    /** Stable turn number (from the closing `turn-tail` row's key). */
    turn: number;
    /** Total number of think blocks rendered in this turn. */
    thinks: number;
    /** Document-order indexes (into the input rows array) of ALL assistant-step rows in this turn — think rows AND pure-text "小结" rows. */
    stepIndexes: number[];
    /** Index of the turn's LAST assistant-step row (the final summary). Its whole row stays visible; only its think blocks fold. Null when the turn has no assistant-step row. */
    finalStepIndex: number | null;
    /** Document-order indexes of the context-injection rows folded with them. */
    contextIndexes: number[];
}
/**
 * Group a document-ordered list of conversation rows by turn, counting the
 * think blocks each FINISHED turn rendered and collecting the context-injection
 * rows that fell inside that turn's window (those rows carry no turn number of
 * their own, so they fold into whichever turn's window they fall inside). A
 * turn is delimited by its closing `turn-tail` row. Every assistant-step row is
 * tracked: the repeated think/summary rows that make up a turn's working
 * transcript are all foldable EXCEPT the very last one — that is the turn's
 * final summary, which stays visible (its think blocks still fold). A turn is
 * only folded when it contains at least TWO thinks — a single think stays as-is.
 * @param rows - conversation rows in document (chat) order.
 * @returns one group per completed turn that rendered ≥ 2 think blocks.
 */
export declare function groupThinkRuns(rows: readonly ThinkRowSpec[]): ThinkRunGroup[];
/** Options for the collapse manager. */
export interface CollapseToolsOptions {
    /** Read the current "collapse tool runs" setting (live). */
    isEnabled: () => boolean;
    /** Read the current "fold think blocks" setting (live). */
    isThinkEnabled: () => boolean;
    /** Read the current "fold long user questions" setting (live). */
    isLongUserEnabled: () => boolean;
    /** Resolve translation keys (locale-aware copy). */
    t: (key: string, params?: Record<string, unknown>) => string;
    /** Current session id (per-session expand/collapse memory). */
    currentSessionId: () => string | undefined;
}
/**
 * Start the folding manager. Watches the conversation DOM, folds each completed
 * turn's tool cards into a clickable count bar and its think blocks (plus
 * interleaved context-injection rows) into another, and restores everything
 * when a setting is off or the DOM shape is unrecognizable. Returns a disposer
 * that restores everything (bars removed, inline styles cleared).
 * @param options - live settings + translation + session id providers.
 * @returns a dispose function.
 */
export declare function startCollapseTools(options: CollapseToolsOptions): () => void;
//# sourceMappingURL=collapse-tools.d.ts.map