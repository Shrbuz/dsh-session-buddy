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
export const TOOL_CALL_KIND = 'tool-call'
/** The `data-chat-flow-kind` value of a completed-turn tail row. */
export const TURN_TAIL_KIND = 'turn-tail'
/** The `data-chat-flow-kind` value of a context-injection row. */
export const CONTEXT_KIND = 'context'
/** The `data-chat-flow-kind` value of a user question row. */
export const USER_KIND = 'user'
/** Prefix of the turn-tail row's `data-chat-anchor-key` (`9:turn-tail`). */
export const TURN_TAIL_KEY_PREFIX = '9:turn-tail'
/** Default number of lines an over-long user question is clamped to. */
export const USER_MAX_LINES = 6

/** One raw conversation row as read off the DOM (pure grouping input). */
export interface FlowRowSpec {
  /** The row's `data-chat-anchor-key` value (durable id). */
  key: string
  /** The row's `data-chat-flow-kind` role marker. */
  kind: string
}

/** One grouped turn: its stable turn number + how many tool calls it ran. */
export interface ToolRunGroup {
  /** Stable turn number (from the closing `turn-tail` row's key). */
  turn: number
  /** Number of root tool-call rows in this turn. */
  steps: number
  /** Document-order indexes (into the input rows array) of this turn's tool rows. */
  toolRowIndexes: number[]
}

/**
 * Parse the stable turn number out of a `turn-tail` row's anchor key
 * (`9:turn-tail<turn>` → `<turn>`). Returns null when the key is not a
 * turn-tail key (e.g. a `9:tool-call<callId>` row).
 * @param key - the row's `data-chat-anchor-key` value.
 * @returns the turn number, or null when the key has no turn number.
 */
export function parseTurnFromKey(key: string): number | null {
  if (typeof key !== 'string' || !key.startsWith(TURN_TAIL_KEY_PREFIX)) return null
  const turn = Number(key.slice(TURN_TAIL_KEY_PREFIX.length))
  return Number.isFinite(turn) && turn >= 1 ? turn : null
}

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
export function groupToolRuns(rows: readonly FlowRowSpec[]): ToolRunGroup[] {
  const groups: ToolRunGroup[] = []
  // Indexes of tool rows accumulated since the last turn-tail row.
  const pendingTools: number[] = []
  rows.forEach((row, index) => {
    if (row.kind === TURN_TAIL_KIND) {
      const turn = parseTurnFromKey(row.key)
      if (turn !== null && pendingTools.length > 0) {
        groups.push({ turn, steps: pendingTools.length, toolRowIndexes: pendingTools.slice() })
      }
      // An unparsable tail key still closes the current accumulation window.
      pendingTools.length = 0
    } else if (row.kind === TOOL_CALL_KIND) {
      pendingTools.push(index)
    }
  })
  return groups
}

/** One conversation row enriched with think/context info (pure grouping input). */
export interface ThinkRowSpec {
  /** The row's `data-chat-anchor-key` value (durable id). */
  key: string
  /** The row's `data-chat-flow-kind` role marker. */
  kind: string
  /** Number of `[data-variant="think"]` blocks this row renders (assistant-step rows). */
  thinkCount: number
  /** Whether this row is a context-injection row (`data-chat-flow-kind="context"`). */
  isContext: boolean
}

