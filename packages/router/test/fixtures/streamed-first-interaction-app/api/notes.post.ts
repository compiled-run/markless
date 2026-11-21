import type { EndpointHttpContext } from '@markless/router';
import { addNote } from '../lib/notes.ts';

// A plain form post: 303 back to the page it came from.
export default async function postNote({ request }: EndpointHttpContext): Promise<Response> {
	const form = await request.formData();
	addNote(String(form.get('title') ?? ''));
	return new Response(null, { status: 303, headers: { location: request.headers.get('referer') ?? '/' } });
}
