# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0 - 2026-08-24

### Features

- **Fold the working transcript into one "共 N 次思考" row** — after a turn finishes, its repeated `Think` reasoning blocks AND the interleaved text "小结" rows (the one-line progress notes between think blocks and tool calls) are merged into a single clickable count bar (mirroring the existing tool-run bar). The turn's LAST assistant-step row — its final summary — stays visible (only its think block folds), so the actual closing reply is always on screen. Clicking the bar expands everything again; since each think block is itself a one-line collapsible summary, expanding yields a browsable list of per-think summaries
- **Context injections fold along with the thinks** — harness "context injection" rows that interleave between a turn's think blocks (e.g. tool-job payloads, system-prompt / skill-catalog injections) carry no turn number of their own, so they fold into whichever turn's window they fall inside, together with the thinks
- **Independent setting** — a new "折叠思考块" switch in the settings card (default on) controls think folding separately from tool folding; a turn only folds when it rendered ≥ 2 thinks
- **Fold over-long user questions** — a question whose text runs past 6 lines (e.g. a whole log pasted into the prompt) is clamped to those first lines with a soft bottom fade and an "展开全文" bar underneath; click to expand the full text (or collapse again). Short questions are never touched. A separate "折叠长提问" switch (default on) controls this, and each question's expand/collapse state is remembered per session

### Fixes

- **Ladder outline now ALWAYS follows the conversation width** — the rail previously repositioned only when a ResizeObserver on the scrollport happened to fire, so expanding the right sidebar sometimes left the rail stuck at the screen's right edge. Positioning is now re-read on every animation frame (plus ResizeObserver on the scrollport and all its ancestors, plus window resize), so the rail moves with the conversation whenever the sidebar squeezes it — deterministically, not sometimes

### Tests

- Extend the host smoke suite with `groupThinkRuns` pure-function cases: multi-think turn folding, single-think stays unfolded, context rows fold with their turn's thinks, per-turn separation, multi-think rows, and text-only "小结" rows being tracked while the final summary row stays fold-exempt

## 0.2.0 - 2026-08-24

### Features

- **Host event-driven notifications** — triggers now come from the session event log (reply on a completed turn, ask on the ask-user tool, confirm on an approval request), relayed over SSE to every open tab; DOM observation remains the fallback while the stream is down
- **One OS toast per event** — a notified ledger claims each event atomically across tabs and reloads, so a single reply never pops N toasts with several tabs open, and a reload can't re-fire an already-notified event
- **Session cleanup** — sessions whose history fails the harness's own load validation (e.g. a `tool/result` persisted with an empty tool-call id, which dsh refuses to read back) get a warning badge; the session row's three-dot menu gains a "删除会话" item that permanently deletes the session's on-disk data (frees space) after confirmation. Deleting is hidden for the currently open session and the host refuses to delete a live session

### Fixes

- Keep the outline panel's hook count stable between renders (React rules of hooks) — the empty-state early return used to sit before several `useEffect` calls, which could throw a "Rendered more hooks than during the previous render" console error when the list flipped between empty and non-empty
- Only the tab that actually fires the OS toast beeps, so several hidden tabs no longer machine-gun the sound for a single event

### Tests

- Extend the host smoke suite: event-monitor derive (reply/ask/confirm, subagent and unknown events ignored), notified-ledger claim (TTL + dedup), and session-corruption detection (empty call id, callId mismatch, packed rows skipped, zstd round-trip)

## 0.1.2 - 2026-08-23

### Fixes

- Hide the ladder outline's scrollbar when many rungs exceed the rail height, replacing it with top/bottom fade shadows that show there is more above/below — no more scrollbar flicker on hover/scroll
- Keep the "`+older`" footer outside the scrollable list so it stays fixed and always reachable (it previously scrolled out of view with many rungs)
- Resolve the `dsh` CLI for the in-app upgrade via the npm bin directory (node + `lib/bin.js`) — previously the CLI was not found on Windows, so the upgrade button could not run

## 0.1.1 - 2026-08-23

### Features

- **In-app version check + self-upgrade** — the plugin settings card now shows the current version, can check the npm registry for the latest release, and upgrades this package in place through the official `dsh plugin add` CLI (restart dsh web to apply)

### Fixes

- Keep the ladder outline below the official settings modal — the rail, jump-to-latest button and hover tooltip now sit at z-index 900/901 (below the settings dialog at 1000) so they never cover the settings popup

### Chores

- Harden the toast route: 8KB request-body cap (early stream destroy) plus uniform `{ok, error:code}` JSON responses

## 0.1.0 - 2026-08-23

Initial release of **dsh-session-buddy** — session notifications + in-conversation ladder outline for the DeepSeek Harness Web GUI.

### Features

- **Session notifications** — three independently switchable trigger kinds:
  - `reply`: notify when the AI finishes replying, even while the tab is away
  - `ask`: notify only when the AI explicitly asks you a question (ask-user tool), never re-firing on a plain finished reply
  - `confirm`: notify when a command approval is pending (approval dialog)
- **Away-aware reply notifications** — a reply notifies when you were away at any point during that turn; stays silent when you watched it
- **Native OS toast** (Windows PowerShell WinRT / macOS osascript / Linux notify-send — no browser permission, not suppressed by Chrome) plus a red-dot favicon, `(●)` title badge and optional sound; title is "workspace · session title", deduplicated to one per reply
- **Ladder outline** — collapsible right rail listing every user question turn in order:
  - Idle: thin rounded bars (no text, no crowding); hover: the whole rail-shell width is the hit area, with a floating tooltip (number + question summary + time) anchored to the rung
  - Click a rung to scroll to that turn with a flash highlight; scrollspy highlights the current turn
  - Jump-to-latest button styled like the rail shell, hidden when already at bottom
  - Rail scrolls internally for long sessions; hidden when the session has <2 turns

### Technical notes

- Outline data sourced from the official `sessions` service snapshot (`ctx.sessions` → `SessionFace.getSnapshot()`), independent of rendered DOM, paging hidden history in via the `+older` footer
- Notifications driven by DOM observation + the composer stop-button running signal + a `visibilitychange` rebuild (no throttled-timer reliance)
- Loopback-only `/api/session-buddy/toast` host route runs the native OS toast; styled entirely with official `--dsw-alias-*` design tokens
