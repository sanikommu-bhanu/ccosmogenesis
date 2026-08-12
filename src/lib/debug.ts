/**
 * Debug gating.
 *
 * All engineering telemetry — the scroll probe, the window bridge, any frame
 * counters — is off by default, including in development. A normal `npm run dev`
 * session shows only the cinematic HUD and nothing that reads as an instrument
 * readout for the developer rather than for the film.
 *
 * Turn it on either by:
 *   - setting `VITE_DEBUG_HUD=true` in the environment, or
 *   - appending `?debug=1` to the URL (survives reloads via sessionStorage).
 *
 * Production builds strip it entirely: `import.meta.env.DEV` is statically false,
 * so the whole branch is dead code and the probe never reaches the bundle.
 */

const STORAGE_KEY = 'genesis:debug'

function readFlag(): boolean {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  const param = params.get('debug')

  if (param !== null) {
    const on = param !== '0' && param !== 'false'
    try {
      if (on) window.sessionStorage.setItem(STORAGE_KEY, '1')
      else window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private browsing can refuse sessionStorage; the URL param still works.
    }
    return on
  }

  if (import.meta.env.VITE_DEBUG_HUD === 'true') return true

  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** True only when debug tooling has been explicitly requested. */
export const DEBUG = readFlag()
