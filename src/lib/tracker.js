import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export async function createTrackers() {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)

  const hand = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  })

  const face = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  })

  return {
    hand,
    face,
    close() {
      try { hand.close() } catch {}
      try { face.close() } catch {}
    }
  }
}

// Connectivity for a single hand — 21 landmarks.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
]

// FaceLandmarker landmark indices (MediaPipe FaceMesh canonical model).
export const FACE_LM = {
  // Left eye (user's left, shown on the right when mirrored)
  leftIrisCenter: 468,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  // Right eye
  rightIrisCenter: 473,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  rightEyeTop: 386,
  rightEyeBottom: 374,
  // Reference points on the face plane
  noseTip: 1,
  foreheadCenter: 10,
  chin: 152
}

/**
 * Estimate gaze as a 2D offset in normalized [-1, 1] eye-local coordinates.
 * Negative x = looking to screen-left, positive x = screen-right.
 * Negative y = looking up, positive y = down.
 * Without per-user calibration this is an approximation, not a fixation point.
 */
export function estimateGaze(landmarks) {
  const p = (i) => landmarks[i]
  const L = FACE_LM
  const lIris = p(L.leftIrisCenter)
  const rIris = p(L.rightIrisCenter)
  const lOuter = p(L.leftEyeOuter), lInner = p(L.leftEyeInner)
  const lTop = p(L.leftEyeTop), lBot = p(L.leftEyeBottom)
  const rOuter = p(L.rightEyeOuter), rInner = p(L.rightEyeInner)
  const rTop = p(L.rightEyeTop), rBot = p(L.rightEyeBottom)

  const leftCenter = { x: (lOuter.x + lInner.x) / 2, y: (lTop.y + lBot.y) / 2 }
  const rightCenter = { x: (rOuter.x + rInner.x) / 2, y: (rTop.y + rBot.y) / 2 }
  const leftW = Math.max(Math.abs(lInner.x - lOuter.x), 1e-5)
  const leftH = Math.max(Math.abs(lBot.y - lTop.y), 1e-5)
  const rightW = Math.max(Math.abs(rOuter.x - rInner.x), 1e-5)
  const rightH = Math.max(Math.abs(rBot.y - rTop.y), 1e-5)

  // Normalize iris offset by half-eye-size to get roughly [-1, 1].
  const leftGaze = {
    x: (lIris.x - leftCenter.x) / (leftW / 2),
    y: (lIris.y - leftCenter.y) / (leftH / 2)
  }
  const rightGaze = {
    x: (rIris.x - rightCenter.x) / (rightW / 2),
    y: (rIris.y - rightCenter.y) / (rightH / 2)
  }

  const gaze = {
    x: (leftGaze.x + rightGaze.x) / 2,
    y: (leftGaze.y + rightGaze.y) / 2
  }

  // Anchor the gaze ray at the midpoint between the eyes so it can be drawn
  // starting from the face in screen space.
  const anchor = {
    x: (leftCenter.x + rightCenter.x) / 2,
    y: (leftCenter.y + rightCenter.y) / 2
  }

  return { gaze, anchor, leftIris: lIris, rightIris: rIris, leftCenter, rightCenter }
}
