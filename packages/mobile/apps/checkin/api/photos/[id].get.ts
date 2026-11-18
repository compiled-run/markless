import type { EndpointHttpContext } from '@markless/router';
import { photo } from '../../server/photos.ts';

export default function show({ params }: EndpointHttpContext<{ id: string }>) {
	const found = photo(params.id);
	return found
		? new Response(found.bytes, { headers: { 'content-type': found.type } })
		: new Response('No such photo.', { status: 404 });
}
