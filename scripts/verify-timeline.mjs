#!/usr/bin/env node
/**
 * Verifies the properties the whole film depends on.
 *
 * The scroll choreography only works if the scene is a *pure function* of scroll
 * progress. If that holds, reversibility is free — scrubbing backwards is just
 * evaluating the same function at decreasing inputs. These checks assert it holds,
 * including at the exact chapter boundaries where off-by-one errors would produce
 * a visible pop.
 *
 * Run:  npm run verify
 */

// Imported straight from source rather than a fixture — a copy would drift and
// prove nothing. Node 22 strips the TypeScript types natively, and the project's
// tsconfig already enforces `erasableSyntaxOnly`, so these files need no transform.
import {
  CHAPTERS,
  CHAPTER_RANGES,
  chapterAt,
  localProgress,
  gradeKeyframes,
} from '../src/config/chapters.ts'
import { PLANETS, PLANET_SEGMENTS, planetSegmentAt } from '../src/config/planets.ts'

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

console.log('\n  Timeline invariants\n')

// --- Coverage: the chapters must tile [0,1] with no gap and no overlap ---
check(
  'chapter ranges start at 0 and end at 1',
  Math.abs(CHAPTER_RANGES[0].start) < 1e-12 &&
    Math.abs(CHAPTER_RANGES.at(-1).end - 1) < 1e-12,
)

let contiguous = true
for (let i = 1; i < CHAPTER_RANGES.length; i++) {
  if (Math.abs(CHAPTER_RANGES[i].start - CHAPTER_RANGES[i - 1].end) > 1e-12) contiguous = false
}
check('chapter ranges are contiguous', contiguous)

check(
  'planet segments tile [0,1]',
  Math.abs(PLANET_SEGMENTS[0].start) < 1e-12 &&
    Math.abs(PLANET_SEGMENTS.at(-1).end - 1) < 1e-12,
)

// --- Totality: every progress value must resolve to exactly one chapter ---
let resolvedEverywhere = true
let localInRange = true
for (let i = 0; i <= 20000; i++) {
  const p = i / 20000
  const { chapter } = chapterAt(p)
  if (!chapter) resolvedEverywhere = false
  const l = localProgress(chapter.id, p)
  if (l < -1e-9 || l > 1 + 1e-9 || Number.isNaN(l)) localInRange = false
}
check('every progress in [0,1] resolves to a chapter', resolvedEverywhere)
check('local progress always stays within [0,1]', localInRange)

// --- Boundaries: the exact seams are where pops would show ---
let boundariesClean = true
const boundaryDetail = []
for (const range of CHAPTER_RANGES) {
  for (const eps of [-1e-7, 0, 1e-7]) {
    const p = Math.min(1, Math.max(0, range.start + eps))
    const l = localProgress(chapterAt(p).chapter.id, p)
    if (Number.isNaN(l)) {
      boundariesClean = false
      boundaryDetail.push(`${range.chapter.id} @ ${p}`)
    }
  }
}
check('chapter boundaries produce no NaN', boundariesClean, boundaryDetail.join(', '))

// --- Purity / reversibility: forward and backward passes must agree exactly ---
const forward = []
for (let i = 0; i <= 5000; i++) {
  const p = i / 5000
  const { chapter } = chapterAt(p)
  forward.push(`${chapter.id}:${localProgress(chapter.id, p).toFixed(9)}`)
}
const backward = []
for (let i = 5000; i >= 0; i--) {
  const p = i / 5000
  const { chapter } = chapterAt(p)
  backward.push(`${chapter.id}:${localProgress(chapter.id, p).toFixed(9)}`)
}
backward.reverse()
const identical = forward.every((v, i) => v === backward[i])
check('scrubbing backwards reproduces the forward pass exactly', identical)

// --- Grade continuity: the look must never jump between adjacent samples ---
let maxJump = 0
let jumpAt = 0
let prev = null
for (let i = 0; i <= 20000; i++) {
  const p = i / 20000
  const { a, b, t } = gradeKeyframes(p)
  const value = {
    exposure: a.exposure + (b.exposure - a.exposure) * t,
    bloom: a.bloom + (b.bloom - a.bloom) * t,
    chromatic: a.chromatic + (b.chromatic - a.chromatic) * t,
    saturation: a.saturation + (b.saturation - a.saturation) * t,
  }
  if (prev) {
    for (const k of Object.keys(value)) {
      const d = Math.abs(value[k] - prev[k])
      if (d > maxJump) {
        maxJump = d
        jumpAt = p
      }
    }
  }
  prev = value
}
// At 20 000 samples any real discontinuity shows up as a jump orders of magnitude
// larger than the smooth per-sample delta.
check(
  'grade is continuous across the whole film',
  maxJump < 0.01,
  `largest single-sample delta ${maxJump.toExponential(2)} at progress ${jumpAt.toFixed(4)}`,
)

// --- Planet beats ---
let planetsOrdered = true
for (let i = 0; i < PLANETS.length; i++) {
  const mid = (PLANET_SEGMENTS[i].start + PLANET_SEGMENTS[i].end) / 2
  if (planetSegmentAt(mid).planet.id !== PLANETS[i].id) planetsOrdered = false
}
check('each planet beat resolves to its own planet at its midpoint', planetsOrdered)

check(
  'planet order is Mercury → Neptune',
  PLANETS.map((p) => p.id).join(',') ===
    'mercury,venus,earth,mars,jupiter,saturn,uranus,neptune',
)

// --- Physical data sanity ---
check(
  'sizes are ordered correctly (Mercury smallest, Jupiter largest)',
  Math.min(...PLANETS.map((p) => p.radius)) === PLANETS.find((p) => p.id === 'mercury').radius &&
    Math.max(...PLANETS.map((p) => p.radius)) === PLANETS.find((p) => p.id === 'jupiter').radius,
)

check(
  'orbits increase monotonically outward',
  PLANETS.every((p, i) => i === 0 || p.orbitRadius > PLANETS[i - 1].orbitRadius),
)

check(
  'Venus and Uranus are the retrograde bodies (obliquity > 90°)',
  PLANETS.filter((p) => p.axialTilt > 90)
    .map((p) => p.id)
    .join(',') === 'venus,uranus',
)

check(
  'every planet has 2–3 HUD facts',
  PLANETS.every((p) => p.facts.length >= 2 && p.facts.length <= 3),
)

console.log(
  `\n  ${CHAPTERS.length} chapters · ${PLANETS.length} planets · ` +
    `${PLANETS.reduce((n, p) => n + p.moons.length, 0)} moons\n`,
)

if (failures) {
  console.log(`  ${failures} check(s) failed\n`)
  process.exit(1)
}
console.log('  all checks passed\n')
