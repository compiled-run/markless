import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'

process.env.NODE_ENV ??= 'production'
const { default: handler } = await import('../api/index.mjs')
const port = Number(process.env.PORT ?? 4451)
http.createServer(createRequestListener((request) => handler.fetch(request))).listen(port, () => {
  console.log(`Vercel handler listening on http://localhost:${port}`)
})
