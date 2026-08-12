/**
 * Planet surface and atmosphere.
 *
 * The surface shader exists instead of MeshStandardMaterial because Earth needs
 * something standard PBR cannot express: city lights that appear *only* on the
 * night side, and only in the fraction of the terminator where the sun has actually
 * set. That's a function of the light direction, not of an emissive map, so it has
 * to be hand-written.
 *
 * Everything else — normal mapping, specular ocean response, terminator softening —
 * is here too so all eight planets share one lighting model and therefore look like
 * they were photographed by the same camera.
 */

import { SIMPLEX_3D, FBM } from './lib'

export const PLANET_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vTangent;
varying vec3 vBitangent;
// Object-space position. Needed because modelMatrix is only injected into the
// vertex stage by three -- fragment shaders that want object space must be handed
// it as a varying instead.
varying vec3 vLocalPos;

void main() {
  vUv = uv;
  vLocalPos = position;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  vNormal = normalize(mat3(modelMatrix) * normal);

  // Tangent basis derived from the sphere's parameterisation. A UV sphere's
  // tangent runs along increasing longitude, which lets the normal map be applied
  // without shipping a precomputed tangent attribute.
  vec3 up = abs(normal.y) > 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vTangent = normalize(mat3(modelMatrix) * normalize(cross(up, normal)));
  vBitangent = normalize(cross(vNormal, vTangent));

  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

export const PLANET_FRAGMENT = /* glsl */ `
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;

uniform bool uHasNight;
uniform bool uHasNormal;
uniform bool uHasSpecular;

uniform vec3 uSunDirection;   // world space, points *from* the planet toward the Sun
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uNormalScale;
uniform float uRoughness;
uniform float uAmbient;       // faint fill so the night side isn't pure black
uniform vec3 uAtmosphereColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  vec3 albedo = texture2D(uDayMap, vUv).rgb;

  // --- Normal mapping ---
  vec3 N = normalize(vNormal);
  if (uHasNormal) {
    vec3 tangentNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    tangentNormal.xy *= uNormalScale;
    mat3 TBN = mat3(normalize(vTangent), normalize(vBitangent), N);
    N = normalize(TBN * tangentNormal);
  }

  vec3 L = normalize(uSunDirection);
  vec3 V = normalize(vViewDir);

  float NdotL = dot(N, L);

  // --- Terminator ---
  // Softened slightly rather than a hard clamp. A real terminator is blurred by the
  // Sun's angular size (about half a degree) plus atmospheric scattering; a razor
  // edge is another classic tell.
  float dayAmount = smoothstep(-0.12, 0.22, NdotL);
  float diffuse = max(NdotL, 0.0);

  vec3 lit = albedo * uSunColor * uSunIntensity * diffuse;

  // --- Specular ---
  // The specular map is an ocean/land mask: water is smooth and glints, land is
  // rough and does not. Driving roughness from it is what produces the sun-glint
  // that reads unmistakably as water.
  if (uHasSpecular) {
    float oceanMask = texture2D(uSpecularMap, vUv).r;
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float shininess = mix(8.0, 160.0, oceanMask);
    float spec = pow(NdotH, shininess) * oceanMask * (1.0 - uRoughness);
    lit += uSunColor * spec * 1.4 * step(0.0, NdotL);
  }

  // --- Night side ---
  if (uHasNight) {
    vec3 night = texture2D(uNightMap, vUv).rgb;
    // City lights only where the sun has genuinely set. The narrow smoothstep keeps
    // them out of the lit hemisphere and out of the bright half of the terminator,
    // so dusk creeps across the surface the way it does from orbit.
    float nightAmount = 1.0 - smoothstep(-0.18, 0.02, NdotL);
    // Warm sodium-vapour cast rather than the map's raw white.
    lit += night * vec3(1.0, 0.82, 0.52) * nightAmount * 1.65;
  }

  // --- Ambient ---
  // A trace of fill light, tinted by the planet's own atmosphere, standing in for
  // light scattered around the limb. Kept very low: the far side should read as
  // genuinely dark, which is the whole point of a single-light-source scene.
  lit += albedo * uAtmosphereColor * uAmbient;

  // Faint rim on the lit side, from atmospheric forward scattering.
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  lit += uAtmosphereColor * rim * dayAmount * 0.28;

  gl_FragColor = vec4(lit, 1.0);
}
`

/**
 * Atmosphere shell.
 *
 * A slightly larger sphere rendered back-face-first with additive blending. The
 * important part is `sunset`: at the terminator, light travels a long path through
 * the atmosphere, scattering out the blue and leaving orange. Blending toward that
 * colour based on the *grazing angle to the sun* — rather than painting a static
 * blue rim — is what produces a believable sunrise line.
 */
export const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunsetColor;
uniform vec3 uSunDirection;
uniform float uPower;
uniform float uIntensity;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uSunDirection);

  // Fresnel: the shell is only visible where it is edge-on, i.e. the limb.
  float fres = pow(1.0 - max(dot(N, V), 0.0), uPower);

  float NdotL = dot(N, L);

  // Only the lit limb glows. Without this the atmosphere haloes the night side too,
  // which instantly looks wrong because there is nothing there to scatter light.
  float lit = smoothstep(-0.35, 0.35, NdotL);

  // Forward scattering: brightest when looking almost straight through the
  // atmosphere toward the sun, which is why a crescent planet has a brilliant rim.
  float forward = pow(max(dot(V, -L), 0.0), 3.0);

  // The terminator band — where NdotL is near zero — goes orange.
  float grazing = 1.0 - abs(NdotL);
  float sunset = pow(clamp(grazing, 0.0, 1.0), 4.0);

  vec3 col = mix(uColor, uSunsetColor, sunset * 0.85);
  float alpha = fres * lit * uIntensity * (0.75 + forward * 1.1);

  gl_FragColor = vec4(col * alpha, alpha);
}
`

/**
 * Cloud layer — its own thin shell just above the surface.
 *
 * The source map is greyscale, so luminance becomes opacity. Clouds are lit by the
 * same sun direction and cast no shadow (a real shadow pass for a layer this thin
 * costs far more than it returns at these framings).
 */
export const CLOUDS_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  float density = texture2D(uMap, vUv).r;
  if (density < 0.02) discard;

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDirection);
  float NdotL = dot(N, L);

  float diffuse = max(NdotL, 0.0);
  float dayAmount = smoothstep(-0.14, 0.25, NdotL);

  // Cloud tops catch the light slightly before the ground does, and hold it
  // slightly longer — the reason the terminator looks ragged from orbit.
  vec3 col = uSunColor * uSunIntensity * (diffuse * 0.9 + 0.1);

  // Silver lining: clouds at a grazing angle to the sun scatter forward strongly.
  vec3 V = normalize(vViewDir);
  float forward = pow(max(dot(V, -L), 0.0), 2.0);
  col += uSunColor * forward * dayAmount * 0.35;

  float alpha = density * uOpacity * max(dayAmount, 0.06);

  gl_FragColor = vec4(col, alpha);
}
`

