/**
 * The Sun, built against SDO reference imagery rather than "glowing orange ball".
 *
 * What actually distinguishes a photograph of the Sun from a lit sphere:
 *
 *  1. **Granulation.** The photosphere is a boiling mass of convection cells about
 *     1000 km across — bright polygonal cell centres separated by darker downflow
 *     lanes. It is a *fine* texture, and its absence is the single biggest tell.
 *  2. **Supergranulation.** A much larger, subtler cell network underneath it.
 *  3. **Limb darkening.** Strongly dimmer toward the edge, because near the limb you
 *     see only the cooler upper photosphere. Real, measurable, and rarely modelled.
 *  4. **Sunspots** with a dark umbra and a lighter filamentary penumbra.
 *  5. **Faculae** — bright magnetic patches, most visible *near the limb*, which is
 *     the opposite of how most people would fake surface variation.
 *  6. **A filamentary corona**, not a soft halo. The plasma follows magnetic field
 *     lines into distinct radial streamers, with prominence arcs at the limb.
 *
 * The corona is drawn on a camera-facing billboard rather than a back-facing shell,
 * because streamers and prominences are naturally expressed in polar coordinates
 * around the disc, which a sphere's UVs make awkward and distorted at the poles.
 */

import { SIMPLEX_3D, FBM, BLACKBODY } from './lib'

export const SUN_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

void main() {
  vUv = uv;
  vLocalPos = position;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPosition.xyz);

  gl_Position = projectionMatrix * mvPosition;
}
`

export const SUN_FRAGMENT = /* glsl */ `
${SIMPLEX_3D}
${FBM}
${BLACKBODY}

uniform sampler2D uMap;
uniform float uTime;
uniform float uIntensity;
uniform float uTurbulence;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

// Ridged noise: sharp creases where the noise crosses zero. Inverting it turns the
// creases into the *lanes* between convection cells, which is the correct structure
// for granulation -- bright cells, dark boundaries.
float ridged(vec3 p) {
  return 1.0 - abs(snoise(p));
}

void main() {
  vec3 p = normalize(vLocalPos);

  float mu = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);

  // --- Base photosphere from the SDO-derived map ---
  // Warped slightly so the map itself churns instead of sitting still.
  float drift = fbm(p * 2.6 + vec3(0.0, uTime * 0.02, 0.0), 4, 2.0, 0.5);
  vec2 uv = vUv + vec2(drift, drift * 0.6) * 0.008 * uTurbulence;
  vec3 base = texture2D(uMap, uv).rgb;

  // --- Granulation ---
  // High frequency, so cells stay small relative to the disc. Two octaves of ridged
  // noise at different scales give the irregular polygonal packing real granules
  // have; a single frequency reads as a regular pattern.
  vec3 gp = p * 46.0 + vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04);
  float granule = ridged(gp) * 0.62 + ridged(gp * 2.15 + 11.0) * 0.38;
  granule = pow(clamp(granule, 0.0, 1.0), 3.2);

  // --- Supergranulation ---
  // A much broader network beneath, giving large-scale brightness variation.
  float superGran = fbm(p * 8.5 + vec3(0.0, uTime * 0.012, 0.0), 3, 2.1, 0.5);

  // --- Sunspots ---
  // Sparse dark regions. The threshold is high so only a few appear, each with a
  // dark umbra and a softer penumbra ring around it.
  float spotField = fbm(p * 3.4 + vec3(4.7, uTime * 0.006, 1.3), 4, 2.0, 0.55);
  float umbra = smoothstep(0.46, 0.62, spotField);
  float penumbra = smoothstep(0.32, 0.5, spotField);
  float spot = clamp(penumbra * 0.55 + umbra * 0.45, 0.0, 1.0);

  // --- Temperature ---
  // Granule centres are hotter upwelling plasma, lanes are cooler downflows.
  // Sunspots are dramatically cooler -- about 4000 K against the 5800 K surface,
  // which is exactly why they look dark despite being extremely bright in isolation.
  // Deliberately below the true ~5800 K effective temperature. ACES desaturates
  // bright values toward white, so a physically exact temperature tone maps to a
  // grey-white disc that reads lunar rather than solar. Biasing cooler puts the
  // colour back where an observer expects it after the curve has had its way.
  float kelvin = mix(4300.0, 5750.0, granule);
  kelvin += superGran * 240.0;
  kelvin = mix(kelvin, 3400.0, spot);

  vec3 col = blackbody(kelvin);

  // The map carries real large-scale structure, but only lightly — leaned on too
  // hard it reads as continents rather than as solar activity.
  float mapLuma = dot(base, vec3(0.299, 0.587, 0.114));
  col *= 0.78 + 0.42 * mapLuma;
  // Strong granule contrast: this is the texture that has to survive the bloom.
  col *= 0.58 + 0.82 * granule;
  col *= 1.0 - spot * 0.8;

  // --- Faculae ---
  // Bright magnetic network, visible mainly near the limb where you look along the
  // walls of the granules rather than down into them.
  float faculaMask = smoothstep(0.5, 0.85, superGran) * (1.0 - mu);
  col += blackbody(6600.0) * faculaMask * 0.5;

  // --- Limb darkening ---
  // Quadratic law with coefficients close to the measured visible-light profile.
  // This is what makes the disc read as a sphere of gas rather than a flat circle.
  float limb = 1.0 - 0.75 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu);
  col *= clamp(limb, 0.0, 1.0);

  // A restrained chromospheric edge. Deliberately weak: overdoing this produces the
  // glowing-egg rim that instantly reads as CG.
  float rim = pow(1.0 - mu, 7.0);
  col += vec3(1.0, 0.42, 0.16) * rim * 0.5;

  // --- Photosphere tint ---
  // A deliberate, stated departure from physics. The Sun's true 5778 K blackbody is
  // very close to white, and that is exactly how it looks from space — the maths
  // above is correct and produces a white disc. But every familiar image of the Sun
  // is either false-colour EUV (SDO's AIA channels) or shot through atmosphere, and
  // the chapter is graded warm gold. Rendering a physically honest white disc here
  // reads as the Moon. So the blackbody drives the *structure* and this tint sets
  // the palette, rather than distorting the temperature maths to fake it.
  vec3 photosphereTint = vec3(1.0, 0.70, 0.34);
  col *= photosphereTint;

  // Kept just under the bloom threshold across most of the disc, so glow comes from
  // the brightest granules and the limb rather than from the whole surface clipping.
  gl_FragColor = vec4(col * uIntensity * 0.86, 1.0);
}
`

/**
 * Corona and prominences, on a camera-facing billboard.
 *
 * Works in polar coordinates around the solar disc so that streamers can radiate
 * correctly and prominences can be placed at specific position angles on the limb.
 */
export const CORONA_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const CORONA_FRAGMENT = /* glsl */ `
${SIMPLEX_3D}
${FBM}

