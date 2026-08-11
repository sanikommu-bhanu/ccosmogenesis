/**
 * Shared GLSL. Imported as template strings and concatenated into shader sources.
 *
 * Kept as .ts rather than .glsl files so there's no build plugin in the chain and
 * HMR is instant. The `/* glsl *\/` tag makes editors syntax-highlight the strings.
 */

/** 3D simplex noise — Ashima Arts / Stefan Gustavson, public domain. */
export const SIMPLEX_3D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

/** Fractal Brownian motion, and the domain-warped variant used for nebulae. */
export const FBM = /* glsl */ `
float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float amp = 0.5;
  float freq = 1.0;
  float sum = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(p * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / max(norm, 1e-5);
}

// Two-pass domain warp. This is what turns "noise" into something that reads as
// billowing gas rather than television static.
float fbmWarp(vec3 p, int octaves) {
  vec3 q = vec3(fbm(p, octaves, 2.0, 0.5),
                fbm(p + vec3(5.2, 1.3, 2.7), octaves, 2.0, 0.5),
                fbm(p + vec3(1.7, 9.2, 4.1), octaves, 2.0, 0.5));
  vec3 r = vec3(fbm(p + 4.0 * q + vec3(1.7, 9.2, 3.3), octaves, 2.0, 0.5),
                fbm(p + 4.0 * q + vec3(8.3, 2.8, 6.1), octaves, 2.0, 0.5),
                fbm(p + 4.0 * q + vec3(3.1, 5.9, 1.2), octaves, 2.0, 0.5));
  return fbm(p + 4.0 * r, octaves, 2.0, 0.5);
}
`

/**
 * Curl noise — divergence-free, so particles advected by it swirl and never
 * bunch up into clumps or drain into sinks the way plain gradient noise makes them.
 * This is the field that organises the Big Bang debris into a galaxy.
 */
export const CURL_NOISE = /* glsl */ `
vec3 snoiseVec3(vec3 x) {
  return vec3(
    snoise(x),
    snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
    snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
  );
}

vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  vec3 px0 = snoiseVec3(p - dx), px1 = snoiseVec3(p + dx);
  vec3 py0 = snoiseVec3(p - dy), py1 = snoiseVec3(p + dy);
  vec3 pz0 = snoiseVec3(p - dz), pz1 = snoiseVec3(p + dz);

  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);

  return normalize(vec3(x, y, z) / (2.0 * e));
}
`

/**
 * Blackbody radiation colour from temperature in Kelvin.
 *
 * Used everywhere something is hot: the Big Bang cooling from white-hot through
 * orange, and the starfield, where real stars run from cool red M-class through
 * to hot blue O-class. Rendering every star pure white is the single biggest
 * tell of an amateur space scene.
 *
 * Neil Bartlett's approximation of the Planckian locus, accurate 1000–40000 K.
 */
export const BLACKBODY = /* glsl */ `
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  vec3 c;

  if (t <= 66.0) {
    c.r = 1.0;
    c.g = clamp(0.39008157876901960784 * log(t) - 0.63184144378862745098, 0.0, 1.0);
  } else {
    c.r = clamp(1.29293618606274509804 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    c.g = clamp(1.12989086089529411765 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  }

  if (t >= 66.0) {
    c.b = 1.0;
  } else if (t <= 19.0) {
    c.b = 0.0;
  } else {
    c.b = clamp(0.54320678911019607843 * log(t - 10.0) - 1.19625408914, 0.0, 1.0);
  }

  return c;
}
`

/** Cheap hash functions for per-particle randomness derived from an index. */
export const HASH = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

/** Easing curves mirroring src/lib/math.ts, so CPU and GPU motion match. */
export const EASING = /* glsl */ `
float easeOutCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }
float easeInCubic(float t)  { return t * t * t; }
float easeOutQuart(float t) { return 1.0 - pow(1.0 - t, 4.0); }
float easeInQuart(float t)  { return t * t * t * t; }
float easeOutExpo(float t)  { return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }
float easeInExpo(float t)   { return t <= 0.0 ? 0.0 : pow(2.0, 10.0 * t - 10.0); }
float easeInOutCubic(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

// Overshoot-then-settle. Particles reforming into a shape arrive with weight
// instead of snapping onto their targets.
float easeOutBack(float t, float overshoot) {
  float c3 = overshoot + 1.0;
  return 1.0 + c3 * pow(t - 1.0, 3.0) + overshoot * pow(t - 1.0, 2.0);
}

float remap(float v, float a, float b, float c, float d) {
  return c + (d - c) * clamp((v - a) / (b - a), 0.0, 1.0);
}
`

/** Soft round sprite with a bright core — the base look for every glowing point. */
export const POINT_SPRITE = /* glsl */ `
// Returns coverage in [0,1] for the current gl_PointCoord.
// The squared falloff gives a tight core with a wide, faint halo, which is what
// additive blending needs to accumulate into believable glow rather than mush.
float pointSprite(vec2 coord, float softness) {
  float d = length(coord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, softness, d);
  float halo = pow(max(0.0, 1.0 - d), 2.5);
  return clamp(core + halo * 0.55, 0.0, 1.0);
}
`

/** ACES filmic tone mapping, for shaders that write final colour directly. */
export const ACES = /* glsl */ `
vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`

/** Everything, for shaders that want the lot. */
export const GLSL_LIB = `${SIMPLEX_3D}\n${FBM}\n${CURL_NOISE}\n${BLACKBODY}\n${HASH}\n${EASING}\n${POINT_SPRITE}`
