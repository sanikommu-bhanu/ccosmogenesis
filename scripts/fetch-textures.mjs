#!/usr/bin/env node
/**
 * Pulls every bitmap listed in src/config/textures.json into public/textures/.
 *
 * Sourcing strategy, and why it is shaped like this:
 *
 *  1. Ask the Commons **API** to resolve each file at the width we want. The API
 *     returns a canonical `thumburl` on upload.wikimedia.org. Requesting arbitrary
 *     widths through Special:FilePath instead makes Wikimedia generate thumbnails
 *     on demand, which trips their robot policy and gets you 429'd after a handful
 *     of files. Going through the API hits their thumbnail cache instead.
 *
 *  2. Download from upload.wikimedia.org, sequentially, with a polite delay.
 *
 *  3. The API also transcodes the TIFF-only Earth normal/specular maps to JPEG,
 *     which is the only reason those maps are usable in a browser at all.
 *
 * Already-downloaded files are skipped, so this is safe to re-run after a partial
 * failure. Pass --force to re-fetch everything.
 *
 * Usage:  node scripts/fetch-textures.mjs [--force]
 */

import { createWriteStream } from 'node:fs'
import { mkdir, stat, unlink, readFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'textures')
const MANIFEST = join(ROOT, 'src', 'config', 'textures.json')
const API = 'https://commons.wikimedia.org/w/api.php'

// Wikimedia policy requires a descriptive User-Agent; anonymous requests get 403.
// Must be pure ASCII: HTTP header values are ByteStrings, so a stray em-dash
// throws before the request is ever sent.
const USER_AGENT =
  'GenesisTextureFetch/1.0 (offline WebGL educational project; one-time asset fetch)'

