import { useEffect, useRef } from 'react'
import { HAND_CONNECTIONS } from '../lib/tracker.js'
import { createHandInteractionState, updateHandInteractions } from '../lib/gestures.js'

const HAND_COLORS = ['#7aa7ff', '#ffb86b'] // hand #1 / hand #2

export default function TrackingView({
  stream,
  trackers,
  gestureSettings,
  showHands,
  showCursor,
  onInteractions,
  onStats
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const lastTimestampRef = useRef(-1)
  const fpsRef = useRef({ frames: 0, last: performance.now(), value: 0 })

  // Keep latest props without restarting the render loop.
  const showHandsRef = useRef(showHands)
  const showCursorRef = useRef(showCursor)
  const gestureSettingsRef = useRef(gestureSettings)
  const onStatsRef = useRef(onStats)
  const onInteractionsRef = useRef(onInteractions)
  const interactionsRef = useRef(createHandInteractionState())
  showHandsRef.current = showHands
  showCursorRef.current = showCursor
  gestureSettingsRef.current = gestureSettings
  onStatsRef.current = onStats
  onInteractionsRef.current = onInteractions

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
      try { handResult = trackers.hand.detectForVideo(video, ts) } catch {}

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const hands = handResult?.landmarks ?? []
      if (showHandsRef.current && hands.length) {
        hands.forEach((lm, idx) => {
          drawHand(ctx, lm, canvas.width, canvas.height, HAND_COLORS[idx % HAND_COLORS.length])
        })
      }

      const interactions = updateHandInteractions(interactionsRef.current, hands, gestureSettingsRef.current)
      const stageInteractions = mapInteractionsToElement(interactions, canvas)
      onInteractionsRef.current?.(stageInteractions)

      if (showCursorRef.current) {
        interactions.forEach((interaction, idx) => {
          drawVirtualCursor(ctx, interaction, canvas.width, canvas.height, HAND_COLORS[idx % HAND_COLORS.length], idx + 1)
        })
      }

      const f = fpsRef.current
      f.frames += 1
      const now = performance.now()
      if (now - f.last >= 500) {
        f.value = Math.round((f.frames * 1000) / (now - f.last))
        f.frames = 0
        f.last = now
        onStatsRef.current?.({
          hands: hands.length,
          fps: f.value,
          cursors: stageInteractions.map((interaction) => (
            interaction.visible ? {
              x: interaction.x,
              y: interaction.y,
              pinching: interaction.pinching,
              pinchRatio: interaction.pinchRatio
            } : null
          ))
        })
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

function drawVirtualCursor(ctx, cursor, w, h, color, label) {
  if (!cursor.visible) return

  // The canvas is mirrored in CSS, so draw the inverse X to display natural screen coordinates.
  const x = (1 - cursor.x) * w
  const y = cursor.y * h
  const outer = cursor.pinching ? 30 : 22
  const inner = cursor.pinching ? 10 : 5

  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 18
  ctx.strokeStyle = color
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 3

  ctx.beginPath()
  ctx.arc(x, y, outer, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, inner, 0, Math.PI * 2)
  ctx.fill()

  if (cursor.pinching) {
    ctx.fillStyle = color
    ctx.globalAlpha = 0.22
    ctx.beginPath()
    ctx.arc(x, y, outer + 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.shadowBlur = 12
  ctx.fillStyle = color
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const stateLabel = cursor.pinching ? `PINCH ${label}` : String(label)
  ctx.fillText(stateLabel, x, y - 46)

  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 34, y)
  ctx.lineTo(x - 14, y)
  ctx.moveTo(x + 14, y)
  ctx.lineTo(x + 34, y)
  ctx.moveTo(x, y - 34)
  ctx.lineTo(x, y - 14)
  ctx.moveTo(x, y + 14)
  ctx.lineTo(x, y + 34)
  ctx.stroke()
  ctx.restore()
}

function mapInteractionsToElement(interactions, element) {
  const elementWidth = element.clientWidth
  const elementHeight = element.clientHeight
  const sourceWidth = element.width
  const sourceHeight = element.height
  const rect = element.getBoundingClientRect()

  if (!elementWidth || !elementHeight || !sourceWidth || !sourceHeight) return interactions

  const sourceRatio = sourceWidth / sourceHeight
  const elementRatio = elementWidth / elementHeight
  let drawnWidth = elementWidth
  let drawnHeight = elementHeight
  let offsetX = 0
  let offsetY = 0

  if (elementRatio > sourceRatio) {
    drawnWidth = elementHeight * sourceRatio
    offsetX = (elementWidth - drawnWidth) / 2
  } else {
    drawnHeight = elementWidth / sourceRatio
    offsetY = (elementHeight - drawnHeight) / 2
  }

  return interactions.map((interaction) => {
    if (!interaction.visible) return interaction
    return {
      ...interaction,
      videoX: interaction.x,
      videoY: interaction.y,
      x: (offsetX + interaction.x * drawnWidth) / elementWidth,
      y: (offsetY + interaction.y * drawnHeight) / elementHeight,
      clientX: rect.left + offsetX + interaction.x * drawnWidth,
      clientY: rect.top + offsetY + interaction.y * drawnHeight
    }
  })
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
