/**
 * dsh-session-buddy browser half — session health & clean deletion.
 *
 * dsh has no "delete session" action (the session row menu only offers fork /
 * archive; archive hides but keeps files). This module adds:
 *   1. A corrupt-session marker — the host reports which sessions fail the
 *      harness's own load validation (their history can't load), and each such
 *      row gets a small warning badge so you know which one to delete.
 *   2. A "删除会话" item injected into the session row's three-dot menu. The
 *      menu is dsh-internal (not slot-extensible), so the item is injected by
 *      cloning an existing menu item (structure-proof) — when the menu can't
 *      be located the injection degrades silently.
 *   3. A confirmation dialog, then a POST to the host which permanently
 *      deletes the session's on-disk data (frees disk space).
 *
 * @module dsh-session-buddy/client/session-delete
 */

/** Host routes (must match src/index.ts). */
const SESSIONS_ROUTE = '/api/session-buddy/sessions'
const DELETE_ROUTE = '/api/session-buddy/sessions/delete'

/** Session health as reported by the host. */
export interface SessionHealth {
  id: string
  cwd?: string
  corrupt: boolean
  corruptReason?: string
  size: number
}

/** React fiber internal property prefix (React 17+ stable convention). */
const FIBER_KEY_RE = /^__reactFiber\$/

/** Read a session row's id from its React fiber (key = session id). */
export function readSessionIdFromRow(row: HTMLElement): string | null {
  let fiber: unknown = null
  for (const key of Object.keys(row)) {
    if (FIBER_KEY_RE.test(key)) {
      fiber = (row as unknown as Record<string, unknown>)[key]
      break
    }
  }
  let cur = fiber
  for (let depth = 0; depth < 8 && cur !== null && cur !== undefined; depth++) {
    const f = cur as { key?: unknown; return?: unknown }
    if (typeof f.key === 'string' && f.key.length > 0) return f.key
    cur = f.return
  }
  return null
}

/** Fetch the session health listing (id → corrupt). Never throws. */
export async function fetchSessionHealth(): Promise<Map<string, SessionHealth>> {
  const out = new Map<string, SessionHealth>()
  try {
    const response = await fetch(SESSIONS_ROUTE, { cache: 'no-store' })
    if (!response.ok) return out
    const data = await response.json() as { sessions?: SessionHealth[] }
    for (const s of data.sessions ?? []) {
      if (typeof s?.id === 'string') out.set(s.id, s)
    }
  } catch {
    // host route unavailable — the feature degrades silently.
  }
  return out
}

/** Ask the host to permanently delete a session. Resolves ok/error. */
export async function deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(DELETE_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    const data = await response.json() as { ok?: boolean; error?: string }
    if (response.ok && data.ok === true) return { ok: true }
    return { ok: false, error: data.error ?? `HTTP ${response.status}` }
  } catch {
    return { ok: false, error: 'host-unreachable' }
  }
}

// ── Corrupt marker ──────────────────────────────────────────────────────────

/** The marker attribute we place on corrupt session rows. */
const CORRUPT_ATTR = 'data-dsb-corrupt'
const CORRUPT_CSS = `[${CORRUPT_ATTR}] {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--dsw-alias-state-warn-primary, #e0a02e);
  cursor: default;
}
[${CORRUPT_ATTR}] svg { width: 12px; height: 12px; }
/* The injected "删除会话" item: the real danger styling comes from dsh's own
   Menu danger class (added at runtime); this rule is only a fallback if that
   class goes stale after a dsh upgrade (non-important, so dsh's class wins). */
[data-dsb-delete-item] {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
[data-dsb-delete-item] svg { color: inherit; }`

/** dsh's `IconWarningOutline16` (extracted from the installed web bundle) —
 *  a circle warning glyph, matching the UI's own icon language. */
const WARNING_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z" fill="currentColor"/><path d="M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z" fill="currentColor"/><path d="M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z" fill="currentColor"/></svg>'

/** The EXACT `IconTrashOutline16` path used by dsh's own "删除工作区" item
 *  (extracted from the installed web bundle). We swap only the path data into
 *  the cloned item's EXISTING `<svg>` — that element carries the menu item's
 *  `itemIcon` class, which is what gives dsh icons their fill/color; replacing
 *  the whole `<svg>` would lose that class and render nothing. */
const TRASH_D = 'M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z'

/** The Menu item's danger class (dsh `Menu.module.css`: `danger = _danger_19372_193`).
 *  Adding it to the injected item makes it render with dsh's EXACT danger styling,
 *  identical to the workspace row's "删除工作区" item. */
const DANGER_CLASS = '_danger_19372_193'