/** One grouped turn's think run: its stable turn number + how many thinks. */
export interface ThinkRunGroup {
  /** Stable turn number (from the closing `turn-tail` row's key). */
  turn: number
  /** Total number of think blocks rendered in this turn. */
  thinks: number
  /** Document-order indexes (into the input rows array) of ALL assistant-step rows in this turn — think rows AND pure-text "小结" rows. */
  stepIndexes: number[]
  /** Index of the turn's LAST assistant-step row (the final summary). Its whole row stays visible; only its think blocks fold. Null when the turn has no assistant-step row. */
  finalStepIndex: number | null
  /** Document-order indexes of the context-injection rows folded with them. */
  contextIndexes: number[]
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
export function groupThinkRuns(rows: readonly ThinkRowSpec[]): ThinkRunGroup[] {
  const groups: ThinkRunGroup[] = []
  // Rows accumulated since the last turn-tail row.
  let pendingSteps: number[] = []
  let pendingContexts: number[] = []
  let pendingThinks = 0
  rows.forEach((row, index) => {
    if (row.kind === TURN_TAIL_KIND) {
      const turn = parseTurnFromKey(row.key)
      if (turn !== null && pendingThinks >= 2) {
        groups.push({
          turn,
          thinks: pendingThinks,
          stepIndexes: pendingSteps.slice(),
          finalStepIndex: pendingSteps.length > 0 ? pendingSteps[pendingSteps.length - 1] : null,
          contextIndexes: pendingContexts.slice(),
        })
      }
      // An unparsable tail key still closes the current accumulation window.
      pendingSteps = []
      pendingContexts = []
      pendingThinks = 0
    } else if (row.isContext) {
      pendingContexts.push(index)
    } else if (row.kind === 'assistant-step') {
      pendingSteps.push(index)
      pendingThinks += row.thinkCount
    }
  })
  return groups
}

/** Which folding surface a bar represents (copy differs per surface). */
type CollapseBarVariant = 'tools' | 'think'

/** The bar element inserted at the head of a folded turn's tool cards / think blocks. */
function createBar(
  t: (key: string, params?: Record<string, unknown>) => string,
  turn: number,
  count: number,
  expanded: boolean,
  variant: CollapseBarVariant,
): HTMLButtonElement {
  const isThink = variant === 'think'
  const bar = document.createElement('button')
  bar.type = 'button'
  bar.className = isThink ? 'dsb-collapse-bar dsb-collapse-bar-think' : 'dsb-collapse-bar'
  if (isThink) {
    bar.dataset.dsbThinkBar = '1'
  } else {
    bar.dataset.dsbCollapseBar = '1'
  }
  bar.dataset.dsbTurn = String(turn)
  bar.setAttribute('aria-expanded', String(expanded))
  const showKey = isThink ? 'buddy.think.show' : 'buddy.collapse.show'
  const hideKey = isThink ? 'buddy.think.hide' : 'buddy.collapse.hide'
  bar.setAttribute('aria-label', t(expanded ? hideKey : showKey, { n: count }))
  const text = document.createElement('span')
  text.className = 'dsb-collapse-text'
  text.textContent = t(isThink ? 'buddy.think.count' : 'buddy.collapse.steps', { n: count })
  const chevron = document.createElement('span')
  chevron.className = 'dsb-collapse-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  bar.append(text, chevron)
  return bar
}

/** The "expand/collapse" bar appended below an over-long user question. */
function createUserBar(
  t: (key: string, params?: Record<string, unknown>) => string,
  expanded: boolean,
): HTMLButtonElement {
  const bar = document.createElement('button')
  bar.type = 'button'
  bar.className = 'dsb-collapse-bar dsb-user-bar'
  bar.dataset.dsbUserBar = '1'
  bar.setAttribute('aria-expanded', String(expanded))
  bar.setAttribute('aria-label', t(expanded ? 'buddy.user.collapse' : 'buddy.user.expand'))
  const text = document.createElement('span')
  text.className = 'dsb-collapse-text'
  text.textContent = t(expanded ? 'buddy.user.collapse' : 'buddy.user.expand')
  const chevron = document.createElement('span')
  chevron.className = 'dsb-collapse-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  bar.append(text, chevron)
  return bar
}

/** Options for the collapse manager. */
export interface CollapseToolsOptions {
  /** Read the current "collapse tool runs" setting (live). */
  isEnabled: () => boolean
  /** Read the current "fold think blocks" setting (live). */
  isThinkEnabled: () => boolean
  /** Read the current "fold long user questions" setting (live). */
  isLongUserEnabled: () => boolean
  /** Resolve translation keys (locale-aware copy). */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Current session id (per-session expand/collapse memory). */
  currentSessionId: () => string | undefined
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
export function startCollapseTools(options: CollapseToolsOptions): () => void {
  const { isEnabled, isThinkEnabled, isLongUserEnabled, t, currentSessionId } = options
  /** Expanded turns per session (`session#turn` → tool run, `session#turn:think` → think run, `session#user:<key>` → user question). */
  const expanded = new Set<string>()

  /** Remove every bar, every inline `display:none`, and every clamp we own. */
  const restoreAll = (): void => {
    for (const bar of [...document.querySelectorAll<HTMLElement>('[data-dsb-collapse-bar], [data-dsb-think-bar], [data-dsb-user-bar]')]) {
      bar.remove()
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key], [data-variant="think"]')) {
      if (el.style.display === 'none') el.style.display = ''
    }
    for (const el of document.querySelectorAll<HTMLElement>('[class*="_text_"]')) {
      el.style.maxHeight = ''
      el.style.overflow = ''
      el.classList.remove('dsb-user-clamped')
    }
  }

