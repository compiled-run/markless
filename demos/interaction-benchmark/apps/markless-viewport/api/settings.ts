import type { EndpointHttpContext } from '@markless/router';
import { SETTINGS_DELAY_MS, settingsServerResponse } from '../src/shared/data.ts';

export default async function settings({ request }: EndpointHttpContext): Promise<Response> {
	const started = Date.now();
	if (request.method !== 'POST') {
		return new Response(null, { status: 405, headers: { allow: 'POST' } });
	}
	let body: unknown = {};
	try {
		body = JSON.parse(await request.text());
	} catch {}
	const result = settingsServerResponse(body);
	const remaining = SETTINGS_DELAY_MS - (Date.now() - started);
	if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	});
}
