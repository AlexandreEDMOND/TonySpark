import { useEffect, useRef } from 'react'
import { HAND_CONNECTIONS, estimateGaze } from '../lib/tracker.js'
import { applyCalibration } from '../lib/calibration.js'
import { OneEuroFilter2D } from '../lib/oneEuro.js'

const HAND_COLORS = ['#7aa7ff', '#ffb86b'] // hand #1 / hand #2

export default function TrackingView({
  stream,
  trackers,
  showHands,
  showGaze,
  calibration,
  latestGazeRef,
  onStats
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const targetRef = useRef(null)
  const rafRef = useRef(0)
  const lastTimestampRef = useRef(-1)
  const fpsRef = useRef({ frames: 0, last: performance.now(), value: 0 })
  const gazeFilterRef = useRef(new OneEuroFilter2D({ minCutoff: 1.2, beta: 0.02, dCutoff: 1.0 }))

  // Keep latest props without restarting the render loop.
  const showHandsRef = useRef(showHands)
  const showGazeRef = useRef(showGaze)
  const calibrationRef = useRef(calibration)
  const onStatsRef = useRef(onStats)
  showHandsRef.current = showHands
  showGazeRef.current = showGaze
  calibrationRef.current = calibration
  onStatsRef.current = onStats

  // Bind the MediaStream to the <video>.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    const onLoaded = () => video.play().catch(() => {})
    video.addEventListener('loadedmetadata', onLoaded)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.srcObject = null
    }
  }, [stream])

  // Detection + render loop.
  useEffect(() => {
    if (!trackers) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      if (video.readyState < 2 || video.videoWidth === 0) return

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      let ts = performance.now()
      if (ts <= lastTimestampRef.current) ts = lastTimestampRef.current + 1
      lastTimestampRef.current = ts

      let handResult = null
      let faceResult = null
      try { handResult = trackers.hand.detectForVideo(video, ts) } catch {}
      try { faceResult = trackers.face.detectForVideo(video, ts) } catch {}

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const hands = handResult?.landmarks ?? []
      if (showHandsRef.current && hands.length) {
        hands.forEach((lm, idx) => {
          drawHand(ctx, lm, canvas.width, canvas.height, HAND_COLORS[idx % HAND_COLORS.length])
        })
      }

      let faceDetected = false
      const target = targetRef.current
      if (faceResult?.faceLandmarks?.length) {
        faceDetected = true
        const lm = faceResult.faceLandmarks[0]
        const g = estimateGaze(lm)

        // Expose raw gaze for the calibration overlay.
        if (latestGazeRef) latestGazeRef.current = { gx: g.gaze.x, gy: g.gaze.y }

        if (showGazeRef.current) {
          drawIrisMarkers(ctx, g, canvas.width, canvas.height)

          if (calibrationRef.current) {
            const screen = applyCalibration(calibrationRef.current, g.gaze.x, g.gaze.y)
            const smoothed = gazeFilterRef.current.filter(screen, ts)
            if (target) {
              target.style.display = 'block'
              target.style.left = `${clamp01(smoothed.x) * 100}%`
              target.style.top = `${clamp01(smoothed.y) * 100}%`
            }
          } else {
            if (target) target.style.display = 'none'
            drawUncalibratedGaze(ctx, g, canvas.width, canvas.height, gazeFilterRef.current, ts)
          }
        } else {
          if (target) target.style.display = 'none'
        }
      } else {
        if (latestGazeRef) latestGazeRef.current = null
        gazeFilterRef.current.reset()
        if (target) target.style.display = 'none'
      }

      const f = fpsRef.current
      f.frames += 1
      const now = performance.now()
      if (now - f.last >= 500) {
        f.value = Math.round((f.frames * 1000) / (now - f.last))
        f.frames = 0
        f.last = now
        onStatsRef.current?.({ hands: hands.length, faceDetected, fps: f.value })
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [trackers, latestGazeRef])

  // Reset the filter when calibration changes so stale state doesn't leak across models.
  useEffect(() => {
    gazeFilterRef.current.reset()
  }, [calibration])

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} />
      <div ref={targetRef} className="gaze-target" style={{ display: 'none' }} />
    </>
  )
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function drawHand(ctx, landmarks, w, h, color) {
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.fillStyle = color

  ctx.beginPath()
  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = landmarks[a], p2 = landmarks[b]
    ctx.moveTo(p1.x * w, p1.y * h)
    ctx.lineTo(p2.x * w, p2.y * h)
  }
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]
    const r = i === 0 ? 6 : 4
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]
    const r = i === 0 ? 6 : 4
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawIrisMarkers(ctx, g, w, h) {
  ctx.fillStyle = 'rgba(255, 220, 120, 0.95)'
  for (const iris of [g.leftIris, g.rightIris]) {
    ctx.beginPath()
    ctx.arc(iris.x * w, iris.y * h, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Fallback crosshair before calibration: anchor-projected gaze with hardcoded sensitivity.
function drawUncalibratedGaze(ctx, g, w, h, filter, ts) {
  const SENS_X = 0.9
  const SENS_Y = 0.6
  const target = {
    x: clamp01(g.anchor.x + g.gaze.x * SENS_X),
    y: clamp01(g.anchor.y + g.gaze.y * SENS_Y)
  }
  const smoothed = filter.filter(target, ts)
  const sx = smoothed.x * w
  const sy = smoothed.y * h
  const ax = g.anchor.x * w
  const ay = g.anchor.y * h

  ctx.strokeStyle = 'rgba(255, 120, 180, 0.55)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(sx, sy)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(255, 120, 180, 0.25)'
  ctx.beginPath()
  ctx.arc(sx, sy, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 120, 180, 1)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(sx, sy, 10, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(sx - 14, sy); ctx.lineTo(sx + 14, sy)
  ctx.moveTo(sx, sy - 14); ctx.lineTo(sx, sy + 14)
  ctx.stroke()
}
