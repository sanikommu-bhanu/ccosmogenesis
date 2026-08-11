import { useFrame, useThree } from '@react-three/fiber'
import { scrollState } from '../store/useUniverseStore'

/**
 * Dev-only inspection hook.
 *
 * Exposes the live renderer, scene and scroll state on `window.__genesis` so the
 * running film can be interrogated from the console — draw calls, camera position,
 * what a given uniform actually resolved to at this scroll position. Stripped from
 * production builds by the `import.meta.env.DEV` guard at the call site.
 */
export function DevBridge() {
  const { gl, scene, camera } = useThree()

  useFrame(() => {
    const w = window as unknown as Record<string, unknown>
    w.__genesis = {
      scrollState,
      camera: {
        pos: camera.position.toArray().map((n) => +n.toFixed(2)),
        fov: (camera as { fov?: number }).fov,
      },
      render: { ...gl.info.render },
      memory: { ...gl.info.memory },
      sceneChildren: scene.children.map((c) => `${c.type}:${c.name || '·'}`),
    }
  })

  return null
}
