/**
 * The cosmic particle system — chapters 0 through 5.
 *
 * This is a single set of points that never gets torn down or swapped. It *is* the
 * singularity, then the Big Bang debris, then the cooling gas, then the spiral
 * galaxy, then the Milky Way we dive into. Because it's one system, the chapter
 * boundaries aren't transitions between scenes at all — they're the same particles
 * being driven by different terms of the same equation. There is nothing to cut.
 *
 * Every phase is a separate 0→1 uniform computed on the CPU from scroll position,
 * so any combination can be scrubbed to directly and the whole thing is reversible
 * by construction.
 */

import { SIMPLEX_3D, CURL_NOISE, BLACKBODY, HASH, EASING, POINT_SPRITE } from './lib'

export const COSMOS_VERTEX = /* glsl */ `
${SIMPLEX_3D}
${CURL_NOISE}
${BLACKBODY}
${HASH}
${EASING}

// --- Phase drivers, each 0..1, each derived purely from scroll ---
uniform float uBirth;    // ch0: the point trembles
uniform float uBurst;    // ch1: radial explosion
uniform float uCool;     // ch2: expansion, turbulence, cooling
uniform float uSpiral;   // ch3: gravity organises the debris into a disc
uniform float uDive;     // ch4: the Milky Way, camera pushing inward
uniform float uFade;     // ch5: dissolve out toward the Sun

uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uSpeed;    // scroll velocity, drives streak-stretching

attribute vec3 aBurstDir;     // unit vector, direction of ejection
attribute vec3 aGalaxyTarget; // where this particle belongs in the spiral
attribute float aSpeed;       // per-particle ejection speed
attribute float aSize;
attribute float aTemp;        // stellar temperature in Kelvin, for the galaxy phase
attribute float aStagger;     // 0..1, desynchronises the reform so it streams

varying vec3 vColor;
varying float vAlpha;
varying float vStreak;

void main() {
  float seed = aStagger;

  // ---------------------------------------------------------------------
  // 0. Singularity — everything collapsed to a point, trembling
  // ---------------------------------------------------------------------
  // A little sub-pixel jitter keeps the point alive rather than dead-static.
  vec3 pos = aBurstDir * (0.004 + uBirth * 0.03 * hash11(seed * 91.7));
  pos += aBurstDir * sin(uTime * 3.1 + seed * 62.8) * 0.006 * uBirth;

  // ---------------------------------------------------------------------
  // 1. Big Bang — radial ejection
  // ---------------------------------------------------------------------
  // easeOutQuart: violent initial expansion that decelerates hard, which is both
  // roughly correct and reads far better than a linear ramp.
  float burst = easeOutQuart(uBurst);
  pos += aBurstDir * aSpeed * burst * 26.0;

  // ---------------------------------------------------------------------
  // 2. Expansion & cooling — continued drift plus divergence-free turbulence
  // ---------------------------------------------------------------------
  float cool = easeInOutCubic(uCool);
  pos += aBurstDir * aSpeed * cool * 30.0;

  // Curl noise is divergence-free, so the gas swirls without draining into
  // clumps the way a plain gradient field would.
  vec3 curl = curlNoise(pos * 0.028 + vec3(0.0, 0.0, uTime * 0.015));
  pos += curl * cool * 9.0 * (0.35 + 0.65 * hash11(seed * 13.3));

  // ---------------------------------------------------------------------
  // 3. Galaxy formation — gravity pulls the debris onto the disc
  // ---------------------------------------------------------------------
  // Each particle starts its journey at a slightly different moment, so the field
  // *streams* into the spiral over time instead of every point snapping at once.
  float arrival = clamp((uSpiral - seed * 0.42) / 0.58, 0.0, 1.0);
  // easeOutBack overshoots slightly: particles fly a touch past the arm and settle
  // back, which is what gives the formation weight.
  float settle = easeOutBack(arrival, 0.5);

  vec3 target = aGalaxyTarget;

  // Differential rotation: inner orbits are faster, which shears the arms exactly
  // the way real spiral structure winds up.
  float rr = length(target.xz);
  float omega = 1.0 / (1.4 + rr * 0.5);
  float spinT = (uSpiral + uDive * 1.6) * 5.2 + uTime * 0.05;
  float ang = spinT * omega;
  float cs = cos(ang), sn = sin(ang);
  target.xz = mat2(cs, -sn, sn, cs) * target.xz;

  pos = mix(pos, target, settle);

  // A breathing wobble on the settled disc so it never looks like a frozen mesh.
  pos += curlNoise(target * 0.09 + uTime * 0.02) * settle * 0.42;

  // ---------------------------------------------------------------------
  // 4 & 5. Dive and dissolve
  // ---------------------------------------------------------------------
  // On the way out the disc loosens back into free particles — the galaxy comes
  // apart into the same field it formed from, which is the return path of the
  // same transition rather than a new one.
  float dissolve = easeInCubic(uFade);
  pos += aBurstDir * dissolve * 120.0 * (0.4 + aSpeed);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float viewDist = -mvPosition.z;

  // ---------------------------------------------------------------------
  // Colour — blackbody throughout, never an arbitrary palette
  // ---------------------------------------------------------------------
  // The fireball cools from ~12000 K white-hot through orange as it expands, then
  // resolves into a population of real stellar temperatures once the galaxy forms.
  float fireball = mix(12000.0, 2600.0, clamp(uBurst * 0.55 + cool, 0.0, 1.0));
  float stellar = aTemp;
  vec3 hot = blackbody(fireball);
  vec3 star = blackbody(stellar);
  vColor = mix(hot, star, settle);

  // Chapter 2 pushes violet into the cooled gas — the one deliberate departure
  // from strict blackbody, motivated by real emission-nebula colour.
  vec3 nebula = vec3(0.42, 0.18, 0.72);
  float nebulaMix = cool * (1.0 - settle) * 0.55 * (0.4 + 0.6 * hash11(seed * 7.7));
  vColor = mix(vColor, nebula, nebulaMix);

  // ---------------------------------------------------------------------
  // Size and opacity
  // ---------------------------------------------------------------------
  float size = aSize * uSize;
  // Bigger at the instant of the burst, settling as it expands.
  size *= 1.0 + 1.8 * uBurst * (1.0 - burst);
  size *= mix(1.0, 0.62, settle);

  // The projection constant is the single strongest control on how the whole field
  // reads. Too high and 200k sprites overlap into a solid sheet that no amount of
  // tone mapping can recover; this is tuned so a typical particle covers a few
  // pixels and the density comes from *count*, not from size.
  gl_PointSize = clamp(size * uPixelRatio * (55.0 / max(viewDist, 0.6)), 0.5, 64.0);

  // Additive blending accumulates, so per-particle contribution has to stay small —
  // brightness is meant to come from thousands of particles overlapping, which is
  // what produces real depth in the dense regions instead of a flat clipped mass.
  float alpha = 0.16;
  alpha *= smoothstep(0.0, 0.06, uBirth + uBurst);       // fade up out of black
  alpha *= 1.0 - smoothstep(0.55, 1.0, uFade);           // fade out toward the Sun
  alpha *= mix(1.0, 1.5, settle);                        // stars read crisper than gas

  // During the cooling chapter the particles *are* diffuse gas, not stars. Dimming
  // them here stops the frame becoming a wall of uniform dots and lets the nebula
  // volumetrics carry the chapter, which is the right reading of the physics too:
  // this is the era before anything had condensed into a star.
  alpha *= mix(1.0, 0.4, cool * (1.0 - settle));

  // The one moment the frame is *meant* to clip: the instant of the Big Bang.
  // A short, sharp spike that decays fast, rather than a chapter-long white-out.
  float flash = exp(-uBurst * 26.0) * step(0.001, uBurst);
  alpha *= 1.0 + flash * 9.0;

  // Distance falloff stops the far side of the galaxy from turning into a solid
  // sheet under additive blending. (Note the reversed edges: smoothstep with
  // edge0 > edge1 is undefined in GLSL, so this is written the safe way round.)
  alpha *= 1.0 - smoothstep(40.0, 340.0, viewDist);

  vAlpha = alpha;
  // Fast scrubbing stretches points into streaks; see the fragment shader.
  vStreak = clamp(uSpeed, 0.0, 1.0);

  gl_Position = projectionMatrix * mvPosition;
}
`