/** Re-apply corrupt markers to every session row (idempotent). The ⚠ badge
 *  lives in the row's own status slot (`[class$="_slot"]`, where the status
 *  dots render) — for a corrupt session that slot has no live state to show,
 *  so the ⚠ is the natural occupant. Flat rows without a slot fall back to
 *  after the title. */
function applyCorruptMarkers(rows: Iterable<HTMLElement>, corrupt: ReadonlyMap<string, SessionHealth>): void {
  for (const row of rows) {
    const id = readSessionIdFromRow(row)
    const entry = id !== null ? corrupt.get(id) : undefined
    let marker = row.querySelector<HTMLElement>(`[${CORRUPT_ATTR}]`)
    if (entry !== undefined && entry.corrupt) {
      const wantTitle = `损坏：历史无法加载${entry.corruptReason ? `（${entry.corruptReason}）` : ''}，可在此菜单删除`
      if (marker === null) {
        marker = document.createElement('span')
        marker.setAttribute(CORRUPT_ATTR, 'true')
        marker.title = wantTitle
        marker.innerHTML = WARNING_ICON
        const slot = row.querySelector<HTMLElement>('[class$="_slot"]')
        if (slot !== null) {
          // Replace the slot's status dots with the ⚠ badge.
          slot.replaceChildren(marker)
        } else {
          const title = row.querySelector<HTMLElement>('[class$="_title"]')
          if (title !== null) title.parentElement?.insertBefore(marker, title.nextSibling)
          else row.appendChild(marker)
        }
      } else if (marker.title !== wantTitle) {
        marker.title = wantTitle
      }
    } else if (marker !== null) {
      marker.remove()
    }
  }
}

// ── Three-dot menu injection ────────────────────────────────────────────────

/** Locale labels that identify the SESSION menu (fork/archive items). */
const SESSION_MENU_LABELS = ['归档会话', '分叉会话', 'Archive session', 'Fork session']

/** Find the open session-row menu's item container, or null. */
function findSessionMenuContainer(root: ParentNode): HTMLElement | null {
  // Menu items are buttons/divs whose text matches the fork/archive labels.
  const candidates = root.querySelectorAll<HTMLElement>('button, [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')
  for (const el of candidates) {
    const text = (el.textContent ?? '').trim()
    if (SESSION_MENU_LABELS.some((label) => text.includes(label))) {
      // The items share one container; return the item's parent.
      const parent = el.parentElement
      if (parent !== null && parent !== document.body) return parent
      return el as HTMLElement
    }
  }
  return null
}

/** A single injected delete item element (kept for removal). */
let injectedDeleteItem: HTMLElement | null = null

/**
 * Build the injected "删除会话" item by cloning an existing menu item, so its
 * structure/styles always match the current dsh menu. The label and the icon
 * are replaced with the delete wording + a theme-red trash icon. Returns null
 * when no session menu is present.
 */
function ensureDeleteMenuItem(container: HTMLElement, onDelete: () => void): HTMLElement | null {
  if (injectedDeleteItem !== null && injectedDeleteItem.parentElement === container) return injectedDeleteItem
  removeDeleteMenuItem()
  // Clone the first real item (has visible text, not our injected one) so the
  // injected entry inherits the menu's exact structure/styles — never a
  // separator or spacer element.
  const template = Array.from(container.children).find(
    (child) => child instanceof HTMLElement
      && child.getAttribute('data-dsb-delete-item') !== 'true'
      && (child.textContent ?? '').trim().length > 0,
  )
  const clone = (template instanceof HTMLElement ? template.cloneNode(true) : document.createElement('button')) as HTMLElement
  clone.setAttribute('data-dsb-delete-item', 'true')
  clone.removeAttribute('aria-selected')
  // Apply dsh's OWN danger item class so the rendering matches the workspace
  // row's "删除工作区" item exactly (red text + icon + hover).
  clone.classList.add(DANGER_CLASS)
  // Swap the icon to dsh's exact IconTrashOutline16 by replacing the PATH DATA
  // inside the cloned item's existing <svg> — that element keeps the menu's
  // `itemIcon` class, which is what colors dsh icons. (Replacing the whole
  // <svg> would drop the class and the icon would render invisible.) The
  // viewBox is pinned to 16×16 so a cloned 20×20 icon (archive) still places
  // the trash correctly; extra paths (if any) are dropped.
  const svg = clone.querySelector('svg')
  if (svg !== null) {
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    const paths = svg.querySelectorAll('path')
    if (paths.length > 0) {
      paths[0].setAttribute('d', TRASH_D)
      for (let i = 1; i < paths.length; i++) paths[i].remove()
    }
  }
  // Replace any visible text with the delete label.
  const label = '删除会话'
  const walkText = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = label
        return
      }
      if (child instanceof HTMLElement) walkText(child)
    }
  }
  if (template instanceof HTMLElement) walkText(clone)
  else clone.textContent = label
  clone.title = '永久删除该会话的数据（释放磁盘）'
  clone.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onDelete()
  })
  container.appendChild(clone)
  injectedDeleteItem = clone
  return clone
}