uniform float uTime;
uniform float uIntensity;
uniform vec3 uInnerColor;
uniform vec3 uOuterColor;
// Solar radius as a fraction of this billboard's half-width.
uniform float uDiscRadius;

varying vec2 vUv;

void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  if (r > 1.0) discard;

  float angle = atan(c.y, c.x);

  // Everything is expressed relative to the solar limb: 0 at the surface, growing
  // outward. Real coronal structure scales with solar radii, not screen pixels.
  float h = (r - uDiscRadius) / max(1.0 - uDiscRadius, 1e-4);
  if (h < 0.0) discard; // inside the photosphere; the surface shader owns that

  // --- Radial streamers ---
  // Sampling noise on (angle, radius) with the angular term scaled much harder than
  // the radial one stretches the noise into spokes -- plasma following open magnetic
  // field lines. Uniform noise here would just look like fog.
  float a1 = angle * 5.0;
  float a2 = angle * 13.0;
  float streamers =
      fbm(vec3(cos(a1), sin(a1), r * 1.4 + uTime * 0.03), 4, 2.0, 0.55) * 0.62
    + fbm(vec3(cos(a2), sin(a2), r * 3.0 - uTime * 0.02), 3, 2.1, 0.5) * 0.38;
  streamers = smoothstep(-0.35, 0.75, streamers);

  // Helmet streamers: a few broad, bright structures at particular position angles,
  // as seen in eclipse photographs.
  float helmet = pow(abs(sin(angle * 2.0 + 0.7)), 6.0) * 0.5
               + pow(abs(sin(angle * 3.0 - 1.9)), 8.0) * 0.35;

  // --- Density falloff ---
  // The corona falls off steeply but never truly ends. Two exponentials -- a tight
  // inner one and a long faint outer one -- match the observed profile far better
  // than a single curve.
  float inner = exp(-h * 16.0);
  float outer = exp(-h * 5.0) * 0.22;
  float density = (inner + outer) * (0.18 + streamers * 0.7 + helmet * 0.8);

  // --- Prominences ---
  // Bright, dense arcs hugging the limb at specific angles, drifting slowly.
  float promAngle1 = 2.15 + sin(uTime * 0.05) * 0.06;
  float promAngle2 = -0.95 + cos(uTime * 0.04) * 0.05;
  float promAngle3 = 4.05 + sin(uTime * 0.03 + 1.0) * 0.04;

  float prom = 0.0;
  prom += exp(-pow((angle - promAngle1) * 7.0, 2.0)) * exp(-h * 42.0);
  prom += exp(-pow((angle - promAngle2) * 9.0, 2.0)) * exp(-h * 55.0) * 0.8;
  prom += exp(-pow((angle - promAngle3) * 11.0, 2.0)) * exp(-h * 66.0) * 0.65;
  // Break them up so they read as looped filaments rather than smooth blobs.
  prom *= 0.55 + 0.75 * fbm(vec3(cos(angle * 20.0), sin(angle * 20.0), h * 9.0 + uTime * 0.09), 3, 2.0, 0.5);

  // Prominences are cooler, denser hydrogen -- notably redder than the corona.
  vec3 promColor = vec3(1.0, 0.24, 0.12);

  vec3 col = mix(uInnerColor, uOuterColor, clamp(h * 1.6, 0.0, 1.0)) * density;
  col += promColor * prom * 1.6;

  // Soft cutoff at the billboard's edge so the quad never shows.
  col *= 1.0 - smoothstep(0.82, 1.0, r);

  gl_FragColor = vec4(col * uIntensity * 0.55, 1.0);
}
`