export const COSMOS_FRAGMENT = /* glsl */ `
${POINT_SPRITE}

varying vec3 vColor;
varying float vAlpha;
varying float vStreak;

void main() {
  vec2 coord = gl_PointCoord;

  // At speed, squash the sprite along Y so points read as motion-blurred streaks
  // instead of hard dots. Cheap, and far more convincing than it has any right to be.
  coord.y = 0.5 + (coord.y - 0.5) * (1.0 + vStreak * 2.2);

  float mask = pointSprite(coord, 0.55);
  if (mask < 0.004) discard;

  // Additive: no alpha channel, brightness *is* the contribution.
  gl_FragColor = vec4(vColor * mask * vAlpha, 1.0);
}
`

/**
 * Volumetric nebula shader — raymarched-ish billboards, not a texture.
 *
 * Drawn as a handful of large camera-facing quads with domain-warped fBm. Cheaper
 * than true volumetrics by orders of magnitude, and at these scales the difference
 * is invisible once bloom is applied.
 */
export const NEBULA_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const NEBULA_FRAGMENT = /* glsl */ `
${SIMPLEX_3D}

// fbm/fbmWarp are pulled in separately so this shader only pays for what it uses.
float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float amp = 0.5, freq = 1.0, sum = 0.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(p * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / max(norm, 1e-5);
}

uniform float uTime;
uniform float uOpacity;
uniform float uScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSeed;

varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;

  // Soft elliptical envelope so the quad's edges never show.
  float envelope = pow(max(0.0, 1.0 - r), 2.2);
  if (envelope <= 0.001) discard;

  vec3 p = vec3(vUv * uScale, uSeed + uTime * 0.012);

  // Domain warp: this is the step that separates "gas" from "static".
  vec3 q = vec3(fbm(p, 4, 2.0, 0.5), fbm(p + 3.7, 4, 2.0, 0.5), fbm(p + 8.1, 4, 2.0, 0.5));
  float d = fbm(p + 2.4 * q, 5, 2.0, 0.5);
  d = d * 0.5 + 0.5;

  // Two-tone mix with a sharp-ish density ramp, so there are dense cores and
  // wispy edges rather than a uniform fog.
  float density = smoothstep(0.34, 0.92, d) * envelope;
  vec3 col = mix(uColorA, uColorB, smoothstep(0.3, 0.85, d));

  // Rim brightening — denser cores glow hotter, as they do in real emission nebulae.
  col += uColorB * pow(density, 3.0) * 0.6;

  gl_FragColor = vec4(col * density * uOpacity, 1.0);
}
`

