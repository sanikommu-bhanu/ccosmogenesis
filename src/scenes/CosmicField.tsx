/**
 * Chapters 0–5, rendered by one particle system that is never rebuilt.
 *
 * The singularity, the Big Bang, the cooling gas, the spiral galaxy and the Milky
 * Way are all the same buffer read at different phase values. That's the whole
 * trick behind the transitions: there is no moment where one scene is torn down
 * and another mounted, so there is no cut to hide.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, Points, ShaderMaterial } from 'three'
import { buildCosmicField } from '../lib/populate'
import { COSMOS_VERTEX, COSMOS_FRAGMENT } from '../shaders/cosmos'
import { localProgress } from '../config/chapters'
import { BUDGET, scrollState, useUniverseStore } from '../store/useUniverseStore'

export function CosmicField() {
  const quality = useUniverseStore((s) => s.quality)
  const count = BUDGET[quality].galaxy
  const { gl } = useThree()

  const pointsRef = useRef<Points>(null)
  const materialRef = useRef<ShaderMaterial>(null)

  const geometry = useMemo(() => buildCosmicField({ count }), [count])

  const uniforms = useMemo(
    () => ({
      uBirth: { value: 0 },
      uBurst: { value: 0 },
      uCool: { value: 0 },
      uSpiral: { value: 0 },
      uDive: { value: 0 },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 1 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
      uSpeed: { value: 0 },
    }),
    [gl],
  )

  useFrame((_, delta) => {
    const m = materialRef.current
    if (!m) return
    const p = scrollState.progress

    // Each phase is read straight off scroll position. `localProgress` clamps, so
    // once a chapter is behind us its term stays saturated at 1 and keeps
    // contributing — the phases accumulate rather than hand over.
    m.uniforms.uBirth.value = localProgress('singularity', p)
    m.uniforms.uBurst.value = localProgress('bigbang', p)
    m.uniforms.uCool.value = localProgress('expansion', p)
    m.uniforms.uSpiral.value = localProgress('galaxy', p)
    m.uniforms.uDive.value = localProgress('milkyway', p)
    m.uniforms.uFade.value = localProgress('flythrough', p)

    m.uniforms.uTime.value += delta
    m.uniforms.uSpeed.value = scrollState.speed
    m.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2)
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={COSMOS_VERTEX}
        fragmentShader={COSMOS_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        // Additive is non-negotiable for glowing points: overlapping particles must
        // accumulate brightness, which is what feeds the bloom pass something to
        // work with. Alpha blending here would produce flat grey mush.
        blending={AdditiveBlending}
      />
    </points>
  )
}
