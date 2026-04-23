import { useCallback, useEffect, useRef, useState } from 'react'
import CameraSelector from './components/CameraSelector.jsx'
import GestureWindowLayer from './components/GestureWindowLayer.jsx'
import TrackingView from './components/TrackingView.jsx'
import { createTrackers } from './lib/tracker.js'
import './App.css'

const INITIAL_WINDOWS = [
  {
    id: 'console',
    title: 'Console cible',
    body: 'Pince pouce-index sur cette barre, garde le geste fermé, puis déplace ta main.',
    tag: 'Grab zone',
    status: 'prêt',
    x: 0.08,
    y: 0.12,
    w: 0.28,
    h: 0.28,
    z: 1,
    accent: '#7aa7ff'
  },
  {
    id: 'notes',
    title: 'Notes',
    body: 'La fenêtre capturée reste sous le curseur tant que le pincement est actif.',
    tag: 'Pinch',
    status: 'stable',
    x: 0.58,
    y: 0.16,
    w: 0.3,
    h: 0.26,
    z: 2,
    accent: '#49d49d'
  },
  {
    id: 'palette',
    title: 'Palette',
    body: 'Le seuil utilise la taille de la paume pour rester exploitable près ou loin de la caméra.',
    tag: 'Ratio',
    status: '0.38 / 0.52',
    x: 0.32,
    y: 0.56,
    w: 0.34,
    h: 0.24,
    z: 3,
    accent: '#ffb86b'
  }
]

const MIN_WINDOW_W = 0.18
const MIN_WINDOW_H = 0.16
const MAX_WINDOW_W = 0.72
const MAX_WINDOW_H = 0.72