  /** Remove one variant's bars and restore every row that variant hides. */
  const clearVariant = (selector: string, owns: (el: HTMLElement) => boolean): void => {
    for (const bar of [...document.querySelectorAll<HTMLElement>(selector)]) bar.remove()
    for (const el of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key], [data-variant="think"]')) {
      if (owns(el) && el.style.display === 'none') el.style.display = ''
    }
  }

  /** Remove long-question bars and restore every clamped text container. */
  const clearLongUser = (): void => {
    for (const bar of [...document.querySelectorAll<HTMLElement>('[data-dsb-user-bar]')]) bar.remove()
    for (const el of document.querySelectorAll<HTMLElement>('[class*="_text_"]')) {
      el.style.maxHeight = ''
      el.style.overflow = ''
      el.classList.remove('dsb-user-clamped')
    }
  }

  /** Fold each completed turn's tool cards into a count bar. */
  const foldTools = (sessionId: string | undefined, specs: FlowRowSpec[], elements: HTMLElement[]): void => {
    // First pass: reconcile DOM against the current state. Remove bars whose
    // turn no longer exists / whose row vanished, then re-insert each bar.
    const existing = new Map<number, HTMLElement>()
    for (const bar of document.querySelectorAll<HTMLElement>('[data-dsb-collapse-bar]')) {
      const turn = Number(bar.dataset.dsbTurn)
      if (Number.isFinite(turn)) existing.set(turn, bar)
    }
    const groups = groupToolRuns(specs)
    const keptTurns = new Set(groups.map((g) => g.turn))
    for (const [turn, bar] of existing) {
      if (!keptTurns.has(turn)) bar.remove()
    }

    for (const group of groups) {
      // The tool rows of this turn, in document order.
      const toolEls = group.toolRowIndexes.map((index) => elements[index]).filter((el): el is HTMLElement => el !== undefined)
      if (toolEls.length === 0) continue
      const isExpanded = expanded.has(`${sessionId ?? ''}#${group.turn}`)
      let bar = existing.get(group.turn)
      if (bar === undefined || bar.isConnected === false) {
        bar = createBar(t, group.turn, group.steps, isExpanded, 'tools')
        bar.addEventListener('click', () => {
          const key = `${currentSessionId() ?? ''}#${group.turn}`
          if (expanded.has(key)) {
            expanded.delete(key)
          } else {
            expanded.add(key)
          }
          apply()
        })
        toolEls[0].insertAdjacentElement('beforebegin', bar)
        existing.set(group.turn, bar)
      }
      bar.setAttribute('aria-expanded', String(isExpanded))
      bar.setAttribute('aria-label', t(isExpanded ? 'buddy.collapse.hide' : 'buddy.collapse.show', { n: group.steps }))
      const text = bar.querySelector<HTMLElement>('.dsb-collapse-text')
      if (text !== null) text.textContent = t('buddy.collapse.steps', { n: group.steps })
      bar.classList.toggle('dsb-collapse-open', isExpanded)
      for (const el of toolEls) {
        el.style.display = isExpanded ? '' : 'none'
      }
    }
  }

