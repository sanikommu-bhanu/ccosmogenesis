/**
 * The film's spine.
 *
 * Global scroll progress is a single number in [0, 1]. Every chapter owns a slice
 * of it, sized by `weight` (a chapter with weight 2 gets twice the scroll distance
 * of one with weight 1). Chapters overlap by `TRANSITION_OVERLAP` so the outgoing
 * and incoming scenes are both live during a handover — that overlap is what makes
 * particle dissolves and camera-through-object passes possible instead of cuts.
 *
 * Nothing here is stateful. Given a progress value you can derive the entire scene,
 * which is what makes the whole film scrubbable backwards.
 */

import type { Grade } from './grade'

export type ChapterId =
  | 'singularity'
  | 'bigbang'
  | 'expansion'
  | 'galaxy'
  | 'milkyway'
  | 'flythrough'
  | 'sun'
  | 'planets'
  | 'missions'
  | 'return'

export interface Chapter {
  id: ChapterId
  /** Zero-based index, also the number shown in the HUD. */
  index: number
  /** Display title, set in Fraunces. */
  title: string
  /** Mono sub-line under the title. */
  kicker: string
  /** The one line of narration for this chapter, if it has one. */
  line?: string
  /** Relative scroll distance. Tuned by feel, not by content length. */
  weight: number
  /** Grade at this chapter's midpoint; the renderer interpolates between them. */
  grade: Grade
}

/**
 * How much of a chapter bleeds into its neighbour, as a fraction of the shorter
 * chapter. Raising this makes transitions longer and softer; lowering it makes them
 * snappier and eventually starts to read as a cut.
 */
export const TRANSITION_OVERLAP = 0.18

