/**
 * The asteroid belt between Mars and Jupiter.
 *
 * A beat of texture before the scale jump to the gas giants. Deliberately *sparse*:
 * the real belt is so empty that every probe sent through it has passed without
 * incident, and the dense boulder field of science fiction would undercut the sense
 * of distance the chapter is built on. What sells it is not density but parallax —
 * a few thousand irregular rocks tumbling at different rates as the camera moves.
 *
 * One InstancedMesh, so the whole belt is a single draw call.
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { mulberry32 } from '../lib/populate'
import { localProgress } from '../config/chapters'
import { PLANETS, planetsPhase } from '../config/planets'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { clamp, smoothstep } from '../lib/math'

/** Belt geometry, in the same compressed orbital units as the planets. */
const MARS = PLANETS[3].orbitRadius
const JUPITER = PLANETS[4].orbitRadius
const INNER = MARS + (JUPITER - MARS) * 0.3
const OUTER = MARS + (JUPITER - MARS) * 0.72

interface Rock {
  angle: number
  radius: number
  height: number
  scale: number
  spinAxis: Vector3
  spinRate: number
  phase: number
}

export function AsteroidBelt() {
  const quality = useUniverseStore((s) => s.quality)
  const meshRef = useRef<InstancedMesh>(null)

  const count = quality === 'low' ? 900 : quality === 'medium' ? 2400 : 4200

  const rocks = useMemo<Rock[]>(() => {
    const random = mulberry32(90210)
    return Array.from({ length: count }, () => {
      // Density peaks mid-belt and thins at both edges, roughly as the real
      // distribution does between the Kirkwood gaps.
      const t = (random() + random() + random()) / 3
      return {
        angle: random() * Math.PI * 2,
        radius: INNER + (OUTER - INNER) * t,
        // The belt is inclined and puffy, not a flat disc.
        height: (random() + random() - 1) * 2.6,
        scale: 0.012 + Math.pow(random(), 3.4) * 0.11,
        spinAxis: new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize(),
        spinRate: 0.15 + random() * 0.9,
        phase: random() * Math.PI * 2,
      }
    })
  }, [count])

  const matrix = useMemo(() => new Matrix4(), [])
  const quat = useMemo(() => new Quaternion(), [])
  const position = useMemo(() => new Vector3(), [])
  const scale = useMemo(() => new Vector3(), [])

  // Colour variation: C-type carbonaceous asteroids dominate the outer belt and are
  // very dark; S-type silicaceous ones are lighter and redder toward the inner edge.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const random = mulberry32(5150)
    const colour = new Color()
    for (let i = 0; i < rocks.length; i++) {
      const inner = (rocks[i].radius - INNER) / (OUTER - INNER)
      const sType = random() > inner * 0.75
      colour
        .setHex(sType ? 0x8a7358 : 0x4a423a)
        .multiplyScalar(0.7 + random() * 0.6)
        .convertSRGBToLinear()
      mesh.setColorAt(i, colour)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [rocks])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const chapterLocal = localProgress('planets', scrollState.progress)
    const { phase, t } = planetsPhase(chapterLocal)

    // Visible during the orrery as a faint band, and properly present around the
    // Mars-to-Jupiter leg of the ring chain where the camera actually flies through.
    const marsBeat = 0.36
    const jupiterBeat = 0.56
    const nearBelt =
      phase === 'orrery'
        ? 0.45
        : smoothstep(marsBeat - 0.14, marsBeat + 0.04, t) *
          (1 - smoothstep(jupiterBeat, jupiterBeat + 0.12, t))

    const visible = clamp(nearBelt)
    mesh.visible = visible > 0.01
    if (!mesh.visible) return

    const time = scrollState.time

    for (let i = 0; i < rocks.length; i++) {
      const rock = rocks[i]
      // Keplerian shear: inner rocks orbit faster, so the belt slowly smears rather
      // than rotating as a rigid ring.
      const angle = rock.angle + (time * 0.02) / Math.pow(rock.radius / INNER, 1.5)

      position.set(
        Math.cos(angle) * rock.radius,
        rock.height,
        Math.sin(angle) * rock.radius,
      )
      quat.setFromAxisAngle(rock.spinAxis, time * rock.spinRate + rock.phase)
      scale.setScalar(rock.scale * visible)

      matrix.compose(position, quat, scale)
      mesh.setMatrixAt(i, matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      {/* A low-poly icosahedron reads as an irregular rock at these sizes, and costs
          a fraction of what a sphere would across thousands of instances. */}
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.95} metalness={0.02} flatShading vertexColors />
    </instancedMesh>
  )
}