  /** Fold each completed turn's working transcript into a count bar: every
   *  middle assistant-step row (its think block AND its text "小结") plus any
   *  context-injection rows. The turn's LAST assistant-step row is the final
   *  summary and stays visible — only its think block folds. */
  const foldThinks = (sessionId: string | undefined, thinkSpecs: ThinkRowSpec[], elements: HTMLElement[]): void => {
    const existing = new Map<number, HTMLElement>()
    for (const bar of document.querySelectorAll<HTMLElement>('[data-dsb-think-bar]')) {
      const turn = Number(bar.dataset.dsbTurn)
      if (Number.isFinite(turn)) existing.set(turn, bar)
    }
    const groups = groupThinkRuns(thinkSpecs)
    const keptTurns = new Set(groups.map((g) => g.turn))
    for (const [turn, bar] of existing) {
      if (!keptTurns.has(turn)) bar.remove()
    }

    for (const group of groups) {
      // Everything this bar folds, in document order: the whole middle
      // assistant-step rows (think + text), the final row's think block, and
      // the context-injection rows.
      const items: { el: HTMLElement; order: number }[] = []
      for (const stepIdx of group.stepIndexes) {
        if (stepIdx === group.finalStepIndex) continue
        const row = elements[stepIdx]
        if (row !== undefined) items.push({ el: row, order: stepIdx * 1000 })
      }
      if (group.finalStepIndex !== null) {
        const finalRow = elements[group.finalStepIndex]
        if (finalRow !== undefined) {
          finalRow.querySelectorAll<HTMLElement>('[data-variant="think"]').forEach((thinkEl, ti) => {
            items.push({ el: thinkEl, order: group.finalStepIndex! * 1000 + ti })
          })
        }
      }
      for (const ctxIdx of group.contextIndexes) {
        const row = elements[ctxIdx]
        if (row !== undefined) items.push({ el: row, order: ctxIdx * 1000 })
      }
      items.sort((a, b) => a.order - b.order)
      const foldedEls = items.map((item) => item.el)
      if (foldedEls.length === 0) continue

      const isExpanded = expanded.has(`${sessionId ?? ''}#${group.turn}:think`)
      let bar = existing.get(group.turn)
      if (bar === undefined || bar.isConnected === false) {
        bar = createBar(t, group.turn, group.thinks, isExpanded, 'think')
        bar.addEventListener('click', () => {
          const key = `${currentSessionId() ?? ''}#${group.turn}:think`
          if (expanded.has(key)) {
            expanded.delete(key)
          } else {
            expanded.add(key)
          }
          apply()
        })
        // Insert BEFORE the first folded element's row (a whole middle row),
        // so the bar stays visible while its contents are hidden.
        const firstRow = foldedEls[0].closest<HTMLElement>('[data-chat-anchor-key]') ?? foldedEls[0]
        firstRow.insertAdjacentElement('beforebegin', bar)
        existing.set(group.turn, bar)
      }
      bar.setAttribute('aria-expanded', String(isExpanded))
      bar.setAttribute('aria-label', t(isExpanded ? 'buddy.think.hide' : 'buddy.think.show', { n: group.thinks }))
      const text = bar.querySelector<HTMLElement>('.dsb-collapse-text')
      if (text !== null) text.textContent = t('buddy.think.count', { n: group.thinks })
      bar.classList.toggle('dsb-collapse-open', isExpanded)
      for (const el of foldedEls) {
        el.style.display = isExpanded ? '' : 'none'
      }
    }
  }

