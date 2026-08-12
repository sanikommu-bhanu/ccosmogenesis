/**
 * Global narrative state.
 *
 * Deliberately split in two:
 *
 *  - **Zustand state** (this file) holds only things that change at human speed —
 *    which chapter we're in, which planet is focused, whether audio is on. React
 *    re-renders on these, and that's fine because they change a few times a minute.
 *
 *  - **`scrollState`** (a plain mutable object, exported below) holds the 60 fps
 *    values: raw scroll progress, velocity, pointer position. Nothing subscribes to
 *    it; `useFrame` reads it directly. Putting these in Zustand would re-render the
 *    entire tree every frame and cost more than the rendering itself.
 */

import { create } from 'zustand'
import type { ChapterId } from '../config/chapters'
import type { PlanetId } from '../config/planets'

// ---------------------------------------------------------------------------
// Per-frame values — mutable, never reactive
// ---------------------------------------------------------------------------

export interface ScrollState {
  /** Global film progress, 0 → 1. The single input the whole scene derives from. */
  progress: number
  /** Progress change per second. Drives motion blur, chromatic spikes, star streaks. */
  velocity: number
  /** Smoothed |velocity|, 0 → 1, for effects that shouldn't flicker. */
  speed: number
  /**
   * Smoothed camera travel speed, 0 → 1, written by the camera rig.
   * Distinct from `speed` on purpose: this is how fast the *camera* is moving
   * through the world, which is what lens artefacts should respond to.
   */
  cameraSpeed: number
  /**
   * Where the camera sits on the current planet's orbital ring, in radians from the
   * sunlit side. Lets fact callouts fire on the camera crossing the terminator
   * rather than on a timer that only approximates it.
   */
  ringAngle: number
  /** Pointer in normalised device coords, -1 → 1. Drives parallax and the cursor. */
  pointerX: number
  pointerY: number
  /** Seconds since load, advanced by the render loop. */
  time: number
  /**
   * 0 = following the scroll narrative, 1 = fully in free-orbit inspection mode.
   * Eased, so entering and leaving explore mode is itself a transition.
   */
  exploreBlend: number
}

export const scrollState: ScrollState = {
  progress: 0,
  velocity: 0,
  speed: 0,
  cameraSpeed: 0,
  ringAngle: 0,
  pointerX: 0,
  pointerY: 0,
  time: 0,
  exploreBlend: 0,
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

export type LoadPhase = 'loading' | 'ready' | 'started'

interface UniverseState {
  /** Asset loading. */
  phase: LoadPhase
  loadProgress: number
  loadLabel: string

  /** Narrative position, updated only when it actually changes. */
  chapter: ChapterId
  chapterIndex: number
  /** Which planet's beat is on screen during chapter 7, else null. */
  activePlanet: PlanetId | null

  /** Click-to-explore: the planet the camera has locked onto, else null. */
  exploringPlanet: PlanetId | null
  /** True while the fact panel is expanded. */
  panelOpen: boolean

  /** Audio. Muted by default — autoplay with sound is hostile. */
  muted: boolean
  audioUnlocked: boolean

  /** Set once from a media query + hardware probe; scenes read it to size buffers. */
  quality: 'low' | 'medium' | 'high'
  reducedMotion: boolean

  setPhase: (phase: LoadPhase) => void
  setLoad: (progress: number, label?: string) => void
  setChapter: (chapter: ChapterId, index: number) => void
  setActivePlanet: (planet: PlanetId | null) => void
  explore: (planet: PlanetId | null) => void
  setPanelOpen: (open: boolean) => void
  toggleMute: () => void
  setAudioUnlocked: (unlocked: boolean) => void
  setQuality: (quality: 'low' | 'medium' | 'high') => void
  setReducedMotion: (reduced: boolean) => void
}

export const useUniverseStore = create<UniverseState>((set) => ({
  phase: 'loading',
  loadProgress: 0,
  loadLabel: 'INITIALISING',

  chapter: 'singularity',
  chapterIndex: 0,
  activePlanet: null,

  exploringPlanet: null,
  panelOpen: false,

  muted: true,
  audioUnlocked: false,

  quality: 'high',
  reducedMotion: false,

  setPhase: (phase) => set({ phase }),
  setLoad: (loadProgress, loadLabel) =>
    set((s) => ({ loadProgress, loadLabel: loadLabel ?? s.loadLabel })),
  setChapter: (chapter, chapterIndex) => set({ chapter, chapterIndex }),
  setActivePlanet: (activePlanet) => set({ activePlanet }),
  explore: (exploringPlanet) => set({ exploringPlanet, panelOpen: exploringPlanet !== null }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setQuality: (quality) => set({ quality }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
}))

/**
 * Particle budgets per quality tier. Scenes read these rather than hard-coding
 * counts, so the whole film scales from a phone to a workstation from one place.
 * See README.md for how to tune these.
 */
export const BUDGET = {
  low: { bigbang: 24_000, nebula: 12_000, galaxy: 40_000, stars: 6_000, rings: 6_000, dpr: 1 },
  medium: { bigbang: 60_000, nebula: 30_000, galaxy: 90_000, stars: 14_000, rings: 12_000, dpr: 1.5 },
  high: { bigbang: 140_000, nebula: 64_000, galaxy: 220_000, stars: 30_000, rings: 24_000, dpr: 2 },
} as const

export type QualityTier = keyof typeof BUDGET
