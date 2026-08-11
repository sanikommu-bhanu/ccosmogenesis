/**
 * Volumetric nebula clouds for chapter 2.
 *
 * A handful of large camera-facing quads running domain-warped fBm. True
 * volumetric raymarching would cost an order of magnitude more for a difference
 * that disappears entirely once bloom and grain are applied at these scales.
 *
 * The clouds are seeded around the same region the particles occupy while cooling,
 * so the gas appears to belong to the debris rather than floating behind it.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Group, ShaderMaterial } from 'three'
import { NEBULA_VERTEX, NEBULA_FRAGMENT } from '../shaders/cosmos'
import { localProgress } from '../config/chapters'
import { mulberry32 } from '../lib/populate'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { smoothstep } from '../lib/math'

interface CloudDef {
  position: [number, number, number]
  scale: number
  seed: number
  colorA: Color
  colorB: Color
  opacity: number
}

/** Emission-nebula palette: ionised hydrogen magenta through to cold dust blue. */
const PALETTE: Array<[string, string]> = [
  ['#7b2cbf', '#ff6b35'],
  ['#3a0ca3', '#c1121f'],
  ['#5a189a', '#ff9e5e'],
  ['#240046', '#9d4edd'],
  ['#10002b', '#7b2cbf'],
]

export function Nebula() {
  const quality = useUniverseStore((s) => s.quality)
  const groupRef = useRef<Group>(null)
  const materials = useRef<ShaderMaterial[]>([])

  const clouds = useMemo<CloudDef[]>(() => {
    const random = mulberry32(4242)
    const cloudCount = quality === 'low' ? 5 : quality === 'medium' ? 9 : 14

    return Array.from({ length: cloudCount }, (_, i) => {
      const [a, b] = PALETTE[i % PALETTE.length]
      const angle = random() * Math.PI * 2
      const radius = 18 + random() * 68
      return {
        position: [
          Math.cos(angle) * radius,
          (random() - 0.5) * 46,
          Math.sin(angle) * radius - random() * 40,
        ],
        scale: 46 + random() * 84,
        seed: random() * 100,
        colorA: new Color(a).convertSRGBToLinear(),
        colorB: new Color(b).convertSRGBToLinear(),
        opacity: 0.34 + random() * 0.4,
      }
    })
  }, [quality])

  useFrame((state, delta) => {
    const p = scrollState.progress
    const cool = localProgress('expansion', p)
    const spiral = localProgress('galaxy', p)

    // Bloom in as the universe cools, then thin out as gravity gathers the gas
    // into the disc — the nebulae are consumed by the galaxy forming, which is
    // both narratively right and physically the correct story.
    const presence = smoothstep(0.08, 0.55, cool) * (1 - smoothstep(0.1, 0.72, spiral))

    for (let i = 0; i < materials.current.length; i++) {
      const m = materials.current[i]
      if (!m) continue
      m.uniforms.uTime.value += delta
      m.uniforms.uOpacity.value = clouds[i].opacity * presence
    }

    // Billboard toward the camera. Doing this per-frame on a group of a dozen
    // quads is far cheaper than a per-vertex billboard in the shader.
    if (groupRef.current) {
      for (const child of groupRef.current.children) {
        child.quaternion.copy(state.camera.quaternion)
      }
    }
  })

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <mesh key={i} position={cloud.position} scale={cloud.scale} renderOrder={-1}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={(m) => {
              if (m) materials.current[i] = m
            }}
            vertexShader={NEBULA_VERTEX}
            fragmentShader={NEBULA_FRAGMENT}
            uniforms={{
              uTime: { value: cloud.seed },
              uOpacity: { value: 0 },
              uScale: { value: 2.1 },
              uColorA: { value: cloud.colorA },
              uColorB: { value: cloud.colorB },
              uSeed: { value: cloud.seed },
            }}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}
