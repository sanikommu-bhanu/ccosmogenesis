/**
 * Colour grading model.
 *
 * The whole film is graded as a single travelling curve rather than a set of
 * discrete looks: every frame samples `gradeAt(progress)`, which interpolates
 * between the neighbouring chapters' grades. Nothing ever "switches" — the
 * grade drifts continuously, which is what stops chapter boundaries from
 * reading as cuts.
 *
 * Baseline tone mapping is ACES filmic (set on the renderer); these values ride
 * on top of it.
 */

import { Color } from 'three'

export interface Grade {
  /** Renderer tone-mapping exposure. 1 = neutral. */
  exposure: number
  /** Bloom strength. Breathes with the narrative rather than sitting static. */
  bloom: number
  /** Bloom luminance threshold — lower pulls more of the frame into glow. */
  bloomThreshold: number
  /** Bloom smoothing — wider = softer, more atmospheric halation. */
  bloomSmoothing: number
  /** Chromatic aberration offset (screen-space, multiplied by 1e-3). */
  chromatic: number
  /** Vignette darkness, 0 = off. */
  vignette: number
  /** Film grain opacity. */
  grain: number
  /** Global saturation multiplier applied after tone mapping. */
  saturation: number
  /** Highlight tint — multiplies the bright end of the frame. */
  tint: string
  /** Shadow lift — added into the dark end of the frame. */
  lift: string
  /** Depth-of-field focal distance in world units. */
  focusDistance: number
  /** Depth-of-field bokeh scale, 0 = effectively disabled. */
  bokeh: number
  /** Ambient fog/haze colour for the scene background. */
  haze: string
}

export const NEUTRAL_GRADE: Grade = {
  exposure: 1,
  bloom: 0.6,
  bloomThreshold: 0.75,
  bloomSmoothing: 0.4,
  chromatic: 0.35,
  vignette: 0.5,
  grain: 0.035,
  saturation: 1,
  tint: '#ffffff',
  lift: '#000000',
  focusDistance: 12,
  bokeh: 1.5,
  haze: '#000000',
}

/** Reusable scratch colours so `lerpGrade` never allocates inside the frame loop. */
const _tintA = new Color()
const _tintB = new Color()
const _liftA = new Color()
const _liftB = new Color()
const _hazeA = new Color()
const _hazeB = new Color()

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface ResolvedGrade extends Omit<Grade, 'tint' | 'lift' | 'haze'> {
  tint: Color
  lift: Color
  haze: Color
}

/** A mutable grade the render loop writes into every frame. */
export function createResolvedGrade(): ResolvedGrade {
  return {
    ...NEUTRAL_GRADE,
    tint: new Color(NEUTRAL_GRADE.tint),
    lift: new Color(NEUTRAL_GRADE.lift),
    haze: new Color(NEUTRAL_GRADE.haze),
  }
}

/**
 * Writes `lerp(a, b, t)` into `out` without allocating. Colours are mixed in
 * linear-sRGB so intermediate hues stay perceptually sane (a naive sRGB mix
 * from orange to violet muddies through grey).
 */
export function lerpGrade(out: ResolvedGrade, a: Grade, b: Grade, t: number): ResolvedGrade {
  out.exposure = lerp(a.exposure, b.exposure, t)
  out.bloom = lerp(a.bloom, b.bloom, t)
  out.bloomThreshold = lerp(a.bloomThreshold, b.bloomThreshold, t)
  out.bloomSmoothing = lerp(a.bloomSmoothing, b.bloomSmoothing, t)
  out.chromatic = lerp(a.chromatic, b.chromatic, t)
  out.vignette = lerp(a.vignette, b.vignette, t)
  out.grain = lerp(a.grain, b.grain, t)
  out.saturation = lerp(a.saturation, b.saturation, t)
  out.focusDistance = lerp(a.focusDistance, b.focusDistance, t)
  out.bokeh = lerp(a.bokeh, b.bokeh, t)

  _tintA.set(a.tint).convertSRGBToLinear()
  _tintB.set(b.tint).convertSRGBToLinear()
  out.tint.copy(_tintA).lerp(_tintB, t)

  _liftA.set(a.lift).convertSRGBToLinear()
  _liftB.set(b.lift).convertSRGBToLinear()
  out.lift.copy(_liftA).lerp(_liftB, t)

  _hazeA.set(a.haze).convertSRGBToLinear()
  _hazeB.set(b.haze).convertSRGBToLinear()
  out.haze.copy(_hazeA).lerp(_hazeB, t)

  return out
}
