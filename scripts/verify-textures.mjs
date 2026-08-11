#!/usr/bin/env node
/**
 * Confirms every fetched texture is a decodable image at the resolution the
 * manifest asked for, by parsing the file headers directly.
 *
 * Worth having because two of these assets are non-obvious: Earth's normal and
 * specular maps are transcoded from TIFF by Wikimedia's thumbnailer, and Saturn's
 * ring strip is only useful if it kept its alpha channel — the transparency is
 * what encodes the Cassini Division and the C-ring gaps. A silently palettised or
 * flattened PNG would render the rings as an opaque disc.
 *
 * Run:  npm run verify:textures
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/config/textures.json'), 'utf8'))

const PNG_KINDS = { 0: 'grayscale', 2: 'RGB', 3: 'palette', 4: 'grayscale+alpha', 6: 'RGBA' }

/** Reads dimensions and colour format from PNG/JPEG headers without decoding. */
function probe(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return {
      format: 'PNG',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      depth: buffer[24],
      colour: PNG_KINDS[buffer[25]] ?? String(buffer[25]),
      hasAlpha: buffer[25] === 4 || buffer[25] === 6,
    }
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i++
        continue
      }
      const marker = buffer[i + 1]
      // SOFn frame headers carry the dimensions; skip DHT/DAC/RSTn.
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isFrame) {
        return {
          format: 'JPEG',
          height: buffer.readUInt16BE(i + 5),
          width: buffer.readUInt16BE(i + 7),
          colour: `${buffer[i + 9]} component`,
          hasAlpha: false,
        }
      }
      i += 2 + buffer.readUInt16BE(i + 2)
    }
  }

  return null
}

let failures = 0
const report = (ok, line) => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${line}`)
  if (!ok) failures++
}

console.log('\n  Texture integrity\n')

let totalBytes = 0

for (const asset of manifest.assets) {
  const path = join(ROOT, 'public', 'textures', asset.out)
  const label = asset.out.padEnd(24)

  if (!existsSync(path)) {
    report(false, `${label} missing - run 'npm run textures'`)
    continue
  }

  const buffer = readFileSync(path)
  totalBytes += buffer.length
  const info = probe(buffer)

  if (!info) {
    report(false, `${label} unrecognised image header`)
    continue
  }

  // Wikimedia returns the original when it is already narrower than requested,
  // so a texture may legitimately come back smaller — never larger.
  const tooLarge = info.width > asset.width + 1
  const suspiciouslySmall = info.width < asset.width / 4

  const detail = `${info.format} ${info.width}x${info.height} ${info.colour}`
  if (tooLarge) {
    report(false, `${label} ${detail} - wider than the requested ${asset.width}px`)
  } else if (suspiciouslySmall) {
    report(false, `${label} ${detail} - far below the requested ${asset.width}px`)
  } else {
    report(true, `${label} ${detail}`)
  }

  // The ring strip is the one asset whose alpha channel is load-bearing.
  if (asset.out.includes('ring-alpha')) {
    report(
      info.hasAlpha,
      `${'  └ ring transparency'.padEnd(24)} ${
        info.hasAlpha ? 'alpha channel present' : 'NO ALPHA - rings would render as a solid disc'
      }`,
    )
  }
}

console.log(`\n  ${manifest.assets.length} assets · ${(totalBytes / 1024 / 1024).toFixed(1)} MB\n`)

if (failures) {
  console.log(`  ${failures} check(s) failed\n`)
  process.exit(1)
}
console.log('  all textures valid\n')
