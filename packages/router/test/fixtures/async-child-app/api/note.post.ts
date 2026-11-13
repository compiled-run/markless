import type { EndpointHttpContext } from '@markless/router';
import { saveOnSource } from '../lib/notes.ts';

export default function save({ url }: EndpointHttpContext): Response {
	const id = url.searchParams.get('id');
	if (!id || id === 'undefined') return new Response(`no note ${id}`, { status: 404 });
	saveOnSource(id);
	return new Response(null, { status: 204 });
}
