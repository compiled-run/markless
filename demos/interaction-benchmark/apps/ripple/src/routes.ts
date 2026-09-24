import { RenderRoute, ServerRoute } from '@ripple-ts/vite-plugin';
import { SETTINGS_ENDPOINT } from './shared/data.ts';
import { settingsHandler } from './server/settings.ts';

export const routes = [
	new RenderRoute({ path: '/', entry: '/src/pages/overview.tsrx' }),
	new RenderRoute({ path: '/records', entry: '/src/pages/records.tsrx' }),
	new RenderRoute({ path: '/settings', entry: '/src/pages/settings.tsrx' }),
	new ServerRoute({
		path: SETTINGS_ENDPOINT,
		methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		handler: settingsHandler,
	}),
];
