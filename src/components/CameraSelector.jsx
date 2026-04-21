export default function CameraSelector({ devices, deviceId, onChange, onRefresh }) {
  return (
    <div className="camera-selector">
      <label htmlFor="camera">Caméra</label>
      <select
        id="camera"
        value={deviceId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!devices.length}
      >
        {!devices.length && <option value="">Aucune caméra détectée</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `Caméra ${i + 1}`}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRefresh} title="Rafraîchir la liste">↻</button>
    </div>
  )
}
