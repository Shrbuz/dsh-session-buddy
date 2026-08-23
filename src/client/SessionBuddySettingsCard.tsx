/**
 * Session buddy settings card — the `session-buddy` entry inside the web
 * settings surface (设置 → 插件 → 插件配置). Follows the official plugin-card
 * pattern: a collapsible header (name + description + chevron) that expands
 * into the form. Every control writes straight back through the bound settings
 * scope, so changes apply live — no save/discard footer needed.
 * @module dsh-session-buddy/client/SessionBuddySettingsCard
 */

import { useSyncExternalStore, useState, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionBuddyUiSettings } from './settings.ts'
import { DEFAULT_UI_SETTINGS } from './settings.ts'

/** Props of the session-buddy settings card (injected through the slot entry). */
export interface SessionBuddySettingsCardProps {
  /** The bound `session-buddy` settings scope (reads + writes). */
  scope: SettingsScope<SessionBuddyUiSettings>
  /** Translation helper. */
  buddyT: (key: string) => string
}

/** A labeled toggle row (official-style switch). */
function Toggle(props: {
  dataPart: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <div className="dsb-settings-field dsb-settings-field-switch">
      <span className="dsb-settings-label">{props.label}</span>
      <label className="dsb-settings-switch">
        <input
          type="checkbox"
          className="dsb-check"
          data-dsh-part={props.dataPart}
          checked={props.checked}
          onChange={(event) => { props.onChange(event.target.checked) }}
        />
        <span className="dsb-settings-switch-track" aria-hidden="true" />
      </label>
    </div>
  )
}

/** Length presets for the ladder rungs (vertical bar height in px). */
const WIDTH_PRESETS = [
  { value: 14, labelKey: 'buddy.settings.widthSmall' },
  { value: 18, labelKey: 'buddy.settings.widthMedium' },
  { value: 24, labelKey: 'buddy.settings.widthLarge' },
]

/** A segmented (tab-style) picker, official-style. */
function Segmented(props: {
  dataPart: string
  value: number
  options: readonly { value: number; label: string }[]
  onChange: (value: number) => void
}): ReactElement {
  return (
    <div className="dsb-settings-seg" role="radiogroup" data-dsh-part={props.dataPart}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          className={option.value === props.value ? 'dsb-settings-seg-btn dsb-settings-seg-active' : 'dsb-settings-seg-btn'}
          data-dsh-part={`${props.dataPart}-${option.value}`}
          onClick={() => { props.onChange(option.value) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The session-buddy plugin card in 设置 → 插件 → 插件配置. */
export function SessionBuddySettingsCard(props: SessionBuddySettingsCardProps): ReactElement | null {
  const { scope, buddyT } = props
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  if (snapshot.status === 'unavailable') return null
  const value = snapshot.value ?? DEFAULT_UI_SETTINGS

  const [open, setOpen] = useState(false)

  const set = (key: keyof SessionBuddyUiSettings, next: unknown): void => { void scope.set(key, next) }

  return (
    <li className={open ? 'dsb-settings-card dsb-settings-card-open' : 'dsb-settings-card'} data-dsh-part="session-buddy-settings-card">
      <button
        type="button"
        className="dsb-settings-header"
        aria-expanded={open}
        aria-label={open
          ? buddyT('buddy.settings.collapse')
          : buddyT('buddy.settings.expand')}
        onClick={() => { setOpen((current) => !current) }}
      >
        <span className="dsb-settings-headText">
          <span className="dsb-settings-name">{buddyT('buddy.settings.title')}</span>
          <span className="dsb-settings-description">{buddyT('buddy.settings.description')}</span>
        </span>
        <svg
          width="14" height="14"
          className={open ? 'dsb-settings-chevron dsb-settings-chevron-open' : 'dsb-settings-chevron'}
          viewBox="0 0 14 14" fill="none" aria-hidden="true"
        >
          <path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div className="dsb-settings-body">
          <Toggle
            dataPart="buddy-setting-enabled"
            label={buddyT('buddy.settings.enabled')}
            checked={value.enabled}
            onChange={(next) => { set('enabled', next) }}
          />

          <div className="dsb-settings-group-label">{buddyT('buddy.settings.notify')}</div>
          <Toggle
            dataPart="buddy-setting-notifyReply"
            label={buddyT('buddy.settings.notifyReply')}
            checked={value.notifyReply}
            onChange={(next) => { set('notifyReply', next) }}
          />
          <Toggle
            dataPart="buddy-setting-notifyAsk"
            label={buddyT('buddy.settings.notifyAsk')}
            checked={value.notifyAsk}
            onChange={(next) => { set('notifyAsk', next) }}
          />
          <Toggle
            dataPart="buddy-setting-notifyConfirm"
            label={buddyT('buddy.settings.notifyConfirm')}
            checked={value.notifyConfirm}
            onChange={(next) => { set('notifyConfirm', next) }}
          />
          <Toggle
            dataPart="buddy-setting-sound"
            label={buddyT('buddy.settings.sound')}
            checked={value.sound}
            onChange={(next) => { set('sound', next) }}
          />

          <div className="dsb-settings-group-label">{buddyT('buddy.settings.outline')}</div>
          <div className="dsb-settings-field">
            <span className="dsb-settings-label">{buddyT('buddy.settings.outlineWidth')}</span>
            <Segmented
              dataPart="buddy-setting-outlineWidth"
              value={value.outlineWidth}
              onChange={(next) => { set('outlineWidth', next) }}
              options={WIDTH_PRESETS.map((p) => ({ value: p.value, label: buddyT(p.labelKey) }))}
            />
          </div>
          <Toggle
            dataPart="buddy-setting-showTimestamps"
            label={buddyT('buddy.settings.showTimestamps')}
            checked={value.showTimestamps}
            onChange={(next) => { set('showTimestamps', next) }}
          />
        </div>
      ) : null}
    </li>
  )
}