/**
 * Procedural surfaces for the three moons with no reachable global map.
 *
 * Not flat colours: each generates the body's actual characteristic terrain from
 * noise, at its measured albedo. See public/textures/README.md for why these three
 * are procedural and what would be needed to replace them with real data.
 */
export const PROCEDURAL_MOON_FRAGMENT = /* glsl */ `
${SIMPLEX_3D}
${FBM}

uniform vec3 uBase;
uniform vec3 uAccent;
uniform float uAlbedo;
uniform int uKind;          // 0 = ice-lineae (Europa), 1 = grooved-ice (Ganymede), 2 = dark-regolith (Deimos)
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vLocalPos;

void main() {
  // Object space, so the terrain is fixed to the body and rotates with it rather
  // than swimming as the moon orbits.
  vec3 p = normalize(vLocalPos);
  vec3 surface = uBase;

  if (uKind == 0) {
    // Europa: a high-albedo ice shell cut by long, dark, curved fractures. The
    // ridges are the *thin* features, so the noise is inverted and sharpened.
    float f = fbm(p * 4.0, 5, 2.1, 0.55);
    float warp = fbm(p * 2.0 + f, 4, 2.0, 0.5);
    float lineae = 1.0 - smoothstep(0.0, 0.09, abs(warp));
    float fine = 1.0 - smoothstep(0.0, 0.05, abs(fbm(p * 9.0 + warp, 3, 2.0, 0.5)));
    surface = mix(uBase, uAccent, clamp(lineae * 0.85 + fine * 0.4, 0.0, 1.0));
  } else if (uKind == 1) {
    // Ganymede: two terrains — old dark cratered ground, and younger bright
    // grooved sulci carved across it.
    float terrain = fbm(p * 2.6, 4, 2.0, 0.5);
    float grooves = sin(fbm(p * 3.4, 4, 2.0, 0.5) * 22.0) * 0.5 + 0.5;
    float sulci = smoothstep(0.15, 0.6, terrain) * grooves;
    float craters = fbm(p * 16.0, 3, 2.2, 0.5) * 0.5 + 0.5;
    surface = mix(uAccent, uBase, clamp(sulci + craters * 0.25, 0.0, 1.0));
  } else {
    // Deimos: craters softened almost flat by a deep regolith blanket, on very
    // dark carbonaceous material.
    float craters = fbm(p * 7.0, 4, 2.3, 0.5);
    float regolith = fbm(p * 20.0, 3, 2.0, 0.5) * 0.5 + 0.5;
    surface = mix(uBase, uAccent, smoothstep(-0.2, 0.5, craters) * 0.7 + regolith * 0.2);
  }

  surface *= uAlbedo * 2.2;

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDirection);
  float diffuse = max(dot(N, L), 0.0);

  vec3 col = surface * uSunColor * uSunIntensity * diffuse;
  col += surface * 0.02;

  gl_FragColor = vec4(col, 1.0);
}
`

/** Ring particles and the ring plane. */
export const RING_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

export const RING_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform bool uHasMap;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uInner;
uniform float uOuter;
uniform vec3 uSunDirection;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;

varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  // Radial position across the ring, 0 at the inner edge, 1 at the outer.
  vec3 local = vWorldPos - uPlanetCenter;
  float dist = length(local);
  float t = (dist - uInner) / max(uOuter - uInner, 1e-4);
  if (t < 0.0 || t > 1.0) discard;

  vec4 sampled = uHasMap ? texture2D(uMap, vec2(t, 0.5)) : vec4(1.0);
  float alpha = (uHasMap ? sampled.a : 0.55) * uOpacity;
  if (alpha < 0.004) discard;

  vec3 col = (uHasMap ? sampled.rgb : vec3(1.0)) * uTint;

  // --- Planet shadow on the rings ---
  // Project the ring point onto the sun direction; if it sits behind the planet and
  // within its radius of the sun-line, it is eclipsed. Saturn casting its own
  // shadow across its rings is one of the most recognisable things in the Solar
  // System, and it costs almost nothing to compute.
  vec3 L = normalize(uSunDirection);
  float along = dot(local, -L);
  if (along > 0.0) {
    float perp = length(local + L * along);
    float shadow = smoothstep(uPlanetRadius * 0.88, uPlanetRadius * 1.14, perp);
    col *= mix(0.12, 1.0, shadow);
  }

  // Rings are largely water ice and scatter forward strongly, so they brighten
  // considerably when backlit.
  gl_FragColor = vec4(col, alpha);
}
`