function removeDeleteMenuItem(): void {
  if (injectedDeleteItem !== null) {
    injectedDeleteItem.remove()
    injectedDeleteItem = null
  }
}

// ── Confirmation dialog ─────────────────────────────────────────────────────

/** Information shown in the delete confirmation. */
export interface DeleteConfirmInfo {
  sessionId: string
  title?: string
  size?: number
}

/** Format a byte count as a short human string (e.g. "28 KB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Show a confirmation dialog before permanently deleting a session. Returns
 * true only when the user explicitly confirms the delete (Enter or the red
 * button). Escape / overlay click / Cancel resolve false. Standard alert
 * dialog semantics: role=alertdialog, aria-modal, labelled by the title.
 */
function confirmDelete(info: DeleteConfirmInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-dsb-modal', 'true')
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999;',
      'display:flex;align-items:center;justify-content:center;',
      // Theme-aware overlay mask (dsh alias token; fallback for older builds).
      'background:var(--dsw-alias-bg-mask-2, rgba(0,0,0,.45));',
      'padding:20px;',
    ].join('')

    const card = document.createElement('div')
    card.setAttribute('role', 'alertdialog')
    card.setAttribute('aria-modal', 'true')
    card.setAttribute('aria-labelledby', 'dsb-delete-title')
    card.setAttribute('aria-describedby', 'dsb-delete-desc')
    card.style.cssText = [
      'width:min(440px, 100%);border-radius:14px;padding:20px 22px;',
      // dsh theme surface token (flips with light/dark theme); the old
      // `--dsw-surface` token does NOT exist and always fell back to dark.
      'background:var(--dsw-alias-bg-layer-2, #ffffff);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 16px 48px rgba(0,0,0,.5);',
      'border:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));',
      'font-size:14px;line-height:1.7;',
    ].join('')

    // Header: red warning icon + title.
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;'
    const warn = document.createElement('span')
    warn.style.cssText = 'display:inline-flex;color:var(--dsw-alias-state-error-primary, #e5484d);'
    warn.innerHTML = WARNING_ICON
    const title = document.createElement('div')
    title.id = 'dsb-delete-title'
    title.textContent = '删除会话'
    title.style.cssText = 'font-size:16px;font-weight:600;'
    header.append(warn, title)

    // Body: what will happen + the session's identity.
    const body = document.createElement('div')
    body.id = 'dsb-delete-desc'
    body.style.cssText = 'color:var(--dsw-alias-label-secondary);margin-bottom:16px;'
    const lead = document.createElement('div')
    lead.textContent = '将永久删除该会话的全部数据，此操作无法撤销，并会释放磁盘空间。'
    const meta = document.createElement('div')
    meta.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.07));word-break:break-all;'
    const nameLine = info.title !== undefined && info.title !== ''
      ? `会话：${info.title}\n`
      : ''
    const sizeLine = info.size !== undefined && info.size > 0 ? `占用：${formatBytes(info.size)}` : ''
    meta.textContent = `${nameLine}ID：${info.sessionId}${sizeLine === '' ? '' : '\n' + sizeLine}`
    meta.style.whiteSpace = 'pre-wrap'
    body.append(lead, meta)

    // Footer: neutral cancel + red filled danger delete.
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.style.cssText = btnStyle()
    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = '删除'
    del.style.cssText = [
      'padding:6px 18px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;',
      'background:var(--dsw-alias-state-error-primary, #e5484d);color:#fff;',
    ].join('')

    let done = false
    const finish = (value: boolean): void => {
      if (done) return
      done = true
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      resolve(value)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      else if (event.key === 'Enter') { event.preventDefault(); finish(true) }
    }
    cancel.addEventListener('click', () => finish(false))
    del.addEventListener('click', () => finish(true))
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(false) })
    document.addEventListener('keydown', onKey)

    actions.append(cancel, del)
    card.append(header, body, actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    del.focus()
  })
}

function btnStyle(): string {
  return [
    'padding:6px 18px;border-radius:8px;border:1px solid var(--dsw-alias-border, rgba(127,127,127,.25));',
    'background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:14px;',
  ].join('')
}

