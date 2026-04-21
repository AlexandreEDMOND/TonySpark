import { useEffect, useRef, useState } from 'react'
import { fitCalibration } from '../lib/calibration.js'

// 9-point grid, inset from the edges so targets stay inside the camera FOV.
const TARGETS = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]
]

const DWELL_MS = 800    // let the eye settle before sampling
const CAPTURE_MS = 1200 // sampling window per target

export default function CalibrationOverlay({ latestGazeRef, onComplete, onCancel }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('dwell')
  const [progress, setProgress] = useState(0)
  const [remainingMs, setRemainingMs] = useState(DWELL_MS)
  const samplesRef = useRef([])

  // Stabilize callbacks so the effect doesn't restart every time the parent re-renders.
  const onCompleteRef = useRef(onComplete)
  const onCancelRef = useRef(onCancel)
  onCompleteRef.current = onComplete
  onCancelRef.current = onCancel

  useEffect(() => {
    if (index >= TARGETS.length) {
      const model = fitCalibration(samplesRef.current)
      if (model) onCompleteRef.current(model)
      else onCancelRef.current()
      return
    }

    const [tx, ty] = TARGETS[index]
    let rafId = 0
    let localPhase = 'dwell'
    let phaseStart = performance.now()

    setPhase('dwell')
    setProgress(0)
    setRemainingMs(DWELL_MS)

    const captureInterval = setInterval(() => {
      if (localPhase !== 'capture') return
      const g = latestGazeRef.current
      if (g && Number.isFinite(g.gx) && Number.isFinite(g.gy)) {
        samplesRef.current.push({ gx: g.gx, gy: g.gy, sx: tx, sy: ty })
      }
    }, 40)

    const step = () => {
      const now = performance.now()
      const elapsed = now - phaseStart
      const total = localPhase === 'dwell' ? DWELL_MS : CAPTURE_MS
      setProgress(Math.min(1, elapsed / total))
      setRemainingMs(Math.max(0, total - elapsed))

      if (elapsed >= total) {
        if (localPhase === 'dwell') {
          localPhase = 'capture'
          phaseStart = performance.now()
          setPhase('capture')
          setProgress(0)
          setRemainingMs(CAPTURE_MS)
        } else {
          setIndex((i) => i + 1)
          return
        }
      }
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(captureInterval)
    }
  }, [index, latestGazeRef])

  if (index >= TARGETS.length) return null
  const [tx, ty] = TARGETS[index]
  const seconds = (remainingMs / 1000).toFixed(1)
  const phaseLabel = phase === 'dwell' ? 'Prépare-toi…' : 'Capture en cours'

  return (
    <div className="calibration-overlay">
      <div className="calibration-hud">
        <span>Point {index + 1}/{TARGETS.length} — {phaseLabel}</span>
        <button type="button" onClick={() => onCancelRef.current()}>Annuler</button>
      </div>
      <div
        className={`calibration-target ${phase}`}
        style={{
          left: `${tx * 100}%`,
          top: `${ty * 100}%`,
          '--progress': progress
        }}
      >
        <span className="calibration-countdown">{seconds}s</span>
      </div>
    </div>
  )
}
