import { get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  overview: '/',
  records: '/records',
  settings: '/settings',
  settingsApi: '/api/settings',
})
