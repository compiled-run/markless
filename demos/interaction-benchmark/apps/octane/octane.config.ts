import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/vite-plugin';
import { vercel } from '@octanejs/adapter-vercel';
import { SETTINGS_DELAY_MS, SETTINGS_ENDPOINT, settingsServerResponse } from './src/shared/data.ts';

const ENTRY = ['App', '/src/App.tsrx'] as const;
const ALL_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

async function settingsHandler(context: { request: Request }): Promise<Response> {
	const started = Date.now();
	if (context.request.method !== 'POST') {
		return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
	}
	let body: unknown = {};
	try {
		body = JSON.parse(await context.request.text());
	} catch {
		body = {};
	}
	const result = settingsServerResponse(body);
	await new Promise((resolve) => setTimeout(resolve, Math.max(0, SETTINGS_DELAY_MS - (Date.now() - started))));
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	});
}

export default defineConfig({
	adapter: vercel({ serverless: { runtime: 'nodejs22.x', regions: ['iad1'] } }),
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ENTRY }),
			new RenderRoute({ path: '/records', entry: ENTRY }),
			new RenderRoute({ path: '/settings', entry: ENTRY }),
			new ServerRoute({ path: SETTINGS_ENDPOINT, methods: ALL_METHODS, handler: settingsHandler }),
		],
	},
});