const FORCE = process.argv.includes('--force')
/** Delay between CDN downloads. Wikimedia starts refusing well below 1/s bursts. */
const DELAY_MS = 1500
const MAX_RETRIES = 5

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`

const headers = { 'User-Agent': USER_AGENT }

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

/**
 * Resolves `File:` titles to CDN thumbnail URLs at a given width, 50 at a time.
 * Returns a Map keyed by the normalised title (spaces, not underscores).
 */
async function resolveThumbs(files, width) {
  const out = new Map()

  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50)
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: String(width),
      titles: batch.map((f) => `File:${f}`).join('|'),
    })

    const res = await fetch(`${API}?${params}`, { headers })
    if (!res.ok) throw new Error(`API HTTP ${res.status} while resolving width ${width}`)
    const json = await res.json()

    for (const page of json.query?.pages ?? []) {
      if (page.missing) continue
      const info = page.imageinfo?.[0]
      if (!info) continue
      const title = String(page.title).replace(/^File:/, '')

      // Prefer the original whenever it is already at or below the width we want.
      // Asking for a thumbnail the same size as the source produces a URL nobody
      // has ever requested, so Wikimedia has to render it on demand and refuses
      // under its robot policy — while the original is permanently cached.
      // The exception is TIFF, which must go through the thumbnailer regardless
      // because browsers cannot decode it.
      const isTiff = /\.tiff?$/i.test(title)
      const useOriginal = !isTiff && typeof info.width === 'number' && info.width <= width

      out.set(title, useOriginal ? info.url : info.thumburl || info.url)
    }

    await sleep(400)
  }

  return out
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { ...headers, Accept: 'image/*' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  if (!res.body) throw new Error('empty response body')

  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`unexpected content-type "${type}"`)

  await mkdir(dirname(dest), { recursive: true })
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  } catch (err) {
    // Never leave a half-written file behind — it would be skipped on the next run.
    await unlink(dest).catch(() => {})
    throw err
  }
  return (await stat(dest)).size
}

/**
 * Downscales a texture in place if it is wider than the manifest asks for.
 *
 * This step exists because Wikimedia does not honour arbitrary thumbnail widths:
 * the API reports `thumbwidth: 2048` but hands back a URL for the nearest cached
 * bucket, which is 3840px for these files. Requesting the exact width on demand is
 * what trips their robot policy. So we take whatever they cache and resize here,
 * which is deterministic, costs them nothing, and actually delivers the resolution
 * budget the project committed to.
 *
 * Returns the number of bytes saved, or 0 if the file was already small enough.
 */
async function fitToBudget(dest, targetWidth) {
  const before = (await stat(dest)).size
  const image = sharp(dest, { limitInputPixels: 512 * 1024 * 1024 })
  const meta = await image.metadata()

  if (!meta.width || meta.width <= targetWidth) return 0

  const isPng = dest.toLowerCase().endsWith('.png')
  const temp = `${dest}.resizing`

  let pipelineOut = sharp(dest, { limitInputPixels: 512 * 1024 * 1024 }).resize({
    width: targetWidth,
    // Equirectangular maps must keep their 2:1 ratio exactly or the poles shear.
    fit: 'fill',
    height: Math.round((targetWidth * meta.height) / meta.width),
    kernel: 'lanczos3',
  })

  pipelineOut = isPng
    ? // Saturn's rings need their alpha channel preserved; never flatten to JPEG.
      pipelineOut.png({ compressionLevel: 9, palette: false })
    : pipelineOut.jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })

  await pipelineOut.toFile(temp)
  await rename(temp, dest)

  return before - (await stat(dest)).size
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const assets = manifest.assets

  console.log(`\n  GENESIS - texture fetch`)
  console.log(`  ${assets.length} assets -> public/textures/${FORCE ? '  (--force)' : ''}\n`)

  // Work out what's actually missing before touching the network at all.
  const pending = []
  let skipped = 0
  let total = 0

  for (const asset of assets) {
    const dest = join(OUT_DIR, asset.out)
    if (!FORCE && (await exists(dest))) {
      total += (await stat(dest)).size
      skipped++
    } else {
      pending.push(asset)
    }
  }

  if (skipped) console.log(`  ${skipped} already present, skipping downloads`)

  // Resolve CDN URLs, grouped by requested width (one API round-trip per group).
  const byWidth = new Map()
  for (const asset of pending) {
    if (!byWidth.has(asset.width)) byWidth.set(asset.width, [])
    byWidth.get(asset.width).push(asset.file)
  }

  const urls = new Map()
  for (const [width, files] of byWidth) {
    process.stdout.write(`  resolving ${files.length} file(s) at ${width}px ... `)
    try {
      const resolved = await resolveThumbs(files, width)
      for (const [title, url] of resolved) urls.set(`${title}@${width}`, url)
      console.log(`${resolved.size} ok`)
    } catch (err) {
      console.log(`failed: ${err.message}`)
    }
  }

  let downloaded = 0
  const failures = []

  for (const [i, asset] of pending.entries()) {
    const dest = join(OUT_DIR, asset.out)
    const tag = `[${String(i + 1).padStart(2, '0')}/${pending.length}]`
    const url = urls.get(`${asset.file}@${asset.width}`)

    if (!url) {
      failures.push({ out: asset.out, error: 'could not resolve a CDN URL' })
      console.log(`  ${tag} ${asset.out.padEnd(24)} UNRESOLVED`)
      continue
    }

    let lastErr = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const size = await download(url, dest)
        total += size
        downloaded++
        console.log(`  ${tag} ${asset.out.padEnd(24)} ok       ${bytes(size).padStart(8)}`)
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        if (attempt < MAX_RETRIES) {
          // 429s clear on a timescale of seconds; back off generously.
          const wait = 4000 * attempt
          console.log(`  ${tag} ${asset.out.padEnd(24)} retry ${attempt}  ${err.message.slice(0, 60)}`)
          await sleep(wait)
        }
      }
    }

    if (lastErr) {
      failures.push({ out: asset.out, error: lastErr.message })
      console.log(`  ${tag} ${asset.out.padEnd(24)} FAILED`)
    }

    await sleep(DELAY_MS)
  }

  // --- Fit every asset to its budgeted resolution ---
  // Runs over pre-existing files too, so a library fetched before this step was
  // added self-corrects on the next run rather than staying oversized forever.
  console.log()
  let saved = 0
  let resized = 0
  for (const asset of assets) {
    const dest = join(OUT_DIR, asset.out)
    if (!(await exists(dest))) continue
    try {
      const delta = await fitToBudget(dest, asset.width)
      if (delta > 0) {
        resized++
        saved += delta
        console.log(`  resize  ${asset.out.padEnd(24)} -> ${asset.width}px  (-${bytes(delta)})`)
      }
    } catch (err) {
      console.log(`  resize  ${asset.out.padEnd(24)} FAILED  ${err.message.slice(0, 60)}`)
    }
  }

  // Recompute from disk: the running tally was taken before resizing.
  total = 0
  for (const asset of assets) {
    const dest = join(OUT_DIR, asset.out)
    if (await exists(dest)) total += (await stat(dest)).size
  }

  console.log(
    `\n  ${downloaded} downloaded, ${skipped} already present, ${resized} resized` +
      `${saved > 0 ? ` (-${bytes(saved)})` : ''}, ${failures.length} failed - ${bytes(total)} on disk\n`,
  )

  if (failures.length) {
    console.log('  Failed. Re-run to retry just these (finished files are skipped):')
    for (const f of failures) console.log(`    ${f.out}  -  ${f.error.slice(0, 90)}`)
    console.log()
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\n  fatal: ${err.message}\n`)
  process.exit(1)
})
