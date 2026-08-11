import { useFrame } from '@react-three/fiber'
import { scrollState } from '../store/useUniverseStore'

/**
 * Advances the shared clock exactly once per frame, before anything reads it.
 *
 * `scrollState.time` is used by the camera drift, the HUD and several shaders. If
 * each of them incremented it themselves the clock would run at N times real speed;
 * if they each called `performance.now()` they'd drift apart within a frame. One
 * writer at a guaranteed-first render priority solves both.
 */
export function FrameClock() {
  useFrame((_, delta) => {
    scrollState.time += Math.min(delta, 1 / 15)
  }, -1000)

  return null
}
