/**
 * The WebGL stage.
 *
 * Fixed to the viewport rather than pinned by ScrollTrigger — under smooth
 * scrolling, a pinned element and Lenis fight for transform ownership and produce
 * a frame of judder on every direction change. A fixed canvas over a tall scroll
 * spacer sidesteps the problem entirely, and the scroll position is read directly
 * instead of being translated into a pin offset.
 */

import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { CameraRig } from './CameraRig'
import { CosmicField } from './CosmicField'
import { Nebula } from './Nebula'
import { Post } from './Post'
import { Starfield } from './Starfield'
import { SolarSystem } from './SolarSystem'
import { FrameClock } from './FrameClock'
import { DevBridge } from './DevBridge'
import { BUDGET, useUniverseStore } from '../store/useUniverseStore'

export function Stage() {
  const quality = useUniverseStore((s) => s.quality)
  const budget = BUDGET[quality]

  /*
   * Force a measurement pass after mount, and again whenever the page becomes
   * visible.
   *
   * React Three Fiber will not create its renderer until a ResizeObserver reports a
   * non-zero container size, and ResizeObserver does not deliver in a tab that is
   * hidden or in an occluded window. A visitor who opens the site in a background
   * tab and switches to it later would otherwise find a dead 300x150 canvas — the
   * default size — with no error anywhere. Nudging the resize path fixes it without
   * affecting the normal case, where the observer has already fired by then.
   */
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'))
    const raf = requestAnimationFrame(nudge)
    document.addEventListener('visibilitychange', nudge)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', nudge)
    }
  }, [])

  const usePost =
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('post') !== '0'

  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        // `dpr` is capped here and then further managed by AdaptiveDpr at runtime.
        dpr={[1, budget.dpr]}
        gl={{
          antialias: false, // the composer's multisampling handles this
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
          // Lets the page read its own rendered pixels back via toDataURL, which is
          // how frames are captured for review without going through the window
          // compositor. Costs a little performance, so development only.
          preserveDrawingBuffer: import.meta.env.DEV,
        }}
        camera={{ fov: 40, near: 0.1, far: 4000, position: [0, 0, 9.4] }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 1)
          gl.outputColorSpace = SRGBColorSpace
          // Kept for reference: the composer overrides this to NoToneMapping in
          // Post.tsx, because the hand-written shaders bypass three's tone mapping.
          gl.toneMapping = ACESFilmicToneMapping
        }}
      >
        <FrameClock />
        <CameraRig />
        {import.meta.env.DEV && <DevBridge />}

        <Suspense fallback={null}>
          <Starfield />
          <Nebula />
          <CosmicField />
          <SolarSystem />
          <Preload all />
        </Suspense>

        {/* `?post=0` renders the raw scene with no composer — useful for judging
            how much of the look is grading versus geometry, and for isolating
            post-processing when debugging. */}
        {usePost && <Post />}
        <AdaptiveDpr pixelated={false} />
      </Canvas>
    </div>
  )
}
