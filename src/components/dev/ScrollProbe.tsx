/**
 * Development instrument for the scroll timeline.
 *
 * This is the M1 proof: it shows that global progress, per-chapter local progress,
 * velocity and the planet sub-segments are all derived purely from scroll position,
 * update at frame rate without re-rendering React, and read identically scrubbing
 * backwards. Toggle with `~`. Not rendered in production builds.
 */

import { useEffect, useRef, useState } from 'react'
import { CHAPTER_RANGES, chapterAt, localProgress } from '../../config/chapters'
import { PLANET_SEGMENTS, planetSegmentAt } from '../../config/planets'
import { scrollState } from '../../store/useUniverseStore'
import { scrollToProgress } from '../../hooks/useScrollTimeline'

export function ScrollProbe() {
  const [open, setOpen] = useState(true)
  const rowsRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = scrollState.progress
      const { chapter } = chapterAt(p)

      if (readoutRef.current) {
        const inPlanets = chapter.id === 'planets'
        const seg = inPlanets ? planetSegmentAt(localProgress('planets', p)) : null
        readoutRef.current.textContent = [
          `GLOBAL   ${p.toFixed(5)}`,
          `VELOCITY ${scrollState.velocity >= 0 ? '+' : ''}${scrollState.velocity.toFixed(4)}/s`,
          `SPEED    ${scrollState.speed.toFixed(3)}`,
          `CHAPTER  ${String(chapter.index).padStart(2, '0')}  ${chapter.id}`,
          `LOCAL    ${localProgress(chapter.id, p).toFixed(4)}`,
          seg ? `PLANET   ${seg.planet.name.toUpperCase()}` : `PLANET   —`,
        ].join('\n')
      }

      if (rowsRef.current) {
        const bars = rowsRef.current.children
        for (let i = 0; i < bars.length; i++) {
          const range = CHAPTER_RANGES[i]
          const local = localProgress(range.chapter.id, p)
          const fill = bars[i].querySelector<HTMLElement>('[data-fill]')
          if (fill) fill.style.transform = `scaleX(${local})`
          ;(bars[i] as HTMLElement).style.opacity = local > 0 && local < 1 ? '1' : '0.35'
        }
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open])

  if (!open) {
    return (
      <div className="fixed bottom-3 left-3 z-50 hud-label opacity-40 select-none">
        ` — probe
      </div>
    )
  }

  return (
    <div className="fixed top-3 left-3 z-50 w-[300px] select-none bg-black/70 p-3 backdrop-blur-sm">
      <div className="hud-label mb-2">Scroll probe · ` to hide</div>

      <div
        ref={readoutRef}
        className="hud-value mb-3 whitespace-pre leading-[1.7] tabular-nums"
      />

      <div ref={rowsRef} className="flex flex-col gap-[3px]">
        {CHAPTER_RANGES.map(({ chapter }) => (
          <div
            key={chapter.id}
            className="flex cursor-pointer items-center gap-2 transition-opacity"
            onClick={() => {
              const r = CHAPTER_RANGES[chapter.index]
              scrollToProgress((r.start + r.end) / 2)
            }}
          >
            <span className="hud-label w-[15px] shrink-0 tabular-nums">
              {String(chapter.index).padStart(2, '0')}
            </span>
            <span className="hud-label w-[74px] shrink-0 truncate normal-case tracking-normal">
              {chapter.id}
            </span>
            <span className="relative h-[3px] flex-1 bg-white/10">
              <span
                data-fill
                className="absolute inset-0 origin-left bg-[var(--color-accent)]"
                style={{ transform: 'scaleX(0)' }}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="hud-label mt-3 mb-1">planet beats</div>
      <div className="flex gap-[2px]">
        {PLANET_SEGMENTS.map((seg) => (
          <button
            key={seg.planet.id}
            title={seg.planet.name}
            onClick={() => {
              const c = CHAPTER_RANGES[7]
              const mid = (seg.start + seg.end) / 2
              scrollToProgress(c.start + mid * (c.end - c.start))
            }}
            className="h-[14px] flex-1 bg-white/10 hover:bg-white/40"
            style={{ flexGrow: seg.end - seg.start }}
          />
        ))}
      </div>
    </div>
  )
}
