import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * Error boundary around the WebGL stage.
 *
 * Without one, any throw inside the R3F tree unmounts the canvas and leaves a
 * silent black screen with the failure buried in the console — which is a
 * genuinely awful failure mode for a full-bleed visual site, and indistinguishable
 * from "the art direction is just very dark".
 *
 * In development it surfaces the error on screen so a bad edit is obvious
 * immediately. In production it degrades to a quiet, in-keeping message rather
 * than a blank void.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class SceneBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[genesis] scene crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children

    return (
      <div className="fixed inset-0 z-10 flex items-center justify-center bg-black p-8">
        <div className="max-w-xl">
          <p className="hud-label mb-3">Render halted</p>
          {import.meta.env.DEV ? (
            <>
              <p className="hud-value mb-4 text-[13px] leading-relaxed">{error.message}</p>
              <pre className="isolate-scroll max-h-64 overflow-auto text-[10px] leading-relaxed text-white/35">
                {error.stack}
              </pre>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="hud-label mt-5 border border-white/20 px-3 py-2 hover:border-white/50"
              >
                Retry
              </button>
            </>
          ) : (
            <p className="hud-value text-[13px] leading-relaxed">
              This experience needs WebGL 2 and a reasonably capable GPU. If your browser
              supports both, reloading usually clears it.
            </p>
          )}
        </div>
      </div>
    )
  }
}
