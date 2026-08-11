/**
 * The WebGL stage.
 *
 * Fixed to the viewport rather than pinned by ScrollTrigger — under smooth
 * scrolling, a pinned element and Lenis fight for transform ownership and produce
 * a frame of judder on every direction change. A fixed canvas over a tall scroll
 * spacer sidesteps the problem entirely, and the scroll position is read directly
 * instead of being translated into a pin offset.
 */

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { CameraRig } from './CameraRig'
import { CosmicField } from './CosmicField'
import { Nebula } from './Nebula'
import { Post } from './Post'
import { Starfield } from './Starfield'
import { FrameClock } from './FrameClock'
import { BUDGET, useUniverseStore } from '../store/useUniverseStore'

export function Stage() {
  const quality = useUniverseStore((s) => s.quality)
  const budget = BUDGET[quality]

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

        <Suspense fallback={null}>
          <Starfield />
          <Nebula />
          <CosmicField />
          <Preload all />
        </Suspense>

        <Post />
        <AdaptiveDpr pixelated={false} />
      </Canvas>
    </div>
  )
}
