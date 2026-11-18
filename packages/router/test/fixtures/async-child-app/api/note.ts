import type { EndpointHttpContext } from '@markless/router';
import { noteFromSource } from '../lib/notes.ts';

export default function note({ url }: EndpointHttpContext): Response {
	const id = url.searchParams.get('id');
	const tab = url.searchParams.get('tab');
	if (!id || id === 'undefined' || !tab || tab === 'undefined')
		return new Response(`no note for id ${id} tab ${tab}`, { status: 404 });
	return new Response(noteFromSource(id, tab), { headers: { 'cache-control': 'no-store' } });
}
