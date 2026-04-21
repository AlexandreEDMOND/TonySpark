// Maps raw iris-offset gaze (gx, gy) to normalized screen position (sx, sy)
// using a 2nd-order polynomial fitted by least-squares on calibration samples.
// 9 training points × 6 features (1, gx, gy, gx*gy, gx², gy²) is well-posed.

const N_FEATURES = 6

function features(gx, gy) {
  return [1, gx, gy, gx * gy, gx * gx, gy * gy]
}

// Gauss-Jordan with partial pivoting. Solves A x = b in place. Returns null on singular.
function solve(A, b) {
  const n = A.length
  for (let i = 0; i < n; i++) {
    let piv = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r
    }
    if (piv !== i) {
      const tmp = A[i]; A[i] = A[piv]; A[piv] = tmp
      const tmpB = b[i]; b[i] = b[piv]; b[piv] = tmpB
    }
    const pv = A[i][i]
    if (Math.abs(pv) < 1e-12) return null
    for (let j = i; j < n; j++) A[i][j] /= pv
    b[i] /= pv
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = A[r][i]
      if (f === 0) continue
      for (let j = i; j < n; j++) A[r][j] -= f * A[i][j]
      b[r] -= f * b[i]
    }
  }
  return b
}

// samples: Array<{ gx, gy, sx, sy }>, screen coords normalized to [0, 1].
export function fitCalibration(samples) {
  if (!samples || samples.length < N_FEATURES) return null
  const AtA = Array.from({ length: N_FEATURES }, () => Array(N_FEATURES).fill(0))
  const AtBx = Array(N_FEATURES).fill(0)
  const AtBy = Array(N_FEATURES).fill(0)
  for (const s of samples) {
    const f = features(s.gx, s.gy)
    for (let i = 0; i < N_FEATURES; i++) {
      for (let j = 0; j < N_FEATURES; j++) AtA[i][j] += f[i] * f[j]
      AtBx[i] += f[i] * s.sx
      AtBy[i] += f[i] * s.sy
    }
  }
  const coefX = solve(AtA.map((r) => r.slice()), AtBx.slice())
  const coefY = solve(AtA.map((r) => r.slice()), AtBy.slice())
  if (!coefX || !coefY) return null
  return { coefX, coefY }
}

export function applyCalibration(model, gx, gy) {
  const f = features(gx, gy)
  let sx = 0, sy = 0
  for (let i = 0; i < N_FEATURES; i++) {
    sx += f[i] * model.coefX[i]
    sy += f[i] * model.coefY[i]
  }
  return { x: sx, y: sy }
}
