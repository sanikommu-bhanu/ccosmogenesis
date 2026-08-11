import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

/*
 * Deliberately not wrapped in <StrictMode>.
 *
 * StrictMode double-invokes effects in development. For a WebGL app that means the
 * renderer is created, torn down — which calls forceContextLoss() — and created
 * again. Anything holding a reference to the first context then operates on a dead
 * one; in practice EffectComposer.addPass() reads getContextAttributes(), gets null
 * from the lost context, and the whole R3F root fails to mount with the canvas left
 * at its default 300×150 drawing buffer.
 *
 * The checks StrictMode provides are aimed at concurrent-safe React state, which is
 * not where this app's complexity lives — the render loop is imperative and owns its
 * own lifecycle. Dropping it is the standard arrangement for react-three-fiber.
 */
createRoot(document.getElementById('root')!).render(<App />)
