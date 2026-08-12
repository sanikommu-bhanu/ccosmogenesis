/**
 * Orbit paths for the establishing shot.
 *
 * Thin, faint, additive arcs on the ecliptic plane. The intent is an orrery — a
 * physical scale model — rather than a diagram, so these have to read as engraved
 * lines catching light, not as game-UI selection circles.
 *
 * Three things keep them on the right side of that line:
 *  - they are barely brighter than the starfield, and fade with distance;
 *  - each arc is brightest near its own planet and falls away around the far side,
 *    so the eye is led along the row rather than around eight competing rings;
 *  - they fade out completely as the camera drops into the ring flythrough, where
 *    a giant circle drawn around a planet you are orbiting would be absurd.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Group, ShaderMaterial } from 'three'
import { PLANETS } from '../config/planets'

const ORBIT_VERTEX = /* glsl */ `
uniform float uPlanetAngle;

varying float vAngleFalloff;
varying float vDist;

void main() {
  // Angle of this vertex around the ring, derived from its own position so no
  // per-vertex attribute is needed.
  float a = atan(position.z, position.x);

  // Shortest angular distance to the planet sitting on this orbit.
  float d = abs(mod(a - uPlanetAngle + 3.14159265, 6.28318531) - 3.14159265);
  // Brightest at the planet, trailing away behind it.
  vAngleFalloff = pow(1.0 - clamp(d / 3.14159265, 0.0, 1.0), 1.6);

  vec4 world = modelMatrix * vec4(position, 1.0);
  vDist = length(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const ORBIT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

varying float vAngleFalloff;
varying float vDist;

void main() {
  // Fade with distance so the outer orbits do not scream as loudly as the inner
  // ones just because they are longer.
  float distanceFade = 1.0 - smoothstep(120.0, 420.0, vDist);
  float alpha = uOpacity * (0.12 + 0.88 * vAngleFalloff) * distanceFade;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(uColor * alpha, alpha);
}
`

export function OrbitArcs({ opacity }: { opacity: number }) {
  const groupRef = useRef<Group>(null)
  const materials = useRef<ShaderMaterial[]>([])

  const arcs = useMemo(
    () =>
      PLANETS.map((planet) => ({
        id: planet.id,
        radius: planet.orbitRadius,
        angle: planet.phase,
        // Tinted toward each planet's own colour, very desaturated. Enough that the
        // arcs feel connected to their worlds without becoming a colour-coded key.
        color: new Color(planet.color).convertSRGBToLinear().lerp(new Color(0.6, 0.66, 0.8), 0.72),
      })),
    [],
  )

  useFrame(() => {
    for (const m of materials.current) {
      if (m) m.uniforms.uOpacity.value = opacity
    }
  })

  if (opacity <= 0.001) return null

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
      {arcs.map((arc, i) => (
        <mesh key={arc.id} renderOrder={-2}>
          {/* A ring barely wider than a line. Thickness in world units keeps it
              consistent at any zoom, unlike a line primitive whose width is fixed
              in pixels and looks wrong the moment the camera moves. */}
          <ringGeometry args={[arc.radius - 0.055, arc.radius + 0.055, 256, 1]} />
          <shaderMaterial
            ref={(m) => {
              if (m) materials.current[i] = m
            }}
            vertexShader={ORBIT_VERTEX}
            fragmentShader={ORBIT_FRAGMENT}
            uniforms={{
              uColor: { value: arc.color },
              uOpacity: { value: 0 },
              // The ring geometry lies in XY before the group's -90 degree X
              // rotation, so the planet's XZ phase maps directly onto it.
              uPlanetAngle: { value: -arc.angle },
            }}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
