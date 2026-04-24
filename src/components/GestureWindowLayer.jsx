export default function GestureWindowLayer({
  windows,
  activeWindowIds,
  resizingWindowId,
  hoverWindowId,
  gestures,
  onReset
}) {
  const activeIds = new Set(activeWindowIds)

  return (
    <div className="gesture-layer" aria-label="Fenêtres de test contrôlables à la main">
      <div className="gesture-windows">
        {windows.map((window) => (
          <section
            key={window.id}
            className={[
              'gesture-window',
              activeIds.has(window.id) ? 'is-dragging' : '',
              resizingWindowId === window.id ? 'is-resizing' : '',
              hoverWindowId === window.id ? 'is-hovered' : ''
            ].filter(Boolean).join(' ')}
            style={{
              '--x': `${window.x * 100}%`,
              '--y': `${window.y * 100}%`,
              '--w': `${window.w * 100}%`,
              '--h': `${window.h * 100}%`,
              '--accent': window.accent,
              zIndex: window.z
            }}
          >
            <header className="gesture-window__bar">
              <span className="gesture-window__grip" />
              <strong>{window.title}</strong>
              {resizingWindowId === window.id && <em>resize</em>}
            </header>
            <div className="gesture-window__body">
              <p>{window.body}</p>
              <div className="gesture-window__meta">
                <span>{window.tag}</span>
                <span>{window.status}</span>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="gesture-hud">
        <button type="button" className="icon-button" onClick={onReset} title="Réinitialiser les fenêtres">
          ↺
        </button>
        {gestures.map((gesture) => (
          <div
            key={gesture.handIndex}
            className={[
              'gesture-chip',
              gesture.pinching ? 'is-pinching' : ''
            ].filter(Boolean).join(' ')}
          >
            <span>Main {gesture.handIndex + 1} · {formatInteractionState(gesture.interactionState)}</span>
            <b>{formatGesture(gesture)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatGesture(gesture) {
  if (!gesture.visible) return 'aucun signal'

  if (gesture.interactionState === 'RESIZING' || gesture.interactionState === 'DRAGGING') {
    return gesture.pinchRatio != null ? `pinch ${gesture.pinchRatio.toFixed(2)}` : 'pinch'
  }

  if (gesture.pinchRatio != null) return `pinch ${gesture.pinchRatio.toFixed(2)}`
  return 'suivi'
}

function formatInteractionState(state) {
  switch (state) {
    case 'POINTING':
      return 'vise'
    case 'HOVER':
      return 'survol'
    case 'DRAGGING':
      return 'drag'
    case 'RESIZING':
      return 'resize'
    default:
      return 'idle'
  }
}
