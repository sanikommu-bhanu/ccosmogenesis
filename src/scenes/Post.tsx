/**
 * Post-processing, driven every frame by the travelling grade.
 *
 * Nothing here is a constant. Bloom breathes with the narrative moment, chromatic
 * aberration spikes with scroll velocity and settles on held shots, the vignette
 * closes down for the intimate moments and opens for the blast. A static bloom +
 * vignette pass is the most reliable tell of a WebGL demo, so every parameter is
 * either a function of scroll position or of how hard the viewer is scrolling.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
  wrapEffect,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import type {
  BloomEffect,
  ChromaticAberrationEffect,
  NoiseEffect,
  VignetteEffect,
} from 'postprocessing'
import { NoToneMapping, Vector2 } from 'three'
import { gradeKeyframes } from '../config/chapters'
import { createResolvedGrade, lerpGrade } from '../config/grade'
import { GradeEffect } from './GradeEffect'
import { scrollState, useUniverseStore } from '../store/useUniverseStore'
import { clamp } from '../lib/math'

/** Lifts the raw postprocessing Effect into something usable as JSX. */
const Grade = wrapEffect(GradeEffect)

export function Post() {
  const quality = useUniverseStore((s) => s.quality)
  const { gl } = useThree()

  const bloomRef = useRef<BloomEffect>(null)
  const chromaRef = useRef<ChromaticAberrationEffect>(null)
  const vignetteRef = useRef<VignetteEffect>(null)
  const noiseRef = useRef<NoiseEffect>(null)
  const gradeRef = useRef<GradeEffect>(null)

  const grade = useMemo(createResolvedGrade, [])
  const chromaOffset = useMemo(() => new Vector2(), [])

  // Tone mapping lives in the composer (see GradeEffect), so the renderer must not
  // apply its own — the frame would otherwise be tone mapped twice and lose every
  // highlight the bloom just produced.
  useEffect(() => {
    gl.toneMapping = NoToneMapping
  }, [gl])

  useFrame(() => {
    const p = scrollState.progress
    const { a, b, t } = gradeKeyframes(p)
    lerpGrade(grade, a, b, t)

    // Scroll velocity feeds the "camera under stress" effects. Held shots settle
    // to the chapter's baseline; fast scrubbing pushes them hard.
    const speed = clamp(scrollState.speed)

    gradeRef.current?.setGrade(grade.tint, grade.lift, grade.saturation, grade.exposure)

    if (bloomRef.current) {
      // Bloom pulses gently even when nothing is moving, so the light feels alive
      // rather than rendered once and held.
      const breathe = 1 + Math.sin(scrollState.time * 0.55) * 0.045
      bloomRef.current.intensity = grade.bloom * breathe
      bloomRef.current.luminanceMaterial.threshold = grade.bloomThreshold
      bloomRef.current.luminanceMaterial.smoothing = grade.bloomSmoothing
    }

    if (chromaRef.current) {
      // Aberration is a *reaction*: the chapter sets a floor, speed adds to it.
      const amount = (grade.chromatic + speed * 3.2) * 0.001
      chromaOffset.set(amount, amount * 0.7)
      chromaRef.current.offset = chromaOffset
      // Concentrate the fringing toward the frame edges, the way a real lens does,
      // instead of smearing it uniformly across the middle of the image.
      chromaRef.current.radialModulation = true
      chromaRef.current.modulationOffset = 0.35
    }

    if (vignetteRef.current) {
      // Opens up slightly under speed, like an iris reacting to a fast pan.
      vignetteRef.current.darkness = grade.vignette * (1 - speed * 0.3)
    }

    if (noiseRef.current) {
      noiseRef.current.blendMode.opacity.value = grade.grain
    }
  })

  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      {/*
        Order is a real grading chain: glow is generated first so the tone curve
        rolls it off, then the colourist pass, then the lens artefacts that would
        physically happen after the light has already been captured.
      */}
      <Bloom
        ref={bloomRef}
        mipmapBlur
        intensity={0.8}
        luminanceThreshold={0.4}
        luminanceSmoothing={0.7}
      />
      <Grade ref={gradeRef} />
      {/* radialModulation is set imperatively below — it is missing from this
          version's prop types even though the effect supports it. */}
      <ChromaticAberration ref={chromaRef} offset={chromaOffset} />
      <Vignette ref={vignetteRef} offset={0.28} darkness={0.5} />
      <Noise ref={noiseRef} premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.04} />
    </EffectComposer>
  )
}
