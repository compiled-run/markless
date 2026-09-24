import { createController } from 'remix/router'

import { assets } from '../assets.ts'
import { routes } from '../routes.ts'
import { SETTINGS_DELAY_MS, settingsServerResponse } from '../shared/data.ts'
import { OverviewPage, RecordsPage, SettingsPage } from './pages.tsx'

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
    },
    overview(context) {
      return context.render(<OverviewPage />)
    },
    records(context) {
      return context.render(<RecordsPage />)
    },
    settings(context) {
      return context.render(<SettingsPage />)
    },
    async settingsApi(context) {
      if (context.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
      }
      let started = performance.now()
      let body: unknown
      try {
        body = JSON.parse(await context.request.text())
      } catch {
        body = {}
      }
      let result = settingsServerResponse(body)
      let remaining = SETTINGS_DELAY_MS - (performance.now() - started)
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
      return Response.json(result.body, {
        status: result.status,
        headers: { 'cache-control': 'no-store' },
      })
    },
  },
})