// ── Manager ────────────────────────────────────────────────────────────────

/** Options for the session-delete manager. */
export interface SessionDeleteOptions {
  /** Current open session id (delete is hidden for it). */
  currentSessionId?: () => string | undefined
  /** Called after a successful delete to make the dsh session list drop the
   *  removed session (the host deletes the dir; the list is otherwise only
   *  refreshed on a page reload). */
  refreshSessions?: () => void
}

/** Start the corrupt-marker + menu-injection manager. Returns a disposer. */
export function startSessionDeleteManager(options: SessionDeleteOptions = {}): () => void {
  const corrupt = new Map<string, SessionHealth>()
  let timer = 0
  let disposed = false
  /** The session row whose three-dot menu most recently opened. */
  let menuOwnerId: string | null = null
  /** Display title of that row (shown in the confirmation dialog). */
  let menuOwnerTitle = ''
  let lastMenuSeen = 0

  // Inject the marker CSS once (removed on dispose).
  const style = document.createElement('style')
  style.dataset.dsbSessionDeleteCss = 'true'
  style.textContent = CORRUPT_CSS
  document.head.appendChild(style)

  const refreshHealth = async (): Promise<void> => {
    if (disposed) return
    const fresh = await fetchSessionHealth()
    if (disposed) return
    corrupt.clear()
    for (const [id, entry] of fresh) corrupt.set(id, entry)
    applyMarkers()
  }

  const applyMarkers = (): void => {
    const rows = document.querySelectorAll<HTMLElement>('div[role="treeitem"][class$="_sessionRow"]')
    applyCorruptMarkers(rows, corrupt)
  }

  /** Re-run the marker + menu injection passes (debounced). */
  const replay = (): void => {
    if (disposed) return
    applyMarkers()
    const container = findSessionMenuContainer(document)
    if (container !== null) {
      // A session menu is open. Refresh the health map (cheap, keeps the
      // delete flow aware of corrupt state) at most every few seconds.
      if (Date.now() - lastMenuSeen > 5000) {
        lastMenuSeen = Date.now()
        void refreshHealth()
      }
      // Hide the delete item for the currently open session.
      const current = options.currentSessionId?.()
      if (menuOwnerId === null || menuOwnerId === current) {
        removeDeleteMenuItem()
      } else {
        ensureDeleteMenuItem(container, () => {
          const id = menuOwnerId
          if (id === null) return
          void (async () => {
            const confirmed = await confirmDelete({
              sessionId: id,
              title: menuOwnerTitle,
              size: corrupt.get(id)?.size,
            })
            if (!confirmed) return
            const result = await deleteSession(id)
            removeDeleteMenuItem()
            if (result.ok) {
              // Refresh the corrupt map AND ask the dsh session service to
              // re-list, so the deleted session's row disappears right away.
              void refreshHealth()
              try { options.refreshSessions?.() } catch { /* best-effort */ }
            } else {
              alertDeleteError(id, result.error ?? '未知错误')
            }
          })()
        })
      }
    } else {
      removeDeleteMenuItem()
    }
  }

  function alertDeleteError(sessionId: string, error: string): void {
    const el = document.createElement('div')
    el.textContent = `删除失败（${sessionId}）：${error}`
    el.style.cssText = [
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;',
      'padding:10px 16px;border-radius:10px;font-size:13px;',
      'background:var(--dsw-alias-state-error-primary, #e5484d);color:#fff;',
      'box-shadow:0 8px 24px rgba(0,0,0,.4);',
    ].join('')
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 4000)
  }

  // Track which session row opened a three-dot menu (the menu appears right
  // after this button click, so recording it here is race-free).
  const onCaptureClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    const button = target?.closest?.('button') ?? null
    if (button === null) return
    const row = button.closest<HTMLElement>('div[role="treeitem"][class$="_sessionRow"]')
    if (row === null) return
    menuOwnerId = readSessionIdFromRow(row)
    menuOwnerTitle = row.querySelector<HTMLElement>('[class$="_title"]')?.textContent?.trim() ?? ''
  }
  document.addEventListener('click', onCaptureClick, true)

  // Replay on DOM changes (menu open/close, rows mount/unmount, corrupt rows).
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(replay, 60)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // Initial data + pass.
  void refreshHealth()
  replay()

  return () => {
    disposed = true
    window.clearTimeout(timer)
    observer.disconnect()
    document.removeEventListener('click', onCaptureClick, true)
    removeDeleteMenuItem()
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${CORRUPT_ATTR}]`))) el.remove()
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-dsb-modal]'))) el.remove()
    style.remove()
  }
}