/**
 * Deep starfield — the parallax layer behind everything, and the source of the
 * hyperspace streaks in chapter 5.
 */
export const STARFIELD_VERTEX = /* glsl */ `
${BLACKBODY}
${HASH}

uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uStretch;   // 0 = points, 1 = full hyperspace streaks
uniform float uOpacity;
uniform vec3 uOrigin;     // the point streaks radiate from

attribute float aSize;
attribute float aTemp;
attribute float aTwinkle;

varying vec3 vColor;
varying float vAlpha;
varying float vStretch;

void main() {
  vec3 pos = position;

  // Stretch each star away from the travel origin. Because the offset is along the
  // real radial direction, the streaks converge on the vanishing point correctly
  // instead of all leaning the same way.
  vec3 radial = normalize(pos - uOrigin);
  pos += radial * uStretch * 26.0 * (0.4 + 0.6 * aTwinkle);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float viewDist = -mvPosition.z;

  // Real stellar temperatures: cool red dwarfs through hot blue giants. The scene
  // is mostly the former, which is why a correct starfield reads warmer than the
  // pure-white version everyone reaches for first.
  vColor = blackbody(aTemp);

  // Scintillation, at a different rate per star.
  float twinkle = 0.72 + 0.28 * sin(uTime * (0.6 + aTwinkle * 2.4) + aTwinkle * 62.8);

  gl_PointSize = clamp(
    aSize * uSize * uPixelRatio * (85.0 / max(viewDist, 1.0)) * (1.0 + uStretch * 0.5),
    0.5,
    40.0
  );

  // Reversed edges: GLSL smoothstep is undefined when edge0 > edge1.
  vAlpha = uOpacity * twinkle * (1.0 - smoothstep(120.0, 1400.0, viewDist)) * 0.55;
  vStretch = uStretch;

  gl_Position = projectionMatrix * mvPosition;
}
`

export const STARFIELD_FRAGMENT = /* glsl */ `
${POINT_SPRITE}

varying vec3 vColor;
varying float vAlpha;
varying float vStretch;

void main() {
  vec2 coord = gl_PointCoord;
  // Squash into a streak along the direction of travel as the jump ramps up.
  coord.y = 0.5 + (coord.y - 0.5) * (1.0 + vStretch * 6.0);

  float mask = pointSprite(coord, 0.5);
  if (mask < 0.004) discard;

  gl_FragColor = vec4(vColor * mask * vAlpha, 1.0);
}
`
