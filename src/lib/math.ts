/**
 * Motion primitives.
 *
 * House rule for this project: nothing is ever linearly interpolated on screen.
 * Every value that a viewer can perceive moving goes through one of these curves.
 * `linear` exists only as a building block for the others.
 */

export const clamp = (v: number, min = 0, max = 1) => (v < min ? min : v > max ? max : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Map `v` from one range to another, clamped. */
export const remap = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  lerp(outMin, outMax, clamp((v - inMin) / (inMax - inMin)))

/** Unclamped variant, for values that are meant to overshoot. */
export const remapU = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  lerp(outMin, outMax, (v - inMin) / (inMax - inMin))

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Ken Perlin's smootherstep — zero 1st *and* 2nd derivative at the ends. */
export const smootherstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Frame-rate independent exponential approach. `lambda` is roughly "how many
 * e-foldings per second", so the result is identical at 30 and 144 fps — a plain
 * `lerp(current, target, 0.1)` is not, and visibly changes feel between machines.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

// ---------------------------------------------------------------------------
// Easing curves
// ---------------------------------------------------------------------------

export const easeInQuad = (t: number) => t * t
export const easeOutQuad = (t: number) => t * (2 - t)
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)

export const easeInCubic = (t: number) => t * t * t
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeInQuart = (t: number) => t * t * t * t
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)
export const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export const easeInQuint = (t: number) => t * t * t * t * t
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)

export const easeInExpo = (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10))
export const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeInOutExpo = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2

export const easeOutCirc = (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2))
export const easeInOutCirc = (t: number) =>
  t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2

/** Overshoots then settles — the "arrival" curve for planets locking into frame. */
export const easeOutBack = (t: number, overshoot = 1.42) => {
  const c3 = overshoot + 1
  return 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2)
}

/** Damped spring settle. Used where an object should arrive with weight. */
export const easeOutElastic = (t: number, amplitude = 1, period = 0.34) => {
  if (t === 0 || t === 1) return t
  const s = (period / (2 * Math.PI)) * Math.asin(1 / Math.max(1, amplitude))
  return amplitude * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1
}

/**
 * Cubic bézier easing, matching the CSS `cubic-bezier(x1, y1, x2, y2)` contract.
 * Returns a reusable function; solving is Newton–Raphson with a bisection fallback,
 * which is what browsers do internally.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a
  const B = (a: number, b: number) => 3 * b - 6 * a
  const C = (a: number) => 3 * a

  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t
  const slope = (t: number, a: number, b: number) =>
    3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a)

  if (x1 === y1 && x2 === y2) return (t: number) => t

  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1

    let guess = t
    for (let i = 0; i < 8; i++) {
      const currentSlope = slope(guess, x1, x2)
      if (currentSlope === 0) break
      const currentX = calc(guess, x1, x2) - t
      guess -= currentX / currentSlope
    }

    // Newton can wander outside [0,1] on very flat curves; clamp by bisecting.
    if (guess < 0 || guess > 1) {
      let lo = 0
      let hi = 1
      guess = t
      for (let i = 0; i < 20; i++) {
        const currentX = calc(guess, x1, x2)
        if (Math.abs(currentX - t) < 1e-6) break
        if (currentX > t) hi = guess
        else lo = guess
        guess = (lo + hi) / 2
      }
    }

    return calc(guess, y1, y2)
  }
}

/**
 * Named curves used across the film, so the motion language stays consistent.
 * These are the only easings scene code should reach for by default.
 */
export const EASE = {
  /** Standard reveal — slow start, confident finish. */
  reveal: cubicBezier(0.16, 1, 0.3, 1),
  /** Camera dolly — heavy object, gradual acceleration and deceleration. */
  dolly: cubicBezier(0.65, 0.05, 0.36, 1),
  /** Whip-pan — violent acceleration, long settle. */
  whip: cubicBezier(0.85, 0, 0.15, 1),
  /** Hyperspace ramp — barely moves, then everything at once. */
  hyper: cubicBezier(0.95, 0.02, 0.55, 0.99),
  /** Text in — fast, no bounce, immediately legible. */
  text: cubicBezier(0.22, 1, 0.36, 1),
  /** UI hover / magnetic pull. */
  ui: cubicBezier(0.33, 1, 0.68, 1),
} as const

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/**
 * Classic 3D simplex noise (Ashima/Gustavson formulation), CPU side.
 * Used for handheld camera micro-drift and any per-frame organic offset.
 * The GPU equivalents live in src/shaders/lib.ts.
 */
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
])

const PERM = new Uint8Array(512)
const PERM_MOD12 = new Uint8Array(512)
{
  // Deterministic seed: the same "random" drift on every load and every machine,
  // so a recorded scroll-through is reproducible.
  let seed = 1337
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const j = seed % (i + 1)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255]
    PERM_MOD12[i] = PERM[i] % 12
  }
}

const F3 = 1 / 3
const G3 = 1 / 6

export function simplex3(xin: number, yin: number, zin: number): number {
  const s = (xin + yin + zin) * F3
  const i = Math.floor(xin + s)
  const j = Math.floor(yin + s)
  const k = Math.floor(zin + s)
  const t = (i + j + k) * G3

  const x0 = xin - (i - t)
  const y0 = yin - (j - t)
  const z0 = zin - (k - t)

  let i1: number, j1: number, k1: number
  let i2: number, j2: number, k2: number

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    }
  }

  const x1 = x0 - i1 + G3
  const y1 = y0 - j1 + G3
  const z1 = z0 - k1 + G3
  const x2 = x0 - i2 + 2 * G3
  const y2 = y0 - j2 + 2 * G3
  const z2 = z0 - k2 + 2 * G3
  const x3 = x0 - 1 + 3 * G3
  const y3 = y0 - 1 + 3 * G3
  const z3 = z0 - 1 + 3 * G3

  const ii = i & 255
  const jj = j & 255
  const kk = k & 255

  let n = 0

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
  if (t0 > 0) {
    const gi0 = PERM_MOD12[ii + PERM[jj + PERM[kk]]] * 3
    t0 *= t0
    n += t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0 + GRAD3[gi0 + 2] * z0)
  }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
  if (t1 > 0) {
    const gi1 = PERM_MOD12[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] * 3
    t1 *= t1
    n += t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1 + GRAD3[gi1 + 2] * z1)
  }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
  if (t2 > 0) {
    const gi2 = PERM_MOD12[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] * 3
    t2 *= t2
    n += t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2 + GRAD3[gi2 + 2] * z2)
  }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
  if (t3 > 0) {
    const gi3 = PERM_MOD12[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] * 3
    t3 *= t3
    n += t3 * t3 * (GRAD3[gi3] * x3 + GRAD3[gi3 + 1] * y3 + GRAD3[gi3 + 2] * z3)
  }

  return 32 * n
}

/** Fractal Brownian motion over simplex3. */
export function fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amplitude = 0.5
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * simplex3(x * frequency, y * frequency, z * frequency)
    norm += amplitude
    frequency *= lacunarity
    amplitude *= gain
  }
  return sum / norm
}

export const DEG = Math.PI / 180
