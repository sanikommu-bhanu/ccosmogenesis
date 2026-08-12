/**
 * A planet, its atmosphere, clouds, rings and moons.
 *
 * One component renders all eight, so they necessarily share a lighting model and
 * look like they were shot by the same camera. Everything that differs between
 * bodies is data in config/planets.ts, not a special case here.
 */

import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { Texture } from 'three'
import {
  PLANET_VERTEX,
  PLANET_FRAGMENT,
  ATMOSPHERE_VERTEX,
  ATMOSPHERE_FRAGMENT,
  CLOUDS_FRAGMENT,
  PROCEDURAL_MOON_FRAGMENT,
  RING_VERTEX,
  RING_FRAGMENT,
} from '../shaders/planet'
import { planetPosition } from '../config/planets'
import type { MoonDef, Planet as PlanetDef } from '../config/planets'
import { SUNLIGHT_COLOR } from './Sun'
import { solarState } from './SolarSystem'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { DEG } from '../lib/math'

/**
 * Rotation speeds are compressed, not scaled.
 *
 * A linear speed-up that makes Jupiter's 9.9-hour day readable leaves Venus's
 * 243-day rotation completely invisible — a 600:1 spread. Raising the period to
 * a fractional power compresses that range to about 7:1 while preserving the
 * ordering, so Jupiter is still visibly the fastest and Venus still visibly the
 * slowest. Direction is never compressed: it falls out of the axial tilt, so the
 * retrograde bodies turn backwards on their own.
 */
const SPIN_COMPRESSION = 0.35
/** Seconds per rotation for Earth on screen; everything else follows from it. */
const EARTH_SECONDS_PER_ROTATION = 25
const SPIN_SCALE =
  (Math.PI * 2) / (EARTH_SECONDS_PER_ROTATION * Math.pow(23.934, -SPIN_COMPRESSION))

function angularVelocity(rotationHours: number): number {
  return SPIN_SCALE * Math.pow(Math.abs(rotationHours), -SPIN_COMPRESSION)
}

interface PlanetProps {
  planet: PlanetDef
  /** 0 → dormant, 1 → this planet's beat is on screen. Gates the expensive layers. */
  presence: number
}

export function Planet({ planet, presence }: PlanetProps) {
  return (
    <Suspense fallback={null}>
      <PlanetBody planet={planet} presence={presence} />
    </Suspense>
  )
}

