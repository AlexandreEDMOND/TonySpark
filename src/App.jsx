import { useCallback, useEffect, useRef, useState } from 'react'
import CameraSelector from './components/CameraSelector.jsx'
import GestureSettingsPanel from './components/GestureSettingsPanel.jsx'
import GestureWindowLayer from './components/GestureWindowLayer.jsx'
import TrackingView from './components/TrackingView.jsx'
import { createTrackers } from './lib/tracker.js'
import { DEFAULT_GESTURE_SETTINGS } from './lib/gestures.js'
import { createInteractionMachine, stepInteractionMachine } from './lib/interactionMachine.js'
import './App.css'

const INITIAL_WINDOWS = [
  {
    id: 'console',
    title: 'Console cible',
    body: "Utilise le pinch pouce-index pour saisir cette fenêtre, la déplacer puis la relâcher avec inertie.",
    tag: 'Pinch drag',
    status: 'glisser',
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
    body: "Deux mains en pinch sur la même fenêtre lancent le resize. Une seule main en pinch sert au déplacement.",
    tag: 'Pinch resize',
    status: 'deux mains',
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
    body: "Le panneau en haut à droite ne règle plus que les seuils de pinch pour stabiliser drag et resize.",
    tag: 'Tuning',
    status: 'pinch only',
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
const STAGE_MARGIN = 0.01
const INERTIA_FRICTION = 2.4
const INERTIA_MIN_SPEED = 0.45
const INERTIA_MAX_SPEED = 1.8
const INERTIA_THROW_MULTIPLIER = 0.82

export default function App() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [stream, setStream] = useState(null)
  const [permission, setPermission] = useState('pending') // pending | granted | denied
  const [trackersReady, setTrackersReady] = useState(false)
  const [stats, setStats] = useState({ hands: 0, fps: 0, cursors: [] })
  const [showHands, setShowHands] = useState(true)
  const [showCursor, setShowCursor] = useState(true)
  const [gestureSettings, setGestureSettings] = useState(DEFAULT_GESTURE_SETTINGS)
  const [windows, setWindows] = useState(INITIAL_WINDOWS)
  const [gestureUi, setGestureUi] = useState({
    activeWindowIds: [],
    resizingWindowId: null,
    hoverWindowId: null,
    gestures: []
  })
  const trackersRef = useRef(null)
  const windowsRef = useRef(INITIAL_WINDOWS)
  const interactionMachineRef = useRef(createInteractionMachine())
  const inertiaRef = useRef({})
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

  const stopWindowInertia = useCallback((windowId) => {
    const inertia = inertiaRef.current[windowId]
    if (inertia?.rafId) cancelAnimationFrame(inertia.rafId)
    delete inertiaRef.current[windowId]
  }, [])

  const stopAllWindowInertia = useCallback(() => {
    Object.values(inertiaRef.current).forEach((inertia) => {
      if (inertia?.rafId) cancelAnimationFrame(inertia.rafId)
    })
    inertiaRef.current = {}
  }, [])

  const launchWindowInertia = useCallback((windowId, velocity) => {
    stopWindowInertia(windowId)

    const speed = Math.hypot(velocity.vx, velocity.vy)
    if (speed < INERTIA_MIN_SPEED) return

    const speedScale = Math.min(1, INERTIA_MAX_SPEED / speed) * INERTIA_THROW_MULTIPLIER
    const session = {
      windowId,
      vx: velocity.vx * speedScale,
      vy: velocity.vy * speedScale,
      lastTime: performance.now(),
      rafId: 0
    }

    const tick = (time) => {
      const dt = Math.min((time - session.lastTime) / 1000, 0.05)
      session.lastTime = time

      let moved = false
      const nextWindows = windowsRef.current.map((window) => {
        if (window.id !== windowId) return window

        const wantedX = window.x + session.vx * dt
        const wantedY = window.y + session.vy * dt
        const { x, y } = clampWindowPosition(window, wantedX, wantedY)

        if (x !== wantedX) session.vx = 0
        if (y !== wantedY) session.vy = 0
        moved = moved || x !== window.x || y !== window.y

        return { ...window, x, y }
      })

      const decay = Math.exp(-INERTIA_FRICTION * dt)
      session.vx *= decay
      session.vy *= decay

      if (moved) {
        windowsRef.current = nextWindows
        setWindows(nextWindows)
      }

      if (Math.hypot(session.vx, session.vy) >= INERTIA_MIN_SPEED) {
        session.rafId = requestAnimationFrame(tick)
        return
      }

      if (inertiaRef.current[windowId] === session) {
        delete inertiaRef.current[windowId]
      }
    }

    inertiaRef.current[windowId] = session
    session.rafId = requestAnimationFrame(tick)
  }, [stopWindowInertia])

  useEffect(() => () => stopAllWindowInertia(), [stopAllWindowInertia])

  const handleGestureSettingChange = useCallback((key, value) => {
    setGestureSettings((current) => normalizeGestureSettings({ ...current, [key]: value }, key))
  }, [])

  const resetGestureSettings = useCallback(() => {
    setGestureSettings(DEFAULT_GESTURE_SETTINGS)
  }, [])

  const resetWindows = useCallback(() => {
    stopAllWindowInertia()
    interactionMachineRef.current = createInteractionMachine()
    windowsRef.current = INITIAL_WINDOWS
    setWindows(INITIAL_WINDOWS)
    setGestureUi((current) => ({
      ...current,
      activeWindowIds: [],
      resizingWindowId: null,
      hoverWindowId: null
    }))
  }, [stopAllWindowInertia])

  const handleInteractions = useCallback((gestures) => {
    const frameTime = performance.now()
    const currentWindows = windowsRef.current
    const nextInteraction = stepInteractionMachine({
      machine: interactionMachineRef.current,
      gestures,
      windows: currentWindows,
      frameTime,
      options: {
        stageMargin: STAGE_MARGIN,
        minWindowW: MIN_WINDOW_W,
        minWindowH: MIN_WINDOW_H,
        maxWindowW: MAX_WINDOW_W,
        maxWindowH: MAX_WINDOW_H
      },
      api: {
        findTopWindowAt,
        bringWindowToFront,
        stopWindowInertia,
        launchWindowInertia
      }
    })

    if (nextInteraction.windows !== currentWindows) {
      windowsRef.current = nextInteraction.windows
      setWindows(nextInteraction.windows)
    }

    const now = performance.now()
    if (now - gestureUiTickRef.current > 70) {
      gestureUiTickRef.current = now
      setGestureUi({
        activeWindowIds: nextInteraction.activeWindowIds,
        resizingWindowId: nextInteraction.resizingWindowId,
        hoverWindowId: nextInteraction.hoverWindowId,
        gestures: nextInteraction.gestures
      })
    }
  }, [launchWindowInertia, stopWindowInertia])

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
              gestureSettings={gestureSettings}
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
            <GestureSettingsPanel
              settings={gestureSettings}
              onChange={handleGestureSettingChange}
              onReset={resetGestureSettings}
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
  const mode = cursor.pinching ? ' pinch' : ''
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

function clampWindowPosition(window, x, y) {
  return {
    x: clamp(x, STAGE_MARGIN, 1 - STAGE_MARGIN - window.w),
    y: clamp(y, STAGE_MARGIN, 1 - STAGE_MARGIN - window.h)
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeGestureSettings(settings, changedKey) {
  const next = {
    pinchGrabRatio: clamp(settings.pinchGrabRatio, 0.12, 0.6),
    pinchReleaseRatio: clamp(settings.pinchReleaseRatio, 0.16, 0.8)
  }

  if (next.pinchGrabRatio >= next.pinchReleaseRatio) {
    if (changedKey === 'pinchReleaseRatio') {
      next.pinchGrabRatio = clamp(next.pinchReleaseRatio - 0.02, 0.12, 0.6)
    } else {
      next.pinchReleaseRatio = clamp(next.pinchGrabRatio + 0.02, 0.16, 0.8)
    }
  }

  return next
}