export const CHAPTERS: Chapter[] = [
  {
    id: 'singularity',
    index: 0,
    title: 'Before Everything',
    kicker: '13.8 billion years ago',
    line: 'There is no “before”. Time itself starts here.',
    weight: 0.9,
    grade: {
      exposure: 0.85,
      bloom: 1.4,
      bloomThreshold: 0.35,
      bloomSmoothing: 0.85,
      chromatic: 0.15,
      vignette: 0.95,
      grain: 0.05,
      saturation: 0.35,
      tint: '#fff8e7',
      lift: '#000000',
      focusDistance: 10,
      bokeh: 0.6,
      haze: '#000000',
    },
  },
  {
    id: 'bigbang',
    index: 1,
    title: 'The Big Bang',
    kicker: 'T + 10⁻⁴³ s',
    line: 'And then, all of it at once.',
    weight: 1.15,
    grade: {
      exposure: 1.35,
      bloom: 1.5,
      bloomThreshold: 0.42,
      bloomSmoothing: 0.9,
      chromatic: 0.75,
      vignette: 0.15,
      grain: 0.09,
      saturation: 0.5,
      tint: '#fffdf6',
      lift: '#2a1a08',
      focusDistance: 6,
      bokeh: 0.3,
      haze: '#150a02',
    },
  },
  {
    id: 'expansion',
    index: 2,
    title: 'Expansion & Cooling',
    kicker: 'T + 380 000 yr',
    line: 'It cooled, and for the first time it was transparent.',
    weight: 1.45,
    grade: {
      exposure: 1.05,
      bloom: 1.1,
      bloomThreshold: 0.45,
      bloomSmoothing: 0.8,
      chromatic: 0.42,
      vignette: 0.5,
      grain: 0.055,
      saturation: 1.25,
      tint: '#ff6b35',
      lift: '#1b0a2e',
      focusDistance: 14,
      bokeh: 1.8,
      haze: '#0d0418',
    },
  },
  {
    id: 'galaxy',
    index: 3,
    title: 'Galaxy Formation',
    kicker: '13.8 billion years ago',
    line: 'Gravity did the rest.',
    weight: 1.45,
    grade: {
      exposure: 1.0,
      bloom: 1.05,
      bloomThreshold: 0.4,
      bloomSmoothing: 0.7,
      chromatic: 0.45,
      vignette: 0.62,
      grain: 0.045,
      saturation: 1.1,
      tint: '#4cc9f0',
      lift: '#0a0620',
      focusDistance: 22,
      bokeh: 2.4,
      haze: '#050416',
    },
  },
  {
    id: 'milkyway',
    index: 4,
    title: 'The Milky Way',
    kicker: 'One galaxy, among two trillion',
    line: 'One of them is ours.',
    weight: 1.2,
    grade: {
      exposure: 0.98,
      bloom: 0.95,
      bloomThreshold: 0.45,
      bloomSmoothing: 0.65,
      chromatic: 0.4,
      vignette: 0.6,
      grain: 0.04,
      saturation: 1.02,
      tint: '#a9c8f5',
      lift: '#07061a',
      focusDistance: 18,
      bokeh: 2.0,
      haze: '#04040f',
    },
  },
  {
    id: 'flythrough',
    index: 5,
    title: 'The Cradle',
    kicker: 'Orion Arm — 26 000 ly from galactic centre',
    line: 'A cold cloud of gas collapses under its own weight.',
    weight: 1.0,
    grade: {
      exposure: 1.12,
      bloom: 1.2,
      bloomThreshold: 0.4,
      bloomSmoothing: 0.75,
      chromatic: 1.25,
      vignette: 0.3,
      grain: 0.05,
      saturation: 1.0,
      tint: '#ffd9a0',
      lift: '#05040d',
      focusDistance: 30,
      bokeh: 0.8,
      haze: '#040309',
    },
  },
  {
    id: 'sun',
    index: 6,
    title: 'The Sun',
    kicker: '99.86% of the Solar System’s mass',
    line: 'Everything else is a rounding error.',
    weight: 1.15,
    grade: {
      exposure: 0.92,
      bloom: 1.0,
      bloomThreshold: 0.62,
      bloomSmoothing: 0.7,
      chromatic: 0.5,
      vignette: 0.42,
      grain: 0.04,
      saturation: 1.12,
      tint: '#ffb703',
      lift: '#100600',
      focusDistance: 26,
      bokeh: 1.4,
      haze: '#0a0500',
    },
  },
  {
    id: 'planets',
    index: 7,
    title: 'Eight Worlds',
    kicker: 'Mercury → Neptune',
    weight: 8.4,
    grade: {
      // Neutral D65: the planets are graded to look true-to-life, so the film's
      // most "real" moment is also its least stylised one.
      exposure: 1.0,
      bloom: 0.5,
      bloomThreshold: 0.72,
      bloomSmoothing: 0.45,
      chromatic: 0.28,
      vignette: 0.55,
      grain: 0.03,
      saturation: 1.0,
      tint: '#ffffff',
      lift: '#000000',
      focusDistance: 9,
      bokeh: 2.6,
      haze: '#000000',
    },
  },
  {
    id: 'missions',
    index: 8,
    title: 'We Went Out',
    kicker: '1957 → present',
    line: 'Sixty-eight years ago, one of these worlds started sending things back.',
    weight: 2.2,
    grade: {
      // Cooler and cleaner than the planets chapter: this is the archival, documentary
      // register of the film. Low bloom and near-zero grain read as telemetry rather
      // than as a photographed sky.
      exposure: 1.02,
      bloom: 0.62,
      bloomThreshold: 0.66,
      bloomSmoothing: 0.55,
      chromatic: 0.3,
      vignette: 0.52,
      grain: 0.032,
      saturation: 0.92,
      tint: '#dce8ff',
      lift: '#02040c',
      focusDistance: 16,
      bokeh: 1.6,
      haze: '#01020a',
    },
  },
  {
    id: 'return',
    index: 9,
    title: 'This Is Our Home',
    kicker: 'a small world around an ordinary star',
    line: 'And here you are, watching.',
    weight: 2.1,
    grade: {
      exposure: 0.9,
      bloom: 1.3,
      bloomThreshold: 0.38,
      bloomSmoothing: 0.85,
      chromatic: 0.2,
      vignette: 0.9,
      grain: 0.05,
      saturation: 0.4,
      tint: '#fff8e7',
      lift: '#000000',
      focusDistance: 12,
      bokeh: 0.6,
      haze: '#000000',
    },
  },
]

/**
 * The navigation.
 *
 * Seven destinations, not nine chapters and not a site menu. Each one names a *place*
 * the viewer can be, which is why the labels are nouns from the film rather than
 * section headings. `anchor` is the chapter it jumps into and `local` is where inside
 * that chapter to land — always slightly past the chapter's opening, so a jump arrives
 * mid-shot with the scene already established rather than at a cold boundary.
 */
