/**
 * Procedural population of the universe: where particles start, where they end up,
 * and what colour they are.
 *
 * All of this is generated once on the CPU and uploaded as static attributes. The
 * vertex shader then only has to interpolate between the endpoints, which is why
 * 220 000 particles cost almost nothing per frame.
 */

import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'

/** Deterministic PRNG, so every visitor sees the identical universe. */
export function mulberry32(seed: number) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Samples a stellar surface temperature from the real distribution of spectral
 * classes in the Milky Way.
 *
 * This matters more than it sounds. Roughly three quarters of all stars are cool
 * red M-dwarfs, and only a fraction of a percent are the hot blue stars people
 * picture. Sampling this honestly is what makes the galaxy read warm and slightly
 * amber rather than the uniform blue-white of a default particle demo — and the
 * rare blue stars stand out precisely because they are rare.
 */
export function sampleStarTemp(random: () => number): number {
  const r = random()
  if (r < 0.7645) return 2400 + random() * 1300 // M
  if (r < 0.8855) return 3700 + random() * 1500 // K
  if (r < 0.9615) return 5200 + random() * 800 // G
  if (r < 0.9915) return 6000 + random() * 1500 // F
  if (r < 0.9975) return 7500 + random() * 2500 // A
  if (r < 0.99993) return 10000 + random() * 20000 // B
  return 30000 + random() * 10000 // O
}

export interface CosmicFieldOptions {
  count: number
  /** Radius of the spiral disc in scene units. */
  galaxyRadius?: number
  /** Number of spiral arms. Four suits the Milky Way's two major + two minor. */
  arms?: number
  /** How tightly the arms wind. Higher = more turns. */
  windTightness?: number
  /** Fraction of particles that belong to the central bulge rather than the disc. */
  bulgeFraction?: number
  seed?: number
}

/**
 * Builds the geometry for the cosmic particle system.
 *
 * Each particle carries both an origin (a direction to be flung in) and a
 * destination (its seat in the spiral). The shader blends between them, so the
 * Big Bang and the galaxy are two readings of the same buffer.
 */
