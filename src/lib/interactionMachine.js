export const HAND_INTERACTION_STATES = Object.freeze({
  IDLE: 'IDLE',
  POINTING: 'POINTING',
  HOVER: 'HOVER',
  DRAGGING: 'DRAGGING',
  RESIZING: 'RESIZING'
})

export function createInteractionMachine(count = 2) {
  return {
    hands: Array.from({ length: count }, (_, handIndex) => createHandMachine(handIndex)),
    resize: null
  }
}

export function stepInteractionMachine({
  machine,
  gestures,
  windows,
  frameTime,
  options,
  api
}) {
  const gesturesByHand = new Map(gestures.map((gesture) => [gesture.handIndex, gesture]))
  let nextWindows = windows

  const setNextWindows = (updater) => {
    const updated = updater(nextWindows)
    if (updated !== nextWindows) nextWindows = updated
  }

  const contextsByHand = new Map(
    gestures.map((gesture) => [
      gesture.handIndex,
      buildGestureContext(gesture, nextWindows, api.findTopWindowAt)
    ])
  )

  for (const hand of machine.hands) {
    syncHandMachine({
      machine,
      hand,
      context: contextsByHand.get(hand.handIndex),
      launchWindowInertia: api.launchWindowInertia
    })
  }

  for (const hand of machine.hands) {
    startHandInteraction({
      hand,
      context: contextsByHand.get(hand.handIndex),
      frameTime,
      setNextWindows,
      bringWindowToFront: api.bringWindowToFront,
      stopWindowInertia: api.stopWindowInertia
    })
  }

  const resizeGroup = findResizeGroup(machine.hands, gesturesByHand)
  if (resizeGroup) {
    const { windowId, hands } = resizeGroup
    const handIndexes = hands.map(({ hand }) => hand.handIndex).sort((a, b) => a - b)
    const resizeGestures = handIndexes.map((handIndex) => gesturesByHand.get(handIndex))
    const window = nextWindows.find((candidate) => candidate.id === windowId)

    if (window && resizeGestures.every(Boolean)) {
      if (!isSameResize(machine.resize, windowId, handIndexes)) {
        machine.resize = createResizeSession(windowId, handIndexes, resizeGestures, window)
      }
      setNextWindows((current) => resizeWindowWithGestures(current, machine.resize, resizeGestures, options))
    } else {
      machine.resize = null
    }
  } else {
    machine.resize = null
  }

  const resizingHands = new Set(machine.resize?.handIndexes ?? [])
  for (const hand of machine.hands) {
    const gesture = gesturesByHand.get(hand.handIndex)
    if (!hand.grab || !gesture?.visible || !gesture.pinching) continue

    if (resizingHands.has(hand.handIndex)) {
      hand.mode = HAND_INTERACTION_STATES.RESIZING
      continue
    }

    setNextWindows((current) => moveWindowWithGesture(current, hand.grab, gesture, frameTime, options))
    hand.mode = HAND_INTERACTION_STATES.DRAGGING
  }

  const hoverWindowId = getUiHoverWindowId(gestures, nextWindows, api.findTopWindowAt)

  return {
    windows: nextWindows,
    activeWindowIds: [...new Set(machine.hands.filter((hand) => hand.grab).map((hand) => hand.grab.windowId))],
    resizingWindowId: machine.resize?.windowId ?? null,
    hoverWindowId,
    gestures: gestures.map((gesture) => ({
      ...gesture,
      interactionState: machine.hands[gesture.handIndex]?.mode ?? HAND_INTERACTION_STATES.IDLE
    }))
  }
}

function createHandMachine(handIndex) {
  return {
    handIndex,
    mode: HAND_INTERACTION_STATES.IDLE,
    grab: null
  }
}

function buildGestureContext(gesture, windows, findTopWindowAt) {
  if (!gesture?.visible) {
    return {
      gesture,
      hoverWindow: null
    }
  }

  return {
    gesture,
    hoverWindow: findTopWindowAt(windows, gesture.x, gesture.y)
  }
}

function syncHandMachine({ machine, hand, context, launchWindowInertia }) {
  const gesture = context?.gesture
  if (!gesture?.visible) {
    if (isResizeParticipant(machine.resize, hand.handIndex, hand.grab?.windowId)) {
      machine.resize = null
    }
    hand.grab = null
    hand.mode = HAND_INTERACTION_STATES.IDLE
    return
  }

  if (!hand.grab) {
    hand.mode = getPassiveHandMode(context)
    return
  }

  if (gesture.pinchEnded || !gesture.pinching) {
    const wasResizing = isResizeParticipant(machine.resize, hand.handIndex, hand.grab.windowId)
    if (gesture.pinchEnded && !wasResizing) {
      launchWindowInertia(hand.grab.windowId, {
        vx: hand.grab.vx ?? 0,
        vy: hand.grab.vy ?? 0
      })
    }
    hand.grab = null
    if (wasResizing) machine.resize = null
    hand.mode = getPassiveHandMode(context)
    return
  }

  hand.mode = isResizeParticipant(machine.resize, hand.handIndex, hand.grab.windowId)
    ? HAND_INTERACTION_STATES.RESIZING
    : HAND_INTERACTION_STATES.DRAGGING
}