export interface Destination {
  label: string
  anchor: ChapterId
  local: number
  /** Mono sub-label: what you are actually looking at when you arrive. */
  note: string
}

export const DESTINATIONS: Destination[] = [
  { label: 'ORIGIN', anchor: 'singularity', local: 0, note: 'T = 0' },
  { label: 'COSMOS', anchor: 'expansion', local: 0.35, note: 'first light' },
  { label: 'GALAXIES', anchor: 'galaxy', local: 0.5, note: 'structure' },
  { label: 'MILKY WAY', anchor: 'milkyway', local: 0.45, note: 'our galaxy' },
  { label: 'SOLAR SYSTEM', anchor: 'sun', local: 0.4, note: 'one star' },
  { label: 'WORLDS', anchor: 'planets', local: 0.06, note: 'eight planets' },
  { label: 'MISSIONS', anchor: 'missions', local: 0.12, note: 'we went out' },
]

export interface ChapterRange {
  chapter: Chapter
  /** Global progress at which this chapter starts. */
  start: number
  /** Global progress at which this chapter ends. */
  end: number
}

/** Chapter ranges, derived once from the weights. */
export const CHAPTER_RANGES: ChapterRange[] = (() => {
  const total = CHAPTERS.reduce((sum, c) => sum + c.weight, 0)
  let cursor = 0
  return CHAPTERS.map((chapter) => {
    const start = cursor
    const end = cursor + chapter.weight / total
    cursor = end
    return { chapter, start, end }
  })
})()

export const CHAPTER_BY_ID = Object.fromEntries(
  CHAPTER_RANGES.map((r) => [r.chapter.id, r]),
) as Record<ChapterId, ChapterRange>

/** Global progress for a position inside a named chapter. Inverse of `localProgress`. */
export function progressOf(id: ChapterId, local: number): number {
  const { start, end } = CHAPTER_BY_ID[id]
  return start + (end - start) * Math.min(1, Math.max(0, local))
}

/**
 * Total scroll height as a multiple of viewport height. The film is long on purpose:
 * at ~24 screens a normal trackpad flick advances a few seconds of footage rather
 * than skipping a whole chapter, which is what keeps the scrubbing legible.
 */
export const SCROLL_SCREENS = CHAPTERS.reduce((sum, c) => sum + c.weight, 0) * 1.55

/** Global progress → the chapter containing it. */
export function chapterAt(progress: number): ChapterRange {
  const p = Math.min(0.999999, Math.max(0, progress))
  for (const range of CHAPTER_RANGES) {
    if (p >= range.start && p < range.end) return range
  }
  return CHAPTER_RANGES[CHAPTER_RANGES.length - 1]
}

/** Global progress → 0..1 within the given chapter (unclamped callers should clamp). */
export function localProgress(id: ChapterId, progress: number): number {
  const { start, end } = CHAPTER_BY_ID[id]
  return Math.min(1, Math.max(0, (progress - start) / (end - start)))
}

/**
 * Grade at an arbitrary progress value, blended across the *whole* chapter rather
 * than only at its edges. Each chapter's grade is treated as a keyframe at its
 * midpoint, so the look is always drifting and never parked.
 */
export function gradeKeyframes(progress: number): { a: Grade; b: Grade; t: number } {
  const mids = CHAPTER_RANGES.map((r) => (r.start + r.end) / 2)

  if (progress <= mids[0]) return { a: CHAPTERS[0].grade, b: CHAPTERS[0].grade, t: 0 }
  const last = CHAPTERS.length - 1
  if (progress >= mids[last]) return { a: CHAPTERS[last].grade, b: CHAPTERS[last].grade, t: 0 }

  for (let i = 0; i < last; i++) {
    if (progress >= mids[i] && progress < mids[i + 1]) {
      const t = (progress - mids[i]) / (mids[i + 1] - mids[i])
      // Smoothstep the blend so the grade eases in and out of each chapter's look
      // rather than sliding through it at constant rate.
      return { a: CHAPTERS[i].grade, b: CHAPTERS[i + 1].grade, t: t * t * (3 - 2 * t) }
    }
  }
  return { a: CHAPTERS[last].grade, b: CHAPTERS[last].grade, t: 0 }
}
