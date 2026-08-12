import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { scrollState } from '../store/useUniverseStore'
import { chapterAt, CHAPTER_RANGES, localProgress } from '../config/chapters'
import { planetSegmentAt } from '../config/planets'

/**
 * Dev-only inspection, seeking and capture harness. Renders nothing.
 *
 * Two problems make a WebGL film awkward to review from outside the browser, and
 * this solves both:
 *
 *  1. **The window compositor.** Chrome's screenshot API captures the *window*, so
 *     an occluded or minimised window yields pure black no matter what the GPU drew.
 *     `capture()` instead reads pixels straight out of the drawing buffer.
 *
 *  2. **requestAnimationFrame stops in hidden tabs.** No rAF means R3F's loop never
 *     ticks: nothing animates, nothing renders, and per-frame hooks never run. So
 *     the bridge is published from an effect rather than from `useFrame`, and
 *     `advance()` drives the render loop by hand.
 *
 * Together these give `seek(progress)` — jump to any point in the film, step the
 * loop deterministically, and read back exactly what the GPU produced, regardless of
 * whether anyone is looking at the window.
 *
 * Stripped from production by the `import.meta.env.DEV` guard at the call site.
 */
export function DevBridge() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const advance = useThree((s) => s.advance)

  // Updated when frames run normally; harmless when they don't.
  const stats = useRef({ frame: 0 })
  useFrame(() => {
    stats.current.frame++
  })

  useEffect(() => {
    const bridge = {
      scrollState,
      gl,
      scene,
      camera,

      /** Camera + renderer summary. */
      info() {
        return {
          progress: +scrollState.progress.toFixed(5),
          chapter: chapterAt(scrollState.progress).chapter.id,
          local: +localProgress(chapterAt(scrollState.progress).chapter.id, scrollState.progress).toFixed(4),
          planet:
            chapterAt(scrollState.progress).chapter.id === 'planets'
              ? planetSegmentAt(localProgress('planets', scrollState.progress)).planet.id
              : null,
          camera: {
            pos: camera.position.toArray().map((n) => +n.toFixed(2)),
            fov: +((camera as { fov?: number }).fov ?? 0).toFixed(1),
          },
          buffer: [gl.domElement.width, gl.domElement.height],
          render: { ...gl.info.render },
          frames: stats.current.frame,
        }
      },

      /**
       * Steps the render loop by hand. Each call runs every useFrame hook and
       * renders once, so animation, camera easing and shader clocks all advance
       * exactly as they would with rAF running.
       */
      step(frames = 1, msPerFrame = 16.7) {
        const base = performance.now()
        for (let i = 0; i < frames; i++) advance(base + i * msPerFrame)
      },

      /**
       * Jumps to a normalised position in the film and settles there.
       *
       * The camera rig deliberately lags its target (it has mass), so a single
       * frame after a jump shows the camera still travelling. Stepping a few dozen
       * frames lets the easing arrive, which is what makes captures reproducible.
       */
      seek(progress: number, settleFrames = 90) {
        const max = document.documentElement.scrollHeight - window.innerHeight
        const top = Math.max(0, Math.min(1, progress)) * max
        window.scrollTo(0, top)
        ScrollTrigger.update()
        this.step(settleFrames)
        return this.info()
      },

      /** Jump to a chapter's midpoint by id. */
      seekChapter(id: string, settleFrames = 90) {
        const range = CHAPTER_RANGES.find((r) => r.chapter.id === id)
        if (!range) return { error: `unknown chapter "${id}"` }
        return this.seek((range.start + range.end) / 2, settleFrames)
      },

      /** Dumps every shader uniform in the scene, for diagnosing invisible geometry. */
      uniforms() {
        const out: Record<string, unknown> = {}
        let i = 0
        scene.traverse((obj) => {
          const mat = (obj as { material?: { uniforms?: Record<string, { value: unknown }> } })
            .material
          if (!mat?.uniforms) return
          const entry: Record<string, unknown> = {}
          for (const [key, uniform] of Object.entries(mat.uniforms)) {
            const v = uniform.value
            entry[key] =
              v && typeof v === 'object'
                ? (v as { isTexture?: boolean }).isTexture
                  ? 'Texture'
                  : ((v as { toArray?: () => number[] }).toArray?.() ?? '(object)')
                : v
          }
          out[`${i++}:${obj.type}`] = entry
        })
        return out
      },

      /**
       * Writes the current frame to disk via the dev server.
       * Requires preserveDrawingBuffer, which Stage enables in development.
       */
      async capture(name = 'frame') {
        const data = gl.domElement.toDataURL('image/png')
        const res = await fetch('/__capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, data }),
        })
        return res.json()
      },

      /** Seek, settle, and capture in one call — the workhorse for review. */
      async shot(name: string, progress: number, settleFrames = 90) {
        const info = this.seek(progress, settleFrames)
        const saved = await this.capture(name)
        return { ...info, file: saved.file }
      },
    }

    const w = window as unknown as Record<string, unknown>
    w.__genesis = bridge
    return () => {
      delete w.__genesis
    }
  }, [gl, scene, camera, advance])

  return null
}
