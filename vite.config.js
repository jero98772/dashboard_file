import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { csvApiPlugin } from './server/api.js'

// https://vite.dev/config/
export default defineConfig({
  // csvApiPlugin mounts GET/PUT /api/<table> on the dev server, so `npm run
  // dev` stays a single process with no proxy to configure.
  plugins: [react(), csvApiPlugin()],
})
