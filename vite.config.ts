import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error - plain .mjs dev plugin, no types needed
import { captureBridge } from './scripts/vite-plugin-capture.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), captureBridge()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Three + the R3F ecosystem is the bulk of the bundle; splitting it out
        // lets the HUD/loader shell paint before the WebGL runtime is parsed.
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
          motion: ['gsap', 'lenis'],
        },
      },
    },
  },
})
