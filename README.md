# dsh-session-buddy

English | [中文](./README.zh.md)

Session notifications + an in-conversation ladder outline for the **DeepSeek Harness Web GUI (dsh web)**. Get notified when the AI finishes replying, asks you a question, or needs command approval — even while the tab is away — and navigate past questions via a compact outline rail.

<sub><span style="opacity:.6">Built independently with dsh + Deepseek-V4-Flash</span></sub>

## Features

### Session notifications
- **Three trigger kinds**, each independently switchable:
  - `reply`: the AI finished replying
  - `ask`: the AI explicitly asks you a question (ask-user tool) — a plain finished reply does NOT re-fire
  - `confirm`: a command approval is pending (approval dialog)
- A reply notifies when you were **away at any point during that turn**; stays silent while you watch it
- **Native OS toast** (Windows PowerShell WinRT / macOS osascript / Linux notify-send) — no browser permission, not suppressed by Chrome — plus a red-dot favicon & `(●)` title badge, and an optional sound
- Title is "workspace · session title"; one notification per reply

### Ladder outline
- A collapsible rail on the right side listing every **user question** in order
- Thin rounded bars when idle (no text, no crowding), even with dozens/hundreds of turns
- Hover a rung for a floating tooltip (number + question summary + time); click to scroll to that turn with a flash highlight
- Scrollspy highlights the current turn; a jump-to-latest button appears when you are not at the bottom
- Older history is paged in on demand via the "`+older`" footer
- Hidden automatically when the session has fewer than two turns

### In-app upgrades
- The settings card shows the current version and can check the npm registry for the latest release
- One-click upgrade through the official `dsh plugin add` CLI (restart dsh web to apply)

## Install

### From npm

```sh
dsh plugin --profile web add dsh-session-buddy
```

### From a local directory (development)

```sh
dsh plugin --profile web add link:<this-dir>
```

After installing, **restart** `dsh web`, then configure it under 设置 → 插件 → 插件配置 → "Session Buddy @Shrbuz".

## Usage

### Notifications
- Open the plugin settings card and toggle the three trigger kinds, the sound, and the master switch
- Switch away from the tab while the AI is replying and you will get a native toast when it finishes; if the AI asks you a question or needs an approval, you are notified while the tab is hidden

### Ladder outline
- Hover the right-side rail to preview each question; click a rung to jump to it
- Use the `+older` footer to page in hidden history; the jump-to-latest button scrolls to the bottom
- Rung length and tooltip timestamps are configurable in the settings card

### Check for updates
- Open the settings card → "Version & upgrades" → "Check for updates"
- When a newer version exists, click "Upgrade" and follow the prompt; restart dsh web to apply

## How it works

| Layer | Implementation |
|---|---|
| Notifications | Client-side DOM observation (`MutationObserver` + official anchors + the composer stop-button running signal to decide when a reply is truly done) + a `visibilitychange` rebuild; the host fires the native OS toast through a loopback-only `/api/session-buddy/toast` route |
| Outline | Rungs come from the official `sessions` service snapshot (independent of how much DOM is rendered); dsh conversation history is a paged window, so the outline pages hidden history in on demand and aligns rungs to the DOM via the official anchor keys |
| Upgrades | The host reads `https://registry.npmjs.org/dsh-session-buddy/latest` (fail-closed when offline) and runs the official `dsh plugin` CLI for the actual upgrade |

The UI is theme-aware and styled entirely with the official `--dsw-alias-*` design tokens.

## Limitations

- Native toasts depend on the OS notification settings; the favicon/title badge always works as a parallel cue
- An upgrade takes effect only after restarting `dsh web`

## Development

```sh
pnpm install
pnpm build          # tsc -b && tsdown → lib/
pnpm typecheck
```

Regression scripts:

```sh
node scripts/smoke-host.mjs        # host-logic smoke (no web)
node scripts/verify-live.mjs       # live check against a running dsh (boot graph + bundle + routes)
node scripts/verify-outline.mjs    # CDP: restore session, page hidden history, rung click/flash
node scripts/verify-tooltip.mjs    # CDP: hover tooltip on a paged-in rung
node scripts/verify-notify.mjs     # CDP: notification fires while hidden, silent while visible
```

## License

Apache-2.0
