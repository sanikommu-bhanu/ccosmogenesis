/**
 * The Solar System, chapters 5 through 8.
 *
 * The planets chapter runs as two movements:
 *
 *   **Orrery.** A held establishing shot with all eight worlds alive in frame at
 *   once, enlarged against their orbits so they are actually legible, with faint
 *   orbit arcs on the ecliptic.
 *
 *   **Rings.** The camera drops in and flies a chain of orbital loops from Mercury
 *   out to Neptune. Only planets near the current beat stay mounted, so Neptune's
 *   textures are never requested during Jupiter's loop.
 *
 * The size boost eases from 2.2 to 1 across the handover, so the transition between
 * the two movements is itself a continuous change of scale rather than a cut.
 */

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { localProgress } from '../config/chapters'
import { ORRERY_SIZE_BOOST, PLANET_SEGMENTS, planetsPhase } from '../config/planets'
import { Planet } from './Planet'
import { Sun } from './Sun'
import { OrbitArcs } from './OrbitArcs'
import { AsteroidBelt } from './AsteroidBelt'
import { scrollState } from '../store/useUniverseStore'
import { clamp, damp, lerp, smoothstep } from '../lib/math'

/**
 * How far either side of a planet's own beat it stays mounted, as a fraction of the
 * ring phase. Wide enough that a planet is fully loaded and spinning well before the
 * camera arrives — a texture popping in on arrival would undo the whole transition —
 * and narrow enough that at most three exist at once.
 */
const MOUNT_WINDOW = 0.14

/** Shared per-frame state, written once and read by every planet. */
export const solarState = {
  /** 2.2 during the orrery, easing to 1 for the ring flythrough. */
  sizeBoost: ORRERY_SIZE_BOOST,
  /** Orbit-arc opacity. */
  arcOpacity: 0,
  /** 0 while in the orrery, 1 once fully into the rings. */
  handover: 0,
}

export function SolarSystem() {
  const [live, setLive] = useState<string[]>([])
  const [arcOpacity, setArcOpacity] = useState(0)
  const boostRef = useRef(ORRERY_SIZE_BOOST)

  useFrame((_, delta) => {
    const chapterLocal = localProgress('planets', scrollState.progress)
    const { phase, handover } = planetsPhase(chapterLocal)
    const dt = Math.min(delta, 1 / 20)

    solarState.handover = handover

    // --- Size boost ---
    // Damped rather than snapped, so scrubbing quickly across the handover still
    // shows the worlds shrinking into true scale rather than jumping.
    const targetBoost = lerp(ORRERY_SIZE_BOOST, 1, handover)
    boostRef.current = damp(boostRef.current, targetBoost, 6, dt)
    solarState.sizeBoost = boostRef.current

    // --- Orbit arcs ---
    // Present only for the establishing shot. Drawing a 60-unit circle around a
    // planet the camera is currently orbiting would look absurd.
    const inChapter = scrollState.progress > 0 && chapterLocal > 0 && chapterLocal < 1
    const target = inChapter ? smoothstep(0, 0.12, chapterLocal) * (1 - handover) * 0.55 : 0
    solarState.arcOpacity = damp(solarState.arcOpacity, target, 5, dt)
    setArcOpacity((prev) =>
      Math.abs(prev - solarState.arcOpacity) > 0.01 ? solarState.arcOpacity : prev,
    )

    // --- Which planets are mounted ---
    // During the orrery every planet must be present; the whole point of the shot is
    // seeing all eight at once.
    const next: string[] = []
    if (phase === 'orrery' || handover < 0.35) {
      for (const seg of PLANET_SEGMENTS) next.push(seg.planet.id)
    } else {
      const ringT = planetsPhase(chapterLocal).t
      for (const seg of PLANET_SEGMENTS) {
        if (ringT >= seg.start - MOUNT_WINDOW && ringT <= seg.end + MOUNT_WINDOW) {
          next.push(seg.planet.id)
        }
      }
    }

    setLive((prev) =>
      prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next,
    )
  })

  return (
    <group>
      <Sun />
      <OrbitArcs opacity={arcOpacity} />
      <AsteroidBelt />

      {PLANET_SEGMENTS.map((seg) =>
        live.includes(seg.planet.id) ? (
          <PlanetBeat key={seg.planet.id} segment={seg} />
        ) : null,
      )}
    </group>
  )
}

function PlanetBeat({ segment }: { segment: (typeof PLANET_SEGMENTS)[number] }) {
  const [presence, setPresence] = useState(0)

  useFrame(() => {
    const chapterLocal = localProgress('planets', scrollState.progress)
    const { phase, t } = planetsPhase(chapterLocal)

    // In the orrery every planet is equally present; during the rings, presence
    // ramps around this planet's own beat.
    const value =
      phase === 'orrery'
        ? 1
        : clamp(
            smoothstep(segment.start - MOUNT_WINDOW, segment.start, t) *
              (1 - smoothstep(segment.end, segment.end + MOUNT_WINDOW, t)),
          )

    setPresence((prev) => (Math.abs(prev - value) > 0.02 ? value : prev))
  })

  return <Planet planet={segment.planet} presence={presence} />
}
