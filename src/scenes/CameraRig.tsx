/**
 * Camera choreography.
 *
 * The camera is a keyframed path evaluated at the current scroll position — never
 * an animation that plays. Between keyframes it eases with a named curve chosen per
 * move: a heavy `dolly` for reveals, a violent `whip` for the blast, `hyper` for the
 * jump to the Solar System.
 *
 * Two details do most of the work in making this read as a real camera:
 *
 *  1. **Handheld micro-drift.** A held shot gets a few centimetres of Perlin-driven
 *     positional and rotational wander. Without it a static camera looks dead in a
 *     way viewers register instantly even if they can't name it.
 *
 *  2. **Focal length changes are motivated.** The field of view widens on the blast
 *     and narrows on the long lens shots, so the perspective distortion itself
 *     carries meaning rather than staying at a fixed default.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { CHAPTER_BY_ID } from '../config/chapters'
import { PLANETS, planetPosition, planetSegmentAt, planetsPhase } from '../config/planets'
import { solarState } from './SolarSystem'
import { scrollState } from '../store/useUniverseStore'
import { clamp, damp, EASE, simplex3, smoothstep } from '../lib/math'

type Vec3 = [number, number, number]

interface CamKey {
  /** Global scroll progress at which the camera is exactly here. */
  at: number
  pos: Vec3
  look: Vec3
  fov: number
  /** Curve used to travel *into* this keyframe from the previous one. */
  ease: (t: number) => number
  /** Handheld drift amplitude. 0 for locked-off, higher for a shot with life. */
  drift: number
}

/** Position within a chapter, expressed globally. */
const at = (id: keyof typeof CHAPTER_BY_ID, local: number) => {
  const { start, end } = CHAPTER_BY_ID[id]
  return start + (end - start) * local
}

function buildKeys(): CamKey[] {
  return [
    // --- 0. Singularity: a slow, almost imperceptible push toward the point ---
    { at: at('singularity', 0), pos: [0, 0, 9.4], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.55 },
    { at: at('singularity', 1), pos: [0, 0, 7.1], look: [0, 0, 0], fov: 38, ease: EASE.dolly, drift: 0.8 },

    // --- 1. Big Bang: the camera is thrown backwards and the lens flares wide ---
    { at: at('bigbang', 0.16), pos: [0, 0, 6.4], look: [0, 0, 0], fov: 62, ease: EASE.whip, drift: 1.5 },
    { at: at('bigbang', 1), pos: [0, 1.2, 27], look: [0, 0, 0], fov: 52, ease: EASE.dolly, drift: 0.9 },

    // --- 2. Expansion: drifting forward *through* the cooling debris ---
    { at: at('expansion', 0.5), pos: [7, 3.5, 12], look: [-2, 0, -6], fov: 48, ease: EASE.dolly, drift: 1.1 },
    { at: at('expansion', 1), pos: [-5, -2.5, -10], look: [-6, -1, -26], fov: 46, ease: EASE.dolly, drift: 1.0 },

    // --- 3. Galaxy: pull back and rise to an oblique reveal of the whole spiral ---
    // Distance is set so the 62-unit disc sits inside the frame with air around it.
    // The reveal only lands if the galaxy is small in frame — crowding the arms
    // against the edges reads as being lost inside it rather than seeing it whole.
    { at: at('galaxy', 0.55), pos: [12, 46, 124], look: [0, 0, 0], fov: 40, ease: EASE.reveal, drift: 0.7 },
    { at: at('galaxy', 1), pos: [40, 55, 132], look: [0, 0, 0], fov: 38, ease: EASE.dolly, drift: 0.6 },

    // --- 4. Milky Way: descend toward the disc and pick a spiral arm ---
    { at: at('milkyway', 0.5), pos: [70, 22, 96], look: [14, 0, 10], fov: 42, ease: EASE.dolly, drift: 0.8 },
    { at: at('milkyway', 1), pos: [48, 7, 46], look: [6, 0, 2], fov: 46, ease: EASE.dolly, drift: 1.0 },

    // --- 5. Flythrough: the hyperspace run in toward one star ---
    { at: at('flythrough', 0.55), pos: [12, 2, 14], look: [0, 0, 0], fov: 68, ease: EASE.hyper, drift: 1.6 },
    { at: at('flythrough', 1), pos: [0, 9, 96], look: [0, 0, 0], fov: 44, ease: EASE.whip, drift: 0.5 },

    // --- 6. The Sun: a held hero shot, barely breathing ---
    // Distance is set so the disc occupies roughly a third of the frame height. Any
    // closer and the corona has nowhere to live and the frame loses the negative
    // space the whole art direction depends on — the Sun should feel enormous
    // because of what surrounds it, not because it is cropped.
    { at: at('sun', 0.5), pos: [0, 7, 82], look: [0, 0, 0], fov: 42, ease: EASE.reveal, drift: 0.45 },
    { at: at('sun', 1), pos: [-14, 5, 74], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },

    // --- 7. Planets: overridden per-beat by the planet choreography ---
    { at: at('planets', 0), pos: [0, 2, 22], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },
    { at: at('planets', 1), pos: [0, 6, 40], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },

    // --- 8. Return: rocket back out through everything, ending on the point ---
    { at: at('return', 0.45), pos: [30, 60, 260], look: [0, 0, 0], fov: 44, ease: EASE.hyper, drift: 0.9 },
    { at: at('return', 0.8), pos: [0, 10, 60], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },
    { at: at('return', 1), pos: [0, 0, 8.6], look: [0, 0, 0], fov: 38, ease: EASE.reveal, drift: 0.4 },
  ]
}

