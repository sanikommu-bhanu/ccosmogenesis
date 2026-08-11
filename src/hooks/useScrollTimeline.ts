/**
 * The scroll engine.
 *
 * Lenis owns inertia and smoothing; GSAP's ticker owns the clock; ScrollTrigger
 * maps document scroll onto normalised film progress. They're wired in that order
 * so there is exactly one RAF loop in the app — Lenis is driven *by* GSAP rather
 * than running its own, which is what stops the classic double-RAF jitter where
 * smooth scroll and scrubbed animation disagree by a frame.
 *
 * The output is written into the mutable `scrollState` object rather than React
 * state. Chapter changes are pushed into Zustand only on an actual boundary
 * crossing, so React renders roughly nine times over the whole film.
 */

import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { chapterAt, SCROLL_SCREENS } from '../config/chapters'
import { PLANET_SEGMENTS, planetSegmentAt } from '../config/planets'
import { localProgress } from '../config/chapters'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { clamp, damp } from '../lib/math'

gsap.registerPlugin(ScrollTrigger)

export interface ScrollTimeline {
  lenis: Lenis | null
}

export const timeline: ScrollTimeline = { lenis: null }

/** Scroll to a normalised film position. Used by the chapter nav and the intro CTA. */
export function scrollToProgress(progress: number, opts: { immediate?: boolean } = {}) {
  const doc = document.documentElement
  const max = doc.scrollHeight - window.innerHeight
  const target = clamp(progress) * max
  if (timeline.lenis) {
    timeline.lenis.scrollTo(target, {
      duration: opts.immediate ? 0 : 2.4,
      // Matches EASE.dolly — a chapter jump should feel like the same camera
      // system that drives everything else, not like a browser anchor jump.
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      immediate: opts.immediate,
    })
  } else {
    window.scrollTo({ top: target, behavior: opts.immediate ? 'auto' : 'smooth' })
  }
}

export function useScrollTimeline(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const store = useUniverseStore.getState()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lenis = new Lenis({
      // Lower = heavier, more cinematic glide. Above ~0.12 it starts to feel loose.
      lerp: reduced ? 1 : 0.075,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
      // The film is a vertical scrub; horizontal gestures should do nothing.
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: !reduced,
      syncTouch: true,
      autoRaf: false,
    })
    timeline.lenis = lenis

    // One clock: GSAP drives Lenis, Lenis reports back to ScrollTrigger.
    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)
    lenis.on('scroll', ScrollTrigger.update)

    let lastProgress = 0
    let lastTime = performance.now()
    let lastChapter = ''
    let lastPlanet: string | null = null

    const trigger = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 0,
      end: 'max',
      // `scrub` is unnecessary here: we're reading progress directly rather than
      // driving a GSAP timeline, which keeps the mapping exactly reversible.
      onUpdate: (self) => {
        const now = performance.now()
        const dt = Math.min(0.1, (now - lastTime) / 1000)
        lastTime = now

        const p = self.progress
        scrollState.progress = p

        if (dt > 0) {
          const instantaneous = (p - lastProgress) / dt
          // Velocity is smoothed hard: raw frame-to-frame delta is far too noisy to
          // drive chromatic aberration or star streaking without strobing.
          scrollState.velocity = damp(scrollState.velocity, instantaneous, 12, dt)
          scrollState.speed = damp(
            scrollState.speed,
            clamp(Math.abs(instantaneous) * 7),
            8,
            dt,
          )
        }
        lastProgress = p

        // --- Reactive updates, only on real boundary crossings ---
        const { chapter } = chapterAt(p)
        if (chapter.id !== lastChapter) {
          lastChapter = chapter.id
          useUniverseStore.getState().setChapter(chapter.id, chapter.index)
        }

        let planetId: string | null = null
        if (chapter.id === 'planets') {
          planetId = planetSegmentAt(localProgress('planets', p)).planet.id
        }
        if (planetId !== lastPlanet) {
          lastPlanet = planetId
          useUniverseStore
            .getState()
            .setActivePlanet(planetId as Parameters<typeof store.setActivePlanet>[0])
        }
      },
    })

    // Pointer, for parallax and the custom cursor.
    const onPointer = (e: PointerEvent) => {
      scrollState.pointerX = (e.clientX / window.innerWidth) * 2 - 1
      scrollState.pointerY = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize)

    ScrollTrigger.refresh()

    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', onResize)
      trigger.kill()
      lenis.off('scroll', ScrollTrigger.update)
      gsap.ticker.remove(onTick)
      lenis.destroy()
      timeline.lenis = null
    }
  }, [enabled])
}

/** Total document height, in `vh`, that the film occupies. */
export const SCROLL_HEIGHT_VH = SCROLL_SCREENS * 100

/** Chapter-jump targets for the nav: the midpoint of each planet beat. */
export const PLANET_JUMP_TARGETS = PLANET_SEGMENTS.map((seg) => ({
  id: seg.planet.id,
  name: seg.planet.name,
  mid: (seg.start + seg.end) / 2,
}))

/** Stop/start the scroll driver — used when explore mode takes over the camera. */
export function setScrollLocked(locked: boolean) {
  if (!timeline.lenis) return
  if (locked) timeline.lenis.stop()
  else timeline.lenis.start()
}
