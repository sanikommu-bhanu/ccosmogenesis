import type { QualityTier } from '../store/useUniverseStore'

/**
 * Picks a particle/DPR budget from what we can actually learn about the device.
 *
 * There is no reliable way to ask a browser how fast its GPU is, so this uses the
 * signals that correlate best in practice — screen size, core count, memory, and
 * the WebGL renderer string — and errs downward. `AdaptiveDpr` then corrects for
 * anything this gets wrong at runtime by watching real frame times.
 */
export function detectQuality(): QualityTier {
  if (typeof window === 'undefined') return 'medium'

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 900
  const cores = navigator.hardwareConcurrency ?? 4
  // Non-standard but widely supported; absent on Safari, hence the fallback.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low'
  if (coarse && narrow) return cores >= 8 && memory >= 6 ? 'medium' : 'low'
  if (cores <= 4 || memory <= 4) return 'medium'

  // A software rasteriser will happily render this at two frames per second.
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return 'low'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase()
      if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) return 'low'
    }
  } catch {
    // Probing is best-effort; a failure here says nothing about the real GPU.
  }

  return 'high'
}
