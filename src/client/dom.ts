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
export const SELECTORS = {
  /** The session scroll container. */
  scrollport: '[data-conversation-scroll]',
  /** One row per routed message node. */
  anchorRow: '[data-chat-anchor-key]',
  /** The composer seat. */
  composerSeat: '[data-composer-seat]',
  /** Approval / confirmation dialog (role-based; needs CDP confirmation). */
  dialog: '[role="dialog"]',
  /** The session-title breadcrumb button in the header (hash-classed). */
  titleCrumb: 'button[class*="crumbCurrent"], button[class*="crumb"]',
} as const

/** `data-chat-flow-kind` values that ARE user question turns. */
const USER_KINDS = new Set(['user', 'steering'])

/** One outline rung: the index anchor for a single user question turn. */
export interface OutlineRung {
  /** The `data-chat-anchor-key` value this rung scrolls to. */
  key: string
  /** User question summary (first line, truncated). */
  summary: string
  /** Approximate wall-clock time of the turn (for the tooltip). */
  time: number
}

/** The scrollport of the current session, if present. */
export function findScrollport(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SELECTORS.scrollport)
}

/** All anchor rows in document order (CDP-confirmed: order = chat order). */
export function findAnchorRows(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTORS.anchorRow)]
}

/**
 * Is this anchor row a USER question turn? Uses the CDP-confirmed
 * `data-chat-flow-kind` marker: `user` and `steering` are real user turns;
 * everything else (context / assistant-step / tool-call / …) is not.
 */
export function isUserRow(row: HTMLElement): boolean {
  const kind = row.getAttribute('data-chat-flow-kind')
  return kind !== null && USER_KINDS.has(kind)
}

/**
 * First non-empty text line of the element, normalized and truncated.
 * @param el - the element to summarize.
 * @param max - max chars.
 */
export function firstLineSummary(el: HTMLElement, max = 60): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text === '') return ''
  const first = text.split(/[。！？.!?；;\n]/, 1)[0] ?? text
  const line = first.trim()
  return line.length > max ? line.slice(0, max) + '…' : line
}

/** Extract all outline rungs from the current session DOM. */
export function collectRungs(root: ParentNode = document): OutlineRung[] {
  const rungs: OutlineRung[] = []
  for (const row of findAnchorRows(root)) {
    if (!isUserRow(row)) continue
    const key = row.getAttribute('data-chat-anchor-key')
    if (key === null || key === '') continue
    const summary = firstLineSummary(row)
    if (summary === '') continue
    rungs.push({ key, summary, time: Date.now() })
  }
  return rungs
}

/**
 * Whether the agent is STILL generating. The harness swaps the composer's
 * primary button to a square "stop" icon — an SVG `<rect>` — while `running`,
 * and back to the send arrow (`<path>`) once the reply settles. That rect is
 * the authoritative, locale-free "not done yet" signal: it tracks the harness's
 * own running state, so a reply is never reported complete during a thinking
 * pause. `[data-streaming]` is kept as a belt-and-suspenders check for views
 * that expose it.
 */
export function isStreaming(root: ParentNode = document): boolean {
  if (root.querySelector('[data-composer-seat] button[class*="primary"] svg rect') !== null) return true
  return root.querySelector('[data-streaming]') !== null
}

/** Whether the composer seat is present (i.e. a session is open and editable). */
export function hasComposerSeat(root: ParentNode = document): boolean {
  return root.querySelector(SELECTORS.composerSeat) !== null
}

/**
 * Whether an approval/confirmation dialog is currently open.
 * @todo CDP probe: confirm `[role="dialog"]` catches the approval panel; if
 * not, this selector is refined in this one file.
 */
export function hasOpenDialog(root: ParentNode = document): boolean {
  return root.querySelector(SELECTORS.dialog) !== null
}

/** Locate the anchor row for a given anchor key (for scrollIntoView). */
export function anchorRowByKey(root: ParentNode, key: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
}

/**
 * Read the current session title from the header breadcrumb (CDP-confirmed:
 * `button[class*="crumbCurrent"]` inside the page header above the scrollport).
 * Falls back to `undefined` so the notification uses its default title.
 */
export function readSessionTitle(root: ParentNode = document): string | undefined {
  const buttons = root.querySelectorAll<HTMLElement>(SELECTORS.titleCrumb)
  // Prefer the "current" crumb; fall back to the last crumb button.
  const current = [...buttons].find((b) => (b.className ?? '').toString().includes('crumbCurrent'))
  const crumb = current ?? [...buttons].at(-1)
  if (crumb === undefined) return undefined
  const text = crumb.textContent?.trim()
  return text !== undefined && text !== '' ? text : undefined
}
