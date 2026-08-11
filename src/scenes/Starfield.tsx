/**
 * The deep starfield.
 *
 * Two jobs: parallax depth behind everything, and the hyperspace streaks in
 * chapter 5. The streaks are produced by displacing each star along its own radial
 * direction from the travel origin, so they converge on the vanishing point the way
 * real motion blur does — rather than every star leaning the same way, which is the
 * usual giveaway.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, ShaderMaterial, Vector3 } from 'three'
import { buildStarfield } from '../lib/populate'
import { STARFIELD_VERTEX, STARFIELD_FRAGMENT } from '../shaders/cosmos'
import { localProgress } from '../config/chapters'
import { BUDGET, scrollState, useUniverseStore } from '../store/useUniverseStore'
import { clamp, EASE, smoothstep } from '../lib/math'

export function Starfield() {
  const quality = useUniverseStore((s) => s.quality)
  const count = BUDGET[quality].stars
  const { gl } = useThree()

  const materialRef = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => buildStarfield({ count }), [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 1 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
      uStretch: { value: 0 },
      uOpacity: { value: 0 },
      uOrigin: { value: new Vector3(0, 0, 0) },
    }),
    [gl],
  )

  useFrame((_, delta) => {
    const m = materialRef.current
    if (!m) return
    const p = scrollState.progress

    m.uniforms.uTime.value += delta

    // Stars fade up as the fireball cools and the frame stops being blown out,
    // then hold for the rest of the film.
    const cool = localProgress('expansion', p)
    m.uniforms.uOpacity.value = smoothstep(0.15, 0.75, cool)

    // Hyperspace: ramp hard in the middle of the flythrough, then snap back to
    // points on arrival. EASE.hyper barely moves for the first half of the chapter
    // and then delivers everything at once, which is what sells the jump.
    const fly = localProgress('flythrough', p)
    const ramp = EASE.hyper(clamp(fly / 0.72))
    const release = smoothstep(0.72, 0.97, fly)
    const stretch = ramp * (1 - release)

    // Scrubbing fast stretches the stars a little even outside the jump, so the
    // starfield always responds to how hard the viewer is scrolling.
    m.uniforms.uStretch.value = clamp(stretch + scrollState.speed * 0.12)
    m.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2)
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={STARFIELD_VERTEX}
        fragmentShader={STARFIELD_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}
