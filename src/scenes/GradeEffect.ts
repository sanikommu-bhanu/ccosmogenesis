/**
 * The colourist pass.
 *
 * Everything in this project writes linear light — including the hand-written
 * particle shaders, which bypass three's built-in tone mapping because they set
 * `gl_FragColor` directly. So tone mapping happens here in post instead of on the
 * renderer, which has the useful side effect of grading the entire frame through
 * one path: particles, planets, HUD-adjacent glow, all identical.
 *
 * Order inside this shader matters and mirrors a real grading chain:
 *   exposure → lift/gain → saturation → ACES filmic → highlight tint
 */

import { Effect } from 'postprocessing'
import { Color, Uniform } from 'three'

const FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uSaturation;
uniform float uExposure;

// ACES filmic, Stephen Hill's fit of the full ACES ODT. This is the baseline the
// whole film is graded against — the flat default tone curve is what makes most
// WebGL scenes read as "renders" rather than footage.
vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;

  // 1. Exposure, in linear light where it belongs.
  c *= uExposure;

  // 2. Lift the shadows toward the chapter's shadow colour. Weighting by
  //    (1 - c) confines it to the dark end so highlights stay clean.
  c += uLift * (1.0 - clamp(c, 0.0, 1.0));

  // 3. Saturation around Rec.709 luma.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);

  // 4. Tone map.
  c = acesFilm(c);

  // 5. Tint the highlights only, so the chapter's colour rides on the bright end
  //    without staining the blacks — the difference between a grade and a filter.
  float highlight = smoothstep(0.35, 1.0, luma);
  c = mix(c, c * uTint, highlight * 0.85);

  outputColor = vec4(c, inputColor.a);
}
`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', FRAGMENT, {
      uniforms: new Map<string, Uniform>([
        ['uTint', new Uniform(new Color(1, 1, 1))],
        ['uLift', new Uniform(new Color(0, 0, 0))],
        ['uSaturation', new Uniform(1)],
        ['uExposure', new Uniform(1)],
      ]),
    })
  }

  setGrade(tint: Color, lift: Color, saturation: number, exposure: number) {
    const u = this.uniforms
    ;(u.get('uTint')!.value as Color).copy(tint)
    ;(u.get('uLift')!.value as Color).copy(lift)
    u.get('uSaturation')!.value = saturation
    u.get('uExposure')!.value = exposure
  }
}
