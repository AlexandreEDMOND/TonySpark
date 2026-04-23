const GRAB_RATIO = 0.38
const RELEASE_RATIO = 0.52
const GRAB_FRAMES = 2

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

export function updateHandInteractions(states, hands) {
  states.forEach((state, idx) => {
    updateHandInteraction(state, hands[idx], idx)
  })
  return states.map((state, idx) => ({
    handIndex: idx,
    x: state.x,
    y: state.y,
    visible: state.visible,
    pinching: state.pinching,
    grabStarted: state.grabStarted,
    grabEnded: state.grabEnded,
    pinchRatio: state.pinchRatio
  }))
}

function updateHandInteraction(state, landmarks) {
  const wasPinching = state.pinching
  state.grabStarted = false
  state.grabEnded = false

  const indexTip = landmarks?.[8]
  if (!indexTip) {
    state.visible = false
    state.pinching = false
    state.pinchFrames = 0
    state.pinchRatio = null
    state.grabEnded = wasPinching
    return
  }

  const nextX = clamp01(1 - indexTip.x)
  const nextY = clamp01(indexTip.y)
  const smoothing = state.initialized ? 0.28 : 1
  state.x += (nextX - state.x) * smoothing
  state.y += (nextY - state.y) * smoothing
  state.visible = true
  state.initialized = true

  const ratio = getPinchRatio(landmarks)
  state.pinchRatio = ratio

  if (ratio == null) {
    state.pinching = false
    state.pinchFrames = 0
    state.grabEnded = wasPinching
    return
  }

  const wantsPinch = state.pinching ? ratio < RELEASE_RATIO : ratio < GRAB_RATIO

  if (!state.pinching && wantsPinch) {
    state.pinchFrames += 1
    if (state.pinchFrames >= GRAB_FRAMES) {
      state.pinching = true
      state.grabStarted = true
    }
    return
  }

  if (state.pinching && !wantsPinch) {
    state.pinching = false
    state.pinchFrames = 0
    state.grabEnded = true
    return
  }

  if (!wantsPinch) state.pinchFrames = 0
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

function distance(a, b) {
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.hypot(a.x - b.x, a.y - b.y, dz)
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}