/**
 * The orrery establishing shot.
 *
 * A high three-quarter view down the row of worlds, positioned so the whole system —
 * Sun at one end, Neptune at the other — sits inside the frame with air around it.
 * The camera drifts slowly inward and rises across the held shot, so even the
 * "static" establishing beat is never actually static.
 */
function orreryCamera(t: number, outPos: Vector3, outLook: Vector3) {
  const outermost = PLANETS[PLANETS.length - 1]
  const rowEnd = planetPosition(outermost)

  // Aim at the middle of the row rather than at the Sun, so the composition is the
  // whole system rather than the Sun with some specks trailing off the edge.
  const centreX = rowEnd.x * 0.46
  const centreZ = rowEnd.z * 0.46
  outLook.set(centreX, 0, centreZ)

  // The camera must sit *across* the row, not along it. Looking down the axis of the
  // fan collapses eight worlds into one another and shows nothing; perpendicular is
  // the only angle from which the whole system reads as a row receding outward.
  const rowAxis = Math.atan2(rowEnd.z, rowEnd.x) * 0.5
  const swing = rowAxis + Math.PI * 0.5 + lerpNum(-0.14, 0.1, EASE.dolly(t))

  // Ease inward over the beat: the shot is held, but never actually still.
  const distance = 232 * lerpNum(1.08, 0.95, EASE.dolly(t))
  const elevation = lerpNum(0.46, 0.58, EASE.reveal(t))

  outPos.set(
    centreX + Math.cos(swing) * Math.cos(elevation) * distance,
    Math.sin(elevation) * distance,
    centreZ + Math.sin(swing) * Math.cos(elevation) * distance,
  )
}

/** Field of view for the establishing shot: wide enough to hold Sun to Neptune. */
const ORRERY_FOV = 46

const lerpNum = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Camera for a single planet's orbital ring.
 *
 * The camera is a satellite: it flies an actual closed path around the body rather
 * than sitting in front of it. Over one beat it sweeps most of a full revolution,
 * which means the terminator travels right across the disc — the planet is lit from
 * the front on arrival, edge-lit at the quarter points, and a crescent against the
 * dark side at the far end. That single fact is what makes the loops feel like
 * flight rather than a turntable.
 *
 * `ringAngle` is returned so the fact callouts can be triggered by the camera's
 * actual position on the ring rather than by elapsed time.
 */
function planetRingCamera(
  index: number,
  beatT: number,
  outPos: Vector3,
  outLook: Vector3,
): { fov: number; drift: number; ringAngle: number } {
  const planet = PLANETS[index]
  const centre = planetPosition(planet)
  const boost = solarState.sizeBoost

  // Framing distance scales with the body, so Mercury and Jupiter fill a comparable
  // share of the frame despite a five-fold size difference. Saturn needs extra room
  // for its rings.
  const ringRoom = planet.rings?.map ? 2.3 : 1
  const distance = planet.radius * boost * (4.4 + ringRoom) + 2.6

  // Start on the sunlit side so the arrival reads immediately, then sweep 1.5
  // revolutions across the beat.
  const sunward = Math.atan2(centre.z, centre.x)
  const azimuth = sunward + Math.PI + EASE.dolly(beatT) * Math.PI * 3.0

  // Rise and fall through the loop rather than orbiting on a flat plane, so ring
  // systems open and close and the path reads as a three-dimensional arc.
  const elevation = Math.sin(beatT * Math.PI * 1.5) * 0.42 + 0.06

  const horizontal = Math.cos(elevation) * distance
  outPos.set(
    centre.x + Math.cos(azimuth) * horizontal,
    centre.y + Math.sin(elevation) * distance,
    centre.z + Math.sin(azimuth) * horizontal,
  )

  // Look slightly off-centre so the planet does not sit dead in the middle of frame.
  outLook.set(centre.x, centre.y + planet.radius * boost * 0.1, centre.z)

  // Longer lens on the giants, wider on the small rocky worlds: the same choice a
  // real director of photography makes, and it quietly communicates scale.
  const fov = planet.radius > 2 ? 34 : 44

  return { fov, drift: 0.45, ringAngle: azimuth - sunward }
}