  /** Fold each over-long user question to ~6 lines, with an expand bar. */
  const foldLongUser = (sessionId: string | undefined): void => {
    const existing = new Map<string, HTMLElement>()
    for (const bar of document.querySelectorAll<HTMLElement>('[data-dsb-user-bar]')) {
      const key = bar.dataset.dsbUserKey
      if (key !== undefined) existing.set(key, bar)
    }
    const seen = new Set<string>()

    for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
      if (row.getAttribute('data-chat-flow-kind') !== USER_KIND) continue
      const key = row.getAttribute('data-chat-anchor-key')
      if (key === null) continue
      seen.add(key)

      // The question's main text container (largest `_text_` element).
      const textEl = [...row.querySelectorAll<HTMLElement>('[class*="_text_"]')]
        .filter((el) => el.offsetHeight > 0)
        .sort((a, b) => b.offsetHeight - a.offsetHeight)[0]
      if (textEl === undefined) continue

      const lineHeight = Number.parseFloat(getComputedStyle(textEl).lineHeight)
      const lh = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24
      const maxHeight = lh * USER_MAX_LINES
      const isLong = textEl.scrollHeight > maxHeight
      const isExpanded = expanded.has(`${sessionId ?? ''}#user:${key}`)

      // Short question: no clamp, no bar.
      if (!isLong) {
        textEl.style.maxHeight = ''
        textEl.style.overflow = ''
        textEl.classList.remove('dsb-user-clamped')
        existing.get(key)?.remove()
        continue
      }

      if (isExpanded) {
        textEl.style.maxHeight = ''
        textEl.style.overflow = ''
        textEl.classList.remove('dsb-user-clamped')
      } else {
        textEl.style.maxHeight = `${maxHeight}px`
        textEl.style.overflow = 'hidden'
        textEl.classList.add('dsb-user-clamped')
      }

      let bar = existing.get(key)
      if (bar === undefined || bar.isConnected === false) {
        bar = createUserBar(t, isExpanded)
        bar.dataset.dsbUserKey = key
        bar.addEventListener('click', () => {
          const k = `${currentSessionId() ?? ''}#user:${key}`
          if (expanded.has(k)) {
            expanded.delete(k)
          } else {
            expanded.add(k)
          }
          apply()
        })
        textEl.insertAdjacentElement('afterend', bar)
        existing.set(key, bar)
      }
      bar.setAttribute('aria-expanded', String(isExpanded))
      bar.setAttribute('aria-label', t(isExpanded ? 'buddy.user.collapse' : 'buddy.user.expand'))
      const text = bar.querySelector<HTMLElement>('.dsb-collapse-text')
      if (text !== null) text.textContent = t(isExpanded ? 'buddy.user.collapse' : 'buddy.user.expand')
      bar.classList.toggle('dsb-collapse-open', isExpanded)
    }

    // Remove bars whose question vanished (paged out / deleted).
    for (const [key, bar] of existing) {
      if (!seen.has(key)) bar.remove()
    }
  }

  /** Re-scan the conversation and fold every completed turn. */
  const apply = (): void => {
    const enabled = isEnabled()
    const thinkEnabled = isThinkEnabled()
    const longUserEnabled = isLongUserEnabled()
    if (!enabled && !thinkEnabled && !longUserEnabled) {
      restoreAll()
      return
    }
    const sessionId = currentSessionId()
    // Read rows + their DOM elements in the same document order.
    const specs: FlowRowSpec[] = []
    const thinkSpecs: ThinkRowSpec[] = []
    const elements: HTMLElement[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
      const kind = el.getAttribute('data-chat-flow-kind')
      const key = el.getAttribute('data-chat-anchor-key')
      if (kind === null || key === null) continue
      specs.push({ key, kind })
      thinkSpecs.push({
        key,
        kind,
        thinkCount: kind === 'assistant-step' ? el.querySelectorAll('[data-variant="think"]').length : 0,
        isContext: kind === CONTEXT_KIND,
      })
      elements.push(el)
    }
    if (specs.length === 0) {
      restoreAll()
      return
    }

    if (enabled) {
      foldTools(sessionId, specs, elements)
    } else {
      clearVariant('[data-dsb-collapse-bar]', (el) => el.getAttribute('data-chat-flow-kind') === TOOL_CALL_KIND)
    }
    if (thinkEnabled) {
      foldThinks(sessionId, thinkSpecs, elements)
    } else {
      clearVariant(
        '[data-dsb-think-bar]',
        (el) => {
          const kind = el.getAttribute('data-chat-flow-kind')
          return kind === CONTEXT_KIND || kind === 'assistant-step' || el.matches('[data-variant="think"]')
        },
      )
    }
    if (longUserEnabled) {
      foldLongUser(sessionId)
    } else {
      clearLongUser()
    }
  }

  // ---- observe (coalesced through rAF so streamed rows fold once) ----
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      apply()
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // Fold turns that were already completed before this plugin mounted.
  apply()

  return () => {
    observer.disconnect()
    restoreAll()
  }
}
