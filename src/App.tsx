import { useEffect } from 'react'
import { useScrollTimeline, SCROLL_HEIGHT_VH } from './hooks/useScrollTimeline'
import { useUniverseStore } from './store/useUniverseStore'
import { detectQuality } from './lib/quality'
import { Stage } from './scenes/Stage'
import { SceneBoundary } from './components/SceneBoundary'
import { ScrollProbe } from './components/dev/ScrollProbe'
import { DEBUG } from './lib/debug'

export default function App() {
  const setQuality = useUniverseStore((s) => s.setQuality)
  const setReducedMotion = useUniverseStore((s) => s.setReducedMotion)

  useEffect(() => {
    setQuality(detectQuality())
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [setQuality, setReducedMotion])

  useScrollTimeline(true)

  return (
    <>
      <SceneBoundary>
        <Stage />
      </SceneBoundary>

      {/*
        The scroll driver. It has no content — it exists purely to give the document
        a height, which is the film's timeline. Everything visible is fixed on top
        of it.
      */}
      <div aria-hidden style={{ height: `${SCROLL_HEIGHT_VH}vh` }} />

      {/* Engineering telemetry only — off unless explicitly requested via
          ?debug=1 or VITE_DEBUG_HUD. Never part of the shipped experience. */}
      {DEBUG && <ScrollProbe />}
    </>
  )
}