export function buildCosmicField(options: CosmicFieldOptions): BufferGeometry {
  const {
    count,
    galaxyRadius = 62,
    arms = 4,
    windTightness = 0.42,
    bulgeFraction = 0.19,
    seed = 20260811,
  } = options

  const random = mulberry32(seed)

  const positions = new Float32Array(count * 3) // unused at runtime, but three wants it
  const burstDir = new Float32Array(count * 3)
  const galaxyTarget = new Float32Array(count * 3)
  const speed = new Float32Array(count)
  const size = new Float32Array(count)
  const temp = new Float32Array(count)
  const stagger = new Float32Array(count)

  const TAU = Math.PI * 2

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // --- Ejection direction: uniform on the sphere ---
    // Sampling z uniformly (rather than the polar angle) is what keeps this even;
    // the naive version bunches particles at the poles.
    const z = random() * 2 - 1
    const theta = random() * TAU
    const rho = Math.sqrt(1 - z * z)
    burstDir[i3] = rho * Math.cos(theta)
    burstDir[i3 + 1] = rho * Math.sin(theta)
    burstDir[i3 + 2] = z

    // Hubble-like flow: a spread of speeds, biased slow so the core stays dense.
    speed[i] = 0.18 + Math.pow(random(), 1.7) * 0.92

    // --- Destination in the galaxy ---
    const inBulge = random() < bulgeFraction

    if (inBulge) {
      // Central bulge: a flattened spheroid of older, redder stars.
      const br = Math.pow(random(), 2.1) * galaxyRadius * 0.17
      const bz = random() * 2 - 1
      const bt = random() * TAU
      const brho = Math.sqrt(1 - bz * bz)
      galaxyTarget[i3] = br * brho * Math.cos(bt)
      galaxyTarget[i3 + 1] = br * bz * 0.62 // flattened
      galaxyTarget[i3 + 2] = br * brho * Math.sin(bt)

      // Bulge populations are old — skew red regardless of the disc distribution.
      temp[i] = 2600 + random() * 2200
    } else {
      // Disc: a logarithmic spiral with scatter around each arm.
      // The power keeps density falling off outward the way real discs do.
      const t = Math.pow(random(), 1.55)
      const r = 3 + t * galaxyRadius

      const arm = i % arms
      const armAngle = (arm / arms) * TAU
      // Logarithmic winding — this is what actually makes it read as a spiral
      // rather than a pinwheel.
      const angle = armAngle + Math.log(r * 0.5 + 1) * windTightness * 5.4

      // Scatter perpendicular to the arm, wider further out where arms diffuse.
      const scatter = (random() + random() + random() - 1.5) * (0.9 + r * 0.075)
      const scatterAngle = scatter / Math.max(r, 1)

      const a = angle + scatterAngle
      const rr = r + (random() - 0.5) * 2.4

      galaxyTarget[i3] = Math.cos(a) * rr
      galaxyTarget[i3 + 2] = Math.sin(a) * rr

      // Disc thickness: thin at the rim, thicker toward the centre. Summing three
      // uniforms approximates a Gaussian, which is the right vertical profile.
      const thickness = 0.55 + 3.4 * Math.exp(-r / 26)
      galaxyTarget[i3 + 1] = (random() + random() + random() - 1.5) * thickness

      temp[i] = sampleStarTemp(random)
    }

    // Point sizes follow a heavy-tailed distribution: mostly faint, a few bright.
    // A uniform distribution here looks like confetti.
    size[i] = 0.35 + Math.pow(random(), 3.2) * 2.4

    // Desynchronises the reform so the galaxy streams into being.
    stagger[i] = random()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aBurstDir', new BufferAttribute(burstDir, 3))
  geometry.setAttribute('aGalaxyTarget', new BufferAttribute(galaxyTarget, 3))
  geometry.setAttribute('aSpeed', new BufferAttribute(speed, 1))
  geometry.setAttribute('aSize', new BufferAttribute(size, 1))
  geometry.setAttribute('aTemp', new BufferAttribute(temp, 1))
  geometry.setAttribute('aStagger', new BufferAttribute(stagger, 1))

  // The vertex shader computes position from scratch and ignores the `position`
  // attribute, which is all zeros. Three would therefore derive a zero-radius
  // bounding sphere and frustum-cull the entire system the moment the camera moves
  // off the origin. Pin a sphere large enough to contain the fully-dispersed state,
  // and stop three recomputing it.
  const bounds = new Sphere(new Vector3(0, 0, 0), 400)
  geometry.boundingSphere = bounds
  geometry.computeBoundingSphere = () => {
    geometry.boundingSphere = bounds
  }

  return geometry
}

export interface StarfieldOptions {
  count: number
  /** Inner and outer radius of the shell the stars occupy. */
  innerRadius?: number
  outerRadius?: number
  seed?: number
}

/** The deep background starfield — parallax, and the source of hyperspace streaks. */
export function buildStarfield(options: StarfieldOptions): BufferGeometry {
  const { count, innerRadius = 90, outerRadius = 900, seed = 771 } = options
  const random = mulberry32(seed)

  const positions = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const temp = new Float32Array(count)
  const twinkle = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const z = random() * 2 - 1
    const theta = random() * Math.PI * 2
    const rho = Math.sqrt(1 - z * z)
    // Cube root gives uniform density through the shell volume; without it the
    // stars pile up near the inner radius.
    const r =
      innerRadius +
      (outerRadius - innerRadius) * Math.cbrt(random())

    positions[i3] = r * rho * Math.cos(theta)
    positions[i3 + 1] = r * z
    positions[i3 + 2] = r * rho * Math.sin(theta)

    size[i] = 0.4 + Math.pow(random(), 3.6) * 3.2
    temp[i] = sampleStarTemp(random)
    twinkle[i] = random()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new BufferAttribute(size, 1))
  geometry.setAttribute('aTemp', new BufferAttribute(temp, 1))
  geometry.setAttribute('aTwinkle', new BufferAttribute(twinkle, 1))
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), outerRadius * 1.4)

  return geometry
}
