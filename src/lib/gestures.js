const PINCH_GRAB_RATIO = 0.22
const PINCH_RELEASE_RATIO = 0.25
const PINCH_FRAMES = 2

export const DEFAULT_GESTURE_SETTINGS = Object.freeze({
  pinchGrabRatio: PINCH_GRAB_RATIO,
  pinchReleaseRatio: PINCH_RELEASE_RATIO
})

export function createHandInteractionState(count = 2) {
  return Array.from({ length: count }, () => ({
    x: 0.5,
    y: 0.5,
    visible: false,
    initialized: false,
    pinching: false,
    pinchFrames: 0,
    pinchRatio: null
  }))
}

export function updateHandInteractions(states, hands, settings = DEFAULT_GESTURE_SETTINGS) {
  states.forEach((state, idx) => {
    updateHandInteraction(state, hands[idx], settings)
  })
  return states.map((state, idx) => ({
    handIndex: idx,
    x: state.x,
    y: state.y,
    visible: state.visible,
    pinching: state.pinching,
    pinchStarted: state.pinchStarted,
    pinchEnded: state.pinchEnded,
    pinchRatio: state.pinchRatio
  }))
}

function updateHandInteraction(state, landmarks, settings) {
  const wasPinching = state.pinching
  state.pinchStarted = false
  state.pinchEnded = false

  const indexTip = landmarks?.[8]
  if (!indexTip) {
    state.visible = false
    state.pinching = false
    state.pinchFrames = 0
    state.pinchRatio = null
    state.pinchEnded = wasPinching
    return
  }

  const nextX = clamp01(1 - indexTip.x)
  const nextY = clamp01(indexTip.y)
  const smoothing = state.initialized ? 0.28 : 1
  state.x += (nextX - state.x) * smoothing
  state.y += (nextY - state.y) * smoothing
  state.visible = true
  state.initialized = true

  const pinchRatio = getPinchRatio(landmarks)
  state.pinchRatio = pinchRatio

  if (pinchRatio == null) {
    state.pinching = false
    state.pinchFrames = 0
    state.pinchEnded = wasPinching
  } else {
    const wantsPinch = state.pinching
      ? pinchRatio < settings.pinchReleaseRatio
      : pinchRatio < settings.pinchGrabRatio

    if (!state.pinching && wantsPinch) {
      state.pinchFrames += 1
      if (state.pinchFrames >= PINCH_FRAMES) {
        state.pinching = true
        state.pinchStarted = true
      }
    } else if (state.pinching && !wantsPinch) {
      state.pinching = false
      state.pinchFrames = 0
      state.pinchEnded = true
    } else if (!wantsPinch) {
      state.pinchFrames = 0
    }
  }
}

function distance(a, b) {
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.hypot(a.x - b.x, a.y - b.y, dz)
}

export function getPinchRatio(landmarks) {
  const thumbTip = landmarks?.[4]
  const indexTip = landmarks?.[8]
  const wrist = landmarks?.[0]
  const middleKnuckle = landmarks?.[9]
  if (!thumbTip || !indexTip || !wrist || !middleKnuckle) return null

  const palmSize = distance(wrist, middleKnuckle)
  if (palmSize < 0.01) return null

  return distance(thumbTip, indexTip) / palmSize
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}
