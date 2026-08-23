# Changelog

All notable changes to this project will be documented in this file.

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