export default function App() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [stream, setStream] = useState(null)
  const [permission, setPermission] = useState('pending') // pending | granted | denied
  const [trackersReady, setTrackersReady] = useState(false)
  const [stats, setStats] = useState({ hands: 0, fps: 0, cursors: [] })
  const [showHands, setShowHands] = useState(true)
  const [showCursor, setShowCursor] = useState(true)
  const [windows, setWindows] = useState(INITIAL_WINDOWS)
  const [gestureUi, setGestureUi] = useState({
    activeWindowIds: [],
    resizingWindowId: null,
    hoverWindowId: null,
    gestures: []
  })
  const trackersRef = useRef(null)
  const windowsRef = useRef(INITIAL_WINDOWS)
  const grabsRef = useRef({})
  const resizeRef = useRef(null)
  const gestureUiTickRef = useRef(0)

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices()
    const cams = all.filter((d) => d.kind === 'videoinput')
    setDevices(cams)
    return cams
  }, [])

  const requestPermission = useCallback(async () => {
    try {
      // Initial permission grab — needed to expose device labels.
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      s.getTracks().forEach((t) => t.stop())
      setPermission('granted')
      const cams = await refreshDevices()
      if (cams.length && !deviceId) setDeviceId(cams[0].deviceId)
    } catch (err) {
      console.error('Camera permission denied:', err)
      setPermission('denied')
    }
  }, [deviceId, refreshDevices])

  useEffect(() => {
    requestPermission()
    const handler = () => refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', handler)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler)
  }, [requestPermission, refreshDevices])

  // Open the selected camera for the hand tracker.
  useEffect(() => {
    if (!deviceId) return
    let current = null
    let cancelled = false
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        current = s
        setStream(s)
      } catch (err) {
        console.error('Failed to open camera', err)
      }
    })()
    return () => {
      cancelled = true
      current?.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId])

  // Lazy-load MediaPipe trackers.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const t = await createTrackers()
        if (!alive) {
          t.close()
          return
        }
        trackersRef.current = t
        setTrackersReady(true)
      } catch (err) {
        console.error('Failed to load trackers', err)
      }
    })()
    return () => {
      alive = false
      trackersRef.current?.close?.()
      trackersRef.current = null
    }
  }, [])

  const updateTrackingStats = useCallback((nextStats) => {
    setStats((current) => ({ ...current, ...nextStats }))
  }, [])

  const resetWindows = useCallback(() => {
    grabsRef.current = {}
    resizeRef.current = null
    windowsRef.current = INITIAL_WINDOWS
    setWindows(INITIAL_WINDOWS)
    setGestureUi((current) => ({
      ...current,
      activeWindowIds: [],
      resizingWindowId: null,
      hoverWindowId: null
    }))
  }, [])

  const handleInteractions = useCallback((gestures) => {
    const gesturesByHand = new Map(gestures.map((gesture) => [gesture.handIndex, gesture]))
    let nextWindows = windowsRef.current
    let windowsChanged = false
    let hoverWindowId = null

    const setNextWindows = (updater) => {
      nextWindows = updater(nextWindows)
      windowsChanged = true
    }

    for (const handIndex of Object.keys(grabsRef.current)) {
      const gesture = gesturesByHand.get(Number(handIndex))
      if (!gesture?.visible || gesture.grabEnded || !gesture.pinching) {
        delete grabsRef.current[handIndex]
        resizeRef.current = null
      }
    }

    for (const gesture of gestures) {
      if (!gesture.visible) continue

      const hovered = findTopWindowAt(nextWindows, gesture.x, gesture.y)
      if (!hoverWindowId && hovered) hoverWindowId = hovered.id

      if (!grabsRef.current[gesture.handIndex] && gesture.grabStarted && hovered) {
        grabsRef.current[gesture.handIndex] = {
          handIndex: gesture.handIndex,
          windowId: hovered.id,
          offsetX: gesture.x - hovered.x,
          offsetY: gesture.y - hovered.y
        }
        setNextWindows((current) => bringWindowToFront(current, hovered.id))
      }
    }

    const grabsByWindow = groupActiveGrabsByWindow(grabsRef.current, gesturesByHand)
    const resizeGroup = Object.entries(grabsByWindow).find(([, grabs]) => grabs.length >= 2)

    if (resizeGroup) {
      const [windowId, grabs] = resizeGroup
      const handIndexes = grabs.slice(0, 2).map((grab) => grab.handIndex).sort()
      const currentGestures = handIndexes.map((handIndex) => gesturesByHand.get(handIndex))
      const currentWindow = nextWindows.find((window) => window.id === windowId)

      if (currentWindow && currentGestures.every(Boolean)) {
        if (!isSameResize(resizeRef.current, windowId, handIndexes)) {
          resizeRef.current = createResizeSession(windowId, handIndexes, currentGestures, currentWindow)
        }
        setNextWindows((current) => resizeWindowWithGestures(current, resizeRef.current, currentGestures))
      }
    } else {
      resizeRef.current = null
    }

    if (!resizeRef.current) {
      for (const grab of Object.values(grabsRef.current)) {
        const gesture = gesturesByHand.get(grab.handIndex)
        if (!gesture?.visible || !gesture.pinching) continue
        setNextWindows((current) => moveWindowWithGesture(current, grab, gesture))
      }
    } else {
      const resizingHands = new Set(resizeRef.current.handIndexes)
      for (const grab of Object.values(grabsRef.current)) {
        if (resizingHands.has(grab.handIndex)) continue
        const gesture = gesturesByHand.get(grab.handIndex)
        if (!gesture?.visible || !gesture.pinching) continue
        setNextWindows((current) => moveWindowWithGesture(current, grab, gesture))
      }
    }

    if (windowsChanged) {
      windowsRef.current = nextWindows
      setWindows(nextWindows)
    }

    const now = performance.now()
    if (now - gestureUiTickRef.current > 70) {
      gestureUiTickRef.current = now
      setGestureUi({
        activeWindowIds: [...new Set(Object.values(grabsRef.current).map((grab) => grab.windowId))],
        resizingWindowId: resizeRef.current?.windowId ?? null,
        hoverWindowId,
        gestures
      })
    }
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚡</span>
          <span>TonySpark</span>
        </div>
        <div className="controls">
          <CameraSelector
            devices={devices}
            deviceId={deviceId}
            onChange={setDeviceId}
            onRefresh={refreshDevices}
          />
          <label className="toggle">
            <input type="checkbox" checked={showHands} onChange={(e) => setShowHands(e.target.checked)} />
            Mains
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showCursor} onChange={(e) => setShowCursor(e.target.checked)} />
            Curseur
          </label>
        </div>
        <div className="stats">
          <span>Mains: <b>{stats.hands}</b></span>
          <span>FPS: <b>{stats.fps}</b></span>
          <span> C1: <b>{formatCursor(stats.cursors?.[0])}</b></span>
          <span> C2: <b>{formatCursor(stats.cursors?.[1])}</b></span>
        </div>
      </header>

      <main className="stage">
        {permission === 'denied' && (
          <div className="overlay">
            <div className="card">
              <h2>Accès caméra refusé</h2>
              <p>Autorise la caméra dans ton navigateur puis recharge la page.</p>
              <button onClick={requestPermission}>Réessayer</button>
            </div>
          </div>
        )}
        {permission === 'granted' && !trackersReady && (
          <div className="overlay">
            <div className="card">
              <h2>Chargement des modèles…</h2>
              <p>Hand landmarker (MediaPipe).</p>
            </div>
          </div>
        )}
        {permission === 'granted' && trackersReady && stream && (
          <>
            <TrackingView
              stream={stream}
              trackers={trackersRef.current}
              showHands={showHands}
              showCursor={showCursor}
              onInteractions={handleInteractions}
              onStats={updateTrackingStats}
            />
            <GestureWindowLayer
              windows={windows}
              activeWindowIds={gestureUi.activeWindowIds}
              resizingWindowId={gestureUi.resizingWindowId}
              hoverWindowId={gestureUi.hoverWindowId}
              gestures={gestureUi.gestures}
              onReset={resetWindows}
            />
          </>
        )}
      </main>

      <footer className="footer">
        <span>Détection des mains locale dans le navigateur avec MediaPipe.</span>
      </footer>
    </div>
  )
}

