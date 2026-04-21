// One Euro filter — adaptive low-pass that widens the cutoff during fast motion
// so small jitter is smoothed but saccades pass through. Casiez et al., 2012.

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.05, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.reset()
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  // t in milliseconds (performance.now() style)
  filter(x, t) {
    if (this.tPrev === null) {
      this.tPrev = t
      this.xPrev = x
      return x
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-4)
    const dx = (x - this.xPrev) / dt
    const aD = this._alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this._alpha(cutoff, dt)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.tPrev = t
    return xHat
  }
}

export class OneEuroFilter2D {
  constructor(options) {
    this.fx = new OneEuroFilter(options)
    this.fy = new OneEuroFilter(options)
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
  }

  filter(p, t) {
    return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) }
  }
}
