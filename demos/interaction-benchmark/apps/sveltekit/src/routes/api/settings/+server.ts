import { SETTINGS_DELAY_MS, settingsServerResponse } from '$lib/shared/data';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const started = Date.now();
	let body: unknown = {};
	try {
		body = JSON.parse(await request.text());
	} catch {
		body = {};
	}
	const result = settingsServerResponse(body);
	const remaining = SETTINGS_DELAY_MS - (Date.now() - started);
	if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