export function CameraRig() {
  const { camera } = useThree()
  const keys = useMemo(buildKeys, [])

  // Scratch vectors, reused every frame so the render loop never allocates.
  const targetPos = useRef(new Vector3())
  const targetLook = useRef(new Vector3())
  const smoothedLook = useRef(new Vector3())
  const scratchPos = useRef(new Vector3())
  const scratchLook = useRef(new Vector3())
  const nextPos = useRef(new Vector3())
  const nextLook = useRef(new Vector3())
  const orreryPos = useRef(new Vector3())
  const orreryLook = useRef(new Vector3())
  const lastPos = useRef(new Vector3())
  const ringAngleRef = useRef(0)
  const initialised = useRef(false)

  useFrame((_, delta) => {
    const p = clamp(scrollState.progress)
    const dt = Math.min(delta, 1 / 20)

    // --- Locate the segment and ease within it ---
    let i = 0
    while (i < keys.length - 1 && p > keys[i + 1].at) i++
    const a = keys[i]
    const b = keys[Math.min(i + 1, keys.length - 1)]

    const span = b.at - a.at
    const raw = span > 1e-9 ? clamp((p - a.at) / span) : 0
    // The incoming keyframe owns the curve, so each move can have its own character.
    const t = b.ease(raw)

    targetPos.current.set(
      a.pos[0] + (b.pos[0] - a.pos[0]) * t,
      a.pos[1] + (b.pos[1] - a.pos[1]) * t,
      a.pos[2] + (b.pos[2] - a.pos[2]) * t,
    )
    targetLook.current.set(
      a.look[0] + (b.look[0] - a.look[0]) * t,
      a.look[1] + (b.look[1] - a.look[1]) * t,
      a.look[2] + (b.look[2] - a.look[2]) * t,
    )

    let fov = a.fov + (b.fov - a.fov) * t
    let drift = a.drift + (b.drift - a.drift) * t

    // --- The planets chapter drives its own camera ---
    const planetsRange = CHAPTER_BY_ID.planets
    if (p > planetsRange.start - 0.02 && p < planetsRange.end + 0.02) {
      const chapterLocal = clamp(
        (p - planetsRange.start) / (planetsRange.end - planetsRange.start),
      )
      const { phase, t: phaseT, handover } = planetsPhase(chapterLocal)

      let planetFov = 40
      let planetDrift = 0.5

      if (phase === 'orrery') {
        orreryCamera(phaseT, scratchPos.current, scratchLook.current)
        planetFov = 40
        planetDrift = 0.55
      } else {
        const seg = planetSegmentAt(phaseT)
        const index = PLANETS.findIndex((pl) => pl.id === seg.planet.id)
        const beatT = clamp((phaseT - seg.start) / (seg.end - seg.start))

        const current = planetRingCamera(index, beatT, scratchPos.current, scratchLook.current)
        planetFov = current.fov
        planetDrift = current.drift
        ringAngleRef.current = current.ringAngle

        // --- Breaking off to the next ring ---
        // Over the last fifth of a beat the camera leaves this orbit and arcs to the
        // start of the next one. EASE.whip front-loads almost all the movement into
        // the middle of that window, so the camera is briefly travelling fast enough
        // for the motion and chromatic response to spike, then decelerates into its
        // new subject. The chain of loops is continuous: no beat ever ends at rest.
        const BREAK = 0.8
        if (beatT > BREAK && index < PLANETS.length - 1) {
          const breakT = EASE.whip((beatT - BREAK) / (1 - BREAK))
          planetRingCamera(index + 1, 0, nextPos.current, nextLook.current)

          // Arc the transfer outward rather than cutting the chord straight, so the
          // path between two rings is itself a curve — a Hohmann-ish sweep instead
          // of a linear slide.
          scratchPos.current.lerp(nextPos.current, breakT)
          const arc = Math.sin(breakT * Math.PI)
          scratchPos.current.y += arc * 14
          scratchLook.current.lerp(nextLook.current, breakT)

          // Widen the lens through the transfer and pull it back on arrival; the
          // focal-length change is what makes it read as a camera move rather than
          // an interpolation between two positions.
          planetFov += arc * 26
          planetDrift += arc * 1.4
        }

        // Ease out of the orrery framing into the first ring.
        if (handover < 1) {
          orreryCamera(1, orreryPos.current, orreryLook.current)
          scratchPos.current.lerp(orreryPos.current, 1 - handover)
          scratchLook.current.lerp(orreryLook.current, 1 - handover)
          planetFov = planetFov + (40 - planetFov) * (1 - handover)
        }
      }

      // Blend in and out at the chapter's edges so the handover from the Sun shot
      // and into the closing zoom-out are themselves continuous.
      const edgeIn = smoothstep(planetsRange.start - 0.02, planetsRange.start + 0.02, p)
      const edgeOut = 1 - smoothstep(planetsRange.end - 0.012, planetsRange.end + 0.02, p)
      const blend = edgeIn * edgeOut

      targetPos.current.lerp(scratchPos.current, blend)
      targetLook.current.lerp(scratchLook.current, blend)
      fov += (planetFov - fov) * blend
      drift += (planetDrift - drift) * blend
    }

    // --- Handheld micro-drift ---
    // Three decorrelated noise channels at a slow rate. Amplitude scales with the
    // shot's drift value and *falls away* when the camera is already moving fast,
    // because a real operator's wobble is only visible on a held shot.
    const settle = 1 - clamp(scrollState.speed * 0.8)
    const amp = drift * 0.075 * settle
    const nt = scrollState.time * 0.16

    targetPos.current.x += simplex3(nt, 0, 0) * amp
    targetPos.current.y += simplex3(0, nt + 31.4, 0) * amp
    targetPos.current.z += simplex3(0, 0, nt + 71.2) * amp * 0.6

    // Pointer parallax, strongest on the held shots.
    const parallax = 0.85 * settle
    targetPos.current.x += scrollState.pointerX * parallax
    targetPos.current.y += scrollState.pointerY * parallax * 0.6

    if (!initialised.current) {
      camera.position.copy(targetPos.current)
      smoothedLook.current.copy(targetLook.current)
      initialised.current = true
    } else {
      // A light temporal smoothing on top of the already-eased path. This is what
      // gives the camera mass: it lags the target by a few frames, so direction
      // changes carry a hint of inertia instead of being instant.
      camera.position.lerp(targetPos.current, 1 - Math.exp(-14 * dt))
      smoothedLook.current.lerp(targetLook.current, 1 - Math.exp(-11 * dt))
    }

    // Slight roll, driven by lateral scroll velocity — the camera banks into a move.
    const roll = simplex3(0, 0, nt * 0.7 + 12.3) * 0.012 * drift * settle

    camera.lookAt(smoothedLook.current)
    camera.rotateZ(roll)

    // Expose where the camera sits on the current orbital ring, so fact callouts can
    // be triggered by the camera actually crossing the terminator rather than by a
    // timer that happens to line up.
    scrollState.ringAngle = ringAngleRef.current

    // --- Camera speed ---
    // Post-processing reads this rather than scroll velocity. The two diverge
    // exactly where it matters: during a whip-pan the camera crosses tens of units
    // while scroll barely moves, and on a held shot the viewer can be scrubbing
    // hard while the camera sits still. Driving motion blur and chromatic
    // aberration from the camera's own movement is what makes them read as lens
    // artefacts instead of as scroll feedback.
    if (dt > 0) {
      const travelled = camera.position.distanceTo(lastPos.current)
      const instantaneous = travelled / dt
      // Normalised against a brisk-but-not-extreme 40 units/sec.
      scrollState.cameraSpeed = damp(
        scrollState.cameraSpeed,
        clamp(instantaneous / 40),
        10,
        dt,
      )
    }
    lastPos.current.copy(camera.position)

    const cam = camera as PerspectiveCamera
    if (cam.isPerspectiveCamera) {
      const nextFov = damp(cam.fov, fov, 9, dt)
      if (Math.abs(nextFov - cam.fov) > 1e-4) {
        cam.fov = nextFov
        cam.updateProjectionMatrix()
      }
    }
  })

  return null
}