function formatCursor(cursor) {
  if (!cursor) return '—'
  const mode = cursor.pinching ? ' grab' : ''
  return `${Math.round(cursor.x * 100)}%, ${Math.round(cursor.y * 100)}%${mode}`
}

function findTopWindowAt(windows, x, y) {
  return windows
    .filter((window) => (
      x >= window.x &&
      x <= window.x + window.w &&
      y >= window.y &&
      y <= window.y + window.h
    ))
    .sort((a, b) => b.z - a.z)[0] ?? null
}

function bringWindowToFront(windows, windowId) {
  const maxZ = Math.max(...windows.map((window) => window.z))
  return windows.map((window) => (
    window.id === windowId ? { ...window, z: maxZ + 1 } : window
  ))
}

function groupActiveGrabsByWindow(grabs, gesturesByHand) {
  return Object.values(grabs).reduce((groups, grab) => {
    const gesture = gesturesByHand.get(grab.handIndex)
    if (!gesture?.visible || !gesture.pinching) return groups
    groups[grab.windowId] ??= []
    groups[grab.windowId].push(grab)
    return groups
  }, {})
}

function moveWindowWithGesture(windows, activeGrab, gesture) {
  return windows.map((window) => {
    if (window.id !== activeGrab.windowId) return window
    return {
      ...window,
      x: clamp(gesture.x - activeGrab.offsetX, 0.01, 0.99 - window.w),
      y: clamp(gesture.y - activeGrab.offsetY, 0.01, 0.99 - window.h)
    }
  })
}

function createResizeSession(windowId, handIndexes, gestures, window) {
  const center = midpoint(gestures[0], gestures[1])
  const distance = Math.max(distanceBetween(gestures[0], gestures[1]), 0.01)

  return {
    windowId,
    handIndexes,
    startDistance: distance,
    startCenter: center,
    startWindow: {
      x: window.x,
      y: window.y,
      w: window.w,
      h: window.h
    }
  }
}

function resizeWindowWithGestures(windows, resize, gestures) {
  if (!resize) return windows

  const center = midpoint(gestures[0], gestures[1])
  const distance = Math.max(distanceBetween(gestures[0], gestures[1]), 0.01)
  const scale = clamp(distance / resize.startDistance, 0.55, 2.25)
  const nextW = clamp(resize.startWindow.w * scale, MIN_WINDOW_W, MAX_WINDOW_W)
  const nextH = clamp(resize.startWindow.h * scale, MIN_WINDOW_H, MAX_WINDOW_H)
  const appliedScaleX = nextW / resize.startWindow.w
  const appliedScaleY = nextH / resize.startWindow.h
  const topLeftOffsetX = resize.startWindow.x - resize.startCenter.x
  const topLeftOffsetY = resize.startWindow.y - resize.startCenter.y

  return windows.map((window) => {
    if (window.id !== resize.windowId) return window
    return {
      ...window,
      w: nextW,
      h: nextH,
      x: clamp(center.x + topLeftOffsetX * appliedScaleX, 0.01, 0.99 - nextW),
      y: clamp(center.y + topLeftOffsetY * appliedScaleY, 0.01, 0.99 - nextH)
    }
  })
}

function isSameResize(resize, windowId, handIndexes) {
  return Boolean(
    resize &&
    resize.windowId === windowId &&
    resize.handIndexes.length === handIndexes.length &&
    resize.handIndexes.every((handIndex, idx) => handIndex === handIndexes[idx])
  )
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
