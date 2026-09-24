import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import 'remix/node-tsx'

// Loaded by cwd path so the Vercel tracer ships app sources verbatim for node-tsx instead of transpiling them.
const { router } = await import(pathToFileURL(join(process.cwd(), 'app/router.ts')).href)

export default {
  async fetch(request) {
    try {
      return await router.fetch(request)
    } catch (error) {
      console.error(error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
}
