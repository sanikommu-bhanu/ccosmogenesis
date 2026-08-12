import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Dev-only frame capture.
 *
 * Chrome's DevTools screenshot API composites the *window*, so when the browser
 * window is occluded or minimised it returns pure black regardless of what the page
 * is actually drawing — `document.visibilityState` goes to "hidden" and there is no
 * frame to composite. That makes visual review impossible in a headless-ish setup.
 *
 * This sidesteps the compositor completely: the page reads its own pixels out of the
 * WebGL drawing buffer with `canvas.toDataURL()` and POSTs them here, where they are
 * written to disk as PNGs. What lands on disk is exactly what the GPU rendered.
 *
 * Requires `preserveDrawingBuffer: true` on the renderer, which Stage.tsx enables in
 * development only (it costs a little performance and is useless in production).
 *
 * Output goes to $GENESIS_SHOT_DIR, or <tmp>/genesis-shots by default — never into
 * the project tree.
 */
export function captureBridge() {
  const outDir = process.env.GENESIS_SHOT_DIR || join(tmpdir(), 'genesis-shots')

  return {
    name: 'genesis-capture-bridge',
    apply: 'serve',
    configureServer(server) {
      mkdirSync(outDir, { recursive: true })
      server.config.logger.info(`  capture bridge -> ${outDir}`)

      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const base64 = String(data).replace(/^data:image\/\w+;base64,/, '')
            // Keep filenames tame — this path is written to disk.
            const safe = String(name || 'frame').replace(/[^a-z0-9_.-]/gi, '_')
            const file = join(outDir, `${safe}.png`)
            writeFileSync(file, Buffer.from(base64, 'base64'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, file }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}
