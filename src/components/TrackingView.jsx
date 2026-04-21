import { useEffect, useRef } from 'react'
import { HAND_CONNECTIONS, estimateGaze } from '../lib/tracker.js'

const HAND_COLORS = ['#7aa7ff', '#ffb86b'] // hand #1 / hand #2

export default function TrackingView({ stream, trackers, showHands, showGaze, onStats }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const lastTimestampRef = useRef(-1)
  const fpsRef = useRef({ frames: 0, last: performance.now(), value: 0 })
  // Low-pass filter for the estimated gaze point.
  const smoothedGazeRef = useRef(null)

  // Keep latest props without restarting the render loop.
  const showHandsRef = useRef(showHands)
  const showGazeRef = useRef(showGaze)
  const onStatsRef = useRef(onStats)
  showHandsRef.current = showHands
  showGazeRef.current = showGaze
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

      // Resize canvas to match video pixels.
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      // MediaPipe requires a strictly increasing timestamp.
      let ts = performance.now()
      if (ts <= lastTimestampRef.current) ts = lastTimestampRef.current + 1
      lastTimestampRef.current = ts

      let handResult = null
      let faceResult = null
      try {
        handResult = trackers.hand.detectForVideo(video, ts)
      } catch (e) { /* drop frame */ }
      try {
        faceResult = trackers.face.detectForVideo(video, ts)
      } catch (e) { /* drop frame */ }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Hands
      const hands = handResult?.landmarks ?? []
      if (showHandsRef.current && hands.length) {
        hands.forEach((lm, idx) => {
          drawHand(ctx, lm, canvas.width, canvas.height, HAND_COLORS[idx % HAND_COLORS.length])
        })
      }

      // Face / Gaze
      let faceDetected = false
      if (faceResult?.faceLandmarks?.length) {
        faceDetected = true
        const lm = faceResult.faceLandmarks[0]
        if (showGazeRef.current) {
          const g = estimateGaze(lm)
          drawGaze(ctx, g, canvas.width, canvas.height, smoothedGazeRef)
        }
      } else {
        smoothedGazeRef.current = null
      }

      // FPS
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
  }, [trackers])

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} />
    </>
  )
}

function drawHand(ctx, landmarks, w, h, color) {
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.fillStyle = color

  // Bones
  ctx.beginPath()
  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = landmarks[a], p2 = landmarks[b]
    ctx.moveTo(p1.x * w, p1.y * h)
    ctx.lineTo(p2.x * w, p2.y * h)
  }
  ctx.stroke()

  // Joints
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]
    const r = i === 0 ? 6 : 4 // wrist bigger
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

// Draws iris markers plus a smoothed gaze dot projected onto the frame.
function drawGaze(ctx, g, w, h, smoothRef) {
  const { gaze, anchor, leftIris, rightIris } = g

  // Iris markers
  ctx.fillStyle = 'rgba(255, 220, 120, 0.95)'
  for (const iris of [leftIris, rightIris]) {
    ctx.beginPath()
    ctx.arc(iris.x * w, iris.y * h, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Project the normalized gaze offset onto frame coordinates.
  // Sensitivity empirical; with calibration this would be fitted per user.
  const SENS_X = 0.9
  const SENS_Y = 0.6
  // Mirror x so the dot moves the same way the user perceives their gaze
  // (video is displayed with scaleX(-1) in CSS).
  const target = {
    x: Math.max(0, Math.min(1, anchor.x + gaze.x * SENS_X)),
    y: Math.max(0, Math.min(1, anchor.y + gaze.y * SENS_Y))
  }

  // Exponential smoothing
  const alpha = 0.25
  const prev = smoothRef.current
  const next = prev
    ? { x: prev.x + (target.x - prev.x) * alpha, y: prev.y + (target.y - prev.y) * alpha }
    : target
  smoothRef.current = next

  const sx = next.x * w
  const sy = next.y * h
  const ax = anchor.x * w
  const ay = anchor.y * h

  // Gaze ray
  ctx.strokeStyle = 'rgba(255, 120, 180, 0.55)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(sx, sy)
  ctx.stroke()
  ctx.setLineDash([])

  // Gaze target (crosshair)
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
