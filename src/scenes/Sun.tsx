/**
 * The Sun: photosphere, corona, and the only light source in the Solar System
 * chapters.
 *
 * Everything from Mercury to Neptune is lit by the single point light at the
 * origin, which is why every planet has a genuinely dark far side and a terminator
 * in the physically correct place. Adding a fill light would flatten all of that
 * out, so there isn't one — the small ambient term in the planet shader stands in
 * for scattered light and nothing else.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  Color,
  Mesh,
  PointLight,
  SRGBColorSpace,
  ShaderMaterial,
} from 'three'
import { SUN_VERTEX, SUN_FRAGMENT, CORONA_VERTEX, CORONA_FRAGMENT } from '../shaders/sun'
import { SUN } from '../config/planets'
import { localProgress } from '../config/chapters'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { clamp, smoothstep } from '../lib/math'

/** Colour temperature of sunlight at the top of the atmosphere, ~5778 K. */
export const SUNLIGHT_COLOR = new Color('#fff4e8').convertSRGBToLinear()

/** How far the corona billboard reaches, in solar radii. */
const CORONA_EXTENT = 3.4

export function Sun() {
  const quality = useUniverseStore((s) => s.quality)
  const surfaceRef = useRef<ShaderMaterial>(null)
  const coronaRef = useRef<ShaderMaterial>(null)
  const lightRef = useRef<PointLight>(null)
  const groupRef = useRef<Mesh>(null)
  const coronaMeshRef = useRef<Mesh>(null)

  const map = useTexture('/textures/sun/surface.jpg')
  map.colorSpace = SRGBColorSpace

  const segments = quality === 'low' ? 48 : quality === 'medium' ? 96 : 160

  const surfaceUniforms = useMemo(
    () => ({
      uMap: { value: map },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uTurbulence: { value: 1 },
    }),
    [map],
  )

  /**
   * The corona billboard extends to CORONA_EXTENT solar radii. `uDiscRadius` tells
   * the shader where the photosphere ends within that quad, so all its structure can
   * be positioned in solar radii rather than in screen space.
   */
  const coronaUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uInnerColor: { value: new Color('#ffd8a0').convertSRGBToLinear() },
      uOuterColor: { value: new Color('#ff7a2a').convertSRGBToLinear() },
      uDiscRadius: { value: 1 / CORONA_EXTENT },
    }),
    [],
  )

  useFrame((state, delta) => {
    const p = scrollState.progress
    const t = scrollState.time

    // Keep the corona quad square-on to the camera.
    if (coronaMeshRef.current) coronaMeshRef.current.quaternion.copy(state.camera.quaternion)

    if (surfaceRef.current) {
      surfaceRef.current.uniforms.uTime.value = t
    }
    if (coronaRef.current) {
      coronaRef.current.uniforms.uTime.value = t
    }

    // The Sun materialises during the flythrough as the camera closes on it, holds
    // through its own chapter, then stays lit for the planets.
    const fly = localProgress('flythrough', p)
    const arrival = smoothstep(0.45, 0.95, fly)

    // It survives the closing zoom-out too, shrinking away with the rest.
    const leaving = smoothstep(0.35, 0.8, localProgress('return', p))
    const presence = clamp(arrival * (1 - leaving * 0.85))

    if (surfaceRef.current) surfaceRef.current.uniforms.uIntensity.value = presence
    if (coronaRef.current) coronaRef.current.uniforms.uIntensity.value = presence * 0.85
    if (lightRef.current) lightRef.current.intensity = presence * 2200

    // A slow axial spin. The real Sun rotates differentially — about 25 days at the
    // equator — but at this framing the churn in the shader carries the motion.
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.012
  })

  return (
    <group>
      {/* Photosphere */}
      <mesh ref={groupRef}>
        <sphereGeometry args={[SUN.radius, segments, segments / 2]} />
        <shaderMaterial
          ref={surfaceRef}
          vertexShader={SUN_VERTEX}
          fragmentShader={SUN_FRAGMENT}
          uniforms={surfaceUniforms}
          toneMapped={false}
        />
      </mesh>

      {/* Corona and prominences.
          A camera-facing billboard rather than a shell: streamers radiate from the
          limb and prominences sit at specific position angles, both of which are
          natural in polar coordinates and badly distorted by a sphere's UVs. */}
      <mesh ref={coronaMeshRef} renderOrder={-1}>
        <planeGeometry args={[SUN.radius * CORONA_EXTENT * 2, SUN.radius * CORONA_EXTENT * 2]} />
        <shaderMaterial
          ref={coronaRef}
          vertexShader={CORONA_VERTEX}
          fragmentShader={CORONA_FRAGMENT}
          uniforms={coronaUniforms}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* The single light source. Decay 2 is physically correct inverse-square;
          the huge intensity is what that costs at Solar System distances. */}
      <pointLight
        ref={lightRef}
        color={SUNLIGHT_COLOR}
        intensity={0}
        distance={0}
        decay={2}
        castShadow={false}
      />
    </group>
  )
}
