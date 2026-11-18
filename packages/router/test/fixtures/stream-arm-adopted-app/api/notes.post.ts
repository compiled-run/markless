import type { EndpointHttpContext } from '@markless/router';
import { notes } from '../lib/notes.ts';

export default async function postNote({ request }: EndpointHttpContext): Promise<Response> {
	const form = await request.formData();
	notes.push(String(form.get('title') ?? ''));
	await new Promise((done) => setTimeout(done, 200));
	return new Response(null, {
		status: 303,
		headers: { location: request.headers.get('referer') ?? '/' },
	});
}
