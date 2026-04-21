import { useCallback, useEffect, useRef, useState } from 'react'
import CameraSelector from './components/CameraSelector.jsx'
import TrackingView from './components/TrackingView.jsx'
import { createTrackers } from './lib/tracker.js'
import './App.css'

export default function App() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [stream, setStream] = useState(null)
  const [permission, setPermission] = useState('pending') // pending | granted | denied
  const [trackersReady, setTrackersReady] = useState(false)
  const [stats, setStats] = useState({ hands: 0, faceDetected: false, fps: 0 })
  const [showHands, setShowHands] = useState(true)
  const [showGaze, setShowGaze] = useState(true)
  const trackersRef = useRef(null)

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

  // Open the selected camera.
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
            <input type="checkbox" checked={showGaze} onChange={(e) => setShowGaze(e.target.checked)} />
            Regard
          </label>
        </div>
        <div className="stats">
          <span>Mains: <b>{stats.hands}</b></span>
          <span>Visage: <b>{stats.faceDetected ? 'oui' : 'non'}</b></span>
          <span>FPS: <b>{stats.fps}</b></span>
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
              <p>Hand &amp; Face landmarker (MediaPipe).</p>
            </div>
          </div>
        )}
        {permission === 'granted' && trackersReady && stream && (
          <TrackingView
            stream={stream}
            trackers={trackersRef.current}
            showHands={showHands}
            showGaze={showGaze}
            onStats={setStats}
          />
        )}
      </main>

      <footer className="footer">
        <span>Les modèles tournent en local dans ton navigateur — aucune image n'est envoyée sur le réseau.</span>
      </footer>
    </div>
  )
}
