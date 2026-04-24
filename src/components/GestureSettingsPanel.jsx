const CONTROLS = [
  {
    key: 'pinchGrabRatio',
    label: 'Pinch on',
    min: 0.12,
    max: 0.6,
    step: 0.01
  },
  {
    key: 'pinchReleaseRatio',
    label: 'Pinch off',
    min: 0.16,
    max: 0.8,
    step: 0.01
  }
]

export default function GestureSettingsPanel({ settings, onChange, onReset }) {
  return (
    <aside className="gesture-settings" aria-label="Réglages des seuils gestuels">
      <div className="gesture-settings__header">
        <div>
          <strong>Réglages gestes</strong>
          <span>Pinch drag + resize</span>
        </div>
        <button type="button" className="icon-button gesture-settings__reset" onClick={onReset} title="Réinitialiser les seuils">
          ↺
        </button>
      </div>

      <div className="gesture-settings__grid">
        {CONTROLS.map((control) => (
          <label key={control.key} className="gesture-slider">
            <div className="gesture-slider__label">
              <span>{control.label}</span>
              <b>{settings[control.key].toFixed(2)}</b>
            </div>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={settings[control.key]}
              onChange={(event) => onChange?.(control.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
    </aside>
  )
}
