import { useEffect } from 'react'
import { useScrollTimeline, SCROLL_HEIGHT_VH } from './hooks/useScrollTimeline'
import { useUniverseStore } from './store/useUniverseStore'
import { detectQuality } from './lib/quality'
import { ScrollProbe } from './components/dev/ScrollProbe'

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
      {/*
        The scroll driver. It has no content — it exists purely to give the document
        a height, which is the film's timeline. Everything visible is position:fixed
        on top of it. This is more robust than ScrollTrigger's pin under smooth
        scrolling, which has to fight Lenis for transform ownership.
      */}
      <div aria-hidden style={{ height: `${SCROLL_HEIGHT_VH}vh` }} />

      <ScrollProbe />
    </>
  )
}