function PlanetBody({ planet }: PlanetProps) {
  const quality = useUniverseStore((s) => s.quality)
  const spinRef = useRef<Group>(null)
  const cloudRef = useRef<Group>(null)
  const moonsRef = useRef<Group>(null)
  const scaleRef = useRef<Group>(null)
  const surfaceRef = useRef<ShaderMaterial>(null)

  const segments = quality === 'low' ? 32 : quality === 'medium' ? 64 : 128

  // --- Position and lighting geometry ---
  // Planets sit at fixed orbital phases rather than orbiting, so the camera can be
  // choreographed to arrive at a known framing. The Sun is at the origin, so the
  // direction to it is simply the negated position.
  const position = useMemo(() => {
    const p = planetPosition(planet)
    return new Vector3(p.x, p.y, p.z)
  }, [planet])

  const sunDirection = useMemo(() => position.clone().negate().normalize(), [position])

  // --- Textures ---
  const texturePaths = useMemo(() => {
    const paths: Record<string, string> = { day: planet.maps.albedo }
    if (planet.maps.night) paths.night = planet.maps.night
    if (planet.maps.normal) paths.normal = planet.maps.normal
    if (planet.maps.specular) paths.specular = planet.maps.specular
    if (planet.maps.clouds) paths.clouds = planet.maps.clouds
    return paths
  }, [planet])

  const textures = useTexture(texturePaths) as unknown as Record<string, Texture>

  useMemo(() => {
    for (const [key, texture] of Object.entries(textures)) {
      // Colour maps are authored in sRGB; normal and specular data are not colours
      // at all and must stay linear or the lighting maths is wrong.
      texture.colorSpace =
        key === 'normal' || key === 'specular' ? LinearSRGBColorSpace : SRGBColorSpace
      texture.anisotropy = 8
      texture.needsUpdate = true
    }
  }, [textures])

  const atmosphereColor = useMemo(
    () => new Color(planet.atmosphere?.color ?? planet.color).convertSRGBToLinear(),
    [planet],
  )

  const surfaceUniforms = useMemo(
    () => ({
      uDayMap: { value: textures.day },
      uNightMap: { value: textures.night ?? textures.day },
      uNormalMap: { value: textures.normal ?? textures.day },
      uSpecularMap: { value: textures.specular ?? textures.day },
      uHasNight: { value: !!textures.night },
      uHasNormal: { value: !!textures.normal },
      uHasSpecular: { value: !!textures.specular },
      uSunDirection: { value: sunDirection },
      uSunColor: { value: SUNLIGHT_COLOR },
      uSunIntensity: { value: 1.35 },
      uNormalScale: { value: 1.4 },
      uRoughness: { value: 0.45 },
      uAmbient: { value: 0.035 },
      uAtmosphereColor: { value: atmosphereColor },
    }),
    [textures, sunDirection, atmosphereColor],
  )

  const spin = useMemo(() => angularVelocity(planet.rotationHours), [planet])

  useFrame((_, delta) => {
    // Rotation runs on the shared clock rather than on scroll, because a planet
    // spinning is ambient motion, not a transition — nobody expects rewinding the
    // film to un-spin Jupiter. Scroll velocity is added on top so scrubbing hard
    // visibly spins the world, which ties the input to the scene.
    const advance = delta * spin + scrollState.velocity * 0.05

    // Orrery exaggeration, shared by every planet so relative sizes stay honest.
    if (scaleRef.current) scaleRef.current.scale.setScalar(solarState.sizeBoost)

    if (spinRef.current) spinRef.current.rotation.y += advance
    // Clouds run slightly faster than the surface — the real cloud deck is not
    // locked to the ground, and the tiny differential keeps the layers from
    // looking welded together.
    if (cloudRef.current) cloudRef.current.rotation.y += advance * 1.18
    if (moonsRef.current) moonsRef.current.rotation.y += delta * 0.06
  })

  const hasClouds = !!textures.clouds

  return (
    <group position={position}>
      {/* The orrery size boost scales the body and everything attached to it, but
          never its orbital position — so the worlds grow legible against their orbits
          while the geometry of the system stays truthful. */}
      <group ref={scaleRef}>
        {/* Axial tilt. Obliquity above 90 degrees means the body is effectively
            upside down, which is exactly how Venus and Uranus end up rotating
            backwards on screen without any special-casing. */}
        <group rotation={[0, 0, planet.axialTilt * DEG]}>
        <group ref={spinRef}>
          <mesh>
            <sphereGeometry args={[planet.radius, segments, segments / 2]} />
            <shaderMaterial
              ref={surfaceRef}
              vertexShader={PLANET_VERTEX}
              fragmentShader={PLANET_FRAGMENT}
              uniforms={surfaceUniforms}
              toneMapped={false}
            />
          </mesh>
        </group>

        {hasClouds && (
          <group ref={cloudRef}>
            <mesh>
              <sphereGeometry args={[planet.radius * 1.011, segments, segments / 2]} />
              <shaderMaterial
                vertexShader={PLANET_VERTEX}
                fragmentShader={CLOUDS_FRAGMENT}
                uniforms={{
                  uMap: { value: textures.clouds },
                  uSunDirection: { value: sunDirection },
                  uSunColor: { value: SUNLIGHT_COLOR },
                  uSunIntensity: { value: 1.35 },
                  uOpacity: { value: 0.92 },
                }}
                transparent
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )}

        {planet.atmosphere && (
          <mesh scale={1 + planet.atmosphere.thickness}>
            <sphereGeometry args={[planet.radius, 64, 32]} />
            <shaderMaterial
              vertexShader={ATMOSPHERE_VERTEX}
              fragmentShader={ATMOSPHERE_FRAGMENT}
              uniforms={{
                uColor: { value: atmosphereColor },
                uSunsetColor: {
                  value: new Color(planet.atmosphere.sunset).convertSRGBToLinear(),
                },
                uSunDirection: { value: sunDirection },
                uPower: { value: planet.atmosphere.power },
                uIntensity: { value: planet.atmosphere.intensity },
              }}
              side={BackSide}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        )}

          {planet.rings && <Rings planet={planet} sunDirection={sunDirection} />}
        </group>

        {planet.moons.length > 0 && (
          <group ref={moonsRef}>
            {planet.moons.map((moon) => (
              <Moon
                key={moon.id}
                moon={moon}
                parentRadius={planet.radius}
                sunDirection={sunDirection}
                segments={Math.max(16, segments / 4)}
              />
            ))}
          </group>
        )}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------

/**
 * Split in two so `useTexture` is never called conditionally: Saturn has a real
 * ring strip, the faint dust rings of Jupiter, Uranus and Neptune have none.
 */
function Rings({ planet, sunDirection }: { planet: PlanetDef; sunDirection: Vector3 }) {
  return planet.rings?.map ? (
    <Suspense fallback={null}>
      <RingMesh planet={planet} sunDirection={sunDirection} mapUrl={planet.rings.map} />
    </Suspense>
  ) : (
    <RingMesh planet={planet} sunDirection={sunDirection} mapUrl={null} />
  )
}

function RingMesh({
  planet,
  sunDirection,
  mapUrl,
}: {
  planet: PlanetDef
  sunDirection: Vector3
  mapUrl: string | null
}) {
  const ring = planet.rings!
  // Always called; the fallback URL is a texture already in the cache, so the
  // unmapped rings cost nothing extra.
  const loaded = useTexture(mapUrl ?? '/textures/saturn/ring-alpha.png')
  const map = mapUrl ? loaded : null
  if (map) {
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 8
  }

  const inner = planet.radius * ring.inner
  const outer = planet.radius * ring.outer

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, 192, 1]} />
      <shaderMaterial
        vertexShader={RING_VERTEX}
        fragmentShader={RING_FRAGMENT}
        uniforms={{
          uMap: { value: map },
          uHasMap: { value: !!map },
          uTint: { value: new Color(ring.tint).convertSRGBToLinear() },
          uOpacity: { value: ring.opacity },
          uInner: { value: inner },
          uOuter: { value: outer },
          uSunDirection: { value: sunDirection },
          uPlanetCenter: { value: new Vector3(0, 0, 0) },
          uPlanetRadius: { value: planet.radius },
        }}
        side={DoubleSide}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------

const PROCEDURAL_KIND = { 'ice-lineae': 0, 'grooved-ice': 1, 'dark-regolith': 2 } as const

function Moon({
  moon,
  parentRadius,
  sunDirection,
  segments,
}: {
  moon: MoonDef
  parentRadius: number
  sunDirection: Vector3
  segments: number
}) {
  const groupRef = useRef<Group>(null)
  const spinRef = useRef<Mesh>(null)
  const distance = parentRadius * moon.distance

  useFrame(() => {
    if (!groupRef.current) return
    // Orbital phase is derived from the shared clock, offset per moon so they never
    // line up into an artificial row.
    const angle = (scrollState.time / moon.period) * Math.PI * 2 + moon.distance * 3.1
    groupRef.current.position.set(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance * Math.sin(moon.inclination * DEG),
      Math.sin(angle) * distance,
    )
    // Tidally locked, like almost every major moon in the Solar System.
    if (spinRef.current) spinRef.current.rotation.y = -angle
  })

  return (
    <group ref={groupRef}>
      <mesh ref={spinRef}>
        <sphereGeometry args={[moon.radius, segments, segments / 2]} />
        {moon.map ? (
          <MoonTexturedMaterial url={moon.map} sunDirection={sunDirection} />
        ) : (
          <shaderMaterial
            vertexShader={PLANET_VERTEX}
            fragmentShader={PROCEDURAL_MOON_FRAGMENT}
            uniforms={{
              uBase: {
                value: new Color(moon.procedural?.base ?? '#888888').convertSRGBToLinear(),
              },
              uAccent: {
                value: new Color(moon.procedural?.accent ?? '#444444').convertSRGBToLinear(),
              },
              uAlbedo: { value: moon.procedural?.albedo ?? 0.3 },
              uKind: {
                value: PROCEDURAL_KIND[moon.procedural?.kind ?? 'dark-regolith'],
              },
              uSunDirection: { value: sunDirection },
              uSunColor: { value: SUNLIGHT_COLOR },
              uSunIntensity: { value: 1.35 },
            }}
            toneMapped={false}
          />
        )}
      </mesh>
    </group>
  )
}

function MoonTexturedMaterial({ url, sunDirection }: { url: string; sunDirection: Vector3 }) {
  const map = useTexture(url)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8

  return (
    <shaderMaterial
      vertexShader={PLANET_VERTEX}
      fragmentShader={PLANET_FRAGMENT}
      uniforms={{
        uDayMap: { value: map },
        uNightMap: { value: map },
        uNormalMap: { value: map },
        uSpecularMap: { value: map },
        uHasNight: { value: false },
        uHasNormal: { value: false },
        uHasSpecular: { value: false },
        uSunDirection: { value: sunDirection },
        uSunColor: { value: SUNLIGHT_COLOR },
        uSunIntensity: { value: 1.35 },
        uNormalScale: { value: 1 },
        uRoughness: { value: 0.9 },
        uAmbient: { value: 0.02 },
        uAtmosphereColor: { value: new Color(0.4, 0.4, 0.45) },
      }}
      toneMapped={false}
    />
  )
}