function startHandInteraction({
  hand,
  context,
  frameTime,
  setNextWindows,
  bringWindowToFront,
  stopWindowInertia
}) {
  if (hand.grab) return

  const gesture = context?.gesture
  if (!gesture?.visible) {
    hand.mode = HAND_INTERACTION_STATES.IDLE
    return
  }

  if (gesture.pinchStarted && context.hoverWindow) {
    stopWindowInertia(context.hoverWindow.id)
    hand.grab = {
      handIndex: hand.handIndex,
      windowId: context.hoverWindow.id,
      offsetX: gesture.x - context.hoverWindow.x,
      offsetY: gesture.y - context.hoverWindow.y,
      lastX: context.hoverWindow.x,
      lastY: context.hoverWindow.y,
      lastTime: frameTime,
      vx: 0,
      vy: 0
    }
    setNextWindows((current) => bringWindowToFront(current, context.hoverWindow.id))
    hand.mode = HAND_INTERACTION_STATES.DRAGGING
    return
  }

  hand.mode = getPassiveHandMode(context)
}

function getUiHoverWindowId(gestures, windows, findTopWindowAt) {
  for (const gesture of gestures) {
    if (!gesture.visible) continue
    const hoverWindow = findTopWindowAt(windows, gesture.x, gesture.y)
    if (hoverWindow) return hoverWindow.id
  }

  return null
}

function getPassiveHandMode(context) {
  if (!context?.gesture?.visible) return HAND_INTERACTION_STATES.IDLE
  if (context.hoverWindow) return HAND_INTERACTION_STATES.HOVER
  return HAND_INTERACTION_STATES.POINTING
}

function findResizeGroup(hands, gesturesByHand) {
  const groups = new Map()

  for (const hand of hands) {
    const gesture = gesturesByHand.get(hand.handIndex)
    if (!hand.grab || !gesture?.visible || !gesture.pinching) continue
    if (!groups.has(hand.grab.windowId)) groups.set(hand.grab.windowId, [])
    groups.get(hand.grab.windowId).push({ hand, gesture })
  }

  for (const [windowId, entries] of groups.entries()) {
    if (entries.length >= 2) {
      return {
        windowId,
        hands: entries.slice(0, 2)
      }
    }
  }

  return null
}

function moveWindowWithGesture(windows, activeGrab, gesture, frameTime, options) {
  return windows.map((window) => {
    if (window.id !== activeGrab.windowId) return window

    const { x, y } = clampWindowPosition(
      window,
      gesture.x - activeGrab.offsetX,
      gesture.y - activeGrab.offsetY,
      options.stageMargin
    )
    updateGrabVelocity(activeGrab, x, y, frameTime)
    return {
      ...window,
      x,
      y
    }
  })
}

function updateGrabVelocity(activeGrab, x, y, frameTime) {
  const dt = Math.max((frameTime - activeGrab.lastTime) / 1000, 0)
  if (dt > 0) {
    const nextVx = (x - activeGrab.lastX) / dt
    const nextVy = (y - activeGrab.lastY) / dt
    activeGrab.vx = activeGrab.vx * 0.35 + nextVx * 0.65
    activeGrab.vy = activeGrab.vy * 0.35 + nextVy * 0.65
  }

  activeGrab.lastX = x
  activeGrab.lastY = y
  activeGrab.lastTime = frameTime
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

function resizeWindowWithGestures(windows, resize, gestures, options) {
  if (!resize) return windows

  const center = midpoint(gestures[0], gestures[1])
  const distance = Math.max(distanceBetween(gestures[0], gestures[1]), 0.01)
  const scale = clamp(distance / resize.startDistance, 0.55, 2.25)
  const nextW = clamp(resize.startWindow.w * scale, options.minWindowW, options.maxWindowW)
  const nextH = clamp(resize.startWindow.h * scale, options.minWindowH, options.maxWindowH)
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
      x: clamp(center.x + topLeftOffsetX * appliedScaleX, options.stageMargin, 1 - options.stageMargin - nextW),
      y: clamp(center.y + topLeftOffsetY * appliedScaleY, options.stageMargin, 1 - options.stageMargin - nextH)
    }
  })
}

function clampWindowPosition(window, x, y, stageMargin) {
  return {
    x: clamp(x, stageMargin, 1 - stageMargin - window.w),
    y: clamp(y, stageMargin, 1 - stageMargin - window.h)
  }
}

function isSameResize(resize, windowId, handIndexes) {
  return Boolean(
    resize &&
    resize.windowId === windowId &&
    resize.handIndexes.length === handIndexes.length &&
    resize.handIndexes.every((handIndex, idx) => handIndex === handIndexes[idx])
  )
}

function isResizeParticipant(resize, handIndex, windowId) {
  return Boolean(
    resize &&
    resize.windowId === windowId &&
    resize.handIndexes.includes(handIndex)
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
