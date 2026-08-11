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
import { scrollState } from '../store/useUniverseStore'
import { clamp, damp, EASE, simplex3 } from '../lib/math'

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
    { at: at('galaxy', 0.55), pos: [8, 30, 84], look: [0, 0, 0], fov: 40, ease: EASE.reveal, drift: 0.7 },
    { at: at('galaxy', 1), pos: [26, 34, 88], look: [0, 0, 0], fov: 38, ease: EASE.dolly, drift: 0.6 },

    // --- 4. Milky Way: descend toward the disc and pick a spiral arm ---
    { at: at('milkyway', 0.5), pos: [46, 13, 60], look: [12, 0, 8], fov: 42, ease: EASE.dolly, drift: 0.8 },
    { at: at('milkyway', 1), pos: [36, 4.5, 30], look: [4, 0, 0], fov: 46, ease: EASE.dolly, drift: 1.0 },

    // --- 5. Flythrough: the hyperspace run in toward one star ---
    { at: at('flythrough', 0.55), pos: [12, 2, 14], look: [0, 0, 0], fov: 68, ease: EASE.hyper, drift: 1.6 },
    { at: at('flythrough', 1), pos: [0, 3.4, 34], look: [0, 0, 0], fov: 44, ease: EASE.whip, drift: 0.5 },

    // --- 6. The Sun: a held hero shot, barely breathing ---
    { at: at('sun', 0.5), pos: [0, 2.6, 29], look: [0, 0, 0], fov: 42, ease: EASE.reveal, drift: 0.45 },
    { at: at('sun', 1), pos: [-4, 1.4, 25], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },

    // --- 7. Planets: overridden per-beat by the planet choreography ---
    { at: at('planets', 0), pos: [0, 2, 22], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },
    { at: at('planets', 1), pos: [0, 6, 40], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },

    // --- 8. Return: rocket back out through everything, ending on the point ---
    { at: at('return', 0.45), pos: [30, 60, 260], look: [0, 0, 0], fov: 44, ease: EASE.hyper, drift: 0.9 },
    { at: at('return', 0.8), pos: [0, 10, 60], look: [0, 0, 0], fov: 40, ease: EASE.dolly, drift: 0.5 },
    { at: at('return', 1), pos: [0, 0, 8.6], look: [0, 0, 0], fov: 38, ease: EASE.reveal, drift: 0.4 },
  ]
}

export function CameraRig() {
  const { camera } = useThree()
  const keys = useMemo(buildKeys, [])

  // Scratch vectors, reused every frame so the render loop never allocates.
  const targetPos = useRef(new Vector3())
  const targetLook = useRef(new Vector3())
  const smoothedLook = useRef(new Vector3())
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

    const fov = a.fov + (b.fov - a.fov) * t
    const drift = a.drift + (b.drift - a.drift) * t

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
