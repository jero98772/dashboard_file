import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { csvApiPlugin, csvSnapshotPlugin } from './server/api.js'

// VITE_STATIC=1 builds a server-less copy (GitHub Pages): the CSV tables are
// snapshotted into the bundle and edits only persist in localStorage.
const isStatic = process.env.VITE_STATIC === '1'

// https://vite.dev/config/
export default defineConfig({
  base: isStatic ? (process.env.VITE_BASE || '/dashboard_file/') : '/',
  // csvApiPlugin mounts GET/PUT /api/<table> on the dev server, so `npm run
  // dev` stays a single process with no proxy to configure.
  plugins: [react(), csvApiPlugin(), ...(isStatic ? [csvSnapshotPlugin()] : [])],
})
