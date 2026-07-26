import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const base = process.env.NODE_ENV === 'production' ? '/finance-tracker/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
