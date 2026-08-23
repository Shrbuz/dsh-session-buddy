/**
 * dsh-session-buddy styles — every token remaps to the OFFICIAL dsh design
 * tokens (`--dsw-alias-*` / `--dsw-shadow-*`), so the ladder outline and
 * settings card follow the active theme (light/dark) automatically, with
 * static fallbacks when a token is absent.
 * @module dsh-session-buddy/client/styles
 */

export const BUDDY_CSS = `
/* ---- token aliases (theme-aware, fallback values) ---- */
/* Declared on :root (not just .dsb-root) so the FIXED elements that are
   portaled to document.body — the jump-to-latest button and the hover tooltip
   — still inherit the theme tokens. portal() moves them out of .dsb-root, so
   a .dsb-root-scoped variable would not reach them. */
:root,
.dsb-root {
  --dsb-bg: var(--dsw-alias-bg-overlay, #e9ecf2);
  --dsb-bg-solid: var(--dsw-alias-bg-layer-2, #ffffff);
  --dsb-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --dsb-text-1: var(--dsw-alias-label-primary, #0f1115);
  --dsb-text-2: var(--dsw-alias-label-secondary, #61666b);
  --dsb-text-3: var(--dsw-alias-label-tertiary, #81858c);
  --dsb-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  --dsb-primary: var(--dsw-alias-state-business-primary, #4176e6);
  --dsb-primary-weak: var(--dsw-alias-state-business-weak, rgba(65, 118, 230, 0.14));
  --dsb-tooltip-bg: var(--dsw-alias-tooltip-bg, #2c2c2e);
  --dsb-tooltip-text: var(--dsw-alias-tooltip-fg, #f5f5f7);
  --dsb-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0, 0, 0, 0.1));
}

/* ---- ladder outline rail ---- */
/* Anchored to the conversation scrollport's right edge (via inline left),
   so it follows the conversation when another plugin's right sidebar expands
   and squeezes it. Always visible — no expand/collapse. */
.dsb-outline {
  box-sizing: border-box;
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 30px;
  /* No horizontal padding: the rung hit area spans the whole shell, so the
     blank band beside the thin strip also counts as hover (easier to aim). */
  padding: 10px 0;
  border: 1px solid var(--dsb-border);
  border-radius: 12px;
  background: var(--dsb-bg-solid);
  box-shadow: var(--dsb-shadow);
  transition: opacity 0.16s ease, left 0.16s ease;
}
.dsb-outline-empty { display: none; }

/* Internal scrollable rung list (dozens/hundreds of turns). The vertical
   padding gives the first/last rungs breathing room inside the scroll
   container (the hover pulse grows them; without it the top rung gets
   clipped by overflow). */
.dsb-outline-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-height: min(60vh, 480px);
  overflow-y: auto;
  padding: 10px 0;
  scrollbar-width: thin;
}

/* One ladder rung: the BUTTON is a full-width invisible hit area (so the blank
   band on either side of the strip counts as hover), and the visible 8px strip
   is drawn by the ::before pseudo-element, centered. Height from --dsb-rung-h. */
.dsb-outline-rung {
  appearance: none;
  border: 0;
  cursor: pointer;
  flex: none;
  position: relative;
  width: 100%;
  height: var(--dsb-rung-h, 18px);
  background: transparent;
  padding: 0;
}
.dsb-outline-rung::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleY(1);
  width: 8px;
  border-radius: 4px;
  background: var(--dsb-bg-hover);
  /* Background + glow are direct hover properties (NOT animation-driven), so
     they transition smoothly out on hover-leave. The breathe animation only
     nudges scaleY, whose exit snap is a subtle ~2px — much less jarring than
     the old hard stop of color + glow + scale together. */
  transition: background-color 0.3s ease, box-shadow 0.35s ease;
}
.dsb-outline-rung:hover::before {
  background: var(--dsb-primary-weak);
}
.dsb-outline-rung-active::before {
  background: var(--dsb-primary);
}

/* Footer chip: clickable "load older" that pages the history window. */
.dsb-outline-footer {
  appearance: none;
  border: 0;
  font: inherit;
  flex: none;
  margin-top: 2px;
  width: 100%;
  text-align: center;
  font-size: 9px;
  line-height: 14px;
  color: var(--dsb-text-3);
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.dsb-outline-footer:hover { opacity: 1; color: var(--dsb-text-1); }
.dsb-outline-footer:disabled { opacity: 0.4; cursor: default; }

/* Jump-to-latest: an absolutely-positioned child of the rail, hanging just
   below it. As a child it follows the rail's position automatically (moving
   with the rail when a sidebar squeezes the conversation) and stays centered
   on the rail. Shown only when the transcript is not at the bottom. */
.dsb-outline-bottom {
  box-sizing: border-box;
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  appearance: none;
  font: inherit;
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid var(--dsb-border);
  background: var(--dsb-bg-solid);
  color: var(--dsb-text-2);
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  box-shadow: var(--dsb-shadow);
  z-index: 2147483000;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.dsb-outline-bottom svg { display: block; }
.dsb-outline-bottom:hover {
  background: var(--dsb-bg-hover);
  color: var(--dsb-text-1);
  border-color: var(--dsb-primary);
}
.dsb-outline-bottom:active { transform: translateX(-50%) scale(0.96); }

/* Breathing on hover: a subdued pulse on the hovered rung (kept gentle so it
   reads as "you are here" without being distracting). Only scaleY is animated;
   the background + glow are transitioned hover properties so leaving the hover
   state fades them out smoothly instead of snapping. */
.dsb-outline-rung-hover::before {
  background: var(--dsb-primary);
  box-shadow: 0 0 0 3px var(--dsb-primary-weak);
  animation: dsb-outline-breathe 1.6s ease-in-out infinite;
}
@keyframes dsb-outline-breathe {
  /* translateX(-50%) keeps the strip centered — the ::before is positioned at
     left:50%, so an animation transform without it would shift the strip. */
  0%, 100% { transform: translateX(-50%) scaleY(1); }
  50% { transform: translateX(-50%) scaleY(1.12); }
}

/* Hover tooltip (floating, does not affect layout). */
.dsb-outline-flash {
  animation: dsb-outline-flash 1.1s ease;
}
@keyframes dsb-outline-flash {
  0% { box-shadow: 0 0 0 0 var(--dsb-primary-weak); }
  40% { box-shadow: 0 0 0 8px var(--dsb-primary-weak); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.dsb-outline-tooltip {
  position: fixed;
  /* top/right come inline from the hovered rung's position; the tooltip's
     right edge sits just left of the rung, vertically centered on it. */
  transform: translateY(-50%);
  max-width: 260px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--dsb-tooltip-bg);
  color: var(--dsb-tooltip-text);
  box-shadow: var(--dsb-shadow);
  font-size: 12px;
  line-height: 16px;
  z-index: 2147483001;
  pointer-events: none;
}
.dsb-outline-tooltip-num {
  flex: none;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.dsb-outline-tooltip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsb-outline-tooltip-time {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
}

/* ---- settings card (official collapsible plugin-card pattern) ---- */
.dsb-settings-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  border-radius: 12px;
  list-style: none;
  transition: border-color 0.16s, background 0.16s;
}
.dsb-settings-card-open {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-label-dimmed, #adb2b8);
}
.dsb-settings-header {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 12px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  display: flex;
}
.dsb-settings-headText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.dsb-settings-name {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.dsb-settings-description {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 1.5;
}
.dsb-settings-chevron {
  color: var(--dsw-alias-label-tertiary, #81858c);
  flex: none;
  transition: transform 0.16s;
}
.dsb-settings-chevron-open { transform: rotate(180deg); }
.dsb-settings-body {
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  margin: 0 16px;
  padding-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsb-settings-group-label {
  color: var(--dsw-alias-label-caption, #adb2b8);
  font-size: 12px;
  line-height: 18px;
  margin: 10px 0 2px;
  font-weight: 600;
}
.dsb-settings-field { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
.dsb-settings-field-switch { justify-content: space-between; }
.dsb-settings-label { color: var(--dsw-alias-label-primary, #0f1115); font-size: 13px; line-height: 20px; }

.dsb-settings-switch { position: relative; display: inline-block; width: 34px; height: 20px; flex: none; }
.dsb-settings-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.dsb-settings-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.12));
  transition: background-color 0.16s;
  cursor: pointer;
}
.dsb-settings-switch-track:before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-inverted, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.16s;
}
.dsb-settings-switch input:checked + .dsb-settings-switch-track { background: var(--dsw-alias-state-business-primary, #4176e6); }
.dsb-settings-switch input:checked + .dsb-settings-switch-track:before { transform: translateX(14px); }

/* Segmented (tab-style) picker for the outline width preset. */
.dsb-settings-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
}
.dsb-settings-seg-btn {
  appearance: none;
  border: 0;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #61666b);
  cursor: pointer;
  background: transparent;
  border-radius: 6px;
  padding: 3px 10px;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.dsb-settings-seg-btn:hover { color: var(--dsw-alias-label-primary, #0f1115); }
.dsb-settings-seg-active {
  background: var(--dsw-alias-label-primary-inverted, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
`
